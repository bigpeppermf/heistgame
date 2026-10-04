<p align="center">
  <img src="apps/web/public/landing/title.png" alt="git money" width="360" />
</p>

<p align="center"><strong>Two coders. One vault. Only one gets away.</strong></p>
<p align="center">A two-player coding showdown played out on a heist board.</p>

---

## Write the code. Make the getaway.

One player is the cop. The other is the robber. You both solve coding challenges against the clock, then turn your results into movement on a winding city board.

Clean code gets you further. A well-timed blackout might buy you just enough room to escape.

The cop starts at **00**. The robber gets a head start at **03**. Catch the robber to win as the cop. Reach **14**, or stay ahead through all three rounds, to win as the robber. If both reach the end together, the cop gets the arrest.

## What’s in the bag?

- **Real code, real tests.** Write Python or JavaScript in a Monaco editor. Run against sample cases; submit against the full test set.
- **A tabletop chase.** Fifteen raised spaces, a winding gold route, player tokens, and stash stops at **05 / 09 / 12**.
- **A little sabotage.** Disrupt your opponent’s editor, test feed, or movement with seven gadgets.
- **A score sheet after every round.** See tests passed, style points, movement, and bonuses side by side.
- **Optional AI style judging.** Gemini reviews readability and organization. Test cases decide correctness.
- **Room codes, no accounts.** Create a room, send the code, and get your rival in.

## Get a game running

You’ll need **Node.js 22+**, **npm**, and **Python 3** available as `python3`. The execution runner uses POSIX process groups, so use Linux, macOS, or WSL.

From the repository root:

```bash
npm install
```

Start the game server in one terminal:

```bash
npm run dev --workspace=@heist/server
```

Start the website in another:

```bash
npm run dev --workspace=@heist/web
```

Open **[localhost:3000](http://localhost:3000)**. Create a room and share its code. For a local two-player game, use two browser tabs; sessions are stored per tab.

The server listens on **4000**. Its health endpoint is **[localhost:4000/health](http://localhost:4000/health)**.

Just here for the visuals? **[localhost:3000/preview](http://localhost:3000/preview)** shows the board, score cards, gadgets, and overlays using fixtures, without a running game server.

## A round, from vault to verdict

1. **Case the job.** Read your challenge and sample cases.
2. **Crack the code.** You have 150 seconds. Run your solution, change languages, and submit. The server auto-submits the latest synced code at the deadline.
3. **Get the verdict.** Hidden tests determine correctness. The style review adds points for readable code.
4. **Gear up.** Use the gadgets you’ve collected.
5. **Make your move.** Your score becomes board movement. The server checks for capture, escape, and stash pickups.

### How movement works

Correctness is worth up to **80 points**. Style is worth up to **20**, scaled by the fraction of tests passed, so a polished wrong answer won’t carry you.

| Total score | Base movement |
| --- | --- |
| 0–30 | 1 space |
| Above 30–50 | 2 spaces |
| Above 50–70 | 3 spaces |
| Above 70–90 | 4 spaces |
| Above 90–100 | 5 spaces |

The earlier of two fully correct submissions gets **+1 space**. Gadgets can change movement too. Every player moves at least one space.

### Pick your edge

| Gadget | What it does |
| --- | --- |
| EMP | Disables your rival’s Run button for 15 seconds. |
| Blackout | Covers their editor for 6 seconds. |
| Jammed Comms | Scrambles their test results for 20 seconds. |
| Smoke Bomb | Conceals your progress from your rival for the round. |
| Roadblock | Takes one space off their next movement. |
| Getaway Car | Adds one space to your next movement. |
| Shield | Arms on pickup and blocks the next hostile gadget. |

Carry up to **three gadgets**. Use at most **one hostile gadget per round**. Landing exactly on a stash space earns a random gadget.

## Configure the job

The server reads environment variables from its process. Export them in the terminal where you start it, or prefix the command. The web app can read `apps/web/.env.local`.

| Variable | Where | Default / behavior |
| --- | --- | --- |
| `PORT` | Server | `4000` |
| `CORS_ORIGIN` | Server | `*`; set to the web app’s origin when needed. |
| `GEMINI_API_KEY` | Server | Enables live style reviews. Missing keys or failed reviews use the fallback. |
| `DEV_SKIP_AI` | Server | Set to `1` to use the fixed 14/20 style rubric without calling Gemini. |
| `FAST_MATCH` | Server | Set to `1` for shorter phases and 20-second coding rounds. |
| `NEXT_PUBLIC_SERVER_URL` | Web | `http://localhost:4000`; use a server address both players can reach. |

For a quick local playtest:

```bash
DEV_SKIP_AI=1 FAST_MATCH=1 npm run dev --workspace=@heist/server
```

For live style judging, export your key before starting the server:

```bash
export GEMINI_API_KEY="your-key-here"
npm run dev --workspace=@heist/server
```

## Under the hood

| Part | Built with | Owns |
| --- | --- | --- |
| `apps/web` | Next.js 15, React 19, Tailwind CSS 4, Monaco | Lobby, editor, board, score sheets, effects |
| `apps/server` | Express, Socket.IO, TypeScript | Rooms, phase timers, code execution, judging, game rules |
| `packages/shared` | TypeScript | Problems, balance values, state, typed socket events |

The server owns the match state. Clients send actions and render snapshots; scoring, gadget use, and movement are resolved on the server.

Submissions run in temporary directories as Node.js or Python child processes, with timeouts, output limits, and a scrubbed environment. **This runner is not a security sandbox.** Keep it for trusted local play until code execution is isolated for public hosting.

## Work on the game

Run the test suite:

```bash
npm test
```

Check the shared package and server types:

```bash
npm run typecheck
```

Check the web app types:

```bash
npx tsc --noEmit -p apps/web/tsconfig.json
```

Build the website:

```bash
npm run build --workspace=@heist/web
```

A few useful places to start:

- [Game balance](packages/shared/src/balance.ts) — timers, starting positions, score brackets, and limits.
- [Coding challenges](packages/shared/src/problems.ts) — prompts, starter code, and test cases.
- [Match engine](apps/server/src/match/engine.ts) — the round lifecycle.
- [Gadget effects](apps/server/src/match/effects.ts) — sabotage and movement modifiers.
- [Board](apps/web/src/components/polished/Board.tsx) — the pursuit route and player tokens.
- [Round score cards](apps/web/src/components/polished/ScorePanel.tsx) — the post-round breakdown.
- [Game styles](apps/web/src/styles/game.css) — the visual treatment.

---

<p align="center"><strong>May your tests pass and your getaway be clean.</strong></p>
