# Changelog

This project follows [Semantic Versioning](https://semver.org/). Before 1.0, a minor version may include breaking changes; they are listed under **Breaking**.

## 0.8.0

`react-native-board-view` 0.8.0 and `board-view-core` 0.3.0. Publish core first: the board depends on it.

This is the feature-complete release before 1.0 and the last one that may break the API. 0.8.1 is the performance pass; after that come release candidates.

- **Multi-select.** Tap **Select** in a card's Move sheet, use the card's Select screen-reader action, or call `ref.setSelection(ids)`. While a selection is open, a tap selects a card instead of opening it, each selected card shows a check, and a bar shows the count with **Move** and **Done**.
  - Dragging a selected card carries the rest. The lifted card shows a stack and a count, and the others fade until the drop.
  - The dock, the Move sheet ("Move 3 cards") and `ref.moveItems(ids, to)` move a selection too.
  - Cards land together in board order. One undo reverts the whole batch.
  - `selectable` (default true), and `selection` with `onSelectionChange` for a controlled selection. `renderCard` gets `selected`, `selecting` and `toggleSelected`.
- **Batch moves reach `onMove` one card at a time.** Each op of a batch carries `op.batch = { id, index, size }`, so a server can group them, and existing handlers keep working unchanged. Screen readers hear one "Moved 3 cards to Done".
- **Column and lane reorder.** Pass `onColumnOrderChange` (or `onLaneOrderChange`): headers get a "…" that opens a sheet to move the column left or right, to either end, or to collapse it. The board reports the new order and the app passes `groupBy` back in it, as with every other change.
- **Pointer and keyboard.** A mouse or trackpad (iPad, Android, ChromeOS) picks a card up after a short press (120 ms) instead of a long one; a plain click still reaches the card. Cards show a hover outline. On Android, a hardware keyboard reaches every card and its "…" with Tab and the arrow keys, and Enter opens the Move sheet. On iOS, Full Keyboard Access reaches the same screen-reader actions.
- **Moves from elsewhere flash.** When `items` moves a card by itself (a teammate, a sync), the card flashes once and screen readers hear where it went. A regroup that moves more than six cards at once does not flash. `highlightExternalMoves={false}` turns it off.
- **Test kit.** `react-native-board-view/testing` exports `createBoardTester`. It runs the board's own move code on plain data, with no rendering and no native modules: drag, move, select, undo and limits, and it records what `onMove` received. See [Testing your board](README.md#testing-your-board).
- **`collapsibleLanes`.** Default true; false removes the lane collapse toggle.
- **`overviewOpen`.** Controls the overview from the app.
- **`onColumnChange` in every layout.** It now fires for `multi`, `fit` and the planner too, with the first column at least half on screen.
- **Matrix headers.** The matrix uses the same column header as every other layout: `renderColumnHeader`, limits, sums and the column sheet. A matrix whose lanes would get less than 96 points each is drawn as swimlanes instead.
- **Labels.** `movedMany`, `select`, `deselect`, `selectedCount`, `moveSelected`, `clearSelection`, `moveManyTitle`, `moveColumnLeft`, `moveColumnRight`, `moveColumnFirst`, `moveColumnLast`, `moveLaneUp`, `moveLaneDown`, `moveLaneFirst`, `moveLaneLast`, `columnMoved`, `laneMoved`, `columnSheetTitle`, `laneSheetTitle`, `externallyMoved` and `openMenu`. `labels.card` gets `selected`; `labels.undoBanner` gets `count`.
- **iOS.** The demo app now builds against the iOS 27 SDK (scene life cycle) and runs as a release build on the simulator. Drag, the dock, the sheets and selection were checked there; the last iOS run before this was the spike's debug build. Devices are still open.
- **`board-view-core` 0.3.0.** `MoveOperation` gains an optional `batch`, and `PlanMoveInput` takes one. `MoveBatch` is exported.

### Fixed

- Undo from the banner reverted an older move when the move it named could no longer be undone (its card was deleted, moved by the server, or refused by a full column). The banner now undoes exactly its move. `ref.undo()` keeps a refused move for later instead of reverting an older one.
- Two moves in the same tick (a loop over cards, or two quick calls to `moveItem`) planned against the board before the first one. The second card got the wrong neighbours and rank, and both could slip past a full column in `block` mode.
- With `columnTotals`, a `block` limit ignored moves into the column that the server had not shown yet.
- If the data changed mid-drag as the finger lifted, `onDragEnd` could fire twice and the Move sheet could open for a removed card.
- A collapsed column in swimlanes could not be expanded, and screen readers got no label for it.
- An inline `theme={{…}}` made `multi` and `fit` boards snap to a column, or jump to the first one, whenever the parent re-rendered. Collapsing a column now keeps the scroll position.
- The "Move to" screen-reader action did not scroll to the card, so focus was lost when the card left the screen.
- Leaving the overview, and rotating across the `auto` breakpoint, went back to the first column instead of the one on screen.
- `onEdgeReached` never fired on a board that fits the screen, so a short planner could not grow.
- A controlled `columnId` pulled the board back whenever columns changed (days added, empty columns hidden).
- Text on the accent color in the pager tabs and the Move sheet's lane chips failed contrast in dark mode.
- The matrix fired `onColumnEndReached` once per lane.
- The undo banner came back after a cancelled drag.
- Pager dots highlighted the mirrored dot in right-to-left layouts.
- The pinned swimlane header kept showing a lane after it collapsed, until the next scroll.
- Pinned headers in swimlanes and stacked could cover the drop line during a drag. They now let go while a card is lifted.
- Screen readers read column counts twice. They also heard the pinned lane header twice. Matrix headers were not announced as headers on iOS.
- Pager tabs, lane headers, the Move sheet's lane chips and position control, Show more and overview headers are now at least 44 points tall.
- The Move sheet marks full columns in `block` mode with `labels.full`.
- On iOS a board that opened at a later column (`initialColumnId`, the planner's today) showed the Today button and placed pinned lane headers as if it were at the first column, until the first scroll.
- On iOS a fling into the planner's first days loaded earlier days again and again, and the board drifted back weeks: the fling overrode the scroll that keeps the same day on screen. `onEdgeReached('start')` now waits until the board comes to rest.
- After a column reorder on Android, a column could stop short of its slot and overlap its neighbour. Columns now take their new place at once and ease in with a transform.
- `extraData` arrays were rebuilt on every render in swimlanes and stacked, which re-rendered every visible row.

### Deprecated

These still work in 0.8 with a warning in development. 1.0 removes them.

- `onEndReached` → `onColumnEndReached`.
- `onColumnsEndReached` → `onEdgeReached`.
- `cellLimit` → `laneCellLimit`.

### Breaking

- `UndoEntry` (internal, but visible to code that read `controller.lastMove`) now holds `moves`.
- `ColumnHeaderRenderInfo.limit` is `number | null` instead of optional.
- `LaneHeaderRenderInfo.toggleCollapsed` is optional: it is missing when `collapsibleLanes={false}`.
- `CardRenderInfo`, `CardActionEvent` (`itemIds`), `DragStartEvent` (`itemIds`), `CardAccessibilityContext`, `UndoBannerContext` and `BoardLabels` have new required fields, and `BoardHandle` has `moveItems`, `setSelection` and `getSelection`. Code that builds them itself, for example in tests, must add them.
- `CardAccessibilityContext`, `ColumnSummaryContext`, `MoveAnnouncementContext` and `UndoBannerContext` are now readonly.
- While a selection is open, taps on cards select them instead of reaching your card's `onPress`. Pass `selectable={false}` to keep 0.7's behaviour.

## 0.7.0

`react-native-board-view` only. `board-view-core` stays 0.2.0. Every feature here is in the board: nothing reaches your server.

- **Week planner.** `layout="planner"` draws a column per day: today's date in an accent disc, weekends set back, and a Today button while today is off screen. `dayColumns(start, count)` builds the columns with `YYYY-MM-DD` ids; `toDayId`, `parseDayId` and `addDays` help with the rest.
- **Columns that load sideways.** `onColumnsEndReached('start' | 'end')` fires near either end of the board in the planner, `multi`, `fit` and `paged`. When columns are added in front, the board keeps the same column on screen.
- **WIP limits.** `columnLimits` shows each column's count against its limit ("4/5") with a meter under the header, in the warning color when full and the reject color when over. `limitBehavior="block"` refuses drops into a full column from drag, the dock, the Move sheet and screen-reader actions.
- **Column sums.** `getItemValue` and `formatValue` add a number per card, such as a deal amount, to each header. The default format is compact ("12.4k"), written out so it works on every Hermes build.
- **Spotlight.** `spotlight` fades the cards it rejects, under a veil in the column's color, and keeps them in place and movable.
- **Card ageing.** `getItemAge` and `staleAfterDays` (14). `renderCard` gets `age` and `stale`, and `CardView` takes `age` and `stale` to show a small chip that turns amber when stale.
- **Lane distribution.** Lane headers draw a bar of how the lane's cards spread across the columns.
- **Sticky headers.** On by default: lane headers in swimlanes and section headers in stacked stay pinned. `stickyHeaders={false}` turns them off.
- **Theme presets.** `themePreset`: `paper`, `slate` and `aurora`, each with a light and a dark variant that pass WCAG AA for text and muted text (`theme.test.ts` checks them). `themePresets` is exported.
- **Motion presets.** `motion`: `calm`, `snappy` or `playful`. They set the lift and drop tokens and scale the dock, banner and sheet animations. `playful` tilts the lifted card and springs it into place. `motionPresets` is exported.
- **Smoother layout changes.** Columns glide to a new width or place (collapsing, hiding empty columns, rotating), never during a drag. A new layout fades in when the board switches layout or opens the overview.
- **Header facts for everyone.** `ColumnHeaderRenderInfo` gains `limit`, `limitState`, `value`, `valueLabel` and `day`; `LaneHeaderRenderInfo` gains `distribution`; `CardRenderInfo` gains `dimmed`, `age` and `stale`. Each header's screen-reader label says the same, through the new `labels.columnSummary`.
- **Labels.** `columnSummary`, `full` and `today`. `labels.card` now gets `dimmed` and `staleDays`.

### Breaking

- `BoardTheme` has a new required token, `warning`, for full columns and stale cards. Code that builds a whole theme object must add it. `theme` overrides are partial, so passing `theme` is unaffected.
- `ColumnHeaderRenderInfo`, `LaneHeaderRenderInfo`, `CardRenderInfo`, `CardAccessibilityContext` and `BoardLabels` have new required fields. Code that builds them itself, for example in tests, must add them.
- Sticky headers are on by default. Pass `stickyHeaders={false}` for 0.6's scrolling headers.

## 0.6.0

`react-native-board-view` 0.6.0 and `board-view-core` 0.2.0. Publish core first: the board depends on it.

- **Drop dock.** A tray slides up once a lifted card starts to move, so a long press released in place opens only the Move sheet. The lists end above it while it shows, so it never covers a card. On by default; `dock={false}` turns it off. Column chips move the card to the top of a column, in its lane, without scrolling there. Over the dock the lifted card shrinks toward the finger so the chip stays visible. `dock={{ columns, actions }}` picks the chips.
- **`moveModes.longPressSheet`.** Default true. False keeps long press for dragging only; the "…" button and screen-reader actions still open the sheet.
- **Haptics.** `haptics`, default true: a light tick when a card lifts, through your app's `expo-haptics` or `react-native-haptic-feedback`. The board imports neither and does nothing without them. `false` turns it off; a function replaces it.
- **Card actions.** `cardActions`, `onCardAction` and `canPerformAction`. Your actions (Archive, Assign to me…) show in the dock, at the end of the Move sheet, and as screen-reader actions. The board reports them and never edits items.
- **Undo.** `ref.undo()` and `ref.canUndo()` revert the newest move whose card is still where it landed. Undo goes through `onMove` with `source: 'undo'`, and is not undone again. `undo` adds a banner after each move a person makes, with an Undo button. It stays until dismissed while a screen reader runs.
- **Matrix layout.** `layout="matrix"` draws a swimlane board as a grid: lanes are rows, every cell is on screen and scrolls on its own. For small grids such as a 2 × 2 priority matrix.
- **Hidden empty columns and lanes.** `hideEmptyColumns` and `hideEmptyLanes`. The sheet, the dock and screen-reader actions still list them.
- **Overview (experimental).** `overview` lets people pinch in to see every column at once with small cards that still drag. Tap a header, pinch out or press "Back to the board" to return to that column. `ref.setOverview(open, columnId?)` and `onOverviewChange`. Boards without lanes in `paged`, `multi` and `fit`. The pinch is untested on a device.
- **A better Move sheet.**
  - It shows where the card is now ("In To do · 3 of 8").
  - It has one-tap moves: Up, Down, and the previous or next column that accepts the card.
  - Boards with more than six columns get a column search.
  - Your `cardActions` sit at the end.
  - It slides in and out instead of fading, and dragging its top down closes it.
- **Labels.** `actions`, `currentPlace`, `moveUp`, `moveDown`, `previousColumn`, `nextColumn`, `searchColumns`, `noColumnsMatch`, `undo`, `dismiss`, `undoBanner`, `overview` and `closeOverview`.
- **`board-view-core` 0.2.0.** `MoveSource` gains `'undo'`.

### Breaking

- Drags now show the drop dock, and the lists get shorter while it shows. Pass `dock={false}` to keep 0.5's drag.
- A card ticks when it lifts if your app has `expo-haptics` or `react-native-haptic-feedback`. If you already do this in `onDragStart`, pass `haptics={false}` so it does not tick twice.
- `MoveSource` has a new member, `'undo'`. A `switch` over `op.source` that TypeScript checks for exhaustiveness needs a case for it.
- `BoardLabels` has new required fields. Code that builds a whole labels object must add them. `labels` overrides are partial, so passing `labels` is unaffected.
- `BoardHandle` has new methods. Code that implements the interface itself, for example a test mock, must add `undo`, `canUndo` and `setOverview`.

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
