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
import { Gesture, GestureDetector, PointerType, type PanGesture } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  measure,
  scrollTo,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
  withTiming,
  type FrameInfo,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { createValueStore, type ValueStore } from '../store';
import { autoScrollOrigin, edgeZone, stepAutoScroll } from './autoScroll';
import { containsPoint, type Rect } from './geometry';
import {
  PLACEHOLDER_ID,
  type CellGeometry,
  type CellPlacement,
  type DragAdapter,
  type DragBoardProps,
  type DragCardProps,
  type DragCellProps,
  type DragHandleProps,
  type DragPlacement,
  type LiftStyle,
  type PlaceholderProps,
  type ScrollerHandle,
  type UiScrollTarget,
  type ZoneGeometry,
} from './types';

/** Long-press released within this distance (px) opens the menu instead of dropping. */
const MENU_SLOP = 10;
/** A drag from a handle starts once the finger moves this far, before a list starts scrolling. */
const MOUSE = PointerType.MOUSE;
const HANDLE_SLOP = 3;
/**
 * A mouse picks a card up after this short a press. A plain click is quicker,
 * so it still reaches the card's own onPress; waiting for movement instead
 * loses to the list, which scrolls on a mouse drag.
 */
const MOUSE_HOLD = 120;
const AUTO_SCROLL_QUIET_MS = 150;
/** How the lifted card looks and how long a drop takes, unless the board passes its own. */
const DEFAULT_LIFT: LiftStyle = { scale: 1.03, tilt: 0, shadowOpacity: 0.25, dropMs: 200 };
/** With a drop dock showing, a list's edge waits this long before scrolling: the finger crosses it to reach the dock. */
const DOCK_EDGE_DELAY_MS = 250;
/** How much the lifted copy shrinks over a drop zone, so the zone under the finger stays visible. */
const ZONE_SHRINK = 0.6;
/** Offsets the UI thread wrote recently. An offset outside them was moved by someone else. */
const OFFSET_HISTORY = 6;
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

/** What the UI thread needs to auto-scroll one axis. Published by the JS loop when it changes. */
interface AxisConfig {
  on: boolean;
  /** The `UiScrollTarget.id` these limits belong to. */
  target: number;
  start: number;
  size: number;
  zone: number;
  max: number;
  reduced: boolean;
  /** `stepAutoScroll`'s `delayMs`. */
  delay: number;
}

const AXIS_OFF: AxisConfig = { on: false, target: -1, start: 0, size: 0, zone: 0, max: 0, reduced: false, delay: 0 };

interface UiTargets {
  x: UiScrollTarget | null;
  y: UiScrollTarget | null;
}

const NO_UI_TARGETS: UiTargets = { x: null, y: null };

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
  /**
   * The card the lifted copy covers, or ''. A JS store and not a shared value:
   * a shared value gave every card its own UI-thread style just to hide one.
   */
  hidden: ValueStore<string>;
  phase: SharedValue<number>;
  origin: SharedValue<Point>;
  grab: SharedValue<Point>;
  hoverX: SharedValue<number>;
  hoverY: SharedValue<number>;
  hoverWidth: SharedValue<number>;
  hoverHeight: SharedValue<number>;
  hoverOpacity: SharedValue<number>;
  hoverReady: SharedValue<boolean>;
  /** The pan moves the lifted copy. Set with `grab`, so a stale grab from the last drag is never used. */
  tracking: SharedValue<boolean>;
  outline: SharedValue<Outline>;
  /** Pointer in board coordinates, written by the pan on the UI thread. */
  pointerX: SharedValue<number>;
  pointerY: SharedValue<number>;
  /** Auto-scroll may run: the finger has moved since the pick-up. */
  armed: SharedValue<boolean>;
  autoX: SharedValue<AxisConfig>;
  autoY: SharedValue<AxisConfig>;
  /** Bumped by the UI thread each time it scrolls, so JS knows content moved. */
  uiScrollTick: SharedValue<number>;
  /** A finger went down on a drag handle. The board's pan starts a handle drag only then. */
  handleDown: SharedValue<boolean>;
  /** Where the current touch went down, in window coordinates. A handle drag starts from here. */
  touchStart: SharedValue<Point>;
  /** The drop zone under the pointer, or ''. */
  activeZone: SharedValue<string>;
  cells: Map<string, CellGeometry>;
  zones: Map<string, ZoneGeometry>;
  scrollers: { horizontal: ScrollerHandle | null; vertical: ScrollerHandle | null };
  placement: { current: Placement | null };
  /** The finger has moved past the menu slop in the current drag. */
  moved: { current: boolean };
  listeners: Set<() => void>;
}

const EngineContext = createContext<EngineStore | null>(null);

/** True while drags start from handles. */
const HandleContext = createContext(false);

function useEngine(): EngineStore {
  const store = use(EngineContext);
  if (!store) throw new Error('react-native-board-view: drag components must render inside the drag Provider.');
  return store;
}

function DragProvider({ children }: { children: ReactNode }) {
  const phase = useSharedValue(PHASE_IDLE);
  const origin = useSharedValue<Point>({ x: 0, y: 0 });
  const grab = useSharedValue<Point>({ x: 0, y: 0 });
  const hoverX = useSharedValue(0);
  const hoverY = useSharedValue(0);
  const hoverWidth = useSharedValue(0);
  const hoverHeight = useSharedValue(0);
  const hoverOpacity = useSharedValue(1);
  const hoverReady = useSharedValue(false);
  const tracking = useSharedValue(false);
  const outline = useSharedValue<Outline>(HIDDEN_OUTLINE);
  const pointerX = useSharedValue(0);
  const pointerY = useSharedValue(0);
  const armed = useSharedValue(false);
  const autoX = useSharedValue<AxisConfig>(AXIS_OFF);
  const autoY = useSharedValue<AxisConfig>(AXIS_OFF);
  const uiScrollTick = useSharedValue(0);
  const handleDown = useSharedValue(false);
  const touchStart = useSharedValue<Point>({ x: 0, y: 0 });
  const activeZone = useSharedValue('');
  const [store] = useState<EngineStore>(() => ({
    hidden: createValueStore(''),
    phase,
    origin,
    grab,
    hoverX,
    hoverY,
    hoverWidth,
    hoverHeight,
    hoverOpacity,
    hoverReady,
    tracking,
    outline,
    pointerX,
    pointerY,
    armed,
    autoX,
    autoY,
    uiScrollTick,
    handleDown,
    touchStart,
    activeZone,
    cells: new Map(),
    zones: new Map(),
    scrollers: { horizontal: null, vertical: null },
    placement: { current: null },
    moved: { current: false },
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

function setMoved(store: EngineStore, moved: boolean): void {
  if (store.moved.current === moved) return;
  store.moved.current = moved;
  for (const listener of store.listeners) listener();
}

function useDragMoved(): boolean {
  const store = useEngine();
  const subscribe = useSubscribe(store);
  return useSyncExternalStore(subscribe, () => store.moved.current);
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

function useZone(zoneId: string, geometry: ZoneGeometry | null): void {
  const store = useEngine();
  useLayoutEffect(() => {
    if (!geometry) return;
    store.zones.set(zoneId, geometry);
    return () => {
      if (store.zones.get(zoneId) === geometry) store.zones.delete(zoneId);
    };
  }, [store, zoneId, geometry]);
}

function useActiveZone(): SharedValue<string> {
  return useEngine().activeZone;
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

const DragCard = memo(function DragCard({ itemId, style, onLayout, children }: DragCardProps) {
  const { hidden } = useEngine();
  // While the lifted copy covers a card (picked up, or settling over its new spot), the card stays hidden underneath.
  const covered = useSyncExternalStore(
    hidden.subscribe,
    () => hidden.get() === itemId,
    () => false,
  );
  return (
    <View style={covered ? [style, styles.covered] : style} onLayout={onLayout}>
      {children}
    </View>
  );
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
  /**
   * The drag has ended in JS (dropped, cancelled, or dropped because the data
   * changed). The UI thread can still report the finger lifting a frame later:
   * that must not end it twice.
   */
  ended: boolean;
  itemId: string;
  sourceCellId: string;
  sourceIndex: number;
  height: number;
  start: Point;
  /** Where the card was when it was picked up, for a release before the placeholder shows. */
  home: Rect;
  pointer: Point;
  lastTime: number;
  dwellX: number;
  dwellY: number;
  scrolled: boolean;
  /** Auto-scroll runs once the finger has moved away from where it picked the card up. */
  armed: boolean;
  /** When auto-scroll last moved content, in rAF time. */
  lastScrollAt: number;
  /** Last `uiScrollTick` seen, to notice UI-thread scrolling. */
  uiTick: number;
  /** Last cell under the pointer: past its end (over a footer, a tab bar) it keeps scrolling. */
  lastCellId: string | null;
  /** Slot seen last frame, waiting to be confirmed. */
  candidate: { cellId: string; index: number } | null;
  candidateFrames: number;
  framesSinceMove: number;
  outlineKey: string;
  /** The pointer is over a cell that accepts the card. */
  overAllowed: boolean;
  /** The drop zone under the pointer, or ''. */
  zoneId: string;
}

function findCell(cells: Map<string, CellGeometry>, x: number, y: number): [string, CellGeometry, Rect] | null {
  for (const [cellId, geometry] of cells) {
    const rect = geometry.getRect();
    if (rect && containsPoint(rect, x, y)) return [cellId, geometry, rect];
  }
  return null;
}

function findZone(zones: Map<string, ZoneGeometry>, x: number, y: number): [string, ZoneGeometry, Rect] | null {
  for (const [zoneId, geometry] of zones) {
    const rect = geometry.getRect();
    if (rect && containsPoint(rect, x, y)) return [zoneId, geometry, rect];
  }
  return null;
}

/** Top of the highest zone, so auto-scroll edges sit above a dock instead of under it. */
function zonesTop(zones: Map<string, ZoneGeometry>): number {
  let top = Infinity;
  for (const geometry of zones.values()) {
    const rect = geometry.getRect();
    if (rect) top = Math.min(top, rect.y);
  }
  return top;
}

function DragBoard(props: DragBoardProps) {
  const store = useEngine();
  const propsRef = useRef(props);
  propsRef.current = props;
  const boardRef = useAnimatedRef<Animated.View>();
  const [hoverItemId, setHoverItemId] = useState<string | null>(null);
  // Bumped by every drag, so the copy remounts and its first layout always means "drawn".
  const [dragKey, setDragKey] = useState(0);
  const drag = useRef<ActiveDrag | null>(null);
  const frameRef = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const {
    hidden,
    phase,
    origin,
    grab,
    hoverX,
    hoverY,
    hoverWidth,
    hoverHeight,
    hoverOpacity,
    hoverReady,
    tracking,
    outline,
    armed,
    autoX,
    autoY,
    uiScrollTick,
    activeZone,
  } = store;
  const [uiTargets, setUiTargets] = useState<UiTargets>(NO_UI_TARGETS);
  const uiTargetsRef = useRef<UiTargets>(NO_UI_TARGETS);
  /** Hands an axis to the UI thread (a target) or takes it back (null). */
  const setUiTarget = useCallback((axis: 'x' | 'y', target: UiScrollTarget | null) => {
    if (uiTargetsRef.current[axis] === target) return;
    uiTargetsRef.current = { ...uiTargetsRef.current, [axis]: target };
    setUiTargets(uiTargetsRef.current);
  }, []);
  const stopUiScroll = useCallback(() => {
    armed.value = false;
    autoX.value = AXIS_OFF;
    autoY.value = AXIS_OFF;
    if (uiTargetsRef.current === NO_UI_TARGETS) return;
    uiTargetsRef.current = NO_UI_TARGETS;
    setUiTargets(NO_UI_TARGETS);
  }, [armed, autoX, autoY]);

  const later = useCallback((ms: number, run: () => void) => {
    timers.current.push(setTimeout(run, ms));
  }, []);

  /**
   * Ends the drag. The real card is shown first, under the copy that still
   * covers its spot, and the copy goes two frames later. A list that draws the
   * card a frame late then shows the copy for that frame, never an empty slot.
   */
  const reveal = useCallback(() => {
    setPlacement(store, null, false);
    setMoved(store, false);
    const nextFrames = (frames: number, run: () => void) => {
      if (frames <= 0) run();
      else requestAnimationFrame(() => nextFrames(frames - 1, run));
    };
    nextFrames(2, () => {
      hidden.set('');
      outline.value = HIDDEN_OUTLINE;
      nextFrames(2, () => {
        phase.value = PHASE_IDLE;
        hoverReady.value = false;
        tracking.value = false;
        hoverOpacity.value = 1;
        drag.current = null;
        setHoverItemId(null);
      });
    });
  }, [hidden, hoverOpacity, hoverReady, outline, phase, store, tracking]);

  /**
   * Flies the lifted copy to `to` (or fades it when there is nowhere to go), then
   * reveals. `fade` also fades it on the way, for a card absorbed by a drop zone.
   */
  const settle = useCallback(
    (to: Rect | null, fade = false) => {
      if (drag.current) drag.current.ended = true;
      // Released before the placeholder took the card's place: the copy, already showing, covers it on the way.
      if (drag.current && hoverReady.value) hidden.set(drag.current.itemId);
      phase.value = PHASE_SETTLING;
      outline.value = HIDDEN_OUTLINE;
      activeZone.value = '';
      const duration = propsRef.current.reducedMotion ? 0 : (propsRef.current.lift?.dropMs ?? DEFAULT_LIFT.dropMs);
      const overshoot = propsRef.current.lift?.overshoot === true && !fade && to != null;
      const timing = { duration, easing: overshoot ? Easing.out(Easing.back(1.6)) : Easing.out(Easing.cubic) };
      if (to) {
        hoverX.value = withTiming(to.x, timing);
        hoverY.value = withTiming(to.y, timing);
      }
      if (!to || fade) hoverOpacity.value = withTiming(0, timing);
      later(duration + 16, reveal);
    },
    [activeZone, hidden, hoverOpacity, hoverReady, hoverX, hoverY, later, outline, phase, reveal],
  );

  const allowedIn = useCallback((geometry: CellGeometry, cellId: string, itemId: string) => {
    const canDrop = propsRef.current.canDrop;
    return geometry.accepts() && (canDrop ? canDrop(itemId, cellId) : true);
  }, []);

  const placeholderRect = useCallback(() => {
    const placement = store.placement.current;
    return placement ? (store.cells.get(placement.cellId)?.itemRect(PLACEHOLDER_ID) ?? null) : null;
  }, [store]);

  /** The last cell's scroller while the pointer is beyond that cell's top or bottom, within its width. */
  const outerScroller = useCallback(
    (active: ActiveDrag): ScrollerHandle | null => {
      const geometry = active.lastCellId != null ? store.cells.get(active.lastCellId) : undefined;
      const rect = geometry?.getRect();
      if (!geometry?.scroller || !rect) return null;
      const { x, y } = active.pointer;
      const within = x >= rect.x && x <= rect.x + rect.width;
      const beyond = y < rect.y || y > rect.y + rect.height;
      return within && beyond ? geometry.scroller : null;
    },
    [store],
  );

  /**
   * Past the end of what a list shows (over its footer, or the dock's padding) auto-scroll keeps
   * scrolling the cell the finger left, so the slot follows the content, read at that cell's edge,
   * and a drop there lands in it. Only for the cell at that end: a gap between swimlane rows or
   * stacked sections is inside the list, and crossing it keeps the placeholder where it is.
   * The same holds sideways: a finger in the board's side edge, beside the cell's rows, is in the
   * margin past the last column while the board scrolls or flips toward it.
   */
  const edgeTarget = useCallback(
    (active: ActiveDrag): { hit: [string, CellGeometry, Rect]; y: number } | null => {
      if (active.lastCellId == null) return null;
      const geometry = store.cells.get(active.lastCellId);
      const rect = geometry?.getRect();
      if (!geometry || !rect) return null;
      const hit: [string, CellGeometry, Rect] = [active.lastCellId, geometry, rect];
      const { x, y } = active.pointer;
      const dockTop = store.zones.size > 0 ? zonesTop(store.zones) : Infinity;
      const across = store.scrollers.horizontal?.getViewport();
      if (across && y >= rect.y && y < Math.min(rect.y + rect.height, dockTop)) {
        const zone = edgeZone(across.size, propsRef.current.compact ?? true);
        if (x < across.start + zone || x > across.start + across.size - zone) return { hit, y };
      }
      const viewport = outerScroller(active) ? geometry.scroller?.getViewport() : null;
      if (!viewport) return null;
      const top = viewport.start;
      const bottom = Math.min(viewport.start + viewport.size, dockTop);
      const pastBottom = y > bottom && rect.y + rect.height >= bottom - 1;
      const pastTop = y < top && rect.y <= top + 1;
      if (!pastBottom && !pastTop) return null;
      return { hit, y: Math.min(Math.max(y, rect.y), rect.y + rect.height - 1) };
    },
    [outerScroller, store],
  );

  const updateTarget = useCallback(() => {
    const active = drag.current;
    const placement = store.placement.current;
    if (!active || !placement) return;
    active.framesSinceMove += 1;
    const { x, y } = active.pointer;
    // Zones sit above the lists, so a zone under the pointer hides the cell beneath it.
    const zone = findZone(store.zones, x, y);
    const zoneId = zone ? zone[0] : '';
    if (zoneId !== active.zoneId) {
      active.zoneId = zoneId;
      activeZone.value = zoneId;
    }
    let hit = zone ? null : findCell(store.cells, x, y);
    let probeY = y;
    const edge = hit || zone ? null : edgeTarget(active);
    if (edge) {
      hit = edge.hit;
      probeY = edge.y;
    }
    // Crossing a gap keeps the placeholder where it is; a cell that refuses the card sends it home.
    let desired = { cellId: placement.cellId, index: placement.index };
    active.overAllowed = false;

    if (zone) {
      // Over a zone the card is leaving the lists: close the gap at its source.
      desired = { cellId: active.sourceCellId, index: active.sourceIndex };
    }
    if (hit) {
      const [cellId, geometry, rect] = hit;
      const allowed = allowedIn(geometry, cellId, active.itemId);
      active.overAllowed = allowed;
      // A drop dock is drawn over the lists: the outline stops at its top.
      const floor = store.zones.size > 0 ? zonesTop(store.zones) : Infinity;
      const key = `${cellId}|${allowed}|${Math.round(rect.x)}|${Math.round(rect.y)}|${Math.round(rect.width)}|${Math.round(rect.height)}|${Math.round(floor)}`;
      if (key !== active.outlineKey) {
        active.outlineKey = key;
        // Store content x so the overlay can subtract the live UI-thread offset.
        const horizontal = store.scrollers.horizontal;
        const follow = horizontal != null && propsRef.current.horizontalOffset != null;
        // A tall swimlane cell can reach past its list: keep the outline inside what the list shows.
        const viewport = geometry.scroller?.getViewport();
        const top = viewport ? Math.max(rect.y, viewport.start) : rect.y;
        const bottom = Math.min(
          viewport ? Math.min(rect.y + rect.height, viewport.start + viewport.size) : rect.y + rect.height,
          floor,
        );
        outline.value = {
          visible: bottom > top,
          allowed,
          ...rect,
          x: follow ? rect.x + horizontal.getOffset() : rect.x,
          y: top,
          height: Math.max(0, bottom - top),
          follow,
        };
      }
      // Wait for lists to lay out the last placeholder move before reading them again.
      if (!allowed) desired = { cellId: active.sourceCellId, index: active.sourceIndex };
      else if (active.framesSinceMove >= SETTLE_FRAMES) desired = { cellId, index: geometry.resolve(probeY) };
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
    // While auto-scroll moves the content the slot changes come from scrolling, and a layout
    // animation would also animate every recycled row: move the placeholder without one.
    const scrolling = active.lastTime - active.lastScrollAt < AUTO_SCROLL_QUIET_MS;
    setPlacement(
      store,
      { ...placement, cellId: desired.cellId, index: desired.index },
      !propsRef.current.reducedMotion && !scrolling,
    );
    propsRef.current.onDragOver?.({ itemId: active.itemId, cellId: desired.cellId, index: desired.index });
  }, [activeZone, allowedIn, edgeTarget, outline, store]);

  const autoScroll = useCallback(
    (dt: number) => {
      const active = drag.current;
      if (!active) return;
      // A card picked up inside an edge zone must not scroll until the finger moves:
      // a press-and-release there opens the menu.
      if (!active.armed) {
        const travelled = Math.hypot(active.pointer.x - active.start.x, active.pointer.y - active.start.y);
        if (travelled < MENU_SLOP) return;
        active.armed = true;
        setMoved(store, true);
        armed.value = true;
      }
      // Content the UI thread scrolled since the last frame counts as auto-scroll, like our own.
      const tick = uiScrollTick.value;
      if (tick !== active.uiTick) {
        active.uiTick = tick;
        active.scrolled = true;
        active.lastScrollAt = active.lastTime;
      }
      const { reducedMotion = false, compact = true } = propsRef.current;
      // Nothing scrolls under a finger resting on a drop zone.
      const overZone = active.zoneId !== '';
      const dockTop = store.zones.size > 0 ? zonesTop(store.zones) : Infinity;
      const run = (axis: 'x' | 'y', scroller: ScrollerHandle | null, pointer: number, dwell: number): number => {
        const delay = axis === 'y' && dockTop < Infinity ? DOCK_EDGE_DELAY_MS : 0;
        const full = overZone ? null : scroller?.getViewport();
        // A dock covers the bottom of the lists: their bottom edge zone starts above it.
        const viewport =
          full && axis === 'y' && dockTop > full.start && dockTop < full.start + full.size
            ? { start: full.start, size: dockTop - full.start }
            : full;
        const config = axis === 'x' ? autoX : autoY;
        // One synchronous read per axis and frame: each read crosses to the UI runtime.
        const current = config.value;
        if (!scroller || !viewport) {
          setUiTarget(axis, null);
          if (current.on) config.value = AXIS_OFF;
          return 0;
        }
        const mode = scroller.mode ?? 'continuous';
        if (scroller.ui && mode === 'continuous') {
          // The UI thread scrolls this one every frame; JS only keeps its limits current.
          const next: AxisConfig = {
            on: true,
            target: scroller.ui.id,
            start: viewport.start,
            size: viewport.size,
            zone: edgeZone(viewport.size, compact),
            max: scroller.getMaxOffset(),
            reduced: reducedMotion,
            delay,
          };
          if (
            !current.on ||
            current.target !== next.target ||
            current.start !== next.start ||
            current.size !== next.size ||
            current.zone !== next.zone ||
            Math.abs(current.max - next.max) >= 0.5 ||
            current.reduced !== next.reduced ||
            current.delay !== next.delay
          ) {
            config.value = next;
          }
          setUiTarget(axis, scroller.ui);
          return 0;
        }
        setUiTarget(axis, null);
        if (current.on) config.value = AXIS_OFF;
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
          mode,
          pageSize: scroller.getPageSize?.() ?? viewport.size,
          reducedMotion,
          delayMs: delay,
        });
        if (Math.abs(step.offset - offset) >= 0.5) {
          scroller.scrollTo(step.offset, step.flipped && !reducedMotion);
          active.scrolled = true;
          active.lastScrollAt = active.lastTime;
        }
        return step.dwellMs;
      };
      active.dwellX = run('x', store.scrollers.horizontal, active.pointer.x, active.dwellX);
      const hit = findCell(store.cells, active.pointer.x, active.pointer.y);
      if (hit) active.lastCellId = hit[0];
      const vertical = hit?.[1].scroller ?? outerScroller(active) ?? store.scrollers.vertical;
      active.dwellY = run('y', vertical, active.pointer.y, active.dwellY);
    },
    [armed, autoX, autoY, outerScroller, setUiTarget, store, uiScrollTick],
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
        ended: false,
        itemId: card.itemId,
        sourceCellId: hit[0],
        sourceIndex: card.index,
        height: card.rect.height,
        start: { x, y },
        home: card.rect,
        pointer: { x, y },
        lastTime: 0,
        dwellX: 0,
        dwellY: 0,
        scrolled: false,
        armed: false,
        lastScrollAt: -Infinity,
        uiTick: uiScrollTick.value,
        lastCellId: hit[0],
        candidate: null,
        candidateFrames: 0,
        framesSinceMove: 0,
        outlineKey: '',
        overAllowed: true,
        zoneId: '',
      };
      setMoved(store, false);
      grab.value = { x: x - card.rect.x, y: y - card.rect.y };
      hoverWidth.value = card.rect.width;
      hoverHeight.value = card.rect.height;
      hoverX.value = card.rect.x;
      hoverY.value = card.rect.y;
      hoverOpacity.value = 1;
      tracking.value = true;
      // The real card stays visible until the lifted copy is drawn over it (onHoverLaidOut).
      setDragKey((key) => key + 1);
      setHoverItemId(card.itemId);
      current.onDragStart?.({ itemId: card.itemId, cellId: hit[0] });
    },
    [grab, hoverHeight, hoverOpacity, hoverWidth, hoverX, hoverY, phase, store, tracking, uiScrollTick],
  );

  /** Swaps the card for a placeholder of its height and starts the per-frame loop. */
  const showPlaceholder = useCallback(
    (active: ActiveDrag) => {
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
    },
    [loop, store],
  );

  /**
   * The lifted copy has laid out. Show it, then swap the card for a
   * placeholder once the copy covers it. Swapping, or hiding the card, any
   * earlier leaves an empty gap on screen for a frame or two: the copy shows
   * on the UI thread, the hidden card waits for a React commit that can land
   * first. The card stays hidden from then on, for the drop's settle.
   */
  const onHoverLaidOut = useCallback(() => {
    const active = drag.current;
    if (!active || hoverReady.value || phase.value !== PHASE_DRAGGING) return;
    hoverReady.value = true;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (drag.current !== active || phase.value !== PHASE_DRAGGING) return;
        hidden.set(active.itemId);
        showPlaceholder(active);
      }),
    );
  }, [hidden, hoverReady, phase, showPlaceholder]);

  const move = useCallback((x: number, y: number) => {
    const active = drag.current;
    if (active) active.pointer = { x, y };
  }, []);

  const end = useCallback(
    (cancelled: boolean) => {
      cancelAnimationFrame(frameRef.current);
      stopUiScroll();
      const active = drag.current;
      if (!active) {
        phase.value = PHASE_IDLE;
        return;
      }
      if (active.ended) return;
      // From here the drag is over, even while the card waits a frame or two to fly home.
      active.ended = true;
      const current = propsRef.current;
      const placement = store.placement.current;
      const travelled = Math.hypot(active.pointer.x - active.start.x, active.pointer.y - active.start.y);
      // Once the finger has moved, this is a drag: coming back to the start and letting go never opens the menu.
      const menu = !cancelled && travelled < MENU_SLOP && !active.scrolled && !active.armed;
      if (!placement) {
        // Released before the placeholder appeared: nothing moved, so the copy settles onto the card.
        settle(active.home);
        current.onDragEnd?.({ itemId: active.itemId, cancelled: true });
        if (menu) current.onLongPressMenu?.({ itemId: active.itemId, cellId: active.sourceCellId });
        return;
      }
      const zone = findZone(store.zones, active.pointer.x, active.pointer.y);
      if (zone && !cancelled && !menu) {
        const [zoneId, geometry, rect] = zone;
        const taken =
          geometry.accepts(active.itemId) &&
          current.onZoneDrop?.({ itemId: active.itemId, sourceCellId: active.sourceCellId, zoneId }) === true;
        if (taken) {
          setPlacement(store, null, false);
          // Shrink toward the zone's middle while fading, so the card reads as dropped into it.
          const width = store.hoverWidth.value;
          const height = store.hoverHeight.value;
          settle(
            { x: rect.x + rect.width / 2 - width / 2, y: rect.y + rect.height / 2 - height / 2, width, height },
            true,
          );
          current.onDragEnd?.({ itemId: active.itemId, cancelled: false });
          return;
        }
      }
      const atHome = placement.cellId === active.sourceCellId && placement.index === active.sourceIndex;
      // A zone covers the cells beneath it: a refused zone drop is not a drop on those cells.
      const released = zone
        ? null
        : (findCell(store.cells, active.pointer.x, active.pointer.y) ?? edgeTarget(active)?.hit ?? null);
      // Released outside every cell that takes the card: the move is cancelled.
      const onTarget = released != null && allowedIn(released[1], released[0], active.itemId);

      const landing = placeholderRect();
      // One React render: the placeholder goes away and the card appears in its place.
      const committed =
        !cancelled &&
        !menu &&
        !atHome &&
        onTarget &&
        (placement.cellId === active.sourceCellId
          ? current.onReorder({
              itemId: active.itemId,
              cellId: placement.cellId,
              fromIndex: active.sourceIndex,
              toIndex: placement.index,
            })
          : current.onTransfer({
              itemId: active.itemId,
              fromCellId: active.sourceCellId,
              toCellId: placement.cellId,
              toIndex: placement.index,
            }));
      if (committed) {
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
    [allowedIn, edgeTarget, phase, placeholderRect, settle, stopUiScroll, store],
  );

  // App data changed mid-drag: if the lifted card is gone or now lives elsewhere, drop the drag.
  const { revision, isDragValid } = props;
  useEffect(() => {
    const active = drag.current;
    if (!active || active.ended || !isDragValid || phase.value !== PHASE_DRAGGING) return;
    if (isDragValid(active.itemId, active.sourceCellId)) return;
    cancelAnimationFrame(frameRef.current);
    stopUiScroll();
    setPlacement(store, null, false);
    settle(null);
    propsRef.current.onDragEnd?.({ itemId: active.itemId, cancelled: true });
  }, [isDragValid, phase, revision, settle, stopUiScroll, store]);

  useEffect(
    () => () => {
      cancelAnimationFrame(frameRef.current);
      for (const timer of timers.current) clearTimeout(timer);
    },
    [],
  );

  const { pointerX, pointerY, handleDown, touchStart } = store;
  const { longPressDelay = 200, enabled = true, handleOnly = false, dragPosition } = props;
  /**
   * The board owns every drag, in both modes, so a drag survives its card being
   * swapped for the placeholder. Long-press mode waits for the press. Handle
   * mode activates on the first movement, only when the touch started on a
   * handle, and starts from where the finger went down. A mouse (iPad pointer,
   * Android, ChromeOS) needs only a short press, not a long one.
   */
  const gesture = useMemo(() => {
    const base = () => Gesture.Pan().enabled(enabled).maxPointers(1).shouldCancelWhenOutside(false);
    /** Handle mode: activates once the touch has moved, if it started on a handle. */
    const onMove = (pan: PanGesture) =>
      pan
        .manualActivation(true)
        .onTouchesDown((event) => {
          'worklet';
          const touch = event.allTouches[0];
          if (touch) touchStart.value = { x: touch.absoluteX, y: touch.absoluteY };
        })
        .onTouchesMove((event, manager) => {
          'worklet';
          if (handleOnly && !handleDown.value) {
            manager.fail();
            return;
          }
          const touch = event.allTouches[0];
          if (!touch) return;
          const moved = Math.hypot(touch.absoluteX - touchStart.value.x, touch.absoluteY - touchStart.value.y);
          if (moved >= HANDLE_SLOP) manager.activate();
        });
    /** A pan for the mouse only: anything else fails at touch down, so a finger's long press waits for nothing. */
    const mouse = () =>
      base()
        .activateAfterLongPress(MOUSE_HOLD)
        .onTouchesDown((event, manager) => {
          'worklet';
          if (event.pointerType !== MOUSE) manager.fail();
        });
    const drags = (pan: PanGesture, fromTouchStart: boolean) =>
      pan
        .onStart((event) => {
          'worklet';
          if (phase.value !== PHASE_IDLE) return;
          const frame = measure(boardRef);
          if (!frame) return;
          origin.value = { x: frame.pageX, y: frame.pageY };
          phase.value = PHASE_DRAGGING;
          // A drag that waits for movement picks the card under the first touch, not where the pointer is now.
          const startX = fromTouchStart ? touchStart.value.x : event.absoluteX;
          const startY = fromTouchStart ? touchStart.value.y : event.absoluteY;
          scheduleOnRN(begin, startX - frame.pageX, startY - frame.pageY);
        })
        .onUpdate((event) => {
          'worklet';
          if (phase.value !== PHASE_DRAGGING) return;
          const x = event.absoluteX - origin.value.x;
          const y = event.absoluteY - origin.value.y;
          if (dragPosition) dragPosition.value = { x, y };
          pointerX.value = x;
          pointerY.value = y;
          if (tracking.value) {
            hoverX.value = x - grab.value.x;
            hoverY.value = y - grab.value.y;
          }
          scheduleOnRN(move, x, y);
        })
        .onFinalize((_event, success) => {
          'worklet';
          handleDown.value = false;
          if (phase.value !== PHASE_DRAGGING) return;
          // Stop UI-thread scrolling now: JS may take a few frames to run end().
          armed.value = false;
          scheduleOnRN(end, !success);
        });
    if (handleOnly) return drags(onMove(base()), true);
    // The mouse gesture fails at once for a finger or a pen, so their long press is unchanged.
    return Gesture.Exclusive(drags(mouse(), false), drags(base().activateAfterLongPress(longPressDelay), false));
  }, [
    armed,
    begin,
    boardRef,
    dragPosition,
    enabled,
    end,
    grab,
    handleDown,
    handleOnly,
    hoverX,
    hoverY,
    longPressDelay,
    move,
    origin,
    phase,
    pointerX,
    pointerY,
    touchStart,
    tracking,
  ]);
  const handles = enabled && handleOnly;

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View ref={boardRef} style={styles.fill} collapsable={false}>
        <HandleContext value={handles}>{props.children}</HandleContext>
        <UiAutoScroll targets={uiTargets} />
        <DragOverlay
          hoverItemId={hoverItemId}
          renderHover={props.renderHover}
          colors={props.colors}
          reducedMotion={props.reducedMotion ?? false}
          horizontalOffset={props.horizontalOffset}
          lift={props.lift ?? DEFAULT_LIFT}
          dragKey={dragKey}
          onLaidOut={onHoverLaidOut}
        />
      </Animated.View>
    </GestureDetector>
  );
}

/**
 * Continuous auto-scroll on the UI thread. JS picks the scroll views under the
 * finger and publishes their limits; this frame callback moves them every
 * screen frame, so scrolling stays smooth while JS renders the cells coming
 * into view. It runs only while a drag has a UI-thread target.
 */
function UiAutoScroll({ targets }: { targets: UiTargets }) {
  const { phase, armed, pointerX, pointerY, autoX, autoY, uiScrollTick } = useEngine();
  const posX = useSharedValue(Number.NaN);
  const posY = useSharedValue(Number.NaN);
  const dwellX = useSharedValue(0);
  const dwellY = useSharedValue(0);
  const writtenX = useSharedValue<number[]>([]);
  const writtenY = useSharedValue<number[]>([]);
  const { x: targetX, y: targetY } = targets;

  const tick = useCallback(
    (frame: FrameInfo) => {
      'worklet';
      if (phase.value !== PHASE_DRAGGING || !armed.value) return;
      const dt = frame.timeSincePreviousFrame ?? 16;
      const axes = [
        {
          target: targetX,
          config: autoX.value,
          pointer: pointerX.value,
          pos: posX,
          dwell: dwellX,
          written: writtenX,
          horizontal: true,
        },
        {
          target: targetY,
          config: autoY.value,
          pointer: pointerY.value,
          pos: posY,
          dwell: dwellY,
          written: writtenY,
          horizontal: false,
        },
      ];
      for (const axis of axes) {
        const { target, config } = axis;
        // Limits for another scroller: JS moved on and React has not handed us the new target yet.
        if (!target || !config.on || config.target !== target.id) {
          axis.dwell.value = 0;
          continue;
        }
        // Integrate from where we last put it, because the offset event for that scroll may
        // not be back yet. An offset none of our recent writes explain was moved by someone
        // else (FlashList correcting for a row above that changed height), so follow it.
        const written = axis.written.value;
        const from = autoScrollOrigin(axis.pos.value, target.offset.value, written);
        const step = stepAutoScroll({
          pointer: axis.pointer,
          frameStart: config.start,
          frameSize: config.size,
          edgeZone: config.zone,
          offset: from,
          maxOffset: config.max,
          dwellMs: axis.dwell.value,
          dtMs: dt,
          mode: 'continuous',
          pageSize: config.size,
          reducedMotion: config.reduced,
          delayMs: config.delay,
        });
        axis.dwell.value = step.dwellMs;
        // Sub-pixel steps wait and add up, so the position never runs ahead of the screen.
        if (Math.abs(step.offset - from) < 0.5) {
          axis.pos.value = from;
          continue;
        }
        if (axis.horizontal) scrollTo(target.ref, step.offset, 0, false);
        else scrollTo(target.ref, 0, step.offset, false);
        axis.pos.value = step.offset;
        axis.written.value = [...written.slice(1 - OFFSET_HISTORY), from, step.offset];
        uiScrollTick.value += 1;
      }
    },
    [
      armed,
      autoX,
      autoY,
      dwellX,
      dwellY,
      phase,
      pointerX,
      pointerY,
      posX,
      posY,
      targetX,
      targetY,
      uiScrollTick,
      writtenX,
      writtenY,
    ],
  );
  const callback = useFrameCallback(tick, false);

  // A new target starts from its own offset, with no dwell or history carried over.
  useEffect(() => {
    posX.value = Number.NaN;
    dwellX.value = 0;
    writtenX.value = [];
  }, [dwellX, posX, targetX, writtenX]);
  useEffect(() => {
    posY.value = Number.NaN;
    dwellY.value = 0;
    writtenY.value = [];
  }, [dwellY, posY, targetY, writtenY]);
  useEffect(() => {
    callback.setActive(targetX !== null || targetY !== null);
  }, [callback, targetX, targetY]);
  return null;
}

function DragOverlay({
  hoverItemId,
  renderHover,
  colors,
  reducedMotion,
  horizontalOffset,
  lift,
  dragKey,
  onLaidOut,
}: {
  hoverItemId: string | null;
  dragKey: number;
  renderHover: DragBoardProps['renderHover'];
  colors: DragBoardProps['colors'];
  reducedMotion: boolean;
  horizontalOffset: DragBoardProps['horizontalOffset'];
  lift: LiftStyle;
  onLaidOut: () => void;
}) {
  const { hoverX, hoverY, hoverWidth, hoverHeight, hoverOpacity, hoverReady, phase, outline, activeZone, grab } =
    useEngine();
  const { scale, tilt } = lift;
  // 1 while the finger is on a drop zone: the copy shrinks toward the finger so the zone stays visible.
  const zoneProgress = useSharedValue(0);
  useAnimatedReaction(
    () => activeZone.value !== '',
    (over, previous) => {
      if (over !== previous) zoneProgress.value = withTiming(over ? 1 : 0, { duration: reducedMotion ? 0 : 140 });
    },
    [reducedMotion],
  );
  // 0 at rest, 1 lifted. Scale and tilt are read from it, so both stay plain numbers in the style.
  const liftProgress = useSharedValue(0);
  useAnimatedReaction(
    () => phase.value === PHASE_DRAGGING && !reducedMotion,
    (lifted, previous) => {
      if (lifted !== previous) liftProgress.value = withTiming(lifted ? 1 : 0, { duration: 140 });
    },
    [reducedMotion],
  );

  const hoverStyle = useAnimatedStyle(() => {
    const progress = liftProgress.value;
    const shrink = 1 - ZONE_SHRINK * zoneProgress.value;
    return {
      width: hoverWidth.value,
      height: hoverHeight.value,
      opacity: hoverReady.value ? hoverOpacity.value * (1 - 0.45 * zoneProgress.value) : 0,
      transformOrigin: [grab.value.x, grab.value.y, 0],
      transform: [
        { translateX: hoverX.value },
        { translateY: hoverY.value },
        { scale: (1 + (scale - 1) * progress) * shrink },
        { rotate: `${tilt * progress}deg` },
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
      <Animated.View style={[styles.hover, { shadowOpacity: lift.shadowOpacity }, hoverStyle]}>
        {hoverItemId != null ? (
          // Keyed per drag, so every drag mounts a fresh view and its first layout means "drawn".
          <View key={dragKey} onLayout={onLaidOut}>
            {renderHover(hoverItemId)}
          </View>
        ) : null}
      </Animated.View>
    </View>
  );
}

/**
 * Marks a touch as starting on a handle; the board's pan then starts the
 * drag. The handle never owns the drag itself, because its card is swapped
 * for a placeholder as soon as the drag begins. Outside handle mode it only
 * draws its children.
 */
function DragHandle({ children, style, hitSlop }: DragHandleProps) {
  const handles = use(HandleContext);
  const { handleDown } = useEngine();
  const gesture = useMemo(() => {
    if (!handles) return null;
    const touch = Gesture.Manual()
      .onTouchesDown(() => {
        'worklet';
        handleDown.value = true;
      })
      .onTouchesUp(() => {
        'worklet';
        handleDown.value = false;
      });
    return hitSlop === undefined ? touch : touch.hitSlop(hitSlop);
  }, [handleDown, handles, hitSlop]);
  if (!gesture) return <View style={style}>{children}</View>;
  return (
    <GestureDetector gesture={gesture}>
      <View style={style} collapsable={false}>
        {children}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  covered: { opacity: 0 },
  fill: { flex: 1 },
  overlay: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, zIndex: 1000, elevation: 1000 },
  hover: {
    position: 'absolute',
    left: 0,
    top: 0,
    shadowColor: '#0B1220',
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
  Handle: DragHandle,
  Placeholder,
  useScroller,
  usePlacement,
  useDragSource,
  useDragMoved,
  usePlacementState,
  useZone,
  useActiveZone,
};
