import { describe, expect, it } from 'vitest';
import { cellId, fractionalRank, projectBoard, type GroupBy } from 'board-view-core';
import { catchUpCounts, snapshotBoard, snapshotOf } from './catchUp';

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
      { id: 'done', label: 'Done' },
    ],
  },
  lanes: { key: 'owner', values: [{ id: 'ann', label: 'Ann' }] },
};
const ranks = fractionalRank.nBetween(null, null, 6);
const getItemId = (task: Task) => task.id;
const project = (items: readonly Task[], overlays = [] as Parameters<typeof projectBoard<Task>>[0]['overlays']) =>
  projectBoard<Task>({ items, getItemId, getRank: (task) => task.rank, groupBy, overlays });
const task = (id: string, status: string, rank: number): Task => ({ id, status, owner: 'ann', rank: ranks[rank]! });

describe('snapshots', () => {
  const before = [task('a', 'todo', 0), task('b', 'todo', 1), task('c', 'done', 2)];
  const snapshot = snapshotOf(project(before), 42);

  it('records each card by cell and index', () => {
    expect(snapshot).toEqual({
      version: 1,
      at: 42,
      places: { a: [cellId('ann', 'todo'), 0], b: [cellId('ann', 'todo'), 1], c: [cellId('ann', 'done'), 0] },
    });
  });

  it('draws the board as it was, leaving out cards it never saw', () => {
    // Since then: b went to Done and to its top, a is below, and d is new.
    const now = [task('a', 'todo', 3), task('b', 'done', 0), task('c', 'done', 2), task('d', 'todo', 1)];
    const old = snapshotBoard(snapshot, now, getItemId, groupBy);
    const board = project(old.items, old.overlays);
    expect(board.cellById.get(cellId('ann', 'todo'))?.items.map(getItemId)).toEqual(['a', 'b']);
    expect(board.cellById.get(cellId('ann', 'done'))?.items.map(getItemId)).toEqual(['c']);
    expect(catchUpCounts(snapshot, project(now))).toEqual({ moved: 1, added: 1, removed: 0 });
  });

  it('counts cards that are gone, and skips cells that no longer exist', () => {
    const stale = { ...snapshot, places: { ...snapshot.places, c: [cellId('ann', 'archived'), 0] as const } };
    const old = snapshotBoard(stale, before, getItemId, groupBy);
    expect(old.items.map(getItemId)).toEqual(['a', 'b']);
    expect(catchUpCounts(snapshot, project(before.slice(0, 2)))).toEqual({ moved: 0, added: 0, removed: 1 });
  });

  it('treats card ids that match Object.prototype keys as new cards', () => {
    const now = [...before, task('constructor', 'todo', 4), task('toString', 'done', 5)];
    const old = snapshotBoard(snapshot, now, getItemId, groupBy);
    expect(old.items.map(getItemId)).toEqual(['a', 'b', 'c']);
    expect(catchUpCounts(snapshot, project(now))).toEqual({ moved: 0, added: 2, removed: 0 });
  });
});
