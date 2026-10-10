import { fractionalRank, rankBetween } from './rank';
import type { RankStrategy, RankedRef } from './types';

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
export function visibleAfterRemoval<T extends { id: string }>(visible: readonly T[], draggedId: string): T[] {
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
  let after = toIndex === without.length ? null : (without[toIndex]?.rank ?? null);
  if (before != null && after != null && strategy.compare(before, after) >= 0) {
    // Tied neighbors are ordered by id and no key fits strictly between equal
    // keys. Land right after the tie instead; rebalanceRanks() removes ties.
    const boundary = before;
    after = without.slice(toIndex).find((item) => strategy.compare(item.rank, boundary) > 0)?.rank ?? null;
  }
  return rankBetween(before, after, strategy);
}
