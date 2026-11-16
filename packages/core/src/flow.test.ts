import { describe, expect, it } from 'vitest';
import { boardFlow, percentile, type JournalEntry } from './index';

const DAY = 86_400_000;
const at = (day: number, hour = 12) => new Date(2026, 10, day, hour).getTime();
const place = (column: string, rank = 'a0') => ({ cellId: `_::${column}`, rank });
let counter = 0;
const step = (itemId: string, from: string | null, to: string | null, time: number): JournalEntry => ({
  id: String((counter += 1)),
  at: time,
  itemId,
  from: from ? place(from) : null,
  to: to ? place(to) : null,
  observed: false,
});

describe('percentile', () => {
  it('uses nearest rank', () => {
    expect(percentile([], 50)).toBeNull();
    expect(percentile([5, 1, 3], 50)).toBe(3);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 85)).toBe(9);
    expect(percentile([4], 100)).toBe(4);
  });
});

describe('boardFlow', () => {
  const entries = [
    step('a', null, 'todo', at(1)),
    step('b', null, 'todo', at(1)),
    step('a', 'todo', 'doing', at(3)),
    step('a', 'doing', 'doing', at(4)),
    step('a', 'doing', 'done', at(5)),
    step('b', 'todo', 'done', at(5, 18)),
    step('c', null, 'doing', at(6)),
  ];

  it('counts throughput per day into done columns, and cycle times', () => {
    const flow = boardFlow(entries, { doneColumns: ['done'] });
    expect(flow.throughput).toEqual([{ day: '2026-11-05', count: 2 }]);
    expect(flow.cycleTimes).toEqual([4, 4.25]);
  });

  it('measures time in each column, ignoring reorders inside it', () => {
    const flow = boardFlow(entries);
    expect(flow.columns.todo).toEqual({ entered: 2, left: 2, days: { mean: 3.125, median: 2, p85: 4.25 } });
    expect(flow.columns.doing).toMatchObject({ entered: 2, left: 1, days: { median: 2 } });
    expect(flow.columns.done).toEqual({ entered: 2, left: 0, days: null });
  });

  it('knows when each card entered its current column', () => {
    const flow = boardFlow([...entries, step('b', 'done', null, at(7))]);
    expect(flow.enteredAt.get('a')).toBe(at(5));
    expect(flow.enteredAt.get('c')).toBe(at(6));
    expect(flow.enteredAt.has('b')).toBe(false);
  });

  it('sorts entries that arrive out of order', () => {
    const flow = boardFlow([step('a', 'todo', 'done', at(2)), step('a', null, 'todo', at(1))], {
      doneColumns: ['done'],
    });
    expect(flow.cycleTimes).toEqual([1]);
    expect(flow.columns.todo?.days?.mean).toBeCloseTo((at(2) - at(1)) / DAY);
  });
});
