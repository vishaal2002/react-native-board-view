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

/**
 * First ranks for items that have none yet, in the order given (sort them
 * first, e.g. by creation date). Returns one `{ id, rank }` per id, evenly
 * spaced so later moves keep keys short. Persist them like any other move.
 */
export function seedRanks(
  ids: readonly string[],
  strategy: RankStrategy = fractionalRank,
): { id: string; rank: string }[] {
  const keys = strategy.nBetween(null, null, ids.length);
  return ids.map((id, index) => {
    const rank = keys[index];
    if (rank == null) throw new Error(`Rank strategy returned ${keys.length} keys for ${ids.length} items.`);
    return { id, rank };
  });
}

/** True when any key is long enough that a rebalance is worth doing. */
export function shouldRebalance(ranks: readonly string[], maxLength = 48): boolean {
  for (const rank of ranks) {
    if (rank.length > maxLength) return true;
  }
  return false;
}

const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/** A small seeded generator (mulberry32), so a seed gives the same ranks in tests. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export interface JitteredRankOptions {
  /** Seeds the random digits, for repeatable tests. Default: `Math.random`. */
  seed?: number;
  /** Your own source of numbers in [0, 1). Wins over `seed`. */
  random?: () => number;
  /** Random digits added to each key. More digits, fewer collisions, longer keys. Default 4. */
  digits?: number;
}

/**
 * A rank strategy for boards several people edit at once. Two clients that
 * drop a card between the same neighbours would get the same fractional
 * key and tie; this one adds a few random digits, so their cards land in a
 * stable order instead. Keys stay valid fractional-indexing keys and sort
 * the same way, so it mixes with ranks made by `fractionalRank`.
 */
export function jitteredRank(options: JitteredRankOptions = {}): RankStrategy {
  const random = options.random ?? (options.seed != null ? seeded(options.seed) : Math.random);
  const digits = Math.max(1, Math.floor(options.digits ?? 4));
  const jitter = (start: string, before: string | null, upper: string | null) => {
    // Digits after a key that is the start of the next one could pass it ("a0" + "x" > "a0G1"): step inside first.
    let key = start;
    for (let tries = 0; upper != null && upper.startsWith(key) && tries < 4; tries += 1)
      key = generateKeyBetween(key, upper);
    let suffix = '';
    for (let index = 0; index < digits; index += 1) {
      // A fractional key may not end in "0".
      const low = index === digits - 1 ? 1 : 0;
      suffix += DIGITS[low + Math.floor(random() * (DIGITS.length - low))];
    }
    const candidate = key + suffix;
    const above = before == null || candidate > before;
    const below = upper == null || candidate < upper;
    return above && below ? candidate : start;
  };
  return {
    between(before, after) {
      return jitter(generateKeyBetween(before, after), before, after);
    },
    nBetween(before, after, count) {
      if (count <= 0) return [];
      const keys = generateNKeysBetween(before, after, count);
      let previous = before;
      return keys.map((key, index) => {
        const next = jitter(key, previous, keys[index + 1] ?? after);
        previous = next;
        return next;
      });
    },
    compare: fractionalRank.compare,
  };
}
