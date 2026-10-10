import type { CellPlacement } from '../engine/types';

/** Sentinel row a list renders as the lifted card's placeholder. */
export const PLACEHOLDER_ROW: { readonly placeholder: true } = Object.freeze({ placeholder: true });

export type DisplayedRow<T> = T | typeof PLACEHOLDER_ROW;

export function isPlaceholder(row: unknown): row is typeof PLACEHOLDER_ROW {
  return row === PLACEHOLDER_ROW;
}

/**
 * The rows a cell renders: its cards without the lifted one, at most
 * `limit` of them, with the placeholder spliced in where the card would land.
 */
export function displayedRows<T>(
  items: readonly T[],
  getId: (item: T) => string,
  placement: CellPlacement,
  limit = Number.POSITIVE_INFINITY,
): DisplayedRow<T>[] {
  const hidden = placement.hiddenItemId;
  const rows: DisplayedRow<T>[] = [];
  for (const item of items) {
    if (rows.length >= limit) break;
    if (hidden !== null && getId(item) === hidden) continue;
    rows.push(item);
  }
  if (placement.placeholderIndex !== null) {
    rows.splice(Math.min(placement.placeholderIndex, rows.length), 0, PLACEHOLDER_ROW);
  }
  return rows;
}

/**
 * Turns an insertion point among displayed rows into an index among cards
 * (lifted card removed): the placeholder is not a card, so it does not count.
 */
export function cardIndexFromRaw(raw: number, placeholderAt: number): number {
  return placeholderAt >= 0 && placeholderAt < raw ? raw - 1 : raw;
}
