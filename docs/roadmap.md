# Roadmap

Updated 2026-10-20. 1.0.0, the stable release, is built. 0.8.0 and 0.8.1 shipped on 2026-10-20. Features marked _experimental_ ship off by default and can change in a minor release (see the [support policy](support.md)).

| Version | Theme                           | Headline                                                       |
| ------- | ------------------------------- | -------------------------------------------------------------- |
| 0.6.0   | Phone-first moves (shipped)     | Drop dock, undo, matrix, a better Move sheet                   |
| 0.7.0   | Your data at a glance (shipped) | Week planner, WIP limits, sums, spotlight, presets             |
| 0.8.0   | Feature-complete and API freeze | Multi-select, column and lane reorder, pointer, test kit, bugs |
| 0.8.1   | Performance (shipped)           | Cards redraw only for their own data; first real-phone numbers |
| 1.0.0   | Stable (built)                  | Device gates, deprecations removed, `cardMarks`                |

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

## After 1.0

- **Flick to move.** Flick a lifted card toward a column and it flies there. Off by default; accidental flicks need a study.
- **Docs site.** A guide with a video per feature, recipes and the API reference, once the API is frozen.

## Board types

| Type                  | Verdict      | Why                                                                                                                                     |
| --------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Matrix (2 × 2, 3 × 3) | 0.6.0        | Cells are already `lane::column`. A fit-to-screen grid with no scrolling needs no virtualization. Popular for priority and triage apps. |
| Week planner          | 0.7.0        | Shipped with columns that load sideways in every layout.                                                                                |
| Gallery cells         | 0.7.0, P2    | Masonry inside a cell. Two-dimensional drop slots are the risk.                                                                         |
| Sales pipeline        | 0.7.0, P2    | Pipeline headers with totals and conversion. Before that, `columnTotals` and a custom header.                                           |
| Gantt or timeline     | Out of scope | Cards with start and end dates are a scheduling product, not a board.                                                                   |
| Free-form canvas      | Out of scope | No order or index, so none of the move model applies.                                                                                   |
| Nested or sub-columns | Out of scope | Stays out, as in the README.                                                                                                            |

## Out of scope through 1.0

Creating, editing, deleting, fetching or storing items. Rank rebalancing on the client. Sub-columns, items in more than one cell, Reanimated 3, the old architecture, and web.

Multi-select and column reorder shipped in 0.8.0 and left the README's out-of-scope list.
