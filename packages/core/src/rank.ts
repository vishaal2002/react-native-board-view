import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing';
import type { RankStrategy, RankedRef } from './types';

/**
 * Default rank strategy. Keys come from rocicorp/fractional-indexing.
 * We do not pass a custom digit alphabet, so v4 keeps the classic "a0" form.
 */
export const fractionalRank: RankStrategy = {
  between(before, after) {
    return generateKeyBetween(before, after);
  },
  nBetween(before, after, count) {
    if (count <= 0) return [];
    return generateNKeysBetween(before, after, count);
  },
  compare(a, b) {
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  },
};

export function rankBetween(
  before: string | null,
  after: string | null,
  strategy: RankStrategy = fractionalRank,
): string {
  return strategy.between(before, after);
}

export function compareRanked(a: RankedRef, b: RankedRef, strategy: RankStrategy = fractionalRank): number {
  const byRank = strategy.compare(a.rank, b.rank);
  if (byRank !== 0) return byRank;
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

/**
 * Rewrite every rank in the current order so keys stay short.
 * Order is the rank order, with id as the tie break. Returns one update
 * per input item (same id, new rank).
 */
export function rebalanceRanks<T extends RankedRef>(
  items: readonly T[],
  strategy: RankStrategy = fractionalRank,
): { id: string; rank: string }[] {
  if (items.length === 0) return [];
  const sorted = [...items].sort((a, b) => compareRanked(a, b, strategy));
  const keys = strategy.nBetween(null, null, sorted.length);
  return sorted.map((item, index) => {
    const rank = keys[index];
    if (rank == null) {
      throw new Error(`Rank strategy returned ${keys.length} keys for ${sorted.length} items.`);
    }
    return { id: item.id, rank };
  });
}

/** True when any key is long enough that a rebalance is worth doing. */
export function shouldRebalance(ranks: readonly string[], maxLength = 48): boolean {
  for (const rank of ranks) {
    if (rank.length > maxLength) return true;
  }
  return false;
}
