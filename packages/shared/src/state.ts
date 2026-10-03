export type Phase =
  | 'LOBBY' | 'ROLE_REVEAL' | 'ROUND_INTRO' | 'CODING'
  | 'JUDGING' | 'SCORING' | 'POWERUP' | 'MOVEMENT' | 'GAME_OVER';

export type Role = 'COP' | 'ROBBER';

export const ROLE_LABELS: Record<Role, string> = { COP: 'Cops', ROBBER: 'Heist Crew' };

export type ProblemBriefing = { title: string; narrative: string };
export type Language = 'python' | 'javascript';
export type Comparison = 'exact' | 'unordered' | 'float';

export type PowerupType =
  | 'EMP' | 'BLACKOUT' | 'JAMMED_COMMS' | 'SMOKE_BOMB'
  | 'ROADBLOCK' | 'GETAWAY_CAR' | 'SHIELD';

export type TestCase = { input: unknown[]; expected: unknown };

export type Problem = {
  id: string;
  title: string;
  narrative: string;
  functionName: Record<Language, string>;
  starterCode: Record<Language, string>;
  sampleTests: TestCase[];
  hiddenTests: TestCase[];
  /** Story framing only; both sides solve the same coding task. */
  roleBriefings?: Record<Role, ProblemBriefing>;
  comparison: Comparison;
};

/** The snapshot-safe projection. Physically cannot carry hidden tests. */
export type PublicProblem = Omit<Problem, 'hiddenTests' | 'roleBriefings'>;

export function toPublicProblem(p: Problem, role?: Role): PublicProblem {
  const { hiddenTests: _omit, roleBriefings, ...rest } = p;
  const briefing = role ? roleBriefings?.[role] : undefined;
  return briefing ? { ...rest, title: briefing.title, narrative: `${briefing.narrative} ${rest.narrative}` } : rest;
}

export type ActiveEffect = { type: PowerupType; expiresAt: number };
export type PendingModifier = { type: PowerupType; delta: number };

export type TestResult = {
  i: number;
  pass: boolean;
  ms: number;
  actual?: unknown;
  error?: string;
};

export type RubricScore = {
  naming: number;
  readability: number;
  comments: number;
  organization: number;
  simplicity: number;
  note: string;
};

export type RoundScore = {
  correctness: number;
  style: number;
  total: number;
  baseTiles: number;
  modifierDelta: number;
  speedBonus: number;
  tiles: number;
  passed: number;
  totalTests: number;
  note: string;
};

export type PlayerView = {
  id: string;
  nickname: string;
  role: Role;
  position: number;
  inventory: PowerupType[];
  shielded: boolean;
  activeEffects: ActiveEffect[];
  submitted: boolean;
  connected: boolean;
  /** null when the opponent is concealed by Smoke Bomb */
  progress: number | null;
};

export type MatchSnapshot = {
  roomCode: string;
  phase: Phase;
  deadlineAt: number | null;
  round: number;
  problem: PublicProblem | null;
  players: PlayerView[];
  winner?: { role: Role; reason: 'CAUGHT' | 'ESCAPED' | 'EVADED' };
};
