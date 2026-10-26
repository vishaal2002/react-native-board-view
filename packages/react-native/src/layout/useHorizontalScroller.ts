import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type Animated from 'react-native-reanimated';
import { useAnimatedRef, useAnimatedScrollHandler } from 'react-native-reanimated';
import { useUiTargetId } from './uiScroll';
import { scheduleOnRN } from 'react-native-worklets';
import { useBoard } from '../context';
import type { ScrollerHandle } from '../engine/types';
import { leadingSlot, offsetForSlot, pageAt, sameMetrics, visibleSlots, visualSlot } from './metrics';

/** `onEdgeReached` fires within this share of the board width from either end. */
const EDGE_FRACTION = 0.5;
/** How long after a resize its scroll is applied again when the content grows. */
const RESIZE_SETTLE_MS = 1000;

/**
 * Horizontal board scroller shared by the column and swimlane layouts.
 * Tracks the offset in JS without re-rendering on every frame: React state
 * changes only when the rendered column window or the current page changes.
 */
export function useHorizontalScroller() {
  const board = useBoard();
  const { metrics, boardWidth, scrollX, page, adapter, autoScroll, rtl, reducedMotion, controller, props } = board;
  const { lastColumn } = board;
  const columns = controller.model.columns;
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const targetId = useUiTargetId();
  const live = useRef({
    metrics,
    boardWidth,
    columns,
    onColumnChange: props.onColumnChange,
    onEdgeReached: props.onEdgeReached,
  });
  live.current = {
    metrics,
    boardWidth,
    columns,
    onColumnChange: props.onColumnChange,
    onEdgeReached: props.onEdgeReached,
  };
  // The content width each edge last fired for: an edge fires again only once columns were added.
  const edgesFired = useRef<{ start: number | null; end: number | null }>({ start: null, end: null });
  // A finger or a fling is moving the board. Columns added in front shift everything, and the board scrolls
  // to keep its column; a fling in progress (iOS) overrides that scroll. So `start` waits for rest.
  const moving = useRef({ dragging: false, momentum: false });

  const [initialOffset] = useState(() => {
    // A remount (rotation across the auto breakpoint, the overview closing) keeps the column the user was on.
    const seed = props.columnId ?? lastColumn.current ?? props.initialColumnId;
    const at = seed ? columns.findIndex((column) => column.id === seed) : -1;
    if (at < 0 && !rtl) return 0;
    const slot = at < 0 ? metrics.slots.length - 1 : visualSlot(at, columns.length, rtl);
    return offsetForSlot(metrics, slot, boardWidth);
  });
  const offset = useRef(initialOffset);
  // iOS sends no scroll event for the initial `contentOffset`: start the shared offset there, so pinned
  // headers and the planner's Today button see where the board opened.
  useLayoutEffect(() => {
    scrollX.value = initialOffset;
  }, [initialOffset, scrollX]);
  const [range, setRange] = useState(() => visibleSlots(metrics, initialOffset, boardWidth));
  // The column id we just reported from a user swipe. The parent writes it
  // back into `columnId`, and that echo must not start another scroll.
  const echoed = useRef<string | null>(null);
  // Visual slot of a scroll this board started. Pages crossed on the way there
  // are not user swipes, so they must not call `onColumnChange`.
  const pendingSlot = useRef<number | null>(null);

  const sync = useCallback(
    (x: number) => {
      offset.current = x;
      const current = live.current;
      const next = visibleSlots(current.metrics, x, current.boardWidth);
      setRange((previous) => (previous.first === next.first && previous.last === next.last ? previous : next));
      const reached = current.onEdgeReached;
      const width = current.metrics.contentWidth;
      if (reached && current.metrics.scrollable) {
        const near = current.boardWidth * EDGE_FRACTION;
        const visualEdge = x <= near ? 'left' : x >= width - current.boardWidth - near ? 'right' : null;
        // The logical start is the first column: on the right in right-to-left layouts.
        const edge = visualEdge === null ? null : (visualEdge === 'left') !== rtl ? 'start' : 'end';
        const resting = !moving.current.dragging && !moving.current.momentum;
        if (edge && edgesFired.current[edge] !== width && (edge === 'end' || resting)) {
          edgesFired.current[edge] = width;
          reached(edge);
        }
      } else if (reached && current.columns.length > 0 && edgesFired.current.end !== width) {
        // Everything fits: the end is already on screen, so a short planner can grow until it scrolls.
        edgesFired.current.end = width;
        reached('end');
      }
      const slot = current.metrics.mode === 'paged' ? pageAt(current.metrics, x) : leadingSlot(current.metrics, x);
      if (pendingSlot.current !== null && slot !== pendingSlot.current) return;
      pendingSlot.current = null;
      const column = current.columns[visualSlot(slot, current.columns.length, rtl)];
      // The overview is its own scroller: where it sits says nothing about where the board was.
      if (column && !board.overview) lastColumn.current = column.id;
      if (slot === page.get()) return;
      page.set(slot);
      if (column) {
        echoed.current = column.id;
        current.onColumnChange?.(column.id);
      }
    },
    [board.overview, lastColumn, page, rtl],
  );

  // Where a resize scrolled to. Android can move the board again as the content view takes its new size,
  // so for a moment after a resize the board scrolls back there. A user scroll drops it.
  const resized = useRef<{ x: number; at: number } | null>(null);
  const releasePending = useCallback(() => {
    pendingSlot.current = null;
    resized.current = null;
    moving.current.dragging = true;
  }, []);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** A drag or a fling ended. A fling starts just after its drag ends, so look again a moment later. */
  const onMotion = useCallback(
    (kind: 'dragEnd' | 'momentumBegin' | 'momentumEnd') => {
      if (kind === 'dragEnd') moving.current.dragging = false;
      else moving.current.momentum = kind === 'momentumBegin';
      if (kind === 'momentumBegin') return;
      if (settleTimer.current) clearTimeout(settleTimer.current);
      settleTimer.current = setTimeout(() => {
        if (!moving.current.dragging && !moving.current.momentum) sync(offset.current);
      }, 80);
    },
    [sync],
  );
  useEffect(
    () => () => {
      if (settleTimer.current) clearTimeout(settleTimer.current);
    },
    [],
  );

  const scrollTo = useCallback(
    (x: number, animated: boolean) => {
      offset.current = x;
      scrollRef.current?.scrollTo({ x, y: 0, animated });
    },
    [scrollRef],
  );

  /** Android moved the board after a resize: scroll back to the resize's column. */
  const holdResize = useCallback((): boolean => {
    const target = resized.current;
    if (!target) return false;
    if (moving.current.dragging || Date.now() - target.at > RESIZE_SETTLE_MS) {
      resized.current = null;
      return false;
    }
    if (Math.abs(target.x - offset.current) > 0.5) scrollTo(target.x, false);
    sync(target.x);
    return true;
  }, [scrollTo, sync]);
  const onNativeScroll = useCallback(
    (x: number) => {
      offset.current = x;
      if (Math.abs(x - (resized.current?.x ?? x)) > 0.5 && holdResize()) return;
      sync(x);
    },
    [holdResize, sync],
  );

  const onScroll = useAnimatedScrollHandler({
    onBeginDrag: () => {
      scheduleOnRN(releasePending);
    },
    onEndDrag: () => {
      scheduleOnRN(onMotion, 'dragEnd');
    },
    onMomentumBegin: () => {
      scheduleOnRN(onMotion, 'momentumBegin');
    },
    onMomentumEnd: () => {
      scheduleOnRN(onMotion, 'momentumEnd');
    },
    onScroll: (event) => {
      scrollX.value = event.contentOffset.x;
      scheduleOnRN(onNativeScroll, event.contentOffset.x);
    },
  });

  const toSlot = useCallback(
    (slot: number, animated: boolean) => {
      const current = live.current;
      resized.current = null;
      scrollTo(offsetForSlot(current.metrics, slot, current.boardWidth), animated);
    },
    [scrollTo],
  );

  const handle = useMemo<ScrollerHandle | null>(() => {
    if (!metrics.scrollable || !autoScroll) return null;
    return {
      axis: 'x',
      mode: metrics.mode === 'paged' ? 'paged' : 'continuous',
      getOffset: () => offset.current,
      getMaxOffset: () => Math.max(0, live.current.metrics.contentWidth - live.current.boardWidth),
      getViewport: () => ({ start: 0, size: live.current.boardWidth }),
      getPageSize: () => live.current.metrics.pageSize,
      scrollTo,
      // Paged boards flip one page at a time from JS; free scrolling runs on the UI thread.
      ui: metrics.mode === 'paged' ? undefined : { id: targetId, ref: scrollRef, offset: scrollX },
    };
  }, [autoScroll, metrics.mode, metrics.scrollable, scrollRef, scrollTo, scrollX, targetId]);
  adapter.useScroller('horizontal', handle);

  // Keep the same column in view across rotation, resize and collapsing.
  // The page store lives on Board and survives a layout remount. On mount the
  // ref is seeded with the current metrics, so the resize branch never runs
  // and the tabs can highlight a column this scroller is not showing.
  const previous = useRef({ metrics, boardWidth, columns });
  useLayoutEffect(() => {
    const before = previous.current;
    previous.current = { metrics, boardWidth, columns };
    if (before.boardWidth === boardWidth && before.columns === columns && sameMetrics(before.metrics, metrics)) {
      sync(offset.current);
      return;
    }
    // Columns were added or removed (days prepended in the planner): keep the same column on screen.
    if (before.columns !== columns && before.boardWidth === boardWidth) {
      const slotBefore = leadingSlot(before.metrics, offset.current);
      const anchor = before.columns[visualSlot(slotBefore, before.columns.length, rtl)];
      const at = anchor ? columns.findIndex((column) => column.id === anchor.id) : -1;
      if (anchor && at >= 0) {
        const slotNow = visualSlot(at, columns.length, rtl);
        const within = offset.current - (before.metrics.slots[slotBefore]?.x ?? 0);
        const max = Math.max(0, metrics.contentWidth - boardWidth);
        const next =
          metrics.mode === 'paged'
            ? offsetForSlot(metrics, slotNow, boardWidth)
            : Math.min(max, Math.max(0, (metrics.slots[slotNow]?.x ?? 0) + within));
        if (Math.abs(next - offset.current) > 0.5) scrollTo(next, false);
        sync(next);
        return;
      }
    }
    if (before.boardWidth === boardWidth && before.metrics.mode === metrics.mode && metrics.mode !== 'paged') {
      // Same width, new geometry (a column collapsed or expanded): keep the offset, clamped to the content.
      const next = Math.min(Math.max(0, metrics.contentWidth - boardWidth), offset.current);
      if (Math.abs(next - offset.current) > 0.5) scrollTo(next, false);
      sync(next);
      return;
    }
    const slot =
      before.metrics.mode === 'paged'
        ? pageAt(before.metrics, offset.current)
        : leadingSlot(before.metrics, offset.current);
    const next = offsetForSlot(metrics, Math.min(slot, metrics.slots.length - 1), boardWidth);
    if (Math.abs(next - offset.current) > 0.5) scrollTo(next, false);
    sync(next);
    if (before.boardWidth !== boardWidth) resized.current = { x: next, at: Date.now() };
  }, [boardWidth, columns, metrics, rtl, scrollTo, sync]);

  const onContentSizeChange = useCallback(() => {
    holdResize();
  }, [holdResize]);

  // Only a new `columnId` scrolls: columns changing (days added, empty ones hidden) must not pull the board back to it.
  const columnId = props.columnId;
  useLayoutEffect(() => {
    if (!columnId) return;
    if (columnId === echoed.current) {
      echoed.current = null;
      return;
    }
    const current = live.current;
    const at = current.columns.findIndex((column) => column.id === columnId);
    if (at < 0) return;
    const slot = visualSlot(at, current.columns.length, rtl);
    const x = offsetForSlot(current.metrics, slot, current.boardWidth);
    if (Math.abs(x - offset.current) <= 0.5) return;
    pendingSlot.current = slot;
    resized.current = null;
    if (page.get() !== slot) page.set(slot);
    scrollTo(x, !reducedMotion);
  }, [columnId, page, reducedMotion, rtl, scrollTo]);

  const getOffset = useCallback(() => offset.current, []);

  return { scrollRef, onScroll, onContentSizeChange, range, initialOffset, scrollTo, toSlot, getOffset };
}
