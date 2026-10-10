import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MoveTimeoutError,
  applyMove,
  cellId,
  createMoveQueue,
  planMove,
  projectBoard,
  readItemSnapshot,
} from './index';
import type { GroupBy, ItemMoveSnapshot, MoveOperation, MoveQueueEvent, MoveQueueOptions } from './index';

interface Deferred {
  resolve: () => void;
  reject: (error: unknown) => void;
}

/** Lets queued promise chains run, without moving fake time forward. */
async function flush(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
}

function move(
  opId: string,
  {
    rank,
    changes = {},
    from = {},
    id = 'card',
  }: { rank: string; changes?: Record<string, string | null>; from?: Record<string, string | null>; id?: string },
): MoveOperation {
  return { opId, id, changes, from, rank };
}

function describeEvent(event: MoveQueueEvent): string {
  switch (event.type) {
    case 'cleared':
      return `cleared:${event.opId}:${event.reason}`;
    case 'cancelled':
      return `cancelled:${event.op.opId}`;
    default:
      return `${event.type}:${event.op.opId}`;
  }
}

function createHarness(
  options: Partial<Pick<MoveQueueOptions, 'onMove' | 'settleTimeoutMs' | 'inflightTimeoutMs'>> = {},
) {
  const data = new Map<string, ItemMoveSnapshot>([
    ['card', { rank: 'a0', fields: { status: 'todo' } }],
    ['other', { rank: 'a0', fields: { status: 'todo' } }],
  ]);
  const events: MoveQueueEvent[] = [];
  const calls: string[] = [];
  const deferreds = new Map<string, Deferred>();
  const queue = createMoveQueue({
    onMove:
      options.onMove ??
      ((op) => {
        calls.push(op.opId);
        return new Promise<void>((resolve, reject) => {
          deferreds.set(op.opId, { resolve, reject });
        });
      }),
    readItem: (itemId) => data.get(itemId) ?? null,
    onEvent: (event) => events.push(event),
    settleTimeoutMs: options.settleTimeoutMs,
    inflightTimeoutMs: options.inflightTimeoutMs,
  });

  function deferred(opId: string): Deferred {
    const found = deferreds.get(opId);
    if (!found) throw new Error(`onMove has not been called for "${opId}"`);
    return found;
  }

  return {
    queue,
    data,
    events,
    calls,
    log: () => events.map(describeEvent),
    show(itemId: string, snapshot: ItemMoveSnapshot) {
      data.set(itemId, snapshot);
    },
    async resolve(opId: string) {
      deferred(opId).resolve();
      await flush();
    },
    async reject(opId: string, error: unknown = new Error('rejected')) {
      deferred(opId).reject(error);
      await flush();
    },
  };
}

const toDoing = (opId = '1', rank = 'a5') =>
  move(opId, { rank, changes: { status: 'doing' }, from: { status: 'todo' } });

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createMoveQueue', () => {
  describe('overlay and snapshot', () => {
    it('shows the overlay synchronously, before onMove runs', async () => {
      let overlayWhenCalled: MoveOperation | null = null;
      const harness = createHarness({
        onMove: (op) => {
          overlayWhenCalled = harness.queue.getOverlay(op.id);
          return new Promise<void>(() => undefined);
        },
      });
      const op = toDoing();
      harness.queue.enqueue(op);
      expect(harness.queue.getOverlay('card')).toEqual(op);
      expect(harness.queue.getSnapshot().overlays).toEqual([op]);
      expect(overlayWhenCalled).toBeNull();
      await flush();
      expect(overlayWhenCalled).toEqual(op);
    });

    it('does not call onMove inside enqueue', () => {
      const harness = createHarness();
      harness.queue.enqueue(toDoing());
      expect(harness.calls).toEqual([]);
    });

    it('returns null for an item with no pending moves', () => {
      expect(createHarness().queue.getOverlay('card')).toBeNull();
    });

    it('starts at version 0 and bumps the version on every enqueue', () => {
      const { queue } = createHarness();
      expect(queue.getSnapshot()).toEqual({ version: 0, overlays: [] });
      queue.enqueue(toDoing('1'));
      expect(queue.getSnapshot().version).toBe(1);
      queue.enqueue(move('2', { rank: 'a1', id: 'other' }));
      expect(queue.getSnapshot().version).toBe(2);
      expect(queue.getSnapshot().overlays.map((op) => op.id)).toEqual(['card', 'other']);
    });

    it('returns the same snapshot object until something changes', async () => {
      const { queue } = createHarness();
      queue.enqueue(toDoing());
      const snapshot = queue.getSnapshot();
      await flush();
      queue.reconcile();
      expect(queue.getSnapshot()).toBe(snapshot);
    });

    it('notifies subscribers until they unsubscribe', () => {
      const { queue } = createHarness();
      const listener = vi.fn();
      const unsubscribe = queue.subscribe(listener);
      queue.enqueue(toDoing('1'));
      expect(listener).toHaveBeenCalledTimes(1);
      unsubscribe();
      queue.enqueue(toDoing('2', 'a6'));
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('emits overlay, inflight and resolved in order', async () => {
      const harness = createHarness();
      harness.queue.enqueue(toDoing());
      expect(harness.log()).toEqual(['overlay:1']);
      await flush();
      expect(harness.log()).toEqual(['overlay:1', 'inflight:1']);
      await harness.resolve('1');
      expect(harness.log()).toEqual(['overlay:1', 'inflight:1', 'resolved:1']);
    });

    it('ignores a duplicate opId while the move is pending', async () => {
      const harness = createHarness();
      const op = toDoing();
      harness.queue.enqueue(op);
      harness.queue.enqueue({ ...op });
      await flush();
      expect(harness.calls).toEqual(['1']);
      expect(harness.queue.getSnapshot().version).toBe(1);
      expect(harness.log()).toEqual(['overlay:1', 'inflight:1']);
    });
  });

  describe('ordering', () => {
    it('never overlaps onMove calls for one item and keeps their order', async () => {
      let active = 0;
      let maxActive = 0;
      const order: string[] = [];
      const release = new Map<string, () => void>();
      const { queue } = createHarness({
        onMove: (op) => {
          active += 1;
          maxActive = Math.max(maxActive, active);
          order.push(op.opId);
          return new Promise<void>((resolve) => {
            release.set(op.opId, () => {
              active -= 1;
              resolve();
            });
          });
        },
      });
      queue.enqueue(toDoing('1', 'a5'));
      queue.enqueue(toDoing('2', 'a6'));
      queue.enqueue(toDoing('3', 'a7'));
      await flush();
      expect(order).toEqual(['1']);
      release.get('1')?.();
      await flush();
      expect(order).toEqual(['1', '2']);
      release.get('2')?.();
      await flush();
      release.get('3')?.();
      await flush();
      expect(order).toEqual(['1', '2', '3']);
      expect(maxActive).toBe(1);
    });

    it('runs moves of different items concurrently', async () => {
      const harness = createHarness();
      harness.queue.enqueue(toDoing('1'));
      harness.queue.enqueue(move('2', { rank: 'a3', id: 'other' }));
      await flush();
      expect(harness.calls).toEqual(['1', '2']);
      await harness.resolve('2');
      expect(harness.log()).toContain('resolved:2');
      expect(harness.log()).not.toContain('resolved:1');
    });

    it('does not hold up an item behind another item that fails', async () => {
      const harness = createHarness();
      harness.queue.enqueue(toDoing('1'));
      harness.queue.enqueue(move('2', { rank: 'a3', id: 'other' }));
      harness.queue.enqueue(move('3', { rank: 'a4', id: 'other' }));
      await flush();
      await harness.reject('1');
      await harness.resolve('2');
      expect(harness.calls).toEqual(['1', '2', '3']);
    });
  });

  describe('reflection in app data', () => {
    it('clears the overlay at once when app data already shows the move as onMove resolves', async () => {
      const harness = createHarness();
      const listener = vi.fn();
      harness.queue.subscribe(listener);
      harness.queue.enqueue(toDoing('1', 'a5'));
      await flush();
      harness.show('card', { rank: 'a5', fields: { status: 'doing' } });
      await harness.resolve('1');
      expect(harness.queue.getOverlay('card')).toBeNull();
      expect(harness.queue.getSnapshot().overlays).toEqual([]);
      expect(harness.events.at(-1)).toEqual({ type: 'cleared', itemId: 'card', opId: '1', reason: 'reflected' });
      expect(listener).toHaveBeenCalledTimes(2);
      expect(vi.getTimerCount()).toBe(0);
    });

    it('clears at resolve when a synchronous onMove updates app data', async () => {
      const harness = createHarness({
        onMove: (op) => {
          harness.show(op.id, { rank: op.rank, fields: { status: 'doing' } });
        },
      });
      harness.queue.enqueue(toDoing('1', 'a5'));
      await flush();
      expect(harness.queue.getOverlay('card')).toBeNull();
      expect(harness.log()).toEqual(['overlay:1', 'inflight:1', 'resolved:1', 'cleared:1:reflected']);
    });

    it('keeps the overlay after resolve until reconcile sees the move in app data', async () => {
      const harness = createHarness();
      harness.queue.enqueue(toDoing('1', 'a5'));
      await flush();
      await harness.resolve('1');
      expect(harness.queue.getOverlay('card')?.opId).toBe('1');

      harness.queue.reconcile();
      expect(harness.queue.getOverlay('card')?.opId).toBe('1');
      expect(harness.queue.getSnapshot().version).toBe(1);

      harness.show('card', { rank: 'a5', fields: { status: 'doing' } });
      expect(harness.queue.getOverlay('card')?.opId).toBe('1');
      harness.queue.reconcile();
      expect(harness.queue.getOverlay('card')).toBeNull();
      expect(harness.queue.getSnapshot().version).toBe(2);
      expect(harness.events.at(-1)).toEqual({ type: 'cleared', itemId: 'card', opId: '1', reason: 'reflected' });
    });

    it('treats matching fields with a rank the queue never saw as reflected (server-assigned rank)', async () => {
      const harness = createHarness();
      harness.queue.enqueue(toDoing('1', 'a5'));
      await flush();
      await harness.resolve('1');
      harness.show('card', { rank: 'server-rank-7', fields: { status: 'doing' } });
      harness.queue.reconcile();
      expect(harness.queue.getOverlay('card')).toBeNull();
      expect(harness.log().at(-1)).toBe('cleared:1:reflected');
    });

    it('does not treat app data still at the baseline rank as reflected', async () => {
      const harness = createHarness();
      harness.queue.enqueue(move('1', { rank: 'a5' }));
      await flush();
      await harness.resolve('1');
      harness.show('card', { rank: 'a0', fields: { status: 'todo' } });
      harness.queue.reconcile();
      expect(harness.queue.getOverlay('card')?.opId).toBe('1');
    });

    it('does not treat new fields at the baseline rank as reflected', async () => {
      const harness = createHarness();
      harness.queue.enqueue(toDoing('1', 'a5'));
      await flush();
      await harness.resolve('1');
      harness.show('card', { rank: 'a0', fields: { status: 'doing' } });
      harness.queue.reconcile();
      expect(harness.queue.getOverlay('card')?.opId).toBe('1');
    });

    it('does not treat the expected rank with old fields as reflected', async () => {
      const harness = createHarness();
      harness.queue.enqueue(toDoing('1', 'a5'));
      await flush();
      await harness.resolve('1');
      harness.show('card', { rank: 'a5', fields: { status: 'todo' } });
      harness.queue.reconcile();
      expect(harness.queue.getOverlay('card')?.opId).toBe('1');
    });

    it('matches a move into No value against a null field', async () => {
      const harness = createHarness();
      harness.queue.enqueue(move('1', { rank: 'a5', changes: { status: null }, from: { status: 'todo' } }));
      await flush();
      await harness.resolve('1');
      harness.show('card', { rank: 'a5', fields: { status: null } });
      harness.queue.reconcile();
      expect(harness.queue.getOverlay('card')).toBeNull();
    });

    it('accepts only the exact rank when the item was unknown at enqueue time', async () => {
      const harness = createHarness();
      harness.data.delete('card');
      harness.queue.enqueue(toDoing('1', 'a5'));
      await flush();
      await harness.resolve('1');
      harness.queue.reconcile();
      expect(harness.queue.getOverlay('card')?.opId).toBe('1');
      harness.show('card', { rank: 'other-rank', fields: { status: 'doing' } });
      harness.queue.reconcile();
      expect(harness.queue.getOverlay('card')?.opId).toBe('1');
      harness.show('card', { rank: 'a5', fields: { status: 'doing' } });
      harness.queue.reconcile();
      expect(harness.queue.getOverlay('card')).toBeNull();
    });

    it('does not retire a move that is still in flight, even when app data shows it', async () => {
      const harness = createHarness();
      harness.queue.enqueue(toDoing('1', 'a5'));
      await flush();
      harness.show('card', { rank: 'a5', fields: { status: 'doing' } });
      harness.queue.reconcile();
      expect(harness.queue.getOverlay('card')?.opId).toBe('1');
      await harness.resolve('1');
      expect(harness.queue.getOverlay('card')).toBeNull();
    });

    it('leaves other items alone when one item is reflected', async () => {
      const harness = createHarness();
      harness.queue.enqueue(toDoing('1', 'a5'));
      harness.queue.enqueue(move('2', { rank: 'a7', id: 'other' }));
      await flush();
      await harness.resolve('1');
      await harness.resolve('2');
      harness.show('card', { rank: 'a5', fields: { status: 'doing' } });
      harness.queue.reconcile();
      expect(harness.queue.getOverlay('card')).toBeNull();
      expect(harness.queue.getOverlay('other')?.opId).toBe('2');
    });
  });

  describe('chained moves of one item', () => {
    it('shows the net effect: composed changes, first from, newest rank and opId', () => {
      const { queue } = createHarness();
      queue.enqueue(toDoing('1', 'a5'));
      queue.enqueue(move('2', { rank: 'a6', changes: { status: 'done' }, from: { status: 'doing' } }));
      queue.enqueue(move('3', { rank: 'a7', changes: { assignee: 'bob' }, from: { assignee: 'alice' } }));
      expect(queue.getOverlay('card')).toEqual({
        opId: '3',
        id: 'card',
        changes: { status: 'done', assignee: 'bob' },
        from: { status: 'todo', assignee: 'alice' },
        rank: 'a7',
      });
      expect(queue.getSnapshot().overlays).toHaveLength(1);
    });

    it('keeps showing the new column when a same-cell reorder follows a column change', () => {
      const { queue } = createHarness();
      queue.enqueue(toDoing('1', 'a5'));
      queue.enqueue(move('2', { rank: 'a3' }));
      expect(queue.getOverlay('card')).toEqual({
        opId: '2',
        id: 'card',
        changes: { status: 'doing' },
        from: { status: 'todo' },
        rank: 'a3',
      });
    });

    it('retires only the first move when app data shows only the first', async () => {
      const harness = createHarness();
      harness.queue.enqueue(toDoing('1', 'a5'));
      harness.queue.enqueue(move('2', { rank: 'a6', changes: { status: 'done' }, from: { status: 'doing' } }));
      await flush();
      await harness.resolve('1');
      await harness.resolve('2');
      harness.show('card', { rank: 'a5', fields: { status: 'doing' } });
      harness.queue.reconcile();
      expect(harness.queue.getOverlay('card')).toEqual(
        move('2', { rank: 'a6', changes: { status: 'done' }, from: { status: 'doing' } }),
      );
      expect(harness.log()).not.toContain('cleared:1:reflected');
    });

    it('retires only the column change when app data shows it but not the reorder that followed', async () => {
      const harness = createHarness();
      harness.queue.enqueue(toDoing('1', 'a5'));
      harness.queue.enqueue(move('2', { rank: 'a3' }));
      await flush();
      await harness.resolve('1');
      await harness.resolve('2');
      harness.show('card', { rank: 'a5', fields: { status: 'doing' } });
      harness.queue.reconcile();
      expect(harness.queue.getOverlay('card')).toEqual(move('2', { rank: 'a3' }));
    });

    it('retires every move at once when app data shows the last one', async () => {
      const harness = createHarness();
      harness.queue.enqueue(toDoing('1', 'a5'));
      harness.queue.enqueue(move('2', { rank: 'a6', changes: { status: 'done' }, from: { status: 'doing' } }));
      await flush();
      await harness.resolve('1');
      await harness.resolve('2');
      harness.show('card', { rank: 'a6', fields: { status: 'done' } });
      harness.queue.reconcile();
      expect(harness.queue.getOverlay('card')).toBeNull();
      expect(harness.log().filter((entry) => entry.startsWith('cleared'))).toEqual(['cleared:2:reflected']);
    });

    it('retires the first move at its own resolve while the second is still in flight', async () => {
      const harness = createHarness();
      harness.queue.enqueue(toDoing('1', 'a5'));
      harness.queue.enqueue(move('2', { rank: 'a6', changes: { status: 'done' }, from: { status: 'doing' } }));
      await flush();
      harness.show('card', { rank: 'a5', fields: { status: 'doing' } });
      await harness.resolve('1');
      expect(harness.calls).toEqual(['1', '2']);
      expect(harness.queue.getOverlay('card')?.opId).toBe('2');
      expect(harness.queue.isPending('card')).toBe(true);
    });

    it('keeps a later rank-only move whose rank app data does not show yet, after the earlier move retired', async () => {
      const harness = createHarness();
      harness.queue.enqueue(toDoing('1', 'a5'));
      harness.queue.enqueue(move('2', { rank: 'a7' }));
      await flush();
      harness.show('card', { rank: 'a5', fields: { status: 'doing' } });
      await harness.resolve('1');
      expect(harness.queue.getOverlay('card')).toEqual(move('2', { rank: 'a7' }));
      await harness.resolve('2');
      expect(harness.queue.getOverlay('card')).toEqual(move('2', { rank: 'a7' }));
    });
  });

  describe('rejection', () => {
    it('drops the move, cancels later queued moves of the item and clears the overlay', async () => {
      const harness = createHarness();
      const error = new Error('server said no');
      harness.queue.enqueue(toDoing('1', 'a5'));
      harness.queue.enqueue(move('2', { rank: 'a6' }));
      harness.queue.enqueue(move('3', { rank: 'a7' }));
      await flush();
      const version = harness.queue.getSnapshot().version;
      await harness.reject('1', error);
      expect(harness.log()).toEqual([
        'overlay:1',
        'overlay:2',
        'overlay:3',
        'inflight:1',
        'cancelled:2',
        'cancelled:3',
        'rejected:1',
        'cleared:1:rejected',
      ]);
      expect(harness.events).toContainEqual({ type: 'rejected', op: toDoing('1', 'a5'), error });
      expect(harness.events).toContainEqual({
        type: 'cancelled',
        op: move('2', { rank: 'a6' }),
        reason: 'previous-rejected',
      });
      expect(harness.queue.getOverlay('card')).toBeNull();
      expect(harness.queue.isPending('card')).toBe(false);
      expect(harness.queue.getSnapshot().version).toBe(version + 1);
      await flush();
      expect(harness.calls).toEqual(['1']);
    });

    it('keeps earlier resolved moves that app data does not show yet', async () => {
      const harness = createHarness();
      harness.queue.enqueue(toDoing('1', 'a5'));
      harness.queue.enqueue(move('2', { rank: 'a6', changes: { status: 'done' }, from: { status: 'doing' } }));
      harness.queue.enqueue(move('3', { rank: 'a7' }));
      await flush();
      await harness.resolve('1');
      await harness.reject('2');
      expect(harness.log().slice(3)).toEqual(['inflight:1', 'resolved:1', 'inflight:2', 'cancelled:3', 'rejected:2']);
      expect(harness.queue.getOverlay('card')).toEqual(toDoing('1', 'a5'));
      expect(harness.calls).toEqual(['1', '2']);

      harness.show('card', { rank: 'a5', fields: { status: 'doing' } });
      harness.queue.reconcile();
      expect(harness.queue.getOverlay('card')).toBeNull();
      expect(harness.log().at(-1)).toBe('cleared:1:reflected');
    });

    it('treats a synchronous throw inside onMove as a rejection', async () => {
      const error = new Error('boom');
      const harness = createHarness({
        onMove: () => {
          throw error;
        },
      });
      harness.queue.enqueue(toDoing('1', 'a5'));
      expect(harness.queue.getOverlay('card')?.opId).toBe('1');
      await flush();
      expect(harness.queue.getOverlay('card')).toBeNull();
      expect(harness.events).toContainEqual({ type: 'rejected', op: toDoing('1', 'a5'), error });
      expect(harness.log().at(-1)).toBe('cleared:1:rejected');
    });

    it('does not affect other items', async () => {
      const harness = createHarness();
      harness.queue.enqueue(toDoing('1', 'a5'));
      harness.queue.enqueue(move('2', { rank: 'a7', id: 'other' }));
      await flush();
      await harness.reject('1');
      expect(harness.queue.getOverlay('other')?.opId).toBe('2');
      expect(harness.queue.isPending('other')).toBe(true);
    });

    it('runs a move enqueued after the rejection', async () => {
      const harness = createHarness();
      harness.queue.enqueue(toDoing('1', 'a5'));
      await flush();
      await harness.reject('1');
      harness.queue.enqueue(toDoing('2', 'a6'));
      await flush();
      expect(harness.calls).toEqual(['1', '2']);
      expect(harness.queue.getOverlay('card')?.opId).toBe('2');
    });
  });

  describe('synchronous onMove', () => {
    it('accepts an onMove that returns nothing', async () => {
      const onMove = vi.fn<MoveQueueOptions['onMove']>(() => undefined);
      const harness = createHarness({ onMove });
      harness.queue.enqueue(toDoing('1', 'a5'));
      await flush();
      expect(onMove).toHaveBeenCalledWith(toDoing('1', 'a5'), { signal: expect.any(AbortSignal) });
      expect(harness.log()).toEqual(['overlay:1', 'inflight:1', 'resolved:1']);
      expect(harness.queue.isPending('card')).toBe(false);
      expect(harness.queue.getOverlay('card')?.opId).toBe('1');
    });
  });

  describe('settle timeout', () => {
    it('drops a resolved overlay after 5000ms by default when app data never shows it', async () => {
      const harness = createHarness();
      const listener = vi.fn();
      harness.queue.subscribe(listener);
      harness.queue.enqueue(toDoing('1', 'a5'));
      await flush();
      await harness.resolve('1');
      await vi.advanceTimersByTimeAsync(4999);
      expect(harness.queue.getOverlay('card')?.opId).toBe('1');
      expect(listener).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(harness.queue.getOverlay('card')).toBeNull();
      expect(harness.events.at(-1)).toEqual({ type: 'cleared', itemId: 'card', opId: '1', reason: 'settle-timeout' });
      expect(listener).toHaveBeenCalledTimes(2);
    });

    it('honours a custom settleTimeoutMs', async () => {
      const harness = createHarness({ settleTimeoutMs: 250 });
      harness.queue.enqueue(toDoing('1', 'a5'));
      await flush();
      await harness.resolve('1');
      await vi.advanceTimersByTimeAsync(249);
      expect(harness.queue.getOverlay('card')?.opId).toBe('1');
      await vi.advanceTimersByTimeAsync(1);
      expect(harness.queue.getOverlay('card')).toBeNull();
    });

    it('never drops the overlay when settleTimeoutMs is 0', async () => {
      const harness = createHarness({ settleTimeoutMs: 0 });
      harness.queue.enqueue(toDoing('1', 'a5'));
      await flush();
      await harness.resolve('1');
      expect(vi.getTimerCount()).toBe(0);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(harness.queue.getOverlay('card')?.opId).toBe('1');
      expect(harness.log()).not.toContain('cleared:1:settle-timeout');
    });

    it('does not start while the move is in flight', async () => {
      const harness = createHarness();
      harness.queue.enqueue(toDoing('1', 'a5'));
      await flush();
      await vi.advanceTimersByTimeAsync(20_000);
      expect(harness.queue.getOverlay('card')?.opId).toBe('1');
      expect(harness.queue.isPending('card')).toBe(true);
      await harness.resolve('1');
      await vi.advanceTimersByTimeAsync(4999);
      expect(harness.queue.getOverlay('card')?.opId).toBe('1');
    });

    it('is cancelled once app data shows the move', async () => {
      const harness = createHarness();
      harness.queue.enqueue(toDoing('1', 'a5'));
      await flush();
      await harness.resolve('1');
      expect(vi.getTimerCount()).toBe(1);
      harness.show('card', { rank: 'a5', fields: { status: 'doing' } });
      harness.queue.reconcile();
      expect(vi.getTimerCount()).toBe(0);
      await vi.advanceTimersByTimeAsync(10_000);
      expect(harness.log().filter((entry) => entry.startsWith('cleared'))).toEqual(['cleared:1:reflected']);
    });

    it('retires only the moves up to the one that timed out', async () => {
      const harness = createHarness();
      harness.queue.enqueue(toDoing('1', 'a5'));
      harness.queue.enqueue(move('2', { rank: 'a6', changes: { status: 'done' }, from: { status: 'doing' } }));
      await flush();
      await harness.resolve('1');
      await vi.advanceTimersByTimeAsync(3000);
      await harness.resolve('2');
      await vi.advanceTimersByTimeAsync(2000);
      expect(harness.queue.getOverlay('card')).toEqual(
        move('2', { rank: 'a6', changes: { status: 'done' }, from: { status: 'doing' } }),
      );
      expect(harness.log()).not.toContain('cleared:1:settle-timeout');
      await vi.advanceTimersByTimeAsync(3000);
      expect(harness.queue.getOverlay('card')).toBeNull();
      expect(harness.log().at(-1)).toBe('cleared:2:settle-timeout');
    });
  });

  describe('isPending', () => {
    it('is true while a move is queued or in flight and false once all have resolved', async () => {
      const harness = createHarness();
      expect(harness.queue.isPending('card')).toBe(false);
      harness.queue.enqueue(toDoing('1', 'a5'));
      harness.queue.enqueue(move('2', { rank: 'a6' }));
      expect(harness.queue.isPending('card')).toBe(true);
      await flush();
      expect(harness.queue.isPending('card')).toBe(true);
      await harness.resolve('1');
      expect(harness.queue.isPending('card')).toBe(true);
      await harness.resolve('2');
      expect(harness.queue.isPending('card')).toBe(false);
      expect(harness.queue.getOverlay('card')).not.toBeNull();
      expect(harness.queue.isPending('other')).toBe(false);
    });
  });

  describe('in-flight timeout', () => {
    it('passes an abort signal to onMove', async () => {
      const harness = createHarness();
      const signals: AbortSignal[] = [];
      const queue = createMoveQueue({
        onMove: (_op, { signal }) => {
          signals.push(signal);
        },
        readItem: (itemId) => harness.data.get(itemId) ?? null,
      });
      queue.enqueue(toDoing('1', 'a5'));
      await flush();
      expect(signals).toHaveLength(1);
      expect(signals[0]?.aborted).toBe(false);
    });

    it('rejects with MoveTimeoutError after 30000ms by default and aborts the signal', async () => {
      let signal: AbortSignal | null = null;
      const harness = createHarness({
        onMove: (_op, context) => {
          signal = context.signal;
          return new Promise<void>(() => undefined);
        },
      });
      harness.queue.enqueue(toDoing('1', 'a5'));
      await vi.advanceTimersByTimeAsync(29_999);
      expect(harness.queue.isPending('card')).toBe(true);
      await vi.advanceTimersByTimeAsync(1);
      expect(harness.log()).toEqual(['overlay:1', 'inflight:1', 'rejected:1', 'cleared:1:rejected']);
      const rejected = harness.events.find((event) => event.type === 'rejected');
      expect(rejected?.type === 'rejected' && rejected.error).toBeInstanceOf(MoveTimeoutError);
      expect((signal as AbortSignal | null)?.aborted).toBe(true);
      expect(harness.queue.getOverlay('card')).toBeNull();
      expect(vi.getTimerCount()).toBe(0);
    });

    it('lets the next queued move of the item run after a timeout', async () => {
      const harness = createHarness({ inflightTimeoutMs: 1000 });
      harness.queue.enqueue(toDoing('1', 'a5'));
      await flush();
      await vi.advanceTimersByTimeAsync(1000);
      harness.queue.enqueue(toDoing('2', 'a6'));
      await flush();
      expect(harness.calls).toEqual(['1', '2']);
    });

    it('ignores a late resolve after the timeout', async () => {
      const harness = createHarness({ inflightTimeoutMs: 1000 });
      harness.queue.enqueue(toDoing('1', 'a5'));
      await flush();
      await vi.advanceTimersByTimeAsync(1000);
      const eventCount = harness.events.length;
      await harness.resolve('1');
      expect(harness.events).toHaveLength(eventCount);
    });

    it('never times out when inflightTimeoutMs is 0', async () => {
      const harness = createHarness({ inflightTimeoutMs: 0 });
      harness.queue.enqueue(toDoing('1', 'a5'));
      await vi.advanceTimersByTimeAsync(600_000);
      expect(harness.queue.isPending('card')).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    });

    it('aborts in-flight moves on dispose', async () => {
      let signal: AbortSignal | null = null;
      const harness = createHarness({
        onMove: (_op, context) => {
          signal = context.signal;
          return new Promise<void>(() => undefined);
        },
      });
      harness.queue.enqueue(toDoing('1', 'a5'));
      await flush();
      harness.queue.dispose();
      expect((signal as AbortSignal | null)?.aborted).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  describe('dispose', () => {
    it('stops timers, listeners and further work', async () => {
      const harness = createHarness();
      const listener = vi.fn();
      harness.queue.subscribe(listener);
      harness.queue.enqueue(toDoing('1', 'a5'));
      harness.queue.enqueue(move('2', { rank: 'a7', id: 'other' }));
      await flush();
      await harness.resolve('1');
      // The settle timer of '1' and the in-flight timer of '2'.
      expect(vi.getTimerCount()).toBe(2);
      const eventCount = harness.events.length;
      const listenerCalls = listener.mock.calls.length;

      harness.queue.dispose();
      expect(vi.getTimerCount()).toBe(0);
      expect(harness.queue.getOverlay('card')).toBeNull();
      expect(harness.queue.isPending('other')).toBe(false);

      await harness.resolve('2');
      harness.queue.enqueue(toDoing('3', 'a8'));
      harness.show('card', { rank: 'a5', fields: { status: 'doing' } });
      harness.queue.reconcile();
      await vi.advanceTimersByTimeAsync(10_000);

      expect(harness.calls).toEqual(['1', '2']);
      expect(harness.events).toHaveLength(eventCount);
      expect(listener).toHaveBeenCalledTimes(listenerCalls);
      expect(harness.queue.getOverlay('card')).toBeNull();
    });

    it('ignores a rejection that arrives after dispose', async () => {
      const harness = createHarness();
      harness.queue.enqueue(toDoing('1', 'a5'));
      await flush();
      const eventCount = harness.events.length;
      harness.queue.dispose();
      await harness.reject('1');
      expect(harness.events).toHaveLength(eventCount);
    });
  });

  describe('with planMove, projectBoard and readItemSnapshot', () => {
    interface Card {
      id: string;
      rank: string;
      status: string;
    }

    const groupBy: GroupBy<Card> = {
      columns: {
        key: 'status',
        values: [
          { id: 'todo', label: 'To do' },
          { id: 'doing', label: 'Doing' },
        ],
      },
    };
    const getRank = (card: Card) => card.rank;
    const setRank = (card: Card, rank: string): Card => ({ ...card, rank });
    const doing = cellId('_', 'doing');

    it('keeps a card reordered after a column change in the new column until app data catches up', async () => {
      let items: Card[] = [
        { id: 'a', rank: 'a0', status: 'todo' },
        { id: 'b', rank: 'a1', status: 'doing' },
        { id: 'c', rank: 'a2', status: 'doing' },
      ];
      const release = new Map<string, () => void>();
      const queue = createMoveQueue({
        onMove: (op) =>
          new Promise<void>((resolve) => {
            release.set(op.opId, resolve);
          }),
        readItem: (itemId) => {
          const item = items.find((each) => each.id === itemId);
          return item ? readItemSnapshot(item, groupBy, getRank) : null;
        },
      });
      const board = () =>
        projectBoard({ items, getItemId: (card) => card.id, getRank, groupBy, overlays: queue.getSnapshot().overlays });
      const plan = (toIndex: number) => {
        const item = items[0];
        if (!item) throw new Error('fixture');
        const op = planMove({
          model: board(),
          groupBy,
          item,
          itemId: 'a',
          toCellId: doing,
          toIndex,
          overlay: queue.getOverlay('a'),
        });
        if (!op) throw new Error('expected a move');
        return op;
      };
      const apply = (op: MoveOperation) => {
        items = items.map((each) => (each.id === op.id ? applyMove(each, op, groupBy, setRank) : each));
      };

      const first = plan(0);
      queue.enqueue(first);
      expect(board().locations.get('a')).toEqual({ cellId: doing, index: 0 });

      const second = plan(2);
      expect(second.changes).toEqual({});
      expect(second.from).toEqual({});
      queue.enqueue(second);
      expect(board().locations.get('a')).toEqual({ cellId: doing, index: 2 });
      expect(queue.getOverlay('a')).toMatchObject({
        opId: second.opId,
        changes: { status: 'doing' },
        rank: second.rank,
      });

      await flush();
      apply(first);
      release.get(first.opId)?.();
      await flush();
      expect(queue.getOverlay('a')?.opId).toBe(second.opId);
      expect(board().locations.get('a')).toEqual({ cellId: doing, index: 2 });

      apply(second);
      release.get(second.opId)?.();
      await flush();
      expect(queue.getOverlay('a')).toBeNull();
      expect(board().locations.get('a')).toEqual({ cellId: doing, index: 2 });
      queue.dispose();
    });
  });
});
