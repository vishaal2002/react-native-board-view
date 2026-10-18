<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/vishaal2002/react-native-board-view/main/docs/media/banner-dark.svg" />
  <img src="https://raw.githubusercontent.com/vishaal2002/react-native-board-view/main/docs/media/banner-light.svg" alt="react-native-board-view: Kanban and swimlane boards for React Native and Expo." width="100%" />
</picture>

<br />

<!-- github-only -->

[![npm version](https://img.shields.io/npm/v/react-native-board-view?color=2F6FEB&label=npm)](https://www.npmjs.com/package/react-native-board-view)
[![npm downloads](https://img.shields.io/npm/dm/react-native-board-view?color=2F6FEB)](https://www.npmjs.com/package/react-native-board-view)

<!-- /github-only -->

![License: MIT](https://img.shields.io/badge/license-MIT-2F6FEB)
![React Native 0.83+](https://img.shields.io/badge/react--native-0.83%2B-61dafb)
![Expo SDK 55+](https://img.shields.io/badge/expo-SDK%2055%2B-000020)
![New Architecture](https://img.shields.io/badge/new%20architecture-only-5B677A)
![TypeScript](https://img.shields.io/badge/types-included-3178C6)

**[Install](#install)** · **[Quick start](#quick-start)** · **[How a move works](#how-a-move-works)** · **[Layouts](#layouts)** · **[Loading data](#loading-data)** · **[API](#api)** · **[Recipes](https://github.com/vishaal2002/react-native-board-view/blob/main/docs/recipes.md)**

</div>

<br />

<table>
  <tr>
    <td align="center" width="33%"><img src="https://raw.githubusercontent.com/vishaal2002/react-native-board-view/main/docs/media/drag.webp" alt="A card is long-pressed in Backlog, lifted, carried to the screen edge so the board pages to To do, and dropped second in that column. Both column counts update." width="250" /></td>
    <td align="center" width="33%"><img src="https://raw.githubusercontent.com/vishaal2002/react-native-board-view/main/docs/media/move-sheet.webp" alt="The card menu opens the Move sheet. Choosing Review moves the card there, and the board scrolls to it." width="250" /></td>
    <td align="center" width="33%"><img src="https://raw.githubusercontent.com/vishaal2002/react-native-board-view/main/docs/media/rollback.webp" alt="A card is dragged lower in To do and shows a saving dot. The fake server rejects it after two seconds, the log says Rejected, and the card returns to the top." width="250" /></td>
  </tr>
  <tr>
    <td align="center"><b>Drag across columns</b><br /><sub>Long-press, carry, drop. Pages flip at the edge.</sub></td>
    <td align="center"><b>Move without dragging</b><br /><sub>The Move to… sheet and screen-reader actions.</sub></td>
    <td align="center"><b>Optimistic, with rollback</b><br /><sub>The server said no, so the card goes back.</sub></td>
  </tr>
</table>

<sub>Release build of <code>apps/bare</code> on a Pixel 9 Pro emulator. The chips above each board are demo controls, not part of <code>Board</code>.</sub>

## Why this board

Most React Native drag-and-drop libraries reorder one list. A board needs cards to move between many virtualized lists, while your server decides if the move sticks. This package does that one job.

<table>
  <tr>
    <td width="33%" valign="top"><h4><img src="https://raw.githubusercontent.com/vishaal2002/react-native-board-view/main/docs/media/icons/database.svg" width="18" height="18" alt="" align="top" /> Your data</h4>Pass a flat array and say which field makes the columns. The board never creates, edits, fetches, or stores items.</td>
    <td width="33%" valign="top"><h4><img src="https://raw.githubusercontent.com/vishaal2002/react-native-board-view/main/docs/media/icons/zap.svg" width="18" height="18" alt="" align="top" /> Optimistic moves</h4>A move shows at once. It stays until your items show it, and it rolls back if <code>onMove</code> throws or times out.</td>
    <td width="33%" valign="top"><h4><img src="https://raw.githubusercontent.com/vishaal2002/react-native-board-view/main/docs/media/icons/rocket.svg" width="18" height="18" alt="" align="top" /> Virtualized</h4>Columns are FlashLists, and swimlanes virtualize by lane. 4 × 500 cards held 60 fps median with a card lifted.</td>
  </tr>
  <tr>
    <td valign="top"><h4><img src="https://raw.githubusercontent.com/vishaal2002/react-native-board-view/main/docs/media/icons/layout-grid.svg" width="18" height="18" alt="" align="top" /> Five layouts</h4>Paged for phones, multi and fit for tablets, stacked for lists, and swimlanes on a second axis.</td>
    <td valign="top"><h4><img src="https://raw.githubusercontent.com/vishaal2002/react-native-board-view/main/docs/media/icons/accessibility.svg" width="18" height="18" alt="" align="top" /> Accessible</h4>Every move works without a drag. Moves are announced, focus follows the card, and reduced motion is honored.</td>
    <td valign="top"><h4><img src="https://raw.githubusercontent.com/vishaal2002/react-native-board-view/main/docs/media/icons/palette.svg" width="18" height="18" alt="" align="top" /> Yours to style</h4>Light and dark themes, compact density, token overrides, every string, and your own card and chrome.</td>
  </tr>
</table>

The drag engine is built for this package on Gesture Handler, Reanimated and FlashList. [Why we did not use an existing library](https://github.com/vishaal2002/react-native-board-view/blob/main/docs/decisions/0001-own-drag-engine.md).

## Install

```sh
npx expo install react-native-board-view react-native-reanimated react-native-worklets react-native-gesture-handler @shopify/flash-list
```

| Peer                           | Version                         |
| ------------------------------ | ------------------------------- |
| `react-native`                 | 0.83 or later, New Architecture |
| `react`                        | 19 or later                     |
| `react-native-reanimated`      | 4.1 to 4.x                      |
| `react-native-worklets`        | 0.5 to 0.x                      |
| `react-native-gesture-handler` | 2.28 to 3.x                     |
| `@shopify/flash-list`          | 2.0.2 to 2.x                    |

**Bare React Native:** `npm install` the same packages, add `react-native-worklets/plugin` last in `babel.config.js`, and rebuild the app.

**Expo:** use a [development build](https://docs.expo.dev/develop/development-builds/introduction/). Expo Go is untested.

## Quick start

```tsx
import { useCallback, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  Board,
  CardView,
  applyMove,
  type CardRenderInfo,
  type GroupBy,
  type MoveContext,
  type MoveOperation,
} from 'react-native-board-view';

type Task = { id: string; title: string; status: string | null; rank: string };

const groupBy: GroupBy<Task> = {
  columns: {
    key: 'status',
    values: [
      { id: 'todo', label: 'To do', color: '#64748B' },
      { id: 'doing', label: 'In progress', color: '#2563EB' },
      { id: 'done', label: 'Done', color: '#16A34A' },
    ],
  },
};

export function TaskBoard({ initial }: { initial: Task[] }) {
  const [tasks, setTasks] = useState(initial);

  const onMove = useCallback(async (op: MoveOperation, { signal }: MoveContext) => {
    const response = await fetch(`/api/tasks/${op.id}/move`, {
      method: 'POST',
      body: JSON.stringify({ ...op.changes, rank: op.rank, opId: op.opId }),
      signal,
    });
    if (!response.ok) throw new Error(`Move failed: ${response.status}`); // the card rolls back
    setTasks((current) =>
      current.map((task) =>
        task.id === op.id ? applyMove(task, op, groupBy, (item, rank) => ({ ...item, rank })) : task,
      ),
    );
  }, []);

  const renderCard = useCallback(
    ({ item, pending, dragging, compact }: CardRenderInfo<Task>) => (
      <CardView title={item.title} pending={pending} dragging={dragging} compact={compact} />
    ),
    [],
  );

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Board
        items={tasks}
        getItemId={(task) => task.id}
        getItemLabel={(task) => task.title}
        groupBy={groupBy}
        onMove={onMove}
        renderCard={renderCard}
      />
    </GestureHandlerRootView>
  );
}
```

Three things to know:

- **Ranks.** Each item needs a string `rank`, or pass `getRank`. Ranks are [fractional indexes](https://github.com/rocicorp/fractional-indexing). Records without one can be [seeded once](https://github.com/vishaal2002/react-native-board-view/blob/main/docs/recipes.md#seeding-ranks).
- **Stable props.** Keep `renderCard` and `groupBy` stable, and memoize your card.
- **Gesture root.** `Board` has its own `GestureHandlerRootView`. Keep one at your app root as well.

## How a move works

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/vishaal2002/react-native-board-view/main/docs/media/how-it-works-dark.svg" />
  <img src="https://raw.githubusercontent.com/vishaal2002/react-native-board-view/main/docs/media/how-it-works-light.svg" alt="Your items go to the board, which groups them into columns and lanes. The user moves a card, and onMove gets the operation while the card already shows in its new place. If onMove resolves, you update your items and the pending overlay clears. If it throws or times out, the card rolls back and onMoveError fires." width="100%" />
</picture>

1. **The card moves at once** and is marked `pending`. Your card can show that with `CardView`'s `pending` prop.
2. **`onMove(op, { signal })` runs.** Moves of the same card run one at a time. Moves of different cards run in parallel.
3. **Resolve to accept.** The overlay clears as soon as your `items` show the move, or after `settleTimeoutMs`, 5 seconds by default.
4. **Throw to reject.** The card goes back, later moves of that card are cancelled, `onMoveError` fires, and screen readers hear why.
5. **Past `inflightTimeoutMs`,** 30 seconds by default, the move rejects with `MoveTimeoutError` and `signal` aborts. Pass `0` when `onMove` waits for the user, for example on a form.

You do not need your own optimistic layer. The board's overlay is that layer.

<details>
<summary><b>What is in a <code>MoveOperation</code></b></summary>

| Field                  | Meaning                                                                                                     |
| ---------------------- | ----------------------------------------------------------------------------------------------------------- |
| `opId`                 | Unique per move. Send it as an idempotency key so a retry cannot apply the move twice.                      |
| `id`                   | The card.                                                                                                   |
| `changes`, `from`      | Only the grouped fields that change, new and old. `null` is the No value bucket. A cross-lane drop has two. |
| `rank`                 | The card's new fractional rank.                                                                             |
| `previousId`, `nextId` | The visible neighbors it lands between. Servers with integer positions or LexoRank can place from these.    |
| `source`               | `drag`, `sheet`, `swipe`, `accessibility`, `api` or `undo` <sup>0.6</sup>.                                  |

</details>

## Layouts

Pass one `layout`. The board renders that mode and no switcher.

<table>
  <tr>
    <td align="center" width="25%"><img src="https://raw.githubusercontent.com/vishaal2002/react-native-board-view/main/docs/media/layout-paged.png" alt="Paged layout on a phone. Column tabs at the top, Backlog on screen, and the next column peeking in from the right." width="190" /></td>
    <td align="center" width="25%"><img src="https://raw.githubusercontent.com/vishaal2002/react-native-board-view/main/docs/media/layout-stacked.png" alt="Stacked layout on a phone. One vertical list with a collapsible section per column." width="190" /></td>
    <td align="center" colspan="2"><img src="https://raw.githubusercontent.com/vishaal2002/react-native-board-view/main/docs/media/layout-fit.png" alt="Fit layout in landscape. All five columns share the width." width="400" /><br /><br /><img src="https://raw.githubusercontent.com/vishaal2002/react-native-board-view/main/docs/media/layout-swimlanes.png" alt="Swimlanes in landscape. Status columns across, one lane per assignee, with empty cells marked No cards." width="400" /></td>
  </tr>
  <tr>
    <td align="center"><b>paged</b><br /><sub>Phones. One column, the next peeks in.</sub></td>
    <td align="center"><b>stacked</b><br /><sub>One list, a section per column.</sub></td>
    <td align="center" colspan="2"><b>fit</b>, and <b>swimlanes</b> below it<br /><sub>Tablets and landscape. Every column on screen.</sub></td>
  </tr>
</table>

| `layout`  | What it does                                                                                             |
| --------- | -------------------------------------------------------------------------------------------------------- |
| `auto`    | `paged` below `autoBreakpoint` (600pt by default), `multi` above it. The default.                        |
| `paged`   | One column per page with snapping, a peek of the next one, and tabs or dots. Edge drags flip pages.      |
| `multi`   | Fixed-width columns side by side that scroll sideways. Set the width with `theme.columnWidth`.           |
| `fit`     | Columns share the width down to `theme.minColumnWidth`, then the board scrolls.                          |
| `stacked` | One vertical list with a collapsible section per column.                                                 |
| `matrix`  | Swimlane boards as a grid: lanes are rows, every cell on screen and scrolling on its own. <sup>0.6</sup> |

**Matrix.** For small grids such as a 2 × 2 of urgency and importance. It needs `groupBy.lanes`; without lanes it is `fit`. It never scrolls as a whole, so keep it to a few lanes and columns.

**Hidden empty columns.** `hideEmptyColumns` and `hideEmptyLanes` leave out columns and lanes with no cards, for filtered views such as "my cards". <sup>0.6</sup> The Move sheet, the dock and screen-reader actions still list them, and a card moved into one brings it back.

**Swimlanes are a second axis, not a layout.** Add `groupBy.lanes` to any layout. Lanes virtualize and collapse. A cell shows `cellLimit` cards (50 by default), then Show more. A drop across lanes changes both fields in one operation.

```tsx
const groupBy: GroupBy<Task> = {
  columns: { key: 'status', values: STATUSES },
  lanes: { key: 'assignee', values: PEOPLE },
};
```

<table>
  <tr>
    <td align="center" width="50%"><img src="https://raw.githubusercontent.com/vishaal2002/react-native-board-view/main/docs/media/swimlanes.webp" alt="A swimlane cell shows two cards and Show 2 more. The tap reveals the other two. A card is then dragged down, the board auto-scrolls, and the card drops into another person's lane." width="280" /></td>
    <td align="center" width="50%"><img src="https://raw.githubusercontent.com/vishaal2002/react-native-board-view/main/docs/media/rules.webp" alt="A Backlog card is dragged to Done, which only accepts reviewed cards. Done gets a red outline, and on release the card flies home." width="280" /></td>
  </tr>
  <tr>
    <td align="center"><b>Show more, and a cross-lane drop</b><br /><sub>The drop changes the card's lane field.</sub></td>
    <td align="center"><b>Rules</b><br /><sub><code>canDrop</code> refuses Done, so it turns red.</sub></td>
  </tr>
</table>

Unknown or `null` values land in a No value column or lane. Rename it with `labels.noValue`.

## Ways to move a card

| How             | On by default                                               | Turn it off or change it                                                                                                                                                                             |
| --------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Long-press drag | Yes                                                         | `moveModes={{ drag: false }}` turns it off. `drag: 'handle'` starts from a handle instead. `longPressDelay` sets the hold, 200ms by default.                                                         |
| Drag handle     | No                                                          | `drag: 'handle'`, and render a `<DragHandle>`. See [Drag handles](#drag-handles).                                                                                                                    |
| Move to… sheet  | Yes, from the "…" button and a long press released in place | `sheet: 'manual'` keeps the sheet and leaves the button to you. `sheet: false` removes it. `longPressSheet: false` keeps long press for dragging only. In handle mode a long-press does not open it. |
| Swipe sideways  | No. Experimental.                                           | `swipe: 'auto'`, in `multi` and `fit` only. Stays off until the usability study at 0.7. On paged phones a sideways swipe turns the page.                                                             |
| Drop dock       | Yes                                                         | `dock={false}` turns it off. Column chips and your `cardActions` slide up once a lifted card moves. See [Drop dock and undo](#drop-dock-and-undo).                                                   |
| Screen reader   | Always                                                      | Actions follow `canDrop`.                                                                                                                                                                            |
| From your code  | Always                                                      | `ref.moveItem(id, { columnId })`. See [Moving cards from code](#moving-cards-from-code).                                                                                                             |

## Drag handles

![New in 0.5](https://img.shields.io/badge/new%20in-0.5-2F6FEB)

Long-press is the default. With `moveModes={{ drag: 'handle' }}`, a long press no longer starts a drag. A touch that starts on a `DragHandle` in the card starts it instead, as soon as the finger moves a few points, with no long press. Touching the rest of the card scrolls the list. A tap on the grip does not open the Move sheet. The "…" button and the screen-reader actions still do.

```tsx
import { Board, CardView, DragHandle } from 'react-native-board-view';

<Board
  moveModes={{ drag: 'handle' }}
  renderCard={(info) => (
    <CardView title={info.item.title} leading={<DragHandle />} dragging={info.dragging} pending={info.pending} />
  )}
  // …
/>;
```

`DragHandle` draws a six-dot grip and is hidden from screen readers, because the card already exposes move actions. Pass children to draw your own grip. Outside handle mode the component only draws its children, and the board's long press still starts the drag.

**Rules.** `canDrag(item)` locks cards. `canDrop(item, target)` refuses cells: while dragging they turn red, in the sheet they are disabled, and screen-reader actions leave them out. Your server must still enforce the same rules. WIP limits are a [recipe](https://github.com/vishaal2002/react-native-board-view/blob/main/docs/recipes.md#rules-locked-cards-allowed-transitions-wip-limits).

**Read only.** `readOnly` keeps scrolling, paging, collapsing and Show more, and turns every way of moving off. `onMove` stays required, so the same board can leave read-only mode without a remount.

**Haptics.** <sup>0.6</sup> A card gives a light tick when it lifts, through your app's `expo-haptics` or `react-native-haptic-feedback` when one is installed. The board imports neither and does nothing without them. `haptics={false}` turns it off, and `haptics={(event) => …}` uses your own. For more moments, `onDragOver` and `onDragEnd` are the hooks: see the [recipe](https://github.com/vishaal2002/react-native-board-view/blob/main/docs/recipes.md#haptics).

## Drop dock and undo

![New in 0.6](https://img.shields.io/badge/new%20in-0.6-2F6FEB)

<img align="right" src="https://raw.githubusercontent.com/vishaal2002/react-native-board-view/main/docs/media/dock.webp" alt="A Backlog card is long-pressed. A tray slides up with Archive, Assign to me and a chip per column. The card shrinks over the Done chip, which lights up, and is dropped there. A banner says Moved Test login with SSO to Done, with Undo. Undo puts the card back at the top of Backlog." width="230" />

Moving a card three columns over on a phone means riding the edge scroll past every column in between. A tray slides up from the bottom once a lifted card starts to move, and the lists end above it so it never covers a card. `dock={false}` turns it off. A long press released in place still opens the Move sheet, and the dock never shows for it. Drop the card on a column chip and it goes to the top of that column, in its own lane, without scrolling there. Drop it on one of your `cardActions` and the board calls `onCardAction`. Over the dock the card shrinks toward your finger so you can see the chip it is on.

```tsx
const actions: CardAction[] = [
  { key: 'archive', label: 'Archive', color: '#D93F3F' },
  { key: 'mine', label: 'Assign to me' },
];

<Board
  undo
  cardActions={actions}
  canPerformAction={(task, action) => action !== 'mine' || task.assignee !== me}
  onCardAction={({ action, item }) => {
    if (action === 'archive') archive(item.id);
    if (action === 'mine') assign(item.id, me);
  }}
  // …
/>;
```

- **Actions are yours.** The board never deletes or edits an item. `onCardAction` gets the action, the item, where it was, and `source`: `'dock'`, `'sheet'` or `'accessibility'`.
- **Not only for drags.** The same actions appear at the end of the Move sheet and as screen-reader actions on the card.
- **Choosing chips.** `dock={{ columns: ['todo', 'done'] }}` shows only those columns, in that order. `dock={{ actions: false }}` keeps actions out of the dock.
- **Edges.** While the dock shows, a list's bottom edge starts above it and waits 250 ms before scrolling, so passing through on the way to the dock does not move the list.

<br clear="right" />

**Undo.** `undo` shows a banner after each move a person makes: "Moved “Fix login” to Done · Undo". `board.undo()` works without the banner. Undo goes through `onMove` like any move, with `source: 'undo'`, and puts the card back at its old position. A move the data has since changed, or one that was rolled back, is skipped. The banner hides after `undo.timeoutMs` (5000), or stays until dismissed while a screen reader runs.

## Overview

![Experimental](https://img.shields.io/badge/experimental-0.6-8B95A7)

<table>
  <tr>
    <td align="center" width="50%"><img src="https://raw.githubusercontent.com/vishaal2002/react-native-board-view/main/docs/media/overview.png" alt="Board overview on a phone. All five columns fit side by side, each card reduced to a small label with its column's color, and a Back to the board button." width="230" /></td>
    <td align="center" width="50%"><img src="https://raw.githubusercontent.com/vishaal2002/react-native-board-view/main/docs/media/matrix.png" alt="Matrix layout on a phone. Important and Not important across the top, Urgent and Not urgent down the side, four cells each with their own cards." width="230" /></td>
  </tr>
  <tr>
    <td align="center"><b>overview</b><br /><sub>Every column at once. Cards still drag.</sub></td>
    <td align="center"><b>layout="matrix"</b><br /><sub>Lanes are rows; every cell on screen.</sub></td>
  </tr>
</table>

`overview` lets people pinch in on the board to see every column at once, with small cards that still drag. Pinch out, tap a column's header, or press "Back to the board" to return, and the board opens at that column. `ref.setOverview(true)` opens it from your own button. It works on boards without lanes in the `paged`, `multi` and `fit` layouts. The pinch has not been tested on a device yet, so it may change.

## Loading data

![New in 0.4](https://img.shields.io/badge/new%20in-0.4-2F6FEB)

The board never fetches. It tells you when to, and it shows what you pass back.

<table>
  <tr>
    <td align="center" width="50%"><img src="https://raw.githubusercontent.com/vishaal2002/react-native-board-view/main/docs/media/load-more.webp" alt="Backlog shows 22 in its header with six cards loaded. Scrolling to the end shows a spinner, then six more cards appear." width="280" /></td>
    <td align="center" width="50%"><img src="https://raw.githubusercontent.com/vishaal2002/react-native-board-view/main/docs/media/refresh.webp" alt="Pulling Backlog down shows the refresh spinner. A new card from the server lands on top, and the count goes from 22 to 23." width="280" /></td>
  </tr>
  <tr>
    <td align="center"><b>Load more</b><br /><sub><code>onEndReached</code>, <code>loadingColumns</code>, <code>columnTotals</code></sub></td>
    <td align="center"><b>Pull to refresh</b><br /><sub><code>onRefresh</code>, <code>refreshing</code></sub></td>
  </tr>
</table>

```tsx
<Board
  items={tasks}
  onEndReached={(columnId) => loadNextPage(columnId)} // a column hit its end
  loadingColumns={loading} // ['todo'] while that page loads
  columnTotals={totals} // { todo: 120 }: headers and tabs show 120, not 18
  onRefresh={refresh}
  refreshing={refreshing}
  // …
/>
```

The full pattern is in the [paging recipe](https://github.com/vishaal2002/react-native-board-view/blob/main/docs/recipes.md#columns-loaded-in-pages).

## Moving cards from code

![New in 0.4](https://img.shields.io/badge/new%20in-0.4-2F6FEB)

<img align="right" src="https://raw.githubusercontent.com/vishaal2002/react-native-board-view/main/docs/media/highlight.webp" alt="Find last card scrolls to the last card in Backlog and flashes an outline on it. Move it to the top then moves that card to the top of the column, where it flashes again and shows a saving dot." width="230" />

`ref.moveItem` moves a card the same way a drop does. The card moves at once, `onMove` gets `source: 'api'`, and a rejection rolls it back. `canDrop` and `readOnly` still apply, and the method returns `false` when nothing was queued.

`scrollToItem` with `highlight: true` flashes an outline on the card once it is on screen. Use it for search results, deep links, or to show where a card went. With reduced motion on, the outline holds still.

```tsx
const board = useRef<BoardHandle>(null);

// A "Done" button on a card
board.current?.moveItem(task.id, { columnId: 'done', index: 'end' });

// Jump to a search result
board.current?.scrollToItem(task.id, { highlight: true });
```

`columnId` is required. `laneId` defaults to the card's lane. `index` defaults to `0`, the top.

<br clear="right" />

## Theming

<table>
  <tr>
    <td align="center" width="30%"><img src="https://raw.githubusercontent.com/vishaal2002/react-native-board-view/main/docs/media/dark-paged.png" alt="The paged board in the dark theme." width="190" /></td>
    <td align="center" width="70%"><img src="https://raw.githubusercontent.com/vishaal2002/react-native-board-view/main/docs/media/dark-fit.png" alt="The fit layout in landscape in the dark theme." width="440" /></td>
  </tr>
</table>

`appearance` follows the system by default. `density="compact"` tightens spacing. `theme` overrides any token, and `useBoardTheme()` gives your cards the same tokens.

```tsx
<Board
  theme={{ accent: '#7C3AED', radius: 16, columnWidth: 280, liftTilt: 3, liftScale: 1.06, dropDuration: 300 }}
  labels={{ noValue: 'Unassigned', showMore: (n) => `${n} more` }}
  // …
/>
```

`liftScale` (1.03), `liftTilt` (0 degrees), `liftShadowOpacity` (0.25 in light, 0.55 in dark) and `dropDuration` (200 ms) are how the lifted card looks and how long a drop takes. <sup>0.5</sup> Compact density does not change them. Reduced motion turns the scale and the tilt off. `liftShadowOpacity` is an iOS shadow added to your card's own. Android ignores it, so give your card an `elevation` while `dragging`, as `CardView` does.

`CardView` is a ready-made card. It takes `title`, `description`, `tags`, `meta`, `assignee`, `accentColor`, `pending`, `dragging`, `compact`, `leading` and `onPress`. `leading` is the slot for a `DragHandle`. Use the card, wrap it, or render your own. Headers, empty cells, footers and the drop indicator have render props too.

## Accessibility

- **One element per card.** The label gives the item, its column and lane, and its position, for example "Fix login, To do, 2 of 5".
- **Moves without a drag.** Actions are Move to…, Move to a column, Move to a lane, and your `cardActions`. The sheet lists only allowed destinations, and has Up, Down, Previous column and Next column for one-tap moves.
- **Undo.** The banner's Undo button names the move. With a screen reader running, the banner stays until dismissed.
- **Announcements.** A move is announced when `onMove` resolves, never before. A rollback is announced with where the card went back to.
- **Focus.** It follows a card moved from the sheet or by a screen-reader action.
- **Motion and layout.** Reduced motion is honored, RTL layouts mirror, and text can grow without clipping.
- **Strings.** Every string, including announcements, can be replaced through `labels`.

## Performance

Release build on a Pixel 9 Pro emulator (arm64, 60 Hz). The host Mac was on battery. These are not phone numbers.

A 500-card column, card held at the bottom edge for 4 s, read with `dumpsys gfxinfo`. 0.4.0 issued each scroll from JS. 0.5.0 scrolls that list on the UI thread. The FPS meter read JS 29–31 and UI 60 on both; JS is FlashList rendering cells.

| Build                  | Frames drawn | About  | Janky  |
| ---------------------- | ------------ | ------ | ------ |
| JS-driven, as in 0.4.0 | 170          | 42 fps | 42–45% |
| UI thread, 0.5.0       | 245          | 61 fps | 0.4%   |

A re-run of the final 0.5.0 build, with the host on mains power, drew 245–246 frames with 0% janky for the column and the stacked list. The 20 lane × 6 column board (1,200 cards) drew 227–228 frames, about 57 fps, with about 8% janky. Sideways auto-scroll in `multi` drew 201 frames with 7% janky. A still board barely draws, so idle and a motionless hold are not frame rates there.

The method, the 2026-10-10 meter table, and what is still unmeasured are in [docs/benchmarks.md](https://github.com/vishaal2002/react-native-board-view/blob/main/docs/benchmarks.md).

To keep it fast, memoize your card and filter `items` before they reach the board.

## API

### `<Board>` props

**Data and moves**

| Prop                                                    | Default          | Notes                                                                                                                                 |
| ------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `items`, `getItemId`, `groupBy`, `onMove`, `renderCard` |                  | Required.                                                                                                                             |
| `getRank`                                               | `item.rank`      | One global rank per item. A missing rank sorts first.                                                                                 |
| `getItemLabel`                                          | the id           | Used by screen readers and the Move sheet.                                                                                            |
| `onMoveError`                                           |                  | A move was rejected or timed out and rolled back.                                                                                     |
| `canDrag`, `canDrop`                                    | allow all        | Lock cards and refuse cells.                                                                                                          |
| `cardActions`, `onCardAction`, `canPerformAction`       |                  | App actions in the dock, the sheet and screen-reader actions. <sup>0.6</sup>                                                          |
| `dock`                                                  | `true`           | The drop dock. `false`, or `{ columns, actions }`. <sup>0.6</sup>                                                                     |
| `haptics`                                               | `true`           | A tick on lift through your app's haptics module, `false`, or your own function. <sup>0.6</sup>                                       |
| `undo`                                                  | `false`          | The undo banner. `true` or `{ timeoutMs }`. <sup>0.6</sup>                                                                            |
| `readOnly`                                              | `false`          | Display only.                                                                                                                         |
| `moveModes`                                             | drag and sheet   | `{ drag, sheet, longPressSheet, swipe }`. `drag` is `'auto'`, `'handle'` or `false`. See [Ways to move a card](#ways-to-move-a-card). |
| `onDragStart`, `onDragOver`, `onDragEnd`                |                  | Drag lifecycle, for example for haptics.                                                                                              |
| `settleTimeoutMs`, `inflightTimeoutMs`                  | 5000, 30000      | `0` waits forever.                                                                                                                    |
| `rankStrategy`                                          | fractional index | Replace the rank math.                                                                                                                |

**Layout and navigation**

| Prop                                 | Default         | Notes                                                                           |
| ------------------------------------ | --------------- | ------------------------------------------------------------------------------- |
| `layout`                             | `auto`          | `paged`, `multi`, `fit`, `stacked`, `matrix` <sup>0.6</sup>.                    |
| `hideEmptyColumns`, `hideEmptyLanes` | `false`         | Leave out columns and lanes with no cards. <sup>0.6</sup>                       |
| `overview`, `onOverviewChange`       | `false`         | Experimental. Pinch in for the whole board. <sup>0.6</sup>                      |
| `autoBreakpoint`                     | `600`           | Under `auto`, boards narrower than this are paged. <sup>0.4</sup>               |
| `pagerIndicator`                     | `tabs`          | Paged only. `dots` or `none`.                                                   |
| `columnId`, `onColumnChange`         |                 | The column on screen. Update `columnId` from the callback.                      |
| `initialColumnId`                    |                 | The first column on screen when `columnId` is not set.                          |
| `collapsibleColumns`                 | on in `stacked` | Never in `paged`.                                                               |
| `collapsedColumns`, `collapsedLanes` | board-managed   | Controlled lists, with `onCollapsedColumnsChange` and `onCollapsedLanesChange`. |
| `cellLimit`                          | `50`            | Swimlane cards per cell before Show more.                                       |
| `autoScroll`, `longPressDelay`       | `true`, `200`   | Edge scrolling while dragging, and the hold before a drag.                      |

**Loading** <sup>0.4</sup>

| Prop                      | Notes                                                                                     |
| ------------------------- | ----------------------------------------------------------------------------------------- |
| `onEndReached`            | A column reached its end. Fires again only after your append and a new scroll to the end. |
| `loadingColumns`          | Column ids that are fetching. A spinner shows where `onEndReached` fired.                 |
| `columnTotals`            | Server counts by column id, shown in headers, tabs and screen-reader labels.              |
| `onRefresh`, `refreshing` | Pull to refresh.                                                                          |

**Appearance and rendering**

| Prop                                                           | Default       | Notes                                               |
| -------------------------------------------------------------- | ------------- | --------------------------------------------------- |
| `appearance`                                                   | `auto`        | `light` or `dark`.                                  |
| `density`                                                      | `comfortable` | `compact`.                                          |
| `theme`, `labels`                                              | built in      | Partial overrides.                                  |
| `renderColumnHeader`, `renderLaneHeader`                       |               | Headers get counts, `total`, and a collapse toggle. |
| `renderEmptyCell`, `renderColumnFooter`, `renderDropIndicator` |               | Footers get `loading`.                              |
| `style`, `testID`, `ref`                                       |               |                                                     |

### Ref handle

| Method                                        | What it does                                                                                                    |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `moveItem(id, { columnId, laneId?, index? })` | Moves a card through the same optimistic queue as a drop. Returns `false` if nothing was queued. <sup>0.4</sup> |
| `scrollToItem(id, { animated?, highlight? })` | Scrolls a card into view. `highlight` flashes an outline on it. <sup>0.4</sup>                                  |
| `scrollToColumn(id, { animated? })`           | Scrolls a column into view.                                                                                     |
| `openMoveSheet(id)`, `closeMoveSheet()`       | Opens or closes the Move sheet.                                                                                 |
| `undo()`, `canUndo()`                         | Reverts the newest move that is still where it landed. <sup>0.6</sup>                                           |
| `setOverview(open, columnId?)`                | Experimental. Opens or closes the overview. <sup>0.6</sup>                                                      |

### `renderCard` info

`item`, `cellId`, `index`, `count`, `column`, `lane`, `pending`, `dragging` (true for the lifted copy), `compact` (the column is narrow), and `openMoveSheet()`.

### The core, on your server too

`react-native-board-view` re-exports `board-view-core`, which has no React dependency and runs in Node as ESM or CommonJS. Use the same grouping, rank and move planning on your server: `projectBoard`, `planMove`, `applyMove`, `seedRanks`, `rebalanceRanks` and `shouldRebalance`. See the [recipe](https://github.com/vishaal2002/react-native-board-view/blob/main/docs/recipes.md#one-implementation-on-the-client-and-the-server).

## Recipes

- [Plain `fetch` and local state](https://github.com/vishaal2002/react-native-board-view/blob/main/docs/recipes.md#plain-fetch-and-local-state)
- [Columns loaded in pages](https://github.com/vishaal2002/react-native-board-view/blob/main/docs/recipes.md#columns-loaded-in-pages)
- [Moving cards from code](https://github.com/vishaal2002/react-native-board-view/blob/main/docs/recipes.md#moving-cards-from-code) and [undo](https://github.com/vishaal2002/react-native-board-view/blob/main/docs/recipes.md#undo)
- [TanStack Query](https://github.com/vishaal2002/react-native-board-view/blob/main/docs/recipes.md#tanstack-query) and [local-first stores](https://github.com/vishaal2002/react-native-board-view/blob/main/docs/recipes.md#local-first-stores-watermelondb-powersync-zero-legend-state)
- [Asking for input before a move](https://github.com/vishaal2002/react-native-board-view/blob/main/docs/recipes.md#asking-for-input-before-a-move-required-fields)
- [Rules and WIP limits](https://github.com/vishaal2002/react-native-board-view/blob/main/docs/recipes.md#rules-locked-cards-allowed-transitions-wip-limits)
- [Seeding](https://github.com/vishaal2002/react-native-board-view/blob/main/docs/recipes.md#seeding-ranks) and [rebalancing](https://github.com/vishaal2002/react-native-board-view/blob/main/docs/recipes.md#keeping-ranks-short-rebalancing) ranks
- [Sorted or filtered views](https://github.com/vishaal2002/react-native-board-view/blob/main/docs/recipes.md#sorted-or-filtered-views)
- [Haptics](https://github.com/vishaal2002/react-native-board-view/blob/main/docs/recipes.md#haptics)

## Status

The API can still change before 1.0. Breaking changes are listed in the [changelog](https://github.com/vishaal2002/react-native-board-view/blob/main/CHANGELOG.md).

These are still open before 1.0:

- **Real devices.** The drag gates have run on an Android emulator and the iOS simulator, not yet on a mid-tier Android phone or an iPhone. See the [release gates](https://github.com/vishaal2002/react-native-board-view/blob/main/docs/spike.md). 0.5.0 and 0.6.0 have not run on iOS yet. Their numbers are from the Pixel 9 Pro emulator, release build. The overview's pinch has not run on any device: the emulator drives one finger.
- **Screen-reader pass.** TalkBack and VoiceOver have not completed a full move test yet. Handle mode hides the grip from screen readers; the card's move actions stay.
- **Usability study.** Five developers new to the package have not been timed yet. Swipe-to-move stays experimental, and off by default, until that study at 0.7.

**Out of scope:** creating, editing, deleting, fetching or storing items. Rank rebalancing on the client. Sub-columns, items in more than one cell, and any action that edits items itself. Column reorder and multi-select are planned, see the [roadmap](https://github.com/vishaal2002/react-native-board-view/blob/main/docs/roadmap.md). Reanimated 3, the old architecture, and web.

## Try the demo

`apps/example` (Expo) and `apps/bare` (React Native CLI) run the same demo, with a screen per layout, rule and stress test. The captures above come from its Showcase, Live data, Optimistic moves, Rules and Swimlanes screens. Setup is in [CONTRIBUTING.md](https://github.com/vishaal2002/react-native-board-view/blob/main/CONTRIBUTING.md).

| Package                   | What it is                                                                |
| ------------------------- | ------------------------------------------------------------------------- |
| `react-native-board-view` | `Board`, `CardView`, `DragHandle`, and a re-export of the core. **0.5.0** |
| `board-view-core`         | Grouping, ranks, move planning and the move queue. No React. **0.1.0**    |

[MIT](https://github.com/vishaal2002/react-native-board-view/blob/main/LICENSE) © react-native-board-view contributors
