# HEISTCODE polished components

Import each named component from its file under `@/components/polished/`. All props are structurally compatible with the shared game types. `Preview` is the default export from `@/components/polished/Preview`.

| Component | Import path | Props |
| --- | --- | --- |
| `Board` | `@/components/polished/Board` | `{ players: PlayerView[] }` |
| `ScorePanel` | `@/components/polished/ScorePanel` | `{ players: PlayerView[]; scores: Record<string, RoundScore>; round: number }` |
| `PowerupTray` | `@/components/polished/PowerupTray` | `{ me: PlayerView; phase: Phase; hostileUsed: boolean; onUse: (t: PowerupType) => void }` |
| `ActiveEffectBadges` | `@/components/polished/ActiveEffectBadges` | `{ effects: ActiveEffect[]; now: number }` |
| `PowerupOffer` | `@/components/polished/PowerupOffer` | `{ options: PowerupType[]; secondsLeft: number; onChoose: (t: PowerupType) => void }` |
| `BlackoutOverlay` | `@/components/polished/BlackoutOverlay` | `{ secondsLeft: number }` |
| `JammedPanel` | `@/components/polished/JammedPanel` | `{ secondsLeft: number }` |
| `GameOverOverlay` | `@/components/polished/GameOverOverlay` | `{ winner: Role; reason: 'CAUGHT' \| 'ESCAPED' \| 'EVADED' }` |

`ScorePanel`, `PowerupOffer`, `BlackoutOverlay`, and `GameOverOverlay` fill their nearest positioned parent. Give that parent `position: relative` and a deliberate size. `JammedPanel` fills the test-results panel's height.

Deliberately left out: game state, timer updates, automatic gadget selection, close buttons, and navigation. The app owns those behaviors and supplies current props. `ActiveEffectBadges` uses the supplied `now` value to calculate remaining seconds. `Preview` uses fixed fixture time and inert callbacks so all states are easy to inspect.
