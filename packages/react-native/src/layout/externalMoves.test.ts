import { describe, expect, it } from 'vitest';
import { cellId, createProjector, fractionalRank, projectBoard, type GroupBy } from 'board-view-core';
import { changedBetween, externalMovesBetween } from './externalMoves';

interface Task {
  id: string;
  status: string;
  rank: string;
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
const ranks = fractionalRank.nBetween(null, null, 10);
const board = (statuses: string[]) =>
  projectBoard<Task>({
    items: statuses.map((status, index) => ({ id: `t${index}`, status, rank: ranks[index]! })),
    getItemId: (task) => task.id,
    getRank: (task) => task.rank,
    groupBy,
  });
const never = () => false;

describe('externalMovesBetween', () => {
  it('reports cards the data moved to another cell', () => {
    const before = board(['todo', 'todo']);
    const after = board(['done', 'todo']);
    expect(externalMovesBetween(before, after, never, never)).toEqual(['t0']);
    expect(after.locations.get('t0')?.cellId).toBe(cellId('_', 'done'));
  });

  it('skips the first render and the board’s own pending moves', () => {
    const after = board(['done', 'todo']);
    expect(externalMovesBetween(null, after, never, never)).toEqual([]);
    const before = board(['todo', 'todo']);
    expect(externalMovesBetween(before, after, (id) => id === 't0', never)).toEqual([]);
    expect(externalMovesBetween(before, after, never, (id) => id === 't0')).toEqual([]);
  });

  it('treats many cards changing at once as a regroup, not moves', () => {
    const before = board(new Array(9).fill('todo'));
    const after = board(new Array(9).fill('done'));
    expect(externalMovesBetween(before, after, never, never)).toEqual([]);
  });
});

describe('changedBetween', () => {
  const items = (statuses: string[]) =>
    statuses.map((status, index) => ({ id: `t${index}`, status, rank: ranks[index]! }));
  const input = (statuses: string[]) => ({
    items: items(statuses),
    getItemId: (task: Task) => task.id,
    getRank: (task: Task) => task.rank,
    groupBy,
  });

  it('lists the moved card and the cards it shifted', () => {
    const before = board(['todo', 'todo', 'done', 'done']);
    const after = board(['done', 'todo', 'done', 'done']);
    expect([...changedBetween(before, after)].sort()).toEqual(['t0', 't1', 't2', 't3']);
  });

  it('reads only the cells the projector rebuilt', () => {
    const projector = createProjector<Task>();
    const before = projector.project(input(['todo', 'todo', 'done', 'done']));
    const after = projector.project(input(['todo', 'todo', 'done', 'todo']));
    expect([...changedBetween(before, after)].sort()).toEqual(['t3']);
    expect(changedBetween(after, after).size).toBe(0);
  });
});
