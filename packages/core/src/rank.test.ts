import { generateNKeysBetween } from 'fractional-indexing';
import { describe, expect, it, vi } from 'vitest';
import {
  cellId,
  compareRanked,
  fractionalRank,
  planMove,
  projectBoard,
  rankBetween,
  rebalanceRanks,
  shouldRebalance,
} from './index';
import type { GroupBy, MoveOperation, RankStrategy, RankedRef } from './index';

/** Ranks are decimal numbers compared numerically, so "9" < "10" unlike plain string order. */
const numericRank: RankStrategy = {
  between(before, after) {
    const low = before == null ? (after == null ? 0 : Number(after) - 1000) : Number(before);
    const high = after == null ? low + 1000 : Number(after);
    return String((low + high) / 2);
  },
  nBetween(before, after, count) {
    const keys: string[] = [];
    let cursor = before;
    for (let index = 0; index < count; index += 1) {
      cursor = this.between(cursor, after);
      keys.push(cursor);
    }
    return keys;
  },
  compare(a, b) {
    return Number(a) - Number(b);
  },
};

function isStrictlyIncreasing(ranks: readonly string[], strategy: RankStrategy = fractionalRank): boolean {
  return ranks.every((rank, index) => {
    const previous = ranks[index - 1];
    return previous == null || strategy.compare(previous, rank) < 0;
  });
}

describe('rankBetween', () => {
  it('starts an empty list at "a0"', () => {
    expect(rankBetween(null, null)).toBe('a0');
  });

  it('returns a key strictly between two neighbours', () => {
    const rank = rankBetween('a0', 'a1');
    expect(rank > 'a0').toBe(true);
    expect(rank < 'a1').toBe(true);
  });

  it('extends past either end when one neighbour is null', () => {
    expect(rankBetween('a5', null) > 'a5').toBe(true);
    expect(rankBetween(null, 'a5') < 'a5').toBe(true);
  });

  it('keeps finding room after many inserts at the same spot', () => {
    let after = 'a1';
    for (let index = 0; index < 200; index += 1) {
      const next = rankBetween('a0', after);
      expect(next > 'a0' && next < after).toBe(true);
      after = next;
    }
  });

  it('throws for equal neighbours, since no key fits between them', () => {
    expect(() => rankBetween('a1', 'a1')).toThrow();
  });

  it('delegates to a custom strategy', () => {
    expect(rankBetween('2', '10', numericRank)).toBe('6');
  });
});

describe('compareRanked', () => {
  it('orders by rank first', () => {
    expect(compareRanked({ id: 'z', rank: 'a0' }, { id: 'a', rank: 'a1' })).toBeLessThan(0);
    expect(compareRanked({ id: 'a', rank: 'a1' }, { id: 'z', rank: 'a0' })).toBeGreaterThan(0);
  });

  it('breaks equal ranks by id', () => {
    const ordered: RankedRef[] = [
      { id: 'b', rank: 'a0' },
      { id: 'c', rank: 'a0' },
      { id: 'a', rank: 'a0' },
    ].sort((x, y) => compareRanked(x, y));
    expect(ordered.map((item) => item.id)).toEqual(['a', 'b', 'c']);
  });

  it('returns 0 only for the same rank and id', () => {
    expect(compareRanked({ id: 'a', rank: 'a0' }, { id: 'a', rank: 'a0' })).toBe(0);
  });

  it('uses the strategy comparison for ranks', () => {
    expect(compareRanked({ id: 'x', rank: '10' }, { id: 'y', rank: '9' })).toBeLessThan(0);
    expect(compareRanked({ id: 'x', rank: '10' }, { id: 'y', rank: '9' }, numericRank)).toBeGreaterThan(0);
  });
});

describe('rebalanceRanks', () => {
  it('returns nothing for an empty list', () => {
    expect(rebalanceRanks([])).toEqual([]);
  });

  it('returns one update per item in rank order, ties broken by id', () => {
    const long = 'a0' + 'V'.repeat(60);
    const input: RankedRef[] = [
      { id: 'd', rank: 'a3' },
      { id: 'b', rank: long },
      { id: 'a', rank: long },
      { id: 'c', rank: 'a2' },
      { id: 'e', rank: 'Zz' },
    ];
    const updates = rebalanceRanks(input);
    expect(updates).toHaveLength(input.length);
    expect(updates.map((update) => update.id)).toEqual(['e', 'a', 'b', 'c', 'd']);
    expect(new Set(updates.map((update) => update.id))).toEqual(new Set(input.map((item) => item.id)));
  });

  it('writes short, strictly increasing keys', () => {
    let rank = rankBetween(null, null);
    const input: RankedRef[] = [];
    for (let index = 0; index < 100; index += 1) {
      input.push({ id: `item-${String(index).padStart(2, '0')}`, rank });
      rank = rankBetween(rank, 'a1');
    }
    expect(
      shouldRebalance(
        input.map((item) => item.rank),
        8,
      ),
    ).toBe(true);
    const updates = rebalanceRanks(input);
    expect(isStrictlyIncreasing(updates.map((update) => update.rank))).toBe(true);
    expect(
      shouldRebalance(
        updates.map((update) => update.rank),
        8,
      ),
    ).toBe(false);
    expect(updates.map((update) => update.id)).toEqual(input.map((item) => item.id));
  });

  it('does not mutate the input', () => {
    const input: RankedRef[] = [
      { id: 'b', rank: 'a1' },
      { id: 'a', rank: 'a0' },
    ];
    const before = structuredClone(input);
    rebalanceRanks(input);
    expect(input).toEqual(before);
  });

  it('uses the strategy for order and new keys', () => {
    const nBetween = vi.spyOn(numericRank, 'nBetween');
    const updates = rebalanceRanks(
      [
        { id: 'big', rank: '100' },
        { id: 'small', rank: '9' },
      ],
      numericRank,
    );
    expect(nBetween).toHaveBeenCalledWith(null, null, 2);
    expect(updates).toEqual([
      { id: 'small', rank: '500' },
      { id: 'big', rank: '1000' },
    ]);
    nBetween.mockRestore();
  });

  it('throws when the strategy returns too few keys', () => {
    const short: RankStrategy = { ...fractionalRank, nBetween: () => ['a0'] };
    expect(() =>
      rebalanceRanks(
        [
          { id: 'a', rank: 'a0' },
          { id: 'b', rank: 'a1' },
        ],
        short,
      ),
    ).toThrow(/returned 1 keys for 2 items/);
  });
});

describe('shouldRebalance', () => {
  it('is false for an empty list', () => {
    expect(shouldRebalance([])).toBe(false);
  });

  it('allows keys up to 48 characters by default', () => {
    expect(shouldRebalance(['a0', 'x'.repeat(48)])).toBe(false);
    expect(shouldRebalance(['a0', 'x'.repeat(49)])).toBe(true);
  });

  it('honours a custom maxLength', () => {
    expect(shouldRebalance(['a0V'], 3)).toBe(false);
    expect(shouldRebalance(['a0VV'], 3)).toBe(true);
  });
});

describe('fractionalRank', () => {
  it('returns no keys for a non-positive count', () => {
    expect(fractionalRank.nBetween(null, null, 0)).toEqual([]);
    expect(fractionalRank.nBetween(null, null, -1)).toEqual([]);
  });

  it('matches fractional-indexing for several keys', () => {
    expect(fractionalRank.nBetween(null, null, 4)).toEqual(generateNKeysBetween(null, null, 4));
  });
});

describe('a custom RankStrategy', () => {
  interface Task {
    id: string;
    rank: string;
    status: string;
  }

  const groupBy: GroupBy<Task> = {
    columns: {
      key: 'status',
      values: [
        { id: 'todo', label: 'To do' },
        { id: 'done', label: 'Done' },
      ],
    },
  };

  const tasks: Task[] = [
    { id: 'hundred', rank: '100', status: 'todo' },
    { id: 'two', rank: '2', status: 'todo' },
    { id: 'ten', rank: '10', status: 'todo' },
  ];

  const project = (strategy?: RankStrategy, overlays: MoveOperation[] = []) =>
    projectBoard({
      items: tasks,
      getItemId: (task) => task.id,
      getRank: (task) => task.rank,
      groupBy,
      strategy,
      overlays,
    });

  const todo = cellId('_', 'todo');

  it('orders cells with its compare in projectBoard', () => {
    expect(
      project()
        .cellById.get(todo)
        ?.ranked.map((ref) => ref.id),
    ).toEqual(['ten', 'hundred', 'two']);
    expect(
      project(numericRank)
        .cellById.get(todo)
        ?.ranked.map((ref) => ref.id),
    ).toEqual(['two', 'ten', 'hundred']);
  });

  it('is used by planMove for the new rank and the projected result honours it', () => {
    const model = project(numericRank);
    const task = tasks[0];
    if (!task) throw new Error('fixture');
    const op = planMove({
      model,
      groupBy,
      item: task,
      itemId: task.id,
      toCellId: todo,
      toIndex: 1,
      strategy: numericRank,
      opId: 'op',
    });
    expect(op).toEqual({ opId: 'op', id: 'hundred', changes: {}, from: {}, rank: '6' });
    const next = project(numericRank, op ? [op] : []);
    expect(next.cellById.get(todo)?.ranked).toEqual([
      { id: 'two', rank: '2' },
      { id: 'hundred', rank: '6' },
      { id: 'ten', rank: '10' },
    ]);
  });

  it('is used for an append to another cell', () => {
    const model = project(numericRank);
    const task = tasks[1];
    if (!task) throw new Error('fixture');
    const op = planMove({
      model,
      groupBy,
      item: task,
      itemId: task.id,
      toCellId: cellId('_', 'done'),
      toIndex: 0,
      strategy: numericRank,
      opId: 'op',
    });
    expect(op).toEqual({ opId: 'op', id: 'two', changes: { status: 'done' }, from: { status: 'todo' }, rank: '500' });
  });
});
