import { describe, expect, it } from 'vitest';
import {
  MATRIX_GUTTER,
  columnMetrics,
  leadingSlot,
  offsetForSlot,
  pageAt,
  resolveLayout,
  sameMetrics,
  showsCellFooter,
  slotAtX,
  visibleSlots,
  visualSlot,
} from './metrics';

const theme = { columnWidth: 300, columnGap: 12, collapsedColumnWidth: 48, minColumnWidth: 136 };
const open = (count: number) => new Array<boolean>(count).fill(false);

describe('resolveLayout', () => {
  it('picks paged on phones and multi on tablets under auto', () => {
    expect(resolveLayout('auto', 390)).toBe('paged');
    expect(resolveLayout('auto', 820)).toBe('multi');
  });

  it('moves the auto switch to autoBreakpoint', () => {
    expect(resolveLayout('auto', 700, 768)).toBe('paged');
    expect(resolveLayout('auto', 500, 480)).toBe('multi');
    expect(resolveLayout('fit', 500, 768)).toBe('fit');
  });

  it('keeps an explicit layout', () => {
    expect(resolveLayout('fit', 390)).toBe('fit');
    expect(resolveLayout('stacked', 1200)).toBe('stacked');
  });
});

describe('paged metrics', () => {
  const paged = columnMetrics('paged', 390, open(4), theme);

  it('makes each column one page with a peek of the next', () => {
    expect(paged.slots.every((slot) => slot.width === paged.slots[0]?.width)).toBe(true);
    const width = paged.slots[0]?.width ?? 0;
    expect(width).toBeLessThan(390);
    expect(paged.pageSize).toBe(width + paged.gap);
  });

  it('lets the last page snap to the same spot as the others', () => {
    const lastPage = offsetForSlot(paged, 3, 390);
    expect(lastPage).toBe(3 * paged.pageSize);
    expect(paged.contentWidth - 390).toBeCloseTo(lastPage, 5);
  });

  it('ignores collapsing', () => {
    const collapsed = columnMetrics('paged', 390, [true, false, true, false], theme);
    expect(collapsed.slots.some((slot) => slot.collapsed)).toBe(false);
  });

  it('draws Show more only on the column that is on screen', () => {
    expect(showsCellFooter('paged', 0, 0)).toBe(true);
    expect(showsCellFooter('paged', 1, 0)).toBe(false);
    expect(showsCellFooter('multi', 1, 0)).toBe(true);
  });

  it('maps offsets to pages', () => {
    expect(pageAt(paged, 0)).toBe(0);
    expect(pageAt(paged, paged.pageSize * 2 + 10)).toBe(2);
    expect(pageAt(paged, 99_999)).toBe(3);
  });
});

describe('multi metrics', () => {
  it('lays fixed-width columns with gaps and scrolls when they overflow', () => {
    const multi = columnMetrics('multi', 700, open(4), theme);
    expect(multi.slots.map((slot) => slot.x)).toEqual([12, 324, 636, 948]);
    expect(multi.contentWidth).toBe(948 + 300 + 12);
    expect(multi.scrollable).toBe(true);
  });

  it('does not scroll when everything fits', () => {
    expect(columnMetrics('multi', 1400, open(3), theme).scrollable).toBe(false);
  });

  it('narrows collapsed columns', () => {
    const multi = columnMetrics('multi', 700, [false, true, false], theme);
    expect(multi.slots.map((slot) => slot.width)).toEqual([300, 48, 300]);
    expect(multi.slots[2]?.x).toBe(12 + 300 + 12 + 48 + 12);
  });
});

describe('fit metrics', () => {
  it('shares the width so nothing scrolls', () => {
    const fit = columnMetrics('fit', 800, open(4), theme);
    expect(fit.scrollable).toBe(false);
    expect(fit.contentWidth).toBeCloseTo(800, 5);
    const width = fit.slots[0]?.width ?? 0;
    expect(fit.slots.every((slot) => Math.abs(slot.width - width) < 0.001)).toBe(true);
  });

  it('never squashes columns below the minimum: it scrolls instead', () => {
    const narrow = columnMetrics('fit', 390, open(6), theme);
    expect(narrow.slots.every((slot) => slot.width === 136)).toBe(true);
    expect(narrow.scrollable).toBe(true);
  });

  it('gives collapsed columns a strip and the rest to open columns', () => {
    const fit = columnMetrics('fit', 800, [false, true, false, false], theme);
    expect(fit.slots[1]?.width).toBe(48);
    expect(fit.contentWidth).toBeCloseTo(800, 5);
  });
});

describe('slot lookups', () => {
  const multi = columnMetrics('multi', 700, open(4), theme);

  it('finds the column under an x and nothing in gaps', () => {
    expect(slotAtX(multi, 13)).toBe(0);
    expect(slotAtX(multi, 315)).toBe(-1);
    expect(slotAtX(multi, 330)).toBe(1);
    expect(slotAtX(multi, 5)).toBe(-1);
  });

  it('renders what is visible plus a buffer', () => {
    expect(visibleSlots(multi, 0, 700, 0)).toEqual({ first: 0, last: 2 });
    expect(visibleSlots(multi, 0, 700, 1)).toEqual({ first: 0, last: 3 });
    expect(visibleSlots(multi, 600, 700, 1)).toEqual({ first: 0, last: 3 });
  });

  it('clamps scroll targets to the content', () => {
    expect(offsetForSlot(multi, 3, 700)).toBe(multi.contentWidth - 700);
    expect(offsetForSlot(multi, 0, 700)).toBe(0);
  });

  it('mirrors visual order right to left', () => {
    expect(visualSlot(0, 4, false)).toBe(0);
    expect(visualSlot(0, 4, true)).toBe(3);
  });
});

describe('matrix metrics', () => {
  it('shares the width after the lane gutter and never scrolls', () => {
    const metrics = columnMetrics('matrix', 400, [false, false], theme);
    expect(metrics.scrollable).toBe(false);
    expect(metrics.slots[0]?.x).toBe(MATRIX_GUTTER);
    const width = (400 - MATRIX_GUTTER - theme.columnGap * 2) / 2;
    expect(metrics.slots.map((slot) => slot.width)).toEqual([width, width]);
    expect(metrics.slots[1]?.x).toBe(MATRIX_GUTTER + width + theme.columnGap);
  });
});

describe('leadingSlot', () => {
  it('is the first column at least half on screen, never "none" in a gap', () => {
    const metrics = columnMetrics('multi', 800, open(4), theme);
    expect(leadingSlot(metrics, 0)).toBe(0);
    // Inside the gap after column 0: still a column, not -1.
    const gapX = metrics.slots[0]!.x + metrics.slots[0]!.width + 2;
    expect(slotAtX(metrics, gapX)).toBe(-1);
    expect(leadingSlot(metrics, gapX)).toBe(1);
    expect(leadingSlot(metrics, metrics.slots[1]!.x + 200)).toBe(2);
    expect(leadingSlot(metrics, 1e6)).toBe(3);
  });
});

describe('sameMetrics', () => {
  it('matches geometry built from equal tokens, and not after a collapse', () => {
    const a = columnMetrics('multi', 800, open(3), theme);
    expect(sameMetrics(a, columnMetrics('multi', 800, open(3), { ...theme }))).toBe(true);
    expect(sameMetrics(a, columnMetrics('multi', 800, [true, false, false], theme))).toBe(false);
  });
});
