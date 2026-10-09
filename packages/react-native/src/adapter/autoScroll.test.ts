import { describe, expect, it } from 'vitest';
import { edgeZoneForWidth, stepAutoScroll } from './autoScroll';

const base = {
  pointer: 4,
  frameStart: 0,
  frameSize: 400,
  edgeZone: 80,
  offset: 0,
  maxOffset: 2000,
  dwellMs: 0,
  dtMs: 16,
  mode: 'continuous' as const,
  pageSize: 400,
  reducedMotion: false,
};

describe('auto-scroll', () => {
  it('uses a wide phone edge and a short tablet edge', () => {
    expect(edgeZoneForWidth(390)).toBeGreaterThan(edgeZoneForWidth(1024));
    expect(edgeZoneForWidth(390)).toBeGreaterThanOrEqual(56);
  });

  it('ramps continuous speed and does not pass the end', () => {
    const early = stepAutoScroll({ ...base, pointer: 390, dwellMs: 0, dtMs: 50 });
    const later = stepAutoScroll({ ...base, pointer: 390, dwellMs: 1500, dtMs: 50, offset: early.offset });
    expect(early.offset).toBeGreaterThan(0);
    expect(later.offset - early.offset).toBeGreaterThan(early.offset);
    const capped = stepAutoScroll({
      ...base,
      pointer: 390,
      offset: 1990,
      maxOffset: 2000,
      dwellMs: 2000,
      dtMs: 1000,
    });
    expect(capped.offset).toBe(2000);
  });

  it('holds a paged edge before flipping a single page', () => {
    const waiting = stepAutoScroll({ ...base, mode: 'paged', pointer: 390, dtMs: 100 });
    expect(waiting.flipped).toBe(false);
    expect(waiting.offset).toBe(0);
    const flipped = stepAutoScroll({ ...base, mode: 'paged', pointer: 390, dwellMs: 300, dtMs: 40 });
    expect(flipped).toEqual({ offset: 400, dwellMs: 0, flipped: true });
    const end = stepAutoScroll({
      ...base,
      mode: 'paged',
      pointer: 390,
      offset: 800,
      maxOffset: 800,
      dwellMs: 400,
      dtMs: 40,
    });
    expect(end.offset).toBe(800);
    expect(end.flipped).toBe(false);
  });

  it('resets dwell when the pointer leaves the edge', () => {
    const step = stepAutoScroll({ ...base, pointer: 200, dwellMs: 900 });
    expect(step.dwellMs).toBe(0);
    expect(step.offset).toBe(0);
  });
});
