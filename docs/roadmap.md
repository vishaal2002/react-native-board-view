# Roadmap

Draft, updated 2026-10-19. 0.6.0 shipped on 2026-10-18 with `board-view-core` 0.2.0. 0.7.0 is built, front end only. Each minor release has one theme. Features marked _experimental_ ship off by default and can change before 1.0.

| Version | Theme                           | Headline                                              |
| ------- | ------------------------------- | ----------------------------------------------------- |
| 0.6.0   | Phone-first moves (shipped)     | Drop dock, undo, matrix, a better Move sheet          |
| 0.7.0   | Living board                    | Live moves, multi-select, week planner, layout morphs |
| 0.7.1   | Performance                     | JS thread near 60 fps while scrolling, jank near 0%   |
| 0.8.0   | Structure, input and API freeze | Column and lane reorder, keyboard, test kit           |
| 1.0.0   | Stable                          | Device gates, no new features                         |

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

## 0.7.0: your data at a glance (built)

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

## 0.7.1: performance

No new features and no API changes. Profile a release build on mains power, then fix what dominates. The likely causes, from reading the code:

- Every card rebuilds its screen-reader actions (a `canDrop` call per column) whenever the board's shared state changes, and that state is rebuilt on every board update.
- Every card mounts its own UI-thread animated style, only to hide itself during a drag.
- One move re-renders every mounted card, not only the two cells it touched.
- Hit-testing runs in JS once per frame. Move it to a worklet if devices need it.
- The dock reshapes the lists twice per drag.

Targets: the JS thread at 55 fps or more during auto-scroll, and 0–3% janky frames on every board, measured against 0.5.0, 0.6.0 and 0.7.0 on the emulator, a mid-tier Android phone and an iPhone. Keep only the changes that measurably help.

## 0.8.0: structure, input and API freeze

- **Column and lane reorder.** Drag a header, or use a screen-reader action. The board reports the order, and the app updates its list.
- **Hardware keyboard and pointer.** Arrows, space to lift, enter to drop, escape to cancel. Hover states and mouse drag without a long press.
- **Test helpers.** A testing export that simulates moves and checks `onMove` calls in Jest.
- **API review.** Every export marked stable or experimental. Dev warnings on anything 1.0 removes.

The last release that can break the API. After it come release candidates, not a 0.9.

## 1.0.0: stable

- Remove what 0.8 deprecated. No new features.
- S2–S7 pass on release builds on a mid-tier Android phone and an iPhone. The device rows of the benchmarks table are filled in.
- Core and the React Native package both go to 1.0.0.
- An API reference, a migration guide from 0.x, and a support policy for React Native and Expo versions.

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

Multi-select and column reorder leave the README's out-of-scope list when they ship.
