import { describe, expect, it, vi } from 'vitest';
import {
  ToIndexError,
  compareRanked,
  fractionalRank,
  orderAfterMove,
  rankBetween,
  rankForMove,
  visibleAfterRemoval,
} from './index';
import type { RankStrategy, RankedRef } from './index';

const column: RankedRef[] = [
  { id: 'a', rank: 'a0' },
  { id: 'b', rank: 'a1' },
  { id: 'c', rank: 'a2' },
  { id: 'd', rank: 'a3' },
];

const ids = column.map((ref) => ref.id);

function orderWith(refs: readonly RankedRef[], moved: RankedRef): string[] {
  return [...refs.filter((ref) => ref.id !== moved.id), moved].sort((x, y) => compareRanked(x, y)).map((ref) => ref.id);
}

describe('orderAfterMove', () => {
  it('counts toIndex after the dragged card is removed when moving down', () => {
    expect(orderAfterMove(ids, 'a', 1)).toEqual(['b', 'a', 'c', 'd']);
    expect(orderAfterMove(ids, 'a', 3)).toEqual(['b', 'c', 'd', 'a']);
    expect(orderAfterMove(ids, 'c', 3)).toEqual(['a', 'b', 'd', 'c']);
  });

  it('moves a card up', () => {
    expect(orderAfterMove(ids, 'd', 0)).toEqual(['d', 'a', 'b', 'c']);
    expect(orderAfterMove(['a', 'b', 'c'], 'b', 0)).toEqual(['b', 'a', 'c']);
  });

  it('keeps the order when the card goes back to its own index', () => {
    expect(orderAfterMove(ids, 'b', 1)).toEqual(ids);
  });

  it('inserts a card from another cell without shifting indexes', () => {
    expect(orderAfterMove(['x', 'y'], 'z', 0)).toEqual(['z', 'x', 'y']);
    expect(orderAfterMove(['x', 'y'], 'z', 1)).toEqual(['x', 'z', 'y']);
    expect(orderAfterMove(['x', 'y'], 'z', 2)).toEqual(['x', 'y', 'z']);
    expect(orderAfterMove([], 'z', 0)).toEqual(['z']);
  });

  it('does not mutate the input', () => {
    const input = ['a', 'b', 'c'];
    orderAfterMove(input, 'a', 2);
    expect(input).toEqual(['a', 'b', 'c']);
  });

  it('throws ToIndexError outside 0..length after removal', () => {
    expect(() => orderAfterMove(['a', 'b'], 'a', 2)).toThrow(ToIndexError);
    expect(() => orderAfterMove(['a', 'b'], 'z', 3)).toThrow(ToIndexError);
    expect(() => orderAfterMove(['a', 'b'], 'z', -1)).toThrow(ToIndexError);
    expect(() => orderAfterMove([], 'z', 1)).toThrow(ToIndexError);
  });
});

describe('ToIndexError', () => {
  it('is a RangeError naming the index and the valid bounds', () => {
    let caught: unknown;
    try {
      rankForMove([{ id: 'a', rank: 'a0' }], 'z', 2);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ToIndexError);
    expect(caught).toBeInstanceOf(RangeError);
    expect(caught).toMatchObject({
      name: 'ToIndexError',
      message: 'toIndex 2 is outside 0..1 after removing the dragged card.',
    });
  });
});

describe('visibleAfterRemoval', () => {
  it('drops only the dragged card', () => {
    expect(visibleAfterRemoval(column, 'b').map((ref) => ref.id)).toEqual(['a', 'c', 'd']);
  });

  it('returns every card when the dragged card is from another cell', () => {
    expect(visibleAfterRemoval(column, 'z')).toEqual(column);
  });
});

describe('rankForMove', () => {
  it('ranks between the neighbours at toIndex when moving down within a cell', () => {
    const rank = rankForMove(column, 'a', 1);
    expect(rank).toBe(rankBetween('a1', 'a2'));
    expect(orderWith(column, { id: 'a', rank })).toEqual(orderAfterMove(ids, 'a', 1));
  });

  it('ranks before the first card at index 0 and after the last card at the end', () => {
    const start = rankForMove(column, 'd', 0);
    const end = rankForMove(column, 'a', 3);
    expect(start).toBe(rankBetween(null, 'a0'));
    expect(end).toBe(rankBetween('a3', null));
    expect(orderWith(column, { id: 'd', rank: start })).toEqual(['d', 'a', 'b', 'c']);
    expect(orderWith(column, { id: 'a', rank: end })).toEqual(['b', 'c', 'd', 'a']);
  });

  it('ranks a card from another cell between the visible neighbours', () => {
    const target: RankedRef[] = [
      { id: 'x', rank: 'a0' },
      { id: 'y', rank: 'a2' },
    ];
    const rank = rankForMove(target, 'z', 1);
    expect(rank).toBe(rankBetween('a0', 'a2'));
    expect(orderWith(target, { id: 'z', rank })).toEqual(['x', 'z', 'y']);
  });

  it('starts an empty cell with the first key', () => {
    expect(rankForMove([], 'z', 0)).toBe(rankBetween(null, null));
  });

  it('does not use hidden (filtered) items as boundaries', () => {
    const left = 'a0';
    const hidden = 'a0k';
    const right = 'a1';
    const visible: RankedRef[] = [
      { id: 'left', rank: left },
      { id: 'right', rank: right },
    ];
    const rank = rankForMove(visible, 'moved', 1);
    expect(rank).toBe(rankBetween(left, right));
    expect(rank).not.toBe(rankBetween(left, hidden));
    expect(rank > left && rank < right).toBe(true);
  });

  it('throws ToIndexError for an index outside the cell after removal', () => {
    expect(() => rankForMove(column, 'a', 4)).toThrow(ToIndexError);
    expect(() => rankForMove(column, 'z', 5)).toThrow(ToIndexError);
    expect(() => rankForMove(column, 'z', -1)).toThrow(ToIndexError);
    expect(() => rankForMove(column, 'z', 4)).not.toThrow();
  });

  describe('with tied neighbour ranks', () => {
    const tied: RankedRef[] = [
      { id: 'w', rank: 'a0' },
      { id: 'x', rank: 'a1' },
      { id: 'y', rank: 'a1' },
      { id: 'z', rank: 'a2' },
    ];

    it('does not throw and lands right after the tie', () => {
      const rank = rankForMove(tied, 'moved', 2);
      expect(rank > 'a1' && rank < 'a2').toBe(true);
      expect(orderWith(tied, { id: 'moved', rank })).toEqual(['w', 'x', 'y', 'moved', 'z']);
    });

    it('lands at the end when the tie is the tail of the cell', () => {
      const tail: RankedRef[] = [
        { id: 'x', rank: 'a1' },
        { id: 'y', rank: 'a1' },
      ];
      const rank = rankForMove(tail, 'moved', 1);
      expect(rank).toBe(rankBetween('a1', null));
      expect(orderWith(tail, { id: 'moved', rank })).toEqual(['x', 'y', 'moved']);
    });

    it('skips every tied card after the insertion point', () => {
      const run: RankedRef[] = [
        { id: 'p', rank: 'a1' },
        { id: 'q', rank: 'a1' },
        { id: 'r', rank: 'a1' },
        { id: 's', rank: 'a3' },
      ];
      const rank = rankForMove(run, 'moved', 1);
      expect(rank).toBe(rankBetween('a1', 'a3'));
      expect(orderWith(run, { id: 'moved', rank })).toEqual(['p', 'q', 'r', 'moved', 's']);
    });

    it('lands after the tie when the dragged card comes from the same cell', () => {
      const rank = rankForMove(tied, 'w', 1);
      expect(orderWith(tied, { id: 'w', rank })).toEqual(['x', 'y', 'w', 'z']);
    });

    it('still ranks before a tie at index 0', () => {
      const rank = rankForMove(tied.slice(1), 'moved', 0);
      expect(rank).toBe(rankBetween(null, 'a1'));
    });
  });

  it('passes the strategy through', () => {
    const between = vi.fn<RankStrategy['between']>(() => 'custom');
    const strategy: RankStrategy = { ...fractionalRank, between };
    expect(rankForMove(column, 'a', 2, strategy)).toBe('custom');
    expect(between).toHaveBeenCalledWith('a2', 'a3');
  });
});
