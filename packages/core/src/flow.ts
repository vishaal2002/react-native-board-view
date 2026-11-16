import { parseCellId } from './ids';
import type { JournalEntry, JournalPlace } from './journal';

const DAY_MS = 86_400_000;

export interface FlowOptions {
  /** Columns that count as finished, for throughput and cycle times. */
  readonly doneColumns?: readonly string[];
}

/** How long cards stayed in a column before they left it, in days. Null until one has left. */
export interface ColumnFlow {
  readonly entered: number;
  readonly left: number;
  readonly days: { readonly mean: number; readonly median: number; readonly p85: number } | null;
}

export interface BoardFlow {
  /** Cards that reached a done column, per local day (`YYYY-MM-DD`), oldest first. Days with none are left out. */
  readonly throughput: readonly { readonly day: string; readonly count: number }[];
  /** By column id. */
  readonly columns: Readonly<Record<string, ColumnFlow>>;
  /** When each card entered the column it is in now, by the journal. Cards it never saw move are absent. */
  readonly enteredAt: ReadonlyMap<string, number>;
  /** Days from a card's first journal entry to reaching a done column, one per finish. */
  readonly cycleTimes: readonly number[];
}

/** The `p`th percentile (0–100) of `values`, by nearest rank. Null for none. */
export function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((Math.max(0, Math.min(100, p)) / 100) * sorted.length);
  return sorted[Math.max(0, rank - 1)]!;
}

function localDay(at: number): string {
  const date = new Date(at);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function columnOf(place: JournalPlace | null): string | null {
  if (!place) return null;
  try {
    return parseCellId(place.cellId).columnKey;
  } catch {
    return null;
  }
}

/**
 * Flow metrics from a journal: throughput, time in each column, when every
 * card entered its column, and cycle times. A reorder inside a column is
 * not a step; a move between lanes of one column is not either.
 */
export function boardFlow(entries: readonly JournalEntry[], options: FlowOptions = {}): BoardFlow {
  const done = new Set(options.doneColumns ?? []);
  const enteredAt = new Map<string, number>();
  const firstSeen = new Map<string, number>();
  const stays = new Map<string, number[]>();
  const counts = new Map<string, { entered: number; left: number }>();
  const throughput = new Map<string, number>();
  const cycleTimes: number[] = [];
  const count = (columnId: string) => {
    let entry = counts.get(columnId);
    if (!entry) counts.set(columnId, (entry = { entered: 0, left: 0 }));
    return entry;
  };

  const ordered = entries.every((entry, index) => index === 0 || entries[index - 1]!.at <= entry.at)
    ? entries
    : [...entries].sort((a, b) => a.at - b.at);
  for (const entry of ordered) {
    const from = columnOf(entry.from);
    const to = columnOf(entry.to);
    if (!firstSeen.has(entry.itemId)) firstSeen.set(entry.itemId, entry.at);
    if (from === to) continue;
    if (from != null) {
      count(from).left += 1;
      const since = enteredAt.get(entry.itemId);
      if (since != null) {
        const list = stays.get(from) ?? [];
        list.push((entry.at - since) / DAY_MS);
        stays.set(from, list);
      }
    }
    if (to == null) {
      enteredAt.delete(entry.itemId);
      continue;
    }
    count(to).entered += 1;
    enteredAt.set(entry.itemId, entry.at);
    if (done.has(to) && (from == null || !done.has(from))) {
      const day = localDay(entry.at);
      throughput.set(day, (throughput.get(day) ?? 0) + 1);
      cycleTimes.push((entry.at - firstSeen.get(entry.itemId)!) / DAY_MS);
    }
  }

  const columns: Record<string, ColumnFlow> = {};
  for (const [columnId, { entered, left }] of counts) {
    const days = stays.get(columnId) ?? [];
    columns[columnId] = {
      entered,
      left,
      days:
        days.length === 0
          ? null
          : {
              mean: days.reduce((sum, value) => sum + value, 0) / days.length,
              median: percentile(days, 50)!,
              p85: percentile(days, 85)!,
            },
    };
  }
  return {
    throughput: [...throughput].sort(([a], [b]) => (a < b ? -1 : 1)).map(([day, total]) => ({ day, count: total })),
    columns,
    enteredAt,
    cycleTimes,
  };
}
