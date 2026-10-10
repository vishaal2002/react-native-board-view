# board-view-core

The board model behind [`react-native-board-view`](https://www.npmjs.com/package/react-native-board-view), in plain TypeScript. It has no React or React Native dependency, and it ships ESM, CommonJS and type declarations.

It has four parts:

- **`projectBoard`:** groups flat items into columns, and optionally lanes. Order comes from one global rank per item, with ties broken by id. Items that have an unknown value or `null` go to a "No value" bucket.
- **`planMove`:** turns "put this item at index N of that cell" into a `MoveOperation`. The operation carries:
  - the fields that change;
  - their previous values;
  - a new fractional rank between the visible neighbours;
  - the ids of those neighbours.
- **`createMoveQueue`:** an optimistic queue that holds one pending overlay per item.
  - It runs `onMove` calls for the same item one at a time, with an abort signal and a timeout.
  - It clears an overlay once your data shows the move, and rolls it back on rejection.
- **Rank helpers:** `rankBetween`, `seedRanks`, `rebalanceRanks`, `shouldRebalance`. They use [fractional-indexing](https://github.com/rocicorp/fractional-indexing) by default, and you can supply your own `RankStrategy`.

Use it on a server so the API applies moves with exactly the same rules as the app:

```ts
import { applyMove, planMove, projectBoard } from 'board-view-core';

const model = projectBoard({ items, getItemId: (t) => t.id, getRank: (t) => t.rank, groupBy });
const op = planMove({ model, groupBy, item, itemId: item.id, toCellId: '_::done', toIndex: 0 });
if (op) await save(applyMove(item, op, groupBy, (t, rank) => ({ ...t, rank })));
```

## Index semantics

`toIndex` is the insertion index in the target cell **after the moved item is removed**.

- Items your app filtered out are not neighbours, so ranks are always computed between cards the user can see.
- Next to tied ranks, a card lands after the tie. `previousId` and `nextId` report where it really ended up.

## License

MIT
