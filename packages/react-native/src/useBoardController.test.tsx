// @vitest-environment jsdom
import { StrictMode, type ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccessibilityInfo } from 'react-native';
import {
  NO_VALUE_ID,
  applyMove,
  cellId,
  fractionalRank,
  projectBoard,
  type GroupBy,
  type MoveContext,
  type MoveOperation,
} from 'board-view-core';
import { defaultLabels } from './theme';
import { rulesAllow } from './session';
import { resolveDestination, useBoardController } from './useBoardController';
import type { BoardProps } from './types';

interface Task {
  id: string;
  title: string;
  status: string | null;
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
const seed: Task[] = [
  { id: 'a', title: 'Alpha', status: 'todo', rank: ranks[0]! },
  { id: 'b', title: 'Beta', status: 'todo', rank: ranks[1]! },
  { id: 'c', title: 'Gamma', status: 'done', rank: ranks[2]! },
];

const todo = cellId('_', 'todo');
const done = cellId('_', 'done');

type Props = BoardProps<Task>;

function props(overrides: Partial<Props> = {}): Props {
  return {
    items: seed,
    getItemId: (task) => task.id,
    getItemLabel: (task) => task.title,
    groupBy,
    onMove: () => undefined,
    renderCard: () => null,
    ...overrides,
  };
}

function idsIn(model: ReturnType<typeof useBoardController<Task>>['model'], cell: string): string[] {
  return model.cellById.get(cell)?.items.map((task) => task.id) ?? [];
}

function apply(items: readonly Task[], op: MoveOperation): Task[] {
  return items.map((task) =>
    task.id === op.id ? applyMove(task, op, groupBy, (item, rank) => ({ ...item, rank })) : task,
  );
}

function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

let announce: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  announce = vi.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useBoardController', () => {
  it('shows a move at once and hands onMove the operation, its source and a signal', async () => {
    const onMove = vi.fn<(op: MoveOperation, context: MoveContext) => void>();
    const { result } = renderHook((p: Props) => useBoardController(p, defaultLabels), {
      initialProps: props({ onMove }),
    });

    let moved = false;
    act(() => {
      moved = result.current.moveItem('a', done, 0, 'sheet');
    });

    // The overlay shows synchronously; onMove runs a microtask later.
    expect(moved).toBe(true);
    expect(idsIn(result.current.model, done)).toEqual(['a', 'c']);
    expect(result.current.isPending('a')).toBe(true);
    await act(async () => undefined);
    const [op, context] = onMove.mock.calls[0]!;
    expect(op).toMatchObject({ id: 'a', changes: { status: 'done' }, source: 'sheet', previousId: null, nextId: 'c' });
    expect(context.signal.aborted).toBe(false);
  });

  it('refuses every move while readOnly is set', () => {
    const onMove = vi.fn();
    const { result } = renderHook((p: Props) => useBoardController(p, defaultLabels), {
      initialProps: props({ onMove, readOnly: true }),
    });

    let moved = true;
    act(() => {
      moved = result.current.moveItem('a', done, 0, 'drag');
    });

    expect(moved).toBe(false);
    expect(result.current.canDropTo('a', done)).toBe(false);
    expect(onMove).not.toHaveBeenCalled();
    expect(idsIn(result.current.model, todo)).toEqual(['a', 'b']);
  });

  it('announces a move only once onMove accepts it, and clears the overlay when items show it', async () => {
    const pending = deferred();
    let sent: MoveOperation | null = null;
    const onMove = (op: MoveOperation) => {
      sent = op;
      return pending.promise;
    };
    const { result, rerender } = renderHook((p: Props) => useBoardController(p, defaultLabels), {
      initialProps: props({ onMove }),
    });

    act(() => {
      result.current.moveItem('a', done, 1, 'drag');
    });
    expect(announce).not.toHaveBeenCalled();

    await act(async () => {
      pending.resolve();
      await pending.promise;
    });
    expect(announce).toHaveBeenCalledWith(expect.stringContaining('Alpha'));

    rerender(props({ onMove, items: apply(seed, sent!) }));
    expect(result.current.isPending('a')).toBe(false);
    expect(idsIn(result.current.model, done)).toEqual(['c', 'a']);
  });

  it('rolls back a rejected move, reports it and announces the failure', async () => {
    const pending = deferred();
    const onMoveError = vi.fn();
    const { result } = renderHook((p: Props) => useBoardController(p, defaultLabels), {
      initialProps: props({ onMove: () => pending.promise, onMoveError }),
    });

    act(() => {
      result.current.moveItem('a', done, 0, 'drag');
    });
    expect(idsIn(result.current.model, done)).toEqual(['a', 'c']);

    const error = new Error('server said no');
    await act(async () => {
      pending.reject(error);
      await pending.promise.catch(() => undefined);
    });

    expect(idsIn(result.current.model, todo)).toEqual(['a', 'b']);
    expect(onMoveError).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }), error);
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce.mock.calls[0]?.[0]).toMatch(/Could not move Alpha/);
  });

  it('refuses a move it cannot plan instead of throwing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const onMove = vi.fn();
    const { result } = renderHook((p: Props) => useBoardController(p, defaultLabels), {
      initialProps: props({ onMove }),
    });

    let moved = true;
    act(() => {
      // Index 5 does not exist in "Done" (one card after removal): data changed under the gesture.
      moved = result.current.moveItem('a', done, 5, 'drag');
    });

    expect(moved).toBe(false);
    expect(onMove).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });

  it('respects canDrop', () => {
    const onMove = vi.fn();
    const { result } = renderHook((p: Props) => useBoardController(p, defaultLabels), {
      initialProps: props({ onMove, canDrop: (_task, target) => target.columnId !== 'done' }),
    });
    expect(result.current.canDropTo('a', done)).toBe(false);
    act(() => {
      expect(result.current.moveItem('a', done, 0, 'drag')).toBe(false);
    });
    expect(onMove).not.toHaveBeenCalled();
  });

  it('shows items without a rank instead of crashing', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const items = [...seed, { id: 'd', title: 'Delta', status: 'todo' } as unknown as Task];
    const { result } = renderHook((p: Props) => useBoardController(p, defaultLabels), {
      initialProps: props({ items }),
    });
    expect(idsIn(result.current.model, todo)).toContain('d');
  });

  it('keeps the first of duplicate ids', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const items = [...seed, { ...seed[0]!, title: 'Alpha copy', status: 'done' }];
    const { result } = renderHook((p: Props) => useBoardController(p, defaultLabels), {
      initialProps: props({ items }),
    });
    expect(idsIn(result.current.model, todo)).toEqual(['a', 'b']);
    expect(idsIn(result.current.model, done)).toEqual(['c']);
    expect(result.current.itemsById.get('a')?.title).toBe('Alpha');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('duplicate item id "a"'));
  });

  it('aborts in-flight moves when the board unmounts', async () => {
    let signal: AbortSignal | null = null;
    const { result, unmount } = renderHook((p: Props) => useBoardController(p, defaultLabels), {
      initialProps: props({
        onMove: (_op, context) => {
          signal = context.signal;
          return new Promise<void>(() => undefined);
        },
      }),
    });
    await act(async () => {
      result.current.moveItem('a', done, 0, 'drag');
    });
    expect((signal as AbortSignal | null)?.aborted).toBe(false);
    unmount();
    expect((signal as AbortSignal | null)?.aborted).toBe(true);
  });

  it('keeps working under StrictMode, which unmounts and remounts effects once', async () => {
    const onMove = vi.fn();
    const wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>;
    const { result } = renderHook((p: Props) => useBoardController(p, defaultLabels), {
      initialProps: props({ onMove }),
      wrapper,
    });
    await act(async () => {
      result.current.moveItem('a', done, 0, 'drag');
    });
    expect(onMove).toHaveBeenCalledTimes(1);
    expect(idsIn(result.current.model, done)).toEqual(['a', 'c']);
  });

  it('asks for screen-reader focus after sheet and accessibility moves, not after drags', () => {
    const { result } = renderHook((p: Props) => useBoardController(p, defaultLabels), {
      initialProps: props(),
    });
    act(() => {
      result.current.moveItem('a', done, 0, 'drag');
    });
    expect(result.current.focusRequest.get()).toBeNull();
    act(() => {
      result.current.moveItem('b', done, 0, 'accessibility');
    });
    expect(result.current.focusRequest.get()).toBe('b');
  });

  it('times out a move that never settles and rolls it back', async () => {
    vi.useFakeTimers();
    try {
      const onMoveError = vi.fn();
      const { result } = renderHook((p: Props) => useBoardController(p, defaultLabels), {
        initialProps: props({ onMove: () => new Promise<void>(() => undefined), onMoveError, inflightTimeoutMs: 1000 }),
      });
      act(() => {
        result.current.moveItem('a', done, 0, 'drag');
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
      expect(idsIn(result.current.model, todo)).toEqual(['a', 'b']);
      expect(onMoveError.mock.calls[0]?.[1]).toMatchObject({ name: 'MoveTimeoutError' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('moves a card from the imperative handle with source api, top by default', async () => {
    const onMove = vi.fn<(op: MoveOperation, context: MoveContext) => void>();
    const { result } = renderHook((p: Props) => useBoardController(p, defaultLabels), {
      initialProps: props({ onMove }),
    });

    let moved = false;
    act(() => {
      moved = result.current.moveTo('b', { columnId: 'done' });
    });
    expect(moved).toBe(true);
    expect(idsIn(result.current.model, done)).toEqual(['b', 'c']);
    await act(async () => undefined);
    expect(onMove.mock.calls[0]?.[0]).toMatchObject({ id: 'b', changes: { status: 'done' }, source: 'api' });
    // An api move has no finger or screen-reader focus to keep.
    expect(result.current.focusRequest.get()).toBeNull();
  });

  it('puts an api move at the end, and refuses unknown cards, unknown columns and refused targets', () => {
    const onMove = vi.fn();
    const { result } = renderHook((p: Props) => useBoardController(p, defaultLabels), {
      initialProps: props({ onMove, canDrop: (task, target) => !(task.id === 'c' && target.columnId === 'todo') }),
    });

    act(() => {
      result.current.moveTo('a', { columnId: 'done', index: 'end' });
    });
    expect(idsIn(result.current.model, done)).toEqual(['c', 'a']);

    let moved = true;
    act(() => {
      moved = result.current.moveTo('missing', { columnId: 'done' });
    });
    expect(moved).toBe(false);
    act(() => {
      moved = result.current.moveTo('b', { columnId: 'nowhere' });
    });
    expect(moved).toBe(false);
    act(() => {
      moved = result.current.moveTo('c', { columnId: 'todo' });
    });
    expect(moved).toBe(false);
  });
});

describe('columnLimits', () => {
  it('blocks a full column from other columns in block mode, never a reorder inside it', () => {
    const { result, rerender } = renderHook((p: Props) => useBoardController(p, defaultLabels), {
      initialProps: props({ columnLimits: { done: 1 }, limitBehavior: 'block' }),
    });
    expect(result.current.canDropTo('a', done)).toBe(false);
    expect(result.current.canDropTo('c', done)).toBe(true);
    let moved = true;
    act(() => {
      moved = result.current.moveItem('a', done, 0, 'sheet');
    });
    expect(moved).toBe(false);

    // Warn mode, the default, only shows the limit.
    rerender(props({ columnLimits: { done: 1 } }));
    expect(result.current.canDropTo('a', done)).toBe(true);
  });

  it('counts the server total when the app passes one', () => {
    const { result } = renderHook((p: Props) => useBoardController(p, defaultLabels), {
      initialProps: props({ columnLimits: { todo: 5 }, limitBehavior: 'block', columnTotals: { todo: 5 } }),
    });
    expect(result.current.canDropTo('c', todo)).toBe(false);
  });

  it('lists full columns in one set that changes only when a column fills or empties', () => {
    const { result, rerender } = renderHook((p: Props) => useBoardController(p, defaultLabels), {
      initialProps: props({ columnLimits: { done: 2 }, limitBehavior: 'block', onMove: () => new Promise(() => {}) }),
    });
    const before = result.current.fullColumns;
    expect([...before]).toEqual([]);

    // A reorder inside To do changes the board, not which columns are full.
    act(() => {
      result.current.moveItem('b', todo, 0, 'drag');
    });
    expect(result.current.fullColumns).toBe(before);

    act(() => {
      result.current.moveItem('a', done, 0, 'drag');
    });
    expect([...result.current.fullColumns]).toEqual(['done']);

    // Warn mode never blocks, so nothing counts as full.
    rerender(props({ columnLimits: { done: 2 } }));
    expect([...result.current.fullColumns]).toEqual([]);
  });
});

describe('rulesAllow', () => {
  const rules = { limitBehavior: 'block' as const };
  const full = new Set(['done']);

  it('refuses a full column, but not a move inside it', () => {
    expect(rulesAllow(rules, seed[0]!, 'todo', done, full)).toBe(false);
    expect(rulesAllow(rules, seed[2]!, 'done', done, full)).toBe(true);
    expect(rulesAllow({}, seed[0]!, 'todo', done, full)).toBe(true);
  });

  it('applies canDrop and read-only like canDropTo', () => {
    const canDrop = vi.fn((task: Task) => task.id !== 'a');
    expect(rulesAllow({ canDrop }, seed[0]!, 'todo', done, new Set())).toBe(false);
    expect(canDrop).toHaveBeenCalledWith(seed[0], { cellId: done, columnId: 'done', laneId: null });
    expect(rulesAllow({ canDrop }, seed[1]!, 'todo', done, new Set())).toBe(true);
    expect(rulesAllow({ readOnly: true }, seed[1]!, 'todo', done, new Set())).toBe(false);
  });
});

describe('undo', () => {
  it('puts a card back where it came from, with source undo, and does not undo the undo', async () => {
    const onMove = vi.fn<(op: MoveOperation, context: MoveContext) => void>();
    const { result } = renderHook((p: Props) => useBoardController(p, defaultLabels), {
      initialProps: props({ onMove }),
    });

    act(() => {
      result.current.moveItem('b', done, 1, 'drag');
    });
    expect(idsIn(result.current.model, done)).toEqual(['c', 'b']);
    expect(result.current.lastMove.get()).toMatchObject({
      source: 'drag',
      moves: [{ itemId: 'b', fromCellId: todo, fromIndex: 1, toCellId: done }],
    });
    expect(result.current.canUndo()).toBe(true);

    let undone = false;
    act(() => {
      undone = result.current.undo();
    });
    expect(undone).toBe(true);
    expect(idsIn(result.current.model, todo)).toEqual(['a', 'b']);
    expect(result.current.lastMove.get()).toBeNull();
    expect(result.current.canUndo()).toBe(false);
    await act(async () => undefined);
    expect(onMove.mock.calls.map(([op]) => op.source)).toEqual(['drag', 'undo']);
    expect(onMove.mock.calls[1]?.[0]).toMatchObject({ id: 'b', changes: { status: 'todo' }, previousId: 'a' });
  });

  it('undoes moves newest first and reverts a reorder inside one cell', () => {
    const { result } = renderHook((p: Props) => useBoardController(p, defaultLabels), { initialProps: props() });
    act(() => {
      result.current.moveItem('a', todo, 1, 'drag');
    });
    act(() => {
      result.current.moveItem('c', todo, 0, 'sheet');
    });
    expect(idsIn(result.current.model, todo)).toEqual(['c', 'b', 'a']);
    act(() => {
      result.current.undo();
    });
    expect(idsIn(result.current.model, todo)).toEqual(['b', 'a']);
    expect(idsIn(result.current.model, done)).toEqual(['c']);
    act(() => {
      result.current.undo();
    });
    expect(idsIn(result.current.model, todo)).toEqual(['a', 'b']);
  });

  it('skips a move the data has since moved on from', async () => {
    const { result, rerender } = renderHook((p: Props) => useBoardController(p, defaultLabels), {
      initialProps: props(),
    });
    let op: MoveOperation | undefined;
    act(() => {
      rerender(
        props({
          onMove: (next) => {
            op = next;
          },
        }),
      );
    });
    act(() => {
      result.current.moveItem('a', done, 0, 'drag');
    });
    await act(async () => undefined);
    const applied = apply(seed, op!);
    await act(async () => {
      rerender(props({ items: applied }));
    });
    // Later the app (or another user) moves the card somewhere else.
    const moved = applied.map((task) => (task.id === 'a' ? { ...task, status: null } : task));
    await act(async () => {
      rerender(props({ items: moved }));
    });
    expect(idsIn(result.current.model, cellId('_', NO_VALUE_ID))).toEqual(['a']);
    expect(result.current.canUndo()).toBe(false);
    let undone = true;
    act(() => {
      undone = result.current.undo();
    });
    expect(undone).toBe(false);
  });

  it('forgets a move that was rolled back', async () => {
    const pending = deferred();
    const { result } = renderHook((p: Props) => useBoardController(p, defaultLabels), {
      initialProps: props({ onMove: () => pending.promise }),
    });
    act(() => {
      result.current.moveItem('a', done, 0, 'drag');
    });
    await act(async () => {
      pending.reject(new Error('no'));
      await pending.promise.catch(() => undefined);
    });
    expect(result.current.lastMove.get()).toBeNull();
    expect(result.current.canUndo()).toBe(false);
  });
});

describe('0.8 fixes', () => {
  it('undoes the move the banner names, not an older one, when that move can no longer be undone', async () => {
    const { result, rerender } = renderHook((p: Props) => useBoardController(p, defaultLabels), {
      initialProps: props(),
    });
    act(() => {
      result.current.moveItem('a', done, 0, 'drag');
    });
    act(() => {
      result.current.moveItem('b', done, 0, 'drag');
    });
    const named = result.current.lastMove.get()!;
    expect(named.moves[0]?.itemId).toBe('b');
    // The server deletes the card the banner names.
    await act(async () => {
      rerender(props({ items: seed.filter((task) => task.id !== 'b') }));
    });
    let undone = true;
    act(() => {
      undone = result.current.undo(named.id);
    });
    expect(undone).toBe(false);
    // `a` stays where the user put it.
    expect(idsIn(result.current.model, done)[0]).toBe('a');
  });

  it('never falls back to an older move when the newest is refused, and keeps it for later', () => {
    const { result, rerender } = renderHook((p: Props) => useBoardController(p, defaultLabels), {
      initialProps: props(),
    });
    act(() => {
      result.current.moveItem('a', done, 0, 'drag');
    });
    act(() => {
      result.current.moveItem('b', done, 0, 'drag');
    });
    // Now `b` may not go back to To do.
    rerender(props({ canDrop: (task, target) => !(task.id === 'b' && target.columnId === 'todo') }));
    let undone = true;
    act(() => {
      undone = result.current.undo();
    });
    expect(undone).toBe(false);
    expect(idsIn(result.current.model, done)).toEqual(['b', 'a', 'c']);
    expect(result.current.canUndo()).toBe(true);
    // Once it may, the same undo works.
    rerender(props());
    act(() => {
      undone = result.current.undo();
    });
    expect(undone).toBe(true);
    expect(idsIn(result.current.model, todo)).toEqual(['b']);
  });

  it('plans a second move in the same tick against the first one', () => {
    const { result } = renderHook((p: Props) => useBoardController(p, defaultLabels), { initialProps: props() });
    act(() => {
      result.current.moveItem('a', done, 0, 'drag');
      result.current.moveItem('b', done, 0, 'drag');
    });
    expect(idsIn(result.current.model, done)).toEqual(['b', 'a', 'c']);
  });

  it('enforces a block limit across moves made in the same tick', () => {
    const { result } = renderHook((p: Props) => useBoardController(p, defaultLabels), {
      initialProps: props({ columnLimits: { done: 2 }, limitBehavior: 'block' }),
    });
    let first = false;
    let second = true;
    act(() => {
      first = result.current.moveItem('a', done, 0, 'drag');
      second = result.current.moveItem('b', done, 0, 'drag');
    });
    expect([first, second]).toEqual([true, false]);
    expect(idsIn(result.current.model, done)).toEqual(['a', 'c']);
  });

  it('counts moves the server has not shown yet against a columnTotals limit', () => {
    const pending = deferred();
    const { result } = renderHook((p: Props) => useBoardController(p, defaultLabels), {
      initialProps: props({
        onMove: () => pending.promise,
        columnLimits: { done: 2 },
        columnTotals: { done: 1 },
        limitBehavior: 'block',
      }),
    });
    act(() => {
      result.current.moveItem('a', done, 0, 'drag');
    });
    expect(result.current.canDropTo('b', done)).toBe(false);
  });
});

describe('review fixes', () => {
  it('keeps the rest of a batch when one card is refused', () => {
    const { result } = renderHook((p: Props) => useBoardController(p, defaultLabels), {
      initialProps: props({ canDrop: (task) => task.id !== 'a' }),
    });
    let moved = 0;
    act(() => {
      moved = result.current.moveItems(['a', 'b'], done, 0, 'sheet');
    });
    expect(moved).toBe(1);
    expect(idsIn(result.current.model, done)).toEqual(['b', 'c']);
  });

  it('undoes into a cell that has shrunk since', async () => {
    const { result, rerender } = renderHook((p: Props) => useBoardController(p, defaultLabels), {
      initialProps: props(),
    });
    act(() => {
      result.current.moveItem('b', done, 0, 'drag');
    });
    await act(async () => {
      rerender(props({ items: seed.filter((task) => task.id !== 'a') }));
    });
    let undone = false;
    act(() => {
      undone = result.current.undo();
    });
    expect(undone).toBe(true);
    expect(idsIn(result.current.model, todo)).toEqual(['b']);
  });
});

describe('batch moves', () => {
  it('moves cards together in board order, with one batch for onMove', async () => {
    const onMove = vi.fn<(op: MoveOperation, context: MoveContext) => void>();
    const { result } = renderHook((p: Props) => useBoardController(p, defaultLabels), {
      initialProps: props({ onMove }),
    });
    let moved = 0;
    act(() => {
      moved = result.current.moveItems(['b', 'a'], done, 0, 'sheet');
    });
    expect(moved).toBe(2);
    expect(idsIn(result.current.model, done)).toEqual(['a', 'b', 'c']);
    await act(async () => undefined);
    const ops = onMove.mock.calls.map(([op]) => op);
    expect(ops.map((op) => op.id)).toEqual(['a', 'b']);
    expect(ops[0]?.batch).toEqual({ id: ops[1]?.batch?.id, index: 0, size: 2 });
    expect(ops[1]?.batch?.index).toBe(1);
    expect(ops[1]).toMatchObject({ previousId: 'a', nextId: 'c' });
    expect(announce).not.toHaveBeenCalledWith(expect.stringContaining('Moved Alpha'));
  });

  it('gathers the others around the dragged card', () => {
    const { result } = renderHook((p: Props) => useBoardController(p, defaultLabels), { initialProps: props() });
    act(() => {
      // b is dragged below c; a, above b on the board, lands just above it.
      result.current.moveItems(['a', 'b'], done, 1, 'drag', 'b');
    });
    expect(idsIn(result.current.model, done)).toEqual(['c', 'a', 'b']);
  });

  it('undoes a batch as one move', () => {
    const { result } = renderHook((p: Props) => useBoardController(p, defaultLabels), { initialProps: props() });
    act(() => {
      result.current.moveItems(['a', 'b'], done, 1, 'sheet');
    });
    expect(result.current.lastMove.get()?.moves).toHaveLength(2);
    act(() => {
      result.current.undo();
    });
    expect(idsIn(result.current.model, todo)).toEqual(['a', 'b']);
    expect(idsIn(result.current.model, done)).toEqual(['c']);
  });

  it('moves only the cards the target takes', () => {
    const { result } = renderHook((p: Props) => useBoardController(p, defaultLabels), {
      initialProps: props({ canDrop: (task) => task.id !== 'b' }),
    });
    let moved = 0;
    act(() => {
      moved = result.current.moveItems(['a', 'b'], done, 0, 'sheet');
    });
    expect(moved).toBe(1);
    expect(idsIn(result.current.model, done)).toEqual(['a', 'c']);
  });

  it('moves a selection from the handle to a column', () => {
    const { result } = renderHook((p: Props) => useBoardController(p, defaultLabels), { initialProps: props() });
    let moved = 0;
    act(() => {
      moved = result.current.moveManyTo(['a', 'b'], { columnId: 'done', index: 'end' });
    });
    expect(moved).toBe(2);
    expect(idsIn(result.current.model, done)).toEqual(['c', 'a', 'b']);
  });
});

describe('resolveDestination', () => {
  const lanes: GroupBy<Task & { owner: string | null }> = {
    columns: groupBy.columns as GroupBy<Task & { owner: string | null }>['columns'],
    lanes: {
      key: 'owner',
      values: [
        { id: 'ann', label: 'Ann' },
        { id: 'ben', label: 'Ben' },
      ],
    },
  };
  const laneItems = seed.map((task, index) => ({ ...task, owner: index === 0 ? 'ann' : index === 1 ? 'ben' : null }));
  const laneModel = projectBoard({
    items: laneItems,
    getItemId: (task) => task.id,
    getRank: (task) => task.rank,
    groupBy: lanes,
  });
  const flatModel = projectBoard({ items: seed, getItemId: (task) => task.id, getRank: (task) => task.rank, groupBy });

  it('clamps the index to the cell, counting without the moved card', () => {
    expect(resolveDestination(flatModel, 'a', { columnId: 'todo', index: 99 }, false)).toEqual({
      cellId: todo,
      index: 1,
    });
    expect(resolveDestination(flatModel, 'a', { columnId: 'done', index: -4 }, false)).toEqual({
      cellId: done,
      index: 0,
    });
    expect(resolveDestination(flatModel, 'a', { columnId: 'done', index: 'end' }, false)).toEqual({
      cellId: done,
      index: 1,
    });
  });

  it('keeps the card in its lane unless a lane is given, and ignores lanes on boards without them', () => {
    expect(resolveDestination(laneModel, 'a', { columnId: 'done' }, true)).toEqual({
      cellId: cellId('ann', 'done'),
      index: 0,
    });
    expect(resolveDestination(laneModel, 'a', { columnId: 'done', laneId: 'ben' }, true)?.cellId).toBe(
      cellId('ben', 'done'),
    );
    expect(resolveDestination(laneModel, 'c', { columnId: 'todo', laneId: NO_VALUE_ID }, true)?.cellId).toBe(
      cellId(NO_VALUE_ID, 'todo'),
    );
    expect(resolveDestination(flatModel, 'a', { columnId: 'done', laneId: 'ben' }, false)?.cellId).toBe(done);
  });

  it('returns null for an unknown card or cell', () => {
    expect(resolveDestination(flatModel, 'zzz', { columnId: 'done' }, false)).toBeNull();
    expect(resolveDestination(flatModel, 'a', { columnId: 'zzz' }, false)).toBeNull();
  });
});

describe('gates', () => {
  it('holds a gated move, pending in its new place, and calls onMove only with the answer', async () => {
    const onMove = vi.fn<(op: MoveOperation, context: MoveContext & { answer?: unknown }) => void>();
    const gateMove = vi.fn(() => ({ ask: 'resolution' }));
    const { result } = renderHook((p: Props) => useBoardController(p, defaultLabels), {
      initialProps: props({ onMove, gateMove }),
    });

    act(() => {
      result.current.moveItem('a', done, 0, 'drag');
    });
    expect(gateMove).toHaveBeenCalledWith([expect.objectContaining({ item: seed[0], op: expect.anything() })]);
    expect(result.current.gate).toMatchObject({ request: { ask: 'resolution' }, toCellId: done });
    expect(idsIn(result.current.model, done)).toEqual(['a', 'c']);
    expect(result.current.isPending('a')).toBe(true);
    await act(async () => undefined);
    expect(onMove).not.toHaveBeenCalled();

    act(() => result.current.submitGate('fixed'));
    await act(async () => undefined);
    expect(result.current.gate).toBeNull();
    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onMove.mock.calls[0]![1].answer).toBe('fixed');
    expect(result.current.canUndo()).toBe(true);
  });

  it('sends the card back on cancel, never calls onMove, and leaves nothing to undo', async () => {
    const onMove = vi.fn();
    const { result } = renderHook((p: Props) => useBoardController(p, defaultLabels), {
      initialProps: props({ onMove, gateMove: () => true }),
    });
    act(() => {
      result.current.moveItem('a', done, 0, 'drag');
    });
    act(() => result.current.cancelGate());
    await act(async () => undefined);
    expect(result.current.gate).toBeNull();
    expect(idsIn(result.current.model, todo)).toEqual(['a', 'b']);
    expect(result.current.isPending('a')).toBe(false);
    expect(onMove).not.toHaveBeenCalled();
    expect(result.current.canUndo()).toBe(false);
    expect(announce).toHaveBeenCalledWith(defaultLabels.moveCancelled);
  });

  it('refuses other moves while one is held', () => {
    const { result } = renderHook((p: Props) => useBoardController(p, defaultLabels), {
      initialProps: props({ gateMove: () => true }),
    });
    act(() => {
      result.current.moveItem('a', done, 0, 'drag');
    });
    let second = true;
    act(() => {
      second = result.current.moveItem('b', done, 0, 'drag');
    });
    expect(second).toBe(false);
    expect(idsIn(result.current.model, todo)).toEqual(['b']);
  });

  it('asks to confirm moves into confirmInto columns only, and lets gateMove decide first', async () => {
    const onMove = vi.fn();
    const { result, rerender } = renderHook((p: Props) => useBoardController(p, defaultLabels), {
      initialProps: props({ onMove, confirmInto: ['done'] }),
    });
    act(() => {
      result.current.moveItem('b', todo, 0, 'drag');
    });
    expect(result.current.gate).toBeNull();
    act(() => {
      result.current.moveItem('a', done, 0, 'drag');
    });
    expect(result.current.gate?.request).toBe('confirm');
    act(() => result.current.cancelGate());

    rerender(props({ onMove, confirmInto: ['done'], gateMove: () => 'form' }));
    act(() => {
      result.current.moveItem('a', done, 0, 'drag');
    });
    expect(result.current.gate?.request).toBe('form');
  });

  it('never holds an undo', async () => {
    const onMove = vi.fn();
    const gateMove = vi.fn((moves: readonly { op: MoveOperation }[]) => (moves[0]!.op.source === 'drag' ? null : true));
    const { result } = renderHook((p: Props) => useBoardController(p, defaultLabels), {
      initialProps: props({ onMove, gateMove }),
    });
    act(() => {
      result.current.moveItem('a', done, 0, 'drag');
    });
    await act(async () => undefined);
    act(() => {
      result.current.undo();
    });
    expect(result.current.gate).toBeNull();
    expect(gateMove).toHaveBeenCalledTimes(1);
  });
});
