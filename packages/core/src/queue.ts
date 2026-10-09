import type { ItemMoveSnapshot, MoveOperation } from './types';

export type MoveQueueEvent =
  | { type: 'overlay'; op: MoveOperation }
  | { type: 'inflight'; op: MoveOperation }
  | { type: 'resolved'; op: MoveOperation }
  | { type: 'rejected'; op: MoveOperation; error: unknown }
  | { type: 'cancelled'; op: MoveOperation; reason: 'previous-rejected' }
  | { type: 'cleared'; itemId: string; opId: string };

interface PendingOp {
  op: MoveOperation;
  state: 'queued' | 'inflight' | 'resolved' | 'rejected' | 'cancelled';
}

export interface MoveQueueSnapshot {
  readonly version: number;
  readonly overlays: readonly MoveOperation[];
}

export interface MoveQueue {
  enqueue(op: MoveOperation): void;
  /**
   * Drop overlays whose resolved move is now visible on the item.
   * Call this when `items` changes. Do not call it from inside `onMove`
   * before the items you pass actually contain the move.
   */
  reconcile(getSnapshot: (itemId: string) => ItemMoveSnapshot | null): void;
  getOverlay(itemId: string): MoveOperation | null;
  getSnapshot(): MoveQueueSnapshot;
  subscribe(listener: () => void): () => void;
}

export interface MoveQueueOptions {
  onMove: (op: MoveOperation) => void | Promise<void>;
  onEvent?: (event: MoveQueueEvent) => void;
}

function matches(snapshot: ItemMoveSnapshot, op: MoveOperation): boolean {
  if (snapshot.rank !== op.rank) return false;
  const keys = Object.keys(op.changes);
  for (const key of keys) {
    const expected = op.changes[key] ?? null;
    const actual = snapshot.fields[key] ?? null;
    if (actual !== expected) return false;
  }
  return true;
}

function isActive(entry: PendingOp): boolean {
  return entry.state === 'queued' || entry.state === 'inflight' || entry.state === 'resolved';
}

/**
 * Per-item move queue. The overlay updates synchronously inside `enqueue`.
 * `onMove` calls for one item never overlap. A rejection cancels later
 * queued moves for that item and removes the overlay, so the card falls
 * back to application data.
 */
export function createMoveQueue(options: MoveQueueOptions): MoveQueue {
  const lanes = new Map<string, PendingOp[]>();
  const tails = new Map<string, Promise<void>>();
  const listeners = new Set<() => void>();
  let snapshot: MoveQueueSnapshot = { version: 0, overlays: [] };

  function overlaysNow(): MoveOperation[] {
    const list: MoveOperation[] = [];
    for (const entries of lanes.values()) {
      let latest: PendingOp | null = null;
      for (const entry of entries) {
        if (isActive(entry)) latest = entry;
      }
      if (latest) list.push(latest.op);
    }
    return list;
  }

  function publish(): void {
    snapshot = { version: snapshot.version + 1, overlays: overlaysNow() };
    for (const listener of listeners) listener();
  }

  function emit(event: MoveQueueEvent): void {
    options.onEvent?.(event);
  }

  function clearItem(itemId: string, opId: string): void {
    lanes.delete(itemId);
    emit({ type: 'cleared', itemId, opId });
  }

  async function run(op: MoveOperation): Promise<void> {
    const list = lanes.get(op.id);
    const entry = list?.find((item) => item.op.opId === op.opId);
    if (!entry || entry.state === 'cancelled' || entry.state === 'rejected') return;
    entry.state = 'inflight';
    emit({ type: 'inflight', op });
    publish();
    try {
      await options.onMove(op);
      const current = lanes.get(op.id)?.find((item) => item.op.opId === op.opId);
      if (!current || current.state === 'cancelled') return;
      current.state = 'resolved';
      emit({ type: 'resolved', op });
      publish();
    } catch (error) {
      const currentList = lanes.get(op.id) ?? [];
      const current = currentList.find((item) => item.op.opId === op.opId);
      if (current && current.state !== 'cancelled') current.state = 'rejected';
      for (const later of currentList) {
        if (later.op.opId === op.opId) continue;
        if (later.state === 'queued') {
          later.state = 'cancelled';
          emit({ type: 'cancelled', op: later.op, reason: 'previous-rejected' });
        }
      }
      emit({ type: 'rejected', op, error });
      if (lanes.has(op.id)) clearItem(op.id, op.opId);
      publish();
    }
  }

  return {
    enqueue(op) {
      const list = lanes.get(op.id) ?? [];
      if (list.some((entry) => entry.op.opId === op.opId && isActive(entry))) return;
      list.push({ op, state: 'queued' });
      lanes.set(op.id, list);
      emit({ type: 'overlay', op });
      publish();
      const prev = tails.get(op.id) ?? Promise.resolve();
      const next = prev.then(() => run(op));
      tails.set(
        op.id,
        next.then(
          () => undefined,
          () => undefined,
        ),
      );
    },
    reconcile(getSnapshot) {
      let changed = false;
      for (const [itemId, list] of lanes) {
        const snap = getSnapshot(itemId);
        if (!snap) continue;
        let latest: PendingOp | null = null;
        for (const entry of list) {
          if (isActive(entry)) latest = entry;
        }
        if (!latest) {
          lanes.delete(itemId);
          changed = true;
          continue;
        }
        if (latest.state === 'resolved' && matches(snap, latest.op)) {
          lanes.delete(itemId);
          emit({ type: 'cleared', itemId, opId: latest.op.opId });
          changed = true;
          continue;
        }
        const kept = list.filter((entry) => {
          if (entry === latest) return true;
          if (entry.state === 'resolved') return false;
          return entry.state === 'queued' || entry.state === 'inflight';
        });
        if (kept.length !== list.length) {
          lanes.set(itemId, kept);
          changed = true;
        }
      }
      if (changed) publish();
    },
    getOverlay(itemId) {
      const list = lanes.get(itemId);
      if (!list) return null;
      let latest: PendingOp | null = null;
      for (const entry of list) {
        if (isActive(entry)) latest = entry;
      }
      return latest?.op ?? null;
    },
    getSnapshot() {
      return snapshot;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
