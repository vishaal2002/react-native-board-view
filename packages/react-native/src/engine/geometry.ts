/** Board-local rectangle: origin is the board's top-left corner. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Vertical extent of one card in its cell's content coordinates. */
export interface Slot {
  top: number;
  height: number;
}

/**
 * Cards of one cell in display order. `slot(i)` may be an estimate for cards
 * that were never rendered; the pointer is always over rendered cards, so the
 * slots that decide an index are measured ones.
 */
export interface SlotSource {
  readonly count: number;
  slot(index: number): Slot | undefined;
}

export function containsPoint(rect: Rect, x: number, y: number): boolean {
  return x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height;
}

/**
 * Raw insertion point for a pointer at `y` (cell content coordinates): the
 * first card whose vertical midpoint is below the pointer, or `count` when
 * the pointer is past every midpoint. Binary search, so a 500-card cell
 * costs about nine slot reads.
 */
export function rawInsertionIndex(source: SlotSource, y: number): number {
  let low = 0;
  let high = source.count;
  while (low < high) {
    const mid = (low + high) >> 1;
    const slot = source.slot(mid);
    if (!slot) return mid;
    if (y < slot.top + slot.height / 2) high = mid;
    else low = mid + 1;
  }
  return low;
}

/**
 * Converts a raw insertion point into the index after the dragged card is
 * removed. A card that is not in this cell does not shift indexes.
 */
export function indexAfterRemoval(raw: number, draggedIndex: number | null): number {
  if (draggedIndex == null || raw <= draggedIndex) return raw;
  return raw - 1;
}

/** The card whose slot contains `y`, or -1. */
export function slotIndexAt(source: SlotSource, y: number): number {
  let low = 0;
  let high = source.count - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const slot = source.slot(mid);
    if (!slot) return -1;
    if (y < slot.top) high = mid - 1;
    else if (y >= slot.top + slot.height) low = mid + 1;
    else return mid;
  }
  return -1;
}

/**
 * Where the drop line goes for a raw insertion point, in content coordinates:
 * halfway into the gap before card `raw`, or just below the last card.
 */
export function dropLineOffset(source: SlotSource, raw: number, fallbackTop = 0): number {
  if (source.count === 0) return fallbackTop;
  const current = source.slot(raw);
  const previous = raw > 0 ? source.slot(raw - 1) : undefined;
  if (current && previous) {
    const gapStart = previous.top + previous.height;
    return gapStart + Math.max(0, current.top - gapStart) / 2;
  }
  if (current) return current.top;
  if (previous) return previous.top + previous.height;
  return fallbackTop;
}
