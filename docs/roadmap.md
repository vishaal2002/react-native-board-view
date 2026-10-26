# Roadmap

Updated 2026-10-26. 1.0.0, the stable release, is built. 0.8.0 and 0.8.1 shipped on 2026-10-20. Features marked _experimental_ ship off by default and can change in a minor release (see the [support policy](support.md)). 1.1 is built (see below); 1.2 to 1.6 are a **draft**, based on the [October 2026 research](research-2026-10.md).

| Version | Theme                           | Headline                                                                |
| ------- | ------------------------------- | ----------------------------------------------------------------------- |
| 0.6.0   | Phone-first moves (shipped)     | Drop dock, undo, matrix, a better Move sheet                            |
| 0.7.0   | Your data at a glance (shipped) | Week planner, WIP limits, sums, spotlight, presets                      |
| 0.8.0   | Feature-complete and API freeze | Multi-select, column and lane reorder, pointer, test kit, bugs          |
| 0.8.1   | Performance (shipped)           | Cards redraw only for their own data; first real-phone numbers          |
| 1.0.0   | Stable (built)                  | Device gates, deprecations removed, `cardMarks`                         |
| 1.1.0   | Fits anywhere (built)           | Lanes that virtualize columns, boards inside sheets and pagers, Expo Go |
| 1.2.0   | Moves that ask first (draft)    | Drop gates, drop on a card, drop targets and sources outside the board  |
| 1.3.0   | Flow at a glance (draft)        | Column rail, ageing per column, blocked cards, animated regroup         |
| 1.4.0   | Live boards (draft)             | Remote changes mid-drag, presence, rank jitter, a queue that persists   |
| 1.5.0   | Agent-ready (draft)             | Typed board commands, suggestions to accept or decline, skills          |
| 1.6.0   | Beyond touch (draft)            | Keyboard moves, drag between apps on tablets                            |

## 0.6.0: phone-first moves (shipped)

Moving a card far across a phone board is the slowest thing the board does today: the card rides an edge scroll across every column in between. 0.6.0 gives the user two shortcuts and a safety net.

Build order: the dock first, because zoom reuses its drop targets. Then undo. Zoom last, because it carries the most risk.

| Priority | Feature                        | Scope                                                                                                                                                                                                                    |
| -------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P0       | Drop dock                      | A tray slides up when a card lifts. Column chips drop the card at the top of that column. App actions (Archive, Assign, Snooze…) report the drop to the app, which decides what it means. The board never deletes items. |
| P0       | Undo                           | `board.undo()` reverts the last move through the same queue as `moveItem`. An optional banner ("Moved to Done · Undo") with a timeout. Undo of a move the server refused is a no-op.                                     |
| P0       | Device and screen-reader gates | S2–S7 on a mid-tier Android phone and an iPhone, release builds. 0.5.0 has not run on iOS. A TalkBack and VoiceOver move test, including the dock.                                                                       |
| P1       | Pinch-to-zoom overview         | _Experimental._ Pinch out to a whole-board overview: each column becomes a summary with its count and card dots. Drag a card between any two columns there, then pinch back in where it landed. `columns` layouts first. |
| P2       | Hide empty columns and lanes   | `hideEmpty` for filtered views such as "my cards". Cheap, and the dock still lists hidden columns as targets.                                                                                                            |
| P2       | Matrix layout                  | A fixed grid where both axes are categories, every cell on screen (priority × effort, an Eisenhower 2 × 2). See [Board types](#board-types).                                                                             |

P0 blocks the release. P1 ships if it passes the gates, or moves to 0.6.x behind its flag. P2 ships if time allows.

As shipped:

```tsx
<Board
  dock
  undo={{ timeoutMs: 5000 }}
  cardActions={[{ key: 'archive', label: 'Archive' }]}
  onCardAction={({ action, item }) => archive(item.id)}
  hideEmptyColumns
  overview
/>
```

Dock chip drops reach `onMove` as `source: 'drag'`, and undo as `source: 'undo'` (core 0.2.0).

## 0.7.0: your data at a glance (shipped)

Front end only: nothing here changes the core or reaches a server. `board-view-core` stays 0.2.0.

| Priority | Feature                    | Status                                                                                          |
| -------- | -------------------------- | ----------------------------------------------------------------------------------------------- |
| P0       | Week planner               | Built. `layout="planner"`, `dayColumns`, today disc, weekends set back, Today button.           |
| P0       | Columns that load sideways | Built. `onColumnsEndReached`, with the same column kept on screen when days are added in front. |
| P0       | WIP limits                 | Built. Count against limit, a meter, warning and reject colors, and `limitBehavior="block"`.    |
| P0       | Column sums                | Built. `getItemValue`, `formatValue`.                                                           |
| P0       | Spotlight                  | Built. Faded cards keep their place and still move.                                             |
| P0       | Layout motion              | Built. Columns glide between frames; a new layout fades in.                                     |
| P0       | Release gates              | Emulator only. iOS, real phones, TalkBack and VoiceOver are still open, as for 0.5 and 0.6.     |
| P1       | Sticky headers             | Built. Stacked uses FlashList sticky headers; swimlanes pin a copy of the top lane's header.    |
| P1       | Card ageing                | Built. `getItemAge`, `staleAfterDays`, and the `CardView` age chip.                             |
| P1       | Lane distribution          | Built. A bar in each lane header.                                                               |
| P1       | Theme presets              | Built. `paper`, `slate`, `aurora`, each AA in light and dark.                                   |
| P1       | Motion presets             | Built. `calm`, `snappy`, `playful`.                                                             |

**Moved out of 0.7.0** when the release became front-end only, to be planned again after 0.7.1:

- Live moves and presence, and multi-select with batch moves. Both change the core move queue.
- Smart dock, move history, gallery cells, pipeline chevrons, spring-loaded collapsed columns and landing effects.
- The Expo Go demo.

The five-developer usability study still belongs before the 0.8 API freeze.

## 0.8.0: feature-complete and API freeze (built)

| Priority | Feature                    | Status                                                                                                     |
| -------- | -------------------------- | ---------------------------------------------------------------------------------------------------------- |
| P0       | Bug fixes from the audit   | Built. 4 engine and 17 layout and accessibility bugs, each with a regression test where one fits.          |
| P0       | Multi-select and batches   | Built. Selection mode, stack drag, Move sheet and dock for many, one undo, `op.batch` (core 0.3.0).        |
| P0       | Column and lane reorder    | Built. The header's "…" opens a sheet: move left or right, to either end, collapse. Screen readers too.    |
| P0       | Pointer and keyboard       | Built. Mouse drag without a long press, hover outline, Android keyboard focus. Arrow-key moves: after 1.0. |
| P0       | API freeze                 | Built. Three props renamed with deprecated aliases, readonly contexts, `limit: number \| null`.            |
| P0       | Test kit                   | Built. `react-native-board-view/testing`: `createBoardTester`.                                             |
| P1       | `collapsibleLanes`         | Built.                                                                                                     |
| P1       | Moves from elsewhere flash | Built. `highlightExternalMoves`, on by default.                                                            |
| P0       | Release gates              | Android emulator and, for the first time, the iOS simulator. Devices and screen readers are still open.    |

Not in 0.8.0, for after 1.0: dragging a header itself (the sheet covers reorder), arrow-key moves (React Native has no key events without a native module), live presence, flick to move, gallery cells and pipeline chevrons. The Expo Snack demo and the five-developer usability study are still to do.

## 0.8.1: performance (shipped)

No new features and no API changes. Profiled on a real phone, a vivo V2158 (Android 14), against 0.8.0, and kept only what measurably helped:

- **Cards redraw only when their own data changes.** They read a context of their own, so a move, the dock or an app re-render no longer redraws every mounted card. One drop on the 20 lanes × 6 board went from 480 card renders to 4.
- **Cheaper cards.** Screen-reader actions on Android are built only while an accessibility service runs, and each card lost its UI-thread style and three views. A lane of 60 cards mounts in about 90 ms of JS instead of 185.
- **Fewer projections.** A drop projects the board twice instead of four times.
- **Dropped:** hit-testing in a worklet. It costs well under a millisecond per frame, and moving it would not change any number above.

The results, in [benchmarks](benchmarks.md#2026-10-20-081-against-080-on-a-phone):

- **Met.** The 4 × 500 board is at 0–1% janky frames, with the JS thread at 60.
- **Not met.** The 20 lanes × 6 board improved, from about 6.7% to 3.8% janky while scrolling and from 6.9% to 5.8% during auto-scroll, but it misses the 0–3% target. A swimlane row still creates every column's cards natively when it scrolls in. Virtualizing columns inside a lane would fix it, but it changes how rows measure, so it comes after 1.0.

## 1.0.0: stable (built)

- **Removed** what 0.8 deprecated: `onEndReached`, `onColumnsEndReached` and `cellLimit`.
- **One addition**, asked for before the freeze: `cardMarks="manual"`, so an app can design the whole card, the board's marks included.
- **Device gates.** S2–S6 passed on release builds on a vivo V2158 (Android 14), the only phone available. Two bugs found there are fixed: a drop at the board's side edge, and taps lost after a fling back to the first page. iOS ran S4 on the simulator only; no iPhone was available. S7 (TalkBack, VoiceOver) is in [the release gates](spike.md).
- **Versions.** Core and the React Native package both go to 1.0.0.
- **Docs.** An [API reference](api.md), a [migration guide](migrating.md) from 0.x, and a [support policy](support.md) for React Native and Expo versions.

## After 1.0 (draft)

### Where the board stands

No other maintained React Native library ships a released board. Drax has an experimental `useSortableBoard`, and react-native-reanimated-dnd has a `SortableBoard` on an unreleased branch. Both will soon move cards between lists. That is the feature developers ask for most, and it is also the part that becomes common.

What a sortable primitive will not have is what this package already has: a move that the server decides, ranks shared with the server, moves for phones without dragging, and moves for screen readers. So 1.x puts its work where a primitive will not follow:

- **The move's life:** before the drop, on another card, outside the board, during a sync.
- **Phone reach:** the columns you cannot see, and the board inside other screens.
- **The data the app already has:** age, blocked cards, flow.

Adoption is the other gap. This package gets about 430 downloads a week. Drax gets about 15,800 and react-native-sortables about 110,000. Expo Go, docs and agent-ready docs are cheap to fix, so 1.1 starts there.

Every 1.x release keeps to the [support policy](support.md): only optional props, fields, tokens and labels. Anything that would break waits for [2.0](#20-candidates).

### 1.1.0: fits anywhere (built)

As built, 2026-10-26:

- **Columns virtualize in lanes.** Built. Lanes draw the columns on screen and one on each side; the rest are empty frames of their last height. `<Activity>` was not needed: FlashList already unmounts lanes off screen. 835 → 535 native views on the emulator. Phone frame times are still to measure.
- **Board inside other screens.** Built. S8 passes on the Android emulator for all three hosts. The board's lists now scroll inside the app's scroll view on Android. A swipe past the board's first or last column does not reach a surrounding pager: that is React Native's, and the recipe says so.
- **Expo Go.** Works on SDK 58, checked on Android with packed packages. iOS Expo Go is unchecked.
- **Windows that resize.** Built. A paged board resized or rotated landed off its column on Android; fixed. Checked on Android across paged, auto, multi, swimlanes and a resize mid-drag. Not checked on iPad.
- **Agent docs.** Built: `llms.txt` and `skills/board-view/SKILL.md` in the package. The docs site is not built.
- **Open gates.** Still open: S7 by hand, a physical iPhone, a low-end Android phone and the five-developer study. The S2–S6 regression run for 1.1 was stopped before it finished.

The plan as drafted:

| Priority | Feature                     | Scope                                                                                                                                                                                                                                                                                                                                   |
| -------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0       | Columns virtualize in lanes | The 0.8.1 miss. A lane row draws only the columns on screen, plus one on each side, and lanes off screen sit in React's `<Activity mode="hidden">` (in React Native since 0.83). Target: the 20 lanes × 6 board at 0–3% janky frames on the vivo, while scrolling and during auto-scroll.                                               |
| P0       | Board inside other screens  | The complaint most often repeated against every list library: a list inside a tab pager, a bottom sheet or a parent `ScrollView` fights its host's gestures. Each host gets a demo screen and a new gate, S8: a pager tab, `@gorhom/bottom-sheet` and a scrolling screen, with 0 misfires in 50 tries. Any prop this needs is optional. |
| P0       | Expo Go                     | Reanimated, worklets, Gesture Handler and FlashList all ship in Expo Go. Run the gates there on SDK 58. If it passes, state support for it, and publish an Expo Go demo. It is the cheapest way to get more people trying the board.                                                                                                    |
| P0       | Open gates                  | Still open since 0.6: S7 with TalkBack and VoiceOver by hand, a physical iPhone, a low-end Android phone, and the five-developer study. 1.1 does not ship with them still open.                                                                                                                                                         |
| P1       | Windows that resize         | Android 17 ignores orientation and resize locks on screens 600 dp and wider, and iOS 27 apps resize under the scene life cycle. `auto` must change layout while a window resizes, and keep the column on screen. A gate for a foldable, iPad windowing and Android desktop windows.                                                     |
| P1       | Docs site and agent docs    | The guide planned for after 1.0, with a video per feature. `llms.txt`, and a `skills/board-view/SKILL.md` in the package with the recipes, as Gesture Handler and Expo now ship.                                                                                                                                                        |

### 1.2.0: moves that ask first

Today a card moves or it does not. 1.2 lets a move ask the user something, land on another card, or leave the board. The board still never creates, edits or deletes items: each of these reports to the app.

| Priority | Feature              | Scope                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0       | Drop gates           | `gateMove(op)` returns what to ask, or nothing. The card waits at its slot, dimmed, while the board shows your form (`renderMoveGate`) in its own sheet. Submitting sends the answer with the move to `onMove`, and cancelling sends the card home. One gate for a whole batch. `confirmInto` for columns that end the work, such as Done or Lost. This is the [required-fields recipe](recipes.md#asking-for-input-before-a-move-required-fields) built in. HubSpot asks this way, and Jira had a bug where drag skipped it. |
| P0       | Drop on a card       | Hold a lifted card over another card and that card lights up. Letting go calls `onCardDrop({ item, target })`, for a merge, a link or a subtask. Nothing moves unless the app moves it. The Move sheet gets "Drop onto…", for screen readers too. `canDropOnCard` and `cardDropDelayMs`. Trello shipped merge on drop in 2026, and people ask for it in two list libraries.                                                                                                                                                   |
| P1       | Drop targets outside | `<BoardDropTarget id onDrop>` makes any view a target while a card is lifted: a calendar slot, an avatar to assign, a trash can. It works like a dock action, but in your own layout.                                                                                                                                                                                                                                                                                                                                         |
| P1       | Drag sources outside | `<BoardDragSource data>` lets a row in a backlog sheet or an inbox be dragged into a cell. The board shows the slot and reports `onExternalDrop({ data, columnId, laneId, index, rank })`. The app creates the card.                                                                                                                                                                                                                                                                                                          |
| P1       | Drag to create       | A "+" that you drag to the spot you want, as in Todoist. It is a drag source with no data, and the slot and rank are ready to use. A tap on it still reports the top of the column on screen.                                                                                                                                                                                                                                                                                                                                 |
| P2       | Landing effects      | Moved out of 0.7. `landingEffect` on a column: a short burst when a person (not a sync) drops a card in Done. Off under reduced motion.                                                                                                                                                                                                                                                                                                                                                                                       |

### 1.3.0: flow at a glance

Front end only, like 0.7: nothing reaches the server, and the core does not change.

| Priority | Feature           | Scope                                                                                                                                                                                                                                                                                                                                                      |
| -------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0       | Column rail       | "I can only see one column" is the top review complaint for phone boards. `rail`: a strip within thumb reach at the bottom, with one segment per column showing its count and limit color. A tap pages to the column. A segment takes a drop, like a dock chip that is always there. Collapsed columns stay in the rail. Similar to monday's Battery View. |
| P0       | Ageing per column | `staleAfterDays` takes a number per column, as in Pipedrive's rotting per stage. `ageBands` colors the 50th and 85th percentile of each column's ages. The header gets a strip of dots by age, the ageing-WIP chart people know from flow tools.                                                                                                           |
| P1       | Blocked cards     | `getBlocked(item)` returns a reason or null. `CardView` draws a banner with the reason and how long the card has been blocked, and the header counts blocked cards. Screen readers hear it too.                                                                                                                                                            |
| P1       | Animated regroup  | Switching `groupBy`, from status to assignee for example, moves each card to its new place instead of drawing a new board. Planner, ClickUp and Jira all let you regroup. Uses Reanimated 4.7's default layout animations.                                                                                                                                 |
| P2       | Pipeline headers  | Moved out of 0.7. Chevron headers with sums and a stage-to-stage ratio, as a `renderColumnHeader` preset.                                                                                                                                                                                                                                                  |
| P2       | Glass chrome      | On iOS 26 and later, the dock, rail and sheets can use the app's `expo-glass-effect`, the same way haptics uses its haptics module. Everywhere else they look as before.                                                                                                                                                                                   |

### 1.4.0: live boards

Changes the core and the move queue, so core goes to 1.1.

| Priority | Feature                 | Scope                                                                                                                                                                                                                                                                                                                                                                |
| -------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0       | Remote changes mid-drag | Today `items` can change under a lifted card. During a drag, the board holds what is on screen and queues changes from elsewhere. On the drop it applies them, plans the move against the new neighbours and flashes what changed. If the card itself was moved or deleted, the drag cancels, with a label that says why. No React Native list library handles this. |
| P0       | Presence                | `presence`: `{ userId, name, color, itemId, phase }[]` from any transport. Avatars on cards, "+N" when there are many, and a ghost on a card someone else is dragging. `lockWhileOthersDrag`. `onLocalPresence` reports this user's lift, drag and drop, so the app can send them. A `presenceStale` flag dims all of it when the connection drops.                  |
| P0       | Rank jitter             | Two phones that drop between the same two cards get the same rank today, and sort by id. `jitteredRanks(seed)` in core adds a few random digits, and a property test checks that concurrent moves never collide. Rebalancing stays on the server.                                                                                                                    |
| P1       | A queue that persists   | `serializeQueue()` and `restoreQueue()`, so moves made offline survive an app restart and replay in order. A "Waiting to sync" state in `renderCard` and the header.                                                                                                                                                                                                 |
| P1       | Sync recipes            | Zero 1.0, PowerSync and LiveStore, each with presence and a persisted queue. TanStack DB once it reaches 1.0.                                                                                                                                                                                                                                                        |

### 1.5.0: agent-ready

| Priority | Feature             | Scope                                                                                                                                                                                                                                                                                                                                                    |
| -------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0       | Board commands      | A typed, plain-data `BoardCommand` in core (move, move many, select, collapse, scroll to, regroup, spotlight) with a JSON Schema export, and `ref.run(command)`. An app can give the commands to its LLM as tools, or serve them over MCP, without writing any glue. The core checks each command against the board (limits, `canDrop`) before it runs.  |
| P0       | Suggestions         | `suggestions`: `{ itemId, to?, label, reason }[]`. A card shows a suggested move as a ghost in its target slot with the reason, and Accept and Decline. "Accept all" sits in the selection bar. Accepting goes through the queue as `source: 'api'` (a new `MoveSource` waits for 2.0). Linear's triage suggestions work like this, for any app's model. |
| P1       | Skills and examples | The 1.1 skill grows to cover commands and suggestions, with a demo screen that drives the board from a chat box through the Claude API.                                                                                                                                                                                                                  |

### 1.6.0: beyond touch

| Priority | Feature               | Scope                                                                                                                                                                                                                                                                                                                                                                               |
| -------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0       | Keyboard moves        | Planned for after 1.0 in 0.8. React Native now has `onKeyDown` on Android behind the experimental `enableKeyEvents` flag. iOS has nothing in core yet, so it needs `react-native-external-keyboard` 2.x (React Native 0.87 or later). `keyboardMoves`: ⌘ or Ctrl with the arrows moves the focused card, and Space lifts it. Both modules are optional, the same way haptics is.    |
| P1       | Drag between apps     | _Experimental_, in a separate package with a native module, so the main package stays pure JS. On iPad, Android tablets and ChromeOS, links, text and images dropped from another app land in a cell through `onExternalDrop`. A card dragged out carries `getItemShareData(item)`. No React Native board does this. The risk is sharing gestures with the board's own drag engine. |
| P2       | Shortcuts and widgets | Recipes, not code: "Move card to Done" from Shortcuts with `expo-app-intents` (alpha in SDK 58), and a widget that shows a column's count, both built on `planMove`.                                                                                                                                                                                                                |

### 2.0 candidates

Not planned for a date yet. Each would break something.

- **Web.** Through a list adapter, so Legend List v3, which runs on the web, can stand in for FlashList. Drax and react-native-sortables already run on the web, and it is the most requested feature after moving cards between lists.
- **Gesture Handler 3 only.** It has been stable since May 2026. Dropping 2.x removes a second code path.
- **New `MoveSource` members:** `'suggestion'`, `'command'` and `'external'`.
- **Dragging a header itself**, as well as the sheet.

### Not planned

- **Flick to move.** Removed from after 1.0. A sideways flick competes with paging, as swipe does ([0003](decisions/0003-swipe-stays-experimental.md)). ClickUp closed its swipe-to-change-status request. Revisit only if the five-developer study asks for it.
- **Shared transition from a card to its detail screen.** Reanimated's shared element transitions are still experimental. A recipe once they are stable.
- **Gallery cells.** Drop slots in two dimensions cost more than they are worth on a phone.
- **A natural-language box in the board.** That belongs in the app. 1.5 gives it the commands.

## Board types

| Type                  | Verdict      | Why                                                                                                                                     |
| --------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Matrix (2 × 2, 3 × 3) | 0.6.0        | Cells are already `lane::column`. A fit-to-screen grid with no scrolling needs no virtualization. Popular for priority and triage apps. |
| Week planner          | 0.7.0        | Shipped with columns that load sideways in every layout.                                                                                |
| Gallery cells         | Not planned  | Masonry inside a cell. Two-dimensional drop slots are the risk.                                                                         |
| Sales pipeline        | 1.3.0, P2    | Pipeline headers with totals and conversion. Before that, `columnTotals` and a custom header.                                           |
| Gantt or timeline     | Out of scope | Cards with start and end dates are a scheduling product, not a board.                                                                   |
| Free-form canvas      | Out of scope | No order or index, so none of the move model applies.                                                                                   |
| Nested or sub-columns | Out of scope | Stays out, as in the README.                                                                                                            |

## Out of scope through 1.0

Creating, editing, deleting, fetching or storing items. Rank rebalancing on the client. Sub-columns, items in more than one cell, Reanimated 3, the old architecture, and web.

Multi-select and column reorder shipped in 0.8.0 and left the README's out-of-scope list.
