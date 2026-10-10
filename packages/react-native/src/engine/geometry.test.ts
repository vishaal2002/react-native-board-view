import { describe, expect, it } from 'vitest';
import {
  containsPoint,
  dropLineOffset,
  indexAfterRemoval,
  rawInsertionIndex,
  slotIndexAt,
  type Slot,
  type SlotSource,
} from './geometry';

function source(heights: readonly number[], gap = 0): SlotSource & { reads: number } {
  const slots: Slot[] = [];
  let top = 0;
  for (const height of heights) {
    slots.push({ top, height });
    top += height + gap;
  }
  const result = {
    reads: 0,
    count: slots.length,
    slot(index: number) {
      result.reads += 1;
      return slots[index];
    },
  };
  return result;
}

describe('rawInsertionIndex', () => {
  const cards = source([100, 100, 100]);

  it('inserts before the first card whose midpoint is below the pointer', () => {
    expect(rawInsertionIndex(cards, 0)).toBe(0);
    expect(rawInsertionIndex(cards, 49)).toBe(0);
    expect(rawInsertionIndex(cards, 51)).toBe(1);
    expect(rawInsertionIndex(cards, 160)).toBe(2);
    expect(rawInsertionIndex(cards, 260)).toBe(3);
    expect(rawInsertionIndex(cards, 10_000)).toBe(3);
  });

  it('is 0 for an empty cell', () => {
    expect(rawInsertionIndex(source([]), 500)).toBe(0);
  });

  it('handles uneven heights', () => {
    const uneven = source([60, 220, 80]);
    expect(rawInsertionIndex(uneven, 150)).toBe(1);
    expect(rawInsertionIndex(uneven, 200)).toBe(2);
  });

  it('reads about log2(n) slots in a 500-card cell', () => {
    const big = source(Array.from({ length: 500 }, (_, index) => 60 + (index % 7) * 20));
    rawInsertionIndex(big, 25_000);
    expect(big.reads).toBeLessThanOrEqual(10);
  });
});

describe('indexAfterRemoval', () => {
  it('leaves indexes before the dragged card alone and shifts those after it', () => {
    expect(indexAfterRemoval(0, 2)).toBe(0);
    expect(indexAfterRemoval(2, 2)).toBe(2);
    expect(indexAfterRemoval(3, 2)).toBe(2);
    expect(indexAfterRemoval(4, 2)).toBe(3);
  });

  it('does not shift when the card comes from another cell', () => {
    expect(indexAfterRemoval(4, null)).toBe(4);
  });

  it('turns hovering over the card itself into a no-op', () => {
    // Card at index 1: the upper half gives raw 1, the lower half raw 2. Both mean "stay at 1".
    expect(indexAfterRemoval(1, 1)).toBe(1);
    expect(indexAfterRemoval(2, 1)).toBe(1);
  });
});

describe('slotIndexAt', () => {
  const cards = source([100, 100, 100], 10);

  it('finds the card under a point and nothing in gaps', () => {
    expect(slotIndexAt(cards, 5)).toBe(0);
    expect(slotIndexAt(cards, 105)).toBe(-1);
    expect(slotIndexAt(cards, 115)).toBe(1);
    expect(slotIndexAt(cards, 319)).toBe(2);
    expect(slotIndexAt(cards, 400)).toBe(-1);
    expect(slotIndexAt(cards, -1)).toBe(-1);
  });
});

describe('dropLineOffset', () => {
  const cards = source([100, 100], 20);

  it('sits in the middle of the gap between cards', () => {
    expect(dropLineOffset(cards, 1)).toBe(110);
  });

  it('sits on the first card at the start and below the last at the end', () => {
    expect(dropLineOffset(cards, 0)).toBe(0);
    expect(dropLineOffset(cards, 2)).toBe(220);
  });

  it('falls back for an empty cell', () => {
    expect(dropLineOffset(source([]), 0, 12)).toBe(12);
  });
});

describe('containsPoint', () => {
  it('includes the top-left edge and excludes the bottom-right edge', () => {
    const rect = { x: 10, y: 10, width: 100, height: 50 };
    expect(containsPoint(rect, 10, 10)).toBe(true);
    expect(containsPoint(rect, 109, 59)).toBe(true);
    expect(containsPoint(rect, 110, 30)).toBe(false);
    expect(containsPoint(rect, 50, 60)).toBe(false);
  });
});
