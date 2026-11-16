import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { AccessibilityInfo, I18nManager, StyleSheet, View, useColorScheme, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import {
  NO_VALUE_ID,
  cellId as makeCellId,
  createProjector,
  parseCellId,
  projectBoard,
  restoreQueue as restoreSavedQueue,
  serializeQueue as serializeSavedQueue,
  type BoardModel,
  type GroupValue,
  type JournalEntry,
} from 'board-view-core';
import {
  BoardContext,
  CardContext,
  ThemeContext,
  createValueStore,
  useBoard,
  type BoardContextValue,
  type CardContextValue,
  type HeaderSheetTarget,
  type ScrollApi,
} from './context';
import { gestureAdapter } from './engine/DragEngine';
import type { ReorderIntent, TransferIntent } from './engine/types';
import { FlightCard, HoverCard } from './layout/BoardCard';
import { MoveLabel } from './layout/MoveLabel';
import { CatchUpChip } from './layout/CatchUpChip';
import { catchUpCounts, snapshotBoard, snapshotOf } from './catchUp';
import { MatrixLayout, matrixFits } from './layout/MatrixLayout';
import { ColumnsLayout } from './layout/ColumnsLayout';
import { DOCK_ACTION, DOCK_COLUMN, DropDock } from './layout/DropDock';
import { columnMetrics, resolveLayout, visualSlot, type ColumnMetrics } from './layout/metrics';
import { OverviewBar, zoomLevelsOf, zoomTheme } from './layout/Overview';
import { PagerDots, PagerTabs } from './layout/Pager';
import { PlannerToday } from './layout/PlannerToday';
import { StackedLayout } from './layout/StackedLayout';
import { SwimlaneLayout } from './layout/SwimlaneLayout';
import { UndoBanner } from './layout/UndoBanner';
import { visibleModel } from './layout/visible';
import { OUTSIDE_TARGET, OutsideTargets, dropOnOutsideTarget, useDropScope } from './layout/DropTargets';
import { GateSheet } from './sheet/GateSheet';
import { HeaderSheet } from './sheet/HeaderSheet';
import { MoveSheet } from './sheet/MoveSheet';
import { SelectionBar } from './layout/SelectionBar';
import { changedBetween, externalMovesBetween } from './layout/externalMoves';
import { hapticsFor } from './haptics';
import { columnStats, formatCompact, limitState, plannerDay, sumValues } from './insights';
import { defaultLabels, motionPresets, resolveTheme } from './theme';
import { moveTargetOf, useBoardController } from './useBoardController';
import { defaultGetRank, inBoardOrder, liveIndexFor, rulesAllow } from './session';
import { useAccessibilityServices, useReducedMotion } from './useReducedMotion';
import { runBoardCommand } from './commands';
import { changedSince, observedEntries, pastBoard, type TimelineView } from './timeline';
import { NO_MARKS, cardBadgesOf, describeCardOf, presenceByItem, proposedCounts, type CardRules } from './cardMarks';
import { ProposalBar } from './layout/ProposalBar';
import { AgeingLayout } from './layout/AgeingLayout';
import type { CardMark } from './context';
import type {
  BoardLabels,
  BoardProps,
  CardAction,
  CardActionEvent,
  CardDropEvent,
  MoveTarget,
  ZoomLevel,
} from './types';

const NO_IDS: readonly string[] = [];
const EMPTY_SET: ReadonlySet<string> = new Set();
const NO_ACTIONS: readonly CardAction[] = [];
const NO_ENTRIES: readonly JournalEntry[] = [];
const LIVE_VIEW: TimelineView = { position: null, mode: 'past', playing: false };
const noSubscribe = () => () => undefined;
/** A pinch that ends below this scale opens the overview; above the inverse it closes it. */
const PINCH_IN = 0.8;
const PINCH_OUT = 1.25;
/** How long the board shows `initialSnapshot`'s arrangement before the cards fly, and the chip after. */
const CATCH_UP_HOLD_MS = 450;
const CATCH_UP_CHIP_MS = 4000;
/** How far the board follows the fingers during a pinch, before the level changes on release. */
const PINCH_FOLLOW_MIN = 0.88;
const PINCH_FOLLOW_MAX = 1.1;
/** How long a `scrollToItem` highlight stays, long enough for the scroll to land and the flash to fade. */
const HIGHLIGHT_MS = 1800;
/** How long a card takes to fly to its new place (`animateChanges`), before the motion preset scales it. */
const FLIGHT_MS = 320;

function toggleIn(list: readonly string[], id: string): string[] {
  return list.includes(id) ? list.filter((entry) => entry !== id) : [...list, id];
}

/** The same array while the values read the same, so what reads it redraws only when they change. */
function useStableValues(values: readonly GroupValue[]): readonly GroupValue[] {
  const kept = useRef(values);
  const previous = kept.current;
  const same =
    previous.length === values.length &&
    previous.every((value, index) => {
      const next = values[index]!;
      return value.id === next.id && value.label === next.label && value.color === next.color;
    });
  if (!same) kept.current = values;
  return kept.current;
}

/** Width a card gets in its column (or the whole board when stacked). */
function cardWidthIn(
  metrics: ColumnMetrics,
  columns: readonly GroupValue[],
  columnKey: string,
  boardWidth: number,
  spacing: { columnGap: number; cellPadding: number },
  rtl: boolean,
): number {
  if (metrics.mode === 'stacked') return boardWidth - (spacing.columnGap + spacing.cellPadding) * 2;
  const at = columns.findIndex((column) => column.id === columnKey);
  const slot = at >= 0 ? metrics.slots[visualSlot(at, columns.length, rtl)] : undefined;
  return (slot?.width ?? boardWidth) - spacing.cellPadding * 2;
}

/** Controlled list with an uncontrolled fallback, for collapsed lanes and columns. */
function useCollapsedList(controlled: readonly string[] | undefined, onChange: ((ids: string[]) => void) | undefined) {
  const [own, setOwn] = useState<readonly string[]>(NO_IDS);
  const list = controlled ?? own;
  const live = useRef({ list, controlled, onChange });
  live.current = { list, controlled, onChange };
  const toggle = useCallback((id: string) => {
    const current = live.current;
    const next = toggleIn(current.list, id);
    if (current.controlled === undefined) setOwn(next);
    current.onChange?.(next);
  }, []);
  const set = useMemo(() => new Set(list), [list]);
  return [set, toggle] as const;
}

/**
 * The selection, controlled or not, published through a store so only the
 * cards whose state changes re-render. Cards that leave the board drop out.
 */
function useSelection<T>(
  controlled: readonly string[] | undefined,
  onChange: ((ids: string[]) => void) | undefined,
  enabled: boolean,
  model: BoardModel<T>,
) {
  const [own, setOwn] = useState<readonly string[]>(NO_IDS);
  const raw = enabled ? (controlled ?? own) : NO_IDS;
  const list = useMemo(() => raw.filter((id) => model.locations.has(id)), [model.locations, raw]);
  const [store] = useState(() => createValueStore<ReadonlySet<string>>(new Set()));
  useLayoutEffect(() => {
    const previous = store.get();
    if (previous.size === list.length && list.every((id) => previous.has(id))) return;
    store.set(new Set(list));
  }, [list, store]);
  const live = useRef({ list, controlled, onChange, enabled });
  live.current = { list, controlled, onChange, enabled };
  const set = useCallback((ids: readonly string[]) => {
    const current = live.current;
    if (!current.enabled) return;
    const next = [...new Set(ids)];
    if (next.length === current.list.length && next.every((id, index) => current.list[index] === id)) return;
    if (current.controlled === undefined) setOwn(next);
    current.onChange?.(next);
  }, []);
  const toggle = useCallback((id: string) => set(toggleIn(live.current.list, id)), [set]);
  const get = useCallback(() => live.current.list, []);
  return { store, list, set, toggle, get };
}

/**
 * A board derived from flat items. The board is a projection: it never
 * edits your data. Moves arrive in `onMove` as operations you apply (or
 * reject); until your items show a move, the board shows it as an overlay.
 */
export function Board<T>(props: BoardProps<T>) {
  const scheme = useColorScheme();
  const appearance = props.appearance ?? 'auto';
  const dark = appearance === 'dark' || (appearance === 'auto' && scheme === 'dark');
  const motion = props.motion ?? 'standard';
  const baseTheme = useMemo(
    () => resolveTheme(dark, props.density, props.theme, props.themePreset, motion),
    [dark, motion, props.density, props.theme, props.themePreset],
  );
  const labels = useMemo<BoardLabels>(() => ({ ...defaultLabels, ...props.labels }), [props.labels]);
  const fullController = useBoardController(props, labels);
  const hasLanes = props.groupBy.lanes != null;
  const fullModel = fullController.model;
  // Since you were away: the board first draws `initialSnapshot`'s arrangement, then flies to the live one.
  const initialSnapshot = useRef(props.initialSnapshot).current;
  const [catchUp, setCatchUp] = useState<'before' | 'playing' | 'done'>(initialSnapshot ? 'before' : 'done');
  const { getItemId, getRank, groupBy, rankStrategy } = props;
  const pastModel = useMemo(() => {
    if (catchUp !== 'before' || !initialSnapshot) return null;
    const past = snapshotBoard(
      initialSnapshot,
      [...fullController.itemsById.values()],
      getItemId,
      groupBy,
      rankStrategy,
    );
    return projectBoard({
      items: past.items,
      getItemId,
      getRank: getRank ?? defaultGetRank,
      groupBy,
      overlays: past.overlays,
      strategy: rankStrategy,
      noValueLabel: labels.noValue,
    });
  }, [catchUp, fullController.itemsById, getItemId, getRank, groupBy, initialSnapshot, labels.noValue, rankStrategy]);
  // The time machine: while the timeline is scrubbed, the board draws the past from its journal.
  const timeline = props.timeline?.core ?? null;
  const timelineView = useSyncExternalStore(
    timeline?.view.subscribe ?? noSubscribe,
    () => timeline?.view.get() ?? LIVE_VIEW,
    () => LIVE_VIEW,
  );
  const journalEntries = useSyncExternalStore(
    timeline?.journal.subscribe ?? noSubscribe,
    () => timeline?.journal.entries() ?? NO_ENTRIES,
    () => NO_ENTRIES,
  );
  const scrubbing = timelineView.position != null && timelineView.mode === 'past';
  const [timeProjector] = useState(() => createProjector<T>());
  const timeModel = useMemo(() => {
    if (!scrubbing) return null;
    const past = pastBoard(
      journalEntries,
      timelineView.position!,
      fullModel,
      [...fullController.itemsById.values()],
      getItemId,
      groupBy,
    );
    return timeProjector.project({
      items: past.items,
      getItemId,
      getRank: getRank ?? defaultGetRank,
      groupBy,
      overlays: past.overlays,
      strategy: rankStrategy,
      noValueLabel: labels.noValue,
    });
  }, [
    fullController.itemsById,
    fullModel,
    getItemId,
    getRank,
    groupBy,
    journalEntries,
    labels.noValue,
    rankStrategy,
    scrubbing,
    timeProjector,
    timelineView.position,
  ]);
  const diffIds = useMemo(
    () =>
      timelineView.position != null && timelineView.mode === 'diff'
        ? changedSince(journalEntries, timelineView.position, fullModel)
        : null,
    [fullModel, journalEntries, timelineView.mode, timelineView.position],
  );
  const drawnBase = pastModel ?? timeModel ?? fullModel;
  const shownModel = useMemo(
    () => visibleModel(drawnBase, props.hideEmptyColumns === true, hasLanes && props.hideEmptyLanes === true),
    [drawnBase, hasLanes, props.hideEmptyColumns, props.hideEmptyLanes],
  );
  // Layouts draw `controller.model`; moves still plan against the whole board inside the controller.
  const events = useRef(props);
  events.current = props;
  const controller = useMemo(
    () => (shownModel === fullModel ? fullController : { ...fullController, model: shownModel }),
    [fullController, fullModel, shownModel],
  );
  const reducedMotion = useReducedMotion();
  const accessibilityActions = useAccessibilityServices();
  const rtl = I18nManager.isRTL;
  const allColumns = useStableValues(fullModel.columns);
  const allLanes = useStableValues(fullModel.lanes);
  const allColumnsRef = useRef(allColumns);
  allColumnsRef.current = allColumns;
  const allLanesRef = useRef(allLanes);
  allLanesRef.current = allLanes;
  const shownColumns = useStableValues(controller.model.columns);

  const [root, setRoot] = useState({ width: 0, height: 0 });
  const onRootLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setRoot((previous) => (previous.width === width && previous.height === height ? previous : { width, height }));
  }, []);

  const requested = props.layout ?? 'auto';
  // The planner is the multi layout with day headers, a Today button and sideways loading.
  const planner = requested === 'planner';
  // A matrix needs lanes for its rows and room for each of them; otherwise it is drawn as swimlanes (or fit, without lanes).
  const matrixRoom = hasLanes && matrixFits(fullModel.lanes.length, root.height, baseTheme.columnGap);
  const baseMode = resolveLayout(
    requested === 'matrix' && !matrixRoom ? 'fit' : planner ? 'multi' : requested,
    root.width,
    props.autoBreakpoint,
  );
  const zoomLevels = useMemo(() => zoomLevelsOf(props.zoom, props.overview), [props.zoom, props.overview]);
  const zoomAvailable = zoomLevels.length > 1 && !hasLanes && baseMode !== 'stacked';
  const [levelOwn, setLevelOwn] = useState<ZoomLevel>('card');
  // `overviewOpen` still controls the older two-level overview: open is its furthest level.
  const controlledLevel =
    props.zoomLevel ?? (props.overviewOpen === undefined ? undefined : props.overviewOpen ? zoomLevels.at(-1) : 'card');
  // The drag lens zooms out to titles while a card is lifted on a paged board.
  const [lens, setLens] = useState(false);
  const lensOpen = useRef(false);
  const lensAvailable = props.dragLens === true && !hasLanes && baseMode === 'paged';
  const zoomed: ZoomLevel = zoomAvailable ? (controlledLevel ?? levelOwn) : 'card';
  const level: ZoomLevel = lens && lensAvailable ? 'title' : zoomed;
  const zoomedOut = level !== 'card';
  // The overview is the board's own small cards: the title and dot levels.
  const overview = level === 'title' || level === 'dot';
  // Zoomed out is the fit layout, so every column (or most) fits on screen.
  const mode = zoomedOut ? 'fit' : baseMode;
  const pagerIndicator = mode === 'paged' ? (props.pagerIndicator ?? 'tabs') : 'none';
  // Measured, not assumed: pager chrome grows with the user's text size.
  const [bodyHeight, setBodyHeight] = useState(0);
  // Board coordinates start here: outside drop targets are measured against it.
  const bodyRef = useRef<View>(null);
  const dropScope = useDropScope();
  const onBodyLayout = useCallback((event: LayoutChangeEvent) => {
    setBodyHeight(event.nativeEvent.layout.height);
  }, []);
  const boardWidth = root.width;
  // While the drop dock shows, the lists end above it, so it never covers a card.
  const [dockInset, setDockInset] = useState(0);
  const boardHeight = Math.max(0, bodyHeight - dockInset);

  const theme = useMemo(() => zoomTheme(baseTheme, level), [baseTheme, level]);

  const [collapsedLanesOwn, toggleLane] = useCollapsedList(props.collapsedLanes, props.onCollapsedLanesChange);
  const canCollapseLanes = props.collapsibleLanes !== false;
  const collapsedLanes = canCollapseLanes ? collapsedLanesOwn : EMPTY_SET;
  const [collapsedColumns, toggleColumn] = useCollapsedList(props.collapsedColumns, props.onCollapsedColumnsChange);
  const canCollapseColumns = mode !== 'paged' && mode !== 'matrix' && (props.collapsibleColumns ?? mode === 'stacked');

  const columns = controller.model.columns;
  const collapsedKey = columns
    .map((_, slot) => {
      const column = columns[visualSlot(slot, columns.length, rtl)];
      return canCollapseColumns && column != null && collapsedColumns.has(column.id) ? '1' : '0';
    })
    .join('');
  // Built from the four tokens it reads, not the theme object: an inline `theme={{…}}` is a new object every render.
  const { columnWidth, columnGap, collapsedColumnWidth, minColumnWidth } = theme;
  const metrics = useMemo(
    () =>
      columnMetrics(
        mode,
        boardWidth,
        [...collapsedKey].map((flag) => flag === '1'),
        { columnWidth, columnGap, collapsedColumnWidth, minColumnWidth },
      ),
    [boardWidth, collapsedColumnWidth, collapsedKey, columnGap, columnWidth, minColumnWidth, mode],
  );

  const scrollX = useSharedValue(0);
  const horizontalScrollGesture = useMemo(() => Gesture.Native(), []);
  const [page] = useState(() => createValueStore(0));
  const [lastColumn] = useState<{ current: string | null }>(() => ({ current: null }));
  const scrollApi = useRef<ScrollApi | null>(null);

  const readOnly = props.readOnly === true;
  // The past is read-only: no drag, no sheet, no swipe, until the timeline is live again.
  const frozen = readOnly || scrubbing;
  const sheetMode = frozen ? false : (props.moveModes?.sheet ?? 'auto');
  const selectable = !readOnly && props.selectable !== false;
  const selection = useSelection(props.selection, props.onSelectionChange, selectable, fullModel);
  // The pieces are stable; the object around them is not, so callbacks list the pieces.
  const { get: selectionGet, set: selectionSet } = selection;
  const [sheetItems, setSheetItems] = useState<readonly string[] | null>(null);
  if (readOnly && sheetItems !== null) setSheetItems(null);
  /** The sheet for a card, or for the whole selection when the card is in it. */
  const openMoveSheet = useCallback(
    (itemId: string) => {
      if (sheetMode === false) return;
      const selected = selectionGet();
      setSheetItems(
        selected.length > 1 && selected.includes(itemId)
          ? [itemId, ...selected.filter((id) => id !== itemId)]
          : [itemId],
      );
    },
    [selectionGet, sheetMode],
  );
  const closeMoveSheet = useCallback(() => setSheetItems(null), []);
  const [headerSheetTarget, setHeaderSheet] = useState<HeaderSheetTarget | null>(null);
  const closeHeaderSheet = useCallback(() => setHeaderSheet(null), []);

  const [highlight] = useState(() => createValueStore<{ readonly itemId: string } | null>(null));
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (highlightTimer.current) clearTimeout(highlightTimer.current);
    },
    [],
  );
  // Where to return when the overview closes, and a column to scroll to once the board is back.
  const returnColumn = useRef<string | null>(null);
  const [revealColumn, setRevealColumn] = useState<string | null>(null);
  const zoomState = {
    zoomAvailable,
    level,
    levels: zoomLevels,
    onZoomLevelChange: props.onZoomLevelChange,
    onOverviewChange: props.onOverviewChange,
    controlled: props.zoomLevel !== undefined || props.overviewOpen !== undefined,
  };
  const live = useRef(zoomState);
  live.current = zoomState;
  const setZoomLevel = useCallback((next: ZoomLevel, columnId?: string) => {
    const current = live.current;
    if (!current.zoomAvailable || !current.levels.includes(next) || current.level === next) return;
    if (next === 'card') setRevealColumn(columnId ?? returnColumn.current);
    if (!current.controlled) setLevelOwn(next);
    current.onZoomLevelChange?.(next);
    const isOverview = (value: ZoomLevel) => value === 'title' || value === 'dot';
    if (isOverview(next) !== isOverview(current.level)) current.onOverviewChange?.(isOverview(next));
  }, []);
  const setOverview = useCallback(
    (open: boolean, columnId?: string) =>
      setZoomLevel(open ? (live.current.levels.at(-1) ?? 'card') : 'card', columnId),
    [setZoomLevel],
  );
  // Remember where the board was whenever it zooms out, controlled or not.
  const wasOverview = useRef(zoomedOut);
  if (zoomedOut && !wasOverview.current) {
    const columnsNow = controller.model.columns;
    returnColumn.current = lastColumn.current ?? columnsNow[visualSlot(page.get(), columnsNow.length, rtl)]?.id ?? null;
  }
  if (!zoomedOut && wasOverview.current && revealColumn === null && returnColumn.current) {
    // Zoomed back in by the app (`zoomLevel`, `overviewOpen`): go back to where the board was.
    setRevealColumn(returnColumn.current);
  }
  wasOverview.current = zoomedOut;
  useEffect(() => {
    if (zoomedOut || revealColumn === null) return;
    const frame = requestAnimationFrame(() => {
      scrollApi.current?.toColumn(revealColumn, false);
      setRevealColumn(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [zoomedOut, revealColumn]);

  const { moveTo, moveManyTo, undo, canUndo } = controller;
  const setSelection = selection.set;
  const getSelection = selection.get;
  const liveModel = useRef(fullModel);
  liveModel.current = fullModel;
  useImperativeHandle(
    props.ref,
    () => ({
      scrollToColumn: (columnId, options) => scrollApi.current?.toColumn(columnId, options?.animated ?? true),
      scrollToItem: (itemId, options) => {
        scrollApi.current?.toItem(itemId, options?.animated ?? true);
        if (!options?.highlight) return;
        const request = { itemId };
        highlight.set(request);
        if (highlightTimer.current) clearTimeout(highlightTimer.current);
        highlightTimer.current = setTimeout(() => {
          if (highlight.get() === request) highlight.set(null);
        }, HIGHLIGHT_MS);
      },
      moveItem: moveTo,
      moveItems: moveManyTo,
      openMoveSheet,
      closeMoveSheet,
      undo: () => undo(),
      canUndo,
      setOverview,
      setZoomLevel,
      snapshot: () => snapshotOf(liveModel.current),
      setSelection,
      getSelection,
      run: (command) =>
        runBoardCommand(command, {
          model: () => liveModel.current,
          hasLanes,
          columnIds: new Set(allColumnsRef.current.map((column) => column.id)),
          laneIds: new Set(allLanesRef.current.map((lane) => lane.id)),
          moveTo: (itemId, to, origin) => fullController.moveToFrom(itemId, to, origin),
          moveManyTo: (itemIds, to, origin) => fullController.moveManyToFrom(itemIds, to, origin),
          undo: () => undo(),
          canUndo,
          select: selectable ? setSelection : undefined,
          scrollToColumn: (columnId) => scrollApi.current?.toColumn(columnId, true),
          revealItem: (itemId) => {
            scrollApi.current?.toItem(itemId, true);
            const request = { itemId };
            highlight.set(request);
            if (highlightTimer.current) clearTimeout(highlightTimer.current);
            highlightTimer.current = setTimeout(() => {
              if (highlight.get() === request) highlight.set(null);
            }, HIGHLIGHT_MS);
          },
          zoom: (next, columnId) => {
            const current = live.current;
            if (!current.zoomAvailable || !current.levels.includes(next)) return false;
            setZoomLevel(next, columnId);
            return true;
          },
          openMoveSheet: sheetMode === false ? undefined : openMoveSheet,
        }),
      serializeQueue: () => serializeSavedQueue(fullController.queue),
      restoreQueue: (saved) => restoreSavedQueue(fullController.queue, saved),
      inspect: () => {
        const gateNow = fullController.gate;
        const view = timeline?.view.get();
        return {
          cards: liveModel.current.locations.size,
          cells: liveModel.current.cells.length,
          pending: fullController.queue.pending(),
          overlays: fullController.queue.getSnapshot().overlays,
          gate: gateNow ? { request: gateNow.request, ops: gateNow.ops } : null,
          holding: fullController.holding,
          selection: getSelection(),
          zoomLevel: live.current.level,
          timeline: timeline ? { entries: timeline.journal.entries().length, position: view?.position ?? null } : null,
        };
      },
    }),
    [
      fullController,
      hasLanes,
      selectable,
      sheetMode,
      timeline,
      canUndo,
      closeMoveSheet,
      getSelection,
      highlight,
      moveManyTo,
      moveTo,
      openMoveSheet,
      setOverview,
      setSelection,
      setZoomLevel,
      undo,
    ],
  );

  const cardActions = readOnly ? NO_ACTIONS : (props.cardActions ?? NO_ACTIONS);
  const canPerformAction = props.canPerformAction;
  const cardActionsFor = useCallback(
    (itemId: string) => {
      const item = fullController.itemsById.get(itemId);
      if (item == null || cardActions.length === 0) return NO_ACTIONS;
      return canPerformAction ? cardActions.filter((action) => canPerformAction(item, action.key)) : cardActions;
    },
    [canPerformAction, cardActions, fullController.itemsById],
  );
  const runCardAction = useCallback(
    (itemId: string, key: string, source: CardActionEvent<unknown>['source'], itemIds?: readonly string[]) => {
      const item = fullController.itemsById.get(itemId);
      const location = fullController.model.locations.get(itemId);
      if (item == null || !location || !cardActionsFor(itemId).some((action) => action.key === key)) return false;
      const selected = selectionGet();
      const targets = itemIds ?? (selected.includes(itemId) ? selected : [itemId]);
      const ids = targets.filter((id) => id === itemId || cardActionsFor(id).some((action) => action.key === key));
      events.current.onCardAction?.({
        action: key,
        itemId,
        item,
        from: moveTargetOf(location.cellId),
        source,
        itemIds: ids.includes(itemId) ? ids : [itemId, ...ids],
      });
      if (ids.length > 1) selectionSet([]);
      return true;
    },
    [cardActionsFor, fullController.itemsById, fullController.model.locations, selectionGet, selectionSet],
  );

  // Column and lane order is the app's: the board reports a new order and waits for `groupBy` to show it.
  const announce = useCallback((message: string) => AccessibilityInfo.announceForAccessibility(message), []);

  // A card dropped onto another: nothing moves, the app decides what it means.
  const canDropOnCard = useCallback(
    (itemId: string, targetId: string) => {
      const item = fullController.itemsById.get(itemId);
      const target = fullController.itemsById.get(targetId);
      return (
        item != null && target != null && itemId !== targetId && (events.current.canDropOnCard?.(item, target) ?? true)
      );
    },
    [fullController.itemsById],
  );
  const dropOnCard = useCallback(
    (itemId: string, targetId: string, source: CardDropEvent<unknown>['source']) => {
      const item = fullController.itemsById.get(itemId);
      const target = fullController.itemsById.get(targetId);
      if (item == null || target == null || !canDropOnCard(itemId, targetId)) return false;
      const selected = selectionGet();
      const ids =
        selected.length > 1 && selected.includes(itemId) ? selected.filter((id) => id !== targetId) : [itemId];
      events.current.onCardDrop?.({ itemId, item, targetId, target, itemIds: ids, source });
      announce(
        labels.droppedOnto({ item: fullController.itemLabel(itemId), target: fullController.itemLabel(targetId) }),
      );
      if (ids.length > 1) selectionSet([]);
      return true;
    },
    [announce, canDropOnCard, fullController, labels, selectionGet, selectionSet],
  );
  const onCardDrop = useCallback(
    ({ itemId, targetId }: { itemId: string; targetId: string }) => {
      dropOnCard(itemId, targetId, 'drag');
    },
    [dropOnCard],
  );
  const moveColumn = useCallback(
    (columnId: string, toIndex: number) => {
      const ids = events.current.groupBy.columns.values.map((column) => column.id);
      const from = ids.indexOf(columnId);
      const to = Math.max(0, Math.min(ids.length - 1, toIndex));
      if (from < 0 || from === to) return;
      ids.splice(from, 1);
      ids.splice(to, 0, columnId);
      events.current.onColumnOrderChange?.(ids);
      const label = events.current.groupBy.columns.values[from]?.label ?? columnId;
      announce(labels.columnMoved({ column: label, position: to + 1, count: ids.length }));
    },
    [announce, labels],
  );
  const moveLane = useCallback(
    (laneId: string, toIndex: number) => {
      const lanes = events.current.groupBy.lanes;
      if (!lanes) return;
      const ids = lanes.values.map((lane) => lane.id);
      const from = ids.indexOf(laneId);
      const to = Math.max(0, Math.min(ids.length - 1, toIndex));
      if (from < 0 || from === to) return;
      ids.splice(from, 1);
      ids.splice(to, 0, laneId);
      events.current.onLaneOrderChange?.(ids);
      const label = lanes.values[from]?.label ?? laneId;
      announce(labels.laneMoved({ lane: label, position: to + 1, count: ids.length }));
    },
    [announce, labels],
  );
  const reorderColumns = !readOnly && props.onColumnOrderChange != null;
  const reorderLanes = !readOnly && hasLanes && props.onLaneOrderChange != null;
  const openHeaderSheet = useCallback((target: HeaderSheetTarget) => setHeaderSheet(target), []);
  const headerSheet = useCallback(
    (kind: HeaderSheetTarget['kind'], id: string) =>
      (kind === 'column' ? reorderColumns : reorderLanes) && id !== NO_VALUE_ID
        ? () => setHeaderSheet({ kind, id })
        : undefined,
    [reorderColumns, reorderLanes],
  );

  // Proposals: suggested moves the user accepts or declines. Accepting runs the move as a command.
  const decideProposal = useCallback(
    (proposalId: string, decision: 'accept' | 'decline'): boolean | undefined => {
      const current = events.current;
      const proposal = current.proposals?.find((entry) => entry.id === proposalId);
      const item = proposal ? fullController.itemsById.get(proposal.itemId) : undefined;
      if (!proposal || item == null) return undefined;
      const moved =
        decision === 'accept' ? fullController.moveToFrom(proposal.itemId, proposal.to, 'proposal') : undefined;
      current.onProposal?.(moved === undefined ? { proposal, item, decision } : { proposal, item, decision, moved });
      return moved;
    },
    [fullController],
  );
  const decideAll = useCallback(
    (decision: 'accept' | 'decline') => {
      // Accepting stops at the first move the board refuses: a full column, or one that now waits for its gate.
      for (const proposal of [...(events.current.proposals ?? [])]) {
        if (decideProposal(proposal.id, decision) === false) break;
      }
    },
    [decideProposal],
  );
  const proposals = scrubbing ? undefined : props.proposals;
  const proposedInto = useMemo(() => proposedCounts(proposals, fullModel.locations), [fullModel.locations, proposals]);
  const presenceItems = useMemo(() => presenceByItem(props.presence), [props.presence]);
  // What the board draws on cards besides their own content: proposals, presence, the timeline's diff.
  const [cardBadges] = useState(() => createValueStore<ReadonlyMap<string, CardMark>>(NO_MARKS));
  useLayoutEffect(() => {
    cardBadges.set(
      cardBadgesOf({
        proposals,
        presence: presenceItems,
        changed: diffIds,
        locations: fullModel.locations,
        columns: allColumns,
        lanes: allLanes,
        hasLanes,
        decide: decideProposal,
      }),
    );
  }, [
    allColumns,
    allLanes,
    cardBadges,
    decideProposal,
    diffIds,
    fullModel.locations,
    hasLanes,
    presenceItems,
    proposals,
  ]);

  // Moves `items` made by itself go in the timeline's journal: a teammate, a sync, a server rule.
  const journalPrevious = useRef<{ model: BoardModel<T>; isPending: (itemId: string) => boolean; keys: string } | null>(
    null,
  );
  const groupKeys = `${groupBy.columns.key}\u0000${groupBy.lanes?.key ?? ''}`;
  useEffect(() => {
    const before = journalPrevious.current;
    const now = { model: fullModel, isPending: fullController.isPending, keys: groupKeys };
    journalPrevious.current = now;
    if (!timeline || !before) return;
    const getActor = timeline.options.current.getActor;
    const actor = getActor
      ? (itemId: string) => {
          const item = fullController.itemsById.get(itemId);
          return item == null ? undefined : (getActor(item) ?? undefined);
        }
      : undefined;
    timeline.journal.append(observedEntries(before, now, Date.now(), actor));
  }, [fullController, fullModel, groupKeys, timeline]);

  // Cards the data moved by itself flash once, and a screen reader hears where they went.
  const [externalMoves] = useState(() => createValueStore<ReadonlyMap<string, object>>(new Map()));
  const previousModel = useRef<{ model: BoardModel<T>; isPending: (itemId: string) => boolean } | null>(null);
  const flashMoves = props.highlightExternalMoves !== false;
  const flashTimers = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(
    () => () => {
      for (const timer of flashTimers.current) clearTimeout(timer);
    },
    [],
  );
  useEffect(() => {
    const before = previousModel.current;
    previousModel.current = { model: fullModel, isPending: fullController.isPending };
    if (!flashMoves || !before || before.model === fullModel) return;
    const moved = externalMovesBetween(before.model, fullModel, before.isPending, fullController.isPending);
    if (moved.length === 0) return;
    const next = new Map(externalMoves.get());
    for (const itemId of moved) next.set(itemId, {});
    externalMoves.set(next);
    const first = moved[0]!;
    const cell = fullModel.cellById.get(fullModel.locations.get(first)?.cellId ?? '');
    if (cell && moved.length === 1) {
      announce(labels.externallyMoved({ item: fullController.itemLabel(first), column: cell.column.label }));
    }
    const timer = setTimeout(() => {
      flashTimers.current.delete(timer);
      const current = new Map(externalMoves.get());
      for (const itemId of moved) current.delete(itemId);
      externalMoves.set(current);
    }, HIGHLIGHT_MS);
    flashTimers.current.add(timer);
  }, [announce, externalMoves, flashMoves, fullController, fullModel, labels]);

  const loadingColumns = useMemo(() => new Set(props.loadingColumns ?? NO_IDS), [props.loadingColumns]);
  const columnTotals = props.columnTotals;
  const columnTotal = useCallback(
    (columnId: string, count: number) => columnTotals?.[columnId] ?? count,
    [columnTotals],
  );

  const { getItemValue, formatValue, columnLimits, spotlight, getItemAge } = props;
  const stats = useMemo(
    () => columnStats(fullModel, getItemValue as ((item: unknown) => number | null | undefined) | undefined),
    [fullModel, getItemValue],
  );
  const describeColumn = useCallback(
    (columnId: string, total: number, items?: readonly unknown[]) => {
      const limit = columnLimits?.[columnId];
      const read = getItemValue as ((item: unknown) => number | null | undefined) | undefined;
      const value = items ? sumValues(items, read) : (stats.get(columnId)?.value ?? null);
      return {
        limit: limit ?? null,
        limitState: limitState(total, limit),
        value,
        valueLabel: value == null ? null : (formatValue ?? formatCompact)(value),
        day: planner ? plannerDay(columnId) : null,
        proposed: proposedInto.get(columnId) ?? 0,
      };
    },
    [columnLimits, formatValue, getItemValue, planner, proposedInto, stats],
  );
  const staleAfterDays = props.staleAfterDays;
  const { getBlocked } = props;
  const describeCard = useCallback(
    (item: unknown, columnKey: string) =>
      describeCardOf(item, columnKey, { spotlight, getItemAge, staleAfterDays, getBlocked } as CardRules),
    [getBlocked, getItemAge, spotlight, staleAfterDays],
  );
  const durationScale = motionPresets[motion].durationScale;

  const swipeEnabled = !frozen && props.moveModes?.swipe === 'auto' && (mode === 'multi' || mode === 'fit');
  const autoScroll = props.autoScroll ?? true;

  // Read when a card's action runs, so the card need not redraw when the board does.
  const liveCardAction = useRef(runCardAction);
  liveCardAction.current = runCardAction;
  const runCardActionLater = useCallback<BoardContextValue['runCardAction']>(
    (...args) => liveCardAction.current(...args),
    [],
  );
  const actionsFor = useCallback(
    (item: unknown) => {
      if (cardActions.length === 0) return NO_ACTIONS;
      const can = canPerformAction as ((entry: unknown, action: string) => boolean) | undefined;
      return can ? cardActions.filter((action) => can(item, action.key)) : cardActions;
    },
    [canPerformAction, cardActions],
  );
  const { canDrop, limitBehavior } = props;
  const allows = useCallback(
    (item: unknown, fromColumnKey: string, cellId: string, full: ReadonlySet<string>) =>
      rulesAllow({ readOnly, limitBehavior, canDrop }, item as T, fromColumnKey, cellId, full),
    [canDrop, limitBehavior, readOnly],
  );
  const [fullColumns] = useState(() => createValueStore(fullController.fullColumns));
  useLayoutEffect(() => fullColumns.set(fullController.fullColumns), [fullColumns, fullController.fullColumns]);
  const { cellPadding } = theme;
  const cardWidth = useCallback(
    (columnKey: string) => cardWidthIn(metrics, shownColumns, columnKey, boardWidth, { columnGap, cellPadding }, rtl),
    [boardWidth, cellPadding, columnGap, metrics, rtl, shownColumns],
  );
  const { renderCard, getItemLabel, canDrag } = props;
  const cardMarks = props.cardMarks ?? 'auto';
  const { focusRequest } = fullController;
  const cardValue = useMemo<CardContextValue<T>>(
    () => ({
      renderCard,
      canDrag,
      hasLanes,
      adapter: gestureAdapter,
      theme,
      labels,
      rtl,
      reducedMotion,
      overview,
      detail: level,
      getItemColor: props.getItemColor as ((item: unknown) => string | null | undefined) | undefined,
      sheetMode,
      cardMarks,
      selectable,
      swipeEnabled,
      horizontalScrollGesture,
      columns: shownColumns,
      allColumns,
      allLanes,
      cardWidth,
      describeCard,
      actionsFor,
      allows,
      fullColumns,
      accessibilityActions,
      getItemLabel,
      moveItem: fullController.moveItem,
      runCardAction: runCardActionLater,
      openMoveSheet,
      toggleSelected: selection.toggle,
      selection: selection.store,
      highlight,
      externalMoves,
      cardBadges,
      focusRequest,
      scrollApi,
    }),
    [
      accessibilityActions,
      cardBadges,
      actionsFor,
      allColumns,
      allLanes,
      allows,
      canDrag,
      cardMarks,
      cardWidth,
      describeCard,
      externalMoves,
      focusRequest,
      fullColumns,
      fullController.moveItem,
      getItemLabel,
      hasLanes,
      highlight,
      horizontalScrollGesture,
      labels,
      openMoveSheet,
      overview,
      level,
      props.getItemColor,
      reducedMotion,
      renderCard,
      rtl,
      runCardActionLater,
      selectable,
      selection.store,
      selection.toggle,
      sheetMode,
      shownColumns,
      swipeEnabled,
      theme,
    ],
  );
  const describesMoves = props.describeMove != null;
  const moveLabel = useMemo(() => (describesMoves ? <MoveLabel /> : undefined), [describesMoves]);
  const dragCount = useCallback(
    (itemId: string) => {
      const selected = selection.store.get();
      return selected.size > 1 && selected.has(itemId) ? selected.size : 1;
    },
    [selection.store],
  );
  const value = useMemo<BoardContextValue<T>>(
    () => ({
      props,
      controller,
      adapter: gestureAdapter,
      theme,
      labels,
      metrics,
      boardWidth,
      boardHeight,
      fullHeight: bodyHeight,
      rtl,
      reducedMotion,
      scrollX,
      horizontalScrollGesture,
      page,
      lastColumn,
      scrollApi,
      sheetMode,
      swipeEnabled,
      autoScroll,
      canCollapseColumns,
      collapsedColumns,
      collapsedLanes,
      toggleColumn,
      toggleLane,
      openMoveSheet,
      loadingColumns,
      columnTotal,
      highlight,
      allColumns,
      allLanes,
      cardActionsFor,
      runCardAction,
      cardDrops: props.onCardDrop != null,
      canDropOnCard,
      dropOnCard,
      overview,
      detail: level,
      moveLabel,
      dragCount,
      setOverview,
      setDockInset,
      describeColumn,
      describeCard,
      planner,
      durationScale,
      selectable,
      selection: selection.store,
      setSelection,
      toggleSelected: selection.toggle,
      openHeaderSheet,
      headerSheet,
      reorderColumns,
      reorderLanes,
      moveColumn,
      moveLane,
      canCollapseLanes,
      externalMoves,
    }),
    [
      selectable,
      selection.store,
      setSelection,
      selection.toggle,
      openHeaderSheet,
      headerSheet,
      reorderColumns,
      reorderLanes,
      moveColumn,
      moveLane,
      canCollapseLanes,
      externalMoves,
      lastColumn,
      describeColumn,
      describeCard,
      planner,
      durationScale,
      cardActionsFor,
      allColumns,
      allLanes,
      overview,
      level,
      moveLabel,
      dragCount,
      runCardAction,
      canDropOnCard,
      dropOnCard,
      setOverview,
      autoScroll,
      boardHeight,
      bodyHeight,
      boardWidth,
      canCollapseColumns,
      collapsedColumns,
      collapsedLanes,
      columnTotal,
      controller,
      highlight,
      horizontalScrollGesture,
      labels,
      loadingColumns,
      metrics,
      openMoveSheet,
      page,
      props,
      reducedMotion,
      rtl,
      scrollX,
      sheetMode,
      swipeEnabled,
      theme,
      toggleColumn,
      toggleLane,
    ],
  );

  const { moveItem, moveItems, canDropTo, itemsById, model } = controller;
  const lockPresence = props.lockPresence !== false;
  const canDragItem = useCallback(
    (itemId: string) => {
      if (frozen) return false;
      // Someone else holds it: two people dragging one card would fight.
      if (lockPresence && presenceItems.has(itemId)) return false;
      const item = itemsById.get(itemId);
      return item != null && (canDrag ? canDrag(item) : true);
    },
    [canDrag, frozen, itemsById, lockPresence, presenceItems],
  );
  /** The cards a drag of this card carries: the selection when it is in it. */
  const riders = useCallback(
    (itemId: string) => {
      const selected = selectionGet();
      if (selected.length < 2 || !selected.includes(itemId)) return null;
      // Cards that cannot be dragged stay put; the dragged one always goes.
      return selected.filter((id) => id === itemId || canDragItem(id));
    },
    [canDragItem, selectionGet],
  );
  /** Drops the dragged card, with the rest of the selection gathered around it. */
  const drop = useCallback(
    (itemId: string, cellId: string, index: number) => {
      const many = riders(itemId);
      let at = index;
      if (fullController.holding) {
        // Held data drew the slot; the move is planned against live data, next to the same neighbours.
        fullController.resume();
        at = liveIndexFor(fullModel, fullController.liveModel(), itemId, new Set(many ?? [itemId]), cellId, index);
      }
      if (!many) return moveItem(itemId, cellId, at, 'drag');
      const moved = moveItems(many, cellId, at, 'drag', itemId) > 0;
      if (moved) selectionSet([]);
      return moved;
    },
    [fullController, fullModel, moveItem, moveItems, riders, selectionSet],
  );
  // Where the last drop landed, read when the drag ends: the board has not drawn the move yet by then.
  const landedColumn = useRef<string | null>(null);
  const onTransfer = useCallback(
    (event: TransferIntent) => {
      const taken = drop(event.itemId, event.toCellId, event.toIndex);
      if (taken) landedColumn.current = parseCellId(event.toCellId).columnKey;
      return taken;
    },
    [drop],
  );
  const onReorder = useCallback((event: ReorderIntent) => drop(event.itemId, event.cellId, event.toIndex), [drop]);
  // A batch drag may land where the dragged card already is, if the others still move.
  const canDropBatch = useCallback(
    (itemId: string, cellId: string) => {
      const many = riders(itemId);
      return many ? many.some((id) => canDropTo(id, cellId)) : canDropTo(itemId, cellId);
    },
    [canDropTo, riders],
  );
  // Set when live data changed the lifted card, so the drag's end can say why it stopped.
  const dragCancel = useRef<'changed' | 'removed' | null>(null);
  const { changedSinceHold } = fullController;
  const liveItems = props.items;
  const isDragValid = useCallback(
    (itemId: string, sourceCellId: string) => {
      // `liveItems`: checked again whenever new data arrives, held or not.
      void liveItems;
      const change = changedSinceHold(itemId);
      if (change) {
        dragCancel.current = change;
        return false;
      }
      return model.locations.get(itemId)?.cellId === sourceCellId;
    },
    [changedSinceHold, liveItems, model],
  );
  const onZoneDrop = useCallback(
    ({ itemId, sourceCellId, zoneId }: { itemId: string; sourceCellId: string; zoneId: string }) => {
      if (zoneId.startsWith(DOCK_COLUMN)) {
        const target = makeCellId(parseCellId(sourceCellId).laneKey, zoneId.slice(DOCK_COLUMN.length));
        return drop(itemId, target, 0);
      }
      if (zoneId.startsWith(DOCK_ACTION)) return runCardAction(itemId, zoneId.slice(DOCK_ACTION.length), 'dock');
      if (zoneId.startsWith(OUTSIDE_TARGET)) {
        const item = fullController.itemsById.get(itemId);
        if (item == null) return false;
        const itemIds = riders(itemId) ?? [itemId];
        const taken = dropOnOutsideTarget(dropScope, zoneId.slice(OUTSIDE_TARGET.length), {
          targetId: zoneId.slice(OUTSIDE_TARGET.length),
          itemId,
          item,
          itemIds: inBoardOrder(fullModel, itemIds),
          from: moveTargetOf(sourceCellId),
        });
        if (taken && itemIds.length > 1) selectionSet([]);
        return taken;
      }
      return false;
    },
    [drop, dropScope, fullController.itemsById, fullModel, riders, runCardAction, selectionSet],
  );
  // A card is lifted: read by the pinch on the UI thread.
  const dragging = useSharedValue(false);
  const dragFrom = useRef<MoveTarget | null>(null);
  const releaseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (releaseTimer.current) clearTimeout(releaseTimer.current);
    },
    [],
  );
  const { hold, release, resume } = fullController;
  const onDragStart = useCallback(
    ({ itemId, cellId }: { itemId: string; cellId: string }) => {
      hapticsFor(events.current.haptics)?.('lift');
      dragging.value = true;
      if (releaseTimer.current) {
        clearTimeout(releaseTimer.current);
        releaseTimer.current = null;
        release();
      }
      hold();
      dragCancel.current = null;
      const from = moveTargetOf(cellId);
      dragFrom.current = from;
      events.current.onLocalPresence?.({ itemId, from, to: from });
      if (lensAvailable) {
        returnColumn.current = parseCellId(cellId).columnKey;
        lensOpen.current = true;
        setLens(true);
      }
      const many = riders(itemId);
      events.current.onDragStart?.({
        itemId,
        from: moveTargetOf(cellId),
        itemIds: many ? inBoardOrder(fullModel, many) : [itemId],
      });
    },
    [dragging, fullModel, hold, lensAvailable, release, riders],
  );
  const onDragOver = useCallback(({ itemId, cellId, index }: { itemId: string; cellId: string; index: number }) => {
    const target = moveTargetOf(cellId);
    events.current.onDragOver?.({ itemId, target, index });
    events.current.onLocalPresence?.({ itemId, from: dragFrom.current, to: target });
  }, []);
  const dropMs = theme.dropDuration;
  const onDragEnd = useCallback(
    (event: { itemId: string; cancelled: boolean }) => {
      dragging.value = false;
      const reason = dragCancel.current;
      dragCancel.current = null;
      dragFrom.current = null;
      events.current.onDragEnd?.(reason ? { ...event, reason } : event);
      events.current.onLocalPresence?.({ itemId: null, from: null, to: null });
      if (reason) announce(labels.cardChangedWhileDragging({ item: fullController.itemLabel(event.itemId), reason }));
      // The held data lands once the card has settled, so its changes can fly instead of jumping under the drop.
      resume();
      if (releaseTimer.current) clearTimeout(releaseTimer.current);
      releaseTimer.current = setTimeout(() => {
        releaseTimer.current = null;
        release();
      }, dropMs + 80);
      // Out of the lens, onto the column the card is in now: where it landed, or home.
      const landed = landedColumn.current;
      landedColumn.current = null;
      if (!lensOpen.current) return;
      lensOpen.current = false;
      setRevealColumn(!event.cancelled && landed ? landed : returnColumn.current);
      setLens(false);
    },
    [announce, dragging, dropMs, fullController, labels, release, resume],
  );
  // Gathering adds a tapped card, and the lifted one, to the selection: the drop then carries them all.
  const onGather = useCallback(
    (itemId: string, liftedId: string) => {
      if (!canDragItem(itemId)) return false;
      const selected = selectionGet();
      if (selected.includes(itemId)) return false;
      selectionSet([...new Set([...selected, liftedId, itemId])]);
      return true;
    },
    [canDragItem, selectionGet, selectionSet],
  );
  const renderFlat = useCallback((itemId: string) => <FlightCard itemId={itemId} />, []);
  const onLongPressMenu = useCallback(({ itemId }: { itemId: string }) => openMoveSheet(itemId), [openMoveSheet]);
  const renderHover = useCallback((itemId: string) => <HoverCard itemId={itemId} />, []);
  // The board as last drawn. The engine's flights compare against it before this render's effects update it.
  const drawnModel = useRef(drawnBase);
  const latestModel = useRef(drawnBase);
  latestModel.current = drawnBase;
  useLayoutEffect(() => {
    drawnModel.current = drawnBase;
  }, [drawnBase]);
  const flightMs = Math.round(FLIGHT_MS * durationScale);
  // Catching up from a snapshot flies cards whether or not `animateChanges` is on: that is its point.
  // So do the timeline's steps, and the way back to live.
  const wasScrubbing = useRef(scrubbing);
  const timeTravel = scrubbing || wasScrubbing.current;
  useEffect(() => {
    wasScrubbing.current = scrubbing;
  }, [scrubbing]);
  const flying = (props.animateChanges === true || catchUp !== 'done' || timeTravel) && !reducedMotion;
  const flights = useMemo(
    () =>
      flying
        ? {
            renderCard: (itemId: string) => <FlightCard itemId={itemId} />,
            locate: (itemId: string) => latestModel.current.locations.get(itemId)?.cellId ?? null,
            changes: () => changedBetween(drawnModel.current, latestModel.current),
            durationMs: flightMs,
          }
        : null,
    [flightMs, flying],
  );
  const colors = useMemo(() => ({ outline: theme.accent, reject: theme.reject }), [theme]);
  const lift = useMemo(
    () => ({
      scale: theme.liftScale,
      tilt: theme.liftTilt,
      shadowOpacity: theme.liftShadowOpacity,
      dropMs: theme.dropDuration,
      overshoot: motionPresets[motion].overshoot,
    }),
    [motion, theme.dropDuration, theme.liftScale, theme.liftShadowOpacity, theme.liftTilt],
  );

  // A pinch out steps one level further from your cards, a strong one two; a pinch in steps back.
  const pinchEnd = useCallback(
    (scale: number) => {
      const { levels, level: now } = live.current;
      const steps =
        scale < PINCH_IN * PINCH_IN
          ? 2
          : scale < PINCH_IN
            ? 1
            : scale > PINCH_OUT * PINCH_OUT
              ? -2
              : scale > PINCH_OUT
                ? -1
                : 0;
      if (steps === 0) return;
      const index = Math.max(0, Math.min(levels.length - 1, levels.indexOf(now) + steps));
      const next = levels[index];
      if (next) setZoomLevel(next);
    },
    [setZoomLevel],
  );
  // While the fingers move, the board follows them a little, so the pinch answers before the level changes.
  const pinchScale = useSharedValue(1);
  const pinch = useMemo(
    () =>
      Gesture.Pinch()
        .enabled(zoomAvailable)
        .onTouchesDown((_event, manager) => {
          'worklet';
          // A second finger during a drag gathers a card (`moveModes.gather`); it never starts a pinch.
          if (dragging.value) manager.fail();
        })
        .onUpdate((event) => {
          'worklet';
          if (!reducedMotion) pinchScale.value = Math.min(PINCH_FOLLOW_MAX, Math.max(PINCH_FOLLOW_MIN, event.scale));
        })
        .onEnd((event) => {
          'worklet';
          scheduleOnRN(pinchEnd, event.scale);
        })
        .onFinalize(() => {
          'worklet';
          pinchScale.value = withTiming(1, { duration: 180 });
        }),
    [dragging, pinchEnd, pinchScale, reducedMotion, zoomAvailable],
  );
  const pinchStyle = useAnimatedStyle(() => ({ transform: [{ scale: pinchScale.value }] }));

  // Hold the old arrangement for a moment, play the flights, then say what changed.
  const [caughtUp, setCaughtUp] = useState<string | null>(null);
  useEffect(() => {
    if (catchUp === 'done' || boardWidth <= 0 || bodyHeight <= 0) return;
    const next = catchUp === 'before' && !reducedMotion ? 'playing' : 'done';
    const wait = catchUp === 'before' ? (reducedMotion ? 0 : CATCH_UP_HOLD_MS) : flightMs + 120;
    const timer = setTimeout(() => setCatchUp(next), wait);
    return () => clearTimeout(timer);
  }, [bodyHeight, boardWidth, catchUp, flightMs, reducedMotion]);
  const announcedCatchUp = useRef(false);
  useEffect(() => {
    if (catchUp !== 'done' || !initialSnapshot || announcedCatchUp.current) return;
    announcedCatchUp.current = true;
    const text = labels.caughtUp(catchUpCounts(initialSnapshot, liveModel.current));
    if (!text) return;
    announce(text);
    setCaughtUp(text);
    const timer = setTimeout(() => setCaughtUp(null), CATCH_UP_CHIP_MS);
    return () => clearTimeout(timer);
  }, [announce, catchUp, initialSnapshot, labels]);

  // The ageing chart is the dot level drawn by age.
  const ageing =
    level === 'dot' && typeof props.zoom === 'object' && props.zoom.dotLayout === 'age' && props.getItemAge != null;
  const handleOnly = props.moveModes?.drag === 'handle';
  const longPressSheet = sheetMode !== false && !handleOnly && props.moveModes?.longPressSheet !== false;
  const dockOn = props.dock !== false;
  const DragProvider = gestureAdapter.Provider;
  const DragBoard = gestureAdapter.Board;
  const ready = boardWidth > 0 && bodyHeight > 0;

  return (
    <GestureHandlerRootView
      style={[styles.root, { backgroundColor: theme.background }, props.style]}
      onLayout={onRootLayout}
      testID={props.testID}
    >
      <ThemeContext value={theme}>
        <BoardContext value={value as BoardContextValue}>
          <CardContext value={cardValue as CardContextValue}>
            <DragProvider>
              {ready && pagerIndicator === 'tabs' ? (
                <View style={styles.tabs}>
                  <PagerTabs />
                </View>
              ) : null}
              {ready && overview ? <OverviewBar /> : null}
              <GestureDetector gesture={pinch}>
                <View ref={bodyRef} style={styles.fill} onLayout={onBodyLayout} collapsable={false}>
                  {ready ? (
                    <Animated.View style={[styles.fill, pinchStyle]}>
                      <DragBoard
                        onTransfer={onTransfer}
                        onReorder={onReorder}
                        onDragStart={onDragStart}
                        onDragOver={onDragOver}
                        onDragEnd={onDragEnd}
                        isDragValid={isDragValid}
                        revision={model}
                        flights={flights}
                        onGather={props.moveModes?.gather && selectable ? onGather : undefined}
                        renderFlat={renderFlat}
                        throwToTarget={props.moveModes?.throw === true}
                        onLongPressMenu={longPressSheet ? onLongPressMenu : undefined}
                        onZoneDrop={onZoneDrop}
                        onCardDrop={props.onCardDrop ? onCardDrop : undefined}
                        canDropOnCard={canDropOnCard}
                        cardDropDelayMs={props.cardDropDelayMs}
                        canDrag={canDragItem}
                        canDrop={canDropBatch}
                        enabled={!frozen && props.moveModes?.drag !== false && catchUp === 'done'}
                        longPressDelay={props.longPressDelay ?? 200}
                        handleOnly={handleOnly}
                        reducedMotion={reducedMotion}
                        compact={boardWidth < 600}
                        renderHover={renderHover}
                        colors={colors}
                        lift={lift}
                        horizontalOffset={mode === 'stacked' || mode === 'matrix' ? undefined : scrollX}
                      >
                        <LayoutFade layoutKey={`${mode}:${level}`}>
                          {mode === 'stacked' ? (
                            <StackedLayout />
                          ) : mode === 'matrix' ? (
                            <MatrixLayout />
                          ) : hasLanes ? (
                            <SwimlaneLayout />
                          ) : ageing ? (
                            <AgeingLayout />
                          ) : (
                            // The overview is another board with other metrics: remount, so nothing carries over.
                            <ColumnsLayout key={level} />
                          )}
                        </LayoutFade>
                        {dockOn ? <DropDock /> : null}
                        <OutsideTargets root={bodyRef} />
                        {planner && !zoomedOut ? <PlannerToday /> : null}
                      </DragBoard>
                    </Animated.View>
                  ) : null}
                </View>
              </GestureDetector>
              {ready && pagerIndicator === 'dots' ? (
                <View style={styles.dots}>
                  <PagerDots />
                </View>
              ) : null}
              {props.undo && ready ? <UndoBanner /> : null}
              {caughtUp ? <CatchUpChip text={caughtUp} /> : null}
              {selectable && ready ? <SelectionBar /> : null}
              {ready && !overview && proposals && proposals.length > 0 ? (
                <ProposalBar count={proposals.length} onDecideAll={decideAll} />
              ) : null}
            </DragProvider>
            <MoveSheet itemIds={sheetItems} onClose={closeMoveSheet} />
            <HeaderSheet target={headerSheetTarget} onClose={closeHeaderSheet} />
            <GateSheet gate={fullController.gate} />
          </CardContext>
        </BoardContext>
      </ThemeContext>
    </GestureHandlerRootView>
  );
}

/**
 * A new layout fades in over a few frames instead of snapping, when the
 * board changes layout or opens the overview. Not on the first render.
 */
function LayoutFade({ layoutKey, children }: { layoutKey: string; children: ReactNode }) {
  const { reducedMotion, durationScale } = useBoard();
  // Only layouts that replace an earlier one fade in; the first render shows at once.
  const shown = useRef(false);
  useEffect(() => {
    shown.current = true;
  }, []);
  const animate = !reducedMotion && shown.current;
  return (
    <Animated.View
      key={layoutKey}
      entering={animate ? FadeIn.duration(Math.round(220 * durationScale)) : undefined}
      style={styles.fill}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  fill: { flex: 1 },
  tabs: { paddingBottom: 4 },
  dots: { justifyContent: 'center' },
});
