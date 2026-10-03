# HeistCode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a 1v1 competitive heist-themed coding game where two players race through LeetCode-style problems, scored on correctness plus AI-judged code style, moving along a Cop-vs-Robber board with sabotage power-ups.

**Architecture:** Authoritative Node server holds all match state in memory, one `MatchEngine` per room keyed by room code. Clients emit intents and render `snapshot` messages. Phases and effects carry absolute `expiresAt` timestamps so clients count down locally. Submitted code runs in a short-lived child process with a scrubbed environment.

**Tech Stack:** TypeScript throughout. npm workspaces monorepo. Frontend: Next.js 15 (App Router), React 19, Tailwind, `@monaco-editor/react`, `socket.io-client`. Backend: Express, Socket.IO, `@google/genai`. Tests: Vitest.

**Spec:** `docs/superpowers/specs/2026-10-03-heistcode-design.md`

## Global Constraints

- Board is 15 tiles indexed `0-14`; tile `14` is the escape. Positions clamp: `position = min(position + tiles, 14)`.
- Cop starts tile `0`, Robber starts tile `3`. Stash tiles are `5, 9, 12`.
- Exactly `3` rounds, exactly `2` players per match.
- Score is `correctness = (passed/total) * 80` and `style = (rubric/20) * 20 * (passed/total)`. Style is **always** scaled by correctness.
- Movement brackets: `0-30 -> 1`, `31-50 -> 2`, `51-70 -> 3`, `71-90 -> 4`, `91-100 -> 5`. Floor of 1 tile.
- Speed bonus is `+1` tile to the first player to submit 100% correct, by **server receipt order**.
- Win check order after movement: (1) `cop_pos >= robber_pos` -> Cop; (2) `robber_pos >= 14` -> Robber; (3) 3 rounds elapsed -> Robber.
- Languages: Python 3 and JavaScript only.
- Child processes spawn with `env: { PATH }` only — **never** inherit `process.env`.
- Exec limits: `5000ms` wall clock, `SIGKILL`, `256KB` stdout cap, max `4` concurrent, `2000ms` per-player Run cooldown.
- Gemini: `4000ms` timeout; on any failure return a fallback rubric summing to exactly `14`.
- `JUDGING` phase hard cap `8000ms` — must advance regardless.
- Max `1` hostile power-up per player per round (counts timed sabotage **and** hostile modifiers). Inventory cap `3`. Shield auto-arms on award and never enters inventory.
- Submit is **once per round** and returns pass count only, never which tests failed.
- `MatchSnapshot.problem` is typed `PublicProblem` and must never carry `hiddenTests`.
- Every tunable number lives in `packages/shared/src/balance.ts`. No numeric literals for game rules anywhere else.

## Review Focus

Five failure modes the spec implies but which no feature task would naturally exercise. Each has a test pinned to the task that owns the code.

1. **Syntax-error submission** — the deadline auto-submits half-written code, so unparseable input is the *common* case, not the rare one. Expected: all tests fail, the traceback reaches `stderr`, the round still resolves. (Task 6)
2. **Gemini returns out-of-range or missing rubric fields** — e.g. `naming: 9` against a max of 5, or a field absent. Expected: clamp per field and default missing ones, so a total score can never exceed 100 or become `NaN`. (Task 7)
3. **Double submit** — a double-click or a retry after lock. Expected: the second is rejected, the first submission stands, and the speed bonus is not re-awarded. (Task 9)
4. **Power-up used in an illegal phase** — e.g. EMP during `SCORING`. Expected: rejected with an error **and the item stays in inventory**; silently consuming it would be a real bug. (Task 4)
5. **Right answer, wrong container type** — Python returns a tuple where the expected value is a list. Expected: comparison handles it without crashing, and the documented behavior is explicit rather than accidental. (Task 5)

---

## File Structure

```
heistgame/
├─ package.json                      workspaces root, scripts
├─ tsconfig.base.json
├─ packages/shared/
│  ├─ package.json
│  ├─ tsconfig.json
│  └─ src/
│     ├─ index.ts                    re-exports
│     ├─ balance.ts                  every tunable number
│     ├─ state.ts                    Phase, Role, Problem, PublicProblem, MatchSnapshot
│     ├─ events.ts                   ClientToServer / ServerToClient maps
│     └─ problems.ts                 the 4 problems as typed data
└─ apps/
   ├─ server/
   │  ├─ package.json
   │  ├─ tsconfig.json
   │  └─ src/
   │     ├─ index.ts                 express + socket.io bootstrap
   │     ├─ match/
   │     │  ├─ scoring.ts            pure: score, tiles, advance, win check
   │     │  ├─ effects.ts            pure: EFFECTS table, applyEffect, awards
   │     │  ├─ registry.ts           Map<roomCode, MatchEngine>
   │     │  └─ engine.ts             phase machine
   │     ├─ exec/
   │     │  ├─ compare.ts            pure: exact | unordered | float
   │     │  ├─ runner.ts             spawn, protocol parse, semaphore
   │     │  └─ harnesses.ts          PY_HARNESS, JS_HARNESS string constants
   │     └─ judge/gemini.ts          rubric call + clamp + fallback
   └─ web/
      ├─ package.json
      ├─ next.config.ts
      ├─ tailwind.config.ts
      └─ src/
         ├─ app/layout.tsx
         ├─ app/page.tsx                   nickname + create/join
         ├─ app/match/[code]/page.tsx      the game
         ├─ lib/socket.ts                  typed socket singleton
         ├─ lib/useMatch.ts                snapshot state hook
         └─ components/
            ├─ CodeEditor.tsx
            ├─ TestResults.tsx
            ├─ Board.tsx
            ├─ ScorePanel.tsx
            ├─ PowerupTray.tsx
            └─ EffectOverlay.tsx
```

---

### Task 1: Monorepo scaffold and the frozen contract

This is the hour 0-1 task from spec §14, done by both people together. Nothing else can start until the shared types exist.

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `.gitignore`
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`
- Create: `packages/shared/src/balance.ts`, `state.ts`, `events.ts`, `index.ts`
- Create: `vitest.config.ts`
- Test: `packages/shared/src/balance.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `BALANCE` constant object; types `Phase`, `Role`, `Language`, `PowerupType`, `Comparison`, `TestCase`, `Problem`, `PublicProblem`, `ActiveEffect`, `PendingModifier`, `PlayerView`, `MatchSnapshot`, `TestResult`, `RubricScore`, `RoundScore`; interfaces `ClientToServerEvents`, `ServerToClientEvents`. Every later task imports from `@heist/shared`.

- [ ] **Step 1: Create the workspace root**

`package.json`:

```json
{
  "name": "heistgame",
  "private": true,
  "workspaces": ["packages/*", "apps/*"],
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc -b packages/shared apps/server"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vitest": "^2.1.0",
    "@types/node": "^22.0.0"
  }
}
```

`tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "composite": true
  }
}
```

`.gitignore`:

```
node_modules/
dist/
.next/
.env
.env.local
.remember/
```

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['**/*.test.ts'], environment: 'node' },
});
```

- [ ] **Step 2: Create the shared package**

`packages/shared/package.json`:

```json
{
  "name": "@heist/shared",
  "version": "0.0.0",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" }
}
```

`packages/shared/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src"]
}
```

- [ ] **Step 3: Write `balance.ts` — every tunable number in one file**

```ts
export const BALANCE = {
  // board
  BOARD_MAX_TILE: 14,
  ESCAPE_TILE: 14,
  COP_START: 0,
  ROBBER_START: 3,
  STASH_TILES: [5, 9, 12] as readonly number[],
  TOTAL_ROUNDS: 3,

  // scoring
  CORRECTNESS_WEIGHT: 80,
  STYLE_WEIGHT: 20,
  STYLE_RUBRIC_MAX: 20,
  SPEED_BONUS_TILES: 1,
  MIN_TILES: 1,
  MOVEMENT_BRACKETS: [
    { max: 30, tiles: 1 },
    { max: 50, tiles: 2 },
    { max: 70, tiles: 3 },
    { max: 90, tiles: 4 },
    { max: 100, tiles: 5 },
  ] as readonly { max: number; tiles: number }[],

  // power-ups
  INVENTORY_CAP: 3,
  HOSTILE_PER_ROUND: 1,

  // phases (ms)
  PHASE_MS: {
    ROLE_REVEAL: 4_000,
    ROUND_INTRO: 5_000,
    CODING: 150_000,
    JUDGING: 8_000,
    SCORING: 8_000,
    POWERUP: 10_000,
    MOVEMENT: 4_000,
  },

  // execution
  EXEC_TIMEOUT_MS: 5_000,
  EXEC_OUTPUT_CAP_BYTES: 256 * 1024,
  EXEC_MAX_CONCURRENT: 4,
  RUN_COOLDOWN_MS: 2_000,

  // networking
  CODE_SYNC_DEBOUNCE_MS: 5_000,
  RECONNECT_GRACE_MS: 20_000,
  MATCH_DESTROY_MS: 60_000,

  // ai judge
  GEMINI_TIMEOUT_MS: 4_000,
  GEMINI_MODEL: 'gemini-2.5-flash',
} as const;

/** Collapses every phase so a full match plays in under a minute. */
export const FAST_MATCH_PHASE_MS = {
  ROLE_REVEAL: 1_000,
  ROUND_INTRO: 1_000,
  CODING: 20_000,
  JUDGING: 8_000,
  SCORING: 2_000,
  POWERUP: 4_000,
  MOVEMENT: 1_000,
};

export function phaseDurations(fast: boolean) {
  return fast ? FAST_MATCH_PHASE_MS : BALANCE.PHASE_MS;
}
```

- [ ] **Step 4: Write `state.ts`**

```ts
export type Phase =
  | 'LOBBY' | 'ROLE_REVEAL' | 'ROUND_INTRO' | 'CODING'
  | 'JUDGING' | 'SCORING' | 'POWERUP' | 'MOVEMENT' | 'GAME_OVER';

export type Role = 'COP' | 'ROBBER';
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
  comparison: Comparison;
};

/** The snapshot-safe projection. Physically cannot carry hidden tests. */
export type PublicProblem = Omit<Problem, 'hiddenTests'>;

export function toPublicProblem(p: Problem): PublicProblem {
  const { hiddenTests: _omit, ...rest } = p;
  return rest;
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
```

- [ ] **Step 5: Write `events.ts` — freeze this; later changes break the other person's build**

```ts
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
```

`packages/shared/src/index.ts`:

```ts
export * from './balance.js';
export * from './state.js';
export * from './events.js';
export * from './problems.js';
```

- [ ] **Step 6: Write the failing test**

`packages/shared/src/balance.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { BALANCE } from './balance.js';
import { toPublicProblem, type Problem } from './state.js';

describe('balance invariants', () => {
  it('weights sum to 100', () => {
    expect(BALANCE.CORRECTNESS_WEIGHT + BALANCE.STYLE_WEIGHT).toBe(100);
  });

  it('movement brackets are ascending and end at 100', () => {
    const maxes = BALANCE.MOVEMENT_BRACKETS.map((b) => b.max);
    expect(maxes).toEqual([...maxes].sort((a, b) => a - b));
    expect(maxes.at(-1)).toBe(100);
  });

  it('robber starts ahead of the cop but short of the escape', () => {
    expect(BALANCE.ROBBER_START).toBeGreaterThan(BALANCE.COP_START);
    expect(BALANCE.ROBBER_START).toBeLessThan(BALANCE.ESCAPE_TILE);
  });

  it('stash tiles are all on the board', () => {
    for (const t of BALANCE.STASH_TILES) {
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThanOrEqual(BALANCE.BOARD_MAX_TILE);
    }
  });
});

describe('toPublicProblem', () => {
  it('strips hiddenTests', () => {
    const p: Problem = {
      id: 'x', title: 'X', narrative: 'n',
      functionName: { python: 'f', javascript: 'f' },
      starterCode: { python: '', javascript: '' },
      sampleTests: [{ input: [1], expected: 1 }],
      hiddenTests: [{ input: [2], expected: 2 }],
      comparison: 'exact',
    };
    expect('hiddenTests' in toPublicProblem(p)).toBe(false);
  });
});
```

- [ ] **Step 7: Run tests to verify they fail**

Run: `npm install && npx vitest run packages/shared`
Expected: FAIL — `problems.js` does not exist yet, so `index.ts` cannot resolve.

- [ ] **Step 8: Create a placeholder `problems.ts` so the module graph resolves**

```ts
import type { Problem } from './state.js';

export const PROBLEMS: Problem[] = [];
```

Task 8 fills this in. The empty array keeps Task 1 independently testable.

- [ ] **Step 9: Run tests to verify they pass**

Run: `npx vitest run packages/shared`
Expected: PASS, 5 tests.

- [ ] **Step 10: Commit**

```bash
git add package.json tsconfig.base.json .gitignore vitest.config.ts packages/
git commit -m "feat: monorepo scaffold and frozen shared contract"
```

---

### Task 2: Scoring and win check (pure, backend)

Spec §8. Pure functions, so this is the highest-value test target in the plan.

**Files:**
- Create: `apps/server/package.json`, `apps/server/tsconfig.json`
- Create: `apps/server/src/match/scoring.ts`
- Test: `apps/server/src/match/scoring.test.ts`

**Interfaces:**
- Consumes: `BALANCE`, `RubricScore`, `Role` from `@heist/shared`.
- Produces:
  - `rubricTotal(r: RubricScore): number`
  - `scoreSubmission(passed: number, total: number, rubric: number): { correctness: number; style: number; total: number }`
  - `tilesForScore(score: number): number`
  - `finalTiles(base: number, modifierDelta: number, speedBonus: number): number`
  - `advance(position: number, tiles: number): number`
  - `checkWin(copPos: number, robberPos: number, roundsPlayed: number): { role: Role; reason: 'CAUGHT' | 'ESCAPED' | 'EVADED' } | null`

- [ ] **Step 1: Create the server package**

`apps/server/package.json`:

```json
{
  "name": "@heist/server",
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc -b",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@heist/shared": "*",
    "@google/genai": "^1.0.0",
    "cors": "^2.8.5",
    "express": "^4.21.0",
    "socket.io": "^4.8.0"
  },
  "devDependencies": {
    "@types/cors": "^2.8.17",
    "@types/express": "^5.0.0",
    "tsx": "^4.19.0"
  }
}
```

`apps/server/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "references": [{ "path": "../../packages/shared" }],
  "include": ["src"]
}
```

- [ ] **Step 2: Write the failing test**

`apps/server/src/match/scoring.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  advance, checkWin, finalTiles, rubricTotal, scoreSubmission, tilesForScore,
} from './scoring.js';

describe('rubricTotal', () => {
  it('sums the five criteria', () => {
    expect(rubricTotal({
      naming: 5, readability: 4, comments: 3, organization: 2, simplicity: 1, note: '',
    })).toBe(15);
  });
});

describe('scoreSubmission', () => {
  it('gives 100 for all tests passed and a perfect rubric', () => {
    const s = scoreSubmission(10, 10, 20);
    expect(s.correctness).toBe(80);
    expect(s.style).toBe(20);
    expect(s.total).toBe(100);
  });

  it('scales style by correctness, so zero correct is worth zero total', () => {
    const s = scoreSubmission(0, 10, 20);
    expect(s.correctness).toBe(0);
    expect(s.style).toBe(0);
    expect(s.total).toBe(0);
  });

  it('halves style at half correctness', () => {
    const s = scoreSubmission(5, 10, 20);
    expect(s.correctness).toBe(40);
    expect(s.style).toBe(10);
    expect(s.total).toBe(50);
  });

  it('treats a zero-test problem as zero rather than dividing by zero', () => {
    expect(scoreSubmission(0, 0, 20).total).toBe(0);
  });
});

describe('tilesForScore', () => {
  it.each([
    [0, 1], [30, 1], [31, 2], [50, 2], [51, 3],
    [70, 3], [71, 4], [90, 4], [91, 5], [100, 5],
  ])('score %i yields %i tiles', (score, tiles) => {
    expect(tilesForScore(score)).toBe(tiles);
  });
});

describe('finalTiles', () => {
  it('adds modifiers and the speed bonus', () => {
    expect(finalTiles(3, 1, 1)).toBe(5);
  });

  it('never drops below one tile even when roadblocked', () => {
    expect(finalTiles(1, -1, 0)).toBe(1);
    expect(finalTiles(1, -5, 0)).toBe(1);
  });
});

describe('advance', () => {
  it('clamps at the final tile and does not carry overflow', () => {
    expect(advance(11, 4)).toBe(14);
    expect(advance(14, 5)).toBe(14);
  });

  it('moves normally mid-board', () => {
    expect(advance(3, 4)).toBe(7);
  });
});

describe('checkWin', () => {
  it('gives the cop the win on a catch', () => {
    expect(checkWin(7, 7, 1)).toEqual({ role: 'COP', reason: 'CAUGHT' });
    expect(checkWin(8, 7, 1)).toEqual({ role: 'COP', reason: 'CAUGHT' });
  });

  it('gives the cop ties even when the robber also reached the escape', () => {
    expect(checkWin(14, 14, 3)).toEqual({ role: 'COP', reason: 'CAUGHT' });
  });

  it('gives the robber the win on escape', () => {
    expect(checkWin(10, 14, 3)).toEqual({ role: 'ROBBER', reason: 'ESCAPED' });
  });

  it('gives the robber the win when three rounds elapse uncaught', () => {
    expect(checkWin(5, 9, 3)).toEqual({ role: 'ROBBER', reason: 'EVADED' });
  });

  it('returns null mid-match', () => {
    expect(checkWin(4, 7, 1)).toBeNull();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run apps/server/src/match/scoring.test.ts`
Expected: FAIL — `Cannot find module './scoring.js'`

- [ ] **Step 4: Write the implementation**

`apps/server/src/match/scoring.ts`:

```ts
import { BALANCE, type Role, type RubricScore } from '@heist/shared';

export function rubricTotal(r: RubricScore): number {
  return r.naming + r.readability + r.comments + r.organization + r.simplicity;
}

export function scoreSubmission(passed: number, total: number, rubric: number) {
  const ratio = total === 0 ? 0 : passed / total;
  const correctness = ratio * BALANCE.CORRECTNESS_WEIGHT;
  const style = (rubric / BALANCE.STYLE_RUBRIC_MAX) * BALANCE.STYLE_WEIGHT * ratio;
  return { correctness, style, total: correctness + style };
}

export function tilesForScore(score: number): number {
  for (const b of BALANCE.MOVEMENT_BRACKETS) {
    if (score <= b.max) return b.tiles;
  }
  return BALANCE.MOVEMENT_BRACKETS.at(-1)!.tiles;
}

export function finalTiles(base: number, modifierDelta: number, speedBonus: number): number {
  return Math.max(BALANCE.MIN_TILES, base + modifierDelta + speedBonus);
}

export function advance(position: number, tiles: number): number {
  return Math.min(position + tiles, BALANCE.BOARD_MAX_TILE);
}

export function checkWin(
  copPos: number,
  robberPos: number,
  roundsPlayed: number,
): { role: Role; reason: 'CAUGHT' | 'ESCAPED' | 'EVADED' } | null {
  if (copPos >= robberPos) return { role: 'COP', reason: 'CAUGHT' };
  if (robberPos >= BALANCE.ESCAPE_TILE) return { role: 'ROBBER', reason: 'ESCAPED' };
  if (roundsPlayed >= BALANCE.TOTAL_ROUNDS) return { role: 'ROBBER', reason: 'EVADED' };
  return null;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run apps/server/src/match/scoring.test.ts`
Expected: PASS, 19 tests.

- [ ] **Step 6: Commit**

```bash
git add apps/server/package.json apps/server/tsconfig.json apps/server/src/match/scoring.ts apps/server/src/match/scoring.test.ts
git commit -m "feat: scoring, movement and win-check logic"
```

---

### Task 3: Power-up effect pipeline (pure, backend)

Spec §9. One choke point; Shield is a property of the pipeline, not a seventh feature.

**Files:**
- Create: `apps/server/src/match/effects.ts`
- Test: `apps/server/src/match/effects.test.ts`

**Interfaces:**
- Consumes: `BALANCE`, `PowerupType`, `ActiveEffect`, `PendingModifier` from `@heist/shared`.
- Produces:
  - `type EffectSpec = { kind: 'timed' | 'modifier' | 'reactive'; hostile: boolean; durationMs: number | null; delta: number }`
  - `EFFECTS: Record<PowerupType, EffectSpec>`
  - `type EffectPlayer = { inventory: PowerupType[]; shielded: boolean; activeEffects: ActiveEffect[]; pendingModifiers: PendingModifier[]; hostileUsedThisRound: number }`
  - `type ApplyResult = { ok: true; blocked: boolean; expiresAt: number | null } | { ok: false; reason: 'NOT_OWNED' | 'HOSTILE_CAP' | 'NOT_USABLE' }`
  - `applyEffect(source, target, type, now, roundEndsAt): ApplyResult`
  - `awardPowerup(player, type): void`
  - `pruneEffects(player, now): void`
  - `hasActiveEffect(player, type, now): boolean`
  - `sumModifiers(player): number`
  - `resetRound(player): void`
  - `randomPowerup(rng?): PowerupType`

- [ ] **Step 1: Write the failing test**

`apps/server/src/match/effects.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyEffect, awardPowerup, type EffectPlayer, hasActiveEffect,
  pruneEffects, resetRound, sumModifiers,
} from './effects.js';

const NOW = 1_000_000;
const ROUND_END = NOW + 100_000;

function player(inventory: EffectPlayer['inventory'] = []): EffectPlayer {
  return { inventory: [...inventory], shielded: false, activeEffects: [], pendingModifiers: [], hostileUsedThisRound: 0 };
}

describe('applyEffect', () => {
  let a: EffectPlayer;
  let b: EffectPlayer;
  beforeEach(() => { a = player(['EMP', 'ROADBLOCK', 'GETAWAY_CAR']); b = player(); });

  it('applies a timed hostile effect to the target and consumes the item', () => {
    const r = applyEffect(a, b, 'EMP', NOW, ROUND_END);
    expect(r).toEqual({ ok: true, blocked: false, expiresAt: NOW + 15_000 });
    expect(a.inventory).not.toContain('EMP');
    expect(hasActiveEffect(b, 'EMP', NOW)).toBe(true);
  });

  it('puts a hostile modifier on the target, not the source', () => {
    applyEffect(a, b, 'ROADBLOCK', NOW, ROUND_END);
    expect(sumModifiers(b)).toBe(-1);
    expect(sumModifiers(a)).toBe(0);
  });

  it('puts a self modifier on the source', () => {
    applyEffect(a, a, 'GETAWAY_CAR', NOW, ROUND_END);
    expect(sumModifiers(a)).toBe(1);
  });

  it('rejects a power-up the source does not own and consumes nothing', () => {
    const r = applyEffect(a, b, 'BLACKOUT', NOW, ROUND_END);
    expect(r).toEqual({ ok: false, reason: 'NOT_OWNED' });
    expect(b.activeEffects).toHaveLength(0);
  });

  it('a shield blocks the next hostile effect and is consumed', () => {
    b.shielded = true;
    const r = applyEffect(a, b, 'EMP', NOW, ROUND_END);
    expect(r).toEqual({ ok: true, blocked: true, expiresAt: null });
    expect(b.shielded).toBe(false);
    expect(hasActiveEffect(b, 'EMP', NOW)).toBe(false);
    expect(a.inventory).not.toContain('EMP');
  });

  it('a shield does not block a self effect', () => {
    a.shielded = true;
    applyEffect(a, a, 'GETAWAY_CAR', NOW, ROUND_END);
    expect(a.shielded).toBe(true);
    expect(sumModifiers(a)).toBe(1);
  });

  it('caps hostile use at one per round across timed and modifier kinds', () => {
    expect(applyEffect(a, b, 'EMP', NOW, ROUND_END).ok).toBe(true);
    const second = applyEffect(a, b, 'ROADBLOCK', NOW, ROUND_END);
    expect(second).toEqual({ ok: false, reason: 'HOSTILE_CAP' });
    expect(a.inventory).toContain('ROADBLOCK');
  });

  it('does not count self effects against the hostile cap', () => {
    applyEffect(a, a, 'GETAWAY_CAR', NOW, ROUND_END);
    expect(applyEffect(a, b, 'EMP', NOW, ROUND_END).ok).toBe(true);
  });

  it('expires a smoke bomb at the end of the round', () => {
    const c = player(['SMOKE_BOMB']);
    const r = applyEffect(c, c, 'SMOKE_BOMB', NOW, ROUND_END);
    expect(r).toEqual({ ok: true, blocked: false, expiresAt: ROUND_END });
  });

  it('refuses to use SHIELD directly, since it auto-arms on award', () => {
    const c = player(['SHIELD']);
    expect(applyEffect(c, c, 'SHIELD', NOW, ROUND_END)).toEqual({ ok: false, reason: 'NOT_USABLE' });
  });
});

describe('awardPowerup', () => {
  it('auto-arms a shield instead of storing it, and ignores the inventory cap', () => {
    const p = player(['EMP', 'BLACKOUT', 'ROADBLOCK']);
    awardPowerup(p, 'SHIELD');
    expect(p.shielded).toBe(true);
    expect(p.inventory).toHaveLength(3);
  });

  it('discards awards beyond the inventory cap', () => {
    const p = player(['EMP', 'BLACKOUT', 'ROADBLOCK']);
    awardPowerup(p, 'GETAWAY_CAR');
    expect(p.inventory).toHaveLength(3);
    expect(p.inventory).not.toContain('GETAWAY_CAR');
  });

  it('stores an award when there is room', () => {
    const p = player();
    awardPowerup(p, 'GETAWAY_CAR');
    expect(p.inventory).toEqual(['GETAWAY_CAR']);
  });
});

describe('pruneEffects', () => {
  it('drops effects whose deadline has passed and keeps live ones', () => {
    const p = player();
    p.activeEffects = [
      { type: 'EMP', expiresAt: NOW - 1 },
      { type: 'BLACKOUT', expiresAt: NOW + 1 },
    ];
    pruneEffects(p, NOW);
    expect(p.activeEffects.map((e) => e.type)).toEqual(['BLACKOUT']);
  });
});

describe('resetRound', () => {
  it('clears pending modifiers and the hostile counter but keeps inventory and shield', () => {
    const p = player(['EMP']);
    p.shielded = true;
    p.pendingModifiers = [{ type: 'ROADBLOCK', delta: -1 }];
    p.hostileUsedThisRound = 1;
    resetRound(p);
    expect(p.pendingModifiers).toEqual([]);
    expect(p.hostileUsedThisRound).toBe(0);
    expect(p.inventory).toEqual(['EMP']);
    expect(p.shielded).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run apps/server/src/match/effects.test.ts`
Expected: FAIL — `Cannot find module './effects.js'`

- [ ] **Step 3: Write the implementation**

`apps/server/src/match/effects.ts`:

```ts
import {
  BALANCE, type ActiveEffect, type PendingModifier, type PowerupType,
} from '@heist/shared';

export type EffectSpec = {
  kind: 'timed' | 'modifier' | 'reactive';
  hostile: boolean;
  /** null on a timed effect means "until the end of the round" */
  durationMs: number | null;
  delta: number;
};

export const EFFECTS: Record<PowerupType, EffectSpec> = {
  EMP:          { kind: 'timed',    hostile: true,  durationMs: 15_000, delta: 0 },
  BLACKOUT:     { kind: 'timed',    hostile: true,  durationMs: 6_000,  delta: 0 },
  JAMMED_COMMS: { kind: 'timed',    hostile: true,  durationMs: 20_000, delta: 0 },
  SMOKE_BOMB:   { kind: 'timed',    hostile: false, durationMs: null,   delta: 0 },
  ROADBLOCK:    { kind: 'modifier', hostile: true,  durationMs: null,   delta: -1 },
  GETAWAY_CAR:  { kind: 'modifier', hostile: false, durationMs: null,   delta: 1 },
  SHIELD:       { kind: 'reactive', hostile: false, durationMs: null,   delta: 0 },
};

/** Every power-up except SHIELD, which is never stored or used directly. */
const AWARDABLE = Object.keys(EFFECTS) as PowerupType[];

export type EffectPlayer = {
  inventory: PowerupType[];
  shielded: boolean;
  activeEffects: ActiveEffect[];
  pendingModifiers: PendingModifier[];
  hostileUsedThisRound: number;
};

export type ApplyResult =
  | { ok: true; blocked: boolean; expiresAt: number | null }
  | { ok: false; reason: 'NOT_OWNED' | 'HOSTILE_CAP' | 'NOT_USABLE' };

/**
 * The single choke point every power-up passes through.
 * Shield is the guard at the top, not a separate feature.
 */
export function applyEffect(
  source: EffectPlayer,
  target: EffectPlayer,
  type: PowerupType,
  now: number,
  roundEndsAt: number,
): ApplyResult {
  const spec = EFFECTS[type];

  if (spec.kind === 'reactive') return { ok: false, reason: 'NOT_USABLE' };

  const idx = source.inventory.indexOf(type);
  if (idx === -1) return { ok: false, reason: 'NOT_OWNED' };

  if (spec.hostile && source.hostileUsedThisRound >= BALANCE.HOSTILE_PER_ROUND) {
    return { ok: false, reason: 'HOSTILE_CAP' };
  }

  source.inventory.splice(idx, 1);
  if (spec.hostile) source.hostileUsedThisRound += 1;

  if (spec.hostile && target.shielded) {
    target.shielded = false;
    return { ok: true, blocked: true, expiresAt: null };
  }

  if (spec.kind === 'timed') {
    const expiresAt = spec.durationMs === null ? roundEndsAt : now + spec.durationMs;
    target.activeEffects.push({ type, expiresAt });
    return { ok: true, blocked: false, expiresAt };
  }

  target.pendingModifiers.push({ type, delta: spec.delta });
  return { ok: true, blocked: false, expiresAt: null };
}

export function awardPowerup(player: EffectPlayer, type: PowerupType): void {
  if (type === 'SHIELD') {
    player.shielded = true;
    return;
  }
  if (player.inventory.length >= BALANCE.INVENTORY_CAP) return;
  player.inventory.push(type);
}

export function pruneEffects(player: EffectPlayer, now: number): void {
  player.activeEffects = player.activeEffects.filter((e) => e.expiresAt > now);
}

export function hasActiveEffect(player: EffectPlayer, type: PowerupType, now: number): boolean {
  return player.activeEffects.some((e) => e.type === type && e.expiresAt > now);
}

export function sumModifiers(player: EffectPlayer): number {
  return player.pendingModifiers.reduce((sum, m) => sum + m.delta, 0);
}

export function resetRound(player: EffectPlayer): void {
  player.pendingModifiers = [];
  player.hostileUsedThisRound = 0;
}

export function randomPowerup(rng: () => number = Math.random): PowerupType {
  return AWARDABLE[Math.floor(rng() * AWARDABLE.length)]!;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run apps/server/src/match/effects.test.ts`
Expected: PASS, 16 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/match/effects.ts apps/server/src/match/effects.test.ts
git commit -m "feat: power-up effect pipeline with shield guard and per-round cap"
```

---

### Task 4: Phase legality for power-up use (backend)

**Review Focus item 4** lives here: using a power-up in the wrong phase must be rejected *without* consuming the item.

**Files:**
- Modify: `apps/server/src/match/effects.ts`
- Modify: `apps/server/src/match/effects.test.ts`

**Interfaces:**
- Consumes: `EFFECTS`, `Phase` from `@heist/shared`.
- Produces: `isUsableInPhase(type: PowerupType, phase: Phase): boolean`. Task 10 calls this before `applyEffect`.

- [ ] **Step 1: Write the failing test**

Append to `apps/server/src/match/effects.test.ts`:

```ts
import { isUsableInPhase } from './effects.js';

describe('isUsableInPhase', () => {
  it('allows timed sabotage only while coding', () => {
    expect(isUsableInPhase('EMP', 'CODING')).toBe(true);
    expect(isUsableInPhase('BLACKOUT', 'CODING')).toBe(true);
    expect(isUsableInPhase('SMOKE_BOMB', 'CODING')).toBe(true);
    expect(isUsableInPhase('EMP', 'SCORING')).toBe(false);
    expect(isUsableInPhase('EMP', 'POWERUP')).toBe(false);
    expect(isUsableInPhase('EMP', 'LOBBY')).toBe(false);
  });

  it('allows modifiers only during the power-up phase', () => {
    expect(isUsableInPhase('ROADBLOCK', 'POWERUP')).toBe(true);
    expect(isUsableInPhase('GETAWAY_CAR', 'POWERUP')).toBe(true);
    expect(isUsableInPhase('ROADBLOCK', 'CODING')).toBe(false);
  });

  it('never allows SHIELD to be used, in any phase', () => {
    expect(isUsableInPhase('SHIELD', 'CODING')).toBe(false);
    expect(isUsableInPhase('SHIELD', 'POWERUP')).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run apps/server/src/match/effects.test.ts`
Expected: FAIL — `isUsableInPhase is not a function`

- [ ] **Step 3: Implement**

Append to `apps/server/src/match/effects.ts`:

```ts
import type { Phase } from '@heist/shared';

/**
 * Phase legality, per spec section 9. Checked BEFORE applyEffect so an
 * illegal attempt never consumes the item.
 */
export function isUsableInPhase(type: PowerupType, phase: Phase): boolean {
  const spec = EFFECTS[type];
  if (spec.kind === 'reactive') return false;
  if (spec.kind === 'timed') return phase === 'CODING';
  return phase === 'POWERUP';
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run apps/server/src/match/effects.test.ts`
Expected: PASS, 19 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/match/effects.ts apps/server/src/match/effects.test.ts
git commit -m "feat: phase legality check for power-up use"
```

---

### Task 5: Output comparison modes (pure, backend)

Spec §7. **Review Focus item 5** lives here: a right answer in the wrong container must not crash the comparison, and the behavior must be deliberate rather than accidental.

**Files:**
- Create: `apps/server/src/exec/compare.ts`
- Test: `apps/server/src/exec/compare.test.ts`

**Interfaces:**
- Consumes: `Comparison` from `@heist/shared`.
- Produces: `compare(actual: unknown, expected: unknown, mode: Comparison): boolean`. Task 6's runner calls this per test result.

- [ ] **Step 1: Write the failing test**

`apps/server/src/exec/compare.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { compare } from './compare.js';

describe('exact', () => {
  it('matches scalars and arrays', () => {
    expect(compare(5, 5, 'exact')).toBe(true);
    expect(compare([0, 1], [0, 1], 'exact')).toBe(true);
    expect(compare(true, true, 'exact')).toBe(true);
    expect(compare(null, null, 'exact')).toBe(true);
  });

  it('rejects order differences', () => {
    expect(compare([1, 0], [0, 1], 'exact')).toBe(false);
  });

  it('rejects a number that arrived as a string', () => {
    expect(compare('5', 5, 'exact')).toBe(false);
    expect(compare('true', true, 'exact')).toBe(false);
  });

  it('ignores object key order', () => {
    expect(compare({ b: 2, a: 1 }, { a: 1, b: 2 }, 'exact')).toBe(true);
  });

  it('accepts a Python tuple, which arrives as a JSON array', () => {
    // json.dumps((0, 1)) serialises to [0, 1]
    expect(compare([0, 1], [0, 1], 'exact')).toBe(true);
  });

  it('rejects a Python set, which arrives stringified by default=str', () => {
    expect(compare('{0, 1}', [0, 1], 'exact')).toBe(false);
  });
});

describe('unordered', () => {
  it('ignores order', () => {
    expect(compare([1, 0], [0, 1], 'unordered')).toBe(true);
    expect(compare([3, 1, 2], [1, 2, 3], 'unordered')).toBe(true);
  });

  it('respects multiplicity', () => {
    expect(compare([1, 1, 2], [1, 2, 2], 'unordered')).toBe(false);
  });

  it('rejects length mismatches', () => {
    expect(compare([0], [0, 1], 'unordered')).toBe(false);
  });

  it('returns false without throwing when either side is not an array', () => {
    expect(compare(5, [0, 1], 'unordered')).toBe(false);
    expect(compare(null, [0, 1], 'unordered')).toBe(false);
    expect(compare([0, 1], 'nope', 'unordered')).toBe(false);
  });
});

describe('float', () => {
  it('accepts values within epsilon', () => {
    expect(compare(0.1 + 0.2, 0.3, 'float')).toBe(true);
  });

  it('rejects values outside epsilon', () => {
    expect(compare(0.3001, 0.3, 'float')).toBe(false);
  });

  it('returns false without throwing on non-numbers', () => {
    expect(compare('0.3', 0.3, 'float')).toBe(false);
    expect(compare(null, 0.3, 'float')).toBe(false);
  });

  it('handles NaN and Infinity without claiming equality by subtraction', () => {
    expect(compare(NaN, NaN, 'float')).toBe(false);
    expect(compare(Infinity, Infinity, 'float')).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run apps/server/src/exec/compare.test.ts`
Expected: FAIL — `Cannot find module './compare.js'`

- [ ] **Step 3: Write the implementation**

`apps/server/src/exec/compare.ts`:

```ts
import type { Comparison } from '@heist/shared';

const FLOAT_EPSILON = 1e-6;

/** Canonical JSON with sorted object keys, so key order never matters. */
function stable(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'undefined';
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${stable(o[k])}`).join(',')}}`;
}

export function compare(actual: unknown, expected: unknown, mode: Comparison): boolean {
  if (mode === 'unordered') {
    if (!Array.isArray(actual) || !Array.isArray(expected)) return false;
    if (actual.length !== expected.length) return false;
    const key = (xs: unknown[]) => xs.map(stable).sort().join('\u0000');
    return key(actual) === key(expected);
  }

  if (mode === 'float') {
    if (typeof actual !== 'number' || typeof expected !== 'number') return false;
    if (!Number.isFinite(actual) || !Number.isFinite(expected)) return actual === expected;
    return Math.abs(actual - expected) < FLOAT_EPSILON;
  }

  return stable(actual) === stable(expected);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run apps/server/src/exec/compare.test.ts`
Expected: PASS, 14 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/exec/compare.ts apps/server/src/exec/compare.test.ts
git commit -m "feat: exact, unordered and float output comparison"
```

---

### Task 6: Code executor — spawn, protocol, limits

Spec §7. **Review Focus item 1** lives here: the deadline auto-submits half-written code, so a syntax error is the common case.

**Files:**
- Create: `apps/server/src/exec/harnesses.ts`
- Create: `apps/server/src/exec/runner.ts`
- Test: `apps/server/src/exec/runner.test.ts`

**Interfaces:**
- Consumes: `compare` (Task 5); `BALANCE`, `Language`, `TestCase`, `TestResult` from `@heist/shared`.
- Produces:
  - `type ExecOpts = { language: Language; code: string; functionName: string; tests: TestCase[]; comparison: Comparison; timeoutMs?: number }`
  - `type ExecOutcome = { results: TestResult[]; stdout: string; stderr: string; timedOut: boolean; passed: number }`
  - `execute(opts: ExecOpts, onResult?: (r: TestResult) => void): Promise<ExecOutcome>`

  Task 10 calls `execute`. `onResult` is how `test_progress` streams.

- [ ] **Step 1: Write the harness constants**

`apps/server/src/exec/harnesses.ts`:

```ts
export const SENTINEL = '##HC##';

export const PY_HARNESS = `import json, sys, time, traceback, importlib.util

SENTINEL = "${'##HC##'}"

def emit(obj):
    sys.stdout.write(SENTINEL + json.dumps(obj, default=str) + "\\n")
    sys.stdout.flush()

def main():
    with open("config.json") as fh:
        cfg = json.load(fh)
    tests = cfg["tests"]
    try:
        spec = importlib.util.spec_from_file_location("solution", "solution.py")
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        fn = getattr(mod, cfg["functionName"])
    except Exception:
        sys.stderr.write(traceback.format_exc())
        for i in range(len(tests)):
            emit({"i": i, "ms": 0, "actual": None, "error": "load_error"})
        return
    for i, t in enumerate(tests):
        start = time.perf_counter()
        actual = None
        error = None
        try:
            actual = fn(*t["input"])
        except Exception as e:
            error = type(e).__name__ + ": " + str(e)
        emit({"i": i, "ms": int((time.perf_counter() - start) * 1000), "actual": actual, "error": error})

main()
`;

export const JS_HARNESS = `const fs = require('fs');
const SENTINEL = '${'##HC##'}';
function emit(o) { process.stdout.write(SENTINEL + JSON.stringify(o) + '\\n'); }
const cfg = JSON.parse(fs.readFileSync('config.json', 'utf8'));
let fn;
try {
  const mod = require('./solution.js');
  fn = (typeof mod === 'function') ? mod : mod[cfg.functionName];
  if (typeof fn !== 'function') throw new Error('missing function ' + cfg.functionName);
} catch (e) {
  process.stderr.write((e && e.stack) ? e.stack : String(e));
  for (let i = 0; i < cfg.tests.length; i++) emit({ i: i, ms: 0, actual: null, error: 'load_error' });
  process.exit(0);
}
for (let i = 0; i < cfg.tests.length; i++) {
  const t0 = Date.now();
  let actual = null, error = null;
  try { actual = fn.apply(null, cfg.tests[i].input); }
  catch (e) { error = ((e && e.name) ? e.name + ': ' : '') + ((e && e.message) ? e.message : String(e)); }
  emit({ i: i, ms: Date.now() - t0, actual: actual === undefined ? null : actual, error: error });
}
`;
```

- [ ] **Step 2: Write the failing test**

`apps/server/src/exec/runner.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { execute } from './runner.js';
import type { TestCase } from '@heist/shared';

const TESTS: TestCase[] = [
  { input: [[2, 7, 11, 15], 9], expected: [0, 1] },
  { input: [[3, 2, 4], 6], expected: [1, 2] },
];

const PY_GOOD = `def crack_vault(codes, target):
    seen = {}
    for i, c in enumerate(codes):
        if target - c in seen:
            return [seen[target - c], i]
        seen[c] = i
    return []
`;

const JS_GOOD = `function crackVault(codes, target) {
  const seen = new Map();
  for (let i = 0; i < codes.length; i++) {
    if (seen.has(target - codes[i])) return [seen.get(target - codes[i]), i];
    seen.set(codes[i], i);
  }
  return [];
}
`;

describe('execute — python', () => {
  it('passes a correct solution and reports the pass count', async () => {
    const out = await execute({
      language: 'python', code: PY_GOOD, functionName: 'crack_vault',
      tests: TESTS, comparison: 'unordered',
    });
    expect(out.passed).toBe(2);
    expect(out.results.map((r) => r.pass)).toEqual([true, true]);
    expect(out.timedOut).toBe(false);
  });

  it('REVIEW FOCUS 1: a syntax error fails every test, surfaces stderr, and still resolves', async () => {
    const out = await execute({
      language: 'python', code: 'def crack_vault(codes, target)\n    return [', functionName: 'crack_vault',
      tests: TESTS, comparison: 'unordered',
    });
    expect(out.passed).toBe(0);
    expect(out.results).toHaveLength(2);
    expect(out.results.every((r) => r.pass === false)).toBe(true);
    expect(out.stderr).toMatch(/SyntaxError/);
  });

  it('fails only the test that raises, keeping credit for the others', async () => {
    const code = `def crack_vault(codes, target):
    if target == 6:
        raise ValueError("boom")
    return [0, 1]
`;
    const out = await execute({
      language: 'python', code, functionName: 'crack_vault',
      tests: TESTS, comparison: 'unordered',
    });
    expect(out.results[0]!.pass).toBe(true);
    expect(out.results[1]!.pass).toBe(false);
    expect(out.results[1]!.error).toMatch(/ValueError/);
    expect(out.passed).toBe(1);
  });

  it('reports a missing function as a load error rather than hanging', async () => {
    const out = await execute({
      language: 'python', code: 'def wrong_name(a, b):\n    return []', functionName: 'crack_vault',
      tests: TESTS, comparison: 'unordered',
    });
    expect(out.passed).toBe(0);
    expect(out.stderr).toMatch(/AttributeError|has no attribute/);
  });

  it('captures the player own stdout separately from the protocol', async () => {
    const code = `def crack_vault(codes, target):
    print("debugging the vault")
    return [0, 1]
`;
    const out = await execute({
      language: 'python', code, functionName: 'crack_vault',
      tests: [TESTS[0]!], comparison: 'unordered',
    });
    expect(out.stdout).toContain('debugging the vault');
    expect(out.stdout).not.toContain('##HC##');
    expect(out.results[0]!.pass).toBe(true);
  });

  it('keeps partial credit when the code hangs, marking the rest as timeout', async () => {
    const code = `def crack_vault(codes, target):
    if target == 6:
        while True:
            pass
    return [0, 1]
`;
    const out = await execute({
      language: 'python', code, functionName: 'crack_vault',
      tests: TESTS, comparison: 'unordered', timeoutMs: 1500,
    });
    expect(out.timedOut).toBe(true);
    expect(out.results[0]!.pass).toBe(true);
    expect(out.results[1]!.error).toBe('timeout');
    expect(out.passed).toBe(1);
  }, 10_000);

  it('cannot read the parent environment', async () => {
    process.env.HC_SECRET_CANARY = 'do-not-leak';
    const code = `import os
def crack_vault(codes, target):
    return [os.environ.get("HC_SECRET_CANARY", "ABSENT")]
`;
    const out = await execute({
      language: 'python', code, functionName: 'crack_vault',
      tests: [{ input: [[1], 1], expected: ['ABSENT'] }], comparison: 'exact',
    });
    delete process.env.HC_SECRET_CANARY;
    expect(out.results[0]!.pass).toBe(true);
  });
});

describe('execute — javascript', () => {
  it('passes a correct solution', async () => {
    const out = await execute({
      language: 'javascript', code: JS_GOOD, functionName: 'crackVault',
      tests: TESTS, comparison: 'unordered',
    });
    expect(out.passed).toBe(2);
  });

  it('reports a syntax error through stderr', async () => {
    const out = await execute({
      language: 'javascript', code: 'function crackVault(a, b) { return [', functionName: 'crackVault',
      tests: TESTS, comparison: 'unordered',
    });
    expect(out.passed).toBe(0);
    expect(out.stderr.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run apps/server/src/exec/runner.test.ts`
Expected: FAIL — `Cannot find module './runner.js'`

- [ ] **Step 4: Write the implementation**

`apps/server/src/exec/runner.ts`:

```ts
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  BALANCE, type Comparison, type Language, type TestCase, type TestResult,
} from '@heist/shared';
import { compare } from './compare.js';
import { JS_HARNESS, PY_HARNESS, SENTINEL } from './harnesses.js';

export type ExecOpts = {
  language: Language;
  code: string;
  functionName: string;
  tests: TestCase[];
  comparison: Comparison;
  /** Overridable so tests need not wait the full production timeout. */
  timeoutMs?: number;
};

export type ExecOutcome = {
  results: TestResult[];
  stdout: string;
  stderr: string;
  timedOut: boolean;
  passed: number;
};

// Protects the server from its own developers hammering Run.
let active = 0;
const waiting: (() => void)[] = [];

async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= BALANCE.EXEC_MAX_CONCURRENT) {
    await new Promise<void>((resolve) => waiting.push(resolve));
  }
  active += 1;
  try {
    return await fn();
  } finally {
    active -= 1;
    waiting.shift()?.();
  }
}

export async function execute(
  opts: ExecOpts,
  onResult?: (r: TestResult) => void,
): Promise<ExecOutcome> {
  return withSlot(() => runOnce(opts, onResult));
}

async function runOnce(
  opts: ExecOpts,
  onResult?: (r: TestResult) => void,
): Promise<ExecOutcome> {
  const dir = await mkdtemp(join(tmpdir(), 'hc-'));
  try {
    const isPy = opts.language === 'python';
    await writeFile(
      join(dir, 'config.json'),
      JSON.stringify({
        functionName: opts.functionName,
        tests: opts.tests.map((t) => ({ input: t.input })),
      }),
    );

    if (isPy) {
      await writeFile(join(dir, 'solution.py'), opts.code);
      await writeFile(join(dir, 'harness.py'), PY_HARNESS);
    } else {
      // The temp dir has no package.json of its own, so pin CommonJS explicitly.
      await writeFile(join(dir, 'package.json'), JSON.stringify({ type: 'commonjs' }));
      await writeFile(
        join(dir, 'solution.js'),
        `${opts.code}\nmodule.exports = (typeof ${opts.functionName} !== 'undefined') ? ${opts.functionName} : undefined;\n`,
      );
      await writeFile(join(dir, 'harness.js'), JS_HARNESS);
    }

    const child = spawn(
      isPy ? 'python3' : process.execPath,
      [isPy ? 'harness.py' : 'harness.js'],
      {
        cwd: dir,
        // SCRUBBED. Never inherit process.env — see spec section 7.
        env: { PATH: process.env.PATH ?? '' },
        timeout: opts.timeoutMs ?? BALANCE.EXEC_TIMEOUT_MS,
        killSignal: 'SIGKILL',
      },
    );

    const results: TestResult[] = [];
    let buffer = '';
    let stdout = '';
    let stderr = '';
    let bytes = 0;
    let capped = false;

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      bytes += chunk.length;
      if (bytes > BALANCE.EXEC_OUTPUT_CAP_BYTES) {
        capped = true;
        child.kill('SIGKILL');
        return;
      }
      buffer += chunk;
      let nl: number;
      while ((nl = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        if (!line.startsWith(SENTINEL)) {
          stdout += `${line}\n`;
          continue;
        }
        try {
          const raw = JSON.parse(line.slice(SENTINEL.length)) as {
            i: number; ms: number; actual: unknown; error: string | null;
          };
          const expected = opts.tests[raw.i]?.expected;
          const result: TestResult = {
            i: raw.i,
            pass: raw.error ? false : compare(raw.actual, expected, opts.comparison),
            ms: raw.ms,
            actual: raw.actual,
            ...(raw.error ? { error: raw.error } : {}),
          };
          results.push(result);
          onResult?.(result);
        } catch {
          // A malformed protocol line is ignored; the missing index is
          // backfilled as a timeout below.
        }
      }
    });

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => { stderr += chunk; });

    const killed = await new Promise<boolean>((resolve) => {
      child.on('close', (_code, signal) => resolve(signal === 'SIGKILL'));
      child.on('error', () => resolve(false));
    });

    // Backfill anything that never reported: hung, killed, or crashed mid-run.
    for (let i = 0; i < opts.tests.length; i += 1) {
      if (!results.some((r) => r.i === i)) {
        results.push({ i, pass: false, ms: 0, error: 'timeout' });
      }
    }
    results.sort((a, b) => a.i - b.i);

    return {
      results,
      stdout: capped ? `${stdout}\n[output truncated]` : stdout,
      stderr,
      timedOut: killed,
      passed: results.filter((r) => r.pass).length,
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run apps/server/src/exec/runner.test.ts`
Expected: PASS, 9 tests. Requires `python3` on PATH.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/exec/harnesses.ts apps/server/src/exec/runner.ts apps/server/src/exec/runner.test.ts
git commit -m "feat: sandboxed code executor with streaming results and partial credit"
```

---

### Task 7: Gemini style judge

Spec §8. **Review Focus item 2** lives here: an out-of-range or malformed rubric must never produce a total above 100 or `NaN`.

**Files:**
- Create: `apps/server/src/judge/gemini.ts`
- Test: `apps/server/src/judge/gemini.test.ts`

**Interfaces:**
- Consumes: `BALANCE`, `Language`, `RubricScore` from `@heist/shared`.
- Produces:
  - `RUBRIC_MAX: Record<'naming'|'readability'|'comments'|'organization'|'simplicity', number>`
  - `FALLBACK_RUBRIC: RubricScore` (sums to exactly 14)
  - `normalizeRubric(raw: unknown): RubricScore`
  - `judgeStyle(code: string, language: Language, call?: (prompt: string) => Promise<string>): Promise<RubricScore>`

  Task 10 calls `judgeStyle`. The optional `call` parameter exists so tests can drive it without a network or an API key.

- [ ] **Step 1: Write the failing test**

`apps/server/src/judge/gemini.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { BALANCE } from '@heist/shared';
import {
  FALLBACK_RUBRIC, judgeStyle, normalizeRubric, RUBRIC_MAX,
} from './gemini.js';
import { rubricTotal } from '../match/scoring.js';

describe('rubric bounds', () => {
  it('maxima sum to the shared rubric maximum', () => {
    const sum = Object.values(RUBRIC_MAX).reduce((a, b) => a + b, 0);
    expect(sum).toBe(BALANCE.STYLE_RUBRIC_MAX);
  });

  it('the fallback sums to exactly 14, as the spec requires', () => {
    expect(rubricTotal(FALLBACK_RUBRIC)).toBe(14);
  });
});

describe('normalizeRubric — REVIEW FOCUS 2', () => {
  it('clamps values above each field maximum', () => {
    const r = normalizeRubric({
      naming: 9, readability: 100, comments: 7, organization: 5, simplicity: 4, note: 'x',
    });
    expect(r).toEqual({
      naming: 5, readability: 5, comments: 4, organization: 3, simplicity: 3, note: 'x',
    });
    expect(rubricTotal(r)).toBe(BALANCE.STYLE_RUBRIC_MAX);
  });

  it('clamps negatives to zero', () => {
    expect(normalizeRubric({ naming: -3 }).naming).toBe(0);
  });

  it('defaults missing fields to zero rather than NaN', () => {
    const r = normalizeRubric({ naming: 3 });
    expect(rubricTotal(r)).toBe(3);
    expect(Number.isNaN(rubricTotal(r))).toBe(false);
  });

  it('treats non-numeric and non-finite values as zero', () => {
    expect(normalizeRubric({ naming: 'five' }).naming).toBe(0);
    expect(normalizeRubric({ naming: NaN }).naming).toBe(0);
    expect(normalizeRubric({ naming: Infinity }).naming).toBe(0);
    expect(normalizeRubric({ naming: null }).naming).toBe(0);
  });

  it('rounds fractional scores', () => {
    expect(normalizeRubric({ naming: 3.7 }).naming).toBe(4);
  });

  it('survives a non-object payload', () => {
    expect(rubricTotal(normalizeRubric(null))).toBe(0);
    expect(rubricTotal(normalizeRubric('garbage'))).toBe(0);
    expect(rubricTotal(normalizeRubric([1, 2, 3]))).toBe(0);
  });

  it('coerces a non-string note and truncates a long one', () => {
    expect(normalizeRubric({ note: 42 }).note).toBe('');
    expect(normalizeRubric({ note: 'x'.repeat(500) }).note.length).toBe(200);
  });
});

describe('judgeStyle', () => {
  it('uses a well-formed response', async () => {
    const call = async () => JSON.stringify({
      naming: 5, readability: 4, comments: 2, organization: 3, simplicity: 3, note: 'tidy',
    });
    const r = await judgeStyle('def f(): pass', 'python', call);
    expect(rubricTotal(r)).toBe(17);
    expect(r.note).toBe('tidy');
  });

  it('falls back when the response is not JSON', async () => {
    const r = await judgeStyle('x', 'python', async () => 'I think this code is nice!');
    expect(r).toEqual(FALLBACK_RUBRIC);
  });

  it('falls back when the call throws', async () => {
    const r = await judgeStyle('x', 'python', async () => { throw new Error('503'); });
    expect(r).toEqual(FALLBACK_RUBRIC);
  });

  it('falls back when the call outlives the timeout', async () => {
    const slow = () => new Promise<string>((resolve) => {
      setTimeout(() => resolve('{}'), BALANCE.GEMINI_TIMEOUT_MS + 500);
    });
    const r = await judgeStyle('x', 'python', slow);
    expect(r).toEqual(FALLBACK_RUBRIC);
  }, 10_000);

  it('strips a markdown code fence before parsing', async () => {
    const fenced = async () => '```json\n{"naming":5,"readability":5,"comments":4,"organization":3,"simplicity":3,"note":"ok"}\n```';
    const r = await judgeStyle('x', 'python', fenced);
    expect(rubricTotal(r)).toBe(20);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run apps/server/src/judge/gemini.test.ts`
Expected: FAIL — `Cannot find module './gemini.js'`

- [ ] **Step 3: Write the implementation**

`apps/server/src/judge/gemini.ts`:

```ts
import { GoogleGenAI } from '@google/genai';
import { BALANCE, type Language, type RubricScore } from '@heist/shared';

export const RUBRIC_MAX = {
  naming: 5,
  readability: 5,
  comments: 4,
  organization: 3,
  simplicity: 3,
} as const;

/** Sums to exactly 14, per spec section 6 case 7. */
export const FALLBACK_RUBRIC: RubricScore = {
  naming: 4,
  readability: 4,
  comments: 3,
  organization: 2,
  simplicity: 1,
  note: 'Style review unavailable for this submission.',
};

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    naming: { type: 'integer' },
    readability: { type: 'integer' },
    comments: { type: 'integer' },
    organization: { type: 'integer' },
    simplicity: { type: 'integer' },
    note: { type: 'string' },
  },
  required: ['naming', 'readability', 'comments', 'organization', 'simplicity', 'note'],
} as const;

function prompt(code: string, language: Language): string {
  return `You are a code STYLE reviewer for a competitive coding game.
Score the ${language} submission below against this fixed rubric. Award integers only.

- naming (0-5): descriptive identifiers, not x, a, tmp
- readability (0-5): understandable flow and structure
- comments (0-4): helpful where needed; do NOT reward volume
- organization (0-3): sensible functions, separated logic
- simplicity (0-3): avoids needless complexity or duplicated work

Do NOT judge whether the code is correct. Test cases decide that. Score style only.
Add a one-sentence "note" in the voice of a veteran heist crew boss.

SUBMISSION:
${code}`;
}

function clampField(v: unknown, max: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : 0;
  return Math.max(0, Math.min(max, Math.round(n)));
}

export function normalizeRubric(raw: unknown): RubricScore {
  const o: Record<string, unknown> =
    raw !== null && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  return {
    naming: clampField(o.naming, RUBRIC_MAX.naming),
    readability: clampField(o.readability, RUBRIC_MAX.readability),
    comments: clampField(o.comments, RUBRIC_MAX.comments),
    organization: clampField(o.organization, RUBRIC_MAX.organization),
    simplicity: clampField(o.simplicity, RUBRIC_MAX.simplicity),
    note: typeof o.note === 'string' ? o.note.slice(0, 200) : '',
  };
}

let client: GoogleGenAI | null = null;

async function liveCall(text: string): Promise<string> {
  client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? '' });
  const res = await client.models.generateContent({
    model: BALANCE.GEMINI_MODEL,
    contents: text,
    config: { responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA },
  });
  return res.text ?? '';
}

function stripFence(s: string): string {
  const m = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (m?.[1] ?? s).trim();
}

/**
 * Never throws and never hangs. On any failure the round still resolves
 * with a fixed fallback, per spec section 6 case 7.
 */
export async function judgeStyle(
  code: string,
  language: Language,
  call: (text: string) => Promise<string> = liveCall,
): Promise<RubricScore> {
  if (process.env.DEV_SKIP_AI === '1') return FALLBACK_RUBRIC;

  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('gemini timeout')), BALANCE.GEMINI_TIMEOUT_MS);
  });

  try {
    const text = await Promise.race([call(prompt(code, language)), timeout]);
    return normalizeRubric(JSON.parse(stripFence(text)));
  } catch {
    return FALLBACK_RUBRIC;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run apps/server/src/judge/gemini.test.ts`
Expected: PASS, 14 tests. No API key needed — every test injects `call`.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/judge/gemini.ts apps/server/src/judge/gemini.test.ts
git commit -m "feat: gemini style judge with clamping and fixed fallback"
```

---

### Task 8: The four problems, validated against reference solutions

Spec §12. The test here does real validation: it runs a reference solution through the Task 6 executor against every sample and hidden test, so a wrong `expected` value cannot reach a live match.

**Files:**
- Modify: `packages/shared/src/problems.ts`
- Test: `apps/server/src/exec/problems.test.ts`

**Interfaces:**
- Consumes: `Problem` from `@heist/shared`; `execute` (Task 6).
- Produces: `PROBLEMS: Problem[]` of length 4, and `problemForRound(round: number): Problem`. Task 10 calls `problemForRound`.

- [ ] **Step 1: Write the problem data**

Replace `packages/shared/src/problems.ts`:

```ts
import type { Problem } from './state.js';

export const PROBLEMS: Problem[] = [
  {
    id: 'vault-codes',
    title: 'Match the Vault Codes',
    narrative:
      'The vault override needs exactly two keycards whose codes add up to the target value. ' +
      'Return the positions of the two cards. Exactly one pair works.',
    functionName: { python: 'crack_vault', javascript: 'crackVault' },
    starterCode: {
      python: 'def crack_vault(codes, target):\n    # codes: list[int], target: int\n    # return the two positions as a list, e.g. [0, 1]\n    pass\n',
      javascript: 'function crackVault(codes, target) {\n  // codes: number[], target: number\n  // return the two positions as an array, e.g. [0, 1]\n}\n',
    },
    comparison: 'unordered',
    sampleTests: [
      { input: [[2, 7, 11, 15], 9], expected: [0, 1] },
      { input: [[3, 2, 4], 6], expected: [1, 2] },
    ],
    hiddenTests: [
      { input: [[3, 3], 6], expected: [0, 1] },
      { input: [[-1, -2, -3, -4, -5], -8], expected: [2, 4] },
      { input: [[0, 4, 3, 0], 0], expected: [0, 3] },
      { input: [[1, 5, 9, 13], 22], expected: [2, 3] },
      { input: [[-3, 4, 3, 90], 0], expected: [0, 2] },
      { input: [[2, 5, 5, 11], 10], expected: [1, 2] },
      { input: [[1, 2], 3], expected: [0, 1] },
      { input: [[10, 20, 30, 40, 50], 90], expected: [3, 4] },
    ],
  },
  {
    id: 'laser-grid',
    title: 'Disarm the Laser Grid',
    narrative:
      'The grid controller accepts a string of brackets. It disarms only if every bracket is ' +
      'closed by the matching type, in the right order. Return true if the sequence disarms it.',
    functionName: { python: 'disarm', javascript: 'disarm' },
    starterCode: {
      python: 'def disarm(grid):\n    # grid: str of ()[]{}\n    # return True or False\n    pass\n',
      javascript: 'function disarm(grid) {\n  // grid: string of ()[]{}\n  // return true or false\n}\n',
    },
    comparison: 'exact',
    sampleTests: [
      { input: ['()'], expected: true },
      { input: ['(]'], expected: false },
    ],
    hiddenTests: [
      { input: ['()[]{}'], expected: true },
      { input: ['([)]'], expected: false },
      { input: ['{[]}'], expected: true },
      { input: [''], expected: true },
      { input: ['('], expected: false },
      { input: [')'], expected: false },
      { input: ['(((('], expected: false },
      { input: ['{[()]}'], expected: true },
      { input: [']'], expected: false },
      { input: ['([{}])()'], expected: true },
    ],
  },
  {
    id: 'getaway-route',
    title: 'Trace the Getaway Route',
    narrative:
      'The alley has n checkpoints. From any checkpoint the driver can jump ahead one or two. ' +
      'Count the distinct routes that reach checkpoint n exactly.',
    functionName: { python: 'count_routes', javascript: 'countRoutes' },
    starterCode: {
      python: 'def count_routes(n):\n    # n: int, number of checkpoints\n    # return the number of distinct routes\n    pass\n',
      javascript: 'function countRoutes(n) {\n  // n: number of checkpoints\n  // return the number of distinct routes\n}\n',
    },
    comparison: 'exact',
    sampleTests: [
      { input: [2], expected: 2 },
      { input: [3], expected: 3 },
    ],
    hiddenTests: [
      { input: [1], expected: 1 },
      { input: [4], expected: 5 },
      { input: [5], expected: 8 },
      { input: [10], expected: 89 },
      { input: [20], expected: 10946 },
      { input: [30], expected: 1346269 },
      { input: [40], expected: 165580141 },
      { input: [45], expected: 1836311903 },
    ],
  },
  {
    id: 'inside-job',
    title: 'Spot the Inside Job',
    narrative:
      'Guard coverage is logged hour by hour. Pick one hour to slip in and a later hour to slip ' +
      'out, maximising the drop in coverage. Return the largest possible drop, or 0 if coverage never drops.',
    functionName: { python: 'best_window', javascript: 'bestWindow' },
    starterCode: {
      python: 'def best_window(coverage):\n    # coverage: list[int] of guard counts per hour\n    # return the largest later-minus-earlier drop, or 0\n    pass\n',
      javascript: 'function bestWindow(coverage) {\n  // coverage: number[] of guard counts per hour\n  // return the largest later-minus-earlier drop, or 0\n}\n',
    },
    comparison: 'exact',
    sampleTests: [
      { input: [[7, 1, 5, 3, 6, 4]], expected: 5 },
      { input: [[7, 6, 4, 3, 1]], expected: 0 },
    ],
    hiddenTests: [
      { input: [[1, 2]], expected: 1 },
      { input: [[2, 1]], expected: 0 },
      { input: [[1]], expected: 0 },
      { input: [[]], expected: 0 },
      { input: [[3, 3, 3]], expected: 0 },
      { input: [[2, 4, 1]], expected: 2 },
      { input: [[1, 2, 3, 4, 5]], expected: 4 },
      { input: [[5, 1, 6, 2, 8]], expected: 7 },
    ],
  },
];

/** Rounds are 1-indexed. The fourth problem is the spare. */
export function problemForRound(round: number): Problem {
  const p = PROBLEMS[round - 1];
  if (!p) throw new Error(`no problem for round ${round}`);
  return p;
}
```

- [ ] **Step 2: Write the failing validation test**

`apps/server/src/exec/problems.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { BALANCE, PROBLEMS, problemForRound, type Language } from '@heist/shared';
import { execute } from './runner.js';

/** Reference solutions, keyed by problem id. Never shipped to clients. */
const REFERENCE: Record<string, Record<Language, string>> = {
  'vault-codes': {
    python: `def crack_vault(codes, target):
    seen = {}
    for i, code in enumerate(codes):
        if target - code in seen:
            return [seen[target - code], i]
        seen[code] = i
    return []
`,
    javascript: `function crackVault(codes, target) {
  const seen = new Map();
  for (let i = 0; i < codes.length; i++) {
    if (seen.has(target - codes[i])) return [seen.get(target - codes[i]), i];
    seen.set(codes[i], i);
  }
  return [];
}
`,
  },
  'laser-grid': {
    python: `def disarm(grid):
    pairs = {")": "(", "]": "[", "}": "{"}
    stack = []
    for ch in grid:
        if ch in "([{":
            stack.append(ch)
        elif ch in pairs:
            if not stack or stack.pop() != pairs[ch]:
                return False
    return not stack
`,
    javascript: `function disarm(grid) {
  const pairs = { ')': '(', ']': '[', '}': '{' };
  const stack = [];
  for (const ch of grid) {
    if ('([{'.includes(ch)) stack.push(ch);
    else if (pairs[ch]) { if (stack.pop() !== pairs[ch]) return false; }
  }
  return stack.length === 0;
}
`,
  },
  'getaway-route': {
    python: `def count_routes(n):
    a, b = 1, 1
    for _ in range(n - 1):
        a, b = b, a + b
    return b
`,
    javascript: `function countRoutes(n) {
  let a = 1, b = 1;
  for (let i = 0; i < n - 1; i++) { const next = a + b; a = b; b = next; }
  return b;
}
`,
  },
  'inside-job': {
    python: `def best_window(coverage):
    best = 0
    low = None
    for value in coverage:
        if low is None or value < low:
            low = value
        elif value - low > best:
            best = value - low
    return best
`,
    javascript: `function bestWindow(coverage) {
  let best = 0;
  let low = Infinity;
  for (const value of coverage) {
    if (value < low) low = value;
    else if (value - low > best) best = value - low;
  }
  return best;
}
`,
  },
};

describe('problem set shape', () => {
  it('has one problem per round plus a spare', () => {
    expect(PROBLEMS).toHaveLength(BALANCE.TOTAL_ROUNDS + 1);
  });

  it('gives every round a problem', () => {
    for (let r = 1; r <= BALANCE.TOTAL_ROUNDS; r += 1) {
      expect(problemForRound(r).id).toBeTruthy();
    }
  });

  it('has unique ids', () => {
    expect(new Set(PROBLEMS.map((p) => p.id)).size).toBe(PROBLEMS.length);
  });

  it('gives every problem at least 8 hidden tests and 2 samples', () => {
    for (const p of PROBLEMS) {
      expect(p.hiddenTests.length).toBeGreaterThanOrEqual(8);
      expect(p.sampleTests.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('has starter code that names the function for both languages', () => {
    for (const p of PROBLEMS) {
      expect(p.starterCode.python).toContain(p.functionName.python);
      expect(p.starterCode.javascript).toContain(p.functionName.javascript);
    }
  });
});

describe('every expected value is correct', () => {
  for (const problem of PROBLEMS) {
    for (const language of ['python', 'javascript'] as Language[]) {
      it(`${problem.id} / ${language}: reference solution passes all tests`, async () => {
        const out = await execute({
          language,
          code: REFERENCE[problem.id]![language],
          functionName: problem.functionName[language],
          tests: [...problem.sampleTests, ...problem.hiddenTests],
          comparison: problem.comparison,
        });
        const failures = out.results
          .filter((r) => !r.pass)
          .map((r) => `#${r.i} got ${JSON.stringify(r.actual)} err=${r.error ?? 'none'}`);
        expect(failures, failures.join('; ')).toEqual([]);
      }, 20_000);
    }
  }
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run apps/server/src/exec/problems.test.ts`
Expected: FAIL — `PROBLEMS` is still the empty array from Task 1, so the length assertions fail.

- [ ] **Step 4: Verify after writing the data**

Having written the data in Step 1, run again.

Run: `npx vitest run apps/server/src/exec/problems.test.ts`
Expected: PASS, 13 tests. If a reference solution disagrees with an `expected` value, the failure message names the index and the actual value — fix the `expected` value, not the reference solution.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/problems.ts apps/server/src/exec/problems.test.ts
git commit -m "feat: four heist problems with reference-validated test cases"
```

---

### Task 9: Match engine — players, phases, submit lock

Spec §6. **Review Focus item 3** lives here: a double submit must be rejected without disturbing the first.

The engine is driven by an explicit `tick(now)` rather than per-match `setTimeout`s. One interval in Task 11 ticks every match. This makes every transition testable without fake timers, and means there are no timers to leak or to lose across a reconnect.

This task takes the match as far as `JUDGING` and stops there. Task 10 adds round resolution and the rest of the cycle.

**Files:**
- Create: `apps/server/src/match/engine.ts`
- Test: `apps/server/src/match/engine.test.ts`

**Interfaces:**
- Consumes: `BALANCE`, `phaseDurations`, `toPublicProblem`, `problemForRound`, types from `@heist/shared`; `EffectPlayer`, `resetRound`, `pruneEffects`, `hasActiveEffect` (Task 3); `execute` (Task 6); `judgeStyle` (Task 7).
- Produces:
  - `type EngineDeps = { now: () => number; emit: (playerId: string, ev: string, payload: unknown) => void; execute: typeof execute; judgeStyle: typeof judgeStyle; fast: boolean }`
  - `type ServerPlayer` (see Step 3)
  - `class MatchEngine` with `roomCode`, `phase`, `round`, `deadlineAt`, `players`, and methods `addPlayer`, `setConnected`, `syncCode`, `submit`, `snapshotFor`, `tick`, `isEmpty`.

  Task 10 adds `usePowerup`, `chooseOffer` and round resolution. Task 11 constructs the engine and calls `tick`.

- [ ] **Step 1: Write the failing test**

`apps/server/src/match/engine.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { BALANCE, FAST_MATCH_PHASE_MS, type MatchSnapshot } from '@heist/shared';
import { MatchEngine, type EngineDeps } from './engine.js';

const T0 = 1_000_000;

function harness() {
  let clock = T0;
  const emitted: { to: string; ev: string; payload: unknown }[] = [];
  const deps: EngineDeps = {
    now: () => clock,
    emit: (to, ev, payload) => emitted.push({ to, ev, payload }),
    execute: async () => ({ results: [], stdout: '', stderr: '', timedOut: false, passed: 0 }),
    judgeStyle: async () => ({
      naming: 0, readability: 0, comments: 0, organization: 0, simplicity: 0, note: '',
    }),
    fast: true,
  };
  const engine = new MatchEngine('ABC123', deps);
  return {
    engine,
    emitted,
    advance: (ms: number) => { clock += ms; },
    at: () => clock,
    snapshots: (playerId: string) =>
      emitted.filter((e) => e.ev === 'snapshot' && e.to === playerId).map((e) => e.payload as MatchSnapshot),
  };
}

describe('joining', () => {
  it('starts in LOBBY with no deadline', () => {
    const { engine } = harness();
    expect(engine.phase).toBe('LOBBY');
    expect(engine.deadlineAt).toBeNull();
  });

  it('stays in LOBBY with one player', () => {
    const { engine } = harness();
    engine.addPlayer('Danny');
    expect(engine.phase).toBe('LOBBY');
    expect(engine.players).toHaveLength(1);
  });

  it('assigns one cop and one robber when the second player joins', () => {
    const { engine } = harness();
    engine.addPlayer('Danny');
    engine.addPlayer('Rusty');
    expect(engine.phase).toBe('ROLE_REVEAL');
    expect(engine.players.map((p) => p.role).sort()).toEqual(['COP', 'ROBBER']);
  });

  it('places the cop and robber on their starting tiles', () => {
    const { engine } = harness();
    engine.addPlayer('Danny');
    engine.addPlayer('Rusty');
    const cop = engine.players.find((p) => p.role === 'COP')!;
    const robber = engine.players.find((p) => p.role === 'ROBBER')!;
    expect(cop.position).toBe(BALANCE.COP_START);
    expect(robber.position).toBe(BALANCE.ROBBER_START);
  });

  it('refuses a third player', () => {
    const { engine } = harness();
    engine.addPlayer('Danny');
    engine.addPlayer('Rusty');
    expect(engine.addPlayer('Linus')).toEqual({ ok: false, error: 'MATCH_FULL' });
  });
});

describe('phase progression', () => {
  function started() {
    const h = harness();
    const a = h.engine.addPlayer('Danny');
    const b = h.engine.addPlayer('Rusty');
    if (!a.ok || !b.ok) throw new Error('setup failed');
    return { ...h, aId: a.data.playerId, bId: b.data.playerId };
  }

  it('sets a deadline on ROLE_REVEAL', () => {
    const { engine, at } = started();
    expect(engine.deadlineAt).toBe(at() + FAST_MATCH_PHASE_MS.ROLE_REVEAL);
  });

  it('does not advance before the deadline', async () => {
    const { engine, advance, at } = started();
    advance(FAST_MATCH_PHASE_MS.ROLE_REVEAL - 1);
    await engine.tick(at());
    expect(engine.phase).toBe('ROLE_REVEAL');
  });

  it('advances to ROUND_INTRO and opens round 1', async () => {
    const { engine, advance, at } = started();
    advance(FAST_MATCH_PHASE_MS.ROLE_REVEAL);
    await engine.tick(at());
    expect(engine.phase).toBe('ROUND_INTRO');
    expect(engine.round).toBe(1);
  });

  it('reveals the round problem without its hidden tests', async () => {
    const { engine, advance, at, aId } = started();
    advance(FAST_MATCH_PHASE_MS.ROLE_REVEAL);
    await engine.tick(at());
    const snap = engine.snapshotFor(aId);
    expect(snap.problem?.id).toBe('vault-codes');
    expect('hiddenTests' in (snap.problem as object)).toBe(false);
  });

  it('advances to CODING with the coding deadline', async () => {
    const { engine, advance, at } = started();
    advance(FAST_MATCH_PHASE_MS.ROLE_REVEAL);
    await engine.tick(at());
    advance(FAST_MATCH_PHASE_MS.ROUND_INTRO);
    await engine.tick(at());
    expect(engine.phase).toBe('CODING');
    expect(engine.deadlineAt).toBe(at() + FAST_MATCH_PHASE_MS.CODING);
  });
});

describe('submitting', () => {
  async function coding() {
    const h = harness();
    const a = h.engine.addPlayer('Danny');
    const b = h.engine.addPlayer('Rusty');
    if (!a.ok || !b.ok) throw new Error('setup failed');
    h.advance(FAST_MATCH_PHASE_MS.ROLE_REVEAL);
    await h.engine.tick(h.at());
    h.advance(FAST_MATCH_PHASE_MS.ROUND_INTRO);
    await h.engine.tick(h.at());
    return { ...h, aId: a.data.playerId, bId: b.data.playerId };
  }

  it('accepts a submission during CODING', async () => {
    const { engine, aId } = await coding();
    expect(engine.submit(aId, 'print(1)', 'python')).toEqual({ ok: true, data: { ok: true } });
    expect(engine.players.find((p) => p.id === aId)!.submission?.code).toBe('print(1)');
  });

  it('REVIEW FOCUS 3: rejects a second submission and keeps the first', async () => {
    const { engine, aId } = await coding();
    engine.submit(aId, 'first', 'python');
    const second = engine.submit(aId, 'second', 'python');
    expect(second).toEqual({ ok: false, error: 'ALREADY_SUBMITTED' });
    const p = engine.players.find((x) => x.id === aId)!;
    expect(p.submission?.code).toBe('first');
  });

  it('rejects a submission outside CODING', async () => {
    const { engine, aId } = await coding();
    engine.submit(aId, 'a', 'python');
    engine.submit(engine.players[1]!.id, 'b', 'python');
    // both submitted -> engine left CODING
    expect(engine.phase).toBe('JUDGING');
    expect(engine.submit(aId, 'c', 'python')).toEqual({ ok: false, error: 'WRONG_PHASE' });
  });

  it('leaves CODING as soon as both have submitted', async () => {
    const { engine, aId, bId } = await coding();
    engine.submit(aId, 'a', 'python');
    expect(engine.phase).toBe('CODING');
    engine.submit(bId, 'b', 'python');
    expect(engine.phase).toBe('JUDGING');
  });

  it('records server receipt order for the speed bonus', async () => {
    const { engine, aId, bId, advance, at } = await coding();
    engine.submit(bId, 'b', 'python');
    advance(500);
    engine.submit(aId, 'a', 'python');
    const b = engine.players.find((p) => p.id === bId)!;
    const a = engine.players.find((p) => p.id === aId)!;
    expect(b.submission!.at).toBeLessThan(a.submission!.at);
    expect(at()).toBeGreaterThan(T0);
  });
});

describe('auto-submit on deadline', () => {
  it('submits the last synced buffer for a player who never submitted', async () => {
    const h = harness();
    const a = h.engine.addPlayer('Danny');
    const b = h.engine.addPlayer('Rusty');
    if (!a.ok || !b.ok) throw new Error('setup failed');
    h.advance(FAST_MATCH_PHASE_MS.ROLE_REVEAL);
    await h.engine.tick(h.at());
    h.advance(FAST_MATCH_PHASE_MS.ROUND_INTRO);
    await h.engine.tick(h.at());

    h.engine.syncCode(a.data.playerId, 'half written code', 'python');
    h.advance(FAST_MATCH_PHASE_MS.CODING);
    await h.engine.tick(h.at());

    expect(h.engine.phase).toBe('JUDGING');
    const player = h.engine.players.find((p) => p.id === a.data.playerId)!;
    expect(player.submission?.code).toBe('half written code');
  });

  it('submits empty code when nothing was ever synced', async () => {
    const h = harness();
    const a = h.engine.addPlayer('Danny');
    const b = h.engine.addPlayer('Rusty');
    if (!a.ok || !b.ok) throw new Error('setup failed');
    h.advance(FAST_MATCH_PHASE_MS.ROLE_REVEAL);
    await h.engine.tick(h.at());
    h.advance(FAST_MATCH_PHASE_MS.ROUND_INTRO);
    await h.engine.tick(h.at());
    h.advance(FAST_MATCH_PHASE_MS.CODING);
    await h.engine.tick(h.at());

    expect(h.engine.players.every((p) => p.submission !== null)).toBe(true);
  });

  it('ignores a code_sync outside CODING', async () => {
    const h = harness();
    const a = h.engine.addPlayer('Danny');
    h.engine.addPlayer('Rusty');
    if (!a.ok) throw new Error('setup failed');
    h.engine.syncCode(a.data.playerId, 'too early', 'python');
    expect(h.engine.players.find((p) => p.id === a.data.playerId)!.buffer.code).toBe('');
  });
});

describe('disconnect handling', () => {
  it('marks a player disconnected and notifies the opponent with a grace deadline', () => {
    const h = harness();
    const a = h.engine.addPlayer('Danny');
    const b = h.engine.addPlayer('Rusty');
    if (!a.ok || !b.ok) throw new Error('setup failed');
    h.engine.setConnected(a.data.playerId, false);
    const notice = h.emitted.find((e) => e.ev === 'opponent_disconnected' && e.to === b.data.playerId);
    expect(notice).toBeDefined();
    expect((notice!.payload as { graceUntil: number }).graceUntil)
      .toBe(h.at() + BALANCE.RECONNECT_GRACE_MS);
  });

  it('reports the match empty only after both have been gone past the destroy window', () => {
    const h = harness();
    const a = h.engine.addPlayer('Danny');
    const b = h.engine.addPlayer('Rusty');
    if (!a.ok || !b.ok) throw new Error('setup failed');
    h.engine.setConnected(a.data.playerId, false);
    h.engine.setConnected(b.data.playerId, false);
    h.advance(BALANCE.MATCH_DESTROY_MS - 1);
    expect(h.engine.isEmpty(h.at())).toBe(false);
    h.advance(2);
    expect(h.engine.isEmpty(h.at())).toBe(true);
  });

  it('is not empty while one player is still connected', () => {
    const h = harness();
    const a = h.engine.addPlayer('Danny');
    h.engine.addPlayer('Rusty');
    if (!a.ok) throw new Error('setup failed');
    h.engine.setConnected(a.data.playerId, false);
    h.advance(BALANCE.MATCH_DESTROY_MS * 2);
    expect(h.engine.isEmpty(h.at())).toBe(false);
  });
});

describe('snapshot projection', () => {
  it('hides opponent progress while a smoke bomb is active and shows the player their own', async () => {
    const h = harness();
    const a = h.engine.addPlayer('Danny');
    const b = h.engine.addPlayer('Rusty');
    if (!a.ok || !b.ok) throw new Error('setup failed');
    h.advance(FAST_MATCH_PHASE_MS.ROLE_REVEAL);
    await h.engine.tick(h.at());
    h.advance(FAST_MATCH_PHASE_MS.ROUND_INTRO);
    await h.engine.tick(h.at());

    const self = h.engine.players.find((p) => p.id === a.data.playerId)!;
    self.progress = 4;
    self.activeEffects.push({ type: 'SMOKE_BOMB', expiresAt: h.at() + 10_000 });

    const own = h.engine.snapshotFor(a.data.playerId);
    expect(own.players.find((p) => p.id === a.data.playerId)!.progress).toBe(4);

    const opponentView = h.engine.snapshotFor(b.data.playerId);
    expect(opponentView.players.find((p) => p.id === a.data.playerId)!.progress).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run apps/server/src/match/engine.test.ts`
Expected: FAIL — `Cannot find module './engine.js'`

- [ ] **Step 3: Write the implementation**

`apps/server/src/match/engine.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run apps/server/src/match/engine.test.ts`
Expected: PASS, 21 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/match/engine.ts apps/server/src/match/engine.test.ts
git commit -m "feat: match engine with phase clock, submit lock and auto-submit"
```

---

### Task 10: Round resolution — judging, scoring, awards, movement, win

Spec §6, §8, §9. Completes the phase cycle: `JUDGING -> SCORING -> POWERUP -> MOVEMENT -> next round or GAME_OVER`. Adds the `JUDGING` hard cap and power-up use.

**Files:**
- Modify: `apps/server/src/match/engine.ts`
- Create: `apps/server/src/match/engine.round.test.ts`

**Interfaces:**
- Consumes: everything from Task 9, plus `scoreSubmission`, `tilesForScore`, `finalTiles`, `advance`, `checkWin`, `rubricTotal` (Task 2); `applyEffect`, `awardPowerup`, `isUsableInPhase`, `randomPowerup`, `sumModifiers` (Tasks 3-4).
- Produces: `MatchEngine.usePowerup(playerId, type): Result<{ blocked: boolean }>`, `MatchEngine.chooseOffer(playerId, type): Result<{ ok: true }>`, `MatchEngine.canRun(playerId, now): Result<{ ok: true }>`. Task 11 calls all three.

- [ ] **Step 1: Write the failing test**

`apps/server/src/match/engine.round.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { BALANCE, FAST_MATCH_PHASE_MS, type TestResult } from '@heist/shared';
import { MatchEngine, type EngineDeps, type ServerPlayer } from './engine.js';

const T0 = 2_000_000;

type Scripted = { passed: number; total: number; rubric: number };

/** The script is keyed by the submitted code string, so a submission picks its own outcome. */
function harness(script: Record<string, Scripted>, opts: { stall?: boolean } = {}) {
  let clock = T0;
  const emitted: { to: string; ev: string; payload: unknown }[] = [];
  const lookup = (code: string): Scripted => script[code] ?? { passed: 0, total: 10, rubric: 0 };

  const deps: EngineDeps = {
    now: () => clock,
    emit: (to, ev, payload) => emitted.push({ to, ev, payload }),
    execute: async (o) => {
      if (opts.stall) await new Promise(() => {});
      const s = lookup(o.code);
      const results: TestResult[] = Array.from({ length: s.total }, (_, i) => ({
        i, pass: i < s.passed, ms: 1,
      }));
      return { results, stdout: '', stderr: '', timedOut: false, passed: s.passed };
    },
    // Spreads the scripted rubric total across the five criteria, largest first.
    judgeStyle: async (code) => {
      let left = lookup(code).rubric;
      const take = (max: number) => { const v = Math.min(max, left); left -= v; return v; };
      return {
        naming: take(5), readability: take(5), comments: take(4),
        organization: take(3), simplicity: take(3), note: '',
      };
    },
    fast: true,
  };

  const engine = new MatchEngine('RND001', deps);
  return {
    engine, emitted, deps,
    advance: (ms: number) => { clock += ms; },
    at: () => clock,
  };
}

/** Drives a fresh match to CODING in round 1. */
async function toCoding(h: ReturnType<typeof harness>) {
  const a = h.engine.addPlayer('Danny');
  const b = h.engine.addPlayer('Rusty');
  if (!a.ok || !b.ok) throw new Error('setup failed');
  h.advance(FAST_MATCH_PHASE_MS.ROLE_REVEAL);
  await h.engine.tick(h.at());
  h.advance(FAST_MATCH_PHASE_MS.ROUND_INTRO);
  await h.engine.tick(h.at());
  return { aId: a.data.playerId, bId: b.data.playerId };
}

describe('judging and scoring', () => {
  it('scores both players and emits round_result', async () => {
    const h = harness({ 'code-A': { passed: 10, total: 10, rubric: 20 }, 'code-B': { passed: 5, total: 10, rubric: 20 } });
    const { aId, bId } = await toCoding(h);

    h.engine.submit(aId, 'code-A', 'python');
    h.engine.submit(bId, 'code-B', 'python');
    await h.engine.settleJudging();

    expect(h.engine.phase).toBe('SCORING');
    const a = h.engine.players.find((p) => p.id === aId)!;
    const b = h.engine.players.find((p) => p.id === bId)!;
    expect(a.lastScore!.passed).toBe(10);
    expect(a.lastScore!.correctness).toBe(80);
    expect(b.lastScore!.correctness).toBe(40);
    expect(h.emitted.some((e) => e.ev === 'round_result')).toBe(true);
  });

  it('awards the speed bonus to the earlier of two perfect submissions', async () => {
    const h = harness({ 'code-A': { passed: 10, total: 10, rubric: 0 }, 'code-B': { passed: 10, total: 10, rubric: 0 } });
    const { aId, bId } = await toCoding(h);

    h.engine.submit(bId, 'code-B', 'python');
    h.advance(1_000);
    h.engine.submit(aId, 'code-A', 'python');
    await h.engine.settleJudging();

    const a = h.engine.players.find((p) => p.id === aId)!;
    const b = h.engine.players.find((p) => p.id === bId)!;
    expect(b.lastScore!.speedBonus).toBe(BALANCE.SPEED_BONUS_TILES);
    expect(a.lastScore!.speedBonus).toBe(0);
  });

  it('awards no speed bonus when nobody is perfect', async () => {
    const h = harness({ 'code-A': { passed: 9, total: 10, rubric: 0 }, 'code-B': { passed: 9, total: 10, rubric: 0 } });
    const { aId, bId } = await toCoding(h);
    h.engine.submit(aId, 'code-A', 'python');
    h.engine.submit(bId, 'code-B', 'python');
    await h.engine.settleJudging();
    expect(h.engine.players.every((p) => p.lastScore!.speedBonus === 0)).toBe(true);
  });

  it('advances past the JUDGING hard cap even when the executor never returns', async () => {
    const h = harness({}, { stall: true });
    const { aId, bId } = await toCoding(h);
    h.engine.submit(aId, 'a', 'python');
    h.engine.submit(bId, 'b', 'python');
    expect(h.engine.phase).toBe('JUDGING');

    h.advance(BALANCE.PHASE_MS.JUDGING);
    await h.engine.tick(h.at());

    expect(h.engine.phase).toBe('SCORING');
    expect(h.engine.players.every((p) => p.lastScore !== null)).toBe(true);
    expect(h.engine.players.every((p) => p.lastScore!.passed === 0)).toBe(true);
  });
});

describe('power-up use', () => {
  async function codingWith(inv: Partial<Record<'a' | 'b', ServerPlayer['inventory']>>) {
    const h = harness({ 'code-A': { passed: 0, total: 10, rubric: 0 }, 'code-B': { passed: 0, total: 10, rubric: 0 } });
    const { aId, bId } = await toCoding(h);
    if (inv.a) h.engine.players.find((p) => p.id === aId)!.inventory = [...inv.a];
    if (inv.b) h.engine.players.find((p) => p.id === bId)!.inventory = [...inv.b];
    return { h, aId, bId };
  }

  it('applies EMP to the opponent and emits effect_applied', async () => {
    const { h, aId, bId } = await codingWith({ a: ['EMP'] });
    const r = h.engine.usePowerup(aId, 'EMP');
    expect(r).toEqual({ ok: true, data: { blocked: false } });
    const b = h.engine.players.find((p) => p.id === bId)!;
    expect(b.activeEffects.map((e) => e.type)).toEqual(['EMP']);
    expect(h.emitted.some((e) => e.ev === 'effect_applied')).toBe(true);
  });

  it('REVIEW FOCUS 4 reprise: rejects a modifier during CODING without consuming it', async () => {
    const { h, aId } = await codingWith({ a: ['ROADBLOCK'] });
    expect(h.engine.usePowerup(aId, 'ROADBLOCK')).toEqual({ ok: false, error: 'WRONG_PHASE' });
    expect(h.engine.players.find((p) => p.id === aId)!.inventory).toContain('ROADBLOCK');
  });

  it('reports a shield block and emits effect_blocked', async () => {
    const { h, aId, bId } = await codingWith({ a: ['BLACKOUT'] });
    h.engine.players.find((p) => p.id === bId)!.shielded = true;
    expect(h.engine.usePowerup(aId, 'BLACKOUT')).toEqual({ ok: true, data: { blocked: true } });
    expect(h.emitted.some((e) => e.ev === 'effect_blocked')).toBe(true);
  });

  it('keeps a smoke bomb active through judging and the score reveal', async () => {
    const { h, aId } = await codingWith({ a: ['SMOKE_BOMB'] });
    expect(h.engine.usePowerup(aId, 'SMOKE_BOMB').ok).toBe(true);
    const codingDeadline = h.engine.deadlineAt!;
    const a = h.engine.players.find((p) => p.id === aId)!;
    const expiry = a.activeEffects.find((e) => e.type === 'SMOKE_BOMB')!.expiresAt;
    // Must outlast CODING, because progress only streams once judging starts.
    expect(expiry).toBeGreaterThan(codingDeadline + FAST_MATCH_PHASE_MS.JUDGING);
  });

  it('blocks a Run while EMP is active and allows it otherwise', async () => {
    const { h, aId, bId } = await codingWith({ a: ['EMP'] });
    h.engine.usePowerup(aId, 'EMP');
    expect(h.engine.canRun(bId, h.at())).toEqual({ ok: false, error: 'EMP_ACTIVE' });
    expect(h.engine.canRun(aId, h.at())).toEqual({ ok: true, data: { ok: true } });
  });

  it('enforces the run cooldown', async () => {
    const { h, aId } = await codingWith({});
    expect(h.engine.canRun(aId, h.at()).ok).toBe(true);
    expect(h.engine.canRun(aId, h.at())).toEqual({ ok: false, error: 'COOLDOWN' });
    h.advance(BALANCE.RUN_COOLDOWN_MS + 1);
    expect(h.engine.canRun(aId, h.at()).ok).toBe(true);
  });
});

describe('movement and win conditions', () => {
  /** Runs one full round with a scripted outcome and returns positions after MOVEMENT. */
  async function playRound(h: ReturnType<typeof harness>, aId: string, bId: string) {
    h.engine.submit(aId, 'code-A', 'python');
    h.engine.submit(bId, 'code-B', 'python');
    await h.engine.settleJudging();
    h.advance(FAST_MATCH_PHASE_MS.SCORING);
    await h.engine.tick(h.at());
    expect(h.engine.phase).toBe('POWERUP');
    h.advance(FAST_MATCH_PHASE_MS.POWERUP);
    await h.engine.tick(h.at());
    expect(h.engine.phase).toBe('MOVEMENT');
    h.advance(FAST_MATCH_PHASE_MS.MOVEMENT);
    await h.engine.tick(h.at());
  }

  it('moves both players by their bracket and starts the next round', async () => {
    const h = harness({ 'code-A': { passed: 10, total: 10, rubric: 0 }, 'code-B': { passed: 10, total: 10, rubric: 0 } });
    const { aId, bId } = await toCoding(h);
    const cop = h.engine.players.find((p) => p.role === 'COP')!;
    const robber = h.engine.players.find((p) => p.role === 'ROBBER')!;

    await playRound(h, aId, bId);

    // correctness 80 + style 0 = 80 -> 4 tiles; the earlier submitter also gets +1
    expect(cop.position).toBeGreaterThan(BALANCE.COP_START);
    expect(robber.position).toBeGreaterThan(BALANCE.ROBBER_START);
    expect(h.engine.round).toBe(2);
    expect(h.engine.phase).toBe('ROUND_INTRO');
  });

  it('ends the match when the cop catches the robber', async () => {
    const h = harness({ 'code-A': { passed: 10, total: 10, rubric: 20 }, 'code-B': { passed: 0, total: 10, rubric: 0 } });
    await toCoding(h);
    const cop = h.engine.players.find((p) => p.role === 'COP')!;
    const robber = h.engine.players.find((p) => p.role === 'ROBBER')!;
    cop.position = 6;
    robber.position = 7;
    h.engine.submit(cop.id, 'code-A', 'python');
    h.engine.submit(robber.id, 'code-B', 'python');
    await h.engine.settleJudging();
    h.advance(FAST_MATCH_PHASE_MS.SCORING);
    await h.engine.tick(h.at());
    h.advance(FAST_MATCH_PHASE_MS.POWERUP);
    await h.engine.tick(h.at());
    h.advance(FAST_MATCH_PHASE_MS.MOVEMENT);
    await h.engine.tick(h.at());

    expect(h.engine.phase).toBe('GAME_OVER');
    expect(h.engine.winner).toEqual({ role: 'COP', reason: 'CAUGHT' });
    expect(h.emitted.some((e) => e.ev === 'game_over')).toBe(true);
  });

  it('ends the match when the robber reaches the escape tile', async () => {
    const h = harness({ 'code-A': { passed: 10, total: 10, rubric: 20 }, 'code-B': { passed: 10, total: 10, rubric: 20 } });
    await toCoding(h);
    const cop = h.engine.players.find((p) => p.role === 'COP')!;
    const robber = h.engine.players.find((p) => p.role === 'ROBBER')!;
    cop.position = 2;
    robber.position = 12;
    h.engine.submit(cop.id, 'code-A', 'python');
    h.engine.submit(robber.id, 'code-B', 'python');
    await h.engine.settleJudging();
    h.advance(FAST_MATCH_PHASE_MS.SCORING);
    await h.engine.tick(h.at());
    h.advance(FAST_MATCH_PHASE_MS.POWERUP);
    await h.engine.tick(h.at());
    h.advance(FAST_MATCH_PHASE_MS.MOVEMENT);
    await h.engine.tick(h.at());

    expect(h.engine.winner).toEqual({ role: 'ROBBER', reason: 'ESCAPED' });
  });

  it('applies a roadblock played during POWERUP to the opponent movement', async () => {
    const h = harness({ 'code-A': { passed: 10, total: 10, rubric: 0 }, 'code-B': { passed: 10, total: 10, rubric: 0 } });
    const { aId, bId } = await toCoding(h);
    h.engine.submit(aId, 'code-A', 'python');
    h.engine.submit(bId, 'code-B', 'python');
    await h.engine.settleJudging();
    h.advance(FAST_MATCH_PHASE_MS.SCORING);
    await h.engine.tick(h.at());

    const a = h.engine.players.find((p) => p.id === aId)!;
    const b = h.engine.players.find((p) => p.id === bId)!;
    a.inventory = ['ROADBLOCK'];
    const before = b.position;
    expect(h.engine.usePowerup(aId, 'ROADBLOCK').ok).toBe(true);

    h.advance(FAST_MATCH_PHASE_MS.POWERUP);
    await h.engine.tick(h.at());
    h.advance(FAST_MATCH_PHASE_MS.MOVEMENT);
    await h.engine.tick(h.at());

    expect(b.lastScore!.modifierDelta).toBe(-1);
    expect(b.position - before).toBe(b.lastScore!.tiles);
  });

  it('auto-selects an offered power-up when the player does not choose', async () => {
    const h = harness({ 'code-A': { passed: 10, total: 10, rubric: 20 }, 'code-B': { passed: 1, total: 10, rubric: 0 } });
    const { aId, bId } = await toCoding(h);
    h.engine.submit(aId, 'code-A', 'python');
    h.engine.submit(bId, 'code-B', 'python');
    await h.engine.settleJudging();
    h.advance(FAST_MATCH_PHASE_MS.SCORING);
    await h.engine.tick(h.at());

    const a = h.engine.players.find((p) => p.id === aId)!;
    expect(a.offer).toHaveLength(2);
    expect(h.emitted.some((e) => e.ev === 'powerup_offer' && e.to === aId)).toBe(true);

    h.advance(FAST_MATCH_PHASE_MS.POWERUP);
    await h.engine.tick(h.at());
    expect(a.inventory.length + (a.shielded ? 1 : 0)).toBeGreaterThan(0);
    expect(a.offer).toBeNull();
  });

  it('awards a power-up for a perfect round', async () => {
    const h = harness({ 'code-A': { passed: 10, total: 10, rubric: 0 }, 'code-B': { passed: 0, total: 10, rubric: 0 } });
    const { aId, bId } = await toCoding(h);
    h.engine.submit(aId, 'code-A', 'python');
    h.engine.submit(bId, 'code-B', 'python');
    await h.engine.settleJudging();
    h.advance(FAST_MATCH_PHASE_MS.SCORING);
    await h.engine.tick(h.at());
    const a = h.engine.players.find((p) => p.id === aId)!;
    expect(a.inventory.length + (a.shielded ? 1 : 0)).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run apps/server/src/match/engine.round.test.ts`
Expected: FAIL — `engine.settleJudging is not a function`

- [ ] **Step 3: Extend the engine**

In `apps/server/src/match/engine.ts`, extend the imports:

```ts
import {
  applyEffect, awardPowerup, EFFECTS, hasActiveEffect, isUsableInPhase,
  pruneEffects, randomPowerup, resetRound, sumModifiers, type EffectPlayer,
} from './effects.js';
import {
  advance, checkWin, finalTiles, rubricTotal, scoreSubmission, tilesForScore,
} from './scoring.js';
```

Add these fields to the class:

```ts
  private judged = new Map<string, { passed: number; total: number; rubric: number; note: string }>();
  private judgingSettled = false;
  private judgingPromise: Promise<void> | null = null;
```

Replace the `tick` method with the full cycle:

```ts
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
```

Replace the `submit` tail so both-submitted enters judging:

```ts
    if (this.players.every((p) => p.submission)) this.enterJudging();
    return { ok: true, data: { ok: true } };
```

Add the round-resolution methods:

```ts
  // ---------------------------------------------------------------- judging

  private enterJudging(): void {
    this.judged.clear();
    this.judgingSettled = false;
    this.goto('JUDGING');
    this.judgingPromise = this.runJudging();
  }

  /** Kicks off execution and style judging for both players concurrently. */
  private async runJudging(): Promise<void> {
    const problem = this.currentProblem;
    if (!problem) return;

    await Promise.all(
      this.players.map(async (player) => {
        const sub = player.submission;
        if (!sub) return;
        const [exec, rubric] = await Promise.all([
          this.deps.execute({
            language: sub.language,
            code: sub.code,
            functionName: problem.functionName[sub.language],
            tests: problem.hiddenTests,
            comparison: problem.comparison,
          }, (r) => {
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
        this.judged.set(player.id, {
          passed: exec.passed,
          total: problem.hiddenTests.length,
          rubric: rubricTotal(rubric),
          note: rubric.note,
        });
      }),
    );

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

    const scores: Record<string, RoundScore> = {};
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
        tiles: 0,
        passed: j.passed,
        totalTests: j.total,
        note: j.note,
      };
      player.lastScore = score;
      player.progress = j.passed;
      scores[player.id] = score;
    }

    for (const player of this.players) {
      this.deps.emit(player.id, 'round_result', { round: this.round, scores });
    }
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
        awardPowerup(player, randomPowerup());
      }

      // Landing on a stash tile earns one at random.
      if (BALANCE.STASH_TILES.includes(player.position)) {
        awardPowerup(player, randomPowerup());
      }

      // The sole highest scorer picks one of two.
      if (soleLeader && score.total === best) {
        player.offer = [randomPowerup(), randomPowerup()];
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
        const pick = player.offer[Math.floor(Math.random() * player.offer.length)]!;
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
    this.goto('MOVEMENT');
  }

  private afterMovement(): void {
    const cop = this.players.find((p) => p.role === 'COP');
    const robber = this.players.find((p) => p.role === 'ROBBER');
    if (!cop || !robber) return;

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
    const d = phaseDurations(this.deps.fast);
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
```

Add this helper near the top of the file, below the imports:

```ts
/** Hostile power-ups land on the opponent; everything else on the user. */
function EFFECT_TARGET_IS_OPPONENT(type: PowerupType): boolean {
  return EFFECTS[type].hostile;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run apps/server/src/match/`
Expected: PASS — all engine tests, both files.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/match/engine.ts apps/server/src/match/engine.round.test.ts
git commit -m "feat: round resolution with judging cap, awards, movement and win check"
```

---

### Task 11: Socket server, registry and wiring

Spec §5, §10. Wires the engine to Socket.IO and runs the single tick interval.

**Files:**
- Create: `apps/server/src/match/registry.ts`
- Create: `apps/server/src/index.ts`
- Create: `apps/server/.env.example`
- Test: `apps/server/src/match/registry.test.ts`

**Interfaces:**
- Consumes: `MatchEngine` (Tasks 9-10), `execute` (Task 6), `judgeStyle` (Task 7), event types (Task 1).
- Produces: `class MatchRegistry` with `create(nickname)`, `get(roomCode)`, `tickAll(now)`, `sweep(now)`, `size`; and the running HTTP + Socket.IO server.

- [ ] **Step 1: Write the failing test**

`apps/server/src/match/registry.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { BALANCE } from '@heist/shared';
import { MatchRegistry } from './registry.js';

function registry() {
  let clock = 5_000_000;
  const reg = new MatchRegistry({
    now: () => clock,
    emit: () => {},
    execute: async () => ({ results: [], stdout: '', stderr: '', timedOut: false, passed: 0 }),
    judgeStyle: async () => ({
      naming: 0, readability: 0, comments: 0, organization: 0, simplicity: 0, note: '',
    }),
    fast: true,
  });
  return { reg, advance: (ms: number) => { clock += ms; }, at: () => clock };
}

describe('MatchRegistry', () => {
  it('creates a match with a six-character uppercase room code', () => {
    const { reg } = registry();
    const { roomCode } = reg.create('Danny');
    expect(roomCode).toMatch(/^[A-Z0-9]{6}$/);
    expect(reg.get(roomCode)).toBeDefined();
  });

  it('issues distinct room codes', () => {
    const { reg } = registry();
    const codes = new Set(Array.from({ length: 50 }, () => reg.create('P').roomCode));
    expect(codes.size).toBe(50);
  });

  it('returns undefined for an unknown code', () => {
    const { reg } = registry();
    expect(reg.get('ZZZZZZ')).toBeUndefined();
  });

  it('is case-insensitive on lookup, since players type the code by hand', () => {
    const { reg } = registry();
    const { roomCode } = reg.create('Danny');
    expect(reg.get(roomCode.toLowerCase())).toBeDefined();
  });

  it('sweeps a match once both players have been gone past the destroy window', () => {
    const { reg, advance, at } = registry();
    const { roomCode, playerId } = reg.create('Danny');
    const engine = reg.get(roomCode)!;
    const second = engine.addPlayer('Rusty');
    if (!second.ok) throw new Error('setup failed');

    engine.setConnected(playerId, false);
    engine.setConnected(second.data.playerId, false);
    advance(BALANCE.MATCH_DESTROY_MS + 1);
    reg.sweep(at());

    expect(reg.get(roomCode)).toBeUndefined();
    expect(reg.size).toBe(0);
  });

  it('keeps a match whose player is still connected', () => {
    const { reg, advance, at } = registry();
    const { roomCode } = reg.create('Danny');
    advance(BALANCE.MATCH_DESTROY_MS * 3);
    reg.sweep(at());
    expect(reg.get(roomCode)).toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run apps/server/src/match/registry.test.ts`
Expected: FAIL — `Cannot find module './registry.js'`

- [ ] **Step 3: Write the registry**

`apps/server/src/match/registry.ts`:

```ts
import { MatchEngine, type EngineDeps } from './engine.js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no O/0/I/1

function randomCode(): string {
  let out = '';
  for (let i = 0; i < 6; i += 1) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

export type RegistryDeps = EngineDeps;

export class MatchRegistry {
  private matches = new Map<string, MatchEngine>();

  constructor(private readonly deps: RegistryDeps) {}

  get size(): number {
    return this.matches.size;
  }

  create(nickname: string): { roomCode: string; playerId: string } {
    let roomCode = randomCode();
    while (this.matches.has(roomCode)) roomCode = randomCode();

    const engine = new MatchEngine(roomCode, this.deps);
    this.matches.set(roomCode, engine);

    const joined = engine.addPlayer(nickname);
    if (!joined.ok) throw new Error('fresh match rejected its first player');
    return { roomCode, playerId: joined.data.playerId };
  }

  get(roomCode: string): MatchEngine | undefined {
    return this.matches.get(roomCode.toUpperCase());
  }

  async tickAll(now: number): Promise<void> {
    await Promise.all([...this.matches.values()].map((m) => m.tick(now)));
  }

  sweep(now: number): void {
    for (const [code, match] of this.matches) {
      if (match.isEmpty(now)) this.matches.delete(code);
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run apps/server/src/match/registry.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Write the server bootstrap**

`apps/server/src/index.ts`:

```ts
import { createServer } from 'node:http';
import cors from 'cors';
import express from 'express';
import { Server } from 'socket.io';
import { randomUUID } from 'node:crypto';
import type { ClientToServerEvents, ServerToClientEvents } from '@heist/shared';
import { execute } from './exec/runner.js';
import { judgeStyle } from './judge/gemini.js';
import { MatchRegistry } from './match/registry.js';
import { problemForRound } from '@heist/shared';

const PORT = Number(process.env.PORT ?? 4000);
const ORIGIN = process.env.CORS_ORIGIN ?? '*';
const FAST = process.env.FAST_MATCH === '1';
const TICK_MS = 250;

const app = express();
app.use(cors({ origin: ORIGIN }));
app.get('/health', (_req, res) => res.json({ ok: true }));

const http = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(http, {
  cors: { origin: ORIGIN },
});

/** playerId -> socketId, so the engine can address players it knows nothing about. */
const sockets = new Map<string, string>();

const registry = new MatchRegistry({
  now: () => Date.now(),
  emit: (playerId, ev, payload) => {
    const socketId = sockets.get(playerId);
    if (socketId) io.to(socketId).emit(ev as keyof ServerToClientEvents, payload as never);
  },
  execute,
  judgeStyle,
  fast: FAST,
});

setInterval(() => {
  const now = Date.now();
  void registry.tickAll(now);
  registry.sweep(now);
}, TICK_MS);

io.on('connection', (socket) => {
  let roomCode: string | null = null;
  let playerId: string | null = null;

  const bind = (code: string, id: string) => {
    roomCode = code;
    playerId = id;
    sockets.set(id, socket.id);
  };

  socket.on('create_room', ({ nickname }, ack) => {
    const created = registry.create(nickname.slice(0, 20) || 'Anonymous');
    bind(created.roomCode, created.playerId);
    ack({ ok: true, data: created });
  });

  socket.on('join_room', ({ roomCode: code, nickname }, ack) => {
    const match = registry.get(code);
    if (!match) return ack({ ok: false, error: 'NO_SUCH_ROOM' });
    const joined = match.addPlayer(nickname.slice(0, 20) || 'Anonymous');
    if (!joined.ok) return ack(joined);
    bind(match.roomCode, joined.data.playerId);
    ack({ ok: true, data: { playerId: joined.data.playerId } });
  });

  socket.on('rejoin', ({ roomCode: code, playerId: id }, ack) => {
    const match = registry.get(code);
    if (!match) return ack({ ok: false, error: 'NO_SUCH_ROOM' });
    if (!match.players.some((p) => p.id === id)) return ack({ ok: false, error: 'NO_SUCH_PLAYER' });
    bind(match.roomCode, id);
    match.setConnected(id, true);
    ack({ ok: true, data: { ok: true } });
  });

  socket.on('code_sync', ({ code, language }) => {
    if (!roomCode || !playerId) return;
    registry.get(roomCode)?.syncCode(playerId, code, language);
  });

  socket.on('run', async ({ code, language }, ack) => {
    if (!roomCode || !playerId) return ack({ ok: false, error: 'NOT_IN_MATCH' });
    const match = registry.get(roomCode);
    if (!match) return ack({ ok: false, error: 'NO_SUCH_ROOM' });

    // Server-side gate. A disabled button is only the display of this rule.
    const allowed = match.canRun(playerId, Date.now());
    if (!allowed.ok) return ack(allowed);

    const runId = randomUUID();
    ack({ ok: true, data: { runId } });

    const problem = problemForRound(match.round);
    const out = await execute({
      language,
      code,
      functionName: problem.functionName[language],
      tests: problem.sampleTests,
      comparison: problem.comparison,
    });
    socket.emit('run_output', {
      runId, results: out.results, stdout: out.stdout, stderr: out.stderr,
    });
  });

  socket.on('submit', ({ code, language }, ack) => {
    if (!roomCode || !playerId) return ack({ ok: false, error: 'NOT_IN_MATCH' });
    const match = registry.get(roomCode);
    if (!match) return ack({ ok: false, error: 'NO_SUCH_ROOM' });
    ack(match.submit(playerId, code, language));
  });

  socket.on('use_powerup', ({ type }, ack) => {
    if (!roomCode || !playerId) return ack({ ok: false, error: 'NOT_IN_MATCH' });
    const match = registry.get(roomCode);
    if (!match) return ack({ ok: false, error: 'NO_SUCH_ROOM' });
    ack(match.usePowerup(playerId, type));
  });

  socket.on('choose_powerup', ({ type }, ack) => {
    if (!roomCode || !playerId) return ack({ ok: false, error: 'NOT_IN_MATCH' });
    const match = registry.get(roomCode);
    if (!match) return ack({ ok: false, error: 'NO_SUCH_ROOM' });
    ack(match.chooseOffer(playerId, type));
  });

  socket.on('disconnect', () => {
    if (!roomCode || !playerId) return;
    registry.get(roomCode)?.setConnected(playerId, false);
    sockets.delete(playerId);
  });
});

http.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`heistcode server on :${PORT} fast=${FAST}`);
});
```

`apps/server/.env.example`:

```
PORT=4000
CORS_ORIGIN=http://localhost:3000
GEMINI_API_KEY=
# Set to 1 to collapse phase durations for playtesting
FAST_MATCH=0
# Set to 1 to skip the Gemini call and return the fallback rubric
DEV_SKIP_AI=0
```

- [ ] **Step 6: Verify the server boots and responds**

Run: `npm run -w @heist/server dev`
Then, in another shell: `curl -s localhost:4000/health`
Expected: `{"ok":true}`

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/match/registry.ts apps/server/src/match/registry.test.ts apps/server/src/index.ts apps/server/.env.example
git commit -m "feat: socket server, match registry and single tick loop"
```

---

### Task 12: Web app scaffold, typed socket client, landing page

Spec §11. Per the spec's testing posture there are no browser tests; verification here is concrete manual steps. The one piece of real logic — countdown maths — is a pure function and does get tests.

**Files:**
- Create: `apps/web/package.json`, `next.config.ts`, `postcss.config.mjs`, `tsconfig.json`, `.env.local.example`
- Create: `apps/web/src/app/globals.css`, `layout.tsx`, `page.tsx`
- Create: `apps/web/src/lib/socket.ts`, `apps/web/src/lib/clock.ts`
- Test: `apps/web/src/lib/clock.test.ts`

**Interfaces:**
- Consumes: `ClientToServerEvents`, `ServerToClientEvents` from `@heist/shared`.
- Produces:
  - `getSocket(): HeistSocket`
  - `ask<K>(ev: K, payload): Promise<{ ok: true; data: ... } | { ok: false; error: string }>` — promisified ack
  - `saveSession(roomCode, playerId)`, `loadSession()`
  - `remainingMs(deadlineAt: number | null, now: number): number`
  - `formatClock(ms: number): string`

- [ ] **Step 1: Create the web package**

`apps/web/package.json`:

```json
{
  "name": "@heist/web",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3000",
    "build": "next build",
    "start": "next start"
  },
  "dependencies": {
    "@heist/shared": "*",
    "@monaco-editor/react": "^4.6.0",
    "next": "^15.1.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "socket.io-client": "^4.8.0"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "tailwindcss": "^4.0.0"
  }
}
```

`apps/web/next.config.ts`:

```ts
import type { NextConfig } from 'next';

const config: NextConfig = {
  transpilePackages: ['@heist/shared'],
};

export default config;
```

`apps/web/postcss.config.mjs`:

```js
export default { plugins: { '@tailwindcss/postcss': {} } };
```

`apps/web/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "preserve",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "noEmit": true,
    "composite": false,
    "declaration": false,
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "src/**/*.ts", "src/**/*.tsx", ".next/types/**/*.ts"]
}
```

`apps/web/.env.local.example`:

```
NEXT_PUBLIC_SERVER_URL=http://localhost:4000
```

- [ ] **Step 2: Write the failing test for the clock helpers**

`apps/web/src/lib/clock.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { formatClock, remainingMs } from './clock.js';

describe('remainingMs', () => {
  it('returns the gap to the deadline', () => {
    expect(remainingMs(1_010_000, 1_000_000)).toBe(10_000);
  });

  it('never goes negative', () => {
    expect(remainingMs(1_000_000, 1_010_000)).toBe(0);
  });

  it('returns zero for a phase with no deadline', () => {
    expect(remainingMs(null, 1_000_000)).toBe(0);
  });
});

describe('formatClock', () => {
  it('formats as m:ss', () => {
    expect(formatClock(150_000)).toBe('2:30');
    expect(formatClock(61_000)).toBe('1:01');
    expect(formatClock(9_000)).toBe('0:09');
  });

  it('rounds up so the clock never shows 0:00 while time remains', () => {
    expect(formatClock(1)).toBe('0:01');
    expect(formatClock(0)).toBe('0:00');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run apps/web/src/lib/clock.test.ts`
Expected: FAIL — `Cannot find module './clock.js'`

- [ ] **Step 4: Write the clock helpers**

`apps/web/src/lib/clock.ts`:

```ts
export function remainingMs(deadlineAt: number | null, now: number): number {
  if (deadlineAt === null) return 0;
  return Math.max(0, deadlineAt - now);
}

export function formatClock(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run apps/web/src/lib/clock.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 6: Write the typed socket client**

`apps/web/src/lib/socket.ts`:

```ts
'use client';

import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@heist/shared';

export type HeistSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: HeistSocket | null = null;

export function getSocket(): HeistSocket {
  socket ??= io(process.env.NEXT_PUBLIC_SERVER_URL ?? 'http://localhost:4000', {
    transports: ['websocket'],
  });
  return socket;
}

type AckResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** Promisified emit-with-ack, so callers can await a server decision. */
export function ask<T>(
  event: keyof ClientToServerEvents,
  payload: unknown,
): Promise<AckResult<T>> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ ok: false, error: 'TIMEOUT' }), 8_000);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (getSocket() as any).emit(event, payload, (res: AckResult<T>) => {
      clearTimeout(timer);
      resolve(res);
    });
  });
}

const KEY = 'heistcode.session';

export type Session = { roomCode: string; playerId: string };

export function saveSession(s: Session): void {
  try { sessionStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode */ }
}

export function loadSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 7: Write the theme and layout**

`apps/web/src/app/globals.css`:

```css
@import "tailwindcss";

:root {
  --hc-bg: #0b0c10;
  --hc-panel: #14161c;
  --hc-line: #2a2e38;
  --hc-text: #e8e6e1;
  --hc-dim: #8b8f9a;
  --hc-gold: #d4a53a;
  --hc-cop: #4a9ee8;
  --hc-robber: #e85d4a;
}

body {
  background: var(--hc-bg);
  color: var(--hc-text);
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
}
```

`apps/web/src/app/layout.tsx`:

```tsx
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'HeistCode',
  description: 'Two coders. One vault. Only one gets away.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 8: Write the landing page**

`apps/web/src/app/page.tsx`:

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ask, saveSession } from '@/lib/socket';

export default function Landing() {
  const router = useRouter();
  const [nickname, setNickname] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    setError(null);
    const res = await ask<{ roomCode: string; playerId: string }>('create_room', { nickname });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    saveSession(res.data);
    router.push(`/match/${res.data.roomCode}`);
  }

  async function join() {
    setBusy(true);
    setError(null);
    const roomCode = code.trim().toUpperCase();
    const res = await ask<{ playerId: string }>('join_room', { roomCode, nickname });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    saveSession({ roomCode, playerId: res.data.playerId });
    router.push(`/match/${roomCode}`);
  }

  const ready = nickname.trim().length > 0 && !busy;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-4">
      <header>
        <h1 className="text-4xl font-bold" style={{ color: 'var(--hc-gold)' }}>HEISTCODE</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--hc-dim)' }}>
          Two coders. One vault. Only one gets away.
        </p>
      </header>

      <input
        className="rounded border bg-transparent px-3 py-2"
        style={{ borderColor: 'var(--hc-line)' }}
        placeholder="Your alias"
        value={nickname}
        maxLength={20}
        onChange={(e) => setNickname(e.target.value)}
      />

      <button
        className="rounded px-3 py-3 font-bold text-black disabled:opacity-40"
        style={{ background: 'var(--hc-gold)' }}
        disabled={!ready}
        onClick={create}
      >
        ASSEMBLE A CREW
      </button>

      <div className="flex gap-2">
        <input
          className="min-w-0 flex-1 rounded border bg-transparent px-3 py-2 uppercase"
          style={{ borderColor: 'var(--hc-line)' }}
          placeholder="ROOM CODE"
          value={code}
          maxLength={6}
          onChange={(e) => setCode(e.target.value)}
        />
        <button
          className="rounded border px-4 py-2 disabled:opacity-40"
          style={{ borderColor: 'var(--hc-line)' }}
          disabled={!ready || code.trim().length !== 6}
          onClick={join}
        >
          JOIN
        </button>
      </div>

      {error && <p style={{ color: 'var(--hc-robber)' }}>{error}</p>}
    </main>
  );
}
```

- [ ] **Step 9: Verify manually**

Run the server (`npm run -w @heist/server dev`) and the web app (`npm run -w @heist/web dev`), then:

1. Open `http://localhost:3000`, type an alias, click ASSEMBLE A CREW.
2. Expected: the URL becomes `/match/XXXXXX` with a six-character code.
3. Copy that code into a second browser window, enter a different alias, click JOIN.
4. Expected: the second window navigates to the same `/match/XXXXXX`.
5. Try joining a bogus code `ZZZZZZ`. Expected: `NO_SUCH_ROOM` shown in red.
6. Try joining a full room from a third window. Expected: `MATCH_FULL`.

- [ ] **Step 10: Commit**

```bash
git add apps/web/
git commit -m "feat: web scaffold, typed socket client and landing page"
```

---

### Task 13: Match page — editor, run panel, test results

Spec §7, §10. The match page subscribes to `snapshot` and renders. Monaco is lazy-loaded.

**Files:**
- Create: `apps/web/src/lib/useMatch.ts`
- Create: `apps/web/src/app/match/[code]/page.tsx`
- Create: `apps/web/src/components/CodeEditor.tsx`
- Create: `apps/web/src/components/TestResults.tsx`

**Interfaces:**
- Consumes: `getSocket`, `ask`, `loadSession` (Task 12); `remainingMs`, `formatClock` (Task 12); `BALANCE`, `MatchSnapshot`, `RoundScore`, `TestResult` types.
- Produces:
  - `useMatch(roomCode): { snapshot, me, opponent, now, roundResult, runOutput, blockedEffect, offer }`
  - `<CodeEditor value language onChange disabled blackedOut />`
  - `<TestResults results stdout stderr hidden />`

- [ ] **Step 1: Write the match-state hook**

`apps/web/src/lib/useMatch.ts`:

```ts
'use client';

import { useEffect, useRef, useState } from 'react';
import type {
  MatchSnapshot, PlayerView, PowerupType, Role, RoundScore, TestResult,
} from '@heist/shared';
import { ask, getSocket, loadSession } from './socket';

export type RunOutput = {
  runId: string;
  results: TestResult[];
  stdout: string;
  stderr: string;
};

export function useMatch(roomCode: string) {
  const [snapshot, setSnapshot] = useState<MatchSnapshot | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [roundResult, setRoundResult] = useState<Record<string, RoundScore> | null>(null);
  const [runOutput, setRunOutput] = useState<RunOutput | null>(null);
  const [offer, setOffer] = useState<PowerupType[] | null>(null);
  const [progress, setProgress] = useState<Record<string, { done: number; total: number }>>({});
  const [gameOver, setGameOver] = useState<{ winner: Role; reason: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const playerId = useRef<string | null>(null);

  useEffect(() => {
    const session = loadSession();
    if (session?.roomCode === roomCode) playerId.current = session.playerId;

    const socket = getSocket();

    const rejoin = () => {
      const s = loadSession();
      if (s?.roomCode === roomCode) void ask('rejoin', { roomCode, playerId: s.playerId });
    };

    socket.on('connect', rejoin);
    socket.on('snapshot', setSnapshot);
    socket.on('round_result', ({ scores }) => setRoundResult(scores));
    socket.on('run_output', (p) => setRunOutput(p));
    socket.on('test_progress', ({ playerId: who, done, total }) => {
      setProgress((prev) => ({ ...prev, [who]: { done, total } }));
    });
    socket.on('powerup_offer', ({ options }) => setOffer(options));
    socket.on('game_over', (p) => setGameOver(p));
    socket.on('effect_blocked', ({ type }) => setToast(`${type} BLOCKED BY SHIELD`));
    socket.on('effect_applied', ({ type, targetId }) => {
      if (targetId === playerId.current) setToast(`INCOMING: ${type}`);
    });
    socket.on('opponent_disconnected', () => setToast('OPPONENT WENT DARK'));
    socket.on('opponent_reconnected', () => setToast('OPPONENT IS BACK'));

    if (socket.connected) rejoin();

    const clock = setInterval(() => setNow(Date.now()), 200);
    return () => {
      clearInterval(clock);
      socket.off('connect', rejoin);
      socket.off('snapshot', setSnapshot);
      socket.removeAllListeners('round_result');
      socket.removeAllListeners('run_output');
      socket.removeAllListeners('test_progress');
      socket.removeAllListeners('powerup_offer');
      socket.removeAllListeners('game_over');
      socket.removeAllListeners('effect_blocked');
      socket.removeAllListeners('effect_applied');
      socket.removeAllListeners('opponent_disconnected');
      socket.removeAllListeners('opponent_reconnected');
    };
  }, [roomCode]);

  // Clear a toast after a moment.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2_500);
    return () => clearTimeout(t);
  }, [toast]);

  // A new round clears last round's panels.
  const round = snapshot?.round ?? 0;
  useEffect(() => {
    setRoundResult(null);
    setRunOutput(null);
    setOffer(null);
    setProgress({});
  }, [round]);

  const me: PlayerView | null =
    snapshot?.players.find((p) => p.id === playerId.current) ?? null;
  const opponent: PlayerView | null =
    snapshot?.players.find((p) => p.id !== playerId.current) ?? null;

  return { snapshot, me, opponent, now, roundResult, runOutput, offer, gameOver, toast, progress, playerId };
}
```

- [ ] **Step 2: Write the editor component**

`apps/web/src/components/CodeEditor.tsx`:

```tsx
'use client';

import Editor from '@monaco-editor/react';
import type { Language } from '@heist/shared';

type Props = {
  value: string;
  language: Language;
  disabled: boolean;
  blackedOut: boolean;
  blackoutSecondsLeft: number;
  onChange: (next: string) => void;
};

export function CodeEditor({
  value, language, disabled, blackedOut, blackoutSecondsLeft, onChange,
}: Props) {
  return (
    <div className="relative h-full w-full">
      <Editor
        height="100%"
        theme="vs-dark"
        language={language === 'python' ? 'python' : 'javascript'}
        value={value}
        onChange={(next) => onChange(next ?? '')}
        options={{
          readOnly: disabled,
          minimap: { enabled: false },
          fontSize: 14,
          fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
          scrollBeyondLastLine: false,
          tabSize: 4,
          automaticLayout: true,
        }}
      />

      {blackedOut && (
        <div
          className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2"
          style={{ background: 'rgba(5,5,8,0.97)' }}
        >
          {/* A label is mandatory: an unexplained black editor reads as a crash. */}
          <p className="text-3xl font-bold" style={{ color: 'var(--hc-robber)' }}>BLACKOUT</p>
          <p className="text-5xl font-bold">{blackoutSecondsLeft}s</p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Write the test-results panel**

`apps/web/src/components/TestResults.tsx`:

```tsx
'use client';

import type { TestResult } from '@heist/shared';

type Props = {
  results: TestResult[];
  stdout: string;
  stderr: string;
  jammed: boolean;
  jammedSecondsLeft: number;
};

export function TestResults({ results, stdout, stderr, jammed, jammedSecondsLeft }: Props) {
  if (jammed) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1">
        <p className="font-bold" style={{ color: 'var(--hc-robber)' }}>COMMS JAMMED</p>
        <p className="text-2xl font-bold">{jammedSecondsLeft}s</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-3 text-sm">
      {stderr && (
        <pre className="mb-3 whitespace-pre-wrap" style={{ color: 'var(--hc-robber)' }}>{stderr}</pre>
      )}

      {results.map((r) => (
        <div key={r.i} className="flex items-baseline gap-2">
          <span style={{ color: r.pass ? 'var(--hc-gold)' : 'var(--hc-robber)' }}>
            {r.pass ? 'PASS' : 'FAIL'}
          </span>
          <span style={{ color: 'var(--hc-dim)' }}>case {r.i + 1}</span>
          {!r.pass && (
            <span style={{ color: 'var(--hc-dim)' }}>
              got {JSON.stringify(r.actual)}{r.error ? ` (${r.error})` : ''}
            </span>
          )}
        </div>
      ))}

      {stdout.trim() && (
        <>
          <p className="mt-3" style={{ color: 'var(--hc-dim)' }}>your output</p>
          <pre className="whitespace-pre-wrap">{stdout}</pre>
        </>
      )}

      {results.length === 0 && !stderr && (
        <p style={{ color: 'var(--hc-dim)' }}>Run your code against the sample cases.</p>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Write the match page**

`apps/web/src/app/match/[code]/page.tsx`:

```tsx
'use client';

import { use, useEffect, useMemo, useState } from 'react';
import { BALANCE, type Language } from '@heist/shared';
import { CodeEditor } from '@/components/CodeEditor';
import { TestResults } from '@/components/TestResults';
import { formatClock, remainingMs } from '@/lib/clock';
import { ask } from '@/lib/socket';
import { useMatch } from '@/lib/useMatch';

export default function MatchPage({ params }: { params: Promise<{ code: string }> }) {
  const { code: roomCode } = use(params);
  const { snapshot, me, opponent, now, runOutput, toast } = useMatch(roomCode);

  const [language, setLanguage] = useState<Language>('python');
  const [code, setCode] = useState('');
  const [seeded, setSeeded] = useState<string | null>(null);

  const problem = snapshot?.problem ?? null;

  // Seed the editor from starter code once per problem+language.
  useEffect(() => {
    if (!problem) return;
    const key = `${problem.id}:${language}`;
    if (seeded === key) return;
    setCode(problem.starterCode[language]);
    setSeeded(key);
  }, [problem, language, seeded]);

  // Debounced code_sync — this is what makes auto-submit on deadline work.
  useEffect(() => {
    if (snapshot?.phase !== 'CODING') return;
    const t = setTimeout(() => {
      void ask('code_sync', { code, language });
    }, BALANCE.CODE_SYNC_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [code, language, snapshot?.phase]);

  const activeOf = (type: string) =>
    me?.activeEffects.find((e) => e.type === type && e.expiresAt > now) ?? null;

  const emp = activeOf('EMP');
  const blackout = activeOf('BLACKOUT');
  const jammed = activeOf('JAMMED_COMMS');

  const coding = snapshot?.phase === 'CODING';
  const secondsLeft = useMemo(
    () => formatClock(remainingMs(snapshot?.deadlineAt ?? null, now)),
    [snapshot?.deadlineAt, now],
  );

  if (!snapshot) {
    return <main className="grid min-h-screen place-items-center">Connecting…</main>;
  }

  if (snapshot.phase === 'LOBBY') {
    return (
      <main className="grid min-h-screen place-items-center text-center">
        <div>
          <p style={{ color: 'var(--hc-dim)' }}>Room code</p>
          <p className="text-6xl font-bold tracking-widest" style={{ color: 'var(--hc-gold)' }}>
            {snapshot.roomCode}
          </p>
          <p className="mt-4" style={{ color: 'var(--hc-dim)' }}>Waiting for your partner…</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex h-screen flex-col">
      <header
        className="flex items-center justify-between border-b px-4 py-2"
        style={{ borderColor: 'var(--hc-line)' }}
      >
        <div>
          <span style={{ color: me?.role === 'COP' ? 'var(--hc-cop)' : 'var(--hc-robber)' }}>
            {me?.role ?? '—'}
          </span>
          <span style={{ color: 'var(--hc-dim)' }}> · {me?.nickname}</span>
        </div>
        <div className="text-center">
          <p className="text-xs" style={{ color: 'var(--hc-dim)' }}>
            ROUND {snapshot.round}/{BALANCE.TOTAL_ROUNDS} · {snapshot.phase}
          </p>
          <p className="text-2xl font-bold">{secondsLeft}</p>
        </div>
        <div className="text-right" style={{ color: 'var(--hc-dim)' }}>
          {opponent?.nickname ?? 'waiting'}
          {opponent?.submitted ? ' · LOCKED IN' : ''}
          {opponent?.connected === false ? ' · DARK' : ''}
          {opponent && progress[opponent.id] && (
            <span style={{ color: 'var(--hc-gold)' }}>
              {' · '}{progress[opponent.id]!.done}/{progress[opponent.id]!.total} CRACKED
            </span>
          )}
        </div>
      </header>

      {toast && (
        <div className="px-4 py-1 text-center text-sm" style={{ background: 'var(--hc-panel)' }}>
          {toast}
        </div>
      )}

      <section className="flex min-h-0 flex-1">
        <aside
          className="w-80 shrink-0 overflow-auto border-r p-4"
          style={{ borderColor: 'var(--hc-line)' }}
        >
          <h2 className="font-bold" style={{ color: 'var(--hc-gold)' }}>{problem?.title}</h2>
          <p className="mt-2 text-sm leading-relaxed">{problem?.narrative}</p>
          <div className="mt-4 text-xs" style={{ color: 'var(--hc-dim)' }}>
            {problem?.sampleTests.map((t, i) => (
              <pre key={i} className="mt-2 whitespace-pre-wrap">
                in  {JSON.stringify(t.input)}{'\n'}out {JSON.stringify(t.expected)}
              </pre>
            ))}
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-2 border-b px-3 py-2" style={{ borderColor: 'var(--hc-line)' }}>
            {(['python', 'javascript'] as Language[]).map((l) => (
              <button
                key={l}
                className="rounded px-2 py-1 text-xs"
                style={{
                  background: language === l ? 'var(--hc-gold)' : 'transparent',
                  color: language === l ? '#000' : 'var(--hc-dim)',
                }}
                onClick={() => setLanguage(l)}
              >
                {l}
              </button>
            ))}

            <div className="ml-auto flex gap-2">
              <button
                className="rounded border px-3 py-1 text-sm disabled:opacity-40"
                style={{ borderColor: 'var(--hc-line)' }}
                disabled={!coding || !!emp}
                onClick={() => void ask('run', { code, language })}
              >
                {emp ? `EMP ${Math.ceil((emp.expiresAt - now) / 1000)}s` : 'RUN'}
              </button>
              <button
                className="rounded px-3 py-1 text-sm font-bold text-black disabled:opacity-40"
                style={{ background: 'var(--hc-gold)' }}
                disabled={!coding || me?.submitted}
                onClick={() => void ask('submit', { code, language })}
              >
                {me?.submitted ? 'LOCKED IN' : 'SUBMIT'}
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1">
            <CodeEditor
              value={code}
              language={language}
              disabled={!coding || !!me?.submitted}
              blackedOut={!!blackout}
              blackoutSecondsLeft={blackout ? Math.ceil((blackout.expiresAt - now) / 1000) : 0}
              onChange={setCode}
            />
          </div>

          <div className="h-48 shrink-0 border-t" style={{ borderColor: 'var(--hc-line)' }}>
            <TestResults
              results={runOutput?.results ?? []}
              stdout={runOutput?.stdout ?? ''}
              stderr={runOutput?.stderr ?? ''}
              jammed={!!jammed}
              jammedSecondsLeft={jammed ? Math.ceil((jammed.expiresAt - now) / 1000) : 0}
            />
          </div>
        </div>
      </section>
    </main>
  );
}
```

- [ ] **Step 5: Verify manually**

With both servers running and two browser windows in the same room:

1. Both windows show ROOM CODE, then roles, then round 1 with the problem text.
2. The clock counts down smoothly without stutter. Expected — it is driven by `deadlineAt`, not by server ticks.
3. Type into the editor and click RUN. Expected: sample case results appear within ~1s.
4. Click RUN twice fast. Expected: the second is rejected by the cooldown (check the server log).
5. Add `print("hi")` to a Python solution and RUN. Expected: `hi` shows under "your output", and no `##HC##` text appears anywhere.
6. Click SUBMIT. Expected: the button reads LOCKED IN, the editor becomes read-only, and the other window's header shows `· LOCKED IN`.
7. Submit in both windows. Expected: the phase advances to JUDGING then SCORING without waiting out the full clock.
8. Let the coding clock expire in one window without submitting. Expected: the round still resolves, using the synced buffer.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/useMatch.ts apps/web/src/components/CodeEditor.tsx apps/web/src/components/TestResults.tsx apps/web/src/app/match/
git commit -m "feat: match page with monaco editor, run panel and test results"
```

---

### Task 14: Board and score reveal

Spec §4, §8. The board is the thing judges actually watch, so it gets real visual weight.

**Files:**
- Create: `apps/web/src/components/Board.tsx`
- Create: `apps/web/src/components/ScorePanel.tsx`
- Modify: `apps/web/src/app/match/[code]/page.tsx`

**Interfaces:**
- Consumes: `BALANCE`, `PlayerView`, `RoundScore` from `@heist/shared`.
- Produces: `<Board players />`, `<ScorePanel players scores round />`.

- [ ] **Step 1: Write the board**

`apps/web/src/components/Board.tsx`:

```tsx
'use client';

import { BALANCE, type PlayerView } from '@heist/shared';

export function Board({ players }: { players: PlayerView[] }) {
  const cop = players.find((p) => p.role === 'COP');
  const robber = players.find((p) => p.role === 'ROBBER');
  const tiles = Array.from({ length: BALANCE.BOARD_MAX_TILE + 1 }, (_, i) => i);

  return (
    <div className="flex items-end gap-1 px-4 py-3">
      {tiles.map((t) => {
        const isEscape = t === BALANCE.ESCAPE_TILE;
        const isStash = BALANCE.STASH_TILES.includes(t);
        return (
          <div key={t} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <div className="flex h-6 flex-col items-center justify-end">
              {cop?.position === t && (
                <span className="text-lg leading-none" style={{ color: 'var(--hc-cop)' }} title="Cop">▲</span>
              )}
              {robber?.position === t && (
                <span className="text-lg leading-none" style={{ color: 'var(--hc-robber)' }} title="Robber">●</span>
              )}
            </div>
            <div
              className="h-3 w-full rounded-sm"
              style={{
                background: isEscape
                  ? 'var(--hc-gold)'
                  : isStash
                    ? 'rgba(212,165,58,0.35)'
                    : 'var(--hc-line)',
              }}
              title={isEscape ? 'Getaway car' : isStash ? 'Stash' : `Tile ${t}`}
            />
            <span className="text-[10px]" style={{ color: 'var(--hc-dim)' }}>{t}</span>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Write the score reveal**

`apps/web/src/components/ScorePanel.tsx`:

```tsx
'use client';

import type { PlayerView, RoundScore } from '@heist/shared';

type Props = {
  players: PlayerView[];
  scores: Record<string, RoundScore>;
  round: number;
};

export function ScorePanel({ players, scores, round }: Props) {
  return (
    <div
      className="absolute inset-0 z-30 grid place-items-center"
      style={{ background: 'rgba(5,5,8,0.94)' }}
    >
      <div className="w-full max-w-2xl px-6">
        <p className="mb-4 text-center text-sm" style={{ color: 'var(--hc-dim)' }}>
          ROUND {round} TAKE
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          {players.map((p) => {
            const s = scores[p.id];
            if (!s) return null;
            return (
              <div
                key={p.id}
                className="rounded border p-4"
                style={{ borderColor: 'var(--hc-line)', background: 'var(--hc-panel)' }}
              >
                <p
                  className="font-bold"
                  style={{ color: p.role === 'COP' ? 'var(--hc-cop)' : 'var(--hc-robber)' }}
                >
                  {p.role} · {p.nickname}
                </p>

                <dl className="mt-3 space-y-1 text-sm">
                  <Row label={`tests ${s.passed}/${s.totalTests}`} value={s.correctness.toFixed(1)} />
                  <Row label="style" value={s.style.toFixed(1)} />
                  <Row label="total" value={s.total.toFixed(1)} />
                  <Row label="base tiles" value={String(s.baseTiles)} />
                  {s.speedBonus > 0 && <Row label="fast hands" value={`+${s.speedBonus}`} />}
                  {s.modifierDelta !== 0 && (
                    <Row label="gadgets" value={s.modifierDelta > 0 ? `+${s.modifierDelta}` : String(s.modifierDelta)} />
                  )}
                </dl>

                <p className="mt-3 text-3xl font-bold" style={{ color: 'var(--hc-gold)' }}>
                  {s.tiles} {s.tiles === 1 ? 'tile' : 'tiles'}
                </p>

                {s.note && (
                  <p className="mt-2 text-xs italic" style={{ color: 'var(--hc-dim)' }}>
                    &ldquo;{s.note}&rdquo;
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt style={{ color: 'var(--hc-dim)' }}>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
```

- [ ] **Step 3: Wire both into the match page**

In `apps/web/src/app/match/[code]/page.tsx`, add the imports:

```tsx
import { Board } from '@/components/Board';
import { ScorePanel } from '@/components/ScorePanel';
```

Pull `roundResult` and `gameOver` from the hook by changing the destructure to:

```tsx
  const { snapshot, me, opponent, now, runOutput, toast, roundResult, gameOver, progress } = useMatch(roomCode);
```

Insert the board immediately after the `toast` block:

```tsx
      <Board players={snapshot.players} />
```

Wrap the existing `<section>` in a relatively-positioned container and add the overlays. Replace `<section className="flex min-h-0 flex-1">` with:

```tsx
      <div className="relative flex min-h-0 flex-1">
        <section className="flex min-h-0 flex-1">
```

and close it after the section's closing tag, adding the overlays:

```tsx
        </section>

        {snapshot.phase === 'SCORING' && roundResult && (
          <ScorePanel players={snapshot.players} scores={roundResult} round={snapshot.round} />
        )}

        {gameOver && (
          <div
            className="absolute inset-0 z-40 grid place-items-center text-center"
            style={{ background: 'rgba(5,5,8,0.97)' }}
          >
            <div>
              <p
                className="text-5xl font-bold"
                style={{ color: gameOver.winner === 'COP' ? 'var(--hc-cop)' : 'var(--hc-robber)' }}
              >
                {gameOver.winner} WINS
              </p>
              <p className="mt-2" style={{ color: 'var(--hc-dim)' }}>
                {gameOver.reason === 'CAUGHT' && 'Caught at the getaway car.'}
                {gameOver.reason === 'ESCAPED' && 'Gone without a trace.'}
                {gameOver.reason === 'EVADED' && 'The heat never closed in.'}
              </p>
            </div>
          </div>
        )}
      </div>
```

- [ ] **Step 4: Verify manually**

1. Both windows show a 15-tile board; the blue triangle sits on tile 0 and the red circle on tile 3.
2. Tiles 5, 9 and 12 are tinted; tile 14 is solid gold.
3. Submit in both windows and wait for SCORING. Expected: the score overlay shows tests passed, style, total and tiles for both players, plus the AI note in italics.
4. Watch MOVEMENT. Expected: both markers move by the tile counts the panel showed.
5. Play three rounds. Expected: the game-over overlay appears with a role-appropriate colour and the matching reason line.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/Board.tsx apps/web/src/components/ScorePanel.tsx apps/web/src/app/match/
git commit -m "feat: board renderer, score reveal and game-over overlay"
```

---

### Task 15: Power-up tray and effect overlays

Spec §9. The client needs effect metadata (durations, hostility, phase legality) that currently lives only in the server package. Step 1 moves it into `@heist/shared` so there is one definition rather than two that can drift.

**Files:**
- Create: `packages/shared/src/effects.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `apps/server/src/match/effects.ts` (import the moved pieces)
- Create: `apps/web/src/components/PowerupTray.tsx`
- Create: `apps/web/src/components/EffectOverlay.tsx`
- Modify: `apps/web/src/app/match/[code]/page.tsx`
- Test: `packages/shared/src/effects.test.ts`

**Interfaces:**
- Consumes: `PowerupType`, `Phase`, `ActiveEffect` from `@heist/shared`.
- Produces, now from `@heist/shared`: `EffectSpec`, `EFFECTS`, `isUsableInPhase`, `POWERUP_LABEL`, `POWERUP_BLURB`. Plus `<PowerupTray />` and `<EffectOverlay />`.

- [ ] **Step 1: Move the effect table into shared**

Create `packages/shared/src/effects.ts`, moving `EffectSpec`, `EFFECTS` and `isUsableInPhase` verbatim out of `apps/server/src/match/effects.ts` and adding display metadata:

```ts
import type { Phase, PowerupType } from './state.js';

export type EffectSpec = {
  kind: 'timed' | 'modifier' | 'reactive';
  hostile: boolean;
  /** null on a timed effect means "until the end of the round" */
  durationMs: number | null;
  delta: number;
};

export const EFFECTS: Record<PowerupType, EffectSpec> = {
  EMP:          { kind: 'timed',    hostile: true,  durationMs: 15_000, delta: 0 },
  BLACKOUT:     { kind: 'timed',    hostile: true,  durationMs: 6_000,  delta: 0 },
  JAMMED_COMMS: { kind: 'timed',    hostile: true,  durationMs: 20_000, delta: 0 },
  SMOKE_BOMB:   { kind: 'timed',    hostile: false, durationMs: null,   delta: 0 },
  ROADBLOCK:    { kind: 'modifier', hostile: true,  durationMs: null,   delta: -1 },
  GETAWAY_CAR:  { kind: 'modifier', hostile: false, durationMs: null,   delta: 1 },
  SHIELD:       { kind: 'reactive', hostile: false, durationMs: null,   delta: 0 },
};

/**
 * Phase legality. Checked BEFORE applyEffect so an illegal attempt never
 * consumes the item. Shared so the client disables the same buttons the
 * server would refuse.
 */
export function isUsableInPhase(type: PowerupType, phase: Phase): boolean {
  const spec = EFFECTS[type];
  if (spec.kind === 'reactive') return false;
  if (spec.kind === 'timed') return phase === 'CODING';
  return phase === 'POWERUP';
}

export const POWERUP_LABEL: Record<PowerupType, string> = {
  EMP: 'EMP',
  BLACKOUT: 'Blackout',
  JAMMED_COMMS: 'Jammed Comms',
  SMOKE_BOMB: 'Smoke Bomb',
  ROADBLOCK: 'Roadblock',
  GETAWAY_CAR: 'Getaway Car',
  SHIELD: 'Shield',
};

export const POWERUP_BLURB: Record<PowerupType, string> = {
  EMP: 'Kills their Run button for 15s',
  BLACKOUT: 'Blacks out their editor for 6s',
  JAMMED_COMMS: 'Hides their test results for 20s',
  SMOKE_BOMB: 'Hides your progress for the round',
  ROADBLOCK: 'Costs them one tile this round',
  GETAWAY_CAR: 'Earns you one extra tile this round',
  SHIELD: 'Auto-blocks the next gadget aimed at you',
};
```

Add to `packages/shared/src/index.ts`:

```ts
export * from './effects.js';
```

In `apps/server/src/match/effects.ts`, delete the local `EffectSpec`, `EFFECTS` and `isUsableInPhase` definitions and import them instead. The top of the file becomes:

```ts
import {
  BALANCE, EFFECTS, type ActiveEffect, type PendingModifier, type PowerupType,
} from '@heist/shared';

export { EFFECTS, isUsableInPhase, type EffectSpec } from '@heist/shared';

/** Every power-up, used for random awards. SHIELD is awardable but never stored. */
const AWARDABLE = Object.keys(EFFECTS) as PowerupType[];
```

Everything else in that file is unchanged, and `apps/server/src/match/engine.ts` keeps importing `EFFECTS` and `isUsableInPhase` from `./effects.js`, so no other file changes.

- [ ] **Step 2: Write the failing test for the moved module**

`packages/shared/src/effects.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { EFFECTS, isUsableInPhase, POWERUP_BLURB, POWERUP_LABEL } from './effects.js';
import type { PowerupType } from './state.js';

const ALL = Object.keys(EFFECTS) as PowerupType[];

describe('effect table', () => {
  it('covers all seven power-ups', () => {
    expect(ALL).toHaveLength(7);
  });

  it('gives every power-up a label and a blurb', () => {
    for (const t of ALL) {
      expect(POWERUP_LABEL[t]).toBeTruthy();
      expect(POWERUP_BLURB[t]).toBeTruthy();
    }
  });

  it('marks exactly the four hostile power-ups as hostile', () => {
    const hostile = ALL.filter((t) => EFFECTS[t].hostile).sort();
    expect(hostile).toEqual(['BLACKOUT', 'EMP', 'JAMMED_COMMS', 'ROADBLOCK']);
  });

  it('gives every timed hostile effect a finite duration', () => {
    for (const t of ALL) {
      const s = EFFECTS[t];
      if (s.kind === 'timed' && s.hostile) expect(s.durationMs).toBeGreaterThan(0);
    }
  });

  it('keeps blackout the shortest sabotage, since it is the most punishing', () => {
    expect(EFFECTS.BLACKOUT.durationMs!).toBeLessThan(EFFECTS.EMP.durationMs!);
    expect(EFFECTS.BLACKOUT.durationMs!).toBeLessThan(EFFECTS.JAMMED_COMMS.durationMs!);
  });

  it('agrees with the client on phase legality', () => {
    expect(isUsableInPhase('EMP', 'CODING')).toBe(true);
    expect(isUsableInPhase('EMP', 'POWERUP')).toBe(false);
    expect(isUsableInPhase('ROADBLOCK', 'POWERUP')).toBe(true);
    expect(isUsableInPhase('SHIELD', 'CODING')).toBe(false);
  });
});
```

- [ ] **Step 3: Run the whole suite to verify the move broke nothing**

Run: `npx vitest run`
Expected: PASS — all shared, server and web tests, including the pre-existing effects tests which now exercise the shared table through the server re-export.

- [ ] **Step 4: Write the power-up tray**

`apps/web/src/components/PowerupTray.tsx`:

```tsx
'use client';

import {
  EFFECTS, isUsableInPhase, POWERUP_BLURB, POWERUP_LABEL,
  type Phase, type PlayerView, type PowerupType,
} from '@heist/shared';

type Props = {
  me: PlayerView;
  phase: Phase;
  hostileUsed: boolean;
  onUse: (type: PowerupType) => void;
};

export function PowerupTray({ me, phase, hostileUsed, onUse }: Props) {
  return (
    <div
      className="flex items-center gap-2 border-t px-3 py-2"
      style={{ borderColor: 'var(--hc-line)' }}
    >
      <span className="text-xs" style={{ color: 'var(--hc-dim)' }}>GADGETS</span>

      {me.shielded && (
        <span
          className="rounded px-2 py-1 text-xs font-bold text-black"
          style={{ background: 'var(--hc-gold)' }}
          title={POWERUP_BLURB.SHIELD}
        >
          SHIELD ARMED
        </span>
      )}

      {me.inventory.length === 0 && !me.shielded && (
        <span className="text-xs" style={{ color: 'var(--hc-dim)' }}>none — score well to earn one</span>
      )}

      {me.inventory.map((type, i) => {
        const legal = isUsableInPhase(type, phase);
        const blocked = hostileUsed && EFFECTS[type].hostile;
        const disabled = !legal || blocked;
        return (
          <button
            key={`${type}-${i}`}
            className="rounded border px-2 py-1 text-xs disabled:opacity-35"
            style={{ borderColor: 'var(--hc-line)' }}
            disabled={disabled}
            title={blocked ? 'One hostile gadget per round' : POWERUP_BLURB[type]}
            onClick={() => onUse(type)}
          >
            {POWERUP_LABEL[type]}
          </button>
        );
      })}
    </div>
  );
}

```

- [ ] **Step 5: Write the offer modal and status badges**

`apps/web/src/components/EffectOverlay.tsx`:

```tsx
'use client';

import {
  POWERUP_BLURB, POWERUP_LABEL, type ActiveEffect, type PowerupType,
} from '@heist/shared';

export function ActiveEffectBadges({ effects, now }: { effects: ActiveEffect[]; now: number }) {
  const live = effects.filter((e) => e.expiresAt > now);
  if (live.length === 0) return null;

  return (
    <div className="flex gap-2 px-3 py-1">
      {live.map((e) => (
        <span
          key={`${e.type}-${e.expiresAt}`}
          className="rounded px-2 py-0.5 text-xs font-bold"
          style={{ background: 'var(--hc-robber)', color: '#000' }}
        >
          {POWERUP_LABEL[e.type]} {Math.ceil((e.expiresAt - now) / 1000)}s
        </span>
      ))}
    </div>
  );
}

type OfferProps = {
  options: PowerupType[];
  secondsLeft: number;
  onChoose: (type: PowerupType) => void;
};

export function PowerupOffer({ options, secondsLeft, onChoose }: OfferProps) {
  return (
    <div
      className="absolute inset-0 z-40 grid place-items-center"
      style={{ background: 'rgba(5,5,8,0.95)' }}
    >
      <div className="w-full max-w-lg px-6 text-center">
        <p style={{ color: 'var(--hc-gold)' }}>BEST TAKE OF THE ROUND — PICK YOUR GADGET</p>
        <p className="mb-4 text-sm" style={{ color: 'var(--hc-dim)' }}>
          auto-picks in {secondsLeft}s
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {options.map((type, i) => (
            <button
              key={`${type}-${i}`}
              className="rounded border p-4 text-left"
              style={{ borderColor: 'var(--hc-line)', background: 'var(--hc-panel)' }}
              onClick={() => onChoose(type)}
            >
              <p className="font-bold">{POWERUP_LABEL[type]}</p>
              <p className="mt-1 text-xs" style={{ color: 'var(--hc-dim)' }}>{POWERUP_BLURB[type]}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Wire them into the match page**

Add the imports to `apps/web/src/app/match/[code]/page.tsx`:

```tsx
import { PowerupTray } from '@/components/PowerupTray';
import { ActiveEffectBadges, PowerupOffer } from '@/components/EffectOverlay';
import { EFFECTS, type PowerupType } from '@heist/shared';
```

Add `offer` to the hook destructure:

```tsx
  const { snapshot, me, opponent, now, runOutput, toast, roundResult, gameOver, offer, progress } = useMatch(roomCode);
```

Track whether a hostile gadget has already been spent this round. Add near the other state:

```tsx
  const [hostileUsed, setHostileUsed] = useState(false);
  useEffect(() => { setHostileUsed(false); }, [snapshot?.round]);

  async function usePowerup(type: PowerupType) {
    const res = await ask<{ blocked: boolean }>('use_powerup', { type });
    if (res.ok && EFFECTS[type].hostile) setHostileUsed(true);
  }
```

Place the badges under the header, right after the `toast` block:

```tsx
      {me && <ActiveEffectBadges effects={me.activeEffects} now={now} />}
```

Place the tray immediately before the closing `</main>`:

```tsx
      {me && (
        <PowerupTray
          me={me}
          phase={snapshot.phase}
          hostileUsed={hostileUsed}
          onUse={(t) => void usePowerup(t)}
        />
      )}
```

Add the offer modal inside the relative container, next to `ScorePanel`:

```tsx
        {offer && snapshot.phase === 'POWERUP' && (
          <PowerupOffer
            options={offer}
            secondsLeft={Math.ceil(remainingMs(snapshot.deadlineAt, now) / 1000)}
            onChoose={(t) => void ask('choose_powerup', { type: t })}
          />
        )}
```

- [ ] **Step 7: Verify all seven power-ups manually**

Run both servers with `FAST_MATCH=1` on the server so rounds are short. With two windows side by side, grant yourself gadgets by scoring perfectly, or temporarily seed inventory in the server's `addPlayer`. Check each:

| Gadget | Expected in the opponent's window |
|---|---|
| EMP | Run button disabled, reading `EMP 14s`, counting down; clicking it does nothing |
| Blackout | Editor covered, large `BLACKOUT` with a countdown, clears after 6s |
| Jammed Comms | Results panel replaced by `COMMS JAMMED` and a countdown |
| Smoke Bomb | Your own progress still visible to you; opponent sees it blank |
| Roadblock | Opponent's score panel shows `gadgets -1` and they move one fewer tile |
| Getaway Car | Your score panel shows `gadgets +1` and you move one extra tile |
| Shield | Incoming gadget produces `BLOCKED BY SHIELD`, no effect lands, badge clears |

Also verify:

1. During CODING, the Roadblock and Getaway Car buttons are **disabled**. During POWERUP, the sabotage buttons are disabled.
2. After firing one hostile gadget, the rest grey out with the tooltip `One hostile gadget per round`.
3. Firing two gadgets at once (Blackout + Jammed Comms) shows two badges and both overlays behave.
4. Win a round with the top score and let the offer timer expire. Expected: a gadget is granted anyway and the modal closes.

- [ ] **Step 8: Commit**

```bash
git add packages/shared/src/effects.ts packages/shared/src/effects.test.ts packages/shared/src/index.ts apps/server/src/match/effects.ts apps/web/src/components/PowerupTray.tsx apps/web/src/components/EffectOverlay.tsx apps/web/src/app/match/
git commit -m "feat: shared effect table, power-up tray and effect overlays"
```

---

### Task 16: Playtest, balance tuning and deploy

Spec §8, §14, §16. The final gate. Balance is expected to be wrong on first contact; this task is where it gets fixed.

**Files:**
- Create: `README.md` (replace the existing one-liner)
- Modify: `packages/shared/src/balance.ts` (tuning only)
- Create: `apps/server/render.yaml`
- Create: `apps/web/vercel.json`

**Interfaces:**
- Consumes: everything.
- Produces: a deployed, playtested game.

- [ ] **Step 1: Run the whole suite and typecheck**

Run: `npx vitest run && npm run typecheck`
Expected: all tests pass, no type errors. Fix anything red before proceeding — this is the last point where a broken type is cheap.

- [ ] **Step 2: Play three full matches with `FAST_MATCH=1`**

Start the server with `FAST_MATCH=1 DEV_SKIP_AI=1 npm run -w @heist/server dev` and play three complete matches across two browser windows, recording for each round: both players' totals, tiles earned, and both positions.

Check these four things:

1. **Does the match ever hang?** If any phase sticks, the bug is a transition with no exit — check the server transition log for the last `from -> to` line.
2. **Who wins, and why?** With both players solving competently the Robber should escape around round 3. If the Robber escapes in round 2 every time, the escape is too close.
3. **Can the Cop ever win?** Deliberately throw one round as the Robber. The Cop should catch up. If not, the gap is too wide.
4. **Are gadgets decisive or irrelevant?** A Roadblock plus a Getaway Car is a two-tile swing, which should visibly change an outcome at least once.

- [ ] **Step 3: Tune `balance.ts` based on what you saw**

Change only these, and only in `packages/shared/src/balance.ts`:

```ts
  // Robber escapes too easily -> raise ESCAPE_TILE (and BOARD_MAX_TILE with it)
  BOARD_MAX_TILE: 14,
  ESCAPE_TILE: 14,
  // Cop can never catch up -> lower ROBBER_START
  ROBBER_START: 3,
  // Rounds feel rushed or draggy -> adjust CODING
  PHASE_MS: { CODING: 150_000 },
```

Then re-run `npx vitest run` — `balance.test.ts` from Task 1 enforces the invariants, so a tuning mistake that puts the Robber behind the Cop or a stash tile off the board fails loudly rather than silently.

- [ ] **Step 4: Play one match at production pacing**

Run without `FAST_MATCH`, with a real `GEMINI_API_KEY` and `DEV_SKIP_AI=0`.

1. Time the full match. Expected: 6–9 minutes.
2. Confirm the AI notes read in character and differ between a clean and a scruffy solution.
3. Confirm style scores move with code quality — submit the same correct solution twice, once with good names and comments, once with `def f(a,b):` and single letters. The totals should differ by several points.
4. Kill the server's network mid-judging (or set a bogus `GEMINI_API_KEY`). Expected: the round still resolves with the 14/20 fallback.

- [ ] **Step 5: Write the README**

Replace `README.md`:

```markdown
# HeistCode

A 1v1 competitive coding game. Two players race through heist-themed problems as
Cop and Robber, moving along a board by solving well — scored on test correctness
plus AI-judged code style — and sabotaging each other with gadgets.

- Design spec: `docs/superpowers/specs/2026-10-03-heistcode-design.md`
- Implementation plan: `docs/superpowers/plans/2026-10-03-heistcode.md`

## Run it locally

```bash
npm install
cp apps/server/.env.example apps/server/.env     # add GEMINI_API_KEY
cp apps/web/.env.local.example apps/web/.env.local

npm run -w @heist/server dev     # :4000
npm run -w @heist/web dev        # :3000
```

Open two browser windows on `http://localhost:3000`. One creates a crew, the
other joins with the room code.

## Playtesting

```bash
FAST_MATCH=1 DEV_SKIP_AI=1 npm run -w @heist/server dev
```

`FAST_MATCH` collapses every phase so a full three-round match runs in under a
minute. `DEV_SKIP_AI` skips the Gemini call and returns the fallback rubric.

## Tests

```bash
npx vitest run      # requires python3 on PATH for executor tests
npm run typecheck
```

## Tuning the game

Every game rule — board length, starting tiles, movement brackets, phase
durations, power-up durations — lives in `packages/shared/src/balance.ts`.
Nothing else contains game-rule numbers.

## Architecture

Authoritative Node server, one `MatchEngine` per room held in memory. Clients
emit intents and render `snapshot` messages. Phases and effects carry absolute
`expiresAt` timestamps so clients count down locally. Submitted code runs in a
child process with a scrubbed environment, a 5s wall clock and a 256KB output cap.
```

- [ ] **Step 6: Deploy the backend to Render**

`apps/server/render.yaml`:

```yaml
services:
  - type: web
    name: heistcode-server
    runtime: node
    region: oregon
    plan: starter
    buildCommand: npm install && npm run -w @heist/server build
    startCommand: npm run -w @heist/server start
    healthCheckPath: /health
    envVars:
      - key: NODE_VERSION
        value: 22.11.0
      - key: PORT
        value: 4000
      - key: CORS_ORIGIN
        sync: false
      - key: GEMINI_API_KEY
        sync: false
      - key: FAST_MATCH
        value: "0"
      - key: DEV_SKIP_AI
        value: "0"
```

Create the service from the repo root (not `apps/server`) so workspaces resolve. After the first deploy, confirm `python3` exists in the container:

Run: in Render's shell, `python3 --version`
Expected: a 3.x version. If absent, add a Dockerfile based on `node:22-bookworm` — Debian images ship `python3`. **Check this early**, because the whole Python half of the game depends on it.

- [ ] **Step 7: Deploy the frontend to Vercel**

`apps/web/vercel.json`:

```json
{
  "buildCommand": "cd ../.. && npm install && npm run -w @heist/web build",
  "outputDirectory": ".next",
  "framework": "nextjs"
}
```

Set the Vercel project root to `apps/web` and add `NEXT_PUBLIC_SERVER_URL` pointing at the Render URL. Then set Render's `CORS_ORIGIN` to the Vercel URL and redeploy the server.

- [ ] **Step 8: Verify the deployment end to end**

1. Open the Vercel URL on two different devices, ideally on different networks.
2. Create a room on one, join from the other.
3. Play a full match to a win condition.
4. Hard-refresh mid-round on one device. Expected: it rejoins and the board state is intact — the snapshot repairs it.
5. Fire a gadget across devices. Expected: it lands in well under a second.

- [ ] **Step 9: Commit and stop deploying**

```bash
git add README.md packages/shared/src/balance.ts apps/server/render.yaml apps/web/vercel.json
git commit -m "chore: tuned balance, readme and deployment config"
```

**From this point, stop deploying.** Spec §16 accepts that a backend redeploy kills live matches. Rehearse the demo against the deployed build you just verified.
