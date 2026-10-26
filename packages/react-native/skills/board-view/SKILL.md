---
name: board-view
description: Use when adding or changing a Kanban, swimlane or week-planner board in a React Native or Expo app with react-native-board-view. Covers install and peer versions, writing onMove so moves persist and roll back, groupBy and ranks, choosing a layout, keeping props stable, server sync (TanStack Query, local-first stores), required fields before a move, rules and WIP limits, seeding and rebalancing ranks, sharing board-view-core with a Node server, and testing with createBoardTester.
---

# react-native-board-view

`Board` draws a board from a flat array of your items. It shows each move at once, calls your `onMove`, and rolls the card back if `onMove` throws or times out. Read this before you write board code. Every prop and type is in the [API reference](https://github.com/vishaal2002/react-native-board-view/blob/main/docs/api.md). Do not use a name that is not there.

## Install

```sh
npx expo install react-native-board-view react-native-reanimated react-native-worklets react-native-gesture-handler @shopify/flash-list
```

| Peer                           | 1.x supports                    |
| ------------------------------ | ------------------------------- |
| `react-native`                 | 0.83 or later, New Architecture |
| `react`                        | 19 or later                     |
| `react-native-reanimated`      | 4.1 to 4.x                      |
| `react-native-worklets`        | 0.5 to 0.x                      |
| `react-native-gesture-handler` | 2.28 to 3.x                     |
| `@shopify/flash-list`          | 2.0.2 to 2.x                    |

- **Expo:** SDKs with React Native 0.83 or later, in a [development build](https://docs.expo.dev/develop/development-builds/introduction/), or Expo Go from SDK 58.
- **Bare React Native:** `npm install` the same packages, add `react-native-worklets/plugin` last in `babel.config.js`, and rebuild the app.
- **Not supported:** the old architecture, Reanimated 3 and web. Check the app's versions before you install. If they are older, say so instead of adding the package.
- **Gesture root:** `Board` has its own `GestureHandlerRootView`. Keep one at the app root as well.

## The one rule

The board never creates, edits, fetches or stores items. Your `items` are the source of truth.

- `groupBy` says which field makes the columns, and optionally the lanes. Each axis has a `key` (the field name, such as `'status'`) and `values` (the columns or lanes, in order, as `{ id, label, color? }`).
- Each item needs a string `rank`, or pass `getRank`. Ranks are global fractional indexes, not per column. A missing rank sorts first and logs a warning in development.
- `onMove(op, { signal })` does three things: persist the move, make `items` show it, and throw if it failed. The order does not matter.

The board's overlay is the optimistic layer. Do not add your own for moves.

## A minimal board

This is the README quick start. Start from it.

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

Required props: `items`, `getItemId`, `groupBy`, `onMove`, `renderCard`. Pass `getItemLabel` too: screen readers and the Move sheet use it, and the default is the id. `CardView` is optional; any view works.

## How a move works

1. The card moves at once and is marked `pending`. Pass `info.pending` to `CardView` for a saving dot.
2. `onMove(op, { signal })` runs. Moves of the same card run one at a time. Moves of different cards run in parallel.
3. Resolve to accept. The overlay clears as soon as `items` show the move, or after `settleTimeoutMs` (5000 by default).
4. Throw to reject. The card goes back, later moves of that card are cancelled, `onMoveError(op, error)` fires, and screen readers hear why.
5. Past `inflightTimeoutMs` (30000 by default) the move rejects with `MoveTimeoutError` and `signal` aborts. `0` waits forever.

`MoveOperation` fields: `opId` (send it as an idempotency key), `id`, `changes` and `from` (only the grouped fields that change, by `groupBy` key; `null` is the No value bucket; a cross-lane drop has two), `rank`, `previousId` and `nextId` (the visible neighbors, for servers with integer positions), `source` (`'drag' | 'sheet' | 'swipe' | 'accessibility' | 'api' | 'undo'`), and `batch` (`{ id, index, size }`, only when several cards move together).

A multi-card move calls `onMove` once per card, in order, with the same `op.batch.id`. A server that wants one request can wait for `index === size - 1`.

If the server picks its own rank instead of `op.rank`, that is fine. Return the saved record and put it in `items`.

## Choosing a layout

Pass one `layout`. The board renders that mode and no switcher.

| `layout`  | Use it for                                                                                     |
| --------- | ---------------------------------------------------------------------------------------------- |
| `auto`    | The default. `paged` below `autoBreakpoint` (600pt), `multi` above it.                         |
| `paged`   | Phones. One column per page, the next one peeks in.                                            |
| `multi`   | Tablets. Fixed-width columns (`theme.columnWidth`) that scroll sideways.                       |
| `fit`     | Columns share the width down to `theme.minColumnWidth`, then scroll.                           |
| `stacked` | One vertical list with a collapsible section per column.                                       |
| `matrix`  | Small swimlane grids, such as a 2 × 2. Needs `groupBy.lanes`; without lanes it draws as `fit`. |
| `planner` | A column per day. Build columns with `dayColumns`; ids are `YYYY-MM-DD`.                       |

Swimlanes are not a layout. Add `groupBy.lanes` to any layout:

```tsx
const groupBy: GroupBy<Task> = {
  columns: { key: 'status', values: STATUSES },
  lanes: { key: 'assignee', values: PEOPLE },
};
```

A cell shows `laneCellLimit` cards (50) before Show more. Unknown or `null` values land in a No value column or lane, with the id `NO_VALUE_ID`. Rename it with `labels.noValue`.

## Stable props

Keep `renderCard`, `groupBy` and every other function and object you pass stable: define them outside the component, or wrap them in `useCallback` and `useMemo`. Memoize your card too.

Cards redraw only when their own data changes, unless a new `renderCard`, `getItemLabel`, `theme`, `spotlight`, `canDrag`, `canDrop`, `cardActions` or `canPerformAction` arrives. Any of those redraws every card.

When `groupBy` depends on state, such as a saved column order, build it with `useMemo`.

## Common tasks

### Server sync with TanStack Query

Skip `onMutate` and the snapshot-and-rollback pattern. The board's overlay does that job. [Recipe](https://github.com/vishaal2002/react-native-board-view/blob/main/docs/recipes.md#tanstack-query).

```tsx
const queryClient = useQueryClient();
const move = useMutation({
  mutationFn: ({ op, signal }: { op: MoveOperation; signal: AbortSignal }) => api.moveTask(op, { signal }),
  onSuccess: (saved) => {
    queryClient.setQueryData<Task[]>(['tasks'], (current) =>
      current?.map((task) => (task.id === saved.id ? saved : task)),
    );
  },
});

<Board items={tasksQuery.data ?? []} onMove={(op, { signal }) => move.mutateAsync({ op, signal })} /* … */ />;
```

Do not layer React 19 `useOptimistic` on board moves: it drops its value when the transition ends, so the card can jump back before real data arrives. [Why](https://github.com/vishaal2002/react-native-board-view/blob/main/docs/recipes.md#react-19-useoptimistic).

### Local-first stores

Write the move to the local store and return. The store updates `items`, and the overlay clears. [Recipe](https://github.com/vishaal2002/react-native-board-view/blob/main/docs/recipes.md#local-first-stores-watermelondb-powersync-zero-legend-state) for WatermelonDB, PowerSync, Zero and Legend State.

### Required fields before a move

`onMove` can wait for the user. Open a form, resolve when it is submitted, and throw if it is cancelled so the card goes back. Pass `inflightTimeoutMs={0}`, because a form can take longer than 30 seconds. [Recipe](https://github.com/vishaal2002/react-native-board-view/blob/main/docs/recipes.md#asking-for-input-before-a-move-required-fields).

```tsx
const onMove = async (op: MoveOperation) => {
  if (op.changes.status === 'won') {
    const answer = await askForDealValue(op.id); // a value, or null on cancel
    if (answer == null) throw new Error('cancelled');
    await api.moveDeal(op, answer);
  } else {
    await api.moveDeal(op);
  }
  // …update items
};
```

### Rules and WIP limits

- `canDrag(item)` returning `false` locks a card.
- `canDrop(item, target)` returning `false` refuses a cell. `target` is `{ cellId, columnId, laneId }`. Refused cells turn red while dragging, are disabled in the Move sheet, and are left out of screen-reader actions.
- `columnLimits={{ doing: 5 }}` shows the count against the limit in each header. `limitBehavior="block"` refuses drops into a full column everywhere.

Your server must enforce the same rules and reject in `onMove`. [Recipe](https://github.com/vishaal2002/react-native-board-view/blob/main/docs/recipes.md#rules-locked-cards-allowed-transitions-wip-limits).

### Seeding and rebalancing ranks

Records with no rank get ranks once. Sort them into the order you want, then save:

```ts
import { seedRanks } from 'react-native-board-view';

const ordered = [...tasks].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
const updates = seedRanks(ordered.map((task) => task.id)); // [{ id, rank }]
await api.saveRanks(updates);
```

Ranks grow longer when you keep inserting into one gap. Rebalance occasionally on the server, in the background, never in response to a drag. The board never rebalances.

```ts
import { rebalanceRanks, shouldRebalance } from 'board-view-core';

if (shouldRebalance(allTasks.map((task) => task.rank))) {
  await db.batchUpdateRanks(rebalanceRanks(allTasks)); // same order, short keys
}
```

[Seeding](https://github.com/vishaal2002/react-native-board-view/blob/main/docs/recipes.md#seeding-ranks) and [rebalancing](https://github.com/vishaal2002/react-native-board-view/blob/main/docs/recipes.md#keeping-ranks-short-rebalancing) recipes.

### The server sharing board-view-core

`board-view-core` has no React dependency and runs in Node as ESM or CommonJS. Use the same grouping, ranks and move planning on the server, for example for a "move to top of Done" API:

```ts
import { planMove, projectBoard } from 'board-view-core';

const model = projectBoard({ items, getItemId, getRank, groupBy });
const op = planMove({ model, groupBy, item, itemId, toCellId, toIndex, source: 'api' });
```

`applyMove(item, op, groupBy, applyRank)` applies an operation to a record on either side. [Recipe](https://github.com/vishaal2002/react-native-board-view/blob/main/docs/recipes.md#one-implementation-on-the-client-and-the-server).

### Moving cards from code

```tsx
const board = useRef<BoardHandle>(null);

board.current?.moveItem(task.id, { columnId: 'done', index: 'end' }); // false when nothing was queued
board.current?.scrollToItem(task.id, { highlight: true });
```

`moveItem` goes through the same queue as a drop, with `source: 'api'`. `canDrop` and `readOnly` still apply. [Recipe](https://github.com/vishaal2002/react-native-board-view/blob/main/docs/recipes.md#moving-cards-from-code).

### Columns loaded in pages

The board never fetches. Pass `onColumnEndReached`, `loadingColumns` and `columnTotals`, and `onRefresh` with `refreshing` for pull to refresh. [Recipe](https://github.com/vishaal2002/react-native-board-view/blob/main/docs/recipes.md#columns-loaded-in-pages).

### Testing

`react-native-board-view/testing` runs the board's own move code on plain data, with no rendering and no native mocks. It works in Jest and Vitest.

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

- Moves: `drag`, `move(id, to, source)`, `moveMany`, `undo`, `canMove`. `canDrop`, `readOnly`, `columnLimits` and `limitBehavior` apply as on the board.
- What the board shows: `column(id, laneId?)`, `columns()`, `model()`, `isPending(id)`.
- What happened: `moves` and `announcements`.
- Your data: `setItems(next)` stands in for a re-render. `applyAcceptedMoves: true` applies accepted moves for you.
- `await board.settle()` after a move. With fake timers, advance them while it runs. Call `dispose()` at the end.

[Testing kit reference](https://github.com/vishaal2002/react-native-board-view/blob/main/docs/api.md#testing-kit).

## Mistakes to avoid

- **Inline `renderCard`, `theme` or rules.** A new `renderCard`, `getItemLabel`, `theme`, `spotlight`, `canDrag`, `canDrop`, `cardActions` or `canPerformAction` on each render redraws every card. Hoist them or memoize them.
- **Resolving when the server said no.** If `onMove` resolves on a failed request, the move is announced as done and the card only snaps back when `settleTimeoutMs` runs out, with no `onMoveError`. Throw instead.
- **Expecting the board to change `items`.** It never edits them. After a move, update your state, cache or store with a new array, or the overlay drops after `settleTimeoutMs` and the card goes back.
- **Adding your own optimistic layer.** No `onMutate` snapshot and no `useOptimistic` for moves. Updating a cache in `onMutate` is fine; the overlay clears early.
- **Dropping `signal`.** Pass `context.signal` to `fetch` so a timed-out move stops its request.
- **A form inside `onMove` with the default timeout.** It rolls back after 30 seconds. Use `inflightTimeoutMs={0}`.
- **Items without ranks.** They all sort first. Seed ranks once, or pass `getRank` when the rank lives in another field.
- **Rebalancing on the client.** It is out of scope. Rebalance on the server in the background.
- **Client-only rules.** `canDrop` and `columnLimits` are for the UI. The server must reject the same moves.
- **Unsupported setups.** Web, the old architecture and Reanimated 3 are not supported. On Expo, use a development build, or Expo Go from SDK 58.
- **A board in a bottom sheet or scroll view without the host settings.** A sheet needs `enableDynamicSizing={false}`, `enableContentPanningGesture={false}` and a plain `View` child; a scroll view needs a fixed board height. [Recipe](https://github.com/vishaal2002/react-native-board-view/blob/main/docs/recipes.md#inside-other-screens-pagers-bottom-sheets-scroll-views).
- **Expecting edit actions.** `cardActions` and `onCardAction` report a choice. The board does not delete, archive or assign anything; your handler does.
- **0.x prop names.** `onEndReached`, `onColumnsEndReached` and `cellLimit` were removed in 1.0. Use `onColumnEndReached`, `onEdgeReached` and `laneCellLimit`. See [Migrating to 1.0](https://github.com/vishaal2002/react-native-board-view/blob/main/docs/migrating.md).
- **Building a whole `BoardTheme` or `BoardLabels`.** Pass partial `theme` and `labels` overrides, or spread `lightTheme` and `defaultLabels`, so a minor release does not break the type check.
- **`::` in a column or lane id.** `GroupValue.id` must not contain `::`.
- **Imports from `src/` or `lib/`.** Only `react-native-board-view`, `react-native-board-view/testing` and `board-view-core` are public.
- **Turning on experimental features by default.** `overview` and `moveModes.swipe` are experimental and can change in a minor release.
- **Sorting the view by something other than rank.** Manual order then means nothing. Refuse the card's own cell with `canDrop`, or pass `moveModes={{ drag: false }}` and keep the Move sheet. [Recipe](https://github.com/vishaal2002/react-native-board-view/blob/main/docs/recipes.md#sorted-or-filtered-views).

## More

- [README](https://github.com/vishaal2002/react-native-board-view#readme): the guided tour, with layouts, the dock, selection, theming and accessibility.
- [Recipes](https://github.com/vishaal2002/react-native-board-view/blob/main/docs/recipes.md)
- [API reference](https://github.com/vishaal2002/react-native-board-view/blob/main/docs/api.md)
- [Support policy](https://github.com/vishaal2002/react-native-board-view/blob/main/docs/support.md)
- [llms.txt](https://github.com/vishaal2002/react-native-board-view/blob/main/llms.txt)
