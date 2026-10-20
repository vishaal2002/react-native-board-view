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
const taskId = (task: Task) => task.id;
const taskLabel = (task: Task) => task.title;

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
        getItemId={taskId}
        getItemLabel={taskLabel}
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
- **Stable props.** Keep `renderCard`, `groupBy` and the other functions and objects you pass stable: define them outside the component, or wrap them in `useCallback` and `useMemo`. Memoize your card too. Cards redraw only when their own data changes, unless a new `renderCard`, `getItemLabel`, `theme`, `spotlight`, `canDrag`, `canDrop`, `cardActions` or `canPerformAction` arrives, which redraws them all.
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
| `batch`                | Only when several cards move together: `{ id, index, size }`, the same `id` on every op. <sup>0.8</sup>     |

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

| `layout`  | What it does                                                                                                                  |
| --------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `auto`    | `paged` below `autoBreakpoint` (600pt by default), `multi` above it. The default.                                             |
| `paged`   | One column per page with snapping, a peek of the next one, and tabs or dots. Edge drags flip pages.                           |
| `multi`   | Fixed-width columns side by side that scroll sideways. Set the width with `theme.columnWidth`.                                |
| `fit`     | Columns share the width down to `theme.minColumnWidth`, then the board scrolls.                                               |
| `stacked` | One vertical list with a collapsible section per column.                                                                      |
| `matrix`  | Swimlane boards as a grid: lanes are rows, every cell on screen and scrolling on its own. <sup>0.6</sup>                      |
| `planner` | A column per day, today marked, weekends set back, more days at either end. <sup>0.7</sup> See [Week planner](#week-planner). |

**Matrix.** For small grids such as a 2 × 2 of urgency and importance. It needs `groupBy.lanes`; without lanes it is `fit`. It never scrolls as a whole, so keep it to a few lanes and columns.

**Hidden empty columns.** `hideEmptyColumns` and `hideEmptyLanes` leave out columns and lanes with no cards, for filtered views such as "my cards". <sup>0.6</sup> The Move sheet, the dock and screen-reader actions still list them, and a card moved into one brings it back.

**Swimlanes are a second axis, not a layout.** Add `groupBy.lanes` to any layout. Lanes virtualize and collapse. A cell shows `laneCellLimit` cards (50 by default), then Show more. A drop across lanes changes both fields in one operation.

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
| Several at once | Yes                                                         | Start from **Select** in a card's Move sheet. `selectable={false}` turns it off. See [Several cards at once](#several-cards-at-once).                                                                |
| Drop dock       | Yes                                                         | `dock={false}` turns it off. Column chips and your `cardActions` slide up once a lifted card moves. See [Drop dock and undo](#drop-dock-and-undo).                                                   |
| Mouse, keyboard | Yes                                                         | A mouse picks a card up after a short press. A keyboard reaches each card's "…". See [Accessibility](#accessibility).                                                                                |
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

## Several cards at once

![New in 0.8](https://img.shields.io/badge/new%20in-0.8-2F6FEB)

Open a card's Move sheet and tap **Select**, or use the card's Select screen-reader action. From then on a tap selects a card instead of opening it, each selected card shows a check, and a bar at the bottom reads "3 selected · Move · Done".

- **Drag one, move them all.** Lift a selected card and the rest ride with it: the lifted card shows a stack and a count, and the others fade until the drop. They land together around the card you dragged, in board order.
- **Or use Move.** The bar's Move opens the Move sheet for the whole selection ("Move 3 cards"). The dock and your `cardActions` take a selection too: `onCardAction` gets every card in `itemIds`.
- **One undo.** The banner reads "Moved 3 cards to Done", and Undo puts them all back.
- **Your server sees single moves.** `onMove` gets one op per card, in order, each with `op.batch = { id, index, size }`. A server that wants one request can wait for `index === size - 1`; one that does not can ignore `batch`.

```tsx
const [selection, setSelection] = useState<string[]>([]);

<Board
  selection={selection} // optional: leave both out and the board keeps it
  onSelectionChange={setSelection}
  // …
/>;

board.current?.setSelection(['a', 'b']); // from your own "Select all"
board.current?.moveItems(['a', 'b'], { columnId: 'done' });
```

Cards that `canDrop` refuses stay where they are; the others still move. Cards that `canDrag` locks stay out of a drag. `selectable={false}` turns selection off.

## Reorder columns and lanes

![New in 0.8](https://img.shields.io/badge/new%20in-0.8-2F6FEB)

Pass `onColumnOrderChange` and every column header gets a "…". It opens a sheet that moves the column left or right, to either end, or collapses it. Screen readers reach the same "…" on the header. `onLaneOrderChange` does the same for swimlane headers, up and down.

The order is yours, like the cards: the board reports the new list of ids and waits for `groupBy` to show it.

```tsx
const [order, setOrder] = useState(STATUSES.map((status) => status.id));
const groupBy = useMemo(
  () => ({ columns: { key: 'status', values: order.map((id) => STATUSES.find((status) => status.id === id)!) } }),
  [order],
);

<Board groupBy={groupBy} onColumnOrderChange={setOrder} /* … */ />;
```

The No value column and lane are not in `groupBy`, so they have no "…".

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

## Your data at a glance

![New in 0.7](https://img.shields.io/badge/new%20in-0.7-2F6FEB)

<table>
  <tr>
    <td align="center" width="50%"><img src="https://raw.githubusercontent.com/vishaal2002/react-native-board-view/main/docs/media/insights.png" alt="In progress, with a 13 of 13 count in the warning color and a full meter under its header, and a sum of 61k. Cards show their age, and a 12 day old card has an amber age chip." width="230" /></td>
    <td align="center" width="50%"><img src="https://raw.githubusercontent.com/vishaal2002/react-native-board-view/main/docs/media/planner.png" alt="The week planner. Monday 19 October has the date in an accent disc for today, Tuesday 20 sits next to it, each with its count." width="230" /></td>
  </tr>
  <tr>
    <td align="center"><b>Limits, sums and ageing</b><br /><sub>13/13 is full, so it turns amber.</sub></td>
    <td align="center"><b>layout="planner"</b><br /><sub>A column per day.</sub></td>
  </tr>
</table>

```tsx
<Board
  columnLimits={{ doing: 5, review: 3 }}
  limitBehavior="block"
  getItemValue={(deal) => deal.amount}
  formatValue={(sum) => `$${Math.round(sum / 1000)}k`}
  spotlight={(deal) => deal.owner === me}
  getItemAge={(deal) => daysSince(deal.updatedAt)}
  // …
/>
```

- **Limits.** `columnLimits` puts the count against the limit in each header ("4/5"), with a thin meter that fills as the column does. It turns the warning color when full and the reject color when over. With `limitBehavior="block"`, a full column refuses cards everywhere: drag, dock, Move sheet and screen-reader actions. The count is your `columnTotals` when you pass them.
- **Sums.** `getItemValue` adds up a number per card, such as a deal amount, and shows it in each header. `formatValue` decides how it reads; the default is compact ("12.4k").
- **Spotlight.** `spotlight` keeps matching cards bright and fades the rest without moving them, so a search shows its results in context. Faded cards still move, and screen readers hear "outside the filter".
- **Ageing.** `getItemAge` returns a card's age in days. `renderCard` gets `age` and `stale` (from `staleAfterDays`, 14 by default), and `CardView` shows them as a small chip that turns amber when stale.
- **Lanes.** Each lane header has a thin bar showing how its cards spread across the columns, in the columns' colors.
- **Sticky headers.** Lane headers in swimlanes and section headers in stacked stay pinned while their cards scroll. `stickyHeaders={false}` turns it off.

Every header's screen-reader label carries the same facts, for example "In progress, 13 of 13 cards, full, total $61k". Your `renderColumnHeader` and `renderLaneHeader` get them too: `limit`, `limitState`, `value`, `valueLabel`, `day` and `distribution`.

## Week planner

![New in 0.7](https://img.shields.io/badge/new%20in-0.7-2F6FEB)

`layout="planner"` is a column per day. Today's date sits in an accent disc, weekends sit back, and a Today button appears when today is off screen. Build the columns with `dayColumns`, whose ids are `YYYY-MM-DD` dates, and add days from `onEdgeReached`. When days are added in front, the board keeps the same day on screen.

```tsx
const [range, setRange] = useState({ start: addDays(new Date(), -3), count: 14 });
const groupBy = useMemo(() => ({ columns: { key: 'day', values: dayColumns(range.start, range.count) } }), [range]);

<Board
  layout="planner"
  groupBy={groupBy}
  initialColumnId={toDayId(new Date())}
  onEdgeReached={(edge) =>
    setRange((r) =>
      edge === 'start' ? { start: addDays(r.start, -7), count: r.count + 7 } : { ...r, count: r.count + 7 },
    )
  }
  // …
/>;
```

`onEdgeReached` works in `multi` and `fit` too, for any board whose columns load in pages. A board that already fits the screen gets `'end'` once per width, so a short planner keeps growing until it scrolls.

## Loading data

![New in 0.4](https://img.shields.io/badge/new%20in-0.4-2F6FEB)

The board never fetches. It tells you when to, and it shows what you pass back.

<table>
  <tr>
    <td align="center" width="50%"><img src="https://raw.githubusercontent.com/vishaal2002/react-native-board-view/main/docs/media/load-more.webp" alt="Backlog shows 22 in its header with six cards loaded. Scrolling to the end shows a spinner, then six more cards appear." width="280" /></td>
    <td align="center" width="50%"><img src="https://raw.githubusercontent.com/vishaal2002/react-native-board-view/main/docs/media/refresh.webp" alt="Pulling Backlog down shows the refresh spinner. A new card from the server lands on top, and the count goes from 22 to 23." width="280" /></td>
  </tr>
  <tr>
    <td align="center"><b>Load more</b><br /><sub><code>onColumnEndReached</code>, <code>loadingColumns</code>, <code>columnTotals</code></sub></td>
    <td align="center"><b>Pull to refresh</b><br /><sub><code>onRefresh</code>, <code>refreshing</code></sub></td>
  </tr>
</table>

```tsx
<Board
  items={tasks}
  onColumnEndReached={(columnId) => loadNextPage(columnId)} // a column hit its end
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

## Testing your board

![New in 0.8](https://img.shields.io/badge/new%20in-0.8-2F6FEB)

`react-native-board-view/testing` runs the board's own move code on plain data, with no rendering and no native modules to mock. It works in Jest and Vitest.

```ts
import { createBoardTester } from 'react-native-board-view/testing';

it('moves a task to Done and saves it', async () => {
  const save = jest.fn();
  const board = createBoardTester({ items, getItemId: (task) => task.id, groupBy, onMove: save });

  expect(board.drag('a', { columnId: 'done' })).toBe(true);
  expect(board.column('done')).toEqual(['a', 'c']);

  await board.settle();
  expect(save).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'a', changes: { status: 'done' } }),
    expect.anything(),
  );
  board.dispose();
});
```

- **Moves:** `drag`, `move(id, to, source)`, `moveMany`, `undo` and `canMove`. `columnLimits`, `limitBehavior`, `canDrop` and `readOnly` apply as on the board.
- **What the board shows:** `column(id, laneId?)`, `columns()`, `model()` and `isPending(id)`.
- **What happened:** `moves` (every op `onMove` received) and `announcements` (what screen readers heard).
- **Your data:** `setItems(next)` stands in for a re-render. `applyAcceptedMoves: true` applies every accepted move to the items for you.

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

**Presets.** <sup>0.7</sup> `themePreset` picks a built-in palette with a light and a dark variant: `paper` (warm), `slate` (cool, high contrast) or `aurora` (violet). Each passes WCAG AA for text and muted text, and `theme` overrides still win. `motion` sets how the board moves: `calm`, `snappy` or `playful` (a little tilt and a springy landing). Reduced motion still turns it all off.

`liftScale` (1.03), `liftTilt` (0 degrees), `liftShadowOpacity` (0.25 in light, 0.55 in dark) and `dropDuration` (200 ms) are how the lifted card looks and how long a drop takes. <sup>0.5</sup> Compact density does not change them. Reduced motion turns the scale and the tilt off. `liftShadowOpacity` is an iOS shadow added to your card's own. Android ignores it, so give your card an `elevation` while `dragging`, as `CardView` does.

`CardView` is a ready-made card. It takes `title`, `description`, `tags`, `meta`, `assignee`, `accentColor`, `pending`, `dragging`, `compact`, `leading`, `age`, `stale` and `onPress`. `leading` is the slot for a `DragHandle`. Use the card, wrap it, or render your own. Headers, empty cells, footers and the drop indicator have render props too.

**Your own card, all of it.** <sup>1.0</sup> `renderCard` draws the card. The board still draws a few marks over it: the selection check and outline, the highlight ring, the pointer outline, the spotlight fade, and the stack and count on a dragged selection. `cardMarks="manual"` turns them all off, and your card draws its own from `renderCard`'s info. With `moveModes={{ sheet: 'manual' }}` the board's "…" button goes too, and your card calls `openMoveSheet()`.

```tsx
const renderCard = ({
  item,
  selected,
  highlighted,
  dimmed,
  dragging,
  dragCount,
  openMoveSheet,
}: CardRenderInfo<Task>) => (
  <Ticket
    task={item}
    outlined={selected || highlighted || dragging}
    faded={dimmed}
    badge={dragCount > 1 ? `${dragCount} tickets` : undefined}
    onMenu={openMoveSheet}
  />
);

<Board cardMarks="manual" moveModes={{ sheet: 'manual' }} renderCard={renderCard} /* … */ />;
```

## Accessibility

- **One element per card.** The label gives the item, its column and lane, and its position, for example "Fix login, To do, 2 of 5".
- **Moves without a drag.** Actions are Move to…, Move to a column, Move to a lane, and your `cardActions`. The sheet lists only allowed destinations, and has Up, Down, Previous column and Next column for one-tap moves. On Android the card's actions are built while an accessibility service (TalkBack, Switch Access, Voice Access) runs, and appear as soon as one turns on. <sup>0.8.1</sup>
- **Undo.** The banner's Undo button names the move. With a screen reader running, the banner stays until dismissed.
- **Announcements.** A move is announced when `onMove` resolves, never before. A rollback is announced with where the card went back to.
- **Focus.** It follows a card moved from the sheet or by a screen-reader action, and the board scrolls to the card first.
- **Selection.** <sup>0.8</sup> Each card has Select and Deselect actions, a selected card says "Selected" first, and the bar's count is announced as it changes.
- **Keyboard and pointer.** <sup>0.8</sup> On Android, a hardware keyboard reaches every card and its "…" with Tab and the arrows, and Enter opens the Move sheet. On iOS, Full Keyboard Access reaches the same screen-reader actions. A mouse or trackpad shows a hover outline and picks a card up after a short press. Moving a card with the arrow keys alone needs a native key-event module, and is planned for after 1.0.
- **Moves from elsewhere.** <sup>0.8</sup> When your data moves a card by itself, a teammate's change for example, the card flashes once and screen readers hear where it went. `highlightExternalMoves={false}` turns it off.
- **Motion and layout.** Reduced motion is honored, RTL layouts mirror, and text can grow without clipping.
- **Strings.** Every string, including announcements, can be replaced through `labels`.

## Performance

**On a phone.** <sup>0.8.1</sup> These are release builds on a vivo V2158 (Android 14, 60 Hz), on battery, with 0.8.0 and 0.8.1 measured in turn. The first three rows are janky frames from `dumpsys gfxinfo`.

| Board                     | Scenario                   | 0.8.0  | 0.8.1  |
| ------------------------- | -------------------------- | ------ | ------ |
| 4 × 500 cards             | Scrolling and auto-scroll  | 0–1%   | 0–1%   |
| 20 lanes × 6, 1,200 cards | Scrolling, mean            | 6.7%   | 3.8%   |
| 20 lanes × 6              | Auto-scroll at the edge    | 6.9%   | 5.8%   |
| 20 lanes × 6              | One drop, cards re-render  | 480    | 4      |
| 20 lanes × 6              | Move sheet, tap to showing | 450 ms | 100 ms |

Swimlanes still miss the 0–3% target. Each lane row draws every column's cards when it scrolls in.

**On the emulator.** Release build on a Pixel 9 Pro emulator (arm64, 60 Hz). The host Mac was on battery. These are not phone numbers.

A 500-card column, card held at the bottom edge for 4 s, read with `dumpsys gfxinfo`. 0.4.0 issued each scroll from JS. 0.5.0 scrolls that list on the UI thread. The FPS meter read JS 29–31 and UI 60 on both; JS is FlashList rendering cells.

| Build                  | Frames drawn | About  | Janky  |
| ---------------------- | ------------ | ------ | ------ |
| JS-driven, as in 0.4.0 | 170          | 42 fps | 42–45% |
| UI thread, 0.5.0       | 245          | 61 fps | 0.4%   |

A re-run of the final 0.5.0 build, with the host on mains power, drew 245–246 frames with 0% janky for the column and the stacked list. The 20 lane × 6 column board (1,200 cards) drew 227–228 frames, about 57 fps, with about 8% janky. Sideways auto-scroll in `multi` drew 201 frames with 7% janky. A still board barely draws, so idle and a motionless hold are not frame rates there.

The method, the 2026-10-10 meter table, and what is still unmeasured are in [docs/benchmarks.md](https://github.com/vishaal2002/react-native-board-view/blob/main/docs/benchmarks.md).

To keep it fast, memoize your card, keep `renderCard` in `useCallback`, and filter `items` before they reach the board.

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
| `selectable`                                            | `true`           | Multi-select. <sup>0.8</sup>                                                                                                          |
| `selection`, `onSelectionChange`                        | board-managed    | The selected card ids, controlled. <sup>0.8</sup>                                                                                     |
| `onColumnOrderChange`, `onLaneOrderChange`              |                  | Reorder from the header's "…". You update `groupBy`. <sup>0.8</sup>                                                                   |
| `highlightExternalMoves`                                | `true`           | Flash cards your data moved by itself. <sup>0.8</sup>                                                                                 |
| `dock`                                                  | `true`           | The drop dock. `false`, or `{ columns, actions }`. <sup>0.6</sup>                                                                     |
| `haptics`                                               | `true`           | A tick on lift through your app's haptics module, `false`, or your own function. <sup>0.6</sup>                                       |
| `undo`                                                  | `false`          | The undo banner. `true` or `{ timeoutMs }`. <sup>0.6</sup>                                                                            |
| `readOnly`                                              | `false`          | Display only.                                                                                                                         |
| `moveModes`                                             | drag and sheet   | `{ drag, sheet, longPressSheet, swipe }`. `drag` is `'auto'`, `'handle'` or `false`. See [Ways to move a card](#ways-to-move-a-card). |
| `onDragStart`, `onDragOver`, `onDragEnd`                |                  | Drag lifecycle, for example for haptics.                                                                                              |
| `settleTimeoutMs`, `inflightTimeoutMs`                  | 5000, 30000      | `0` waits forever.                                                                                                                    |
| `rankStrategy`                                          | fractional index | Replace the rank math.                                                                                                                |

**Layout and navigation**

| Prop                                 | Default         | Notes                                                                                  |
| ------------------------------------ | --------------- | -------------------------------------------------------------------------------------- |
| `layout`                             | `auto`          | `paged`, `multi`, `fit`, `stacked`, `matrix` <sup>0.6</sup>, `planner` <sup>0.7</sup>. |
| `hideEmptyColumns`, `hideEmptyLanes` | `false`         | Leave out columns and lanes with no cards. <sup>0.6</sup>                              |
| `overview`, `onOverviewChange`       | `false`         | Experimental. Pinch in for the whole board. <sup>0.6</sup>                             |
| `overviewOpen`                       | board-managed   | Controls the overview. <sup>0.8</sup>                                                  |
| `autoBreakpoint`                     | `600`           | Under `auto`, boards narrower than this are paged. <sup>0.4</sup>                      |
| `pagerIndicator`                     | `tabs`          | Paged only. `dots` or `none`.                                                          |
| `columnId`, `onColumnChange`         |                 | The column on screen, in every layout. Update `columnId` from the callback.            |
| `initialColumnId`                    |                 | The first column on screen when `columnId` is not set.                                 |
| `collapsibleColumns`                 | on in `stacked` | Never in `paged`.                                                                      |
| `collapsibleLanes`                   | `true`          | Lane collapse toggles in swimlanes. <sup>0.8</sup>                                     |
| `collapsedColumns`, `collapsedLanes` | board-managed   | Controlled lists, with `onCollapsedColumnsChange` and `onCollapsedLanesChange`.        |
| `laneCellLimit`                      | `50`            | Swimlane cards per cell before Show more. <sup>0.8</sup>                               |
| `autoScroll`, `longPressDelay`       | `true`, `200`   | Edge scrolling while dragging, and the hold before a drag.                             |

**Showing data** <sup>0.7</sup>

| Prop                            | Default | Notes                                                                       |
| ------------------------------- | ------- | --------------------------------------------------------------------------- |
| `columnLimits`, `limitBehavior` | `warn`  | Limits by column id. `block` refuses drops into a full column.              |
| `getItemValue`, `formatValue`   | compact | A number per card, summed in each header.                                   |
| `spotlight`                     |         | Cards it returns false for fade back and keep their place.                  |
| `getItemAge`, `staleAfterDays`  | `14`    | Age in days, passed to `renderCard` and shown by `CardView`.                |
| `onEdgeReached`                 |         | The board reached its first or last column: add more, such as planner days. |

**Loading** <sup>0.4</sup>

| Prop                      | Notes                                                                                     |
| ------------------------- | ----------------------------------------------------------------------------------------- |
| `onColumnEndReached`      | A column reached its end. Fires again only after your append and a new scroll to the end. |
| `loadingColumns`          | Column ids that are fetching. A spinner shows where `onColumnEndReached` fired.           |
| `columnTotals`            | Server counts by column id, shown in headers, tabs and screen-reader labels.              |
| `onRefresh`, `refreshing` | Pull to refresh.                                                                          |

**Appearance and rendering**

| Prop                                                           | Default       | Notes                                                                                                    |
| -------------------------------------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------- |
| `appearance`                                                   | `auto`        | `light` or `dark`.                                                                                       |
| `density`                                                      | `comfortable` | `compact`.                                                                                               |
| `theme`, `labels`                                              | built in      | Partial overrides.                                                                                       |
| `themePreset`                                                  | `standard`    | `paper`, `slate` or `aurora`. <sup>0.7</sup>                                                             |
| `motion`                                                       | `standard`    | `calm`, `snappy` or `playful`. <sup>0.7</sup>                                                            |
| `stickyHeaders`                                                | `true`        | Pinned lane and section headers. <sup>0.7</sup>                                                          |
| `cardMarks`                                                    | `auto`        | `manual`: the board draws no marks over your card. <sup>1.0</sup>                                        |
| `renderColumnHeader`, `renderLaneHeader`                       |               | Headers get counts, `total`, limits, sums, the planner day, a lane's distribution and a collapse toggle. |
| `renderEmptyCell`, `renderColumnFooter`, `renderDropIndicator` |               | Footers get `loading`.                                                                                   |
| `style`, `testID`, `ref`                                       |               |                                                                                                          |

### Ref handle

| Method                                          | What it does                                                                                                    |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `moveItem(id, { columnId, laneId?, index? })`   | Moves a card through the same optimistic queue as a drop. Returns `false` if nothing was queued. <sup>0.4</sup> |
| `scrollToItem(id, { animated?, highlight? })`   | Scrolls a card into view. `highlight` flashes an outline on it. <sup>0.4</sup>                                  |
| `scrollToColumn(id, { animated? })`             | Scrolls a column into view.                                                                                     |
| `openMoveSheet(id)`, `closeMoveSheet()`         | Opens or closes the Move sheet.                                                                                 |
| `moveItems(ids, { columnId, laneId?, index? })` | Moves several cards together, as one batch. Returns how many moved. <sup>0.8</sup>                              |
| `setSelection(ids)`, `getSelection()`           | Replaces or reads the selection. `[]` ends it. <sup>0.8</sup>                                                   |
| `undo()`, `canUndo()`                           | Reverts the newest move that is still where it landed. <sup>0.6</sup>                                           |
| `setOverview(open, columnId?)`                  | Experimental. Opens or closes the overview. <sup>0.6</sup>                                                      |

### `renderCard` info

`item`, `cellId`, `index`, `count`, `column`, `lane`, `pending`, `dragging` (true for the lifted copy), `compact` (the column is narrow), `dimmed` (outside the `spotlight`), `age` and `stale` <sup>0.7</sup>, `selected` and `selecting` <sup>0.8</sup>, `highlighted`, `hovered` and `dragCount` <sup>1.0</sup>, `openMoveSheet()` and `toggleSelected()` <sup>0.8</sup>.

Every prop, type, token and label is in the [API reference](https://github.com/vishaal2002/react-native-board-view/blob/main/docs/api.md). Coming from 0.x: [Migrating to 1.0](https://github.com/vishaal2002/react-native-board-view/blob/main/docs/migrating.md).

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

1.0 is stable. Both packages follow semantic versioning: what that covers, and which React Native and Expo versions are supported, is in the [support policy](https://github.com/vishaal2002/react-native-board-view/blob/main/docs/support.md). Breaking changes would need 2.0. The overview and swipe-to-move stay experimental and off by default.

What has run, and what has not:

- **Devices.** The release gates S2–S6 passed on release builds on an Android phone, a vivo V2158 (Android 14, 6 GB). On the iOS 27 simulator, 1.0 passed S4; S5 last passed there on 0.8.0. No physical iPhone has run the gates yet, and no low-end Android phone. See the [release gates](https://github.com/vishaal2002/react-native-board-view/blob/main/docs/spike.md). The overview's pinch has not run on any device.
- **Screen readers.** TalkBack and VoiceOver have not completed the full move test yet. Handle mode hides the grip from screen readers; the card's move actions stay.
- **Usability study.** Five developers new to the package have not been timed yet. Swipe-to-move stays experimental, and off by default, until that study.

**Out of scope:** creating, editing, deleting, fetching or storing items. Rank rebalancing on the client. Sub-columns, items in more than one cell, and any action that edits items itself. Reanimated 3, the old architecture, and web. What comes next is in the [roadmap](https://github.com/vishaal2002/react-native-board-view/blob/main/docs/roadmap.md).

## Try the demo

`apps/example` (Expo) and `apps/bare` (React Native CLI) run the same demo, with a screen per layout, rule and stress test. The captures above come from its Showcase, Live data, Optimistic moves, Rules and Swimlanes screens. Setup is in [CONTRIBUTING.md](https://github.com/vishaal2002/react-native-board-view/blob/main/CONTRIBUTING.md).

| Package                   | What it is                                                                |
| ------------------------- | ------------------------------------------------------------------------- |
| `react-native-board-view` | `Board`, `CardView`, `DragHandle`, and a re-export of the core. **1.0.0** |
| `board-view-core`         | Grouping, ranks, move planning and the move queue. No React. **1.0.0**    |

[MIT](https://github.com/vishaal2002/react-native-board-view/blob/main/LICENSE) © react-native-board-view contributors
