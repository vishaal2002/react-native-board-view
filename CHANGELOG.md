# Changelog

This project follows [Semantic Versioning](https://semver.org/). Before 1.0, a minor version may include breaking changes; they are listed under **Breaking**. From 1.0, what counts as breaking is in the [support policy](docs/support.md).

## 1.5.0

`react-native-board-view` 1.5.0 and `board-view-core` 1.2.1. Publish core first: the board depends on it.

Fixes only, no new API. Found by reading the 1.0 to 1.4 code, and checked on the Android emulator.

### Fixed

- **Drops while a card is held.** Dropping on another card, or on a `BoardDropTarget`, read the data as it was at the lift. A card deleted or edited during the drag still accepted the drop, and `onCardDrop` and `onDrop` got the old item. Both now read the data as it is.
- **A card target that outlived the finger.** After resting on a card, sliding onto the dock, an outside target or a gap between cells still dropped onto that card on release. Leaving the card now clears it.
- **Card targets on the matrix layout.** The card under the finger ignored its sideways position, so any spot at the height of a dot counted as over it.
- **Commands while the past is shown.** `ref.run` could move cards, or undo, while the time machine drew an earlier time. The board now refuses them until it is live again.
- **Accept all.** A proposal whose card was already in its column stopped the batch. Only a move the board refuses (a full column, a gate) stops it now.
- **A rolled-back move in the journal.** A later move of the same card kept starting from a column it never reached, so the time machine drew it in the wrong place and flow counts were off.
- **The drag lens after a dock drop.** It zoomed back to the column the card came from, not the one it landed in.
- **Catching up with a card id like `constructor`.** `initialSnapshot` read the id off `Object.prototype` and the board crashed while drawing. It now treats the card as new.
- **Presence.** `onLocalPresence` fired on every card the finger crossed, which for most apps is a network send each time. It now fires once per cell.
- **Saved moves.** `restoreQueue` and `parseQueue` accepted a move with a malformed `batch` or an empty `rank` or `opId`. They are dropped now.

### Not in 1.5

Open gates stay open: a physical iPhone, S7 by hand, a low-end Android phone and the five-developer study. Three review findings were left for [2.0](docs/roadmap.md#20-the-engine-becomes-a-platform) because they change behaviour: throw tuning, a gated move planned against changed data, and the time stamps of changes that arrive during a drag.

## 1.4.0

`react-native-board-view` 1.4.0 and `board-view-core` 1.2.0. Publish core first: the board depends on it.

A board with a memory. The last feature release before 2.0: 1.5 is fixes only.

- **Commands.** `ref.run(command)` takes a `BoardCommand`, plain JSON: `move`, `moveMany`, `undo`, `select`, `scrollToColumn`, `revealItem`, `zoom` and `openMoveSheet`. Commands follow the same rules as a drag (`canDrop`, limits, gates, the optimistic queue). The result says what happened, or why nothing did: `invalid`, `unknown-item`, `unknown-column`, `refused`, `no-change` or `unavailable`. A command's `origin` ("shortcut", "agent") reaches `onMove` as `context.origin`. Core exports `validateCommand`, for untrusted input such as a deep link or a model's tool call, and `boardCommandSchema`, a JSON Schema for tool definitions and App Intents. The test kit gets `run`.
- **A journal and a time machine.** `useBoardTimeline()` keeps a journal of the board's own moves and of the moves `items` made by itself (a teammate, a sync), with ids and ranks only. A move that rolls back leaves no entry. Pass the timeline as `<Board timeline={timeline}>`. `seek`, `seekTime`, `step` and `play` draw the board as it was, read-only, with cards flying between steps. In `diff` mode the board stays live and rings every card that changed column since the position shown. `serialize()` and `initial` save and restore the journal, `actor` and `getActor` say who moved what, and `onChange` reports each change. `<BoardScrubber>` is a ready-made track with play, pause and Live, which screen readers adjust a step at a time. Without `timeline` the board keeps no history and costs nothing extra.
- **Live data mid-drag.** While a card is lifted, new `items` wait, so nothing moves under the finger. The drop is planned against the live data, next to the cards the user saw, and the held changes land once the card settles (and fly, with `animateChanges`). If the new data changes or removes the lifted card, the drag cancels, screen readers hear why, and `onDragEnd` gets `reason`. `holdChangesWhileDragging={false}` turns this off.
- **The ageing chart.** `zoom={{ dotLayout: 'age' }}` draws the dot level as an ageing chart: each card is a dot at the height of its age (`getItemAge`), with bands at the 50th and 85th percentile of the ages on the board, or at `ageBands`. Dots past the top band are ringed. Dots drag to other columns, and land at the top. To screen readers each column is one summary, with a "Show cards" action.
- **Blocked cards and stale limits per column.** `getBlocked` marks cards as blocked, with an optional reason. Render info gets `blocked` and `blockedReason`, `CardView` takes `blocked`, and screen readers hear it. `staleAfterDays` also takes one number per column id.
- **Flow metrics.** `useBoardFlow(timeline, { doneColumns })` and core's `boardFlow` give throughput per day, time in each column, when each card entered its column, and cycle times. Core's `percentile` gives the bands for the ageing chart.
- **Suggested moves.** `proposals`: moves suggested by a rule, a teammate or a model. Each one shows on its card with Accept and Decline, the target column's header counts it, and a bar offers Accept all and Decline all. Accept all stops at the first move the board refuses. Screen readers get both as card actions. Accepting runs the move with `context.origin: 'proposal'`, and `onProposal` tells the app to remove the proposal. The board never accepts a proposal by itself.
- **Presence.** `presence` draws a ring and a name on cards other people are holding, and stops them being dragged here (`lockPresence`). `onLocalPresence` reports this user's lifts, slots and drops, for your own channel.
- **Offline moves and concurrent drops.** `ref.serializeQueue()` and `ref.restoreQueue()` save the moves `onMove` has not accepted yet and send them again after a restart. Core adds `serializeQueue`, `restoreQueue`, `parseQueue` and `MoveQueue.pending()`. `jitteredRank()` is a rank strategy that adds random digits, so two people who drop between the same neighbours do not get the same rank. Its keys are valid fractional-indexing keys.
- **Inspection.** `ref.inspect()` returns the board's state as JSON: pending moves, overlays, a waiting gate, whether `items` are held, the selection, the zoom level and the timeline.
- **Types and labels.** `BoardCommand`, `CommandResult`, `JournalEntry`, `BoardTimeline`, `BoardFlow`, `MoveProposal`, `CardProposal`, `ProposalEvent`, `BoardPresence`, `LocalPresenceEvent` and `BoardInspection`. New optional fields: `CardRenderInfo.blocked`, `blockedReason`, `proposal`, `presence` and `changedSince`; `ColumnHeaderRenderInfo.proposed`; `BoardMoveContext.origin`; `DragEndEvent.reason`. New labels: `cardChangedWhileDragging`, `blocked`, `proposed`, `acceptProposal`, `declineProposal`, `proposalCount`, `acceptAll`, `declineAll`, `presenceMoving`, `timelinePosition`, `live`, `play`, `pause`, `changedSince`, `ageColumnSummary` and `showCards`.

### Fixed

- Flying cards (`animateChanges`, catching up, the time machine) could draw outside the board: a card cut off at the bottom of a list flew from its whole size, over the app's own views below. Flights are now clipped to the board.
- At the `dot` zoom level, the lifted card drew as a squeezed white title card. It now draws as a dot or bar in its color.

### Changed

- Data that arrives during a drag now waits for the drop (see above). Before, it re-rendered under the finger, and a change to the lifted card cancelled the drag at once without saying why.

### Not in 1.4

Moved out of the draft, to [2.0](docs/roadmap.md#20-the-engine-becomes-a-platform): dragging between boards, the headless engine and the Skia dot renderer. The inspector's DevTools panel is a separate tool for 1.5; `ref.inspect()` is its data. Diff mode rings changed cards rather than drawing trails from their old places.

## 1.3.0

`react-native-board-view` 1.3.0 and `board-view-core` 1.1.0. Publish core first: the board depends on it.

See everything, follow every change.

- **Zoom from cards to bars.** `zoom`: pinch through four levels of detail. Your cards, compact cards in narrower columns, one-line titles, and a short colored bar per card, so hundreds of cards fit on a phone. Cards drag at every level. `zoomLevel`, `onZoomLevelChange`, `ref.setZoomLevel()` and `getItemColor`. While the fingers move, the board follows them a little before the level changes. `overview` still works: it is the card and title levels.
- **Cards that fly.** `animateChanges`: a change made outside a drag (a new `groupBy`, a new order, a filter, a move from the sheet, undo, or a move from elsewhere) flies each card on screen to its new place instead of jumping. Cards that leave the screen head toward their new column and fade, and cards that come on screen fade in. Only cards whose cell or position changed fly. While a big change is still being drawn, the cards lift in place first. Off under reduced motion, and off by default.
- **Since you were away.** `ref.snapshot()` returns where every card is, as plain JSON. Passed back as `initialSnapshot`, the board opens as it was, flies to the present, and shows a chip ("4 moved · 2 new") that screen readers hear too. New label: `caughtUp`.
- **What a drop will do.** While a lifted card hovers another column, the default column headers show the count and limit the drop would leave, and `ColumnHeaderRenderInfo.incoming` gives custom headers the same number. `describeMove` adds a line in a pill under the lifted card ("Closes 2 subtasks").
- **Experimental: gather.** `moveModes.gather`: while a card is lifted, a second finger taps other cards to bring them along, as a selection does. The drag then follows the finger that lifted the card.
- **Experimental: throw.** `moveModes.throw`: flick a lifted card and it goes where it was heading, a drop-dock chip or the top of another column. The release speed is measured on the UI thread.
- **Experimental: drag lens.** `dragLens`: on a paged phone board, lifting a card zooms out to every column, and the board zooms back in on the column where it lands.
- **Projections rebuild only what changed.** The board projects through core's new `createProjector`, which rebuilds only the cells whose cards changed. A cell nothing touched keeps its object, so its list skips its render, and an update that changes nothing returns the same model. On a 20 lanes × 6 board of 1,200 cards, one move projects in about half the time (Node, median).
- **Core: `createProjector`.** The same projection as `projectBoard`, kept between calls. A property test checks that the two always agree. Its `locations` is a `ReadonlyMap`, but not always a `Map`.
- **Types.** `ZoomLevel`, `ZoomOptions`, `BoardSnapshot`, `CatchUpContext` and `MovePreview`. `CardRenderInfo.detail` and `ColumnHeaderRenderInfo.incoming` are optional fields.

### Fixed

- A pan that failed while another pan was dragging (the mouse pan, when a second finger touched down) ended that drag.
- The drop dock's chips logged a Reanimated warning about `opacity` and a layout animation.

## 1.2.0

`react-native-board-view` 1.2.0. `board-view-core` stays at 1.0.0.

- **Moves that ask first.** `gateMove` holds a move until the user answers. The cards wait, pending, where they land, while `renderMoveGate` shows your form in the board's sheet. Submitting queues the move, and `onMove` gets the answer in `context.answer`; cancelling sends the cards back. A gate is not counted against `inflightTimeoutMs`. While a move waits, other moves are refused. Undo is never held.
- **`confirmInto`.** Column ids whose moves ask "Move to Done?" first, in the board's own sheet.
- **Drop onto a card.** `onCardDrop`: rest a lifted card on the middle of another card for `cardDropDelayMs` (450 ms) and that card is outlined; letting go reports the drop and moves nothing. `canDropOnCard` refuses pairs. The Move sheet gets "Drop onto a card…", a searchable list of cards.
- **Drop targets outside the board.** `BoardDropScope` and `BoardDropTarget`: any view can take a lifted card, with `onDrop`, `accepts`, and children that can draw themselves lit while a card is over them.
- **Test kit.** `createBoardTester` takes `gateMove` and `confirmInto`, with `gate()`, `submitGate()` and `cancelGate()`.
- **Types and labels.** `GatedMove`, `MoveGateInfo`, `BoardMoveContext`, `CardDropEvent`, `BoardDropTargetEvent`. Labels `confirmMoveTitle`, `confirmMove`, `moveCancelled`, `dropOnto`, `dropOntoTitle`, `searchCards`, `noCardsMatch` and `droppedOnto`.
- **Zone drops** reach the board whether or not the dock is on.

## 1.1.0

`react-native-board-view` 1.1.0. `board-view-core` stays at 1.0.0.

- **Lanes draw only the columns on screen.** In swimlanes, a lane row draws the cells of the columns on screen and one on each side. The others are empty frames at the height their cards last had, so lanes keep their height as the board pages. The 20 lanes × 6 board drops from about 835 native views to 535. While a screen reader runs, or any accessibility service on Android, every cell is drawn as before, so focus can reach other columns.
- **Inside other screens.** The board works in a tab pager, a bottom sheet and a scroll view. A new release gate, S8, checks all three, and a [recipe](docs/recipes.md#inside-other-screens-pagers-bottom-sheets-scroll-views) gives the settings a bottom sheet needs. The demo has an "Inside other screens" screen.
- **Expo Go.** The board runs in Expo Go from SDK 58. It was checked on Android.
- **For coding agents.** [`llms.txt`](llms.txt) lists the docs, and the package ships a skill at `skills/board-view/SKILL.md`.

### Fixed

- On Android, a swipe on a column inside your app's scroll view scrolled the whole screen instead of the column. The board's lists now scroll inside yours.
- With `layout="paged"`, rotating the phone or resizing the window on Android left the board between two columns, with the column on screen cut off. It now lands on the same column.
- Reanimated 4.7 warned "Dependencies should only be used on the web" three times when a board mounted.

## 1.0.0

`react-native-board-view` 1.0.0 and `board-view-core` 1.0.0. Publish core first: the board depends on it. Core has no changes since 0.3.0.

The stable release. Upgrading from 0.x is in [Migrating to 1.0](docs/migrating.md). Every prop, type, token and label is in the new [API reference](docs/api.md), and the [support policy](docs/support.md) says what semantic versioning covers and which React Native and Expo versions are supported.

- **Design the whole card.** `cardMarks="manual"` stops the board drawing over your card: no selection check or outline, highlight ring, pointer outline, spotlight fade, or stack and count on a dragged selection. `renderCard` gets `highlighted`, `hovered` and `dragCount` to draw them itself, beside `selected` and `dimmed`. The default, `'auto'`, looks as before.
- **Release gates on a phone.** S2–S6 passed on release builds on a vivo V2158 (Android 14). The results are in [docs/spike.md](docs/spike.md).

### Fixed

- Holding a card at the board's side edge flipped or scrolled to the last column and showed the drop there, but letting go put the card back, because the finger was in the margin beside the column. It now lands where shown.
- On Android, after a fling back to the first page of a paged board, the page stopped a few points short and the next taps on it did nothing, until a scroll. The stretch at the edge stayed stuck. Paged boards no longer overscroll.
- The count on a dragged selection included selected cards that cannot be dragged and stay behind.
- `OverlayClearReason` is re-exported, as `MoveQueueEvent` already referred to it.

### Breaking

- Removed `onEndReached`, `onColumnsEndReached` and `cellLimit`, deprecated in 0.8. Use `onColumnEndReached`, `onEdgeReached` and `laneCellLimit`.
- `CardRenderInfo` has new required fields, `highlighted`, `hovered` and `dragCount`. Code that builds one itself, for example in tests, must add them.

## 0.8.1

`react-native-board-view` 0.8.1. `board-view-core` stays at 0.3.0.

The performance pass. No new features and no API changes. Measured on a real phone for the first time, a vivo V2158 (Android 14, release build); the numbers are in [docs/benchmarks.md](docs/benchmarks.md#2026-10-20-081-against-080-on-a-phone).

- **Cards redraw only when their own data changes.** A move, the drop dock sliding in or out, the Move sheet opening, or your app re-rendering `<Board>` used to redraw every mounted card. On the 20 lanes × 6 board, one drop went from 480 card renders to 4, and a lift from up to 360 to none. A `renderCard`, `getItemLabel`, `theme`, `spotlight`, `canDrag`, `canDrop`, `cardActions` or `canPerformAction` that is new on every render still redraws them all, so keep those stable (see [Stable props](README.md#quick-start)).
- **`useBoardTheme` reads only the theme.** Cards that use it, `CardView` included, no longer redraw with every board change.
- **Cards cost about half as much to mount.** A lane of 60 cards took 185 ms of JS on the phone; it now takes about 90 ms. Each card dropped its own UI-thread style (it only hid the card under the lifted copy) and a wrapper view, and the three dots of its "…" button are now one glyph.
- **Screen-reader actions on Android are built while an accessibility service runs.** TalkBack, Switch Access and Voice Access get them as before, and they appear as soon as a service turns on. Without one, nothing can use them, and building 20 or more per card was a large part of a card's cost. iOS keeps them always, for Full Keyboard Access.
- **A drop projects the board once, not three times.** The board drawn after a move is the one the move was planned on, and a move clearing once your items show it does not project the board again.
- **The Move sheet opens in about 100 ms** on the 20 lanes × 6 board, from about 450 ms.
- **Lane scrolling** on that board went from about 6.7% janky frames to about 4%, and lane auto-scroll from about 7% to about 6%. The 4 × 500 board was already at 0–1% janky and stays there.

### Fixed

- Holding a card below a column's end while it auto-scrolled, in the drop dock's padding or over a footer, scrolled the list but left the placeholder behind, so the drop put the card back where it started. The slot now follows the content.

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
