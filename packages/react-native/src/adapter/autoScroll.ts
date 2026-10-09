export type AutoScrollMode = 'continuous' | 'paged';

export interface AutoScrollInput {
  pointer: number;
  frameStart: number;
  frameSize: number;
  edgeZone: number;
  offset: number;
  maxOffset: number;
  dwellMs: number;
  dtMs: number;
  mode: AutoScrollMode;
  pageSize: number;
  reducedMotion: boolean;
}

export interface AutoScrollStep {
  offset: number;
  dwellMs: number;
  flipped: boolean;
}

const BASE_PX_PER_SEC = 90;
const RAMP_PX_PER_SEC2 = 380;
const MAX_PX_PER_SEC = 1280;
const REDUCED_PX_PER_SEC = 220;
const PAGE_DWELL_MS = 320;

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(max, Math.max(min, value));
}

/** Wide edge on phones, a short edge on wider layouts. */
export function edgeZoneForWidth(width: number): number {
  if (width < 600) return Math.min(96, Math.max(56, width * 0.22));
  return 28;
}

/**
 * One auto-scroll step. Continuous mode ramps speed while the pointer stays
 * in the edge zone and never passes maxOffset. Paged mode waits, then flips
 * one page. Reduced motion uses a flat speed and still dwells to flip.
 */
export function stepAutoScroll(input: AutoScrollInput): AutoScrollStep {
  const zone = Math.max(0, Math.min(input.edgeZone, input.frameSize / 2));
  const left = input.frameStart + zone;
  const right = input.frameStart + input.frameSize - zone;
  let direction: -1 | 0 | 1 = 0;
  if (input.pointer < left) direction = -1;
  else if (input.pointer > right) direction = 1;
  if (direction === 0 || input.frameSize <= 0) {
    return { offset: input.offset, dwellMs: 0, flipped: false };
  }

  const dt = Math.max(0, input.dtMs);
  const dwellMs = input.dwellMs + dt;
  const maxOffset = Math.max(0, input.maxOffset);

  if (input.mode === 'paged') {
    if (dwellMs < PAGE_DWELL_MS) {
      return { offset: input.offset, dwellMs, flipped: false };
    }
    const page = input.pageSize > 0 ? input.pageSize : input.frameSize;
    const currentPage = Math.round(input.offset / page);
    const next = clamp((currentPage + direction) * page, 0, maxOffset);
    if (next === input.offset) {
      return { offset: input.offset, dwellMs, flipped: false };
    }
    return { offset: next, dwellMs: 0, flipped: true };
  }

  const dwellSec = dwellMs / 1000;
  const speed = input.reducedMotion
    ? REDUCED_PX_PER_SEC
    : Math.min(MAX_PX_PER_SEC, BASE_PX_PER_SEC + RAMP_PX_PER_SEC2 * dwellSec);
  const next = clamp(input.offset + direction * speed * (dt / 1000), 0, maxOffset);
  return { offset: next, dwellMs, flipped: false };
}
