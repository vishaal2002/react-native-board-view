import { describe, expect, it, vi } from 'vitest';
import { readAxisValue, readItemSnapshot } from './index';
import type { GroupAxis, GroupBy } from './index';

interface Card {
  id: string;
  rank: string;
  status?: string | number | null;
  assignee?: string | null;
}

const status: GroupAxis<Card> = {
  key: 'status',
  values: [
    { id: 'todo', label: 'To do' },
    { id: 'done', label: 'Done' },
  ],
};

const assignee: GroupAxis<Card> = {
  key: 'assignee',
  values: [{ id: 'alice', label: 'Alice' }],
};

const getRank = (card: Card) => card.rank;

describe('readAxisValue', () => {
  it('reads item[key] by default', () => {
    expect(readAxisValue(status, { id: '1', rank: 'a0', status: 'todo' })).toBe('todo');
  });

  it('stringifies non-string values', () => {
    expect(readAxisValue(status, { id: '1', rank: 'a0', status: 3 })).toBe('3');
  });

  it('returns unknown values as they are', () => {
    expect(readAxisValue(status, { id: '1', rank: 'a0', status: 'mystery' })).toBe('mystery');
  });

  it.each([null, undefined, ''])('treats %j as no value', (value) => {
    expect(readAxisValue(status, { id: '1', rank: 'a0', status: value })).toBeNull();
  });

  it('treats a missing field as no value', () => {
    expect(readAxisValue(status, { id: '1', rank: 'a0' })).toBeNull();
  });

  it('uses getKey when the axis provides one', () => {
    const getKey = vi.fn((card: Card) => (card.status === 'TODO' ? 'todo' : null));
    const card: Card = { id: '1', rank: 'a0', status: 'TODO' };
    expect(readAxisValue({ ...status, getKey }, card)).toBe('todo');
    expect(getKey).toHaveBeenCalledWith(card);
  });

  it('treats an empty string from getKey as no value', () => {
    expect(readAxisValue({ ...status, getKey: () => '' }, { id: '1', rank: 'a0' })).toBeNull();
  });

  it('returns null for a primitive item without getKey', () => {
    const axis: GroupAxis<string> = { key: 'status', values: [] };
    expect(readAxisValue(axis, 'todo')).toBeNull();
  });
});

describe('readItemSnapshot', () => {
  it('reads the rank and the column field on a board without lanes', () => {
    const groupBy: GroupBy<Card> = { columns: status };
    expect(readItemSnapshot({ id: '1', rank: 'a3', status: 'todo', assignee: 'alice' }, groupBy, getRank)).toEqual({
      rank: 'a3',
      fields: { status: 'todo' },
    });
  });

  it('includes the lane field when the board has lanes', () => {
    const groupBy: GroupBy<Card> = { columns: status, lanes: assignee };
    expect(readItemSnapshot({ id: '1', rank: 'a3', status: 'done', assignee: 'alice' }, groupBy, getRank)).toEqual({
      rank: 'a3',
      fields: { status: 'done', assignee: 'alice' },
    });
  });

  it('keeps unknown values raw and reports empty values as null', () => {
    const groupBy: GroupBy<Card> = { columns: status, lanes: assignee };
    expect(readItemSnapshot({ id: '1', rank: 'a3', status: 'mystery', assignee: '' }, groupBy, getRank)).toEqual({
      rank: 'a3',
      fields: { status: 'mystery', assignee: null },
    });
  });

  it('reads through getKey and getRank', () => {
    interface Row {
      meta: { state: string; owner: string; order: number };
    }
    const groupBy: GroupBy<Row> = {
      columns: { key: 'state', values: [], getKey: (row) => row.meta.state.toLowerCase() },
      lanes: { key: 'owner', values: [], getKey: (row) => row.meta.owner },
    };
    const row: Row = { meta: { state: 'DONE', owner: 'bob', order: 7 } };
    expect(readItemSnapshot(row, groupBy, (item) => `r${item.meta.order}`)).toEqual({
      rank: 'r7',
      fields: { state: 'done', owner: 'bob' },
    });
  });
});
