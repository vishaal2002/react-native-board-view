import type { BoardModel, GroupValue } from 'board-view-core';

export interface ColumnStat {
  /** Cards loaded in the column, every lane included. */
  readonly count: number;
  /** Sum of `getItemValue` over those cards, or null without `getItemValue`. */
  readonly value: number | null;
}

/** Card counts, and value sums when `getItemValue` is given, by column id. */
export function columnStats<T>(
  model: BoardModel<T>,
  getItemValue?: (item: T) => number | null | undefined,
): ReadonlyMap<string, ColumnStat> {
  const stats = new Map<string, { count: number; value: number | null }>();
  for (const column of model.columns) stats.set(column.id, { count: 0, value: getItemValue ? 0 : null });
  for (const cell of model.cells) {
    const stat = stats.get(cell.columnKey) ?? { count: 0, value: getItemValue ? 0 : null };
    stat.count += cell.items.length;
    if (getItemValue) {
      for (const item of cell.items) {
        const value = getItemValue(item);
        if (typeof value === 'number' && Number.isFinite(value)) stat.value = (stat.value ?? 0) + value;
      }
    }
    stats.set(cell.columnKey, stat);
  }
  return stats;
}

/** Sum of `getItemValue` over some cards, or null without it. */
export function sumValues<T>(
  items: readonly T[],
  getItemValue?: (item: T) => number | null | undefined,
): number | null {
  if (!getItemValue) return null;
  let sum = 0;
  for (const item of items) {
    const value = getItemValue(item);
    if (typeof value === 'number' && Number.isFinite(value)) sum += value;
  }
  return sum;
}

/**
 * Where a column stands against its limit. `at` is full: one more card goes
 * over. No limit, or one that is not a positive number, is `none`.
 */
export type LimitState = 'none' | 'under' | 'at' | 'over';

export function limitState(total: number, limit: number | undefined): LimitState {
  if (limit == null || !Number.isFinite(limit) || limit <= 0) return 'none';
  if (total > limit) return 'over';
  if (total === limit) return 'at';
  return 'under';
}

const UNITS: readonly [number, string][] = [
  [1e12, 'T'],
  [1e9, 'B'],
  [1e6, 'M'],
  [1e3, 'k'],
];

/**
 * 1234 → "1.2k", 1500000 → "1.5M", 12 → "12". The default `formatValue`.
 * Written out instead of `Intl` compact notation, which not every Hermes build has.
 */
export function formatCompact(value: number): string {
  const sign = value < 0 ? '-' : '';
  const size = Math.abs(value);
  for (const [unit, suffix] of UNITS) {
    if (size >= unit) {
      const scaled = size / unit;
      const text = scaled >= 100 ? Math.round(scaled).toString() : (Math.round(scaled * 10) / 10).toString();
      return `${sign}${text}${suffix}`;
    }
  }
  return `${sign}${Math.round(size * 100) / 100}`;
}

export interface LaneShare {
  readonly column: GroupValue;
  readonly count: number;
}

/** How a lane's cards spread across the columns, in column order. */
export function laneDistribution<T>(model: BoardModel<T>, laneId: string): readonly LaneShare[] {
  const shares: LaneShare[] = [];
  for (const column of model.columns) {
    const cell = model.cellById.get(`${laneId}::${column.id}`);
    shares.push({ column, count: cell?.items.length ?? 0 });
  }
  return shares;
}

// ─── Planner days ────────────────────────────────────────────────────────────

const DAY_ID = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `YYYY-MM-DD` for a date, in local time. The planner's column ids. */
export function toDayId(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** The local date a `YYYY-MM-DD` id names, or null for any other id (such as No value). */
export function parseDayId(id: string): Date | null {
  const match = DAY_ID.exec(id);
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  // Reject ids such as 2026-02-31 that roll over into another month.
  return toDayId(date) === id ? date : null;
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + days);
  return next;
}

export interface DayColumnsOptions {
  /** `Intl` locale for the labels. Default: the device's. */
  locale?: string;
  /** Column color for each day, e.g. to mark holidays. */
  color?: (date: Date) => string | undefined;
}

/**
 * Columns for `layout="planner"`: `count` days from `start`, with ids like
 * `2026-10-19` and labels like "Mon 19 Oct". Prepend or append more as the
 * board reaches either end (`onColumnsEndReached`).
 */
export function dayColumns(start: Date, count: number, options: DayColumnsOptions = {}): GroupValue[] {
  const format = new Intl.DateTimeFormat(options.locale, { weekday: 'short', day: 'numeric', month: 'short' });
  const columns: GroupValue[] = [];
  for (let index = 0; index < count; index += 1) {
    const date = addDays(start, index);
    const color = options.color?.(date);
    columns.push(
      color
        ? { id: toDayId(date), label: format.format(date), color }
        : { id: toDayId(date), label: format.format(date) },
    );
  }
  return columns;
}

export interface PlannerDay {
  readonly date: Date;
  readonly today: boolean;
  readonly weekend: boolean;
}

/** What a planner header needs to know about its column. */
export function plannerDay(columnId: string, now: Date = new Date()): PlannerDay | null {
  const date = parseDayId(columnId);
  if (!date) return null;
  const weekday = date.getDay();
  return { date, today: toDayId(now) === columnId, weekend: weekday === 0 || weekday === 6 };
}
