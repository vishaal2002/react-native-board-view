import type { ItemMoveSnapshot, MoveOperation } from './types';

export type OverlayClearReason = 'reflected' | 'settle-timeout' | 'rejected';

export type MoveQueueEvent =
  | { type: 'overlay'; op: MoveOperation }
  | { type: 'inflight'; op: MoveOperation }
  | { type: 'resolved'; op: MoveOperation }
  | { type: 'rejected'; op: MoveOperation; error: unknown }
  | { type: 'cancelled'; op: MoveOperation; reason: 'previous-rejected' }
  | { type: 'cleared'; itemId: string; opId: string; reason: OverlayClearReason };

interface Entry {
  op: MoveOperation;
  state: 'queued' | 'inflight' | 'resolved';
  /** The app's record when the move was queued. Null when the item was unknown. */
  baseline: ItemMoveSnapshot | null;
  settleTimer: ReturnType<typeof setTimeout> | null;
}

export interface MoveQueueSnapshot {
  readonly version: number;
  /**
   * One overlay per item with pending moves: the net effect of all of them.
   * `changes` and `from` merge every pending move in order; `rank` and `opId`
   * come from the newest.
   */
  readonly overlays: readonly MoveOperation[];
}

export interface MoveQueue {
  /** Shows the overlay synchronously, then calls `onMove` once earlier moves of the same item settle. */
  enqueue(op: MoveOperation): void;
  /** Re-checks resolved moves against app data. Call whenever `items` changes. */
  reconcile(): void;
  /** Net pending state of an item, or null. */
  getOverlay(itemId: string): MoveOperation | null;
  /** True while any move of this item is queued or in flight. */
  isPending(itemId: string): boolean;
  getSnapshot(): MoveQueueSnapshot;
  subscribe(listener: () => void): () => void;
  /** Clears timers and listeners. The queue must not be used afterwards. */
  dispose(): void;
}

export interface MoveQueueOptions {
  onMove: (op: MoveOperation) => void | Promise<void>;
  /**
   * Reads the app's current record of an item. The queue never trusts
   * `setState` timing: an overlay is removed only when this reader shows the
   * move, or when the settle timeout runs out.
   */
  readItem: (itemId: string) => ItemMoveSnapshot | null;
  onEvent?: (event: MoveQueueEvent) => void;
  /**
   * After `onMove` resolves, how long to wait for app data to show the move
   * before the overlay is dropped anyway. App data is the source of truth, so
   * a server that stores its own rank, or an app that resolves without
   * updating, cannot leave a stale overlay behind. Default 5000. 0 disables.
   */
  settleTimeoutMs?: number;
}

const DEFAULT_SETTLE_TIMEOUT_MS = 5000;

/** Net effect of `entries[0..through]`. */
function compose(entries: readonly Entry[], through: number): MoveOperation | null {
  const last = entries[through];
  if (!last) return null;
  const changes: Record<string, string | null> = {};
  const from: Record<string, string | null> = {};
  for (const entry of entries.slice(0, through + 1)) {
    for (const [key, value] of Object.entries(entry.op.changes)) {
      if (!Object.hasOwn(from, key)) from[key] = entry.op.from[key] ?? null;
      changes[key] = value;
    }
  }
  return { opId: last.op.opId, id: last.op.id, changes, from, rank: last.op.rank };
}

/**
 * App data shows the moves up to an entry when every grouped field matches
 * their net changes and the rank is the one we sent, or one the app chose
 * itself (never seen by the queue, e.g. assigned by the server). A baseline
 * rank or another pending move's rank means the app is not there yet.
 */
function reflects(snapshot: ItemMoveSnapshot, expected: MoveOperation, known: ReadonlySet<string> | null): boolean {
  for (const [key, value] of Object.entries(expected.changes)) {
    if ((snapshot.fields[key] ?? null) !== value) return false;
  }
  return snapshot.rank === expected.rank || (known != null && !known.has(snapshot.rank));
}

/**
 * Every rank the queue has seen for an item since its first pending move:
 * baselines and the ranks of all moves, retired ones included. Null when no
 * baseline was ever read.
 */
interface RankHistory {
  ranks: Set<string>;
  hasBaseline: boolean;
}

function record(history: RankHistory, entry: Entry): void {
  if (entry.baseline) {
    history.hasBaseline = true;
    history.ranks.add(entry.baseline.rank);
  }
  history.ranks.add(entry.op.rank);
}

/**
 * Per-item optimistic move queue.
 *
 * - The overlay updates inside `enqueue`, before `onMove` runs.
 * - `onMove` calls for one item never overlap. Moves of different items run independently.
 * - A rejection drops that move and cancels the item's later queued moves.
 *   Earlier resolved moves keep their overlay until app data shows them.
 */
export function createMoveQueue(options: MoveQueueOptions): MoveQueue {
  const settleTimeoutMs = options.settleTimeoutMs ?? DEFAULT_SETTLE_TIMEOUT_MS;
  const entriesByItem = new Map<string, Entry[]>();
  // Kept until the item has no pending moves at all, so a retired move's rank
  // is never mistaken for a rank the server chose.
  const history = new Map<string, RankHistory>();
  const tails = new Map<string, Promise<void>>();
  const listeners = new Set<() => void>();
  let snapshot: MoveQueueSnapshot = { version: 0, overlays: [] };
  let disposed = false;

  function overlayOf(itemId: string): MoveOperation | null {
    const entries = entriesByItem.get(itemId);
    return entries ? compose(entries, entries.length - 1) : null;
  }

  function publish(): void {
    const overlays: MoveOperation[] = [];
    for (const itemId of entriesByItem.keys()) {
      const overlay = overlayOf(itemId);
      if (overlay) overlays.push(overlay);
    }
    snapshot = { version: snapshot.version + 1, overlays };
    for (const listener of listeners) listener();
  }

  function emit(event: MoveQueueEvent): void {
    options.onEvent?.(event);
  }

  function stopTimer(entry: Entry): void {
    if (entry.settleTimer != null) {
      clearTimeout(entry.settleTimer);
      entry.settleTimer = null;
    }
  }

  /** Removes `entries[0..through]` and reports the item as cleared when nothing is left. */
  function retire(itemId: string, through: number, reason: OverlayClearReason): void {
    const entries = entriesByItem.get(itemId);
    if (!entries) return;
    const done = entries.slice(0, through + 1);
    const remaining = entries.slice(through + 1);
    for (const entry of done) stopTimer(entry);
    if (remaining.length > 0) {
      entriesByItem.set(itemId, remaining);
      return;
    }
    entriesByItem.delete(itemId);
    history.delete(itemId);
    const last = done.at(-1);
    if (last) emit({ type: 'cleared', itemId, opId: last.op.opId, reason });
  }

  /** Retires every resolved move the app data already shows. Returns true when anything changed. */
  function settle(itemId: string): boolean {
    const entries = entriesByItem.get(itemId);
    if (!entries) return false;
    const current = options.readItem(itemId);
    if (!current) return false;
    const seen = history.get(itemId);
    const known = seen?.hasBaseline ? seen.ranks : null;
    let through = -1;
    entries.forEach((entry, index) => {
      if (entry.state !== 'resolved') return;
      const expected = compose(entries, index);
      if (expected && reflects(current, expected, known)) through = index;
    });
    if (through < 0) return false;
    retire(itemId, through, 'reflected');
    return true;
  }

  function startSettleTimer(entry: Entry): void {
    if (settleTimeoutMs <= 0) return;
    entry.settleTimer = setTimeout(() => {
      entry.settleTimer = null;
      const entries = entriesByItem.get(entry.op.id);
      const index = entries ? entries.indexOf(entry) : -1;
      if (disposed || index < 0) return;
      retire(entry.op.id, index, 'settle-timeout');
      publish();
    }, settleTimeoutMs);
  }

  function reject(entry: Entry, error: unknown): void {
    const itemId = entry.op.id;
    const entries = entriesByItem.get(itemId) ?? [];
    const index = entries.indexOf(entry);
    const kept = entries.slice(0, Math.max(0, index));
    for (const later of entries.slice(index + 1)) {
      emit({ type: 'cancelled', op: later.op, reason: 'previous-rejected' });
    }
    emit({ type: 'rejected', op: entry.op, error });
    if (kept.length > 0) {
      entriesByItem.set(itemId, kept);
    } else {
      entriesByItem.delete(itemId);
      history.delete(itemId);
      emit({ type: 'cleared', itemId, opId: entry.op.opId, reason: 'rejected' });
    }
  }

  async function run(entry: Entry): Promise<void> {
    if (disposed || !entriesByItem.get(entry.op.id)?.includes(entry)) return;
    entry.state = 'inflight';
    emit({ type: 'inflight', op: entry.op });
    try {
      await options.onMove(entry.op);
    } catch (error) {
      if (disposed || !entriesByItem.get(entry.op.id)?.includes(entry)) return;
      reject(entry, error);
      publish();
      return;
    }
    if (disposed || !entriesByItem.get(entry.op.id)?.includes(entry)) return;
    entry.state = 'resolved';
    emit({ type: 'resolved', op: entry.op });
    // The app may have applied the move before resolving. Check now instead
    // of waiting for the next items change, which may never come.
    if (settle(entry.op.id)) {
      publish();
      return;
    }
    startSettleTimer(entry);
  }

  return {
    enqueue(op) {
      if (disposed) return;
      const entries = entriesByItem.get(op.id) ?? [];
      if (entries.some((entry) => entry.op.opId === op.opId)) return;
      const entry: Entry = { op, state: 'queued', baseline: options.readItem(op.id), settleTimer: null };
      entries.push(entry);
      entriesByItem.set(op.id, entries);
      const seen = history.get(op.id) ?? { ranks: new Set<string>(), hasBaseline: false };
      record(seen, entry);
      history.set(op.id, seen);
      emit({ type: 'overlay', op });
      publish();
      const previous = tails.get(op.id) ?? Promise.resolve();
      const tail = previous
        .then(() => run(entry))
        .then(
          () => undefined,
          () => undefined,
        );
      tails.set(op.id, tail);
      void tail.then(() => {
        if (tails.get(op.id) === tail) tails.delete(op.id);
      });
    },
    reconcile() {
      if (disposed) return;
      let changed = false;
      for (const itemId of [...entriesByItem.keys()]) {
        if (settle(itemId)) changed = true;
      }
      if (changed) publish();
    },
    getOverlay: overlayOf,
    isPending(itemId) {
      return entriesByItem.get(itemId)?.some((entry) => entry.state !== 'resolved') ?? false;
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
    dispose() {
      disposed = true;
      for (const entries of entriesByItem.values()) for (const entry of entries) stopTimer(entry);
      entriesByItem.clear();
      history.clear();
      tails.clear();
      listeners.clear();
    },
  };
}
