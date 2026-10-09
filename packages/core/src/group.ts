import { NO_LANE_ID, NO_VALUE_ID, NO_VALUE_LABEL, cellId } from './ids';
import type { GroupAxis, GroupBy, GroupValue } from './types';

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

/**
 * Map a raw key onto a configured bucket. Unknown and empty keys share
 * the no-value bucket. Overlay values win over the item, because the
 * item is still the app's unmodified record.
 */
export function resolveBucket<T>(
  axis: GroupAxis<T>,
  item: T,
  overlayValue: string | null | undefined,
  hasOverlay: boolean,
): string {
  const raw = hasOverlay ? (overlayValue ?? null) : readAxisValue(axis, item);
  if (raw == null) return NO_VALUE_ID;
  for (const value of axis.values) {
    if (value.id === raw) return raw;
  }
  return NO_VALUE_ID;
}

export function bucketsForAxis(axis: { values: readonly GroupValue[] }, usedNoValue: boolean): GroupValue[] {
  const buckets: GroupValue[] = axis.values.map((value) => ({ id: value.id, label: value.label }));
  if (usedNoValue) {
    buckets.push({ id: NO_VALUE_ID, label: NO_VALUE_LABEL });
  }
  return buckets;
}

export function laneAxis<T>(groupBy: GroupBy<T>): GroupAxis<T> | null {
  return groupBy.lanes ?? null;
}

export function isNoLane(laneKey: string): boolean {
  return laneKey === NO_LANE_ID;
}

export function makeCellId(laneKey: string, columnKey: string): string {
  return cellId(laneKey, columnKey);
}

/** App helper. The board does not call this during projection or drag. */
export function applyAxisValue<T>(axis: GroupAxis<T>, item: T, value: string | null): T {
  if (axis.applyKey) return axis.applyKey(item, value);
  if (typeof item !== 'object' || item == null) {
    throw new Error(`Cannot apply "${axis.key}" onto a non-object item without applyKey.`);
  }
  return { ...(item as object), [axis.key]: value } as T;
}
