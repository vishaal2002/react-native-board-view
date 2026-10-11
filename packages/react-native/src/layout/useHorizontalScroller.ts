import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ScrollView } from 'react-native';
import { useAnimatedScrollHandler } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useBoard } from '../context';
import type { ScrollerHandle } from '../engine/types';
import { offsetForSlot, pageAt, slotAtX, visibleSlots, visualSlot } from './metrics';

/**
 * Horizontal board scroller shared by the column and swimlane layouts.
 * Tracks the offset in JS without re-rendering on every frame: React state
 * changes only when the rendered column window or the current page changes.
 */
export function useHorizontalScroller() {
  const board = useBoard();
  const { metrics, boardWidth, scrollX, page, adapter, autoScroll, rtl, reducedMotion, controller, props } = board;
  const columns = controller.model.columns;
  const scrollRef = useRef<ScrollView>(null);
  const live = useRef({ metrics, boardWidth, columns, onColumnChange: props.onColumnChange });
  live.current = { metrics, boardWidth, columns, onColumnChange: props.onColumnChange };

  const [initialOffset] = useState(() => {
    const seed = props.columnId ?? props.initialColumnId;
    const at = seed ? columns.findIndex((column) => column.id === seed) : -1;
    if (at < 0 && !rtl) return 0;
    const slot = at < 0 ? metrics.slots.length - 1 : visualSlot(at, columns.length, rtl);
    return offsetForSlot(metrics, slot, boardWidth);
  });
  const offset = useRef(initialOffset);
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
      if (current.metrics.mode !== 'paged') return;
      const slot = pageAt(current.metrics, x);
      if (pendingSlot.current !== null && slot !== pendingSlot.current) return;
      pendingSlot.current = null;
      if (slot === page.get()) return;
      page.set(slot);
      const column = current.columns[visualSlot(slot, current.columns.length, rtl)];
      if (column) {
        echoed.current = column.id;
        current.onColumnChange?.(column.id);
      }
    },
    [page, rtl],
  );

  const releasePending = useCallback(() => {
    pendingSlot.current = null;
  }, []);

  const onScroll = useAnimatedScrollHandler(
    {
      onBeginDrag: () => {
        scheduleOnRN(releasePending);
      },
      onScroll: (event) => {
        scrollX.value = event.contentOffset.x;
        scheduleOnRN(sync, event.contentOffset.x);
      },
    },
    [releasePending, sync],
  );

  const scrollTo = useCallback((x: number, animated: boolean) => {
    offset.current = x;
    scrollRef.current?.scrollTo({ x, y: 0, animated });
  }, []);

  const toSlot = useCallback(
    (slot: number, animated: boolean) => {
      const current = live.current;
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
    };
  }, [autoScroll, metrics.mode, metrics.scrollable, scrollTo]);
  adapter.useScroller('horizontal', handle);

  // Keep the same column in view across rotation, resize and collapsing.
  // The page store lives on Board and survives a layout remount. On mount the
  // ref is seeded with the current metrics, so the resize branch never runs
  // and the tabs can highlight a column this scroller is not showing.
  const previous = useRef({ metrics, boardWidth });
  useLayoutEffect(() => {
    const before = previous.current;
    previous.current = { metrics, boardWidth };
    if (before.metrics === metrics && before.boardWidth === boardWidth) {
      sync(offset.current);
      return;
    }
    const slot =
      before.metrics.mode === 'paged'
        ? pageAt(before.metrics, offset.current)
        : Math.max(0, slotAtX(before.metrics, offset.current + before.metrics.paddingStart));
    const next = offsetForSlot(metrics, Math.min(slot, metrics.slots.length - 1), boardWidth);
    if (Math.abs(next - offset.current) > 0.5) scrollTo(next, false);
    sync(next);
  }, [boardWidth, metrics, scrollTo, sync]);

  const columnKey = columns.map((column) => column.id).join('\0');
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
    if (page.get() !== slot) page.set(slot);
    scrollTo(x, !reducedMotion);
  }, [columnId, columnKey, page, reducedMotion, rtl, scrollTo]);

  const getOffset = useCallback(() => offset.current, []);

  return { scrollRef, onScroll, range, initialOffset, scrollTo, toSlot, getOffset };
}
