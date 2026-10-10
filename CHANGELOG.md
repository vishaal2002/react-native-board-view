# Changelog

This project follows [Semantic Versioning](https://semver.org/). Before 1.0, a minor version may include breaking changes; they are listed under **Breaking**.

## 0.2.0

`react-native-board-view` only. `board-view-core` stays 0.1.0.

- **Read only.** `readOnly` keeps scroll, paging, collapse, and Show more, and turns off drag, swipe, the Move sheet, and screen-reader move actions. `onMove` stays required.
- **Show more.** A swimlane cell reveals the next page of cards. The row was skipping updates when the limit changed.
- **Paged tabs.** The highlighted tab matches the column on screen after a layout change.

## 0.1.0

First public pre-release of `react-native-board-view` and `board-view-core`.

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
