import type { GroupAxis, GroupBy, ItemMoveSnapshot } from './types';

export function readAxisValue<T>(axis: GroupAxis<T>, item: T): string | null {
  const raw = axis.getKey ? axis.getKey(item) : readDefaultField(item, axis.key);
  if (raw == null) return null;
  const text = String(raw);
  if (text.length === 0) return null;
  return text;
}

function readDefaultField<T>(item: T, key: string): string | null {
  if (typeof item !== 'object' || item == null) return null;
  const value = (item as Record<string, unknown>)[key];
  if (value == null) return null;
  return String(value);
}

/** The grouped fields and rank of an app record, as the move queue compares them. */
export function readItemSnapshot<T>(item: T, groupBy: GroupBy<T>, getRank: (item: T) => string): ItemMoveSnapshot {
  const fields: Record<string, string | null> = { [groupBy.columns.key]: readAxisValue(groupBy.columns, item) };
  if (groupBy.lanes) fields[groupBy.lanes.key] = readAxisValue(groupBy.lanes, item);
  return { rank: getRank(item), fields };
}
