import { describe, expect, it, vi } from 'vitest';
import { fractionalRank, type GroupBy, type MoveOperation } from 'board-view-core';
import { createBoardTester } from './testing';

interface Task {
  id: string;
  title: string;
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
const ranks = fractionalRank.nBetween(null, null, 3);
const items: Task[] = [
  { id: 'a', title: 'Alpha', status: 'todo', rank: ranks[0]! },
  { id: 'b', title: 'Beta', status: 'todo', rank: ranks[1]! },
  { id: 'c', title: 'Gamma', status: 'done', rank: ranks[2]! },
];
const base = { items, getItemId: (task: Task) => task.id, getItemLabel: (task: Task) => task.title, groupBy };

describe('createBoardTester', () => {
  it('holds a gated move until it is answered or cancelled', async () => {
    const onMove = vi.fn();
    const board = createBoardTester({ ...base, onMove, confirmInto: ['done'] });
    expect(board.drag('a', { columnId: 'done' })).toBe(true);
    expect(board.gate()).toBe('confirm');
    expect(board.isPending('a')).toBe(true);
    await board.settle();
    expect(onMove).not.toHaveBeenCalled();
    board.submitGate('ok');
    await board.settle();
    expect(onMove).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'a' }),
      expect.objectContaining({ answer: 'ok' }),
    );

    expect(board.drag('b', { columnId: 'done' })).toBe(true);
    board.cancelGate();
    expect(board.gate()).toBeNull();
    expect(board.column('todo')).toEqual(['b']);
    board.dispose();
  });

  it('drags a card and hands onMove the op', async () => {
    const onMove = vi.fn();
    const board = createBoardTester({ ...base, onMove });
    expect(board.drag('a', { columnId: 'done' })).toBe(true);
    expect(board.columns()).toEqual({ todo: ['b'], done: ['a', 'c'] });
    expect(board.isPending('a')).toBe(true);
    await board.settle();
    expect(onMove).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'a', changes: { status: 'done' }, source: 'drag', nextId: 'c' }),
      expect.anything(),
    );
    expect(board.announcements).toEqual(['Moved Alpha to Done, 1 of 2']);
    board.dispose();
  });

  it('applies accepted moves when asked, and rolls back rejected ones', async () => {
    const board = createBoardTester({
      ...base,
      applyAcceptedMoves: true,
      onMove: (op: MoveOperation) => (op.id === 'b' ? Promise.reject(new Error('no')) : undefined),
    });
    board.drag('a', { columnId: 'done', index: 'end' });
    board.drag('b', { columnId: 'done' });
    await board.settle();
    expect(board.items().find((task) => task.id === 'a')?.status).toBe('done');
    expect(board.column('done')).toEqual(['c', 'a']);
    expect(board.column('todo')).toEqual(['b']);
    expect(board.isPending('a')).toBe(false);
    board.dispose();
  });

  it('enforces limits and moves selections as one batch', () => {
    const board = createBoardTester({ ...base, columnLimits: { done: 2 }, limitBehavior: 'block' });
    expect(board.canMove('a', { columnId: 'done' })).toBe(true);
    expect(board.moveMany(['a', 'b'], { columnId: 'done' })).toBe(1);
    expect(board.canMove('b', { columnId: 'done' })).toBe(false);
    expect(board.undo()).toBe(true);
    expect(board.column('todo')).toEqual(['a', 'b']);
    board.dispose();
  });
});
