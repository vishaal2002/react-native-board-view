import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing';
import { describe, expect, it } from 'vitest';
import {
  NO_VALUE_ID,
  ToIndexError,
  applyAxisValue,
  cellId,
  compareRanked,
  createMoveFromDrop,
  createMoveQueue,
  orderAfterMove,
  projectBoard,
  rankBetween,
  rankForMove,
  rebalanceRanks,
  resolveDropIndex,
  runS1Cases,
  shouldRebalance,
} from './index';

const columns = {
  key: 'status',
  values: [
    { id: 'todo', label: 'To do' },
    { id: 'doing', label: 'Doing' },
    { id: 'done', label: 'Done' },
  ],
};

const lanes = {
  key: 'assignee',
  values: [
    { id: 'alice', label: 'Alice' },
    { id: 'bob', label: 'Bob' },
  ],
};

interface Card {
  id: string;
  rank: string;
  status: string | null;
  assignee?: string | null;
  title?: string;
}

function flush(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

describe('S1 rank and index', () => {
  it('passes every checklist case', () => {
    const cases = runS1Cases();
    const failed = cases.filter((item) => !item.pass);
    expect(failed, failed.map((item) => `${item.id}: ${item.detail}`).join('\n')).toEqual([]);
  });

  it('treats toIndex as the index after the dragged card is removed', () => {
    expect(orderAfterMove(['a', 'b', 'c', 'd'], 'a', 1)).toEqual(['b', 'a', 'c', 'd']);
    expect(orderAfterMove(['a', 'b', 'c', 'd'], 'c', 3)).toEqual(['a', 'b', 'd', 'c']);
    expect(orderAfterMove(['a', 'b', 'c'], 'b', 0)).toEqual(['b', 'a', 'c']);
  });

  it('rejects an index past the cell', () => {
    expect(() => orderAfterMove(['a', 'b'], 'a', 3)).toThrow(ToIndexError);
    expect(() => rankForMove([{ id: 'a', rank: 'a0' }], 'z', 2)).toThrow(ToIndexError);
  });

  it('ranks a cross-cell insert between visible neighbors only', () => {
    const [left, hidden, right] = generateNKeysBetween(null, null, 3);
    expect(left && hidden && right).toBeTruthy();
    const visible = [
      { id: 'left', rank: left as string },
      { id: 'right', rank: right as string },
    ];
    const rank = rankForMove(visible, 'moved', 1);
    expect(rank).toBe(generateKeyBetween(left as string, right as string));
    expect(rank).not.toBe(generateKeyBetween(left as string, hidden as string));
    expect(compareRanked({ id: 'left', rank: left as string }, { id: 'moved', rank })).toBeLessThan(0);
    expect(compareRanked({ id: 'moved', rank }, { id: 'right', rank: right as string })).toBeLessThan(0);
  });

  it('breaks equal ranks by id', () => {
    const ordered = [
      { id: 'b', rank: 'a0' },
      { id: 'a', rank: 'a0' },
    ].sort(compareRanked);
    expect(ordered.map((item) => item.id)).toEqual(['a', 'b']);
  });

  it('normalizes an engine tail report into an append, and an empty cell to 0', () => {
    expect(
      resolveDropIndex({
        sameCell: false,
        reportedIndex: 2,
        itemCount: 3,
        pointerContent: 500,
        contentEnd: 400,
      }),
    ).toBe(3);
    expect(
      resolveDropIndex({
        sameCell: false,
        reportedIndex: 9,
        itemCount: 0,
        pointerContent: 20,
        contentEnd: 0,
      }),
    ).toBe(0);
    expect(
      resolveDropIndex({
        sameCell: true,
        reportedIndex: 1,
        itemCount: 4,
        pointerContent: null,
        contentEnd: null,
      }),
    ).toBe(1);
  });
});

describe('rank helpers', () => {
  it('rebalances in current order and shortens long keys', () => {
    const first = rankBetween(null, null);
    let cursor = first;
    const items = [{ id: 'a', rank: first }];
    for (let index = 1; index < 12; index += 1) {
      cursor = rankBetween(cursor, null);
      items.push({ id: String.fromCharCode(97 + index), rank: cursor });
    }
    const stretched = items.map((item, index) =>
      index === 5 ? { ...item, rank: rankBetween(items[4]?.rank ?? null, items[6]?.rank ?? null) } : item,
    );
    const next = rebalanceRanks(stretched);
    expect(next.map((item) => item.id)).toEqual(stretched.map((item) => item.id));
    for (let index = 1; index < next.length; index += 1) {
      expect(next[index - 1]!.rank < next[index]!.rank).toBe(true);
    }
    expect(shouldRebalance(['a0'])).toBe(false);
    expect(shouldRebalance(['x'.repeat(60)])).toBe(true);
  });
});

describe('projection', () => {
  const keys = generateNKeysBetween(null, null, 4);

  const items: Card[] = [
    { id: 'a', rank: keys[0] ?? 'a0', status: 'todo', assignee: 'alice', title: 'A' },
    { id: 'b', rank: keys[1] ?? 'a1', status: 'todo', assignee: 'alice', title: 'B' },
    { id: 'c', rank: keys[2] ?? 'a2', status: 'doing', assignee: 'bob', title: 'C' },
    { id: 'd', rank: keys[3] ?? 'a3', status: 'mystery', assignee: 'alice', title: 'D' },
  ];

  it('keeps empty configured columns and sends unknown values to No value', () => {
    const board = projectBoard({
      items,
      getItemId: (item) => item.id,
      getRank: (item) => item.rank,
      groupBy: { columns, lanes },
    });
    expect(board.columns.map((column) => column.id)).toEqual(['todo', 'doing', 'done', NO_VALUE_ID]);
    expect(board.cellById.get(cellId('alice', 'done'))?.items).toEqual([]);
    expect(board.cellById.get(cellId('alice', NO_VALUE_ID))?.items.map((item) => item.id)).toEqual(['d']);
    expect(board.cellById.get(cellId('alice', 'todo'))?.items.map((item) => item.id)).toEqual(['a', 'b']);
  });

  it('projects an overlay without editing the source item', () => {
    const source = items[0] as Card;
    const doing = cellId('bob', 'doing');
    const visible = projectBoard({
      items,
      getItemId: (item) => item.id,
      getRank: (item) => item.rank,
      groupBy: { columns, lanes },
    }).cellById.get(doing);
    const op = createMoveFromDrop({
      item: source,
      itemId: source.id,
      groupBy: { columns, lanes },
      fromCellId: cellId('alice', 'todo'),
      toCellId: doing,
      toIndex: 1,
      targetVisible: (visible?.items ?? []).map((item) => ({ id: item.id, rank: item.rank })),
      opId: 'op-1',
    });
    const next = projectBoard({
      items,
      getItemId: (item) => item.id,
      getRank: (item) => item.rank,
      groupBy: { columns, lanes },
      overlays: [op],
    });
    expect(source.status).toBe('todo');
    expect(source.assignee).toBe('alice');
    expect(next.cellById.get(cellId('alice', 'todo'))?.items.map((item) => item.id)).toEqual(['b']);
    expect(next.cellById.get(doing)?.items.map((item) => item.id)).toEqual(['c', 'a']);
    expect(op.changes).toEqual({ status: 'doing', assignee: 'bob' });
    expect(op.from).toEqual({ status: 'todo', assignee: 'alice' });
  });

  it('chains from the pending overlay, not the server record', () => {
    const source = items[1] as Card;
    const first = createMoveFromDrop({
      item: source,
      itemId: source.id,
      groupBy: { columns },
      fromCellId: cellId('_', 'todo'),
      toCellId: cellId('_', 'done'),
      toIndex: 0,
      targetVisible: [],
      opId: 'first',
    });
    const second = createMoveFromDrop({
      item: source,
      itemId: source.id,
      groupBy: { columns },
      fromCellId: cellId('_', 'done'),
      toCellId: cellId('_', 'doing'),
      toIndex: 0,
      targetVisible: [],
      current: { fields: first.changes, rank: first.rank },
      opId: 'second',
    });
    expect(second.from).toEqual(first.changes);
    expect(second.changes.status).toBe('doing');
  });

  it('uses applyKey only when the app asks', () => {
    const axis = {
      key: 'status',
      values: columns.values,
      applyKey: (item: Card, value: string | null) => ({ ...item, status: value }),
    };
    const next = applyAxisValue(axis, items[0] as Card, 'done');
    expect(next.status).toBe('done');
    expect(items[0]?.status).toBe('todo');
  });
});

describe('optimistic queue', () => {
  const op = (id: string, rank: string, status: string) => ({
    opId: id,
    id: 'card',
    changes: { status },
    from: { status: 'todo' },
    rank,
  });

  it('shows the overlay before onMove runs and clears it only when items match', async () => {
    let started = 0;
    let release: (() => void) | undefined;
    const queue = createMoveQueue({
      onMove: () => {
        started += 1;
        return new Promise<void>((resolve) => {
          release = resolve;
        });
      },
    });
    queue.enqueue(op('1', 'a1', 'doing'));
    expect(queue.getOverlay('card')?.opId).toBe('1');
    expect(started).toBe(0);
    await flush();
    expect(started).toBe(1);
    release?.();
    await flush();
    expect(queue.getOverlay('card')?.opId).toBe('1');
    queue.reconcile(() => ({ rank: 'a0', fields: { status: 'todo' } }));
    expect(queue.getOverlay('card')?.opId).toBe('1');
    queue.reconcile(() => ({ rank: 'a1', fields: { status: 'doing' } }));
    expect(queue.getOverlay('card')).toBeNull();
  });

  it('serializes two rapid moves and cancels the second when the first rejects', async () => {
    const calls: string[] = [];
    let rejectFirst: ((error: Error) => void) | undefined;
    const queue = createMoveQueue({
      onMove: (move) => {
        calls.push(move.opId);
        if (move.opId === '1') {
          return new Promise<void>((_resolve, reject) => {
            rejectFirst = reject;
          });
        }
        return Promise.resolve();
      },
    });
    queue.enqueue(op('1', 'a1', 'doing'));
    queue.enqueue(op('2', 'a2', 'done'));
    expect(queue.getOverlay('card')?.opId).toBe('2');
    await flush();
    expect(calls).toEqual(['1']);
    rejectFirst?.(new Error('rejected'));
    await flush();
    expect(calls).toEqual(['1']);
    expect(queue.getOverlay('card')).toBeNull();
  });

  it('sends the second move only after the first settles', async () => {
    const calls: string[] = [];
    let releaseFirst: (() => void) | undefined;
    const queue = createMoveQueue({
      onMove: (move) => {
        calls.push(move.opId);
        if (move.opId === '1') {
          return new Promise<void>((resolve) => {
            releaseFirst = resolve;
          });
        }
        return Promise.resolve();
      },
    });
    queue.enqueue(op('1', 'a1', 'doing'));
    queue.enqueue(op('2', 'a2', 'done'));
    await flush();
    expect(calls).toEqual(['1']);
    releaseFirst?.();
    await flush();
    expect(calls).toEqual(['1', '2']);
    expect(queue.getOverlay('card')?.opId).toBe('2');
    queue.reconcile(() => ({ rank: 'a1', fields: { status: 'doing' } }));
    expect(queue.getOverlay('card')?.opId).toBe('2');
    queue.reconcile(() => ({ rank: 'a2', fields: { status: 'done' } }));
    expect(queue.getOverlay('card')).toBeNull();
  });
});
