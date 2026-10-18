import { describe, expect, it } from 'vitest';
import { cellId, fractionalRank, projectBoard, type GroupBy } from 'board-view-core';
import { visibleModel } from './visible';

interface Task {
  id: string;
  status: string;
  owner: string;
  rank: string;
}

const groupBy: GroupBy<Task> = {
  columns: {
    key: 'status',
    values: [
      { id: 'todo', label: 'To do' },
      { id: 'doing', label: 'Doing' },
      { id: 'done', label: 'Done' },
    ],
  },
  lanes: {
    key: 'owner',
    values: [
      { id: 'ana', label: 'Ana' },
      { id: 'ben', label: 'Ben' },
    ],
  },
};

const [r1, r2] = fractionalRank.nBetween(null, null, 2);
const model = projectBoard<Task>({
  items: [
    { id: 'a', status: 'todo', owner: 'ana', rank: r1! },
    { id: 'b', status: 'done', owner: 'ana', rank: r2! },
  ],
  getItemId: (task) => task.id,
  getRank: (task) => task.rank,
  groupBy,
});

describe('visibleModel', () => {
  it('returns the same model when nothing is hidden', () => {
    expect(visibleModel(model, false, false)).toBe(model);
  });

  it('hides columns and lanes with no cards, and keeps every cell reachable by id', () => {
    const shown = visibleModel(model, true, true);
    expect(shown.columns.map((column) => column.id)).toEqual(['todo', 'done']);
    expect(shown.lanes.map((lane) => lane.id)).toEqual(['ana']);
    expect(shown.cells.map((cell) => cell.cellId)).toEqual([cellId('ana', 'todo'), cellId('ana', 'done')]);
    expect(shown.cellById.has(cellId('ben', 'doing'))).toBe(true);
    expect(shown.locations).toBe(model.locations);
  });

  it('hides only what is asked', () => {
    expect(visibleModel(model, true, false).lanes).toHaveLength(2);
    expect(visibleModel(model, false, true).columns).toHaveLength(3);
  });
});
