# HeistCode — Design Spec

**Date:** 2026-10-03
**Status:** Approved
**Authors:** Roni Serrano + 1 (2-person team, fluid roles)

---

## 1. Intent

A 1v1 competitive coding game for a heist-themed hackathon. Two players race through
heist-framed LeetCode-style problems. One plays the **Cop**, one the **Robber**, moving
along a linear board. Movement is earned by solving problems well — scored on both
correctness and code quality — and players sabotage each other with heist gadgets.

**Success criteria:**

1. Two players on separate machines complete a full match online, start to win condition.
2. A match fits inside a live demo slot, so judges watch a real win rather than hear one described.
3. The heist theme lives in the mechanics, not only the paint.

**Non-goal:** a production-grade competitive programming platform. This is a demo built in
24 hours. Choices below are deliberately scoped to that.

---

## 2. Constraints

| Constraint | Value |
|---|---|
| Time to demo | 24 hours |
| Team | 2 people, roles not fixed — either may work either side |
| Match length target | 6–9 minutes end to end |
| Players per match | Exactly 2 |

The fluid-role constraint drives two decisions: a monorepo with **shared TypeScript types**
so the contract is compiler-enforced rather than remembered, and a **frozen socket contract
in hour 1**.

---

## 3. Locked decisions

| Area | Decision | Rejected alternative |
|---|---|---|
| Code execution | Child process on own backend | Judge0 hosted (low free-tier cap), Judge0 self-hosted (needs privileged containers / cgroups, generally unavailable on managed PaaS) |
| Languages | Python 3 + JavaScript | Python only; stdin/stdout for all languages |
| Test interface | Function signature + per-language harness | Raw stdin/stdout (parsing boilerplate burns a 150s round) |
| Matchmaking | Room code, no accounts | Random queue; Supabase auth |
| Persistence | **None.** In-memory match state, problems in committed JSON | Supabase checkpointing |
| Style judge | Gemini Flash, structured output, fixed fallback | Deterministic heuristics; no judge |
| State authority | Authoritative server, in-memory registry, snapshot-rendering clients | Supabase-backed checkpoints; thin relay with client-driven rounds |
| Power-ups | All seven, via one effect pipeline | A reduced set of three |

**Supabase is dropped entirely.** With no accounts and no persisted stats it had no
remaining responsibility. This removes a dependency, a dashboard, two env vars, and a
client SDK from the 24 hours.

**Hosting:** frontend on Vercel, backend on Render (or Railway). The backend must be a
long-lived stateful process — it holds match state and spawns child processes, so it
cannot be serverless.

---

## 4. Game rules

### Roles and board

- Board is a linear track of 15 tiles, indexed **0–14**. Tile 14 is the escape.
- Positions are clamped: `position = min(position + tiles, 14)`. Earned tiles beyond 14 are
  not carried over — reaching 14 ends the match for the Robber anyway.
- **Cop** starts tile **0**. **Robber** starts tile **3**. Gap of 3.
- Roles assigned at random on match start.
- Both players receive the **same problem** each round. Asymmetry is entirely in the win check.

### Match shape

Three rounds. Each round: problem revealed, code, submit, score, move, resolve power-ups,
check win.

### Win conditions

Evaluated after movement, **in this order**:

1. `cop_pos >= robber_pos` → **Cop wins** (ties go to the Cop — caught at the getaway car)
2. `robber_pos >= 14` → **Robber wins**
3. Three rounds elapsed with neither → **Robber wins** (evaded capture)

Consequence, and it is intentional: because both players use the same movement scale, the
gap never closes on its own. **The Cop only wins by outscoring the Robber** — roughly one
extra tile per round. This makes the Cop the power-up-hungry role, since Roadblock and
Getaway Car each swing exactly one tile.

---

## 5. Architecture

Authoritative server. One `MatchEngine` per room held in a `Map<roomCode, Match>` on a
single Node process. The server owns the phase, every deadline, and every mutation.
Clients emit intents and render snapshots.

```
┌─────────────┐   intents (submit, use_powerup)    ┌──────────────────┐
│  Next.js    │ ─────────────────────────────────> │  Express +       │
│  + Monaco   │                                    │  Socket.IO       │
│  (Vercel)   │ <───────────────────────────────── │  (Render)        │
└─────────────┘   snapshot + animation events      └────────┬─────────┘
                                                            │
                                          ┌─────────────────┼──────────────┐
                                          │                 │              │
                                    MatchRegistry      ExecRunner     GeminiJudge
                                    (in memory)      (child process)  (+ fallback)
```

Two cross-cutting patterns, applied consistently:

1. **Deadlines, not ticks.** Phases and effects both carry an absolute `expiresAt`
   timestamp. Clients count down locally. No per-second event spam, no clock drift, no
   `setTimeout` to leak or lose across a reconnect.
2. **Snapshot is the only truth.** All other server events are animation and flavor. A
   client that misses one is repaired by the next snapshot. Reconnect is therefore free.

---

## 6. Round state machine

| Phase | Duration | Behavior |
|---|---|---|
| `LOBBY` | until P2 joins | Room code shown, nicknames exchanged |
| `ROLE_REVEAL` | 4s | Roles assigned, board and starting positions revealed |
| `ROUND_INTRO` | 5s | Round title, problem revealed |
| `CODING` | 150s | Run and Submit enabled; timed power-ups fireable |
| `JUDGING` | ~2–6s, **hard cap 8s** | Hidden tests + Gemini call, both players, in parallel |
| `SCORING` | 8s | Correctness %, style breakdown, total, tiles earned |
| `POWERUP` | 10s | Movement modifiers played; new power-ups awarded |
| `MOVEMENT` | 4s | Pieces animate |
| `WIN_CHECK` | instant | → `GAME_OVER` or next `ROUND_INTRO` |

~181s per round → **3 rounds ≈ 9 minutes** plus lobby. `CODING` is the pacing dial; 120s
yields ~8 minutes. It lives in `balance.ts`, never as a literal.

**Exactly two transitions out of `CODING`:** both players submitted, or deadline passed.

`JUDGING` has a **hard cap of 8s**. On expiry, any unfinished judging falls back per §6
cases 7 and 8 and the phase advances regardless. The phase must never wait indefinitely on
the executor or on Gemini.

Log every transition as `{room, from, to, reason}`. This is the primary debugging tool.

### Edge cases — all nine must be handled

| # | Case | Resolution |
|---|---|---|
| 1 | Player never submits | On deadline, auto-submit their last synced buffer |
| 2 | Server has no buffer to submit | Client sends `code_sync` debounced ~5s so one always exists. **Case 1 does not work without this.** The buffer may be up to ~5s stale; accepted. |
| 3 | Disconnect mid-round | 20s reconnect grace; round continues |
| 4 | Disconnect, no return | Round resolves with their last buffer (often 0%) |
| 5 | Both disconnect | Destroy match after 60s to avoid leaking memory |
| 6 | Reconnect mid-match | Server pushes full snapshot |
| 7 | Gemini times out or returns unparseable output | Fixed **14/20**, generic note, round resolves |
| 8 | Child process hangs or crashes | 0% correctness for that player, round resolves |
| 9 | Both win conditions in one round | Cop wins (see §4 ordering) |

The invariant behind all of these: **a round always resolves.** No external call, no
missing player, and no crashed process may leave the match without a next phase.

---

## 7. Execution service

Single public surface. Nothing else in the codebase knows a process is spawned.

```ts
execute({ language, code, tests, mode }) => AsyncIterable<TestResult>
```

### Spawn model

Per execution, write `/tmp/hc/<uuid>/` containing the player's `solution.{py,js}`, the
harness, and `tests.json`. Spawn **once for all tests** in that run:

```ts
spawn(bin, [harness], {
  cwd: dir,
  env: { PATH: process.env.PATH },   // scrubbed
  timeout: 5000,
  killSignal: 'SIGKILL',
})
```

### Hardening

| Control | Value | Why |
|---|---|---|
| Scrubbed `env` | `{ PATH }` only | Default `spawn` inherits `process.env`. `print(os.environ)` would otherwise return the Gemini key. Running untrusted code **is the product** here, so this is the whole security story. |
| Wall-clock timeout | 5s, `SIGKILL` | Bounds CPU waste |
| Output cap | kill at 256KB stdout | An infinite print loop would otherwise consume server memory through the pipe |
| Non-root user | yes | Standard least privilege |
| Temp dir cleanup | in `finally` | Disk leak |
| Concurrency semaphore | max 4 child processes, queued | Protects against two developers hammering Run and OOM-killing a 512MB instance |
| Per-player Run cooldown | 2s | Same |

### Output protocol — three channels, no redirection code

| Channel | Carries | Used for |
|---|---|---|
| stdout, lines prefixed `##HC##` | `{"i":3,"pass":true,"ms":2}` | Protocol — parsed, streamed |
| stdout, unprefixed | player's own `print` / `console.log` | Shown in their Run panel |
| stderr | tracebacks, syntax errors | Shown as the error message |

The harness emits one protocol line per test **as it completes**. Two properties follow for
free:

- Results stream to the board live (`3/10 cracked...`).
- A timeout **keeps partial credit** — if code hangs on test 7, tests 1–6 already streamed
  and count; the rest are marked `timeout`. This matters because the movement table in §8
  assumes partial progress is rewarded.

### Run vs Submit

| | Tests | Feedback | Limits |
|---|---|---|---|
| **Run** | sample only | full: input, expected, actual, their stdout | unlimited, 2s cooldown |
| **Submit** | hidden | **count only** (`8/10`) | once per round, locks the player |

Count-only on Submit prevents binary-searching the hidden set and preserves the reveal in
`SCORING`.

### Problem schema

```json
{
  "id": "vault-codes",
  "title": "Match the Vault Codes",
  "narrative": "The vault needs two keycards whose codes sum to the override value...",
  "functionName": { "python": "crack_vault", "javascript": "crackVault" },
  "starterCode": { "python": "...", "javascript": "..." },
  "sampleTests": [{ "input": [[2, 7, 11, 15], 9], "expected": [0, 1] }],
  "hiddenTests": [{ "input": [], "expected": null }],
  "comparison": "unordered"
}
```

- `comparison` is one of `exact` | `unordered` | `float` (epsilon). **Load-bearing:** Two Sum
  returns indices in arbitrary order; without `unordered`, correct solutions fail.
- `functionName` is per-language to handle `snake_case` vs `camelCase`.

---

## 8. Scoring and movement

### Formula

```
correctness = (testsPassed / testsTotal) * 80
style       = (geminiRubricScore / 20) * 20 * (testsPassed / testsTotal)
total       = correctness + style        // 0-100
```

Style is **scaled by correctness** deliberately. Under a flat 80/20 split, code that passes
zero tests still banks ~14–20 points and an 8/10 scruffy solution ties a 10/10 clean one.
Scaling means clean code that does not crack the vault is worth nothing — better game
design and better theme.

### Movement table

| Total score | Tiles |
|---|---|
| 0–30 | 1 |
| 31–50 | 2 |
| 51–70 | 3 |
| 71–90 | 4 |
| 91–100 | 5 |

Floor of 1 tile. Final movement is `clamp(baseTiles + sum(pendingModifiers) + speedBonus, 1, ...)`.

**Speed bonus:** first player to submit 100% correct earns **+1 tile**, once per round. One
tile is exactly one bracket — meaningful without overpowering correctness. "First" is
**server receipt order**, not client timestamps. If both reach 100%, only the earlier
submission earns it; if neither does, no bonus is awarded that round.

### Gemini style rubric — 20 points

| Criterion | Points |
|---|---|
| Variable/function naming — descriptive, not `x`, `a`, `temp` | 5 |
| Readability — understandable flow and structure | 5 |
| Comments — helpful where needed, not rewarded for volume | 4 |
| Organization — sensible functions, separated logic | 3 |
| Simplicity — avoids needless complexity or duplicated work | 3 |

The judge **never** assesses correctness; test cases own that. Enforce the response shape
with Gemini's native structured output (`responseMimeType: "application/json"` plus a
`responseSchema`) rather than prompting for JSON:

```ts
{ naming: 0-5, readability: 0-5, comments: 0-4, organization: 0-3, simplicity: 0-3, note: string }
```

Wrap in a ~4s timeout. On timeout or parse failure, return **14/20** with a generic note.
A `DEV_SKIP_AI` flag returns a stub score to avoid burning free-tier quota during testing.

### Board balance — worked example

Both players competent and evenly matched at 4 tiles/round:

| | Start | R1 | R2 | R3 |
|---|---|---|---|---|
| Cop | 0 | 4 | 8 | 12 |
| Robber | 3 | 7 | 11 | **14** (11+4, clamped) → **escaped** |

- Robber needs **11 tiles over 3 rounds** (avg 3.67) to escape — demanding.
- Cop needs to close **3 net tiles** — about +1 tile/round over the Robber.

**Every number in this section lives in one `packages/shared/balance.ts`.** Playtesting at
hour 19 will require retuning, and that must be a one-file edit.

**Known soft spot:** with a floor of 1 tile, a player who submits nothing still advances 3
tiles across the match. Harmless for the Robber (3 tiles will not reach 14), but a
disconnected Cop creeps forward. If it looks wrong on screen, give a non-submission a floor
of 0. Not built yet.

---

## 9. Power-up pipeline

All seven power-ups route through **one function**. This is what makes seven affordable,
and it is why Shield is cheap rather than the riskiest item.

```ts
function applyEffect(match, source, target, type) {
  const spec = EFFECTS[type];

  if (spec.hostile && target.shielded) {       // <- Shield, in its entirety
    target.shielded = false;
    broadcast('effect_blocked', { target, type });
    return;
  }

  if (spec.kind === 'timed')
    target.activeEffects.push({ type, expiresAt: Date.now() + spec.durationMs });
  else if (spec.kind === 'modifier')
    target.pendingModifiers.push({ type, delta: spec.delta });

  broadcast('effect_applied', { source, target, type, expiresAt });
}
```

Shield is a property of the pipeline, not a seventh feature. No interaction matrix, no
ordering rules, no per-power-up special-casing.

### The seven

| Power-up | Kind | Effect | Duration |
|---|---|---|---|
| **EMP** | timed, hostile | Opponent's Run button disabled | 15s |
| **Blackout** | timed, hostile | Opaque overlay over opponent's editor | 6s |
| **Jammed Comms** | timed, hostile | Opponent's test-results panel hidden | 20s |
| **Smoke Bomb** | timed, self | Your progress stops broadcasting to opponent | rest of round |
| **Roadblock** | modifier, hostile | Opponent's movement −1 | this round's scoring |
| **Getaway Car** | modifier, self | Your movement +1 | this round's scoring |
| **Shield** | reactive | Blocks next hostile effect, then consumed | until used |

Blackout is 6s deliberately — it is the most brutal, and 15s of blank editor is enraging
rather than fun.

### Rules

- **Timed effects** fireable only during `CODING`. **Modifiers** played during `POWERUP`,
  resolved at `MOVEMENT`.
- **Shield auto-arms** on acquisition. No decision, no UI beyond an indicator.
- **Max 1 hostile power-up per player per round**, counting *both* timed sabotage and
  hostile modifiers. Firing EMP during `CODING` therefore blocks Roadblock in that round's
  `POWERUP` phase. Prevents chaining sabotages into a miserable round. Self-effects
  (Smoke Bomb, Getaway Car) and Shield are **not** capped.
- **Inventory cap 3.** Prevents hoarding and UI overflow.
- Effects expire **by timestamp**, pruned on each broadcast. No per-effect timers.

### Awards — resolved during `POWERUP`

| Condition | Award |
|---|---|
| 100% hidden tests | 1 random power-up |
| Strictly highest round total | choose 1 of 2 offered |
| Landed exactly on a stash tile (**5, 9, 12**) | 1 random power-up |

If a player does not pick within the 10s `POWERUP` phase, the server **auto-selects at
random** from the two offered. Awards exceeding the inventory cap of 3 are discarded.

### Two non-obvious requirements

1. **EMP must be enforced server-side.** The server checks `hasActiveEffect(player, 'EMP')`
   before accepting a `run` intent. A disabled button is only the *display* of a rule the
   server owns; otherwise devtools bypasses it in seconds.
2. **Every effect renders a visible label with a countdown** — e.g. `BLACKOUT — 4s` in large
   type over the overlay. A player whose editor goes black with no explanation concludes the
   app crashed, and so will a judge watching.

Movement stays unaware of all of this: `clamp(base + sum(modifiers), 1, ...)` is one line
that no power-up needs to know about.

---

## 10. Socket contract

Freeze this in hour 1. Types live in `packages/shared/events.ts`.

### Client → Server

| Event | Payload | Ack |
|---|---|---|
| `create_room` | `{nickname}` | `{roomCode}` |
| `join_room` | `{roomCode, nickname}` | `{ok}` or error |
| `code_sync` | `{code, language}` — debounced ~5s | none |
| `run` | `{code, language}` | `{runId}`, then streamed results |
| `submit` | `{code, language}` | `{ok}` |
| `use_powerup` | `{type}` | `{ok}` or error (illegal phase / per-round cap) |
| `play_modifier` | `{type}` | `{ok}` |
| `choose_powerup` | `{type}` | `{ok}` |

### Server → Client

| Event | Payload |
|---|---|
| **`snapshot`** | `MatchSnapshot` — on every transition and on reconnect |
| `test_progress` | `{player, index, pass, total}` |
| `run_output` | `{runId, results, stdout, stderr}` |
| `effect_applied` | `{source, target, type, expiresAt}` |
| `effect_blocked` | `{target, type}` |
| `round_result` | `{perPlayer: {correctness, style, total, tiles, modifiers}}` |
| `game_over` | `{winner, reason}` |
| `opponent_disconnected` | `{graceUntil}` |
| `opponent_reconnected` | `{}` |
| `error` | `{code, message}` |

### MatchSnapshot

```ts
type MatchSnapshot = {
  roomCode: string;
  phase: Phase;
  deadlineAt: number | null;
  round: number;                    // 1..3
  problem: PublicProblem | null;    // NEVER the full Problem
  players: Record<PlayerId, {
    nickname: string;
    role: 'COP' | 'ROBBER';
    position: number;
    inventory: PowerupType[];
    shielded: boolean;
    activeEffects: { type: PowerupType; expiresAt: number }[];
    submitted: boolean;
    progress: number | null;        // null when smoke-bombed
  }>;
  winner?: { role: 'COP' | 'ROBBER'; reason: string };
};
```

`PublicProblem` carries `id`, `title`, `narrative`, `functionName`, `starterCode`, and
`sampleTests` — and **no** `hiddenTests`.

**`PublicProblem` must be a distinct type in `shared/state.ts` with no hidden-test array.** If the
full `Problem` enters a snapshot, `hiddenTests` ships to both browsers and devtools reveals
the answer key. Make the type physically unable to hold it rather than relying on remembering
to strip fields.

---

## 11. Repo layout

```
heistgame/
├─ package.json                 npm workspaces
├─ packages/
│  └─ shared/                   @heist/shared — imported by BOTH apps
│     ├─ events.ts              every socket event, typed
│     ├─ state.ts               MatchSnapshot, PublicProblem, Player, Phase, Effect
│     ├─ balance.ts             every tunable number from §8
│     └─ problems.json          the 4 problems
└─ apps/
   ├─ web/                      Next.js + React + TS + Tailwind + Monaco -> Vercel
   │  ├─ app/page.tsx                   nickname + create/join
   │  ├─ app/match/[code]/page.tsx      the game
   │  ├─ components/            Editor · Board · ScorePanel · PowerupTray ·
   │  │                         EffectOverlay · TestResults
   │  └─ lib/socket.ts
   └─ server/                   Node + Express + Socket.IO -> Render
      ├─ src/index.ts           http + socket bootstrap
      ├─ src/match/engine.ts    phase machine
      ├─ src/match/registry.ts  Map<roomCode, Match>
      ├─ src/match/effects.ts   applyEffect + EFFECTS table
      ├─ src/match/scoring.ts   score -> tiles, win check
      ├─ src/exec/runner.ts     child process spawn
      ├─ src/exec/harness/python.py
      ├─ src/exec/harness/js.js
      └─ src/judge/gemini.ts    rubric call + fallback
```

---

## 12. Problems

Four problems, re-skinned from proven easy problems so difficulty and edge cases are known.
Each ships with: narrative prompt, per-language signature and starter code, 2–3 sample
tests, 8–10 hidden tests, a reference solution per language used to validate the hidden
tests, and a `comparison` mode.

| Round | Title | Basis | Comparison |
|---|---|---|---|
| 1 | Match the Vault Codes | Two Sum | `unordered` |
| 2 | Disarm the Laser Grid | Valid Parentheses | `exact` |
| 3 | Trace the Getaway Route | Climbing Stairs | `exact` |
| spare | Spot the Inside Job | Best Time to Buy/Sell Stock | `exact` |

Hidden tests must include the usual traps: empty input, single element, duplicates,
all-negative, and the largest size the 5s timeout tolerates.

---

## 13. Testing

Deliberately scoped to 24 hours.

**Automated (Vitest) — required:**

- `scoring.ts`: score formula, movement brackets, modifier clamping, speed bonus
- win check: all three conditions and the Cop-wins-ties ordering
- `applyEffect`: Shield consumption, per-round hostile cap, inventory cap, expiry pruning

These are pure functions, fast to test, and the exact place a silent bug survives until it
loses someone a match on stage.

**Manual with fixtures:** executor harnesses, one known-good and one known-bad solution per
language per problem.

**`FAST_MATCH` dev flag:** collapses every phase to ~5s so a full 3-round match plays in
under a minute. At 24 hours this is worth more than socket integration tests, because it
will be run dozens of times.

**Explicitly not doing:** E2E browser tests, socket integration tests, sandbox escape tests.

---

## 14. Build order and gates

**Hour 0–1, both together:** scaffold the monorepo and **freeze `shared/events.ts` and
`shared/state.ts`**. Highest-leverage hour of the 24 — shared types mean a later change to
`events.ts` breaks the other person's build, which is a 2-minute conversation in hour 3 and
a mutual block in hour 16.

| Hours | Backend track | Frontend track |
|---|---|---|
| 1–5 | executor + harnesses + problem loading | landing, room join, socket client |
| 5–8 | engine phase machine + registry | Monaco + Run panel + test results |
| 8–11 | scoring + win check (with tests) | board renderer + piece animation |
| 11–14 | effects pipeline | score reveal + power-up tray |
| 14–17 | Gemini judge + fallback | the 7 effect overlays |
| 17–21 | both: integration, playtest, balance tuning |
| 21–24 | both: demo rehearsal, feature freeze, **stop deploying** |

### Gates

| Hour | Must be true | If not |
|---|---|---|
| 8 | Two browsers join a room and see each other | Cut to 3 power-ups now |
| 14 | A full 3-round match completes with real scoring | Cut all power-ups |
| 18 | Power-ups work | Ship the cheapest 3 |
| 21 | Feature freeze | No exceptions |

A gate converts "are we okay?" from a feeling into a yes/no answerable in ten seconds. The
failure mode of a 24-hour hackathon is not building slowly — it is reaching hour 20 with
four half-finished features and no complete path through the game.

### Cut order, from the bottom

Shield → Smoke Bomb → Jammed Comms → stash tiles → choose-1-of-2 awards → Gemini judge
(fall back to fixed 15/20) → down to EMP, Blackout, Getaway Car.

Cutting is the team's call, not a unilateral narrowing. This list exists so the decision
takes seconds.

---

## 15. Out of scope

Named explicitly so they are not drifted into:

- Accounts, auth, profiles, persisted stats, ELO, leaderboards
- Supabase in any role
- Spectating, replays, chat
- More than 2 players per match
- Languages beyond Python and JavaScript
- Problem authoring UI (problems are a committed JSON file)
- Multi-instance backend, horizontal scaling, crash recovery
- Hardened sandboxing beyond §7 (threat model is hackathon attendees, not the public)

---

## 16. Open risks

| Risk | Mitigation |
|---|---|
| Board balance wrong on first playtest | All constants in one `balance.ts`; expect to retune at hour 19 |
| Seven power-up UI states is the largest remaining frontend cost | Cut order in §14; overlays share one `EffectOverlay` component |
| Backend redeploy kills live matches | Accepted. Stop deploying before demoing. |
| Single backend instance | Accepted for a 2-player demo |
| Gemini free-tier rate limit during development | `DEV_SKIP_AI` stub flag |
| Monaco bundle size on first load | Lazy-load the editor; acceptable for a demo |
