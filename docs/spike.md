# Release gates

These gates started as the M0 spike (S1–S7). The spike first ran on Drax. Drax failed S2–S4, and the project moved to its own engine: see [decisions/0001-own-drag-engine.md](decisions/0001-own-drag-engine.md). The gates still define "works" for every release.

## Automated (CI, every push)

| Gate               | Where                                                       | Pass                                                                                       |
| ------------------ | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| S1 index semantics | `packages/harness/src/s1.ts`, `packages/core/src/*.test.ts` | Every case passes                                                                          |
| Queue convergence  | `packages/core/src/queue.property.test.ts`                  | Any interleaving of moves, accepts and rejects converges to app data with no overlays left |
| Controller         | `packages/react-native/src/useBoardController.test.tsx`     | Overlay, announcements, rollback, timeouts, unmount, StrictMode                            |
| Package            | CI `package` job                                            | Builds; tarball has types and no tests; core loads in Node as CJS and ESM                  |
| Gesture Handler 3  | CI `gesture-handler-3` job                                  | Typecheck against `react-native-gesture-handler@^3`                                        |

## On devices (each release)

Run these in the demo app (`apps/bare` or `apps/example`). Score S3 and S4 on a **release** build.

| Gate | Screen        | Pass                                                                                       | Last result                                                                                                                                                                                                                       |
| ---- | ------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S2   | Empty cells   | 20 drops into empty cells and 20 into occupied ones, with 0 mismatches                     | Emulator, release, passed 20/20/0 (2026-10-10). A short re-check on 2026-10-15 was 3 empty, 1 occupied, 0 mismatches. Not a full set.                                                                                             |
| S3   | Scale         | 4 × 500 cards; the drop lands at the index shown; frame rates recorded in `benchmarks.md`  | Emulator, release, passed (2026-10-10). The 20 × 6 swimlane frame rates are in `benchmarks.md` (2026-10-15).                                                                                                                      |
| S4   | Auto-scroll   | Reaches the far column and a deep card with no overshoot                                   | Emulator, release (2026-10-15, rechecked 2026-10-17): `multi` and `fit` reach column 12 and stop, and the drop lands where shown; a deep card in column 1 stops on the last card; paged flips one page per dwell. Not on a phone. |
| S5   | Paged layout  | 0 misfires in 50 tries (page swipe vs long-press drag vs "…")                              | iPhone 17 simulator, debug, passed 50/50, 0 misfires (2026-10-10). Not a release build or a physical iPhone.                                                                                                                      |
| S6   | Rollback      | A reject after 800 ms returns the card; two rapid moves never call `onMove` in parallel    | Emulator, release, passed: a reject after 800 ms returns the card (2026-10-10, rechecked 2026-10-15). Two rapid moves were not rechecked.                                                                                         |
| S7   | Accessibility | TalkBack and VoiceOver complete a move without dragging, and focus lands on the moved card | Not yet scored. On the iPhone 17 simulator the card accessibility actions are "Move to…" and "Move to ‹column›" (2026-10-10). VoiceOver focus and TalkBack were not driven.                                                       |

Do not tag 1.0 until S2–S7 pass on a mid-tier Android phone and an iPhone.
