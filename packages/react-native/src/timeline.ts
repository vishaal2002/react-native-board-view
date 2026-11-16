import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  NO_LANE_ID,
  NO_VALUE_ID,
  boardFlow,
  createEntryId,
  createJournal,
  diffBoards,
  parseCellId,
  placesAt,
  placesOf,
  positionAt,
  restoreJournal,
  serializeJournal,
  type BoardFlow,
  type BoardModel,
  type FlowOptions,
  type GroupBy,
  type Journal,
  type JournalEntry,
  type JournalPlace,
  type MoveOperation,
  type SerializedJournal,
} from 'board-view-core';
import type { CommittedMove } from './session';
import { createValueStore, type ValueStore } from './store';

/**
 * - `past`: the board draws itself as it was at `position`, read-only.
 * - `diff`: the board stays live and marks every card that moved since `position`.
 */
export type TimelineMode = 'past' | 'diff';

export interface TimelineView {
  /** Entries applied to the board shown: 0 is before the first, null is live. */
  readonly position: number | null;
  readonly mode: TimelineMode;
  readonly playing: boolean;
}

export interface BoardTimelineOptions<T> {
  /** Entries kept; the oldest go first. Default 1000. */
  limit?: number;
  /** A journal saved with `timeline.serialize()`, read once when the hook mounts. */
  initial?: string | SerializedJournal | readonly JournalEntry[] | null;
  /** Who this user is, written on the moves this board makes. */
  actor?: string;
  /** Who moved a card that `items` moved by itself, such as `item.updatedBy`. */
  getActor?: (item: T) => string | null | undefined;
  /** The journal changed: a good place to save `serialize()`. Not called for the initial journal. */
  onChange?: (entries: readonly JournalEntry[]) => void;
}

/** The parts the board reads: stable for the life of the hook. */
export interface TimelineCore {
  readonly journal: Journal;
  readonly view: ValueStore<TimelineView>;
  readonly options: { current: BoardTimelineOptions<unknown> };
}

export interface BoardTimeline extends TimelineView {
  /** Oldest first. */
  readonly entries: readonly JournalEntry[];
  /** Time of the newest entry the board shows, or null when live or before the first. */
  readonly at: number | null;
  /**
   * Positions worth stopping at: 0, the end of each change (entries made
   * together share a time), and `entries.length`.
   */
  readonly steps: readonly number[];
  /** Shows the board after `position` entries. At the end, or null, the board is live again. */
  seek(position: number | null, mode?: TimelineMode): void;
  /** Shows the board as it was at a time. */
  seekTime(at: number, mode?: TimelineMode): void;
  /** One step back (negative) or forward through `steps`. */
  step(delta: number): void;
  /** Plays the changes from `from` (default: where it is, or the start) to now. */
  play(options?: { from?: number; stepMs?: number }): void;
  pause(): void;
  /** Back to the present. */
  live(): void;
  /** Plain JSON for storage: pass it back as `initial`. */
  serialize(): string;
  /** Forgets every entry. */
  clear(): void;
  /** For `<Board timeline={…}>`. */
  readonly core: TimelineCore;
}

const LIVE: TimelineView = { position: null, mode: 'past', playing: false };
const DEFAULT_STEP_MS = 700;

function initialEntries(initial: BoardTimelineOptions<unknown>['initial']): readonly JournalEntry[] {
  if (initial == null) return [];
  if (Array.isArray(initial)) return initial as readonly JournalEntry[];
  return restoreJournal(initial as string | SerializedJournal);
}

/** The step closest to a position: a change is one stop, however many cards it moved. Ties go to the earlier step. */
export function nearestStep(steps: readonly number[], wanted: number): number {
  let best = steps[0] ?? 0;
  for (const value of steps) if (Math.abs(value - wanted) < Math.abs(best - wanted)) best = value;
  return best;
}

/** Positions at the end of each change, plus the start and the end. */
export function stepsOf(entries: readonly JournalEntry[]): number[] {
  const steps = [0];
  for (let index = 1; index < entries.length; index += 1) {
    if (entries[index]!.at !== entries[index - 1]!.at) steps.push(index);
  }
  if (entries.length > 0) steps.push(entries.length);
  return steps;
}

/**
 * A journal of the board's moves and the moves `items` showed by itself,
 * with a time machine over it. Pass it to `<Board timeline={timeline}>`:
 * without one the board keeps no history and pays nothing.
 */
export function useBoardTimeline<T = unknown>(options: BoardTimelineOptions<T> = {}): BoardTimeline {
  const [core] = useState<TimelineCore>(() => ({
    journal: createJournal({
      limit: options.limit,
      entries: initialEntries(options.initial as BoardTimelineOptions<unknown>['initial']),
    }),
    view: createValueStore<TimelineView>(LIVE),
    options: { current: options as BoardTimelineOptions<unknown> },
  }));
  core.options.current = options as BoardTimelineOptions<unknown>;
  const entries = useSyncExternalStore(core.journal.subscribe, core.journal.entries, core.journal.entries);
  const view = useSyncExternalStore(core.view.subscribe, core.view.get, core.view.get);
  const steps = useMemo(() => stepsOf(entries), [entries]);

  const stepMs = useRef(DEFAULT_STEP_MS);
  const live = useRef({ entries, steps });
  live.current = { entries, steps };

  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    core.options.current.onChange?.(entries);
  }, [core, entries]);

  // Playing: one step per tick until the board is live again.
  useEffect(() => {
    if (!view.playing || view.position == null) return;
    const timer = setTimeout(() => {
      const next = live.current.steps.find((position) => position > view.position!);
      if (next == null || next >= live.current.entries.length) core.view.set(LIVE);
      else core.view.set({ ...view, position: next });
    }, stepMs.current);
    return () => clearTimeout(timer);
  }, [core, view]);

  return useMemo(() => {
    const seek = (position: number | null, mode: TimelineMode = 'past') => {
      const total = live.current.entries.length;
      if (position == null || (mode === 'past' && position >= total)) {
        core.view.set(LIVE);
        return;
      }
      core.view.set({ position: Math.max(0, Math.min(total, Math.floor(position))), mode, playing: false });
    };
    const position = view.position;
    return {
      ...view,
      entries,
      at: position == null || position === 0 ? null : (entries[position - 1]?.at ?? null),
      steps,
      seek,
      seekTime: (at, mode) => seek(positionAt(live.current.entries, at), mode),
      step(delta) {
        const all = live.current.steps;
        let at = core.view.get().position ?? live.current.entries.length;
        for (let count = 0; count < Math.abs(delta); count += 1) {
          const next = delta > 0 ? all.find((value) => value > at) : [...all].reverse().find((value) => value < at);
          if (next == null) break;
          at = next;
        }
        seek(at, core.view.get().mode);
      },
      play(options = {}) {
        stepMs.current = options.stepMs ?? DEFAULT_STEP_MS;
        const current = core.view.get().position;
        const from = options.from ?? (current == null || current >= live.current.entries.length ? 0 : current);
        if (live.current.entries.length === 0) return;
        core.view.set({ position: Math.max(0, from), mode: 'past', playing: true });
      },
      pause() {
        const current = core.view.get();
        if (current.playing) core.view.set({ ...current, playing: false });
      },
      live: () => core.view.set(LIVE),
      serialize: () => serializeJournal(live.current.entries),
      clear() {
        core.journal.reset([]);
        core.view.set(LIVE);
      },
      core,
    };
  }, [core, entries, steps, view]);
}

/**
 * Flow metrics from a timeline's journal: throughput per day, time in each
 * column, when every card entered its column, cycle times.
 */
export function useBoardFlow(timeline: Pick<BoardTimeline, 'entries'>, options: FlowOptions = {}): BoardFlow {
  const done = options.doneColumns?.join('\u0000') ?? '';
  return useMemo(
    () => boardFlow(timeline.entries, { doneColumns: done ? done.split('\u0000') : [] }),
    [done, timeline.entries],
  );
}

/** A board as one render left it: the model and which cards had a pending move, and how it was grouped. */
export interface ObservedBoard<T> {
  readonly model: BoardModel<T>;
  readonly isPending: (itemId: string) => boolean;
  /** The grouping's field names. A new grouping is a new view of the same data, not a change to it. */
  readonly keys: string;
}

/**
 * Journal entries for what `items` changed by itself between two renders:
 * cards the board was moving (pending before or now) are left out, and a
 * change of grouping records nothing.
 */
export function observedEntries<T>(
  before: ObservedBoard<T>,
  after: ObservedBoard<T>,
  at: number,
  actor?: (itemId: string) => string | undefined,
): JournalEntry[] {
  if (before.model === after.model || before.keys !== after.keys) return [];
  return diffBoards(before.model, after.model, (itemId) => !before.isPending(itemId) && !after.isPending(itemId), {
    at,
    actor,
  });
}

/** Journal entries for moves this board made. */
export function localEntries(moves: readonly CommittedMove[], actor: string | undefined): JournalEntry[] {
  const at = Date.now();
  return moves.map(({ op, from, to, origin }) => {
    let entry: JournalEntry = {
      id: createEntryId(),
      at,
      itemId: op.id,
      from,
      to,
      observed: false,
      source: op.source,
      opId: op.opId,
    };
    if (op.batch) entry = { ...entry, batchId: op.batch.id };
    if (actor) entry = { ...entry, actor };
    if (origin) entry = { ...entry, origin };
    return entry;
  });
}

/** A group key back from a cell id's part: the No value bucket is null. */
function rawKey(key: string): string | null {
  return key === NO_VALUE_ID ? null : key;
}

/**
 * The items and overlays that draw the board after `position` entries:
 * cards that arrived later are left out, and each card that stood
 * elsewhere gets an overlay putting it back, rank and all. Places in a
 * column or lane that no longer exists are ignored.
 */
export function pastBoard<T>(
  entries: readonly JournalEntry[],
  position: number,
  live: BoardModel<T>,
  items: readonly T[],
  getItemId: (item: T) => string,
  groupBy: GroupBy<T>,
): { items: T[]; overlays: MoveOperation[] } {
  const now = placesOf(live);
  const then = placesAt(entries, now, position);
  const columns = new Set(groupBy.columns.values.map((value) => value.id));
  const lanes = groupBy.lanes ? new Set(groupBy.lanes.values.map((value) => value.id)) : null;
  const kept: T[] = [];
  const overlays: MoveOperation[] = [];
  for (const item of items) {
    const itemId = getItemId(item);
    const place = then.get(itemId);
    if (!place) continue;
    kept.push(item);
    const current = now.get(itemId);
    if (current && current.cellId === place.cellId && current.rank === place.rank) continue;
    let parts: { laneKey: string; columnKey: string };
    try {
      parts = parseCellId(place.cellId);
    } catch {
      continue;
    }
    const knownColumn = parts.columnKey === NO_VALUE_ID || columns.has(parts.columnKey);
    const knownLane = lanes ? parts.laneKey === NO_VALUE_ID || lanes.has(parts.laneKey) : parts.laneKey === NO_LANE_ID;
    if (!knownColumn || !knownLane) continue;
    const changes: Record<string, string | null> = { [groupBy.columns.key]: rawKey(parts.columnKey) };
    if (groupBy.lanes) changes[groupBy.lanes.key] = rawKey(parts.laneKey);
    overlays.push({
      opId: `timeline:${itemId}`,
      id: itemId,
      changes,
      from: {},
      rank: place.rank,
      previousId: null,
      nextId: null,
      source: 'api',
    });
  }
  return { items: kept, overlays };
}

/** Cards whose place at `position` differs from now, with where they were then (null: not on the board). */
export function changedSince<T>(
  entries: readonly JournalEntry[],
  position: number,
  live: BoardModel<T>,
): Map<string, JournalPlace | null> {
  const now = placesOf(live);
  const then = placesAt(entries, now, position);
  const changed = new Map<string, JournalPlace | null>();
  for (const [itemId, place] of now) {
    const before = then.get(itemId) ?? null;
    if (!before || before.cellId !== place.cellId) changed.set(itemId, before);
  }
  return changed;
}
