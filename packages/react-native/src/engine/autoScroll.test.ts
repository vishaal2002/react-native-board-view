import { describe, expect, it } from 'vitest';
import {
  MAX_STEP_MS,
  autoScrollOrigin,
  PAGE_DWELL_MS,
  edgeDirection,
  edgeZone,
  stepAutoScroll,
  type AutoScrollInput,
} from './autoScroll';

const base: AutoScrollInput = {
  pointer: 200,
  frameStart: 0,
  frameSize: 400,
  edgeZone: 80,
  offset: 0,
  maxOffset: 2000,
  dwellMs: 0,
  dtMs: 16,
  mode: 'continuous',
  pageSize: 400,
  reducedMotion: false,
};

describe('edgeZone', () => {
  it('is wider on phones than on tablets', () => {
    expect(edgeZone(390, true)).toBeGreaterThan(edgeZone(390, false));
    expect(edgeZone(390, true)).toBeGreaterThanOrEqual(56);
    expect(edgeZone(5000, true)).toBe(96);
    expect(edgeZone(5000, false)).toBe(64);
  });
});

describe('edgeDirection', () => {
  it('reports the edge the pointer is in', () => {
    expect(edgeDirection(10, 0, 400, 80)).toBe(-1);
    expect(edgeDirection(390, 0, 400, 80)).toBe(1);
    expect(edgeDirection(200, 0, 400, 80)).toBe(0);
  });

  it('never lets the two edges overlap on a small frame', () => {
    expect(edgeDirection(50, 0, 120, 80)).toBe(0);
  });

  it('ignores an empty frame', () => {
    expect(edgeDirection(0, 0, 0, 80)).toBe(0);
  });
});

describe('stepAutoScroll, continuous', () => {
  it('does nothing and resets dwell outside the edges', () => {
    expect(stepAutoScroll({ ...base, dwellMs: 900 })).toEqual({ offset: 0, dwellMs: 0, flipped: false });
  });

  it('scrolls toward the edge and accumulates dwell', () => {
    const step = stepAutoScroll({ ...base, pointer: 390 });
    expect(step.offset).toBeGreaterThan(0);
    expect(step.dwellMs).toBe(16);
    const back = stepAutoScroll({ ...base, pointer: 5, offset: 500 });
    expect(back.offset).toBeLessThan(500);
  });

  it('ramps speed the longer the pointer stays', () => {
    const early = stepAutoScroll({ ...base, pointer: 390, dwellMs: 0 }).offset;
    const late = stepAutoScroll({ ...base, pointer: 390, dwellMs: 2000 }).offset;
    expect(late).toBeGreaterThan(early * 3);
  });

  it('is slower near the inner edge of the zone than at the outer edge', () => {
    const inner = stepAutoScroll({ ...base, pointer: 325 }).offset;
    const outer = stepAutoScroll({ ...base, pointer: 399 }).offset;
    expect(outer).toBeGreaterThan(inner);
  });

  it('never passes the ends', () => {
    expect(stepAutoScroll({ ...base, pointer: 399, offset: 1995, dwellMs: 5000 }).offset).toBe(2000);
    expect(stepAutoScroll({ ...base, pointer: 1, offset: 3, dwellMs: 5000 }).offset).toBe(0);
    expect(stepAutoScroll({ ...base, pointer: 399, offset: 2000 }).offset).toBe(2000);
  });

  it('treats a stalled frame as a short one, so a JS hiccup cannot jump', () => {
    const stalled = stepAutoScroll({ ...base, pointer: 399, dtMs: 800, dwellMs: 1000 }).offset;
    const capped = stepAutoScroll({ ...base, pointer: 399, dtMs: MAX_STEP_MS, dwellMs: 1000 }).offset;
    expect(stalled).toBe(capped);
  });

  it('uses one flat speed with reduced motion', () => {
    const early = stepAutoScroll({ ...base, pointer: 330, reducedMotion: true }).offset;
    const late = stepAutoScroll({ ...base, pointer: 399, dwellMs: 3000, reducedMotion: true }).offset;
    expect(early).toBeCloseTo(late, 5);
  });
});

describe('stepAutoScroll, paged', () => {
  const paged: AutoScrollInput = { ...base, mode: 'paged', pointer: 390 };

  it('waits for the dwell before flipping', () => {
    const waiting = stepAutoScroll({ ...paged, dwellMs: PAGE_DWELL_MS - 40, dtMs: 16 });
    expect(waiting).toEqual({ offset: 0, dwellMs: PAGE_DWELL_MS - 24, flipped: false });
  });

  it('moves exactly one page and resets dwell', () => {
    expect(stepAutoScroll({ ...paged, dwellMs: PAGE_DWELL_MS })).toEqual({ offset: 400, dwellMs: 0, flipped: true });
    expect(stepAutoScroll({ ...paged, pointer: 5, offset: 800, dwellMs: PAGE_DWELL_MS })).toEqual({
      offset: 400,
      dwellMs: 0,
      flipped: true,
    });
  });

  it('snaps a mid-page offset to the next page boundary, not past it', () => {
    expect(stepAutoScroll({ ...paged, offset: 390, dwellMs: PAGE_DWELL_MS }).offset).toBe(400);
  });

  it('does not flip past the last page', () => {
    const end = stepAutoScroll({ ...paged, offset: 2000, dwellMs: 5000 });
    expect(end.offset).toBe(2000);
    expect(end.flipped).toBe(false);
  });
});

describe('autoScrollOrigin', () => {
  it('starts from the live offset when there is no position yet', () => {
    expect(autoScrollOrigin(Number.NaN, 340, [])).toBe(340);
  });

  it('keeps integrating while the live offset is one it wrote, even a few frames behind', () => {
    expect(autoScrollOrigin(560, 500, [480, 500, 520, 540, 560])).toBe(560);
  });

  it('follows the list when something else moved it', () => {
    // FlashList moved the content up by a 120-point row above the viewport.
    expect(autoScrollOrigin(560, 400, [480, 500, 520, 540, 560])).toBe(400);
  });

  it('keeps its position before it has written anything', () => {
    expect(autoScrollOrigin(200, 180, [])).toBe(200);
  });
});
