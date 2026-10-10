// @vitest-environment jsdom
import { StrictMode, type ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccessibilityInfo } from 'react-native';
import { applyMove, cellId, fractionalRank, type GroupBy, type MoveContext, type MoveOperation } from 'board-view-core';
import { defaultLabels } from './theme';
import { useBoardController } from './useBoardController';
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
});
