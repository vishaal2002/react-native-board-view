# M0 spike

Run S1 with `npm test`. S2–S7 are on the checklist in both apps. Score S3 and S4 on a release build, not Metro dev mode.

| Gate | Where                                               | Pass                                                                                  |
| ---- | --------------------------------------------------- | ------------------------------------------------------------------------------------- |
| S1   | `runS1Cases()` and `packages/core/src/core.test.ts` | Every case passes                                                                     |
| S2   | Empty cells                                         | 20 empty and 20 occupied drops, 0 mismatches                                          |
| S3   | Scale                                               | 4×500 FlashList cards, release median UI and JS FPS ≥ 55, toIndex in range            |
| S4   | Auto-scroll                                         | Far column and deep card, no overshoot                                                |
| S5   | Gestures                                            | 0 misfires in 50 attempts on the paged layout                                         |
| S6   | Rollback                                            | Reject after 800ms returns the card. Two rapid moves do not call `onMove` in parallel |
| S7   | Move to…                                            | TalkBack or VoiceOver completes a move without dragging                               |

Decision rules, unchanged: S2+S3+S4 pass before staying on Drax. S2 alone failing means try dedicated drop zones or an upstream fix. S3 failing means non-virtualized capped cells. S3 and S4 failing means propose a board-only engine on Gesture Handler and Reanimated before building it.

Do not continue to M1 until these gates are confirmed on a mid-tier Android phone and an iPhone.
