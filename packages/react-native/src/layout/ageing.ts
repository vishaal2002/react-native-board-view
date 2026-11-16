import type { RefObject } from 'react';
import { percentile, type BoardCell } from 'board-view-core';
import type { BoardContextValue } from '../context';
import type { Rect } from '../engine/geometry';
import { PLACEHOLDER_ID, type CellGeometry } from '../engine/types';
import type { ColumnSlot } from './metrics';

/** Dot size, and how close a press must be to pick one up. */
export const DOT = 10;
const DOT_GAP = 2;
const PICK_RADIUS = 14;
export interface Dot {
  readonly itemId: string;
  readonly index: number;
  /** Within the chart: x from the column's left, y from the chart's top. */
  readonly x: number;
  readonly y: number;
  readonly age: number;
  readonly color: string;
  readonly over: boolean;
}

/**
 * The bands an ageing chart draws (sorted, positive) and the age at its top:
 * the oldest card, or a little above the highest band. Default bands: the
 * 50th and 85th percentile of the ages.
 */
export function ageScale(
  values: readonly number[],
  bandsOption: readonly number[] | undefined,
): { bands: number[]; top: number } {
  const bands = (bandsOption ?? [percentile(values, 50), percentile(values, 85)])
    .filter((band): band is number => band != null && Number.isFinite(band) && band > 0)
    .sort((a, b) => a - b);
  const unique = bands.filter((band, index) => band !== bands[index - 1]);
  return { bands: unique, top: Math.max(1, ...values, ...unique.map((band) => band * 1.2)) };
}

/** Dots of one column: height by age, spread sideways when they would overlap. */
export function layoutDots(
  cell: BoardCell<unknown>,
  ages: ReadonlyMap<string, number>,
  top: number,
  chart: { width: number; height: number },
  color: (item: unknown) => string,
  overAge: number | null,
): Dot[] {
  const usable = Math.max(1, chart.height - DOT);
  const center = chart.width / 2 - DOT / 2;
  const reach = Math.max(0, Math.floor((chart.width - DOT) / 2 / (DOT + DOT_GAP)));
  const rows = new Map<number, number>();
  const dots: Dot[] = [];
  cell.ranked.forEach((ref, index) => {
    const age = ages.get(ref.id) ?? 0;
    const y = usable - (Math.min(age, top) / top) * usable;
    const row = Math.round(y / (DOT + DOT_GAP));
    const taken = rows.get(row) ?? 0;
    rows.set(row, taken + 1);
    // 0, +1, -1, +2, -2… slots from the middle, wrapping when the column is full.
    const step = reach === 0 ? 0 : (Math.ceil(taken / 2) % (reach + 1)) * (taken % 2 === 1 ? 1 : -1);
    dots.push({
      itemId: ref.id,
      index,
      x: center + step * (DOT + DOT_GAP),
      y,
      age,
      color: color(cell.items[index]),
      over: overAge != null && age > overAge,
    });
  });
  return dots;
}

export interface AgeLive {
  board: BoardContextValue;
  dots: readonly Dot[];
  slot: ColumnSlot;
  chartTop: number;
  chartHeight: number;
  hidden: string | null;
  getScrollX: () => number;
}

export function ageGeometry(live: RefObject<AgeLive>): CellGeometry {
  const rect = (): Rect => {
    const current = live.current;
    return {
      x: current.slot.x - current.getScrollX(),
      y: current.chartTop,
      width: current.slot.width,
      height: current.chartHeight,
    };
  };
  const dotRect = (dot: Dot): Rect => {
    const outer = rect();
    return { x: outer.x + dot.x, y: outer.y + dot.y, width: DOT, height: DOT };
  };
  return {
    accepts: () => true,
    getRect: rect,
    // Age decides the height, not the drop: a card from elsewhere lands on top, and its own column leaves it put.
    resolve() {
      const current = live.current;
      if (current.hidden == null) return 0;
      return current.board.controller.model.locations.get(current.hidden)?.index ?? 0;
    },
    itemAt(y, x) {
      const current = live.current;
      let best: Dot | null = null;
      let distance = PICK_RADIUS;
      for (const dot of current.dots) {
        const box = dotRect(dot);
        const dx = x == null ? 0 : x - (box.x + DOT / 2);
        const away = Math.hypot(dx, y - (box.y + DOT / 2));
        if (away < distance) {
          distance = away;
          best = dot;
        }
      }
      return best ? { itemId: best.itemId, index: best.index, rect: dotRect(best) } : null;
    },
    itemRect(itemId) {
      const current = live.current;
      if (itemId === PLACEHOLDER_ID) {
        const outer = rect();
        return { x: outer.x + outer.width / 2 - DOT / 2, y: outer.y, width: DOT, height: DOT };
      }
      const dot = current.dots.find((entry) => entry.itemId === itemId);
      return dot ? dotRect(dot) : null;
    },
    visibleItems() {
      return live.current.dots.map((dot) => ({ itemId: dot.itemId, rect: dotRect(dot) }));
    },
  };
}
