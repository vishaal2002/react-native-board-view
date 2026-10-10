import {
  createContext,
  memo,
  use,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { LayoutAnimation, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  measure,
  useAnimatedRef,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { edgeZone, stepAutoScroll } from './autoScroll';
import { containsPoint, type Rect } from './geometry';
import {
  PLACEHOLDER_ID,
  type CellGeometry,
  type CellPlacement,
  type DragAdapter,
  type DragBoardProps,
  type DragCardProps,
  type DragCellProps,
  type DragPlacement,
  type PlaceholderProps,
  type ScrollerHandle,
} from './types';

/** Long-press released within this distance (px) opens the menu instead of dropping. */
const MENU_SLOP = 10;
const SETTLE_MS = 200;
const LIFT_SCALE = 1.03;
/** A new drop slot must hold for this many frames before the placeholder moves. */
const STABLE_FRAMES = 2;
/** Frames to let lists lay out after the placeholder moves before reading geometry again. */
const SETTLE_FRAMES = 2;
const PLACEHOLDER_ANIMATION = LayoutAnimation.create(
  140,
  LayoutAnimation.Types.easeInEaseOut,
  LayoutAnimation.Properties.opacity,
);

const PHASE_IDLE = 0;
const PHASE_DRAGGING = 1;
const PHASE_SETTLING = 2;

interface Point {
  x: number;
  y: number;
}

interface Outline {
  visible: boolean;
  allowed: boolean;
  /** In scroll-content coordinates when `follow` is set, else board coordinates. */
  x: number;
  follow: boolean;
  y: number;
  width: number;
  height: number;
}

const HIDDEN_OUTLINE: Outline = { visible: false, allowed: true, x: 0, follow: false, y: 0, width: 0, height: 0 };

type Placement = DragPlacement;

const NO_PLACEMENT: CellPlacement = { hiddenItemId: null, placeholderIndex: null, placeholderHeight: 0 };

function placementFor(placement: Placement | null, cellId: string): CellPlacement {
  if (!placement) return NO_PLACEMENT;
  const hiddenItemId = placement.sourceCellId === cellId ? placement.itemId : null;
  const placeholderIndex = placement.cellId === cellId ? placement.index : null;
  if (hiddenItemId === null && placeholderIndex === null) return NO_PLACEMENT;
  return { hiddenItemId, placeholderIndex, placeholderHeight: placement.height };
}

interface EngineStore {
  activeId: SharedValue<string>;
  phase: SharedValue<number>;
  origin: SharedValue<Point>;
  grab: SharedValue<Point>;
  hoverX: SharedValue<number>;
  hoverY: SharedValue<number>;
  hoverWidth: SharedValue<number>;
  hoverHeight: SharedValue<number>;
  hoverOpacity: SharedValue<number>;
  hoverReady: SharedValue<boolean>;
  outline: SharedValue<Outline>;
  cells: Map<string, CellGeometry>;
  scrollers: { horizontal: ScrollerHandle | null; vertical: ScrollerHandle | null };
  placement: { current: Placement | null };
  listeners: Set<() => void>;
}

const EngineContext = createContext<EngineStore | null>(null);

function useEngine(): EngineStore {
  const store = use(EngineContext);
  if (!store) throw new Error('react-native-board-view: drag components must render inside the drag Provider.');
  return store;
}

function DragProvider({ children }: { children: ReactNode }) {
  const activeId = useSharedValue('');
  const phase = useSharedValue(PHASE_IDLE);
  const origin = useSharedValue<Point>({ x: 0, y: 0 });
  const grab = useSharedValue<Point>({ x: 0, y: 0 });
  const hoverX = useSharedValue(0);
  const hoverY = useSharedValue(0);
  const hoverWidth = useSharedValue(0);
  const hoverHeight = useSharedValue(0);
  const hoverOpacity = useSharedValue(1);
  const hoverReady = useSharedValue(false);
  const outline = useSharedValue<Outline>(HIDDEN_OUTLINE);
  const [store] = useState<EngineStore>(() => ({
    activeId,
    phase,
    origin,
    grab,
    hoverX,
    hoverY,
    hoverWidth,
    hoverHeight,
    hoverOpacity,
    hoverReady,
    outline,
    cells: new Map(),
    scrollers: { horizontal: null, vertical: null },
    placement: { current: null },
    listeners: new Set(),
  }));
  return <EngineContext value={store}>{children}</EngineContext>;
}

function samePlacement(a: Placement | null, b: Placement | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.itemId === b.itemId && a.cellId === b.cellId && a.index === b.index && a.height === b.height;
}

function setPlacement(store: EngineStore, next: Placement | null, animate: boolean): void {
  if (samePlacement(store.placement.current, next)) return;
  if (animate) LayoutAnimation.configureNext(PLACEHOLDER_ANIMATION);
  store.placement.current = next;
  for (const listener of store.listeners) listener();
}

function useSubscribe(store: EngineStore) {
  return useCallback(
    (listener: () => void) => {
      store.listeners.add(listener);
      return () => {
        store.listeners.delete(listener);
      };
    },
    [store],
  );
}

function usePlacement(cellId: string): CellPlacement {
  const store = useEngine();
  const subscribe = useSubscribe(store);
  const cache = useRef<CellPlacement>(NO_PLACEMENT);
  const read = () => {
    const next = placementFor(store.placement.current, cellId);
    const previous = cache.current;
    if (
      previous.hiddenItemId === next.hiddenItemId &&
      previous.placeholderIndex === next.placeholderIndex &&
      previous.placeholderHeight === next.placeholderHeight
    ) {
      return previous;
    }
    cache.current = next;
    return next;
  };
  return useSyncExternalStore(subscribe, read, read);
}

function useDragSource(): { itemId: string; cellId: string } | null {
  const store = useEngine();
  const subscribe = useSubscribe(store);
  const cache = useRef<{ itemId: string; cellId: string } | null>(null);
  const read = () => {
    const placement = store.placement.current;
    const previous = cache.current;
    if (!placement) {
      cache.current = null;
      return null;
    }
    if (previous && previous.itemId === placement.itemId && previous.cellId === placement.sourceCellId) return previous;
    cache.current = { itemId: placement.itemId, cellId: placement.sourceCellId };
    return cache.current;
  };
  return useSyncExternalStore(subscribe, read, read);
}

function usePlacementState(): Placement | null {
  const store = useEngine();
  const subscribe = useSubscribe(store);
  return useSyncExternalStore(subscribe, () => store.placement.current);
}

function useScroller(key: 'horizontal' | 'vertical', handle: ScrollerHandle | null): void {
  const store = useEngine();
  useEffect(() => {
    store.scrollers[key] = handle;
    return () => {
      if (store.scrollers[key] === handle) store.scrollers[key] = null;
    };
  }, [store, key, handle]);
}

function DragCell({ cellId, geometry, style, onLayout, children }: DragCellProps) {
  const store = useEngine();
  useLayoutEffect(() => {
    store.cells.set(cellId, geometry);
    return () => {
      if (store.cells.get(cellId) === geometry) store.cells.delete(cellId);
    };
  }, [store, cellId, geometry]);
  return (
    <View style={style} onLayout={onLayout}>
      {children}
    </View>
  );
}

const DragCard = memo(function DragCard({ itemId, children }: DragCardProps) {
  const { activeId } = useEngine();
  // While the lifted copy settles over a card's new spot, the card stays hidden underneath.
  const style = useAnimatedStyle(() => ({ opacity: activeId.value === itemId ? 0 : 1 }), [itemId]);
  return <Animated.View style={style}>{children}</Animated.View>;
});

function Placeholder({ height, radius, color, render }: PlaceholderProps) {
  return (
    <View style={{ height }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      {render ? (
        render()
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.placeholder, { borderRadius: radius, borderColor: color }]}>
          <View
            style={[StyleSheet.absoluteFill, styles.placeholderTint, { backgroundColor: color, borderRadius: radius }]}
          />
        </View>
      )}
    </View>
  );
}

interface ActiveDrag {
  itemId: string;
  sourceCellId: string;
  sourceIndex: number;
  height: number;
  start: Point;
  pointer: Point;
  lastTime: number;
  dwellX: number;
  dwellY: number;
  scrolled: boolean;
  /** Slot seen last frame, waiting to be confirmed. */
  candidate: { cellId: string; index: number } | null;
  candidateFrames: number;
  framesSinceMove: number;
  outlineKey: string;
  /** The pointer is over a cell that accepts the card. */
  overAllowed: boolean;
}

function findCell(cells: Map<string, CellGeometry>, x: number, y: number): [string, CellGeometry, Rect] | null {
  for (const [cellId, geometry] of cells) {
    const rect = geometry.getRect();
    if (rect && containsPoint(rect, x, y)) return [cellId, geometry, rect];
  }
  return null;
}

function DragBoard(props: DragBoardProps) {
  const store = useEngine();
  const propsRef = useRef(props);
  propsRef.current = props;
  const boardRef = useAnimatedRef<Animated.View>();
  const [hoverItemId, setHoverItemId] = useState<string | null>(null);
  const drag = useRef<ActiveDrag | null>(null);
  const frameRef = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const { activeId, phase, origin, grab, hoverX, hoverY, hoverWidth, hoverHeight, hoverOpacity, hoverReady, outline } =
    store;

  const later = useCallback((ms: number, run: () => void) => {
    timers.current.push(setTimeout(run, ms));
  }, []);

  /** Reveals the real card under the lifted copy, after lists rendered it, and ends the drag. */
  const reveal = useCallback(() => {
    setPlacement(store, null, false);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        activeId.value = '';
        phase.value = PHASE_IDLE;
        hoverReady.value = false;
        hoverOpacity.value = 1;
        outline.value = HIDDEN_OUTLINE;
        drag.current = null;
        setHoverItemId(null);
      }),
    );
  }, [activeId, hoverOpacity, hoverReady, outline, phase, store]);

  /** Flies the lifted copy to `to` (or fades it when there is nowhere to go), then reveals. */
  const settle = useCallback(
    (to: Rect | null) => {
      phase.value = PHASE_SETTLING;
      outline.value = HIDDEN_OUTLINE;
      const duration = propsRef.current.reducedMotion ? 0 : SETTLE_MS;
      const timing = { duration, easing: Easing.out(Easing.cubic) };
      if (to) {
        hoverX.value = withTiming(to.x, timing);
        hoverY.value = withTiming(to.y, timing);
      } else {
        hoverOpacity.value = withTiming(0, timing);
      }
      later(duration + 16, reveal);
    },
    [hoverOpacity, hoverX, hoverY, later, outline, phase, reveal],
  );

  const allowedIn = useCallback((geometry: CellGeometry, cellId: string, itemId: string) => {
    const canDrop = propsRef.current.canDrop;
    return geometry.accepts() && (canDrop ? canDrop(itemId, cellId) : true);
  }, []);

  const placeholderRect = useCallback(() => {
    const placement = store.placement.current;
    return placement ? (store.cells.get(placement.cellId)?.itemRect(PLACEHOLDER_ID) ?? null) : null;
  }, [store]);

  const updateTarget = useCallback(() => {
    const active = drag.current;
    const placement = store.placement.current;
    if (!active || !placement) return;
    active.framesSinceMove += 1;
    const { x, y } = active.pointer;
    const hit = findCell(store.cells, x, y);
    // Crossing a gap keeps the placeholder where it is; a cell that refuses the card sends it home.
    let desired = { cellId: placement.cellId, index: placement.index };
    active.overAllowed = false;

    if (hit) {
      const [cellId, geometry, rect] = hit;
      const allowed = allowedIn(geometry, cellId, active.itemId);
      active.overAllowed = allowed;
      const key = `${cellId}|${allowed}|${Math.round(rect.x)}|${Math.round(rect.y)}|${Math.round(rect.width)}|${Math.round(rect.height)}`;
      if (key !== active.outlineKey) {
        active.outlineKey = key;
        // Store content x so the overlay can subtract the live UI-thread offset.
        const horizontal = store.scrollers.horizontal;
        const follow = horizontal != null && propsRef.current.horizontalOffset != null;
        outline.value = {
          visible: true,
          allowed,
          ...rect,
          x: follow ? rect.x + horizontal.getOffset() : rect.x,
          follow,
        };
      }
      // Wait for lists to lay out the last placeholder move before reading them again.
      if (!allowed) desired = { cellId: active.sourceCellId, index: active.sourceIndex };
      else if (active.framesSinceMove >= SETTLE_FRAMES) desired = { cellId, index: geometry.resolve(y) };
    } else if (active.outlineKey !== '') {
      active.outlineKey = '';
      outline.value = HIDDEN_OUTLINE;
    }

    if (desired.cellId === placement.cellId && desired.index === placement.index) {
      active.candidate = null;
      active.candidateFrames = 0;
      return;
    }
    const candidate = active.candidate;
    if (candidate && candidate.cellId === desired.cellId && candidate.index === desired.index) {
      active.candidateFrames += 1;
    } else {
      active.candidate = desired;
      active.candidateFrames = 1;
    }
    if (active.candidateFrames < STABLE_FRAMES) return;
    active.candidate = null;
    active.candidateFrames = 0;
    active.framesSinceMove = 0;
    setPlacement(
      store,
      { ...placement, cellId: desired.cellId, index: desired.index },
      !propsRef.current.reducedMotion,
    );
  }, [outline, store]);

  const autoScroll = useCallback(
    (dt: number) => {
      const active = drag.current;
      if (!active) return;
      const { reducedMotion = false, compact = true } = propsRef.current;
      const run = (scroller: ScrollerHandle, pointer: number, dwell: number): number => {
        const viewport = scroller.getViewport();
        if (!viewport) return 0;
        const offset = scroller.getOffset();
        const step = stepAutoScroll({
          pointer,
          frameStart: viewport.start,
          frameSize: viewport.size,
          edgeZone: edgeZone(viewport.size, compact),
          offset,
          maxOffset: scroller.getMaxOffset(),
          dwellMs: dwell,
          dtMs: dt,
          mode: scroller.mode ?? 'continuous',
          pageSize: scroller.getPageSize?.() ?? viewport.size,
          reducedMotion,
        });
        if (Math.abs(step.offset - offset) >= 0.5) {
          scroller.scrollTo(step.offset, step.flipped && !reducedMotion);
          active.scrolled = true;
        }
        return step.dwellMs;
      };
      const horizontal = store.scrollers.horizontal;
      active.dwellX = horizontal ? run(horizontal, active.pointer.x, active.dwellX) : 0;
      const hit = findCell(store.cells, active.pointer.x, active.pointer.y);
      const vertical = hit?.[1].scroller ?? store.scrollers.vertical;
      active.dwellY = vertical ? run(vertical, active.pointer.y, active.dwellY) : 0;
    },
    [store],
  );

  const loop = useCallback(
    (now: number) => {
      const active = drag.current;
      if (!active) return;
      const dt = active.lastTime === 0 ? 16 : now - active.lastTime;
      active.lastTime = now;
      autoScroll(dt);
      updateTarget();
      frameRef.current = requestAnimationFrame(loop);
    },
    [autoScroll, updateTarget],
  );

  const begin = useCallback(
    (x: number, y: number) => {
      const current = propsRef.current;
      const hit = findCell(store.cells, x, y);
      const card = hit ? hit[1].itemAt(y) : null;
      if (!hit || !card || (current.canDrag && !current.canDrag(card.itemId))) {
        phase.value = PHASE_IDLE;
        return;
      }
      drag.current = {
        itemId: card.itemId,
        sourceCellId: hit[0],
        sourceIndex: card.index,
        height: card.rect.height,
        start: { x, y },
        pointer: { x, y },
        lastTime: 0,
        dwellX: 0,
        dwellY: 0,
        scrolled: false,
        candidate: null,
        candidateFrames: 0,
        framesSinceMove: 0,
        outlineKey: '',
        overAllowed: true,
      };
      grab.value = { x: x - card.rect.x, y: y - card.rect.y };
      hoverWidth.value = card.rect.width;
      hoverHeight.value = card.rect.height;
      hoverX.value = card.rect.x;
      hoverY.value = card.rect.y;
      hoverOpacity.value = 1;
      activeId.value = card.itemId;
      setHoverItemId(card.itemId);
      current.onDragStart?.({ itemId: card.itemId, cellId: hit[0] });
    },
    [activeId, grab, hoverHeight, hoverOpacity, hoverWidth, hoverX, hoverY, phase, store],
  );

  /** The lifted copy is on screen: swap the card for a placeholder underneath it and start tracking. */
  const onHoverMounted = useCallback(() => {
    const active = drag.current;
    if (!active) return;
    hoverReady.value = true;
    setPlacement(
      store,
      {
        itemId: active.itemId,
        sourceCellId: active.sourceCellId,
        sourceIndex: active.sourceIndex,
        height: active.height,
        cellId: active.sourceCellId,
        index: active.sourceIndex,
      },
      false,
    );
    cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(loop);
  }, [hoverReady, loop, store]);

  const move = useCallback((x: number, y: number) => {
    const active = drag.current;
    if (active) active.pointer = { x, y };
  }, []);

  const end = useCallback(
    (cancelled: boolean) => {
      cancelAnimationFrame(frameRef.current);
      const active = drag.current;
      if (!active) {
        phase.value = PHASE_IDLE;
        return;
      }
      const current = propsRef.current;
      const placement = store.placement.current;
      if (!placement) {
        // Released before the lifted copy appeared: nothing moved.
        settle(null);
        current.onDragEnd?.({ itemId: active.itemId, cancelled: true });
        return;
      }
      const travelled = Math.hypot(active.pointer.x - active.start.x, active.pointer.y - active.start.y);
      const menu = !cancelled && travelled < MENU_SLOP && !active.scrolled;
      const atHome = placement.cellId === active.sourceCellId && placement.index === active.sourceIndex;
      const released = findCell(store.cells, active.pointer.x, active.pointer.y);
      // Released outside every cell that takes the card: the move is cancelled.
      const onTarget = released != null && allowedIn(released[1], released[0], active.itemId);

      if (!cancelled && !menu && !atHome && onTarget) {
        const landing = placeholderRect();
        // One React render: the placeholder goes away and the card appears in its place.
        if (placement.cellId === active.sourceCellId) {
          current.onReorder({
            itemId: active.itemId,
            cellId: placement.cellId,
            fromIndex: active.sourceIndex,
            toIndex: placement.index,
          });
        } else {
          current.onTransfer({
            itemId: active.itemId,
            fromCellId: active.sourceCellId,
            toCellId: placement.cellId,
            toIndex: placement.index,
          });
        }
        setPlacement(store, null, false);
        settle(landing);
        current.onDragEnd?.({ itemId: active.itemId, cancelled: false });
        return;
      }

      const goHome = () => settle(placeholderRect());
      if (atHome) {
        goHome();
      } else {
        // Put the placeholder back at the source first, then fly there once it is laid out.
        setPlacement(store, { ...placement, cellId: active.sourceCellId, index: active.sourceIndex }, false);
        requestAnimationFrame(() => requestAnimationFrame(goHome));
      }
      current.onDragEnd?.({ itemId: active.itemId, cancelled: true });
      if (menu) current.onLongPressMenu?.({ itemId: active.itemId, cellId: active.sourceCellId });
    },
    [allowedIn, phase, placeholderRect, settle, store],
  );

  useEffect(
    () => () => {
      cancelAnimationFrame(frameRef.current);
      for (const timer of timers.current) clearTimeout(timer);
    },
    [],
  );

  const { longPressDelay = 200, enabled = true, dragPosition } = props;
  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(enabled)
        .activateAfterLongPress(longPressDelay)
        .maxPointers(1)
        .shouldCancelWhenOutside(false)
        .onStart((event) => {
          'worklet';
          if (phase.value !== PHASE_IDLE) return;
          const frame = measure(boardRef);
          if (!frame) return;
          origin.value = { x: frame.pageX, y: frame.pageY };
          phase.value = PHASE_DRAGGING;
          scheduleOnRN(begin, event.absoluteX - frame.pageX, event.absoluteY - frame.pageY);
        })
        .onUpdate((event) => {
          'worklet';
          if (phase.value !== PHASE_DRAGGING) return;
          const x = event.absoluteX - origin.value.x;
          const y = event.absoluteY - origin.value.y;
          if (dragPosition) dragPosition.value = { x, y };
          if (activeId.value !== '') {
            hoverX.value = x - grab.value.x;
            hoverY.value = y - grab.value.y;
          }
          scheduleOnRN(move, x, y);
        })
        .onFinalize((_event, success) => {
          'worklet';
          if (phase.value !== PHASE_DRAGGING) return;
          scheduleOnRN(end, !success);
        }),
    [activeId, begin, boardRef, dragPosition, enabled, end, grab, hoverX, hoverY, longPressDelay, move, origin, phase],
  );

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View ref={boardRef} style={styles.fill} collapsable={false}>
        {props.children}
        <DragOverlay
          hoverItemId={hoverItemId}
          renderHover={props.renderHover}
          colors={props.colors}
          reducedMotion={props.reducedMotion ?? false}
          horizontalOffset={props.horizontalOffset}
          onMounted={onHoverMounted}
        />
      </Animated.View>
    </GestureDetector>
  );
}

function DragOverlay({
  hoverItemId,
  renderHover,
  colors,
  reducedMotion,
  horizontalOffset,
  onMounted,
}: {
  hoverItemId: string | null;
  renderHover: DragBoardProps['renderHover'];
  colors: DragBoardProps['colors'];
  reducedMotion: boolean;
  horizontalOffset: DragBoardProps['horizontalOffset'];
  onMounted: () => void;
}) {
  const { hoverX, hoverY, hoverWidth, hoverHeight, hoverOpacity, hoverReady, activeId, phase, outline } = useEngine();

  useLayoutEffect(() => {
    if (hoverItemId != null) onMounted();
  }, [hoverItemId, onMounted]);

  const hoverStyle = useAnimatedStyle(() => {
    const lifted = phase.value === PHASE_DRAGGING;
    return {
      width: hoverWidth.value,
      height: hoverHeight.value,
      opacity: activeId.value !== '' && hoverReady.value ? hoverOpacity.value : 0,
      transform: [
        { translateX: hoverX.value },
        { translateY: hoverY.value },
        { scale: withTiming(lifted && !reducedMotion ? LIFT_SCALE : 1, { duration: 140 }) },
      ],
    };
  });

  const outlineStyle = useAnimatedStyle(() => {
    const current = outline.value;
    return {
      opacity: current.visible ? 1 : 0,
      width: current.width,
      height: current.height,
      borderColor: current.allowed ? (colors?.outline ?? '#2F6FEB') : (colors?.reject ?? '#D93F3F'),
      transform: [
        { translateX: current.follow && horizontalOffset ? current.x - horizontalOffset.value : current.x },
        { translateY: current.y },
      ],
    };
  });

  return (
    <View pointerEvents="none" style={styles.overlay}>
      <Animated.View style={[styles.outline, outlineStyle]} />
      <Animated.View style={[styles.hover, hoverStyle]}>
        {hoverItemId != null ? renderHover(hoverItemId) : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  overlay: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, zIndex: 1000, elevation: 1000 },
  hover: {
    position: 'absolute',
    left: 0,
    top: 0,
    shadowColor: '#0B1220',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
  },
  outline: {
    position: 'absolute',
    left: 0,
    top: 0,
    borderWidth: 2,
    borderRadius: 14,
  },
  placeholder: { borderWidth: 1.5, borderStyle: 'dashed' },
  placeholderTint: { opacity: 0.08 },
});

/**
 * Board-only drag engine on Gesture Handler 2 and Reanimated 4.
 *
 * - One long-press pan on the board root finds the card under the finger
 *   through cell geometry, so recycling or unmounting a card never ends a drag.
 * - The lifted copy lives in an overlay above everything and moves on the UI thread.
 * - Hit testing and auto-scroll run once per frame in JS against registered
 *   geometry (FlashList layouts and known offsets): nothing is measured.
 * - Feedback is a placeholder rendered by the lists themselves, so dropping
 *   swaps placeholder for card in one React render, with nothing to blink.
 */
export const gestureAdapter: DragAdapter = {
  capabilities: { crossContainer: true, autoScrollOuter: true, supportsFlashList: true },
  Provider: DragProvider,
  Board: DragBoard,
  Cell: DragCell,
  Card: DragCard,
  Placeholder,
  useScroller,
  usePlacement,
  useDragSource,
  usePlacementState,
};
