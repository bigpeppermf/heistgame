import type {
  Language, MatchSnapshot, PowerupType, RoundScore, Role, TestResult,
} from './state.js';

export type Ack<T> = (res: { ok: true; data: T } | { ok: false; error: string }) => void;

export interface ClientToServerEvents {
  create_room: (p: { nickname: string }, ack: Ack<{ roomCode: string; playerId: string }>) => void;
  join_room: (p: { roomCode: string; nickname: string }, ack: Ack<{ playerId: string }>) => void;
  rejoin: (p: { roomCode: string; playerId: string }, ack: Ack<{ ok: true }>) => void;
  code_sync: (p: { code: string; language: Language }) => void;
  run: (p: { code: string; language: Language }, ack: Ack<{ runId: string }>) => void;
  submit: (p: { code: string; language: Language }, ack: Ack<{ ok: true }>) => void;
  use_powerup: (p: { type: PowerupType }, ack: Ack<{ blocked: boolean }>) => void;
  choose_powerup: (p: { type: PowerupType }, ack: Ack<{ ok: true }>) => void;
}

export interface ServerToClientEvents {
  snapshot: (s: MatchSnapshot) => void;
  test_progress: (p: { playerId: string; done: number; total: number }) => void;
  run_output: (p: { runId: string; results: TestResult[]; stdout: string; stderr: string }) => void;
  effect_applied: (p: { sourceId: string; targetId: string; type: PowerupType; expiresAt: number | null }) => void;
  effect_blocked: (p: { targetId: string; type: PowerupType }) => void;
  round_result: (p: { round: number; scores: Record<string, RoundScore> }) => void;
  powerup_offer: (p: { options: PowerupType[]; deadlineAt: number }) => void;
  game_over: (p: { winner: Role; reason: 'CAUGHT' | 'ESCAPED' | 'EVADED' }) => void;
  opponent_disconnected: (p: { graceUntil: number }) => void;
  opponent_reconnected: () => void;
  error_msg: (p: { code: string; message: string }) => void;
}
