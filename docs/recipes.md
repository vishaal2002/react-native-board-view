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

## Columns loaded in pages

The board never fetches. It tells you when a column reaches its end, and it shows what you pass back.

```tsx
const [tasks, setTasks] = useState<Task[]>([]);
const [loading, setLoading] = useState<string[]>([]);
const [totals, setTotals] = useState<Record<string, number>>({});
const [refreshing, setRefreshing] = useState(false);

const loadMore = useCallback(async (columnId: string) => {
  setLoading((ids) => (ids.includes(columnId) ? ids : [...ids, columnId]));
  try {
    const page = await api.tasks({ status: columnId, after: lastRankIn(columnId) });
    setTasks((current) => [...current, ...page.items]);
    setTotals((current) => ({ ...current, [columnId]: page.total }));
  } finally {
    setLoading((ids) => ids.filter((id) => id !== columnId));
  }
}, []);

const refresh = useCallback(async () => {
  setRefreshing(true);
  try {
    const first = await api.firstPages();
    setTasks(first.items);
    setTotals(first.totals);
  } finally {
    setRefreshing(false);
  }
}, []);

<Board
  items={tasks}
  onColumnEndReached={loadMore}
  loadingColumns={loading}
  columnTotals={totals}
  onRefresh={refresh}
  refreshing={refreshing}
  // …
/>;
```

- **`onColumnEndReached`** fires once per end. It fires again only after your append moves the end off screen and the user scrolls back to it.
- **`loadingColumns`** puts a spinner at the end of that column, or at the end of the board in swimlanes and stacked.
- **`columnTotals`** makes headers and tabs say 120, not the 18 you have loaded so far.
- **Ranks across pages:** a card dropped at the bottom of a partly loaded column gets a rank after the last card you loaded. That can sort it among cards you have not loaded yet. If it matters, place the card on the server from `previousId` and `nextId` instead of `rank`.

## Moving cards from code

`ref.moveItem` moves a card the same way a drop does. Use it for card buttons, your own menus, or shortcuts.

```tsx
const board = useRef<BoardHandle>(null);

const renderCard = useCallback(
  ({ item }: CardRenderInfo<Task>) => (
    <CardView title={item.title} onPress={() => board.current?.moveItem(item.id, { columnId: 'done', index: 'end' })} />
  ),
  [],
);

<Board ref={board} renderCard={renderCard} /* … */ />;
```

- **Same pipeline.** The card moves at once and stays pending. `onMove` receives `source: 'api'`, and a rejection rolls it back and fires `onMoveError`.
- **Same rules.** `canDrop` can refuse the move, and `readOnly` refuses every move. `moveItem` then returns `false`.
- **Destination.** `columnId` is required. `laneId` defaults to the card's lane. `index` defaults to 0, the top, and `'end'` is the bottom.
- **Show where it went.** Call `scrollToItem(id, { highlight: true })` after the move. The card flashes an outline once it is on screen.

## Undo

Since 0.6 the board has undo built in: pass `undo` for a banner, or call `ref.undo()`. It moves the card back through `onMove` with `source: 'undo'`, at its old position with a new rank.

When your server must restore the exact old record (its old rank, or fields a move changed on the server), undo is a data change instead. Keep what the card looked like before the move, and write it back.

```tsx
const before = useRef<Task | null>(null);

const onMove = useCallback(async (op: MoveOperation) => {
  before.current = tasksRef.current.find((task) => task.id === op.id) ?? null;
  const saved = await api.moveTask(op);
  setTasks((current) => current.map((task) => (task.id === saved.id ? saved : task)));
  showUndoToast();
}, []);

const undo = useCallback(async () => {
  const previous = before.current;
  if (!previous) return;
  const saved = await api.saveTask(previous);
  setTasks((current) => current.map((task) => (task.id === saved.id ? saved : task)));
}, []);
```

The card goes back to its old column and its old rank, so it lands in the same place.

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

Since 0.6 the board ticks when a card lifts, through `expo-haptics` or `react-native-haptic-feedback` if your app has one. It finds them at runtime and imports neither. Pass `haptics={false}` to turn that off, or a function to replace it.

For more moments, wire your haptics to the drag events:

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
