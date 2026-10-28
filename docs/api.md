# API reference

This page lists the public API of `react-native-board-view` 1.0 and of `board-view-core`, the package it builds on. It covers every prop, ref method, render info, component, hook, theme token, label, event type, the testing kit and the core functions.

Everything listed here is the stable 1.0 API, and semantic versioning applies to it, except what is marked _Experimental_: the overview (`overview`, `overviewOpen`, `onOverviewChange`, `setOverview`) and swipe-to-move (`moveModes.swipe`). Those are off by default and may change in a minor release. Three entry points make up that API:

| Entry point                       | What it has                                                                                        |
| --------------------------------- | -------------------------------------------------------------------------------------------------- |
| `react-native-board-view`         | `Board`, `CardView`, `DragHandle`, `useBoardTheme`, themes, labels, helpers, and most of the core. |
| `react-native-board-view/testing` | `createBoardTester`, for tests without rendering.                                                  |
| `board-view-core`                 | Grouping, ranks, move planning and the move queue. No React.                                       |

Anything not exported from these entry points is internal, including files under `src/` and `lib/`, and can change in any release.

For a guided tour, read the [README](../README.md). For patterns such as paging, undo, TanStack Query and server use, read the [recipes](recipes.md).

- [`<Board>` props](#board-props)
- [Ref handle](#ref-handle-boardhandle)
- [Render info types](#render-info-types)
- [Components, hooks and helpers](#components-hooks-and-helpers)
- [Theme and labels](#theme-and-labels)
- [Event and operation types](#event-and-operation-types)
- [Testing kit](#testing-kit)
- [Core exports](#core-exports-board-view-core)

## `<Board>` props

`Board<T>` takes `BoardProps<T>`, where `T` is your item type. The board never copies or edits your items. It shows moves as an overlay until your `items` show them. See [How a move works](../README.md#how-a-move-works).

Keep functions and objects you pass stable, with `useCallback` and `useMemo` or by defining them outside the component. A new `renderCard`, `getItemLabel`, `theme`, `spotlight`, `canDrag`, `canDrop`, `cardActions` or `canPerformAction` redraws every card. See [Quick start](../README.md#quick-start).

### Data and moves

| Prop                     | Type                                                                 | Default                  | Notes                                                                                                                                                                                                                                                                                                                    |
| ------------------------ | -------------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `items`                  | `readonly T[]`                                                       | required                 | Flat items, already filtered by the app.                                                                                                                                                                                                                                                                                 |
| `getItemId`              | `(item: T) => string`                                                | required                 | A stable, unique id per item.                                                                                                                                                                                                                                                                                            |
| `groupBy`                | `GroupBy<T>`                                                         | required                 | Which field makes the columns, and optionally the lanes. See [`groupBy`](#groupby).                                                                                                                                                                                                                                      |
| `onMove`                 | `(op: MoveOperation, context: MoveContext) => Promise<void> \| void` | required                 | Called once per card moved, in order per item. Resolve to accept, reject or throw to roll back. Pass `context.signal` to your request. A multi-card move calls it once per card with a shared `op.batch`.                                                                                                                |
| `renderCard`             | `(info: CardRenderInfo<T>) => ReactNode`                             | required                 | Draws a card. See [`CardRenderInfo`](#cardrenderinfot).                                                                                                                                                                                                                                                                  |
| `getRank`                | `(item: T) => string`                                                | `item.rank`              | One global sortable rank per item. Without a string `item.rank`, the rank is `''`, which sorts first, and a warning logs once in development. See [Seeding ranks](recipes.md#seeding-ranks).                                                                                                                             |
| `getItemLabel`           | `(item: T) => string`                                                | the item id              | Name used in screen-reader labels and the Move sheet.                                                                                                                                                                                                                                                                    |
| `onMoveError`            | `(op: MoveOperation, error: unknown) => void`                        |                          | A move was rejected or timed out and rolled back. `error` is what `onMove` threw, or a `MoveTimeoutError`. The board already announces the rollback.                                                                                                                                                                     |
| `canDrag`                | `(item: T) => boolean`                                               | every card               | `false` locks a card.                                                                                                                                                                                                                                                                                                    |
| `canDrop`                | `(item: T, target: MoveTarget) => boolean`                           | every cell               | `false` refuses a cell for that card, in every way of moving. See [Rules](recipes.md#rules-locked-cards-allowed-transitions-wip-limits).                                                                                                                                                                                 |
| `cardActions`            | `readonly CardAction[]`                                              | none                     | App actions in the drop dock, the Move sheet and screen-reader actions. See [`CardAction`](#cardaction). Ignored with `readOnly`.                                                                                                                                                                                        |
| `canPerformAction`       | `(item: T, action: string) => boolean`                               | every action             | Hides an action for one card. `action` is the action's `key`.                                                                                                                                                                                                                                                            |
| `onCardAction`           | `(event: CardActionEvent<T>) => void`                                |                          | An action was chosen. The board does not change the item.                                                                                                                                                                                                                                                                |
| `gateMove`               | `(moves: readonly GatedMove<T>[]) => unknown`                        | none                     | <sup>1.2</sup> Holds a move to ask the user first. Return anything but `null` or `undefined` to hold it: the cards wait, pending, where they land, and `onMove` runs only once the user submits, with the answer in `context.answer`. Undo is never held. See [Moves that ask first](../README.md#moves-that-ask-first). |
| `renderMoveGate`         | `(info: MoveGateInfo<T>) => ReactNode`                               | the board's confirmation | <sup>1.2</sup> The form for a held move, drawn in the board's sheet. Call `info.submit(answer)` or `info.cancel()`.                                                                                                                                                                                                      |
| `confirmInto`            | `readonly string[]`                                                  | none                     | <sup>1.2</sup> Column ids whose moves ask to confirm first. `gateMove` is asked first.                                                                                                                                                                                                                                   |
| `onCardDrop`             | `(event: CardDropEvent<T>) => void`                                  |                          | <sup>1.2</sup> A lifted card rested on another card and was dropped there. Nothing moves. Also adds "Drop onto a card…" to the Move sheet.                                                                                                                                                                               |
| `canDropOnCard`          | `(item: T, target: T) => boolean`                                    | every other card         | <sup>1.2</sup>                                                                                                                                                                                                                                                                                                           |
| `cardDropDelayMs`        | `number`                                                             | `450`                    | <sup>1.2</sup> How long a lifted card rests on the middle of another before that card becomes the target.                                                                                                                                                                                                                |
| `selectable`             | `boolean`                                                            | `true`                   | Multi-select. Off with `readOnly`. See [Several cards at once](../README.md#several-cards-at-once).                                                                                                                                                                                                                      |
| `selection`              | `readonly string[]`                                                  | board-managed            | Controlled selection, as card ids.                                                                                                                                                                                                                                                                                       |
| `onSelectionChange`      | `(itemIds: string[]) => void`                                        |                          | The selection changed.                                                                                                                                                                                                                                                                                                   |
| `onColumnOrderChange`    | `(columnIds: string[]) => void`                                      |                          | Turns on column reordering. The board does not change `groupBy`: save the order and pass the columns back in it. See [Reorder columns and lanes](../README.md#reorder-columns-and-lanes).                                                                                                                                |
| `onLaneOrderChange`      | `(laneIds: string[]) => void`                                        |                          | The same for swimlanes.                                                                                                                                                                                                                                                                                                  |
| `highlightExternalMoves` | `boolean`                                                            | `true`                   | When `items` moves a card to another cell by itself, the card flashes once and screen readers hear where it went.                                                                                                                                                                                                        |
| `dock`                   | `boolean \| DropDockOptions`                                         | `true`                   | The drop dock. `false` turns it off. See [`dock`](#dock) and [Drop dock and undo](../README.md#drop-dock-and-undo).                                                                                                                                                                                                      |
| `haptics`                | `boolean \| HapticHandler`                                           | `true`                   | A light haptic when a card lifts. `true` uses `expo-haptics` or `react-native-haptic-feedback` when the app has one, and does nothing otherwise. See [Haptics](recipes.md#haptics).                                                                                                                                      |
| `undo`                   | `boolean \| UndoOptions`                                             | `false`                  | A banner with an Undo button after each move a person makes. `ref.undo()` works without it. See [`undo`](#undo).                                                                                                                                                                                                         |
| `readOnly`               | `boolean`                                                            | `false`                  | Display only. Scrolling, paging, collapse and Show more stay on. Drag, swipe, the Move sheet, selection, card actions and screen-reader move actions are off.                                                                                                                                                            |
| `moveModes`              | `MoveModes`                                                          | see [below](#movemodes)  | Which ways of moving a card are on. See [Ways to move a card](../README.md#ways-to-move-a-card).                                                                                                                                                                                                                         |
| `onDragStart`            | `(event: DragStartEvent) => void`                                    |                          | A card lifted.                                                                                                                                                                                                                                                                                                           |
| `onDragOver`             | `(event: DragOverEvent) => void`                                     |                          | The drop target changed while dragging.                                                                                                                                                                                                                                                                                  |
| `onDragEnd`              | `(event: DragEndEvent) => void`                                      |                          | The drag ended, with a drop or a cancel.                                                                                                                                                                                                                                                                                 |
| `settleTimeoutMs`        | `number`                                                             | `5000`                   | How long a resolved move may wait for `items` to show it before the overlay is dropped. `0` waits forever.                                                                                                                                                                                                               |
| `inflightTimeoutMs`      | `number`                                                             | `30000`                  | How long `onMove` may stay pending before the move rolls back with a `MoveTimeoutError` and `signal` aborts. `0` waits forever. See [Asking for input](recipes.md#asking-for-input-before-a-move-required-fields).                                                                                                       |
| `rankStrategy`           | `RankStrategy`                                                       | `fractionalRank`         | Replaces the rank math.                                                                                                                                                                                                                                                                                                  |

#### `groupBy`

`GroupBy<T>`:

| Field     | Type           | Notes                                      |
| --------- | -------------- | ------------------------------------------ |
| `columns` | `GroupAxis<T>` | Required. The field that makes columns.    |
| `lanes`   | `GroupAxis<T>` | Optional. Adds swimlanes as a second axis. |

`GroupAxis<T>`:

| Field      | Type                                       | Default     | Notes                                                                                                          |
| ---------- | ------------------------------------------ | ----------- | -------------------------------------------------------------------------------------------------------------- |
| `key`      | `string`                                   | required    | Field name written into `MoveOperation.changes`, such as `'status'`.                                           |
| `values`   | `readonly GroupValue[]`                    | required    | Columns or lanes, in order. A value with no cards is still a column or lane.                                   |
| `getKey`   | `(item: T) => string \| null \| undefined` | `item[key]` | Reads the group key. `null`, `undefined`, `''` and unknown values go to the No value column or lane.           |
| `applyKey` | `(item: T, value: string \| null) => T`    |             | Writes a key. The board never calls it. `applyMove` and the testing kit use it. `null` is the No value bucket. |

`GroupValue`:

| Field   | Type     | Notes                                                                                     |
| ------- | -------- | ----------------------------------------------------------------------------------------- |
| `id`    | `string` | Must not contain `::`. Lane ids cannot end with `:` and column ids cannot start with `:`. |
| `label` | `string` | Shown in headers, tabs, the Move sheet and screen-reader labels.                          |
| `color` | `string` | Optional accent for headers and the Move sheet. Display only.                             |

The No value column or lane has the id `NO_VALUE_ID` and the label `labels.noValue`. It appears only when a card lands in it.

#### `moveModes`

`MoveModes`:

| Field            | Type                          | Default  | Notes                                                                                                                                                                                                |
| ---------------- | ----------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `drag`           | `'auto' \| 'handle' \| false` | `'auto'` | `'auto'`: long-press anywhere on a card. `'handle'`: drag only from a `<DragHandle>`, with no long press. `false`: no drag.                                                                          |
| `sheet`          | `'auto' \| 'manual' \| false` | `'auto'` | The Move sheet, from the card's "…" button. `'manual'` keeps the sheet and leaves the button to you: call `info.openMoveSheet()`. `false` removes it. Screen-reader move actions stay in every mode. |
| `longPressSheet` | `boolean`                     | `true`   | With long-press drag, a long press released without moving opens the Move sheet. No effect in handle mode or without the sheet.                                                                      |
| `swipe`          | `'auto' \| false`             | `false`  | Experimental. Swipe a card sideways to move it to the next column. Only in the `multi` and `fit` layouts.                                                                                            |

#### `dock`

`DropDockOptions`:

| Field     | Type                           | Default | Notes                                                                                                                                    |
| --------- | ------------------------------ | ------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `columns` | `boolean \| readonly string[]` | `true`  | Column chips. A drop on one moves the card to the top of that column, in its own lane. A list of ids shows those columns, in that order. |
| `actions` | `boolean`                      | `true`  | `cardActions` as drop targets.                                                                                                           |

#### `undo`

`UndoOptions`:

| Field       | Type     | Default | Notes                                                                                   |
| ----------- | -------- | ------- | --------------------------------------------------------------------------------------- |
| `timeoutMs` | `number` | `5000`  | How long the banner stays, in ms. While a screen reader runs, it stays until dismissed. |

The banner shows for moves with `source` `drag`, `sheet`, `swipe` or `accessibility`, not `api`. See [Undo](recipes.md#undo).

#### `CardAction`

| Field   | Type        | Notes                                                         |
| ------- | ----------- | ------------------------------------------------------------- |
| `key`   | `string`    | Passed back as `CardActionEvent.action`.                      |
| `label` | `string`    | Shown in the dock, the sheet and as the screen-reader action. |
| `icon`  | `ReactNode` | Optional. Drawn before the label in the dock and the sheet.   |
| `color` | `string`    | Optional label and icon tint. Default: `theme.text`.          |

### Layout and navigation

| Prop                       | Type                            | Default         | Notes                                                                                                                                           |
| -------------------------- | ------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `layout`                   | `BoardLayout`                   | `'auto'`        | See the [layout values](#boardlayout) and [Layouts](../README.md#layouts).                                                                      |
| `autoBreakpoint`           | `number`                        | `600`           | Under `layout="auto"`, boards narrower than this many points are `paged`, wider ones `multi`.                                                   |
| `pagerIndicator`           | `'tabs' \| 'dots' \| 'none'`    | `'tabs'`        | Paged layout only. Column chips above the board, page dots, or nothing.                                                                         |
| `initialColumnId`          | `string`                        |                 | The column to show first. Ignored once `columnId` is set.                                                                                       |
| `columnId`                 | `string`                        |                 | The column to keep on screen. Changing it scrolls there. Update it from `onColumnChange`.                                                       |
| `onColumnChange`           | `(columnId: string) => void`    |                 | The column now on screen: the page in `paged`, the first fully visible column in `multi`, `fit` and `planner`.                                  |
| `hideEmptyColumns`         | `boolean`                       | `false`         | Leaves out columns with no cards in any lane. The dock and the Move sheet still list them.                                                      |
| `hideEmptyLanes`           | `boolean`                       | `false`         | Swimlanes: leaves out lanes with no cards. The Move sheet still lists them.                                                                     |
| `overview`                 | `boolean`                       | `false`         | Experimental. Pinch in to see every column at once. Boards without lanes, in `paged`, `multi` and `fit`. See [Overview](../README.md#overview). |
| `overviewOpen`             | `boolean`                       | board-managed   | Controlled overview state. Needs `overview`.                                                                                                    |
| `onOverviewChange`         | `(open: boolean) => void`       |                 | The overview opened or closed.                                                                                                                  |
| `collapsibleColumns`       | `boolean`                       | on in `stacked` | Collapse toggles on column headers. Never in `paged` or `matrix`.                                                                               |
| `collapsedColumns`         | `readonly string[]`             | board-managed   | Controlled list of collapsed column ids.                                                                                                        |
| `onCollapsedColumnsChange` | `(columnIds: string[]) => void` |                 | The collapsed columns changed.                                                                                                                  |
| `collapsibleLanes`         | `boolean`                       | `true`          | Collapse toggles on lane headers in swimlanes.                                                                                                  |
| `collapsedLanes`           | `readonly string[]`             | board-managed   | Controlled list of collapsed lane ids.                                                                                                          |
| `onCollapsedLanesChange`   | `(laneIds: string[]) => void`   |                 | The collapsed lanes changed.                                                                                                                    |
| `laneCellLimit`            | `number`                        | `50`            | Cards shown per swimlane cell before Show more. Values below 1 count as 1.                                                                      |
| `autoScroll`               | `boolean`                       | `true`          | Scrolls the board while a card is held near an edge.                                                                                            |
| `longPressDelay`           | `number`                        | `200`           | Hold time in ms before a drag starts. The source documents a range of 150 to 250.                                                               |

#### `BoardLayout`

| Value     | What it does                                                                                                                                                                             |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auto`    | `paged` below `autoBreakpoint`, else `multi`.                                                                                                                                            |
| `paged`   | One column per page with snapping and a peek of the next one. Renders the visible page and one on each side.                                                                             |
| `multi`   | Fixed-width columns side by side, scrolling sideways. Width is `theme.columnWidth`.                                                                                                      |
| `fit`     | Columns share the width down to `theme.minColumnWidth`, then the board scrolls sideways.                                                                                                 |
| `stacked` | One vertical list with a collapsible section per column.                                                                                                                                 |
| `matrix`  | Swimlane boards only. Lanes are rows, every cell is on screen and scrolls on its own. Without lanes it draws as `fit`. When the board is too short for its lanes, it draws as swimlanes. |
| `planner` | A column per day, like `multi`, with day headers, today marked, weekends dimmed and a Today button. Column ids are `YYYY-MM-DD`. See [Week planner](../README.md#week-planner).          |

Swimlanes are not a layout. Add `groupBy.lanes` to any layout.

### Showing data

| Prop             | Type                                       | Default         | Notes                                                                                                                                          |
| ---------------- | ------------------------------------------ | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `columnLimits`   | `Readonly<Record<string, number>>`         |                 | Work-in-progress limits by column id. Headers show the count against the limit with a meter. A limit that is not a positive number is ignored. |
| `limitBehavior`  | `LimitBehavior`                            | `'warn'`        | `'warn'` colors the header. `'block'` refuses drops into a full column everywhere: drag, dock, sheet and screen reader.                        |
| `getItemValue`   | `(item: T) => number \| null \| undefined` |                 | A number per card, such as a deal amount. Headers show each column's sum. Non-finite values are skipped.                                       |
| `formatValue`    | `(value: number) => string`                | `formatCompact` | How header sums read, such as `12.4k`.                                                                                                         |
| `spotlight`      | `(item: T) => boolean`                     |                 | Cards it returns `false` for fade back and keep their place. Moving still works.                                                               |
| `getItemAge`     | `(item: T) => number \| null \| undefined` |                 | A card's age in days. Passed to `renderCard` as `age`. Negative values count as 0, non-finite values as no age.                                |
| `staleAfterDays` | `number`                                   | `14`            | Cards at least this many days old are `stale`.                                                                                                 |
| `onEdgeReached`  | `(edge: 'start' \| 'end') => void`         |                 | The board reached its first or last column. Fires in `planner`, `multi` and `fit`, and once per width on a board that fits the screen.         |

See [Your data at a glance](../README.md#your-data-at-a-glance).

### Loading

| Prop                 | Type                               | Default | Notes                                                                                                                                                           |
| -------------------- | ---------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `onColumnEndReached` | `(columnId: string) => void`       |         | The user reached the end of a column. The board does not fetch. It fires again only after your append moves the end off screen and the user scrolls back to it. |
| `loadingColumns`     | `readonly string[]`                |         | Column ids that are fetching. A spinner shows where `onColumnEndReached` fired.                                                                                 |
| `columnTotals`       | `Readonly<Record<string, number>>` |         | Server card counts by column id. Headers, tabs, limits and screen-reader labels use them instead of the loaded count.                                           |
| `onRefresh`          | `() => void`                       |         | Pull down on a list to refresh. The board does not fetch.                                                                                                       |
| `refreshing`         | `boolean`                          | `false` | Shows the pull-to-refresh spinner. Needs `onRefresh`.                                                                                                           |

Where `onColumnEndReached` fires depends on the layout. In `paged`, `multi` and `fit` it fires for the column that was scrolled. Swimlanes share one vertical list, so the bottom of that list fires it once per column. `stacked` fires it for the last column. See [Loading data](../README.md#loading-data) and [Columns loaded in pages](recipes.md#columns-loaded-in-pages).

### Appearance and rendering

| Prop                  | Type                                          | Default         | Notes                                                                                                                                                                                                                                                                                                 |
| --------------------- | --------------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `appearance`          | `'auto' \| 'light' \| 'dark'`                 | `'auto'`        | `'auto'` follows the system color scheme.                                                                                                                                                                                                                                                             |
| `density`             | `'comfortable' \| 'compact'`                  | `'comfortable'` | `'compact'` applies `compactMetrics`.                                                                                                                                                                                                                                                                 |
| `theme`               | `Partial<BoardTheme>`                         |                 | Overrides any token. Wins over `themePreset`, `density` and `motion`. See [Theme tokens](#theme-tokens-boardtheme).                                                                                                                                                                                   |
| `labels`              | `Partial<BoardLabels>`                        |                 | Overrides any string. See [Labels](#labels-boardlabels).                                                                                                                                                                                                                                              |
| `themePreset`         | `ThemePresetName`                             | `'standard'`    | A built-in palette for light and dark. See [Presets](#presets).                                                                                                                                                                                                                                       |
| `motion`              | `MotionPreset`                                | `'standard'`    | Feel of lift, landing, the dock and the banner. Reduced motion still wins. See [Motion presets](#motion-presets).                                                                                                                                                                                     |
| `stickyHeaders`       | `boolean`                                     | `true`          | Lane headers in swimlanes and section headers in `stacked` stay pinned while their cards scroll.                                                                                                                                                                                                      |
| `cardMarks`           | `'auto' \| 'manual'`                          | `'auto'`        | The marks the board draws over your card: selection check and outline, highlight ring, pointer outline, spotlight fade, and the stacked edge and count on a dragged selection. `'manual'` draws none of them. Your card reads `selected`, `highlighted`, `hovered`, `dimmed` and `dragCount` instead. |
| `renderColumnHeader`  | `(info: ColumnHeaderRenderInfo) => ReactNode` | built in        | See [`ColumnHeaderRenderInfo`](#columnheaderrenderinfo).                                                                                                                                                                                                                                              |
| `renderLaneHeader`    | `(info: LaneHeaderRenderInfo) => ReactNode`   | built in        | See [`LaneHeaderRenderInfo`](#laneheaderrenderinfo).                                                                                                                                                                                                                                                  |
| `renderEmptyCell`     | `(info: EmptyCellRenderInfo) => ReactNode`    | built in        | See [`EmptyCellRenderInfo`](#emptycellrenderinfo).                                                                                                                                                                                                                                                    |
| `renderColumnFooter`  | `(info: ColumnFooterRenderInfo) => ReactNode` |                 | See [`ColumnFooterRenderInfo`](#columnfooterrenderinfo).                                                                                                                                                                                                                                              |
| `renderDropIndicator` | `() => ReactNode`                             | built in        | Draws the drop line. Takes no arguments.                                                                                                                                                                                                                                                              |
| `ref`                 | `Ref<BoardHandle>`                            |                 | See [Ref handle](#ref-handle-boardhandle).                                                                                                                                                                                                                                                            |
| `style`               | `StyleProp<ViewStyle>`                        |                 | Applied to the board's root `GestureHandlerRootView`.                                                                                                                                                                                                                                                 |
| `testID`              | `string`                                      |                 | Set on the board's root view.                                                                                                                                                                                                                                                                         |

## Ref handle (`BoardHandle`)

Pass `ref` to get imperative controls. See [Moving cards from code](../README.md#moving-cards-from-code).

```tsx
const board = useRef<BoardHandle>(null);
<Board ref={board} /* … */ />;
```

| Method           | Signature                                                                  | Returns             | Notes                                                                                                                                                                                                                                                                |
| ---------------- | -------------------------------------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scrollToColumn` | `scrollToColumn(columnId: string, options?: { animated?: boolean }): void` | `void`              | Scrolls a column into view. `animated` defaults to `true`.                                                                                                                                                                                                           |
| `scrollToItem`   | `scrollToItem(itemId: string, options?: ScrollToItemOptions): void`        | `void`              | Scrolls a card into view. See [`ScrollToItemOptions`](#scrolltoitemoptions).                                                                                                                                                                                         |
| `moveItem`       | `moveItem(itemId: string, to: MoveDestination): boolean`                   | `boolean`           | Moves a card the way a drop does: on screen at once, then `onMove` with `source: 'api'`, and a rollback if it rejects. `canDrop` and `readOnly` apply. `false` when nothing was queued: an unknown card or column, a refused target, or a move that changes nothing. |
| `moveItems`      | `moveItems(itemIds: readonly string[], to: MoveDestination): number`       | `number`            | Moves several cards to one cell together, in board order. One `onMove` per card, each with the same `op.batch.id`. Returns how many moved. Refused cards stay where they are.                                                                                        |
| `openMoveSheet`  | `openMoveSheet(itemId: string): void`                                      | `void`              | Opens the Move sheet for a card, or for the whole selection when the card is in it. Does nothing when the sheet is off.                                                                                                                                              |
| `closeMoveSheet` | `closeMoveSheet(): void`                                                   | `void`              | Closes the Move sheet.                                                                                                                                                                                                                                               |
| `undo`           | `undo(): boolean`                                                          | `boolean`           | Reverts the newest move whose cards are still where they landed, through `onMove` with `source: 'undo'`. A batch comes back as one batch. Moves made by undo are not undone again. `false` when there is nothing to undo or the target refuses the cards.            |
| `canUndo`        | `canUndo(): boolean`                                                       | `boolean`           | Whether `undo()` has a move to revert.                                                                                                                                                                                                                               |
| `setSelection`   | `setSelection(itemIds: readonly string[]): void`                           | `void`              | Replaces the selection. An empty list ends it. Ignored with `selectable={false}`.                                                                                                                                                                                    |
| `getSelection`   | `getSelection(): readonly string[]`                                        | `readonly string[]` | The selected card ids.                                                                                                                                                                                                                                               |
| `setOverview`    | `setOverview(open: boolean, columnId?: string): void`                      | `void`              | Experimental. Opens or closes the overview. Closing with a `columnId` scrolls to that column. Needs `overview`.                                                                                                                                                      |

## Render info types

### `CardRenderInfo<T>`

Passed to `renderCard`. The lifted copy that follows the finger gets its own info, with `dragging: true`.

| Field            | Type                 | Notes                                                                                                         |
| ---------------- | -------------------- | ------------------------------------------------------------------------------------------------------------- |
| `item`           | `T`                  | Your item.                                                                                                    |
| `cellId`         | `string`             | The cell the card is in, as `{laneKey}::{columnKey}`. See [`cellId`](#ids-and-constants).                     |
| `index`          | `number`             | Position in its cell, pending moves included.                                                                 |
| `count`          | `number`             | Cards in the cell.                                                                                            |
| `column`         | `GroupValue`         | The card's column.                                                                                            |
| `lane`           | `GroupValue \| null` | The card's lane. `null` on boards without lanes.                                                              |
| `pending`        | `boolean`            | A move of this card is waiting for `onMove` or for your data to show it.                                      |
| `dragging`       | `boolean`            | `true` for the lifted copy.                                                                                   |
| `compact`        | `boolean`            | The column is narrow (cards under 200pt wide). Show less.                                                     |
| `dimmed`         | `boolean`            | `spotlight` is set and this card is outside it. The board fades it unless `cardMarks` is `'manual'`.          |
| `age`            | `number \| null`     | `getItemAge` for this card, in days, or `null`.                                                               |
| `stale`          | `boolean`            | `age` has reached `staleAfterDays`.                                                                           |
| `selected`       | `boolean`            | The card is in the selection. The board draws a check and an outline unless `cardMarks` is `'manual'`.        |
| `selecting`      | `boolean`            | A selection is open. A tap on a card selects it instead of reaching your `onPress`.                           |
| `highlighted`    | `boolean`            | `scrollToItem` with `highlight`, or a move from your data, points at this card for a moment.                  |
| `hovered`        | `boolean`            | A pointer (mouse, trackpad) is over the card.                                                                 |
| `dragCount`      | `number`             | On the lifted copy: how many cards this drag moves, more than 1 when it carries the selection. `0` elsewhere. |
| `openMoveSheet`  | `() => void`         | Opens the Move sheet for this card. Use it with `moveModes={{ sheet: 'manual' }}`.                            |
| `toggleSelected` | `() => void`         | Adds the card to the selection, or takes it out.                                                              |

### `ColumnHeaderRenderInfo`

Passed to `renderColumnHeader`.

| Field             | Type                 | Notes                                                                                                  |
| ----------------- | -------------------- | ------------------------------------------------------------------------------------------------------ |
| `column`          | `GroupValue`         | The column.                                                                                            |
| `count`           | `number`             | Cards the board has for this column.                                                                   |
| `total`           | `number`             | `columnTotals` for this column, or `count` when you pass none.                                         |
| `collapsed`       | `boolean`            | The column is collapsed.                                                                               |
| `compact`         | `boolean`            | The column is narrow (under 180pt). Stack the header instead of truncating.                            |
| `toggleCollapsed` | `() => void`         | Optional. Present when the column can collapse in this layout.                                         |
| `limit`           | `number \| null`     | `columnLimits` for this column, or `null`.                                                             |
| `limitState`      | `LimitState`         | `total` against `limit`. `'none'` without a limit.                                                     |
| `value`           | `number \| null`     | Sum of `getItemValue` over the column's cards, or `null` without it.                                   |
| `valueLabel`      | `string \| null`     | `value` through `formatValue`, or `null`.                                                              |
| `day`             | `PlannerDay \| null` | In the planner, the day this column is. `null` elsewhere and for non-date columns.                     |
| `openColumnSheet` | `() => void`         | Optional. Present when `onColumnOrderChange` is set. Opens the column's sheet, with move and collapse. |

### `LaneHeaderRenderInfo`

Passed to `renderLaneHeader`.

| Field             | Type                   | Notes                                                                                              |
| ----------------- | ---------------------- | -------------------------------------------------------------------------------------------------- |
| `lane`            | `GroupValue`           | The lane.                                                                                          |
| `count`           | `number`               | Cards in the lane.                                                                                 |
| `collapsed`       | `boolean`              | The lane is collapsed.                                                                             |
| `toggleCollapsed` | `() => void`           | Optional. Present when lanes can collapse (`collapsibleLanes`).                                    |
| `openLaneSheet`   | `() => void`           | Optional. Present when `onLaneOrderChange` is set. Opens the lane's sheet, with move and collapse. |
| `distribution`    | `readonly LaneShare[]` | The lane's cards per column, in column order. The default header draws it as a bar.                |

### `EmptyCellRenderInfo`

Passed to `renderEmptyCell`.

| Field    | Type                 | Notes                       |
| -------- | -------------------- | --------------------------- |
| `column` | `GroupValue`         | The cell's column.          |
| `lane`   | `GroupValue \| null` | The cell's lane, or `null`. |

### `ColumnFooterRenderInfo`

Passed to `renderColumnFooter`.

| Field     | Type                 | Notes                              |
| --------- | -------------------- | ---------------------------------- |
| `column`  | `GroupValue`         | The column.                        |
| `lane`    | `GroupValue \| null` | The lane, or `null`.               |
| `count`   | `number`             | Cards in the cell.                 |
| `loading` | `boolean`            | The column is in `loadingColumns`. |

### Supporting types

| Type         | Shape                                                                         | Notes                                                                             |
| ------------ | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `LimitState` | `'none' \| 'under' \| 'at' \| 'over'`                                         | Where a column stands against its limit. `'at'` is full: one more card goes over. |
| `LaneShare`  | `{ readonly column: GroupValue; readonly count: number }`                     | One entry of `LaneHeaderRenderInfo.distribution`.                                 |
| `PlannerDay` | `{ readonly date: Date; readonly today: boolean; readonly weekend: boolean }` | The day of a planner column. `weekend` is Saturday or Sunday.                     |

## Components, hooks and helpers

### `Board`

`function Board<T>(props: BoardProps<T>)`. See [`<Board>` props](#board-props). The board renders its own `GestureHandlerRootView`. Keep one at your app root as well.

### `CardView`

A ready-made card for `renderCard`. It follows the board theme. The board accepts any view, so it is optional.

| Prop          | Type                   | Default  | Notes                                                                                        |
| ------------- | ---------------------- | -------- | -------------------------------------------------------------------------------------------- |
| `title`       | `string`               | required | Up to three lines.                                                                           |
| `description` | `string`               |          | Up to two lines, in `mutedText`. Hidden when `compact`.                                      |
| `tags`        | `readonly CardTag[]`   |          | Small chips. Hidden when `compact`.                                                          |
| `meta`        | `string`               |          | Small text in the footer, such as a due date.                                                |
| `assignee`    | `string`               |          | Shown as initials in the footer.                                                             |
| `accentColor` | `string`               |          | A colored bar on the leading edge, such as priority.                                         |
| `pending`     | `boolean`              | `false`  | Pass `info.pending` for a quiet saving dot.                                                  |
| `dragging`    | `boolean`              | `false`  | Pass `info.dragging` for the lifted look: accent border and a larger shadow and `elevation`. |
| `compact`     | `boolean`              | `false`  | Pass `info.compact` in narrow columns: title and accent only.                                |
| `onPress`     | `() => void`           |          | Wraps the card in a `Pressable`.                                                             |
| `style`       | `StyleProp<ViewStyle>` |          | Applied to the card body.                                                                    |
| `leading`     | `ReactNode`            |          | Drawn before the content, after the accent bar. The slot for a `<DragHandle />`.             |
| `age`         | `number \| null`       |          | Pass `info.age` for a chip such as `12d` in the footer. Rounded.                             |
| `stale`       | `boolean`              | `false`  | Pass `info.stale`: the age chip turns the warning color.                                     |
| `children`    | `ReactNode`            |          | Drawn after the tags, before the footer. Hidden when `compact`.                              |

`CardTag`:

| Field   | Type     | Notes                                                                           |
| ------- | -------- | ------------------------------------------------------------------------------- |
| `label` | `string` | The tag text. Also its React key, so keep labels unique per card.               |
| `color` | `string` | Optional. Text color, and a tint of it as the background. Default: `mutedText`. |

### `DragHandle`

Put it in `renderCard` and pass `moveModes={{ drag: 'handle' }}`. A drag then starts from the handle as soon as the finger moves, and the rest of the card keeps its taps and scrolling. In the other drag modes it only draws its children. Screen readers skip it. See [Drag handles](../README.md#drag-handles).

`DragHandleProps`:

| Prop       | Type                   | Default        | Notes                                      |
| ---------- | ---------------------- | -------------- | ------------------------------------------ |
| `children` | `ReactNode`            | a six-dot grip | What to draw. The grip uses `mutedText`.   |
| `style`    | `StyleProp<ViewStyle>` |                | Applied to the handle area.                |
| `hitSlop`  | `number`               | `8`            | Extra touch area on every side, in points. |

### `BoardDropScope` and `BoardDropTarget` <sup>1.2</sup>

Views outside the board that take a lifted card, such as a calendar slot, an avatar or a trash can. Wrap the board and the targets in one `BoardDropScope`. A drop calls the target's `onDrop` and moves nothing. Auto-scroll stops while a card is over a target.

`BoardDropTargetProps<T>`:

| Prop       | Type                                                                           | Default    | Notes                                            |
| ---------- | ------------------------------------------------------------------------------ | ---------- | ------------------------------------------------ |
| `id`       | `string`                                                                       |            | Unique in the scope.                             |
| `onDrop`   | `(event: BoardDropTargetEvent<T>) => void`                                     |            | `targetId`, `itemId`, `item`, `itemIds`, `from`. |
| `accepts`  | `(item: T) => boolean`                                                         | every card |                                                  |
| `style`    | `StyleProp<ViewStyle>`                                                         |            |                                                  |
| `children` | `ReactNode \| ((state: { dragging: boolean; hovered: boolean }) => ReactNode)` |            | Draw the target lit while a card is over it.     |

### `useBoardTheme`

`function useBoardTheme(): BoardTheme`. The resolved theme of the surrounding board, or `lightTheme` outside a board. It reads only the theme, so a card that uses it does not redraw with other board changes.

### Planner and value helpers

| Export          | Signature                                                                           | Notes                                                                                                                              |
| --------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `dayColumns`    | `dayColumns(start: Date, count: number, options?: DayColumnsOptions): GroupValue[]` | Columns for `layout="planner"`: `count` days from `start`, with `YYYY-MM-DD` ids and short date labels from `Intl.DateTimeFormat`. |
| `toDayId`       | `toDayId(date: Date): string`                                                       | `YYYY-MM-DD` for a date, in local time.                                                                                            |
| `parseDayId`    | `parseDayId(id: string): Date \| null`                                              | The local date an id names, or `null` for any other id, including dates that do not exist such as `2026-02-31`.                    |
| `addDays`       | `addDays(date: Date, days: number): Date`                                           | A new date `days` later, at local midnight. Negative `days` go back.                                                               |
| `formatCompact` | `formatCompact(value: number): string`                                              | The default `formatValue`. `1234` is `1.2k`, `1500000` is `1.5M`, `12` is `12`. Suffixes `k`, `M`, `B`, `T`.                       |

`DayColumnsOptions`:

| Field    | Type                                  | Default           | Notes                                         |
| -------- | ------------------------------------- | ----------------- | --------------------------------------------- |
| `locale` | `string`                              | the device locale | `Intl` locale for the labels.                 |
| `color`  | `(date: Date) => string \| undefined` |                   | A column color per day, such as for holidays. |

## Theme and labels

See [Theming](../README.md#theming) for examples.

The board builds its theme in this order, and each step overrides the one before:

1. `lightTheme` or `darkTheme`, from `appearance`.
2. The `themePreset` palette, unless it is `'standard'`.
3. `compactMetrics`, when `density="compact"`.
4. The `motion` preset's `liftScale`, `liftTilt` and `dropDuration`.
5. Your `theme` overrides.

### Theme tokens (`BoardTheme`)

Colors are strings. The `standard` defaults:

| Token                  | Light                    | Dark                        | Notes                                                                   |
| ---------------------- | ------------------------ | --------------------------- | ----------------------------------------------------------------------- |
| `background`           | `#F3F4F7`                | `#0E1116`                   | Board background.                                                       |
| `columnBackground`     | `#E9EBF0`                | `#171B22`                   | Columns and cells.                                                      |
| `columnBorder`         | `transparent`            | `transparent`               |                                                                         |
| `laneHeaderBackground` | `#DFE2E9`                | `#1F242D`                   |                                                                         |
| `cardBackground`       | `#FFFFFF`                | `#222833`                   |                                                                         |
| `cardBorder`           | `rgba(15, 23, 42, 0.08)` | `rgba(255, 255, 255, 0.06)` |                                                                         |
| `text`                 | `#162033`                | `#E8ECF2`                   |                                                                         |
| `mutedText`            | `#5B677A`                | `#98A2B3`                   |                                                                         |
| `accent`               | `#2F6FEB`                | `#6EA0FF`                   | Drop line, drop-target outline, active tab.                             |
| `reject`               | `#D93F3F`                | `#FF7A7A`                   | Outline over a cell that refuses the card, and a column over its limit. |
| `warning`              | `#B45309`                | `#F2B544`                   | A column at its limit, and stale cards.                                 |
| `emptyCellBorder`      | `#C3C9D4`                | `#363E4C`                   |                                                                         |
| `sheetBackground`      | `#FFFFFF`                | `#1A1F27`                   | Move sheet, header sheets and the drop dock.                            |
| `sheetBackdrop`        | `rgba(9, 18, 36, 0.45)`  | `rgba(0, 0, 0, 0.62)`       |                                                                         |
| `sheetDivider`         | `#E3E6EC`                | `#2A313C`                   |                                                                         |

Metrics are numbers, in points. Light and dark share them:

| Token                  | Comfortable | Compact | Notes                                                                           |
| ---------------------- | ----------- | ------- | ------------------------------------------------------------------------------- |
| `radius`               | `14`        | `10`    | Corner radius of columns and cells.                                             |
| `cardRadius`           | `10`        | `8`     |                                                                                 |
| `columnWidth`          | `300`       | `256`   | Column width in the `multi` layout.                                             |
| `collapsedColumnWidth` | `48`        | `40`    | Width of a collapsed column strip.                                              |
| `minColumnWidth`       | `136`       | `112`   | The `fit` layout never shrinks columns below this. It scrolls sideways instead. |
| `columnGap`            | `12`        | `8`     |                                                                                 |
| `cellPadding`          | `8`         | `6`     | Padding around cards inside a column or cell.                                   |
| `cardGap`              | `8`         | `6`     | Space between cards.                                                            |
| `cellMinHeight`        | `88`        | `64`    |                                                                                 |

Lift tokens. Density does not change them:

| Token               | Light  | Dark   | Notes                                                                                                                                        |
| ------------------- | ------ | ------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `liftScale`         | `1.03` | `1.03` | Scale of the lifted card. `1` keeps it flat. Reduced motion turns it off.                                                                    |
| `liftTilt`          | `0`    | `0`    | Tilt of the lifted card, in degrees. Reduced motion turns it off.                                                                            |
| `liftShadowOpacity` | `0.25` | `0.55` | iOS shadow under the lifted card, `0` to `1`, on top of your card's own. Android ignores it: give your card an `elevation` while `dragging`. |
| `dropDuration`      | `200`  | `200`  | Milliseconds a dropped card takes to land, or to fly home.                                                                                   |

Other:

| Token        | Type     | Default | Notes                                                                                 |
| ------------ | -------- | ------- | ------------------------------------------------------------------------------------- |
| `fontFamily` | `string` | not set | Optional. Text in `CardView`, the default headers, the sheets, the dock and the bars. |

### Presets

`themePreset` picks a palette with a light and a dark variant. A palette sets every color token and leaves metrics and lift tokens alone. Each passes WCAG AA for `text` and `mutedText` on cards and columns.

| `ThemePresetName` | Light `background` | Light `accent` | Dark `background` | Dark `accent` |
| ----------------- | ------------------ | -------------- | ----------------- | ------------- |
| `standard`        | `#F3F4F7`          | `#2F6FEB`      | `#0E1116`         | `#6EA0FF`     |
| `paper`           | `#F6F1E9`          | `#A8481F`      | `#1C1915`         | `#EE9468`     |
| `slate`           | `#EEF1F5`          | `#0F766E`      | `#0B1220`         | `#2DD4BF`     |
| `aurora`          | `#F4F2FB`          | `#6D28D9`      | `#0E0B1A`         | `#A78BFA`     |

The full palettes are in `themePresets`, typed `Record<'paper' | 'slate' | 'aurora', { light: Palette; dark: Palette }>`, where a palette has every color token of `BoardTheme`. `standard` is `lightTheme` and `darkTheme`.

### Motion presets

`motion` sets the lift tokens and how fast the dock, the banner and the sheet animate. `durationScale` multiplies those animation durations. `overshoot` gives the landing a spring.

| `MotionPreset` | `liftScale` | `liftTilt` | `dropDuration` | `durationScale` | `overshoot` |
| -------------- | ----------- | ---------- | -------------- | --------------- | ----------- |
| `standard`     | `1.03`      | `0`        | `200`          | `1`             | `false`     |
| `calm`         | `1.02`      | `0`        | `280`          | `1.4`           | `false`     |
| `snappy`       | `1.03`      | `0`        | `130`          | `0.7`           | `false`     |
| `playful`      | `1.06`      | `2.5`      | `320`          | `1.15`          | `true`      |

### Theme exports

| Export           | Type                                                                                                                                       | Notes                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------- |
| `lightTheme`     | `BoardTheme`                                                                                                                               | The `standard` light theme. |
| `darkTheme`      | `BoardTheme`                                                                                                                               | The `standard` dark theme.  |
| `compactMetrics` | `Pick<BoardTheme, 'radius' \| 'cardRadius' \| … \| 'cellMinHeight'>`                                                                       | The compact metrics above.  |
| `themePresets`   | `Record<'paper' \| 'slate' \| 'aurora', { light; dark }>`                                                                                  | Preset palettes.            |
| `motionPresets`  | `Record<MotionPreset, { lift: Pick<BoardTheme, 'liftScale' \| 'liftTilt' \| 'dropDuration'>; durationScale: number; overshoot: boolean }>` | Motion presets.             |
| `defaultLabels`  | `BoardLabels`                                                                                                                              | The English labels below.   |

### Labels (`BoardLabels`)

Pass `labels` with any subset. Every string the board shows or announces is here. Function labels get the arguments shown. In the defaults, `{where}` is `{column}`, or `{column}, lane {lane}` on boards with lanes.

**Cards and screen readers**

| Key                  | Type                                            | Default                                                                                                      |
| -------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `card`               | `(context: CardAccessibilityContext) => string` | `[Selected, ]{item}, {where}, {position} of {count}[, saving][, {staleDays} days old][, outside the filter]` |
| `emptyCell`          | `string`                                        | `No cards`                                                                                                   |
| `noValue`            | `string`                                        | `No value`. The No value column and lane.                                                                    |
| `openMenu`           | `string`                                        | `Options`. Screen-reader action and hint on a card for opening the sheet with a keyboard or pointer.         |
| `moveToColumnAction` | `(column: string) => string`                    | `Move to {column}`                                                                                           |
| `moveToLaneAction`   | `(lane: string) => string`                      | `Move to lane {lane}`                                                                                        |
| `moved`              | `(context: MoveAnnouncementContext) => string`  | `Moved {item} to {where}, {position} of {count}`                                                             |
| `movedMany`          | `(context: BatchAnnouncementContext) => string` | `Moved {count} cards to {where}`. Announced once `onMove` accepts the batch's last card.                     |
| `moveFailed`         | `(context: { item; column; lane }) => string`   | `Could not move {item}. It is back in {where}`                                                               |
| `externallyMoved`    | `(context: { item; column }) => string`         | `{item} moved to {column}`. Announced with `highlightExternalMoves`.                                         |

**Move sheet**

| Key              | Type                                           | Default                                                           |
| ---------------- | ---------------------------------------------- | ----------------------------------------------------------------- |
| `moveTo`         | `string`                                       | `Move to…`                                                        |
| `moveSheetTitle` | `(item: string) => string`                     | `Move “{item}”`                                                   |
| `moveManyTitle`  | `(count: number) => string`                    | `Move {count} cards`                                              |
| `currentPlace`   | `(context: MoveAnnouncementContext) => string` | `In {where} · {position} of {count}`. The sheet's subtitle.       |
| `column`         | `string`                                       | `Column`                                                          |
| `lane`           | `string`                                       | `Lane`                                                            |
| `position`       | `string`                                       | `Position`                                                        |
| `top`            | `string`                                       | `Top`                                                             |
| `bottom`         | `string`                                       | `Bottom`                                                          |
| `current`        | `string`                                       | `Current`                                                         |
| `cancel`         | `string`                                       | `Cancel`                                                          |
| `actions`        | `string`                                       | `Actions`. The section with `cardActions`.                        |
| `moveUp`         | `string`                                       | `Up`                                                              |
| `moveDown`       | `string`                                       | `Down`                                                            |
| `previousColumn` | `string`                                       | `Previous column`                                                 |
| `nextColumn`     | `string`                                       | `Next column`                                                     |
| `searchColumns`  | `string`                                       | `Find a column`. Placeholder of the column search.                |
| `noColumnsMatch` | `string`                                       | `No columns match`                                                |
| `full`           | `string`                                       | `Full`. Next to a column the sheet cannot use because it is full. |

**Columns, lanes and headers**

| Key              | Type                                        | Default                                                                                                                                                                                                                                         |
| ---------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `columnSummary`  | `(context: ColumnSummaryContext) => string` | `{column}, {total} cards`. With a limit, `{total} of {limit} cards`, then `, full` or `, over the limit`. With a sum, `, total {valueLabel}`. Planner columns start with the date and `, today`. What a screen reader says for a column header. |
| `columnTab`      | `(column: string, count: number) => string` | `{column}, {count} cards`                                                                                                                                                                                                                       |
| `showMore`       | `(hidden: number) => string`                | `Show {hidden} more`                                                                                                                                                                                                                            |
| `expandColumn`   | `(column: string) => string`                | `Expand {column}`                                                                                                                                                                                                                               |
| `collapseColumn` | `(column: string) => string`                | `Collapse {column}`                                                                                                                                                                                                                             |
| `expandLane`     | `(lane: string) => string`                  | `Expand lane {lane}`                                                                                                                                                                                                                            |
| `collapseLane`   | `(lane: string) => string`                  | `Collapse lane {lane}`                                                                                                                                                                                                                          |
| `loadingMore`    | `string`                                    | `Loading more cards`. The spinner at the end of a loading column.                                                                                                                                                                               |

**Column and lane reorder**

| Key                | Type                                               | Default                                                   |
| ------------------ | -------------------------------------------------- | --------------------------------------------------------- |
| `columnSheetTitle` | `(column: string) => string`                       | `Column “{column}”`                                       |
| `laneSheetTitle`   | `(lane: string) => string`                         | `Lane “{lane}”`                                           |
| `moveColumnLeft`   | `string`                                           | `Move left`                                               |
| `moveColumnRight`  | `string`                                           | `Move right`                                              |
| `moveColumnFirst`  | `string`                                           | `Move to start`                                           |
| `moveColumnLast`   | `string`                                           | `Move to end`                                             |
| `moveLaneUp`       | `string`                                           | `Move up`                                                 |
| `moveLaneDown`     | `string`                                           | `Move down`                                               |
| `moveLaneFirst`    | `string`                                           | `Move to top`                                             |
| `moveLaneLast`     | `string`                                           | `Move to bottom`                                          |
| `columnMoved`      | `(context: { column; position; count }) => string` | `Moved column {column} to position {position} of {count}` |
| `laneMoved`        | `(context: { lane; position; count }) => string`   | `Moved lane {lane} to position {position} of {count}`     |

**Undo**

| Key          | Type                                     | Default                                                                       |
| ------------ | ---------------------------------------- | ----------------------------------------------------------------------------- |
| `undoBanner` | `(context: UndoBannerContext) => string` | `Moved “{item}” to {where}`, or `Moved {count} cards to {where}` for a batch. |
| `undo`       | `string`                                 | `Undo`                                                                        |
| `dismiss`    | `string`                                 | `Dismiss`                                                                     |

**Selection**

| Key              | Type                        | Default            |
| ---------------- | --------------------------- | ------------------ |
| `select`         | `string`                    | `Select`           |
| `deselect`       | `string`                    | `Deselect`         |
| `selectedCount`  | `(count: number) => string` | `{count} selected` |
| `moveSelected`   | `string`                    | `Move`             |
| `clearSelection` | `string`                    | `Done`             |

**Overview and planner**

| Key             | Type     | Default                                      |
| --------------- | -------- | -------------------------------------------- |
| `overview`      | `string` | `Board overview`                             |
| `closeOverview` | `string` | `Back to the board`                          |
| `today`         | `string` | `Today`. The planner's button back to today. |

| Key                | Type                                           | Default                                                            |
| ------------------ | ---------------------------------------------- | ------------------------------------------------------------------ |
| `confirmMoveTitle` | `(context: { item; count; column }) => string` | `Move “Spec” to Done?`, or `Move 3 cards to Done?`. <sup>1.2</sup> |
| `confirmMove`      | `string`                                       | `Move`                                                             |
| `moveCancelled`    | `string`                                       | `Move cancelled`                                                   |
| `dropOnto`         | `string`                                       | `Drop onto a card…`                                                |
| `dropOntoTitle`    | `(item: string) => string`                     | `Drop “Spec” onto…`                                                |
| `searchCards`      | `string`                                       | `Search cards`                                                     |
| `noCardsMatch`     | `string`                                       | `No cards match`                                                   |
| `droppedOnto`      | `(context: { item; target }) => string`        | `Dropped Spec onto Copy`                                           |

#### Label context types

All fields are `readonly`.

| Type                       | Fields                                                                                                                                                                                                      |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CardAccessibilityContext` | `item: string`, `column: string`, `lane: string \| null`, `position: number`, `count: number`, `pending: boolean`, `dimmed: boolean`, `staleDays: number \| null` (only when stale), `selected: boolean`    |
| `MoveAnnouncementContext`  | `item: string`, `column: string`, `lane: string \| null`, `position: number`, `count: number`                                                                                                               |
| `BatchAnnouncementContext` | `count: number`, `column: string`, `lane: string \| null`                                                                                                                                                   |
| `UndoBannerContext`        | `item: string`, `column: string`, `lane: string \| null`, `count: number` (more than 1 for a batch)                                                                                                         |
| `ColumnSummaryContext`     | `column: string`, `total: number`, `limit: number \| null`, `limitState: LimitState`, `valueLabel: string \| null`, `date: string \| null` (planner columns, such as "Monday 19 October"), `today: boolean` |

`moveFailed` gets `{ item: string; column: string; lane: string | null }`. `externallyMoved` gets `{ item: string; column: string }`. `columnMoved` gets `{ column: string; position: number; count: number }`, and `laneMoved` the same with `lane`.

## Event and operation types

### `MoveOperation`

What `onMove` receives. One per card moved. See [How a move works](../README.md#how-a-move-works).

| Field        | Type                                       | Notes                                                                                                                                                   |
| ------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `opId`       | `string`                                   | Unique per move. Use it as an idempotency key.                                                                                                          |
| `id`         | `string`                                   | The card.                                                                                                                                               |
| `changes`    | `Readonly<Record<string, string \| null>>` | Only the grouped fields that change, by `GroupAxis.key`. A cross-lane drop has two. Empty for a reorder inside one cell. `null` is the No value bucket. |
| `from`       | `Readonly<Record<string, string \| null>>` | The same fields before the move, or their pending values when a move is already queued.                                                                 |
| `rank`       | `string`                                   | The card's new rank.                                                                                                                                    |
| `previousId` | `string \| null`                           | The visible card before it in the target cell, or `null` at the top.                                                                                    |
| `nextId`     | `string \| null`                           | The visible card after it, or `null` at the bottom.                                                                                                     |
| `source`     | `MoveSource`                               | What started the move.                                                                                                                                  |
| `batch`      | `MoveBatch`                                | Optional. Present only when several cards move together.                                                                                                |

`MoveBatch`: `{ readonly id: string; readonly index: number; readonly size: number }`. Every op of a batch shares `id`. `index` runs from `0` to `size - 1` in the order the board sends them.

`MoveSource`: `'drag' | 'sheet' | 'swipe' | 'accessibility' | 'api' | 'undo'`. `'undo'` is the board reverting an earlier move.

`MoveContext`: `{ readonly signal: AbortSignal }`. The signal aborts when the move times out or the board unmounts. Pass it to `fetch`.

### Targets and destinations

| Type              | Fields                                                           | Notes                                                                                                                                                                                                                                       |
| ----------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MoveTarget`      | `cellId: string`, `columnId: string`, `laneId: string \| null`   | A cell. `laneId` is `null` on boards without lanes. Used by `canDrop` and drag events.                                                                                                                                                      |
| `MoveDestination` | `columnId: string`, `laneId?: string`, `index?: number \| 'end'` | Where `moveItem` and `moveItems` put cards. `laneId` defaults to the card's lane. `index` counts without the moved card, defaults to `0` (the top), and is clamped. `'end'` is the bottom. `NO_VALUE_ID` names the No value column or lane. |

#### `ScrollToItemOptions`

| Field       | Type      | Default | Notes                                                |
| ----------- | --------- | ------- | ---------------------------------------------------- |
| `animated`  | `boolean` | `true`  |                                                      |
| `highlight` | `boolean` | `false` | Flashes an outline on the card once it is on screen. |

### Drag events

| Type             | Fields                                                             | Notes                                                                                                                                             |
| ---------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DragStartEvent` | `itemId: string`, `from: MoveTarget`, `itemIds: readonly string[]` | `itemIds` are the cards riding along: the draggable part of the selection, in board order, when the lifted card is selected, else only that card. |
| `DragOverEvent`  | `itemId: string`, `target: MoveTarget`, `index: number`            | The drop target changed. `index` is the insertion index in the target cell, after removing the dragged card.                                      |
| `DragEndEvent`   | `itemId: string`, `cancelled: boolean`                             | `cancelled` is `true` when the card went back: released outside a target, refused, or interrupted.                                                |

### Card actions

`CardActionEvent<T>`, passed to `onCardAction`:

| Field     | Type                                   | Notes                                                                                                                   |
| --------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `action`  | `string`                               | The `CardAction.key`.                                                                                                   |
| `itemId`  | `string`                               | The card the action was chosen on.                                                                                      |
| `item`    | `T`                                    | That card's item.                                                                                                       |
| `from`    | `MoveTarget`                           | Where the card was.                                                                                                     |
| `source`  | `'dock' \| 'sheet' \| 'accessibility'` | Where the action was chosen.                                                                                            |
| `itemIds` | `readonly string[]`                    | Every card the action applies to: the selection when the card is in it, else this card alone. Always includes `itemId`. |

### Haptics

`HapticEvent`: `'lift'`. The moments the board gives haptic feedback for.

`HapticHandler`: `(event: HapticEvent) => void`. Pass one as `haptics` to use your own.

### Errors

| Export             | Shape                                                | Notes                                                                                                                                                     |
| ------------------ | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MoveTimeoutError` | `class extends Error { readonly timeoutMs: number }` | `onMove` took longer than `inflightTimeoutMs`. The move rolls back, its signal aborts, and `onMoveError` gets this error. `name` is `'MoveTimeoutError'`. |

Any other value `onMove` throws or rejects with reaches `onMoveError` unchanged.

### Other types

| Type              | Shape                                                                         |
| ----------------- | ----------------------------------------------------------------------------- |
| `BoardLayout`     | `'auto' \| 'paged' \| 'multi' \| 'fit' \| 'stacked' \| 'matrix' \| 'planner'` |
| `LimitBehavior`   | `'warn' \| 'block'`                                                           |
| `MotionPreset`    | `'standard' \| 'calm' \| 'snappy' \| 'playful'`                               |
| `ThemePresetName` | `'standard' \| 'paper' \| 'slate' \| 'aurora'`                                |

## Testing kit

`react-native-board-view/testing` runs the board's own move code on plain data: planning, limits, `canDrop`, the optimistic queue, undo and batches. It renders nothing and needs no native mocks. It works in Jest and Vitest. See [Testing your board](../README.md#testing-your-board) for an example.

```ts
import { createBoardTester, type BoardTester, type BoardTesterOptions } from 'react-native-board-view/testing';
```

`createBoardTester<T>(options: BoardTesterOptions<T>): BoardTester<T>`

### `BoardTesterOptions<T>`

These props work as on `<Board>`: `items`, `getItemId`, `groupBy`, `getRank`, `getItemLabel`, `canDrop`, `readOnly`, `columnLimits`, `columnTotals`, `limitBehavior`, `rankStrategy`, `settleTimeoutMs`, `inflightTimeoutMs` and `onMoveError`. These differ:

| Option               | Type                                                                 | Default           | Notes                                                                                                                                                                                                                        |
| -------------------- | -------------------------------------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `onMove`             | `(op: MoveOperation, context: MoveContext) => Promise<void> \| void` | accept every move | Optional here.                                                                                                                                                                                                               |
| `labels`             | `Partial<BoardLabels>`                                               | `defaultLabels`   | Used for `announcements`.                                                                                                                                                                                                    |
| `applyAcceptedMoves` | `boolean \| ((item: T, op: MoveOperation) => T)`                     | `false`           | Applies each move to `items` once `onMove` resolves. `true` writes the grouped fields (through `applyKey` when set) and `item.rank`. Pass a function when your items keep the rank elsewhere. Off: call `setItems` yourself. |

### `BoardTester<T>`

| Member          | Signature                                                                                | Notes                                                                                                                                                          |
| --------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `column`        | `column(columnId: string, laneId?: string): string[]`                                    | Card ids in one cell, in display order, pending moves included. Without `laneId` on a swimlane board, every lane of the column.                                |
| `columns`       | `columns(): Record<string, string[]>`                                                    | Every column's card ids, by column id, all lanes together.                                                                                                     |
| `model`         | `model(): BoardModel<T>`                                                                 | The board as `<Board>` would draw it now.                                                                                                                      |
| `drag`          | `drag(itemId: string, to: MoveDestination): boolean`                                     | Moves a card as a drop does, with `source: 'drag'`. `false` when the board refuses it.                                                                         |
| `move`          | `move(itemId: string, to: MoveDestination, source?: MoveSource): boolean`                | Moves a card with another source. Default `'api'`.                                                                                                             |
| `moveMany`      | `moveMany(itemIds: readonly string[], to: MoveDestination, source?: MoveSource): number` | Moves several cards as a batch. Default source `'api'`. Returns how many moved.                                                                                |
| `canMove`       | `canMove(itemId: string, to: Pick<MoveDestination, 'columnId' \| 'laneId'>): boolean`    | Whether a drop of the card there would be taken. `laneId` defaults to the card's lane.                                                                         |
| `undo`          | `undo(): boolean`                                                                        | As `BoardHandle.undo`.                                                                                                                                         |
| `canUndo`       | `canUndo(): boolean`                                                                     | As `BoardHandle.canUndo`.                                                                                                                                      |
| `isPending`     | `isPending(itemId: string): boolean`                                                     | `true` while a move of this card waits for `onMove` or for `items` to show it.                                                                                 |
| `setItems`      | `setItems(items: readonly T[]): void`                                                    | Replaces the items, as a re-render with new data would.                                                                                                        |
| `items`         | `items(): readonly T[]`                                                                  | The items the tester holds now.                                                                                                                                |
| `moves`         | `readonly MoveOperation[]`                                                               | Every op `onMove` received, in order.                                                                                                                          |
| `announcements` | `readonly string[]`                                                                      | What the board said to screen readers, in order.                                                                                                               |
| `settle`        | `settle(): Promise<void>`                                                                | Lets pending `onMove` promises and the queue run. Await it after a move. It waits four `setTimeout(0)` turns, so with fake timers, advance them while it runs. |
| `dispose`       | `dispose(): void`                                                                        | Clears the queue's timers and aborts in-flight moves.                                                                                                          |

## Core exports (`board-view-core`)

`board-view-core` has no React or React Native dependency and runs in Node as ESM or CommonJS. `react-native-board-view` re-exports most of it. The **RN** column shows which exports you can also import from `react-native-board-view`. See [One implementation on the client and the server](recipes.md#one-implementation-on-the-client-and-the-server).

### Ids and constants

| Export           | RN  | Signature                                                            | Description                                                                                                                         |
| ---------------- | --- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `NO_VALUE_ID`    | yes | `'__no_value__'`                                                     | Id of the No value column or lane.                                                                                                  |
| `NO_VALUE_LABEL` | no  | `'No value'`                                                         | Default label of the No value bucket in `projectBoard`. The board uses `labels.noValue`.                                            |
| `NO_LANE_ID`     | yes | `'_'`                                                                | Lane key of every cell on a board without lanes.                                                                                    |
| `cellId`         | yes | `cellId(laneKey: string, columnKey: string): string`                 | Builds `{laneKey}::{columnKey}`. Throws on empty keys, `::` in a key, a lane key ending with `:` or a column key starting with `:`. |
| `parseCellId`    | yes | `parseCellId(value: string): { laneKey: string; columnKey: string }` | Splits a cell id. Throws on a malformed id.                                                                                         |
| `createOpId`     | no  | `createOpId(): string`                                               | A unique move id, such as `mv_…`. Not a security token.                                                                             |

### Grouping

| Export             | RN  | Signature                                                                                           | Description                                                                              |
| ------------------ | --- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `readAxisValue`    | no  | `readAxisValue<T>(axis: GroupAxis<T>, item: T): string \| null`                                     | An item's key on one axis, through `getKey` or `item[key]`. `null` for no value or `''`. |
| `readItemSnapshot` | yes | `readItemSnapshot<T>(item: T, groupBy: GroupBy<T>, getRank: (item: T) => string): ItemMoveSnapshot` | The grouped fields and rank of an item, as the move queue compares them.                 |

### Ranks

| Export            | RN  | Signature                                                                                                           | Description                                                                                                               |
| ----------------- | --- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `fractionalRank`  | yes | `RankStrategy`                                                                                                      | The default strategy, from `fractional-indexing`. Keys such as `a0`.                                                      |
| `rankBetween`     | yes | `rankBetween(before: string \| null, after: string \| null, strategy?: RankStrategy): string`                       | A rank between two ranks. `null` is an open end.                                                                          |
| `compareRanked`   | yes | `compareRanked(a: RankedRef, b: RankedRef, strategy?: RankStrategy): number`                                        | Orders by rank, then by id.                                                                                               |
| `seedRanks`       | yes | `seedRanks(ids: readonly string[], strategy?: RankStrategy): { id: string; rank: string }[]`                        | First ranks for items that have none, in the order given, evenly spaced. See [Seeding ranks](recipes.md#seeding-ranks).   |
| `rebalanceRanks`  | yes | `rebalanceRanks<T extends RankedRef>(items: readonly T[], strategy?: RankStrategy): { id: string; rank: string }[]` | New short ranks in the current order. One update per item. See [Rebalancing](recipes.md#keeping-ranks-short-rebalancing). |
| `shouldRebalance` | yes | `shouldRebalance(ranks: readonly string[], maxLength?: number): boolean`                                            | `true` when any rank is longer than `maxLength`, default `48`.                                                            |

`strategy` defaults to `fractionalRank` in every function above.

### Index rules

The insertion index is the index in the target cell after the moved card is removed. These functions apply that rule.

| Export                | RN  | Signature                                                                                                         | Description                                                                                                                              |
| --------------------- | --- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `visibleAfterRemoval` | no  | `visibleAfterRemoval<T extends { id: string }>(visible: readonly T[], draggedId: string): T[]`                    | The list without the dragged card.                                                                                                       |
| `orderAfterMove`      | no  | `orderAfterMove(ids: readonly string[], draggedId: string, toIndex: number): string[]`                            | The ids after moving one to `toIndex`. Throws `ToIndexError` when out of range.                                                          |
| `rankForMove`         | no  | `rankForMove(visible: readonly RankedRef[], draggedId: string, toIndex: number, strategy?: RankStrategy): string` | A rank between the visible neighbours at `toIndex`. Next to tied ranks, it lands after the tie. Throws `ToIndexError` when out of range. |
| `ToIndexError`        | no  | `class extends RangeError`                                                                                        | `toIndex` is outside `0..length` after removing the dragged card. `name` is `'ToIndexError'`.                                            |

### Moves and projection

| Export         | RN  | Signature                                                                                                                              | Description                                                                                                                                                                                                |
| -------------- | --- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `projectBoard` | yes | `projectBoard<T>(input: ProjectBoardInput<T>): BoardModel<T>`                                                                          | Derives the board from flat items. Unknown and empty values share the No value bucket. Each cell is the global rank order filtered to that cell, ties by id.                                               |
| `planMove`     | yes | `planMove<T>(input: PlanMoveInput<T>): MoveOperation \| null`                                                                          | Turns "put this item at index N of that cell" into a `MoveOperation`. `null` when the item would land where it is. Throws for an unknown item or cell, or a cell id that does not match the board's lanes. |
| `applyMove`    | yes | `applyMove<T>(item: T, op: Pick<MoveOperation, 'changes' \| 'rank'>, groupBy: GroupBy<T>, applyRank: (item: T, rank: string) => T): T` | Applies a move to a record: `applyRank`, then each changed field through `applyKey` or a shallow copy. Throws for a non-object item without `applyKey`.                                                    |

`ProjectBoardInput<T>`:

| Field          | Type                       | Notes                                                    |
| -------------- | -------------------------- | -------------------------------------------------------- |
| `items`        | `readonly T[]`             | Not copied or edited.                                    |
| `getItemId`    | `(item: T) => string`      |                                                          |
| `getRank`      | `(item: T) => string`      |                                                          |
| `groupBy`      | `GroupBy<T>`               |                                                          |
| `overlays`     | `readonly MoveOperation[]` | Optional. Pending moves. The latest entry per item wins. |
| `strategy`     | `RankStrategy`             | Optional. Default `fractionalRank`.                      |
| `noValueLabel` | `string`                   | Optional. Default `NO_VALUE_LABEL`.                      |

`PlanMoveInput<T>`:

| Field      | Type                    | Notes                                                                                 |
| ---------- | ----------------------- | ------------------------------------------------------------------------------------- |
| `model`    | `BoardModel<T>`         | The board as displayed, pending overlays included.                                    |
| `groupBy`  | `GroupBy<T>`            |                                                                                       |
| `item`     | `T`                     | The app's record of the item.                                                         |
| `itemId`   | `string`                |                                                                                       |
| `toCellId` | `string`                | The target cell.                                                                      |
| `toIndex`  | `number`                | Insertion index in the target cell after the item is removed.                         |
| `overlay`  | `MoveOperation \| null` | Optional. The item's net pending move, so a follow-up starts where the card is shown. |
| `strategy` | `RankStrategy`          | Optional. Default `fractionalRank`.                                                   |
| `opId`     | `string`                | Optional. Default `createOpId()`.                                                     |
| `source`   | `MoveSource`            | Optional. Default `'api'`.                                                            |
| `batch`    | `MoveBatch`             | Optional. Marks the op as part of a batch.                                            |

### Move queue

`createMoveQueue(options: MoveQueueOptions): MoveQueue` is the per-item optimistic queue the board uses. The overlay updates inside `enqueue`, before `onMove` runs. `onMove` calls for one item never overlap. A rejection drops that move and cancels the item's later queued moves.

`MoveQueueOptions`:

| Field               | Type                                                                 | Default  | Notes                                                                                                                          |
| ------------------- | -------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `onMove`            | `(op: MoveOperation, context: MoveContext) => void \| Promise<void>` | required | Persists a move.                                                                                                               |
| `readItem`          | `(itemId: string) => ItemMoveSnapshot \| null`                       | required | Reads the app's current record. An overlay clears only when this shows the move, or the settle timeout runs out.               |
| `onEvent`           | `(event: MoveQueueEvent) => void`                                    |          | Every queue event.                                                                                                             |
| `settleTimeoutMs`   | `number`                                                             | `5000`   | After `onMove` resolves, how long to wait for app data before dropping the overlay. `0` disables. Read each time it is needed. |
| `inflightTimeoutMs` | `number`                                                             | `30000`  | How long `onMove` may stay pending before it rejects with `MoveTimeoutError`. `0` disables. Read each time it is needed.       |

`MoveQueue`:

| Method        | Signature                                           | Notes                                                                                                               |
| ------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `enqueue`     | `enqueue(op: MoveOperation): void`                  | Shows the overlay at once, then calls `onMove` once earlier moves of the item settle. A repeated `opId` is ignored. |
| `reconcile`   | `reconcile(): void`                                 | Re-checks resolved moves against app data. Call it whenever items change.                                           |
| `getOverlay`  | `getOverlay(itemId: string): MoveOperation \| null` | The item's net pending move, or `null`.                                                                             |
| `isPending`   | `isPending(itemId: string): boolean`                | `true` while a move of the item is queued or in flight.                                                             |
| `getSnapshot` | `getSnapshot(): MoveQueueSnapshot`                  | The current overlays.                                                                                               |
| `subscribe`   | `subscribe(listener: () => void): () => void`       | Calls `listener` on every snapshot change. Returns an unsubscribe function.                                         |
| `dispose`     | `dispose(): void`                                   | Clears timers and listeners and aborts in-flight moves. Do not use the queue afterwards.                            |

`MoveQueueSnapshot`: `{ readonly version: number; readonly overlays: readonly MoveOperation[] }`. One overlay per item with pending moves, the net effect of all of them: `changes` and `from` merge in order, and `rank` and `opId` come from the newest.

`MoveQueueEvent` is one of:

| `type`      | Other fields                                                   |
| ----------- | -------------------------------------------------------------- |
| `overlay`   | `op: MoveOperation`                                            |
| `inflight`  | `op: MoveOperation`                                            |
| `resolved`  | `op: MoveOperation`                                            |
| `rejected`  | `op: MoveOperation`, `error: unknown`                          |
| `cancelled` | `op: MoveOperation`, `reason: 'previous-rejected'`             |
| `cleared`   | `itemId: string`, `opId: string`, `reason: OverlayClearReason` |

`OverlayClearReason`: `'reflected' | 'settle-timeout' | 'rejected'`.

`MoveContext` and `MoveTimeoutError` are described under [Event and operation types](#event-and-operation-types). Both are re-exported.

### Core types

All are re-exported by `react-native-board-view`. All fields are `readonly`.

| Type                                                                   | Shape                                                                                                                                                              | Description                                                                                        |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `GroupBy<T>`                                                           | `{ columns: GroupAxis<T>; lanes?: GroupAxis<T> }`                                                                                                                  | See [`groupBy`](#groupby).                                                                         |
| `GroupAxis<T>`                                                         | `{ key; values; getKey?; applyKey? }`                                                                                                                              | See [`groupBy`](#groupby).                                                                         |
| `GroupValue`                                                           | `{ id: string; label: string; color?: string }`                                                                                                                    | A column or lane.                                                                                  |
| `RankedRef`                                                            | `{ id: string; rank: string }`                                                                                                                                     | An id and its rank.                                                                                |
| `RankStrategy`                                                         | `{ between(before, after): string; nBetween(before, after, count): string[]; compare(a, b): number }`                                                              | `before` and `after` are `string \| null`.                                                         |
| `MoveOperation`                                                        | see [`MoveOperation`](#moveoperation)                                                                                                                              | One move.                                                                                          |
| `MoveBatch`                                                            | `{ id: string; index: number; size: number }`                                                                                                                      | Batch membership of a move.                                                                        |
| `MoveSource`                                                           | `'drag' \| 'sheet' \| 'swipe' \| 'accessibility' \| 'api' \| 'undo'`                                                                                               | What started a move.                                                                               |
| `BoardModel<T>`                                                        | `{ lanes: GroupValue[]; columns: GroupValue[]; cells: BoardCell<T>[]; cellById: ReadonlyMap<string, BoardCell<T>>; locations: ReadonlyMap<string, ItemLocation> }` | A projected board. `locations` include overlays. Boards without lanes have one lane, `NO_LANE_ID`. |
| `BoardCell<T>`                                                         | `{ cellId; laneKey; columnKey; lane: GroupValue; column: GroupValue; items: T[]; ranked: RankedRef[] }`                                                            | One cell. `items` are in display order. `ranked` is parallel to it, with effective ranks.          |
| `ItemLocation`                                                         | `{ cellId: string; index: number }`                                                                                                                                | Where an item is displayed.                                                                        |
| `ItemMoveSnapshot`                                                     | `{ rank: string; fields: Readonly<Record<string, string \| null>> }`                                                                                               | An item's rank and grouped fields.                                                                 |
| `PlanMoveInput<T>`                                                     | see [above](#moves-and-projection)                                                                                                                                 | Input of `planMove`.                                                                               |
| `ProjectBoardInput<T>`                                                 | see [above](#moves-and-projection)                                                                                                                                 | Input of `projectBoard`.                                                                           |
| `MoveContext`                                                          | `{ signal: AbortSignal }`                                                                                                                                          | Second argument of `onMove`.                                                                       |
| `MoveQueue`, `MoveQueueOptions`, `MoveQueueSnapshot`, `MoveQueueEvent` | see [Move queue](#move-queue)                                                                                                                                      | The move queue.                                                                                    |
