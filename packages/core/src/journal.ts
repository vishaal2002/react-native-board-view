import type { BoardModel, MoveSource } from './types';

/** Where a card stood: its cell and its effective rank there. */
export interface JournalPlace {
  readonly cellId: string;
  readonly rank: string;
}

/**
 * One change to the board. Ids and ranks only, never item content, so a
 * journal is safe to keep and small to send.
 *
 * - `from: null`: the card arrived (created, or loaded into the board).
 * - `to: null`: the card left (deleted, or filtered out by the app).
 */
export interface JournalEntry {
  /** Unique in the journal. */
  readonly id: string;
  /** When it happened, in ms since the epoch. */
  readonly at: number;
  readonly itemId: string;
  readonly from: JournalPlace | null;
  readonly to: JournalPlace | null;
  /** False: this board made the move. True: `items` showed it by itself (a teammate, a sync). */
  readonly observed: boolean;
  /** Local moves: what started it. */
  readonly source?: MoveSource;
  /** Local moves: the op `onMove` received. */
  readonly opId?: string;
  /** Cards that moved together share this. */
  readonly batchId?: string;
  /** Who moved it, when the app says (`actor`, `getActor`). */
  readonly actor?: string;
  /** `context.origin` of the command that made it: "proposal", "shortcut", an agent's name. */
  readonly origin?: string;
}

/** A journal saved with `serializeJournal`. */
export interface SerializedJournal {
  readonly version: 1;
  readonly entries: readonly JournalEntry[];
}

export interface Journal {
  /** Oldest first. A new array after every change, so it can feed `useSyncExternalStore`. */
  entries(): readonly JournalEntry[];
  /** Adds entries at the end, dropping the oldest past the limit. */
  append(entries: readonly JournalEntry[]): void;
  /** Takes out the entries of one op: a move that rolled back never happened. */
  removeOp(opId: string): void;
  /** Replaces everything, such as with a journal loaded from storage. */
  reset(entries: readonly JournalEntry[]): void;
  readonly limit: number;
  subscribe(listener: () => void): () => void;
}

export interface JournalOptions {
  /** Entries kept; the oldest go first. Default 1000. */
  limit?: number;
  /** Entries to start from, such as `restoreJournal(saved)`. */
  entries?: readonly JournalEntry[];
}

export const DEFAULT_JOURNAL_LIMIT = 1000;

/** A bounded, subscribable log of board changes. */
export function createJournal(options: JournalOptions = {}): Journal {
  const limit = Math.max(1, Math.floor(options.limit ?? DEFAULT_JOURNAL_LIMIT));
  let list: readonly JournalEntry[] = (options.entries ?? []).slice(-limit);
  const listeners = new Set<() => void>();
  const publish = (next: readonly JournalEntry[]) => {
    list = next;
    for (const listener of listeners) listener();
  };
  return {
    entries: () => list,
    append(entries) {
      if (entries.length === 0) return;
      const next = list.concat(entries);
      publish(next.length > limit ? next.slice(next.length - limit) : next);
    },
    removeOp(opId) {
      if (!list.some((entry) => entry.opId === opId)) return;
      publish(list.filter((entry) => entry.opId !== opId));
    },
    reset(entries) {
      publish(entries.slice(-limit));
    },
    limit,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

let entryCounter = 0;

/** A journal entry id. Unique per process, like op ids. */
export function createEntryId(): string {
  entryCounter += 1;
  return `je_${Date.now().toString(36)}_${entryCounter.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Plain JSON for storage. The app decides where it goes. */
export function serializeJournal(entries: readonly JournalEntry[]): string {
  const saved: SerializedJournal = { version: 1, entries };
  return JSON.stringify(saved);
}

function isPlace(value: unknown): value is JournalPlace | null {
  if (value === null) return true;
  if (typeof value !== 'object') return false;
  const place = value as Record<string, unknown>;
  return typeof place.cellId === 'string' && typeof place.rank === 'string';
}

function isEntry(value: unknown): value is JournalEntry {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.id === 'string' &&
    typeof entry.at === 'number' &&
    Number.isFinite(entry.at) &&
    typeof entry.itemId === 'string' &&
    typeof entry.observed === 'boolean' &&
    isPlace(entry.from) &&
    isPlace(entry.to) &&
    (entry.from !== null || entry.to !== null)
  );
}

/**
 * Reads a saved journal back. Entries that do not parse are dropped, the
 * rest are sorted by time. Anything unreadable gives an empty journal.
 */
export function restoreJournal(saved: string | SerializedJournal | null | undefined): JournalEntry[] {
  if (saved == null) return [];
  let value: unknown = saved;
  if (typeof saved === 'string') {
    try {
      value = JSON.parse(saved);
    } catch {
      return [];
    }
  }
  const entries = (value as { entries?: unknown } | null)?.entries;
  if (!Array.isArray(entries)) return [];
  return entries.filter(isEntry).sort((a, b) => a.at - b.at);
}

/** Where every card is in a board, from its model: cell and effective rank. */
export function placesOf<T>(model: BoardModel<T>): Map<string, JournalPlace> {
  const places = new Map<string, JournalPlace>();
  for (const cell of model.cells) {
    for (const ref of cell.ranked) places.set(ref.id, { cellId: cell.cellId, rank: ref.rank });
  }
  return places;
}

/**
 * The board after the first `position` entries: today's places with every
 * later entry undone, newest first. `position` runs from 0 (before the
 * first entry) to `entries.length` (now). Cards that arrived later are
 * absent; cards that left later come back only if the app still has them.
 */
export function placesAt(
  entries: readonly JournalEntry[],
  now: ReadonlyMap<string, JournalPlace>,
  position: number,
): Map<string, JournalPlace> {
  const places = new Map(now);
  const stop = Math.max(0, Math.min(entries.length, Math.floor(position)));
  for (let index = entries.length - 1; index >= stop; index -= 1) {
    const entry = entries[index]!;
    if (entry.from) places.set(entry.itemId, entry.from);
    else places.delete(entry.itemId);
  }
  return places;
}

/** The position (entries applied) of the board at time `at`: every entry up to and including it. */
export function positionAt(entries: readonly JournalEntry[], at: number): number {
  let low = 0;
  let high = entries.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (entries[middle]!.at <= at) low = middle + 1;
    else high = middle;
  }
  return low;
}

/**
 * Journal entries for what changed between two boards, for the cards
 * `include` accepts: a new cell, a new rank, a card that arrived or left.
 * Only cells the projection rebuilt are read, so an unchanged board costs
 * nothing beyond the cells that changed.
 */
export function diffBoards<T>(
  before: BoardModel<T>,
  after: BoardModel<T>,
  include: (itemId: string) => boolean,
  stamp: { at: number; actor?: (itemId: string) => string | undefined },
): JournalEntry[] {
  if (before === after) return [];
  const entries: JournalEntry[] = [];
  const seen = new Set<string>();
  const rankIn = (model: BoardModel<T>, itemId: string): JournalPlace | null => {
    const location = model.locations.get(itemId);
    if (!location) return null;
    const ref = model.cellById.get(location.cellId)?.ranked[location.index];
    return ref ? { cellId: location.cellId, rank: ref.rank } : null;
  };
  const push = (itemId: string, from: JournalPlace | null, to: JournalPlace | null) => {
    if (!include(itemId)) return;
    const actor = stamp.actor?.(itemId);
    const entry: JournalEntry = { id: createEntryId(), at: stamp.at, itemId, from, to, observed: true };
    entries.push(actor ? { ...entry, actor } : entry);
  };
  for (const cell of after.cells) {
    const old = before.cellById.get(cell.cellId);
    if (old === cell) continue;
    for (const ref of cell.ranked) {
      seen.add(ref.id);
      const from = rankIn(before, ref.id);
      if (from && from.cellId === cell.cellId && from.rank === ref.rank) continue;
      push(ref.id, from, { cellId: cell.cellId, rank: ref.rank });
    }
    // Cards that left this cell and are nowhere on the new board.
    for (const ref of old?.ranked ?? []) {
      if (seen.has(ref.id) || after.locations.has(ref.id)) continue;
      seen.add(ref.id);
      push(ref.id, { cellId: cell.cellId, rank: ref.rank }, null);
    }
  }
  // A cell that went away (a column removed) takes its cards with it.
  for (const cell of before.cells) {
    if (after.cellById.has(cell.cellId)) continue;
    for (const ref of cell.ranked) {
      if (seen.has(ref.id) || after.locations.has(ref.id)) continue;
      seen.add(ref.id);
      push(ref.id, { cellId: cell.cellId, rank: ref.rank }, null);
    }
  }
  return entries;
}
