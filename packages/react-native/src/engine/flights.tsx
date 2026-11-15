import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import type { ValueStore } from '../store';
import type { Rect } from './geometry';
import type { CellGeometry } from './types';

/**
 * Flights: when the board changes outside a drag (a regroup, a sort, a
 * filter, a move from the sheet or from elsewhere), each card on screen
 * flies from where it was to where it is now, instead of jumping.
 *
 * 1. Capture, while the board renders the change: the geometry still
 *    describes the screen as it is, because the lists render after it.
 * 2. Before that render is painted, a copy of each card covers its old
 *    spot and the real card hides, the way a drop hides its card.
 * 3. Once the lists have laid out, each copy flies to its card's new spot,
 *    or toward its new column and fades when that is off screen.
 * 4. The real cards show under their copies, which go two frames later.
 */

/** More cards than this on screen at once (a big tablet board) jump instead: copies cost a card render each. */
export const MAX_FLIGHTS = 48;
/** Frames for the lists to lay out the change before their rows are read again. */
const SETTLE_FRAMES = 2;
/** Moves shorter than this, in points, are not worth a copy. */
const MIN_DISTANCE = 1;
/** How far a copy lifts while it waits for the lists to draw the change, and how fast. */
const LIFT = 1.04;
const LIFT_MS = 120;
/** A card fading in rises this far into place. */
const ARRIVAL_RISE = 10;

export interface FlightOptions {
  /** Draws a card for its copy. */
  renderCard(itemId: string): ReactNode;
  /** The cell a card is in now, or null when it left the board. */
  locate(itemId: string): string | null;
  /**
   * The cards whose cell or position changed in this update, read once as
   * it is drawn. Only those fly: an update that moves nothing (an edited
   * title, a move settling) costs no copies.
   */
  changes(): ReadonlySet<string>;
  durationMs: number;
}

export interface FlightSource {
  readonly cells: ReadonlyMap<string, CellGeometry>;
  /** Cards hidden under a copy. */
  readonly flying: ValueStore<ReadonlySet<string>>;
  /** A drag is on, or its card is still settling: the drag animates that change itself. */
  busy(): boolean;
  /** The board's size, so cards scrolled off to the side are not captured. */
  bounds(): { width: number; height: number };
}

interface Copy {
  readonly key: string;
  readonly itemId: string;
  readonly from: Rect;
  /** Null until the lists have laid out the change. */
  readonly to: Rect | null;
  /**
   * `out`: its card is not on screen any more, so the copy heads that way and
   * fades. `in`: its card came on screen from somewhere that was not, so the
   * copy fades in where it lands.
   */
  readonly fade: 'in' | 'out' | null;
}

const NO_COPIES: readonly Copy[] = [];
const NONE: ReadonlySet<string> = new Set();

/** Every card on screen now, by id. */
export function visibleRects(source: FlightSource): Map<string, Rect> {
  const { width, height } = source.bounds();
  const rects = new Map<string, Rect>();
  for (const geometry of source.cells.values()) {
    for (const { itemId, rect } of geometry.visibleItems()) {
      if (rect.x + rect.width <= 0 || rect.x >= width || rect.y + rect.height <= 0 || rect.y >= height) continue;
      rects.set(itemId, rect);
    }
  }
  return rects;
}

/** Where a card that is not on screen any more heads: into its new column when that shows, else nowhere. */
function exitRect(source: FlightSource, cellId: string | null, from: Rect): Rect {
  const cell = cellId != null ? source.cells.get(cellId)?.getRect() : null;
  if (!cell) return { ...from, y: from.y + 12 };
  const y = from.y < cell.y ? cell.y : Math.max(cell.y, cell.y + cell.height - from.height);
  return { ...from, x: cell.x + Math.max(0, (cell.width - from.width) / 2), y };
}

function afterFrames(frames: number, run: () => void): void {
  if (frames <= 0) run();
  else requestAnimationFrame(() => afterFrames(frames - 1, run));
}

/**
 * Captures the screen when `revision` changes and flies cards to their new
 * places. Call it in the render of a component above the lists, so the
 * capture runs before they render the change. Returns the copies to draw
 * above the board.
 */
export function useFlights(source: FlightSource, revision: unknown, options: FlightOptions | null): ReactNode {
  const committed = useRef(revision);
  const captured = useRef<{ revision: unknown; rects: Map<string, Rect> } | null>(null);
  // In render, on purpose: by the time any effect runs, the lists have already drawn the change.
  if (options && revision !== committed.current && captured.current?.revision !== revision) {
    captured.current = source.busy() ? null : { revision, rects: visibleRects(source) };
  }
  const [copies, setCopies] = useState<readonly Copy[]>(NO_COPIES);
  const run = useRef(0);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  // Each copy's way to start flying, so a flight starts the moment its target is known: a React
  // render of the copies can wait behind the lists' own work for a big change.
  const flyers = useRef(new Map<string, Fly>());
  const register = useCallback((key: string, fly: Fly) => {
    flyers.current.set(key, fly);
    return () => {
      if (flyers.current.get(key) === fly) flyers.current.delete(key);
    };
  }, []);

  useLayoutEffect(() => {
    if (committed.current === revision) return;
    committed.current = revision;
    const before = captured.current;
    captured.current = null;
    // A newer change ends the flights of the last one: their cards are already in place underneath.
    run.current += 1;
    const id = run.current;
    const current = optionsRef.current;
    const changed = before && before.revision === revision && current ? current.changes() : NONE;
    const start = before ? [...before.rects].filter(([itemId]) => changed.has(itemId)) : [];
    if (!current || changed.size === 0 || start.length > MAX_FLIGHTS) {
      source.flying.set(NONE);
      setCopies(NO_COPIES);
      return;
    }
    // Before paint: each copy covers its card's old spot, and every card that changed place hides in its new one.
    source.flying.set(changed);
    setCopies(start.map(([itemId, from]) => ({ key: `${id}:${itemId}`, itemId, from, to: null, fade: null })));

    afterFrames(SETTLE_FRAMES, () => {
      if (run.current !== id) return;
      const after = visibleRects(source);
      const moving: Copy[] = [];
      for (const [itemId, from] of start) {
        const to = after.get(itemId);
        if (to && Math.abs(to.x - from.x) < MIN_DISTANCE && Math.abs(to.y - from.y) < MIN_DISTANCE) continue;
        moving.push({
          key: `${id}:${itemId}`,
          itemId,
          from,
          to: to ?? exitRect(source, current.locate(itemId), from),
          fade: to ? null : 'out',
        });
      }
      // Cards that came on screen from off it fade in where they land.
      for (const [itemId, to] of after) {
        if (moving.length >= MAX_FLIGHTS) break;
        if (!changed.has(itemId) || before?.rects.has(itemId)) continue;
        moving.push({ key: `${id}:${itemId}`, itemId, from: { ...to, y: to.y + ARRIVAL_RISE }, to, fade: 'in' });
      }
      for (const copy of moving) if (copy.to && copy.fade !== 'in') flyers.current.get(copy.key)?.(copy.to, copy.fade);
      // Everything else that changed place shows again at once: it stayed put, or it is off screen.
      source.flying.set(new Set(moving.filter((copy) => copy.fade !== 'out').map((copy) => copy.itemId)));
      setCopies(moving);
      if (moving.length === 0) return;
      setTimeout(() => {
        if (run.current !== id) return;
        source.flying.set(NONE);
        afterFrames(2, () => {
          if (run.current === id) setCopies(NO_COPIES);
        });
      }, current.durationMs + 16);
    });
  }, [revision, source]);

  useEffect(
    () => () => {
      run.current += 1;
      source.flying.set(NONE);
    },
    [source],
  );

  if (copies.length === 0 || !options) return null;
  return (
    <View pointerEvents="none" style={styles.layer} importantForAccessibility="no-hide-descendants">
      {copies.map((copy) => (
        <FlightCopy
          key={copy.key}
          copy={copy}
          render={options.renderCard}
          durationMs={options.durationMs}
          register={register}
        />
      ))}
    </View>
  );
}

type Fly = (to: Rect, fade: Copy['fade']) => void;

const FlightCopy = memo(function FlightCopy({
  copy,
  render,
  durationMs,
  register,
}: {
  copy: Copy;
  render: (itemId: string) => ReactNode;
  durationMs: number;
  register: (key: string, fly: Fly) => () => void;
}) {
  const x = useSharedValue(copy.from.x);
  const y = useSharedValue(copy.from.y);
  const opacity = useSharedValue(copy.fade === 'in' ? 0 : 1);
  const scale = useSharedValue(1);
  const { to, fade } = copy;
  // The lists may take a while to draw a big change (new columns mount on the JS thread). Until they
  // have, the copy lifts where it is, on the UI thread, so the change answers at once and then moves.
  useLayoutEffect(() => {
    if (copy.fade !== 'in') scale.value = withTiming(LIFT, { duration: LIFT_MS });
  }, [copy.fade, scale]);
  const flown = useRef(false);
  const fly = useCallback<Fly>(
    (target, kind) => {
      if (flown.current) return;
      flown.current = true;
      const timing = { duration: durationMs, easing: Easing.bezier(0.2, 0.8, 0.2, 1) };
      x.value = withTiming(target.x, timing);
      y.value = withTiming(target.y, timing);
      scale.value = withTiming(1, timing);
      if (kind) opacity.value = withTiming(kind === 'in' ? 1 : 0, timing);
    },
    [durationMs, opacity, scale, x, y],
  );
  useLayoutEffect(() => register(copy.key, fly), [copy.key, fly, register]);
  // Copies that fade in are made with their target; the others usually fly before they render it.
  useLayoutEffect(() => {
    if (to) fly(to, fade);
  }, [fade, fly, to]);
  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: x.value }, { translateY: y.value }, { scale: scale.value }],
  }));
  return (
    <Animated.View style={[styles.copy, { width: (to ?? copy.from).width }, style]}>
      {render(copy.itemId)}
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  layer: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, zIndex: 999, elevation: 999 },
  copy: { position: 'absolute', left: 0, top: 0 },
});
