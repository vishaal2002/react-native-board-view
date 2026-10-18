# Roadmap

Draft, updated 2026-10-18. 0.6.0 is built: everything in its table shipped, with the overview behind its experimental flag. Each minor release has one theme. Features marked _experimental_ ship off by default and can change before 1.0.

| Version | Theme                           | Headline                                    |
| ------- | ------------------------------- | ------------------------------------------- |
| 0.6.0   | Phone-first moves               | Drop dock, undo, pinch-to-zoom overview     |
| 0.7.0   | Live and batch                  | Live moves from other users, multi-select   |
| 0.8.0   | Structure, input and API freeze | Column and lane reorder, keyboard, test kit |
| 1.0.0   | Stable                          | Device gates, no new features               |

## 0.6.0: phone-first moves

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

## 0.7.0: live and batch

Both features change the core move queue, so they ship together and core goes to 0.2.0.

- **Live moves.** The app passes moves it hears from its server (any backend). The board animates the card to its new place with a badge for who moved it, and shows cards another user is dragging as locked. Remote moves merge with pending local ones. The convergence property test covers the mix.
- **Multi-select and batch moves.** The app controls the selected ids. A batch moves as one operation and rolls back as one. The lifted copy shows a count.
- **Spring-loaded collapsed columns.** Hovering a collapsed column during a drag opens it.
- **Usability study.** Five developers new to the package, on 0.7, so findings reach 0.8 while breaking changes are still allowed. It also decides whether swipe-to-move becomes stable.

## 0.8.0: structure, input and API freeze

- **Column and lane reorder.** Drag a header, or use a screen-reader action. The board reports the order, and the app updates its list.
- **Sticky headers.** Lane headers in swimlanes, section headers in stacked.
- **Hardware keyboard and pointer.** Arrows, space to lift, enter to drop, escape to cancel. Hover states and mouse drag without a long press.
- **Test helpers.** A testing export that simulates moves and checks `onMove` calls in Jest.
- **Animated layout changes.** Cards glide to their new place when the board switches between columns, swimlanes and stacked.
- **API review.** Every export marked stable or experimental. Dev warnings on anything 1.0 removes.

The last release that can break the API. After it come release candidates, not a 0.9.

## 1.0.0: stable

- Remove what 0.8 deprecated. No new features.
- S2–S7 pass on release builds on a mid-tier Android phone and an iPhone. The device rows of the benchmarks table are filled in.
- Core and the React Native package both go to 1.0.0.
- An API reference, a migration guide from 0.x, and a support policy for React Native and Expo versions.

## After 1.0

- **Flick to move.** Flick a lifted card toward a column and it flies there. Off by default; accidental flicks need a study.
- **Week planner.** Columns are days, and the board loads more days as it scrolls sideways.

## Board types

| Type                  | Verdict      | Why                                                                                                                                     |
| --------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Matrix (2 × 2, 3 × 3) | 0.6.0, P2    | Cells are already `lane::column`. A fit-to-screen grid with no scrolling needs no virtualization. Popular for priority and triage apps. |
| Week planner          | After 1.0    | Needs columns that load sideways, which the board does not do yet.                                                                      |
| Sales pipeline        | Recipe       | Columns plus `columnTotals` and a custom header already do it.                                                                          |
| Gantt or timeline     | Out of scope | Cards with start and end dates are a scheduling product, not a board.                                                                   |
| Free-form canvas      | Out of scope | No order or index, so none of the move model applies.                                                                                   |
| Nested or sub-columns | Out of scope | Stays out, as in the README.                                                                                                            |

## Out of scope through 1.0

Creating, editing, deleting, fetching or storing items. Rank rebalancing on the client. Sub-columns, items in more than one cell, Reanimated 3, the old architecture, and web.

Column reorder (0.8) and multi-select (0.7) leave the README's out-of-scope list when they ship.
