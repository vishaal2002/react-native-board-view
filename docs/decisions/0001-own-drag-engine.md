# 0001: Own drag engine instead of Drax

- Status: accepted
- Date: 2026-10-10

## Context

The M0 spike used `react-native-drax` 1.1 (`useSortableBoard`) behind an internal adapter. The spike gates failed on that adapter:

- **S2:** after a horizontal scroll, the drop landed in the wrong column.
- **S3:** in 500-card columns, the drop landed at index 0, or no reorder happened at all.
- **S4:** auto-scroll ran away, and the hover card did not show.

Drax's own tracker shows the same class of failures:

- [#276](https://github.com/nuclearpasta/react-native-drax/issues/276): items drop to the bottom on 1.1 / RN 0.86.
- [#282](https://github.com/nuclearpasta/react-native-drax/issues/282): the drop point is computed from the item centre.
- [#250](https://github.com/nuclearpasta/react-native-drax/issues/250): items disappear on rapid drags.

Its board API is marked experimental. On Gesture Handler 3, a normal drop is reported as cancelled. The fix, [PR #281](https://github.com/nuclearpasta/react-native-drax/pull/281), was unmerged as of 2026-10-10.

We checked the other React Native libraries (2026-10-10). None of them supports moving items between virtualized lists:

- **react-native-sortables:** cross-container moves are paused ([#297](https://github.com/MatiPl01/react-native-sortables/issues/297)), and it does not virtualize ([#543](https://github.com/MatiPl01/react-native-sortables/issues/543)).
- **react-native-reanimated-dnd:** a kanban board is only on the roadmap.
- **react-native-draggable-flatlist** and **react-native-reorderable-list:** single list only.

## Decision

Build a board-only engine on Gesture Handler, Reanimated and FlashList. It lives in `packages/react-native/src/engine` and is not exported.

1. **One gesture.** A single long-press pan on the board root starts the drag. The card under the finger is resolved in JS from geometry registered by each cell, so there is no per-card `measure()`.
2. **Hover card.** The lifted card renders in one overlay above the board. It follows the finger on the UI thread.
3. **Hit-testing.** A JS `requestAnimationFrame` loop does hit-testing and two-axis auto-scroll. A new slot must hold for two frames before it counts.
4. **Placeholder.** Drop feedback is a placeholder row rendered in the data itself: the lifted card is hidden and a gap is inserted. A drop swaps the placeholder for the card in one React render, so nothing blinks.
5. **Drop rules.** Releasing outside a cell that accepts the card cancels the drag. A refusing cell sends the card home.

## Consequences

- We own the gesture and geometry code, and its tests, including Gesture Handler 2 and 3 compatibility.
- Drops land at the index the user saw, because hit-testing and the drop both use the same FlashList layouts.
- The riskiest part is the JS-thread hit-test loop under heavy JS load, along with re-rendering the placeholder in 500-row lists. These are measured in a release build (`docs/benchmarks.md`). If they fail, slot resolution moves to a worklet that reads cached geometry.
- The engine contract stays internal (`docs/adapter.md`), so it can be replaced without a breaking change.
