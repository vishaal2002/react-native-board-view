# Recipes

## The rule for every recipe

The board already shows each move at once, as an overlay on top of your items. Your `onMove` needs to do three things:

1. Persist the move.
2. Make your `items` show it, either now or when the server answers.
3. Throw or reject if the move failed.

The overlay goes away when your items show the move, so the order in which these happen does not matter.

You do not need your own optimistic layer for moves.

## Plain `fetch` and local state

```tsx
const onMove = useCallback(async (op: MoveOperation, { signal }: MoveContext) => {
  const response = await fetch(`/api/tasks/${op.id}/move`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': op.opId },
    body: JSON.stringify({ changes: op.changes, rank: op.rank, previousId: op.previousId, nextId: op.nextId }),
    signal,
  });
  if (!response.ok) throw new Error(`Move failed (${response.status})`);
  const saved: Task = await response.json();
  setTasks((current) => current.map((task) => (task.id === saved.id ? saved : task)));
}, []);
```

- **`op.opId` as an idempotency key.** A retried request then cannot apply the move twice.
- **Server-assigned ranks.** If your server picks its own rank instead of `op.rank`, that is fine. The board accepts any rank it did not send itself as "the server's choice".

## TanStack Query

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

<Board
  items={tasksQuery.data ?? []}
  onMove={(op, { signal }) => move.mutateAsync({ op, signal })}
  // …
/>;
```

You can skip `onMutate` and the snapshot-and-rollback pattern: the board's overlay does that job. If you already update the cache optimistically in `onMutate`, that is fine too. The board sees the move in your data and clears its overlay early.

## React 19 `useOptimistic`

Don't layer it on top of board moves. `useOptimistic` drops its value when the transition ends. If your real data arrives after that, the card would briefly jump back. The board's overlay stays until your real items show the move, which is exactly the behaviour you want.

## Local-first stores (WatermelonDB, PowerSync, Zero, Legend State)

Write the move to the local store and return. The store updates `items`, and the overlay clears.

```tsx
// WatermelonDB
const onMove = async (op: MoveOperation) => {
  const record = await database.get<TaskModel>('tasks').find(op.id);
  await database.write(async () => {
    await record.update((task) => {
      if ('status' in op.changes) task.status = op.changes.status;
      task.rank = op.rank;
    });
  });
};
```

Sync conflicts are the store's business. If a later sync moves the card somewhere else, the board follows your data.

## Asking for input before a move (required fields)

`onMove` can wait for the user. Open a form and resolve when it is submitted; throw if it is cancelled, so the card goes back.

```tsx
const onMove = async (op: MoveOperation) => {
  if (op.changes.status === 'won') {
    const answer = await askForDealValue(op.id); // resolves with a value, or null on cancel
    if (answer == null) throw new Error('cancelled');
    await api.moveDeal(op, answer);
  } else {
    await api.moveDeal(op);
  }
  // …update items
};

<Board onMove={onMove} inflightTimeoutMs={0} />; // a form can take longer than 30 s
```

## Rules: locked cards, allowed transitions, WIP limits

```tsx
const LIMITS: Record<string, number> = { doing: 3 };

<Board
  canDrag={(task) => !task.locked}
  canDrop={(task, target) => {
    if (target.columnId === 'done' && task.status !== 'review') return false; // workflow
    const limit = LIMITS[target.columnId];
    const count = tasks.filter((t) => t.status === target.columnId && t.id !== task.id).length;
    return limit == null || count < limit; // WIP limit
  }}
  renderColumnHeader={({ column, count }) => <Header title={column.label} count={count} limit={LIMITS[column.id]} />}
/>;
```

- **While dragging:** refused cells show a red outline, and dropping on one sends the card home.
- **In the Move sheet:** refused destinations are disabled.
- **In screen-reader actions:** refused destinations are left out.

Your server must still enforce the same rules, so reject in `onMove` when it says no.

## Seeding ranks

If your records have no rank yet, give them ranks once. Sort them into the order you want, then save the result:

```ts
import { seedRanks } from 'react-native-board-view';

const ordered = [...tasks].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
const updates = seedRanks(ordered.map((task) => task.id)); // [{ id, rank }]
await api.saveRanks(updates);
```

Ranks are global, not per column. One rank per item orders every cell it can land in.

## Keeping ranks short (rebalancing)

Fractional ranks grow longer when you keep inserting into the same gap. That is harmless for a long time, but rebalance occasionally on the server:

```ts
import { rebalanceRanks, shouldRebalance } from 'board-view-core';

if (shouldRebalance(allTasks.map((task) => task.rank))) {
  const updates = rebalanceRanks(allTasks); // same order, short keys
  await db.batchUpdateRanks(updates);
}
```

Do it in the background, not in response to a drag. The board never rebalances on its own.

## One implementation on the client and the server

`board-view-core` has no React or React Native dependency, and it ships ESM and CommonJS. A Node server can use the same planner and the same index rules:

```ts
import { planMove, projectBoard } from 'board-view-core';

const model = projectBoard({ items, getItemId, getRank, groupBy });
const op = planMove({ model, groupBy, item, itemId, toCellId, toIndex, source: 'api' });
```

This is useful for a "move to top of Done" API, or for applying a move made from a web client.

## Haptics

Haptics need no dependency in the library. Wire them to the drag events:

```tsx
import * as Haptics from 'expo-haptics';

<Board
  onDragStart={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)}
  onDragOver={() => Haptics.selectionAsync()}
  onDragEnd={({ cancelled }) => !cancelled && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)}
/>;
```

## Sorted or filtered views

- **Filtering:** filter `items` in your app. Ranks are computed between the visible neighbours, so cards hidden by a filter are never used as boundaries.
- **Sorting:** if your view is sorted by something other than rank, such as due date, manual order means nothing. Either refuse the card's own cell, so only moves between columns are allowed:

  ```tsx
  canDrop={(task, target) => target.columnId !== task.status}
  ```

  Or show the board without drag (`moveModes={{ drag: false }}`) and keep the Move sheet.
