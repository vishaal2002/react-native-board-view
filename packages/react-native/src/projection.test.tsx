// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import * as core from 'board-view-core';
import { cellId, fractionalRank, type GroupBy, type MoveOperation } from 'board-view-core';
import { defaultLabels } from './theme';
import { useBoardController } from './useBoardController';
import type { BoardProps } from './types';

// Counts projections: on a large board each one is a noticeable part of a drop.
vi.mock('board-view-core', async (original) => {
  const actual = await original<typeof core>();
  return { ...actual, projectBoard: vi.fn(actual.projectBoard) };
});

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
const ranks = fractionalRank.nBetween(null, null, 3);
const items: Task[] = [
  { id: 'a', status: 'todo', rank: ranks[0]! },
  { id: 'b', status: 'todo', rank: ranks[1]! },
  { id: 'c', status: 'done', rank: ranks[2]! },
];
const props: BoardProps<Task> = {
  items,
  getItemId: (task) => task.id,
  groupBy,
  onMove: () => new Promise(() => undefined),
  renderCard: () => null,
};

describe('projections', () => {
  it('projects the board once for a move, planning and drawing included', () => {
    const { result } = renderHook(() => useBoardController(props, defaultLabels));
    const projectBoard = vi.mocked(core.projectBoard);
    projectBoard.mockClear();
    act(() => {
      expect(result.current.moveItem('a', cellId('_', 'done'), 0, 'drag')).toBe(true);
    });
    expect(result.current.model.cellById.get(cellId('_', 'done'))?.items.map((task) => task.id)).toEqual(['a', 'c']);
    expect(projectBoard).toHaveBeenCalledTimes(1);
  });

  it('projects once more when the app shows the move, not again when the overlay goes', async () => {
    let accept = () => {};
    let sent: MoveOperation | null = null;
    const accepted: BoardProps<Task> = {
      ...props,
      onMove: (op) =>
        new Promise<void>((resolve) => {
          sent = op;
          accept = resolve;
        }),
    };
    const { result, rerender } = renderHook((p: BoardProps<Task>) => useBoardController(p, defaultLabels), {
      initialProps: accepted,
    });
    act(() => {
      result.current.moveItem('a', cellId('_', 'done'), 0, 'drag');
    });
    // `onMove` runs a microtask after the move is queued.
    await act(async () => undefined);
    await act(async () => {
      accept();
      await new Promise((done) => setTimeout(done, 0));
    });
    const projectBoard = vi.mocked(core.projectBoard);
    projectBoard.mockClear();
    // The app's items now hold the move: the board projects them once, and the overlay leaving changes nothing.
    rerender({
      ...accepted,
      items: items.map((task) => (task.id === 'a' ? { ...task, status: 'done', rank: sent!.rank } : task)),
    });
    expect(result.current.isPending('a')).toBe(false);
    expect(result.current.model.cellById.get(cellId('_', 'done'))?.items.map((task) => task.id)).toEqual(['a', 'c']);
    expect(projectBoard).toHaveBeenCalledTimes(1);
  });

  it('projects a batch once per card', () => {
    const { result } = renderHook(() => useBoardController(props, defaultLabels));
    const projectBoard = vi.mocked(core.projectBoard);
    projectBoard.mockClear();
    act(() => {
      expect(result.current.moveItems(['a', 'b'], cellId('_', 'done'), 0, 'sheet')).toBe(2);
    });
    expect(result.current.model.cellById.get(cellId('_', 'done'))?.items.map((task) => task.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
    expect(projectBoard).toHaveBeenCalledTimes(2);
  });
});
