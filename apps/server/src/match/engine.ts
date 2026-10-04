import { randomUUID } from 'node:crypto';
import {
  BALANCE, phaseDurations, problemForRound, toPublicProblem,
  type Language, type MatchSnapshot, type Phase, type PlayerView,
  type PowerupType, type Problem, type Role, type RoundScore,
} from '@heist/shared';
import type { execute } from '../exec/runner.js';
import type { judgeStyle } from '../judge/gemini.js';
import {
  applyEffect, awardPowerup, EFFECTS, hasActiveEffect, isUsableInPhase,
  pruneEffects, randomPowerup, resetRound, seededRng, sumModifiers, type EffectPlayer,
} from './effects.js';
import {
  advance, checkWin, finalTiles, rubricTotal, scoreSubmission, tilesForScore,
} from './scoring.js';

/** Hostile power-ups land on the opponent; everything else on the user. */
function EFFECT_TARGET_IS_OPPONENT(type: PowerupType): boolean {
  return EFFECTS[type].hostile;
}

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
  /** This player's power-up luck, seeded by their alias. */
  draw: () => number;
};

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export class MatchEngine {
  phase: Phase = 'LOBBY';
  deadlineAt: number | null = null;
  round = 0;
  players: ServerPlayer[] = [];
  winner?: { role: Role; reason: 'CAUGHT' | 'ESCAPED' | 'EVADED' };

  private problem: Problem | null = null;
  private judged = new Map<string, { passed: number; total: number; rubric: number; note: string }>();
  private judgingSettled = false;
  private judgingPromise: Promise<void> | null = null;
  private judgingToken = 0;

  constructor(
    readonly roomCode: string,
    private readonly deps: EngineDeps,
    /**
     * A demo match. Runs on the short phase clock regardless of the server's
     * FAST_MATCH setting, and hands the reference solution to its clients so a
     * presenter can play a full game without typing one.
     */
    readonly demo: boolean = false,
  ) {}

  /** Short phases when the server is in fast mode OR this is a demo match. */
  private get fastMode(): boolean {
    return this.deps.fast || this.demo;
  }

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
      draw: seededRng(nickname),
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

    if (this.players.every((p) => p.submission)) this.enterJudging();
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
        this.enterJudging();
        return;
      case 'JUDGING':
        // Hard cap: settle with whatever arrived, fall back for the rest.
        this.finishJudging();
        return;
      case 'SCORING':
        this.enterPowerupPhase();
        return;
      case 'POWERUP':
        this.resolveMovement();
        return;
      case 'MOVEMENT':
        this.afterMovement();
        return;
      default:
        return;
    }
  }

  // ---------------------------------------------------------------- judging

  private enterJudging(): void {
    this.judged.clear();
    this.judgingSettled = false;
    this.judgingToken += 1;
    this.goto('JUDGING');
    // execute() can reject (fs failure, spawn throw). Unhandled, that would
    // terminate the whole process, so the rejection is always consumed here.
    this.judgingPromise = this.runJudging().catch((err) => {
      console.error(`[match ${this.roomCode}] judging failed`, err);
    });
  }

  /** Kicks off execution and style judging for both players concurrently. */
  private async runJudging(): Promise<void> {
    const problem = this.currentProblem;
    if (!problem) return;
    const token = this.judgingToken;

    await Promise.all(
      this.players.map(async (player) => {
        const sub = player.submission;
        if (!sub) return;
        try {
          const [exec, rubric] = await Promise.all([
            this.deps.execute({
              language: sub.language,
              code: sub.code,
              functionName: problem.functionName[sub.language],
              tests: problem.hiddenTests,
              comparison: problem.comparison,
            }, (r) => {
              if (this.judgingToken !== token) return;
              if (r.pass) player.progress = (player.progress ?? 0) + 1;
              // A fine-grained event, not a full snapshot: 10 tests x 2 players
              // would otherwise be 20 whole-state broadcasts per round.
              for (const viewer of this.players) {
                const concealed = viewer.id !== player.id
                  && hasActiveEffect(player, 'SMOKE_BOMB', this.deps.now());
                if (concealed) continue;
                this.deps.emit(viewer.id, 'test_progress', {
                  playerId: player.id,
                  done: player.progress ?? 0,
                  total: problem.hiddenTests.length,
                });
              }
            }),
            this.deps.judgeStyle(sub.code, sub.language),
          ]);
          if (this.judgingToken !== token) return;
          this.judged.set(player.id, {
            passed: exec.passed,
            total: problem.hiddenTests.length,
            rubric: rubricTotal(rubric),
            note: rubric.note,
          });
        } catch (err) {
          // Contained per player on purpose. Letting this reach Promise.all
          // skipped finishJudging() entirely, so BOTH players sat in JUDGING
          // until the 8s hard cap for one player's filesystem hiccup.
          console.error(`[match ${this.roomCode}] judging ${player.id} failed`, err);
          if (this.judgingToken !== token) return;
          this.judged.set(player.id, {
            passed: 0,
            total: problem.hiddenTests.length,
            rubric: 0,
            note: 'The crew could not review this job.',
          });
        }
      }),
    );

    if (this.judgingToken !== token) return;
    if (this.phase === 'JUDGING') this.finishJudging();
  }

  /** Test seam: await the in-flight judging rather than starting a second one. */
  async settleJudging(): Promise<void> {
    await this.judgingPromise;
  }

  private finishJudging(): void {
    if (this.judgingSettled) return;
    this.judgingSettled = true;

    const problem = this.currentProblem;
    const totalTests = problem ? problem.hiddenTests.length : 0;

    // Speed bonus: earliest submission that was fully correct.
    const perfect = this.players
      .filter((p) => (this.judged.get(p.id)?.passed ?? 0) === totalTests && totalTests > 0)
      .sort((a, b) => (a.submission?.at ?? 0) - (b.submission?.at ?? 0));
    const bonusId = perfect[0]?.id ?? null;

    for (const player of this.players) {
      const j = this.judged.get(player.id) ?? { passed: 0, total: totalTests, rubric: 0, note: '' };
      const s = scoreSubmission(j.passed, j.total, j.rubric);
      const score: RoundScore = {
        correctness: s.correctness,
        style: s.style,
        total: s.total,
        baseTiles: tilesForScore(s.total),
        modifierDelta: 0,
        speedBonus: player.id === bonusId ? BALANCE.SPEED_BONUS_TILES : 0,
        // Provisional: modifiers are played during POWERUP, after this is sent.
        tiles: 0,
        passed: j.passed,
        totalTests: j.total,
        note: j.note,
      };
      score.tiles = finalTiles(score.baseTiles, 0, score.speedBonus);
      player.lastScore = score;
      player.progress = j.passed;
    }

    this.emitRoundResult();
    this.goto('SCORING');
  }

  // ---------------------------------------------------------------- awards

  private enterPowerupPhase(): void {
    this.goto('POWERUP');
    const deadlineAt = this.deadlineAt ?? this.deps.now();

    const totals = this.players.map((p) => p.lastScore?.total ?? 0);
    const best = Math.max(...totals);
    const soleLeader = totals.filter((t) => t === best).length === 1;

    for (const player of this.players) {
      const score = player.lastScore;
      if (!score) continue;

      // Perfect correctness earns one at random.
      if (score.totalTests > 0 && score.passed === score.totalTests) {
        awardPowerup(player, randomPowerup(player.draw));
      }

      // The sole highest scorer picks one of two.
      if (soleLeader && score.total === best) {
        player.offer = [randomPowerup(player.draw), randomPowerup(player.draw)];
        this.deps.emit(player.id, 'powerup_offer', { options: player.offer, deadlineAt });
      }
    }
    this.pushSnapshots();
  }

  chooseOffer(playerId: string, type: PowerupType): Result<{ ok: true }> {
    if (this.phase !== 'POWERUP') return { ok: false, error: 'WRONG_PHASE' };
    const player = this.find(playerId);
    if (!player) return { ok: false, error: 'NO_SUCH_PLAYER' };
    if (!player.offer?.includes(type)) return { ok: false, error: 'NOT_OFFERED' };
    awardPowerup(player, type);
    player.offer = null;
    this.pushSnapshots();
    return { ok: true, data: { ok: true } };
  }

  // -------------------------------------------------------------- movement

  private resolveMovement(): void {
    // An unclaimed offer resolves at random so the phase never stalls.
    for (const player of this.players) {
      if (player.offer) {
        const pick = player.offer[Math.floor(player.draw() * player.offer.length)]!;
        awardPowerup(player, pick);
        player.offer = null;
      }
    }

    for (const player of this.players) {
      const score = player.lastScore;
      if (!score) continue;
      score.modifierDelta = sumModifiers(player);
      score.tiles = finalTiles(score.baseTiles, score.modifierDelta, score.speedBonus);
      player.position = advance(player.position, score.tiles);
    }

    // Re-send with the final tiles and modifier deltas now that they are known.
    this.emitRoundResult();
    this.goto('MOVEMENT');
  }

  private afterMovement(): void {
    const cop = this.players.find((p) => p.role === 'COP');
    const robber = this.players.find((p) => p.role === 'ROBBER');
    if (!cop || !robber) {
      // Cannot resolve a match without both roles; end it rather than re-enter every tick.
      this.goto('GAME_OVER');
      return;
    }

    // Landing on a stash tile earns one at random. This must run here, after
    // resolveMovement() has written the new positions, and before the win check
    // so a player who lands on a stash tile on a deciding round is still credited.
    for (const player of this.players) {
      if (BALANCE.STASH_TILES.includes(player.position)) {
        awardPowerup(player, randomPowerup(player.draw));
      }
    }

    const outcome = checkWin(cop.position, robber.position, this.round);
    if (outcome) {
      this.winner = outcome;
      this.goto('GAME_OVER');
      for (const player of this.players) {
        this.deps.emit(player.id, 'game_over', { winner: outcome.role, reason: outcome.reason });
      }
      return;
    }
    this.startRound(this.round + 1);
  }

  // -------------------------------------------------------------- power-ups

  usePowerup(playerId: string, type: PowerupType): Result<{ blocked: boolean }> {
    const source = this.find(playerId);
    if (!source) return { ok: false, error: 'NO_SUCH_PLAYER' };
    // Shield is reactive: it arms on award and is never actively used, so no
    // phase would ever permit it. Blaming the clock here misleads the client.
    if (EFFECTS[type].kind === 'reactive') return { ok: false, error: 'NOT_USABLE' };
    if (!isUsableInPhase(type, this.phase)) return { ok: false, error: 'WRONG_PHASE' };

    const spec = EFFECT_TARGET_IS_OPPONENT(type);
    const target = spec ? this.players.find((p) => p.id !== playerId) : source;
    if (!target) return { ok: false, error: 'NO_OPPONENT' };

    const res = applyEffect(source, target, type, this.deps.now(), this.roundEndsAt());
    if (!res.ok) return { ok: false, error: res.reason };

    if (res.blocked) {
      for (const p of this.players) this.deps.emit(p.id, 'effect_blocked', { targetId: target.id, type });
    } else {
      for (const p of this.players) {
        this.deps.emit(p.id, 'effect_applied', {
          sourceId: playerId, targetId: target.id, type, expiresAt: res.expiresAt,
        });
      }
    }
    this.pushSnapshots();
    return { ok: true, data: { blocked: res.blocked } };
  }

  /**
   * "Rest of the round" for Smoke Bomb. Progress only streams during JUDGING,
   * so an expiry at the CODING deadline would conceal nothing.
   */
  private roundEndsAt(): number {
    const d = phaseDurations(this.fastMode);
    const base = this.deadlineAt ?? this.deps.now();
    return this.phase === 'CODING' ? base + d.JUDGING + d.SCORING : base;
  }

  canRun(playerId: string, now: number): Result<{ ok: true }> {
    const player = this.find(playerId);
    if (!player) return { ok: false, error: 'NO_SUCH_PLAYER' };
    if (this.phase !== 'CODING') return { ok: false, error: 'WRONG_PHASE' };
    if (hasActiveEffect(player, 'EMP', now)) return { ok: false, error: 'EMP_ACTIVE' };
    if (now - player.lastRunAt < BALANCE.RUN_COOLDOWN_MS) return { ok: false, error: 'COOLDOWN' };
    player.lastRunAt = now;
    return { ok: true, data: { ok: true } };
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
    const durations = phaseDurations(this.fastMode);
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
    const viewer = this.find(viewerId);
    return {
      roomCode: this.roomCode,
      phase: this.phase,
      deadlineAt: this.deadlineAt,
      round: this.round,
      problem: this.problem ? toPublicProblem(this.problem, viewer?.role, this.demo) : null,
      players: this.players.map((p) => this.viewOf(p, viewerId, now)),
      demo: this.demo,
      offer: viewer?.offer ? [...viewer.offer] : null,
      scores: this.scoresFor(viewerId, now),
      ...(this.winner ? { winner: this.winner } : {}),
    };
  }

  /**
   * Sent per viewer rather than broadcast: a concealed opponent's figures must
   * never cross the wire to the player they are hidden from.
   */
  private emitRoundResult(): void {
    const now = this.deps.now();
    for (const viewer of this.players) {
      this.deps.emit(viewer.id, 'round_result', {
        round: this.round,
        scores: this.scoresFor(viewer.id, now) ?? {},
      });
    }
  }

  /**
   * The last round's scores as this viewer may see them, or null before any
   * round has resolved. Built per viewer because Smoke Bomb's concealment is
   * relative to who is looking.
   */
  private scoresFor(viewerId: string, now: number): Record<string, RoundScore> | null {
    if (!this.players.some((p) => p.lastScore)) return null;
    const out: Record<string, RoundScore> = {};
    for (const p of this.players) {
      if (p.lastScore) out[p.id] = this.scoreAsSeenBy(p, p.lastScore, viewerId, now);
    }
    return out;
  }

  /**
   * Zeroes what Smoke Bomb is meant to hide rather than omitting the entry, so
   * a client always has a row to render. Tiles, modifier and speed bonus stay
   * truthful: the board visibly moves, so withholding them buys nothing.
   */
  private scoreAsSeenBy(
    player: ServerPlayer, score: RoundScore, viewerId: string, now: number,
  ): RoundScore {
    if (player.id === viewerId || !hasActiveEffect(player, 'SMOKE_BOMB', now)) {
      return { ...score };
    }
    return { ...score, correctness: 0, total: 0, passed: 0, note: '', concealed: true };
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
      hostileUsed: player.hostileUsedThisRound,
    };
  }

  protected find(playerId: string): ServerPlayer | undefined {
    return this.players.find((p) => p.id === playerId);
  }

  protected get currentProblem(): Problem | null {
    return this.problem;
  }
}
