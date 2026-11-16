import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { fractionalRank, jitteredRank } from './index';

const key = fc.constantFrom(null, 'a0', 'a1', 'a0V', 'Zz', 'b00', 'a0G1');

describe('jitteredRank', () => {
  it('repeats with a seed and sorts like fractionalRank', () => {
    const a = jitteredRank({ seed: 7 }).between('a0', 'a1');
    const b = jitteredRank({ seed: 7 }).between('a0', 'a1');
    expect(a).toBe(b);
    expect(a > 'a0' && a < 'a1').toBe(true);
    // Mixes with plain keys: the default strategy can keep going from it.
    expect(fractionalRank.between(a, 'a1') > a).toBe(true);
  });

  it('two clients dropping between the same neighbours never collide (property)', () => {
    fc.assert(
      fc.property(key, key, fc.integer(), fc.integer(), (x, y, seedA, seedB) => {
        fc.pre(seedA !== seedB);
        const [before, after] = x != null && y != null && x > y ? [y, x] : [x, y];
        fc.pre(before == null || after == null || before < after);
        const first = jitteredRank({ seed: seedA }).between(before, after);
        const second = jitteredRank({ seed: seedB }).between(before, after);
        for (const rank of [first, second]) {
          expect(before == null || rank > before).toBe(true);
          expect(after == null || rank < after).toBe(true);
          expect(rank.endsWith('0') && rank.length > 2).toBe(false);
        }
        return first !== second;
      }),
      { numRuns: 500 },
    );
  });

  it('gives n ordered keys between two others', () => {
    const keys = jitteredRank({ seed: 3 }).nBetween('a0', 'a1', 20);
    expect(keys).toHaveLength(20);
    expect([...keys].sort()).toEqual(keys);
    expect(new Set(keys).size).toBe(20);
    expect(keys.every((rank) => rank > 'a0' && rank < 'a1')).toBe(true);
    expect(jitteredRank().nBetween(null, null, 0)).toEqual([]);
  });
});
