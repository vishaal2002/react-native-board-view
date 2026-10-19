import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode } from 'react';
import { I18nManager, StyleSheet, View, useColorScheme, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { FadeIn, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { cellId as makeCellId, parseCellId } from 'board-view-core';
import { BoardContext, createValueStore, useBoard, type BoardContextValue, type ScrollApi } from './context';
import { gestureAdapter } from './engine/DragEngine';
import type { ReorderIntent, TransferIntent } from './engine/types';
import { HoverCard } from './layout/BoardCard';
import { MatrixLayout } from './layout/MatrixLayout';
import { ColumnsLayout } from './layout/ColumnsLayout';
import { DOCK_ACTION, DOCK_COLUMN, DropDock } from './layout/DropDock';
import { columnMetrics, resolveLayout, visualSlot } from './layout/metrics';
import { OverviewBar, overviewTheme } from './layout/Overview';
import { PagerDots, PagerTabs } from './layout/Pager';
import { PlannerToday } from './layout/PlannerToday';
import { StackedLayout } from './layout/StackedLayout';
import { SwimlaneLayout } from './layout/SwimlaneLayout';
import { UndoBanner } from './layout/UndoBanner';
import { visibleModel } from './layout/visible';
import { MoveSheet } from './sheet/MoveSheet';
import { hapticsFor } from './haptics';
import { columnStats, formatCompact, limitState, plannerDay, sumValues } from './insights';
import { defaultLabels, motionPresets, resolveTheme } from './theme';
import { moveTargetOf, useBoardController } from './useBoardController';
import { useReducedMotion } from './useReducedMotion';
import type { BoardLabels, BoardProps, CardAction, CardActionEvent } from './types';

const NO_IDS: readonly string[] = [];
const NO_ACTIONS: readonly CardAction[] = [];
/** A pinch that ends below this scale opens the overview; above the inverse it closes it. */
const PINCH_IN = 0.8;
const PINCH_OUT = 1.25;
/** How long a `scrollToItem` highlight stays, long enough for the scroll to land and the flash to fade. */
const HIGHLIGHT_MS = 1800;

function toggleIn(list: readonly string[], id: string): string[] {
  return list.includes(id) ? list.filter((entry) => entry !== id) : [...list, id];
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
  const rtl = I18nManager.isRTL;

  const [root, setRoot] = useState({ width: 0, height: 0 });
  const onRootLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setRoot((previous) => (previous.width === width && previous.height === height ? previous : { width, height }));
  }, []);

  const requested = props.layout ?? 'auto';
  // The planner is the multi layout with day headers, a Today button and sideways loading.
  const planner = requested === 'planner';
  // A matrix needs lanes for its rows; without them it is a fit board.
  const baseMode = resolveLayout(
    requested === 'matrix' && !hasLanes ? 'fit' : planner ? 'multi' : requested,
    root.width,
    props.autoBreakpoint,
  );
  const overviewAvailable = props.overview === true && !hasLanes && baseMode !== 'stacked';
  const [overviewOwn, setOverviewOwn] = useState(false);
  const overview = overviewAvailable && overviewOwn;
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

  const [collapsedLanes, toggleLane] = useCollapsedList(props.collapsedLanes, props.onCollapsedLanesChange);
  const [collapsedColumns, toggleColumn] = useCollapsedList(props.collapsedColumns, props.onCollapsedColumnsChange);
  const canCollapseColumns = mode !== 'paged' && mode !== 'matrix' && (props.collapsibleColumns ?? mode === 'stacked');

  const columns = controller.model.columns;
  const collapsedKey = columns
    .map((_, slot) => {
      const column = columns[visualSlot(slot, columns.length, rtl)];
      return canCollapseColumns && column != null && collapsedColumns.has(column.id) ? '1' : '0';
    })
    .join('');
  const metrics = useMemo(
    () =>
      columnMetrics(
        mode,
        boardWidth,
        [...collapsedKey].map((flag) => flag === '1'),
        theme,
      ),
    [boardWidth, collapsedKey, mode, theme],
  );

  const scrollX = useSharedValue(0);
  const horizontalScrollGesture = useMemo(() => Gesture.Native(), []);
  const [page] = useState(() => createValueStore(0));
  const scrollApi = useRef<ScrollApi | null>(null);

  const readOnly = props.readOnly === true;
  const sheetMode = readOnly ? false : (props.moveModes?.sheet ?? 'auto');
  const [sheetItem, setSheetItem] = useState<string | null>(null);
  if (readOnly && sheetItem !== null) setSheetItem(null);
  const openMoveSheet = useCallback(
    (itemId: string) => {
      if (sheetMode !== false) setSheetItem(itemId);
    },
    [sheetMode],
  );
  const closeMoveSheet = useCallback(() => setSheetItem(null), []);

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
  const live = useRef({ overviewAvailable, overview, onOverviewChange: props.onOverviewChange });
  live.current = { overviewAvailable, overview, onOverviewChange: props.onOverviewChange };
  const setOverview = useCallback(
    (open: boolean, columnId?: string) => {
      const current = live.current;
      if (!current.overviewAvailable || current.overview === open) return;
      if (open) {
        const columnsNow = controller.model.columns;
        returnColumn.current = columnsNow[visualSlot(page.get(), columnsNow.length, rtl)]?.id ?? null;
      } else {
        setRevealColumn(columnId ?? returnColumn.current);
      }
      setOverviewOwn(open);
      current.onOverviewChange?.(open);
    },
    [controller.model.columns, page, rtl],
  );
  useEffect(() => {
    if (overview || revealColumn === null) return;
    const frame = requestAnimationFrame(() => {
      scrollApi.current?.toColumn(revealColumn, false);
      setRevealColumn(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [overview, revealColumn]);

  const { moveTo, undo, canUndo } = controller;
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
      openMoveSheet,
      closeMoveSheet,
      undo,
      canUndo,
      setOverview,
    }),
    [canUndo, closeMoveSheet, highlight, moveTo, openMoveSheet, setOverview, undo],
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
    (itemId: string, key: string, source: CardActionEvent<unknown>['source']) => {
      const item = fullController.itemsById.get(itemId);
      const location = fullController.model.locations.get(itemId);
      if (item == null || !location || !cardActionsFor(itemId).some((action) => action.key === key)) return false;
      events.current.onCardAction?.({ action: key, itemId, item, from: moveTargetOf(location.cellId), source });
      return true;
    },
    [cardActionsFor, fullController.itemsById, fullController.model.locations],
  );

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
        limit,
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
      allColumns: fullModel.columns,
      allLanes: fullModel.lanes,
      cardActionsFor,
      runCardAction,
      overview,
      setOverview,
      setDockInset,
      describeColumn,
      describeCard,
      planner,
      durationScale,
    }),
    [
      describeColumn,
      describeCard,
      planner,
      durationScale,
      cardActionsFor,
      fullModel.columns,
      fullModel.lanes,
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

  const { moveItem, canDropTo, itemsById, model } = controller;
  const canDrag = props.canDrag;
  const onTransfer = useCallback(
    (event: TransferIntent) => moveItem(event.itemId, event.toCellId, event.toIndex, 'drag'),
    [moveItem],
  );
  const onReorder = useCallback(
    (event: ReorderIntent) => moveItem(event.itemId, event.cellId, event.toIndex, 'drag'),
    [moveItem],
  );
  const isDragValid = useCallback(
    (itemId: string, sourceCellId: string) => model.locations.get(itemId)?.cellId === sourceCellId,
    [model],
  );
  const onZoneDrop = useCallback(
    ({ itemId, sourceCellId, zoneId }: { itemId: string; sourceCellId: string; zoneId: string }) => {
      if (zoneId.startsWith(DOCK_COLUMN)) {
        const target = makeCellId(parseCellId(sourceCellId).laneKey, zoneId.slice(DOCK_COLUMN.length));
        return moveItem(itemId, target, 0, 'drag');
      }
      if (zoneId.startsWith(DOCK_ACTION)) return runCardAction(itemId, zoneId.slice(DOCK_ACTION.length), 'dock');
      return false;
    },
    [moveItem, runCardAction],
  );
  const onDragStart = useCallback(({ itemId, cellId }: { itemId: string; cellId: string }) => {
    hapticsFor(events.current.haptics)?.('lift');
    events.current.onDragStart?.({ itemId, from: moveTargetOf(cellId) });
  }, []);
  const onDragOver = useCallback(({ itemId, cellId, index }: { itemId: string; cellId: string; index: number }) => {
    events.current.onDragOver?.({ itemId, target: moveTargetOf(cellId), index });
  }, []);
  const onDragEnd = useCallback((event: { itemId: string; cancelled: boolean }) => {
    events.current.onDragEnd?.(event);
  }, []);
  const canDragItem = useCallback(
    (itemId: string) => {
      if (readOnly) return false;
      const item = itemsById.get(itemId);
      return item != null && (canDrag ? canDrag(item) : true);
    },
    [canDrag, itemsById, readOnly],
  );
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
      <BoardContext value={value as BoardContextValue}>
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
                  canDrop={canDropTo}
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
        </DragProvider>
        <MoveSheet itemId={sheetItem} onClose={closeMoveSheet} />
      </BoardContext>
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
