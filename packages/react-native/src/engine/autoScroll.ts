export type AutoScrollMode = 'continuous' | 'paged';

export interface AutoScrollInput {
  /** Pointer position along the scroll axis, same coordinates as `frameStart`. */
  pointer: number;
  frameStart: number;
  frameSize: number;
  edgeZone: number;
  offset: number;
  maxOffset: number;
  /** Time the pointer has already spent in the edge zone. */
  dwellMs: number;
  dtMs: number;
  mode: AutoScrollMode;
  pageSize: number;
  reducedMotion: boolean;
  /**
   * Continuous mode: how long the pointer must stay in the edge before
   * scrolling starts, so a finger passing through (on its way to a drop dock)
   * does not move the list. Default 0.
   */
  delayMs?: number;
}

export interface AutoScrollStep {
  offset: number;
  dwellMs: number;
  /** Paged mode moved one page this step. */
  flipped: boolean;
}

const BASE_PX_PER_SEC = 120;
const RAMP_PX_PER_SEC2 = 420;
const MAX_PX_PER_SEC = 1400;
const REDUCED_PX_PER_SEC = 240;
export const PAGE_DWELL_MS = 360;
/** Frames longer than this are treated as this long, so a JS stall cannot cause a jump. */
export const MAX_STEP_MS = 48;

function clamp(value: number, min: number, max: number): number {
  'worklet';
  if (max < min) return min;
  return Math.min(max, Math.max(min, value));
}

/**
 * Width of the auto-scroll edge. Phones get a wide edge so a thumb can reach
 * it; tablets get a narrow one so cards near the edge stay droppable.
 */
export function edgeZone(frameSize: number, compact: boolean): number {
  'worklet';
  if (compact) return clamp(frameSize * 0.18, 56, 96);
  return clamp(frameSize * 0.08, 32, 64);
}

/** Pointer direction relative to the edges: -1 start edge, 1 end edge, 0 neither. */
export function edgeDirection(pointer: number, frameStart: number, frameSize: number, zone: number): -1 | 0 | 1 {
  'worklet';
  if (frameSize <= 0) return 0;
  const effective = Math.min(zone, frameSize / 3);
  if (pointer < frameStart + effective) return -1;
  if (pointer > frameStart + frameSize - effective) return 1;
  return 0;
}

/**
 * One auto-scroll step. A worklet: the engine runs it on the UI thread for
 * scrollers that can be driven there, and in JS for the rest.
 *
 * Continuous mode ramps speed the longer the pointer
 * stays in the edge, and slows near the outer edge of the zone, so speed
 * never jumps. It stops at 0 and `maxOffset`. Paged mode waits for a dwell,
 * then moves exactly one page. Reduced motion uses a flat, slower speed.
 */
export function stepAutoScroll(input: AutoScrollInput): AutoScrollStep {
  'worklet';
  const direction = edgeDirection(input.pointer, input.frameStart, input.frameSize, input.edgeZone);
  if (direction === 0) return { offset: input.offset, dwellMs: 0, flipped: false };

  const dt = clamp(input.dtMs, 0, MAX_STEP_MS);
  const dwellMs = input.dwellMs + dt;
  const maxOffset = Math.max(0, input.maxOffset);
  const atEnd = direction > 0 ? input.offset >= maxOffset : input.offset <= 0;
  if (atEnd) return { offset: clamp(input.offset, 0, maxOffset), dwellMs, flipped: false };

  if (input.mode === 'paged') {
    if (dwellMs < PAGE_DWELL_MS) return { offset: input.offset, dwellMs, flipped: false };
    const page = input.pageSize > 0 ? input.pageSize : input.frameSize;
    const current = direction > 0 ? Math.floor(input.offset / page + 0.01) : Math.ceil(input.offset / page - 0.01);
    const next = clamp((current + direction) * page, 0, maxOffset);
    return { offset: next, dwellMs: 0, flipped: next !== input.offset };
  }

  const delay = input.delayMs ?? 0;
  if (dwellMs < delay) return { offset: input.offset, dwellMs, flipped: false };
  const zone = Math.min(input.edgeZone, input.frameSize / 3);
  const depth =
    direction > 0
      ? input.pointer - (input.frameStart + input.frameSize - zone)
      : input.frameStart + zone - input.pointer;
  // 0.4 at the inner edge of the zone, 1 at the outer edge.
  const intensity = 0.4 + 0.6 * clamp(depth / Math.max(1, zone), 0, 1);
  const speed = input.reducedMotion
    ? REDUCED_PX_PER_SEC
    : Math.min(MAX_PX_PER_SEC, BASE_PX_PER_SEC + (RAMP_PX_PER_SEC2 * (dwellMs - delay)) / 1000) * intensity;
  const next = clamp(input.offset + direction * speed * (dt / 1000), 0, maxOffset);
  return { offset: next, dwellMs, flipped: false };
}

/**
 * Where the UI thread's next auto-scroll step starts. It integrates from its
 * own last position, because the offset event for that scroll may not be back
 * yet. When the live offset matches none of the offsets it wrote recently,
 * someone else moved the list (FlashList correcting for a row above that
 * changed height), and it continues from the live offset instead.
 */
export function autoScrollOrigin(position: number, live: number, written: readonly number[]): number {
  'worklet';
  if (Number.isNaN(position)) return live;
  if (written.length === 0) return position;
  for (const value of written) if (Math.abs(value - live) < 1) return position;
  return live;
}
