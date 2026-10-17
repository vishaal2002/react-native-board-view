# Changelog

This project follows [Semantic Versioning](https://semver.org/). Before 1.0, a minor version may include breaking changes; they are listed under **Breaking**.

## 0.5.0

`react-native-board-view` only. `board-view-core` stays 0.1.0.

- **Drag handles.** `moveModes.drag` accepts `'handle'`. Long-press no longer starts a drag. A touch that starts on a `<DragHandle>` in the card starts the drag as soon as the finger moves, so the rest of the card keeps its taps and scrolling. The long-press Move sheet stays off in this mode. The "…" button and screen-reader actions stay.
- **`DragHandle`.** Exported. It draws a six-dot grip by default and is hidden from screen readers, because the card already has move actions.
- **`CardView` `leading`.** A slot before the title, for the handle or anything else you draw there.
- **Lift and drop tokens.** `liftScale` (1.03), `liftTilt` (0 degrees), `liftShadowOpacity` (0.25 in light, 0.55 in dark) and `dropDuration` (200 ms). `density="compact"` does not reset them. Reduced motion turns the scale and the tilt off. `liftShadowOpacity` is an iOS shadow on top of the card's own. Android ignores it.
- **UI-thread auto-scroll.** Column lists, swimlane lanes, the stacked list, and sideways scrolling in `multi` and `fit` move on the UI thread while a card is held at the edge. Paged boards still flip one page per dwell from JS. The method and the numbers are in [docs/benchmarks.md](docs/benchmarks.md).
- **Swimlane benchmark.** The Scale screen can show 20 lanes × 6 columns (1,200 cards). That run is in the benchmarks doc.

### Fixed

- Lifting a card no longer flashes an empty gap. The real card stays until the lifted copy has been drawn over it, and the placeholder appears two frames later. Releasing before that lands the copy on the card's original rect, and a quick long-press still opens the Move sheet.
- Dropping a card no longer flashes an empty slot. The card is shown under the lifted copy first, and the copy goes two frames later.
- In swimlanes, the drop outline of a tall cell no longer draws past the lane list onto your header.
- Auto-scroll stops in the frame you release, not a few frames later.

### Breaking

- `BoardTheme` has four new required fields: `liftScale`, `liftTilt`, `liftShadowOpacity` and `dropDuration`. Code that builds a whole theme object must add them. `theme` overrides are partial, so passing `theme` is unaffected.

Swipe-to-move stays experimental and off by default. It does not graduate in this release. The decision, to keep it that way until the five-developer usability study at 0.7, is in [docs/decisions/0003-swipe-stays-experimental.md](docs/decisions/0003-swipe-stays-experimental.md).

## 0.4.0

`react-native-board-view` only. `board-view-core` stays 0.1.0.

- **`moveItem` on the ref.** Move a card from code: a "Move to top" button, your own menu, a keyboard shortcut. It runs like a drop. The card moves at once, `onMove` gets `source: 'api'`, and a rejection rolls it back. `canDrop` and `readOnly` apply.
- **`scrollToItem(id, { highlight: true })`.** The card flashes an outline once it is on screen, for search results and deep links. With reduced motion the outline holds still instead of pulsing.
- **`loadingColumns`.** A spinner shows where `onEndReached` fired while you fetch. Custom footers get `loading`.
- **`columnTotals`.** Headers, tabs, and screen-reader labels show your server's count for columns you load in pages. Header render info gets `total` next to `count`.
- **`onRefresh` and `refreshing`.** Pull down on a list to refresh. The board does not fetch.
- **`autoBreakpoint`.** The width where `layout="auto"` switches from paged to multi. Default 600.

### Fixed

- In the paged layout, `renderColumnFooter` on a board without lanes drew on the peeked column too. It now draws only on the column on screen, like swimlanes since 0.3.0.

### Breaking

- `BoardLabels` has a new `loadingMore` string, and `ColumnHeaderRenderInfo` and `ColumnFooterRenderInfo` have new fields. Code that builds a whole `BoardLabels` or a render-info object by hand must add them. `labels` overrides are partial, so passing `labels` is unaffected.

## 0.3.0

`react-native-board-view` only. `board-view-core` stays 0.1.0.

- **Show more on a peeked column.** In the paged layout, Show more and the column footer draw only on the column that is on screen. The next column still peeks in.
- **`columnId`.** Set the column on screen, and update it from `onColumnChange` when the user swipes.
- **`onEndReached`.** A column list reaching its end reports that column. The board does not fetch.

## 0.2.0

`react-native-board-view` only. `board-view-core` stays 0.1.0.

- **Read only.** `readOnly` keeps scroll, paging, collapse, and Show more, and turns off drag, swipe, the Move sheet, and screen-reader move actions. `onMove` stays required.
- **Show more.** A swimlane cell reveals the next page of cards. The row was skipping updates when the limit changed.
- **Paged tabs.** The highlighted tab matches the column on screen after a layout change.

## 0.1.0

First public release of `react-native-board-view` and `board-view-core`.

### Board

- **Boards from data:** you pass flat items and `groupBy` columns, with optional swimlanes. Unknown and null values go to a "No value" bucket.
- **Five layouts:** `auto`, `paged` (with tabs or dots), `multi`, `fit` and `stacked`. Columns and lanes can collapse, controlled by you or by the board.
- **Drag:**
  - Long-press drag on our own engine (Gesture Handler, Reanimated and FlashList v2).
  - Feedback is a placeholder that makes room in the list. The lifted card follows the finger on the UI thread.
  - Auto-scroll runs on both axes, with page flips in the paged layout.
- **Other ways to move:**
  - A "Move to…" sheet, opened from the "…" button or by long-pressing and releasing.
  - Screen-reader actions.
  - Opt-in swipe-to-move.
- **Optimistic moves:**
  - A move shows at once and stays until your items show it.
  - It rolls back if `onMove` rejects or takes longer than `inflightTimeoutMs`.
  - `onMove` receives `{ signal }`.
- **`MoveOperation` fields:** `opId`, `id`, `changes`, `from`, `rank`, `previousId`, `nextId` and `source`.
- **Rules:** `canDrag` and `canDrop`. A refused target shows a red outline while dragging and is disabled in the sheet.
- **Events:** `onMoveError`, `onDragStart`, `onDragOver` and `onDragEnd` (for example, for haptics).
- **Accessibility:**
  - Labels give the item, column, lane and position.
  - Moves are announced once accepted, and rollbacks are announced too.
  - Focus follows a card moved from the sheet or by a screen-reader action.
  - Reduced motion and RTL are supported, and text can grow without clipping.
- **Theming:** light and dark themes, `density`, and per-token overrides with `theme`. Every string can be changed with `labels`. `CardView` is a ready-made card.
- **Imperative handle:** `scrollToColumn`, `scrollToItem`, `openMoveSheet` and `closeMoveSheet`.

### Core

- **Board model:** `projectBoard`, `planMove` and `applyMove`.
- **Move queue:** `createMoveQueue`, with per-item ordering, composed overlays, reflection-based settling, a settle timeout, an in-flight timeout (`MoveTimeoutError`) and abort signals.
- **Ranks:** `fractionalRank`, `rankBetween`, `seedRanks`, `rebalanceRanks` and `shouldRebalance`.

### Compatibility

- New Architecture only.
- React Native 0.83 and later, React 19.
- Reanimated 4.1 and later, Worklets 0.5 and later.
- Gesture Handler 2.28 and later, including 3.x.
- FlashList 2.0.2 and later.
- Expo SDK 55 and later.
