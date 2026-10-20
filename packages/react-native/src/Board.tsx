import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AccessibilityInfo, I18nManager, StyleSheet, View, useColorScheme, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { FadeIn, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { NO_VALUE_ID, cellId as makeCellId, parseCellId, type BoardModel, type GroupValue } from 'board-view-core';
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
import { HoverCard } from './layout/BoardCard';
import { MatrixLayout, matrixFits } from './layout/MatrixLayout';
import { ColumnsLayout } from './layout/ColumnsLayout';
import { DOCK_ACTION, DOCK_COLUMN, DropDock } from './layout/DropDock';
import { columnMetrics, resolveLayout, visualSlot, type ColumnMetrics } from './layout/metrics';
import { OverviewBar, overviewTheme } from './layout/Overview';
import { PagerDots, PagerTabs } from './layout/Pager';
import { PlannerToday } from './layout/PlannerToday';
import { StackedLayout } from './layout/StackedLayout';
import { SwimlaneLayout } from './layout/SwimlaneLayout';
import { UndoBanner } from './layout/UndoBanner';
import { visibleModel } from './layout/visible';
import { HeaderSheet } from './sheet/HeaderSheet';
import { MoveSheet } from './sheet/MoveSheet';
import { SelectionBar } from './layout/SelectionBar';
import { externalMovesBetween } from './layout/externalMoves';
import { hapticsFor } from './haptics';
import { columnStats, formatCompact, limitState, plannerDay, sumValues } from './insights';
import { defaultLabels, motionPresets, resolveTheme } from './theme';
import { moveTargetOf, useBoardController } from './useBoardController';
import { inBoardOrder, rulesAllow } from './session';
import { useAccessibilityServices, useReducedMotion } from './useReducedMotion';
import type { BoardLabels, BoardProps, CardAction, CardActionEvent } from './types';

const NO_IDS: readonly string[] = [];
const EMPTY_SET: ReadonlySet<string> = new Set();
const NO_ACTIONS: readonly CardAction[] = [];
/** A pinch that ends below this scale opens the overview; above the inverse it closes it. */
const PINCH_IN = 0.8;
const PINCH_OUT = 1.25;
/** How long a `scrollToItem` highlight stays, long enough for the scroll to land and the flash to fade. */
const HIGHLIGHT_MS = 1800;

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
  const shownModel = useMemo(
    () => visibleModel(fullModel, props.hideEmptyColumns === true, hasLanes && props.hideEmptyLanes === true),
    [fullModel, hasLanes, props.hideEmptyColumns, props.hideEmptyLanes],
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
  const overviewAvailable = props.overview === true && !hasLanes && baseMode !== 'stacked';
  const [overviewOwn, setOverviewOwn] = useState(false);
  const overview = overviewAvailable && (props.overviewOpen ?? overviewOwn);
  // The overview is the fit layout with small cards, so every column (or most) fits on screen.
  const mode = overview ? 'fit' : baseMode;
  const pagerIndicator = mode === 'paged' ? (props.pagerIndicator ?? 'tabs') : 'none';
  // Measured, not assumed: pager chrome grows with the user's text size.
  const [bodyHeight, setBodyHeight] = useState(0);
  const onBodyLayout = useCallback((event: LayoutChangeEvent) => {
    setBodyHeight(event.nativeEvent.layout.height);
  }, []);
  const boardWidth = root.width;
  // While the drop dock shows, the lists end above it, so it never covers a card.
  const [dockInset, setDockInset] = useState(0);
  const boardHeight = Math.max(0, bodyHeight - dockInset);

  const theme = useMemo(() => (overview ? overviewTheme(baseTheme) : baseTheme), [baseTheme, overview]);

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
  const sheetMode = readOnly ? false : (props.moveModes?.sheet ?? 'auto');
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
  const live = useRef({
    overviewAvailable,
    overview,
    onOverviewChange: props.onOverviewChange,
    controlled: props.overviewOpen !== undefined,
  });
  live.current = {
    overviewAvailable,
    overview,
    onOverviewChange: props.onOverviewChange,
    controlled: props.overviewOpen !== undefined,
  };
  const setOverview = useCallback((open: boolean, columnId?: string) => {
    const current = live.current;
    if (!current.overviewAvailable || current.overview === open) return;
    if (!open) setRevealColumn(columnId ?? returnColumn.current);
    if (!current.controlled) setOverviewOwn(open);
    current.onOverviewChange?.(open);
  }, []);
  // Remember where the board was whenever the overview opens, controlled or not.
  const wasOverview = useRef(overview);
  if (overview && !wasOverview.current) {
    const columnsNow = controller.model.columns;
    returnColumn.current = lastColumn.current ?? columnsNow[visualSlot(page.get(), columnsNow.length, rtl)]?.id ?? null;
  }
  if (!overview && wasOverview.current && revealColumn === null && returnColumn.current) {
    // Closed by the app through `overviewOpen`: go back to where the board was.
    setRevealColumn(returnColumn.current);
  }
  wasOverview.current = overview;
  useEffect(() => {
    if (overview || revealColumn === null) return;
    const frame = requestAnimationFrame(() => {
      scrollApi.current?.toColumn(revealColumn, false);
      setRevealColumn(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [overview, revealColumn]);

  const { moveTo, moveManyTo, undo, canUndo } = controller;
  const setSelection = selection.set;
  const getSelection = selection.get;
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
      setSelection,
      getSelection,
    }),
    [
      canUndo,
      closeMoveSheet,
      getSelection,
      highlight,
      moveManyTo,
      moveTo,
      openMoveSheet,
      setOverview,
      setSelection,
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
      };
    },
    [columnLimits, formatValue, getItemValue, planner, stats],
  );
  const staleAfter = props.staleAfterDays ?? 14;
  const describeCard = useCallback(
    (item: unknown) => {
      const dimmed = spotlight ? !(spotlight as (entry: unknown) => boolean)(item) : false;
      const raw = getItemAge ? (getItemAge as (entry: unknown) => number | null | undefined)(item) : null;
      const age = typeof raw === 'number' && Number.isFinite(raw) ? Math.max(0, raw) : null;
      return { dimmed, age, stale: age != null && age >= staleAfter };
    },
    [getItemAge, spotlight, staleAfter],
  );
  const durationScale = motionPresets[motion].durationScale;

  const swipeEnabled = !readOnly && props.moveModes?.swipe === 'auto' && (mode === 'multi' || mode === 'fit');
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
      focusRequest,
      scrollApi,
    }),
    [
      accessibilityActions,
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
      overview,
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
      runCardAction,
      setOverview,
      autoScroll,
      boardHeight,
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
  const canDragItem = useCallback(
    (itemId: string) => {
      if (readOnly) return false;
      const item = itemsById.get(itemId);
      return item != null && (canDrag ? canDrag(item) : true);
    },
    [canDrag, itemsById, readOnly],
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
      if (!many) return moveItem(itemId, cellId, index, 'drag');
      const moved = moveItems(many, cellId, index, 'drag', itemId) > 0;
      if (moved) selectionSet([]);
      return moved;
    },
    [moveItem, moveItems, riders, selectionSet],
  );
  const onTransfer = useCallback((event: TransferIntent) => drop(event.itemId, event.toCellId, event.toIndex), [drop]);
  const onReorder = useCallback((event: ReorderIntent) => drop(event.itemId, event.cellId, event.toIndex), [drop]);
  // A batch drag may land where the dragged card already is, if the others still move.
  const canDropBatch = useCallback(
    (itemId: string, cellId: string) => {
      const many = riders(itemId);
      return many ? many.some((id) => canDropTo(id, cellId)) : canDropTo(itemId, cellId);
    },
    [canDropTo, riders],
  );
  const isDragValid = useCallback(
    (itemId: string, sourceCellId: string) => model.locations.get(itemId)?.cellId === sourceCellId,
    [model],
  );
  const onZoneDrop = useCallback(
    ({ itemId, sourceCellId, zoneId }: { itemId: string; sourceCellId: string; zoneId: string }) => {
      if (zoneId.startsWith(DOCK_COLUMN)) {
        const target = makeCellId(parseCellId(sourceCellId).laneKey, zoneId.slice(DOCK_COLUMN.length));
        return drop(itemId, target, 0);
      }
      if (zoneId.startsWith(DOCK_ACTION)) return runCardAction(itemId, zoneId.slice(DOCK_ACTION.length), 'dock');
      return false;
    },
    [drop, runCardAction],
  );
  const onDragStart = useCallback(
    ({ itemId, cellId }: { itemId: string; cellId: string }) => {
      hapticsFor(events.current.haptics)?.('lift');
      const many = riders(itemId);
      events.current.onDragStart?.({
        itemId,
        from: moveTargetOf(cellId),
        itemIds: many ? inBoardOrder(fullModel, many) : [itemId],
      });
    },
    [fullModel, riders],
  );
  const onDragOver = useCallback(({ itemId, cellId, index }: { itemId: string; cellId: string; index: number }) => {
    events.current.onDragOver?.({ itemId, target: moveTargetOf(cellId), index });
  }, []);
  const onDragEnd = useCallback((event: { itemId: string; cancelled: boolean }) => {
    events.current.onDragEnd?.(event);
  }, []);
  const onLongPressMenu = useCallback(({ itemId }: { itemId: string }) => openMoveSheet(itemId), [openMoveSheet]);
  const renderHover = useCallback((itemId: string) => <HoverCard itemId={itemId} />, []);
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

  const pinch = useMemo(
    () =>
      Gesture.Pinch()
        .enabled(overviewAvailable)
        .onEnd((event) => {
          'worklet';
          if (event.scale < PINCH_IN) scheduleOnRN(setOverview, true);
          else if (event.scale > PINCH_OUT) scheduleOnRN(setOverview, false);
        }),
    [overviewAvailable, setOverview],
  );

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
                <View style={styles.fill} onLayout={onBodyLayout} collapsable={false}>
                  {ready ? (
                    <DragBoard
                      onTransfer={onTransfer}
                      onReorder={onReorder}
                      onDragStart={onDragStart}
                      onDragOver={onDragOver}
                      onDragEnd={onDragEnd}
                      isDragValid={isDragValid}
                      revision={model}
                      onLongPressMenu={longPressSheet ? onLongPressMenu : undefined}
                      onZoneDrop={dockOn ? onZoneDrop : undefined}
                      canDrag={canDragItem}
                      canDrop={canDropBatch}
                      enabled={!readOnly && props.moveModes?.drag !== false}
                      longPressDelay={props.longPressDelay ?? 200}
                      handleOnly={handleOnly}
                      reducedMotion={reducedMotion}
                      compact={boardWidth < 600}
                      renderHover={renderHover}
                      colors={colors}
                      lift={lift}
                      horizontalOffset={mode === 'stacked' || mode === 'matrix' ? undefined : scrollX}
                    >
                      <LayoutFade layoutKey={`${mode}:${overview}`}>
                        {mode === 'stacked' ? (
                          <StackedLayout />
                        ) : mode === 'matrix' ? (
                          <MatrixLayout />
                        ) : hasLanes ? (
                          <SwimlaneLayout />
                        ) : (
                          // The overview is another board with other metrics: remount, so nothing carries over.
                          <ColumnsLayout key={overview ? 'overview' : 'board'} />
                        )}
                      </LayoutFade>
                      {dockOn ? <DropDock /> : null}
                      {planner && !overview ? <PlannerToday /> : null}
                    </DragBoard>
                  ) : null}
                </View>
              </GestureDetector>
              {ready && pagerIndicator === 'dots' ? (
                <View style={styles.dots}>
                  <PagerDots />
                </View>
              ) : null}
              {props.undo && ready ? <UndoBanner /> : null}
              {selectable && ready ? <SelectionBar /> : null}
            </DragProvider>
            <MoveSheet itemIds={sheetItems} onClose={closeMoveSheet} />
            <HeaderSheet target={headerSheetTarget} onClose={closeHeaderSheet} />
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
