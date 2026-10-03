import { randomUUID } from 'node:crypto';
import {
  BALANCE, phaseDurations, problemForRound, toPublicProblem,
  type Language, type MatchSnapshot, type Phase, type PlayerView,
  type PowerupType, type Problem, type Role, type RoundScore,
} from '@heist/shared';
import type { execute } from '../exec/runner.js';
import type { judgeStyle } from '../judge/gemini.js';
import {
  hasActiveEffect, pruneEffects, resetRound, type EffectPlayer,
} from './effects.js';

export type EngineDeps = {
  now: () => number;
  emit: (playerId: string, ev: string, payload: unknown) => void;
  execute: typeof execute;
  judgeStyle: typeof judgeStyle;
  fast: boolean;
};

export type ServerPlayer = EffectPlayer & {
  id: string;
  nickname: string;
  role: Role;
  position: number;
  connected: boolean;
  disconnectedAt: number | null;
  buffer: { code: string; language: Language };
  submission: { code: string; language: Language; at: number } | null;
  progress: number | null;
  lastScore: RoundScore | null;
  offer: PowerupType[] | null;
  lastRunAt: number;
};

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export class MatchEngine {
  phase: Phase = 'LOBBY';
  deadlineAt: number | null = null;
  round = 0;
  players: ServerPlayer[] = [];
  winner?: { role: Role; reason: 'CAUGHT' | 'ESCAPED' | 'EVADED' };

  private problem: Problem | null = null;

  constructor(
    readonly roomCode: string,
    private readonly deps: EngineDeps,
  ) {}

  // ---------------------------------------------------------------- players

  addPlayer(nickname: string): Result<{ playerId: string }> {
    if (this.players.length >= 2) return { ok: false, error: 'MATCH_FULL' };

    const player: ServerPlayer = {
      id: randomUUID(),
      nickname,
      role: 'COP',
      position: BALANCE.COP_START,
      connected: true,
      disconnectedAt: null,
      buffer: { code: '', language: 'python' },
      submission: null,
      progress: null,
      lastScore: null,
      offer: null,
      lastRunAt: 0,
      inventory: [],
      shielded: false,
      activeEffects: [],
      pendingModifiers: [],
      hostileUsedThisRound: 0,
    };
    this.players.push(player);

    if (this.players.length === 2) this.assignRoles();
    this.pushSnapshots();
    return { ok: true, data: { playerId: player.id } };
  }

  private assignRoles(): void {
    const copFirst = Math.random() < 0.5;
    const [first, second] = this.players as [ServerPlayer, ServerPlayer];
    const cop = copFirst ? first : second;
    const robber = copFirst ? second : first;
    cop.role = 'COP';
    cop.position = BALANCE.COP_START;
    robber.role = 'ROBBER';
    robber.position = BALANCE.ROBBER_START;
    this.goto('ROLE_REVEAL');
  }

  setConnected(playerId: string, connected: boolean): void {
    const player = this.find(playerId);
    if (!player) return;
    player.connected = connected;
    player.disconnectedAt = connected ? null : this.deps.now();

    const other = this.players.find((p) => p.id !== playerId);
    if (other) {
      if (connected) this.deps.emit(other.id, 'opponent_reconnected', {});
      else {
        this.deps.emit(other.id, 'opponent_disconnected', {
          graceUntil: this.deps.now() + BALANCE.RECONNECT_GRACE_MS,
        });
      }
    }
    this.pushSnapshots();
  }

  /** True once both players have been gone longer than the destroy window. */
  isEmpty(now: number): boolean {
    if (this.players.length === 0) return true;
    return this.players.every(
      (p) => !p.connected && p.disconnectedAt !== null && now - p.disconnectedAt > BALANCE.MATCH_DESTROY_MS,
    );
  }

  // ------------------------------------------------------------- submitting

  syncCode(playerId: string, code: string, language: Language): void {
    if (this.phase !== 'CODING') return;
    const player = this.find(playerId);
    if (!player) return;
    player.buffer = { code, language };
  }

  submit(playerId: string, code: string, language: Language): Result<{ ok: true }> {
    if (this.phase !== 'CODING') return { ok: false, error: 'WRONG_PHASE' };
    const player = this.find(playerId);
    if (!player) return { ok: false, error: 'NO_SUCH_PLAYER' };
    if (player.submission) return { ok: false, error: 'ALREADY_SUBMITTED' };

    player.submission = { code, language, at: this.deps.now() };
    player.buffer = { code, language };
    this.pushSnapshots();

    if (this.players.every((p) => p.submission)) this.goto('JUDGING');
    return { ok: true, data: { ok: true } };
  }

  // ----------------------------------------------------------------- clock

  async tick(now: number): Promise<void> {
    if (this.deadlineAt === null || now < this.deadlineAt) return;

    switch (this.phase) {
      case 'ROLE_REVEAL':
        this.startRound(1);
        return;
      case 'ROUND_INTRO':
        this.goto('CODING');
        return;
      case 'CODING':
        this.autoSubmit();
        this.goto('JUDGING');
        return;
      default:
        // Task 10 handles JUDGING onward.
        return;
    }
  }

  private autoSubmit(): void {
    const at = this.deps.now();
    for (const player of this.players) {
      if (!player.submission) {
        player.submission = { code: player.buffer.code, language: player.buffer.language, at };
      }
    }
  }

  private startRound(round: number): void {
    this.round = round;
    this.problem = problemForRound(round);
    for (const player of this.players) {
      player.submission = null;
      player.progress = null;
      player.lastScore = null;
      player.offer = null;
      resetRound(player);
    }
    this.goto('ROUND_INTRO');
  }

  protected goto(phase: Phase): void {
    const durations = phaseDurations(this.deps.fast);
    const ms = (durations as Record<string, number | undefined>)[phase];
    const from = this.phase;
    this.phase = phase;
    this.deadlineAt = ms === undefined ? null : this.deps.now() + ms;
    // eslint-disable-next-line no-console
    console.log(`[match ${this.roomCode}] ${from} -> ${phase} round=${this.round}`);
    this.pushSnapshots();
  }

  // -------------------------------------------------------------- snapshots

  protected pushSnapshots(): void {
    for (const player of this.players) {
      this.deps.emit(player.id, 'snapshot', this.snapshotFor(player.id));
    }
  }

  snapshotFor(viewerId: string): MatchSnapshot {
    const now = this.deps.now();
    return {
      roomCode: this.roomCode,
      phase: this.phase,
      deadlineAt: this.deadlineAt,
      round: this.round,
      problem: this.problem ? toPublicProblem(this.problem) : null,
      players: this.players.map((p) => this.viewOf(p, viewerId, now)),
      ...(this.winner ? { winner: this.winner } : {}),
    };
  }

  private viewOf(player: ServerPlayer, viewerId: string, now: number): PlayerView {
    pruneEffects(player, now);
    const concealed = player.id !== viewerId && hasActiveEffect(player, 'SMOKE_BOMB', now);
    return {
      id: player.id,
      nickname: player.nickname,
      role: player.role,
      position: player.position,
      inventory: player.id === viewerId ? [...player.inventory] : [],
      shielded: player.shielded,
      activeEffects: [...player.activeEffects],
      submitted: player.submission !== null,
      connected: player.connected,
      progress: concealed ? null : player.progress,
    };
  }

  protected find(playerId: string): ServerPlayer | undefined {
    return this.players.find((p) => p.id === playerId);
  }

  protected get currentProblem(): Problem | null {
    return this.problem;
  }
}
