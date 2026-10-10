import { compareRanked, fractionalRank, rankBetween } from './rank';
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

export interface Placement {
  readonly rank: string;
  readonly previousId: string | null;
  readonly nextId: string | null;
}

/**
 * `rankForMove` plus the neighbors the card really lands between. They match
 * `toIndex` except next to tied ranks, where the card lands after the tie.
 */
export function placeForMove(
  visible: readonly RankedRef[],
  draggedId: string,
  toIndex: number,
  strategy: RankStrategy = fractionalRank,
): Placement {
  const rank = rankForMove(visible, draggedId, toIndex, strategy);
  const without = visibleAfterRemoval(visible, draggedId);
  const moved: RankedRef = { id: draggedId, rank };
  const at = without.findIndex((item) => compareRanked(moved, item, strategy) < 0);
  const position = at < 0 ? without.length : at;
  return {
    rank,
    previousId: without[position - 1]?.id ?? null,
    nextId: without[position]?.id ?? null,
  };
}
