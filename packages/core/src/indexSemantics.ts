import { rankBetween } from './rank';
import type { RankStrategy, RankedRef } from './types';
import { fractionalRank } from './rank';

export class ToIndexError extends RangeError {
  constructor(toIndex: number, length: number) {
    super(`toIndex ${toIndex} is outside 0..${length} after removing the dragged card.`);
    this.name = 'ToIndexError';
  }
}

/**
 * Insertion index is the index in the target cell AFTER the dragged card
 * is removed. Removing a card that is not in the cell does not change indexes.
 */
export function visibleAfterRemoval<T extends { id: string }>(
  visible: readonly T[],
  draggedId: string,
): T[] {
  return visible.filter((item) => item.id !== draggedId);
}

export function orderAfterMove(ids: readonly string[], draggedId: string, toIndex: number): string[] {
  const without = ids.filter((id) => id !== draggedId);
  if (toIndex < 0 || toIndex > without.length) {
    throw new ToIndexError(toIndex, without.length);
  }
  const next = without.slice();
  next.splice(toIndex, 0, draggedId);
  return next;
}

/**
 * Rank between the visible neighbors at `toIndex`.
 * Filtered items are not in `visible`, so they are not neighbors.
 */
export function rankForMove(
  visible: readonly RankedRef[],
  draggedId: string,
  toIndex: number,
  strategy: RankStrategy = fractionalRank,
): string {
  const without = visibleAfterRemoval(visible, draggedId);
  if (toIndex < 0 || toIndex > without.length) {
    throw new ToIndexError(toIndex, without.length);
  }
  const before = toIndex === 0 ? null : (without[toIndex - 1]?.rank ?? null);
  const after = toIndex === without.length ? null : (without[toIndex]?.rank ?? null);
  return rankBetween(before, after, strategy);
}

export interface NormalizeToIndexInput {
  /** Index reported by the drag engine. */
  reportedIndex: number;
  /** Items in the target cell after the dragged card is removed. */
  itemCountAfterRemoval: number;
  /**
   * Pointer position in the cell's content coordinates, along the list axis.
   * Null when the adapter could not measure.
   */
  pointerContent: number | null;
  /**
   * End of the laid-out content on that axis. A pointer past this is in the
   * empty tail and means "append", even if the engine reports the last slot.
   */
  contentEnd: number | null;
}

/**
 * Drax 1.1's slot math returns `itemCount - 1` for a pointer past the last
 * card, so an append can be reported as "insert before the last item".
 * When the pointer is in the empty tail, the index is the length.
 * An empty cell is always 0.
 *
 * Same-cell Drax indexes already include the dragged card, and that index
 * matches the after-removal insertion index. Cross-cell indexes do not
 * include it. A pointer in the empty tail is an append.
 */
export function resolveDropIndex(args: {
  sameCell: boolean;
  reportedIndex: number;
  itemCount: number;
  pointerContent: number | null;
  contentEnd: number | null;
}): number {
  const afterRemoval = args.sameCell ? Math.max(0, args.itemCount - 1) : Math.max(0, args.itemCount);
  if (!args.sameCell) {
    return normalizeToIndex({
      reportedIndex: args.reportedIndex,
      itemCountAfterRemoval: afterRemoval,
      pointerContent: args.pointerContent,
      contentEnd: args.contentEnd,
    });
  }
  if (args.reportedIndex < 0) return 0;
  if (args.reportedIndex > afterRemoval) return afterRemoval;
  return args.reportedIndex;
}

export function normalizeToIndex(input: NormalizeToIndexInput): number {
  const count = input.itemCountAfterRemoval;
  if (count <= 0) return 0;
  const inTail =
    input.pointerContent != null &&
    input.contentEnd != null &&
    input.pointerContent >= input.contentEnd;
  if (inTail) return count;
  if (input.reportedIndex < 0) return 0;
  if (input.reportedIndex > count) return count;
  return input.reportedIndex;
}
