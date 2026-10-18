import type { BoardLayout, BoardTheme } from '../types';

/** Default `autoBreakpoint`: boards narrower than this use the paged phone layout under `layout="auto"`. */
export const COMPACT_WIDTH = 600;
const PAGED_PADDING = 12;
const PAGED_PEEK = 28;
const PAGED_GAP = 8;
const MIN_PAGED_COLUMN = 220;

export type ResolvedLayout = 'paged' | 'multi' | 'fit' | 'stacked' | 'matrix';
/** Width of the matrix layout's lane labels, down its left side. */
export const MATRIX_GUTTER = 28;

export interface ColumnSlot {
  /** Left edge in scroll-content coordinates. */
  readonly x: number;
  readonly width: number;
  readonly collapsed: boolean;
}

export interface ColumnMetrics {
  readonly mode: ResolvedLayout;
  /** One entry per column in visual order (mirrored for right-to-left). */
  readonly slots: readonly ColumnSlot[];
  readonly gap: number;
  readonly paddingStart: number;
  readonly paddingEnd: number;
  /** Snap interval in the paged layout. */
  readonly pageSize: number;
  readonly contentWidth: number;
  /** False when everything fits: no horizontal scrolling or auto-scroll. */
  readonly scrollable: boolean;
}

/**
 * A paged board peeks the next column. Show more and the column footer on that
 * sliver are clipped, so only the column on screen draws them.
 */
export function showsCellFooter(mode: ResolvedLayout, visualIndex: number, page: number): boolean {
  return mode !== 'paged' || visualIndex === page;
}

export function resolveLayout(layout: BoardLayout, boardWidth: number, breakpoint = COMPACT_WIDTH): ResolvedLayout {
  if (layout !== 'auto') return layout;
  return boardWidth < breakpoint ? 'paged' : 'multi';
}

type MetricsTheme = Pick<BoardTheme, 'columnWidth' | 'columnGap' | 'collapsedColumnWidth' | 'minColumnWidth'>;

function place(
  widths: readonly number[],
  collapsed: readonly boolean[],
  paddingStart: number,
  gap: number,
): ColumnSlot[] {
  let x = paddingStart;
  return widths.map((width, index) => {
    const slot = { x, width, collapsed: collapsed[index] ?? false };
    x += width + gap;
    return slot;
  });
}

function contentEnd(slots: readonly ColumnSlot[], paddingStart: number): number {
  const last = slots.at(-1);
  return last ? last.x + last.width : paddingStart;
}

/**
 * Column geometry for a board width. `collapsed` is in visual order. The
 * paged layout ignores collapsing: every page is one full column.
 */
export function columnMetrics(
  mode: ResolvedLayout,
  boardWidth: number,
  collapsed: readonly boolean[],
  theme: MetricsTheme,
): ColumnMetrics {
  const count = collapsed.length;
  if (mode === 'paged') {
    const width = Math.max(MIN_PAGED_COLUMN, boardWidth - PAGED_PADDING * 2 - PAGED_PEEK);
    const slots = place(
      new Array<number>(count).fill(width),
      new Array<boolean>(count).fill(false),
      PAGED_PADDING,
      PAGED_GAP,
    );
    // Trailing space lets the last column snap to the same spot as the others.
    const paddingEnd = Math.max(PAGED_PADDING, boardWidth - PAGED_PADDING - width);
    const contentWidth = contentEnd(slots, PAGED_PADDING) + paddingEnd;
    return {
      mode,
      slots,
      gap: PAGED_GAP,
      paddingStart: PAGED_PADDING,
      paddingEnd,
      pageSize: width + PAGED_GAP,
      contentWidth,
      scrollable: contentWidth > boardWidth + 0.5,
    };
  }

  const gap = theme.columnGap;
  if (mode === 'stacked') {
    const slots = [{ x: 0, width: boardWidth, collapsed: false }];
    return {
      mode,
      slots,
      gap,
      paddingStart: 0,
      paddingEnd: 0,
      pageSize: boardWidth,
      contentWidth: boardWidth,
      scrollable: false,
    };
  }

  if (mode === 'matrix') {
    // Every column on screen, never scrolling: the matrix is for small grids.
    const share = Math.max(0, (boardWidth - MATRIX_GUTTER - gap * count) / Math.max(1, count));
    const slots = place(
      new Array<number>(count).fill(share),
      new Array<boolean>(count).fill(false),
      MATRIX_GUTTER,
      gap,
    );
    return {
      mode,
      slots,
      gap,
      paddingStart: MATRIX_GUTTER,
      paddingEnd: gap,
      pageSize: boardWidth,
      contentWidth: boardWidth,
      scrollable: false,
    };
  }

  let widths: number[];
  if (mode === 'fit') {
    const strips = collapsed.filter(Boolean).length;
    const open = count - strips;
    const free = boardWidth - gap * 2 - gap * Math.max(0, count - 1) - strips * theme.collapsedColumnWidth;
    const share = open > 0 ? Math.max(theme.minColumnWidth, free / open) : 0;
    widths = collapsed.map((isCollapsed) => (isCollapsed ? theme.collapsedColumnWidth : share));
  } else {
    widths = collapsed.map((isCollapsed) => (isCollapsed ? theme.collapsedColumnWidth : theme.columnWidth));
  }
  const slots = place(widths, collapsed, gap, gap);
  const contentWidth = contentEnd(slots, gap) + gap;
  return {
    mode,
    slots,
    gap,
    paddingStart: gap,
    paddingEnd: gap,
    pageSize: theme.columnWidth + gap,
    contentWidth,
    scrollable: contentWidth > boardWidth + 0.5,
  };
}

/** Visual slot under a content x, or -1 in a gap or padding. */
export function slotAtX(metrics: ColumnMetrics, contentX: number): number {
  return metrics.slots.findIndex((slot) => contentX >= slot.x && contentX < slot.x + slot.width);
}

/** Visual slots to render for a scroll offset: what is on screen plus `buffer` on each side. */
export function visibleSlots(
  metrics: ColumnMetrics,
  offset: number,
  viewport: number,
  buffer = 1,
): { first: number; last: number } {
  const { slots } = metrics;
  if (slots.length === 0) return { first: 0, last: -1 };
  let first = slots.findIndex((slot) => slot.x + slot.width > offset);
  if (first < 0) first = slots.length - 1;
  let last = first;
  while (last + 1 < slots.length && (slots[last + 1]?.x ?? Infinity) < offset + viewport) last += 1;
  return { first: Math.max(0, first - buffer), last: Math.min(slots.length - 1, last + buffer) };
}

/** Offset that brings a visual slot to the start of the viewport, clamped to the content. */
export function offsetForSlot(metrics: ColumnMetrics, slot: number, viewport: number): number {
  const max = Math.max(0, metrics.contentWidth - viewport);
  const target =
    metrics.mode === 'paged' ? slot * metrics.pageSize : (metrics.slots[slot]?.x ?? 0) - metrics.paddingStart;
  return Math.min(max, Math.max(0, target));
}

/** The paged layout's current page for an offset. */
export function pageAt(metrics: ColumnMetrics, offset: number): number {
  if (metrics.slots.length === 0) return 0;
  return Math.min(metrics.slots.length - 1, Math.max(0, Math.round(offset / metrics.pageSize)));
}

/** Visual order of logical column indexes; mirrored for right-to-left. */
export function visualSlot(index: number, count: number, rtl: boolean): number {
  return rtl ? count - 1 - index : index;
}
