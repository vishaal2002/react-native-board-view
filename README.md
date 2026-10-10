# react-native-board-view

Kanban and swimlane boards for React Native and Expo.

Your items stay the source of truth: the library groups them into a board, and the app applies or rejects each move.

```text
your items ──► board (columns × optional lanes) ──► screen
long-press drag / Move to… / screen-reader action ──► move operation ──► your onMove ──► your data
```

- **Your data stays yours.** Pass flat items and a `groupBy` config. The board never creates, edits, fetches or stores items.
- **Optimistic moves with rollback.**
  - A move shows on screen immediately.
  - The overlay stays until your items show the move.
  - If `onMove` rejects or times out, the card goes back and screen readers hear why.
  - `setState` timing never matters.
- **Built for phones.**
  - Paged columns with tabs on phones; multi-column, fit-to-width or a stacked list on wider screens.
  - Long-press drag that does not fight scrolling.
  - Auto-scroll on both axes, including page flips at the edges.
- **Virtualized.**
  - Columns are FlashList v2 lists, so a 500-card column stays responsive.
  - Swimlanes are a virtualized list of lanes, with "Show more" per cell.
- **Accessible.**
  - Every card can be moved without dragging, through a **Move to…** sheet or the screen reader's action menu (WCAG 2.2 SC 2.5.7).
  - Moves and failures are announced.
  - Focus follows a moved card.
  - Reduced motion and RTL are respected.

> **Status: 0.1 (pre-release).**
>
> - Verified on the Android emulator, in debug and release builds, with Gesture Handler 2.32 and 3.3.
> - iOS and low-end Android hardware have not been benchmarked yet; see [docs/benchmarks.md](docs/benchmarks.md).
> - The API may still change before 1.0.

## Contents

- [Requirements](#requirements)
- [Install](#install)
- [Quick start](#quick-start)
- [How moves work](#how-moves-work)
- [Layouts](#layouts)
- [Swimlanes](#swimlanes)
- [Props](#props)
- [Imperative handle](#imperative-handle)
- [Theming and labels](#theming-and-labels)
- [Accessibility](#accessibility)
- [Performance](#performance)
- [What it does not do](#what-it-does-not-do)
- [Recipes](docs/recipes.md)
- [Contributing](CONTRIBUTING.md)

## Requirements

You need the New Architecture.

| Package                      | Supported   | Tested with                      |
| ---------------------------- | ----------- | -------------------------------- |
| react-native                 | ≥ 0.83      | 0.86.3                           |
| react                        | ≥ 19        | 19.2.3                           |
| Expo (optional)              | SDK 55+     | SDK 57                           |
| react-native-reanimated      | ≥ 4.1 < 5   | 4.5.1                            |
| react-native-worklets        | ≥ 0.5 < 1   | 0.10.1                           |
| react-native-gesture-handler | ≥ 2.28 < 4  | 2.32.0 and 3.3.0                 |
| @shopify/flash-list          | ≥ 2.0.2 < 3 | 2.0.2 (fresh Expo app) and 2.3.3 |

## Install

### Expo

```sh
npx expo install react-native-board-view react-native-reanimated react-native-worklets react-native-gesture-handler @shopify/flash-list
```

`babel-preset-expo` already enables the Worklets plugin.

Tested in [development builds](https://docs.expo.dev/develop/development-builds/introduction/); Expo Go is untested.

### React Native CLI

```sh
npm install react-native-board-view react-native-reanimated react-native-worklets react-native-gesture-handler @shopify/flash-list
```

```js
// babel.config.js
module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: ['react-native-worklets/plugin'],
};
```

Rebuild the native app after adding the peer dependencies.

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

  // The board proposes a move. You persist it, then update your items, or throw to roll it back.
  const onMove = useCallback(async (op: MoveOperation, { signal }: MoveContext) => {
    await fetch(`/api/tasks/${op.id}/move`, {
      method: 'POST',
      body: JSON.stringify({ ...op.changes, rank: op.rank, opId: op.opId }),
      signal,
    }).then((response) => {
      if (!response.ok) throw new Error(`Move failed: ${response.status}`);
    });
    setTasks((current) =>
      current.map((task) => (task.id === op.id ? applyMove(task, op, groupBy, (t, rank) => ({ ...t, rank })) : task)),
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

`Board` renders its own `GestureHandlerRootView`. Wrapping the app root in one, as above, is still the recommended Gesture Handler setup.

Items need a sortable string `rank`, or pass `getRank`. For data that has no ranks yet, see [Seeding ranks](docs/recipes.md#seeding-ranks).

## How moves work

Every move arrives in `onMove` as a `MoveOperation`.

| Field                  | Meaning                                                                                                                                         |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `opId`                 | Unique per move. Use it to deduplicate retries.                                                                                                 |
| `id`                   | The item id.                                                                                                                                    |
| `changes`              | Only the grouped fields that change, e.g. `{ status: 'done' }`. A swimlane drop can change two. `null` means the "No value" bucket.             |
| `from`                 | The same fields before the move.                                                                                                                |
| `rank`                 | The new rank. It is a [fractional index](https://github.com/rocicorp/fractional-indexing) between the visible neighbors.                        |
| `previousId`, `nextId` | The visible cards the moved card lands between (`null` at either end). Servers that keep integer positions or LexoRank can place it from these. |
| `source`               | `'drag' \| 'sheet' \| 'swipe' \| 'accessibility' \| 'api'`.                                                                                     |

The lifecycle of a move:

1. **The move shows at once** as an overlay on your items. The card is marked `pending` while it waits.
2. **`onMove(op, { signal })` runs.**
   - Moves of the same item run one at a time, in order. Different items run in parallel.
3. **If `onMove` resolves:**
   - The overlay stays until your `items` show the move: the same grouped fields, and either the sent rank or a rank your server chose.
   - If your items never show it, the overlay is dropped after `settleTimeoutMs` (5 s), so your data always wins.
4. **If `onMove` throws or rejects:**
   - The card goes back and later queued moves of that item are cancelled.
   - `onMoveError` fires and screen readers hear "Could not move …".
5. **If `onMove` takes longer than `inflightTimeoutMs` (30 s):**
   - The move is rejected with `MoveTimeoutError` and `signal` is aborted.
   - Set `inflightTimeoutMs={0}` when `onMove` waits for the user, for example a form that asks for required fields.
6. **On unmount,** in-flight signals are aborted.

Your data stays in charge. If items change during a drag so that the dragged card disappears or moves to another cell, the drag is cancelled. If a drop can no longer be planned against the current data, it is refused and the card returns.

See [docs/recipes.md](docs/recipes.md) for more:

- TanStack Query, React 19 `useOptimistic`, local-first stores;
- rules such as WIP limits;
- asking for input before a move;
- sharing the core on a server.

## Layouts

| `layout`           | What it does                                                                                                                                              | Use for                                   |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `'auto'` (default) | `paged` below 600 pt of board width, otherwise `multi`.                                                                                                   | Most apps                                 |
| `'paged'`          | One column per page, with a peek of the next one, snapping, and tabs or dots (`pagerIndicator`). Dragging to an edge flips the page.                      | Phones                                    |
| `'multi'`          | Fixed-width columns side by side, scrolling sideways.                                                                                                     | Tablets, landscape                        |
| `'fit'`            | Columns share the width, but never get narrower than `theme.minColumnWidth`; past that the board scrolls. Narrow columns get `compact` cards and headers. | Overviews with few columns                |
| `'stacked'`        | One vertical list, with a collapsible section per column. No sideways scrolling.                                                                          | Users who don't want horizontal scrolling |

Columns can collapse to a strip in `multi`, `fit` and `stacked` (`collapsibleColumns`). You can control this with `collapsedColumns` and `onCollapsedColumnsChange`, or let the board keep the state.

## Swimlanes

Add a second axis:

```ts
const groupBy: GroupBy<Task> = {
  columns: { key: 'status', values: STATUSES },
  lanes: { key: 'assigneeId', values: people.map((p) => ({ id: p.id, label: p.name })) },
};
```

- **Lanes:** they form a virtualized list and can be collapsed (`collapsedLanes`, `onCollapsedLanesChange`).
- **Cells:**
  - Each cell shows up to `cellLimit` cards (default 50), then a "Show more" button.
  - Empty cells accept drops.
  - Collapsed lanes do not accept drops.
- **Dropping across lanes:** a drop into another lane changes both fields in one operation.

Items whose value is not in `values` (or is `null`) go to a **No value** column or lane. Rename it with `labels.noValue`. Moving a card into that bucket writes `null`.

## Props

### Data

| Prop           | Type                  | Notes                                                                                                 |
| -------------- | --------------------- | ----------------------------------------------------------------------------------------------------- |
| `items`        | `readonly T[]`        | Already filtered and searched by your app.                                                            |
| `getItemId`    | `(item) => string`    | Must be stable and unique. Duplicates are dropped with a dev warning.                                 |
| `getRank`      | `(item) => string`    | Default `item.rank`. A missing rank sorts first, with a dev warning.                                  |
| `getItemLabel` | `(item) => string`    | Used in screen-reader labels and the Move sheet.                                                      |
| `groupBy`      | `{ columns, lanes? }` | Each axis is `{ key, values, getKey?, applyKey? }`. Keep it stable, e.g. at module level or memoized. |
| `rankStrategy` | `RankStrategy`        | Replaces fractional-indexing.                                                                         |

### Moves

| Prop                | Type                                        | Notes                                                                                                                                                                                                                       |
| ------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `onMove`            | `(op, { signal }) => Promise<void> \| void` | Required. See [How moves work](#how-moves-work).                                                                                                                                                                            |
| `onMoveError`       | `(op, error) => void`                       | After a rejection or timeout. The rollback has already happened.                                                                                                                                                            |
| `canDrag`           | `(item) => boolean`                         | Locked cards cannot be dragged or swiped.                                                                                                                                                                                   |
| `canDrop`           | `(item, target) => boolean`                 | Refusing cells show a red outline while dragging and are disabled in the sheet.                                                                                                                                             |
| `moveModes`         | `{ drag?, sheet?, swipe? }`                 | `drag: false` turns off drag. `sheet: 'manual'` hides the "…" button; call `openMoveSheet` from your card. `sheet: false` turns off the sheet. `swipe: 'auto'` enables swipe-to-move in `multi` and `fit` (off by default). |
| `settleTimeoutMs`   | `number`                                    | Default 5000. `0` waits forever for your data.                                                                                                                                                                              |
| `inflightTimeoutMs` | `number`                                    | Default 30000. `0` disables the timeout.                                                                                                                                                                                    |

### Drag events

| Prop          | Event                       | Use for                                              |
| ------------- | --------------------------- | ---------------------------------------------------- |
| `onDragStart` | `{ itemId, from }`          | Haptics, analytics                                   |
| `onDragOver`  | `{ itemId, target, index }` | A selection haptic each time the drop target changes |
| `onDragEnd`   | `{ itemId, cancelled }`     | Haptics, analytics                                   |

```tsx
import * as Haptics from 'expo-haptics';

<Board
  onDragStart={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)}
  onDragOver={() => Haptics.selectionAsync()}
  // …
/>;
```

### Rendering

| Prop                  | Receives                                                                                  |
| --------------------- | ----------------------------------------------------------------------------------------- |
| `renderCard`          | `{ item, cellId, index, count, column, lane, pending, dragging, compact, openMoveSheet }` |
| `renderColumnHeader`  | `{ column, count, collapsed, compact, toggleCollapsed? }`                                 |
| `renderLaneHeader`    | `{ lane, count, collapsed, toggleCollapsed }`                                             |
| `renderEmptyCell`     | `{ column, lane }`                                                                        |
| `renderColumnFooter`  | `{ column, lane, count }`                                                                 |
| `renderDropIndicator` | none. It replaces the dashed placeholder where the card will land.                        |

Keep `renderCard` stable with `useCallback`, and memoize expensive cards. `CardView` is a ready-made card that supports `title`, `description`, `tags`, `meta`, `assignee`, `accentColor`, `pending`, `dragging`, `compact` and `onPress`.

### Layout and behaviour

| Prop                                            | Default         |
| ----------------------------------------------- | --------------- |
| `layout`                                        | `'auto'`        |
| `pagerIndicator` (`'tabs' \| 'dots' \| 'none'`) | `'tabs'`        |
| `initialColumnId`, `onColumnChange`             |                 |
| `collapsibleColumns`                            | on in `stacked` |
| `collapsedColumns`, `onCollapsedColumnsChange`  | uncontrolled    |
| `collapsedLanes`, `onCollapsedLanesChange`      | uncontrolled    |
| `cellLimit`                                     | 50              |
| `autoScroll`                                    | `true`          |
| `longPressDelay`                                | 200 ms          |
| `appearance` (`'auto' \| 'light' \| 'dark'`)    | `'auto'`        |
| `density` (`'comfortable' \| 'compact'`)        | `'comfortable'` |
| `theme`, `labels`                               | see below       |
| `ref`, `style`, `testID`                        |                 |

## Imperative handle

```tsx
const board = useRef<BoardHandle>(null);
board.current?.scrollToColumn('done');
board.current?.scrollToItem(taskId); // reveals it behind "Show more" if needed
board.current?.openMoveSheet(taskId);
board.current?.closeMoveSheet();
```

## Theming and labels

- **Theme:**
  - `theme` takes a partial `BoardTheme`, merged over the light or dark defaults.
  - Colors: `background`, `columnBackground`, `cardBackground`, `accent`, `reject`, …
  - Metrics: `radius`, `cardRadius`, `columnWidth`, `minColumnWidth`, `columnGap`, `cellPadding`, `cardGap`, …
  - `fontFamily`.
  - `useBoardTheme()` reads the merged theme inside your cards.
- **Labels:** `labels` overrides any text or screen-reader string. Pass functions for the ones that take context. This is the way to localize the board.

```tsx
<Board
  theme={{ accent: '#7C3AED', radius: 16, columnWidth: 280 }}
  labels={{ noValue: 'Unassigned', moved: ({ item, column }) => `${item} → ${column}` }}
/>
```

## Accessibility

- **Moving without dragging:**
  - Each card is one accessible element. Its label gives the item, column, lane and position, e.g. "Fix login, In progress, 3 of 12".
  - It carries custom actions: **Move to…**, **Move to ‹column›** and **Move to lane ‹lane›**.
  - The **Move to…** sheet lists the allowed destinations, with a top or bottom position.
- **Announcements:** a move is announced once `onMove` accepts it. A rejection announces where the card went back to.
- **Focus:** after a move from the sheet or an accessibility action, focus moves to the card in its new place.
- **Motion and direction:** reduced motion turns off lift, placeholder and sheet animations. RTL mirrors the column order and swipe directions.
- **Text size:** the chrome grows with the system font size instead of clipping.

## Performance

- **What we measured:** in a release build on the Android emulator, with 4 × 500 cards, the engine spends about **0.15 ms** per frame while dragging. Holding a card runs at 60 fps on both threads.
- **Auto-scroll:** frame rate during auto-scroll follows FlashList's cell rendering, just as it does for a finger scroll.
- **Details:** method and numbers are in [docs/benchmarks.md](docs/benchmarks.md).

To keep it fast:

- **Keep props stable:** memoize `renderCard` and keep `groupBy` stable.
- **Keep cards cheap:** avoid heavy work in cards.
- **Filter upstream:** filter in your app, not in `renderCard`.

## What it does not do

- **Data:** no item create, edit or delete, no fetching, syncing or offline storage. Those belong to your app.
- **Rank rebalancing:** this is your server's job. `shouldRebalance` and `rebalanceRanks` help.
- **Workflow features:** no WIP limits as an API (use `canDrop` and a header), no sub-columns, no column reordering, no multi-select.
- **Grouping:** no multi-valued `groupBy` (an item lives in one cell).
- **Platforms:** no Reanimated 3, no old architecture, no web.

## Packages

| Package                   | What it is                                                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `react-native-board-view` | The `Board` component. It also re-exports the core.                                                                            |
| `board-view-core`         | Pure TypeScript: grouping, ranks, move planning and the move queue. It runs in Node too, so a server can share the same rules. |

## License

MIT
