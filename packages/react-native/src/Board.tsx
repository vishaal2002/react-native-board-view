import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { I18nManager, StyleSheet, View, useColorScheme, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSharedValue } from 'react-native-reanimated';
import { BoardContext, createValueStore, type BoardContextValue, type ScrollApi } from './context';
import { gestureAdapter } from './engine/DragEngine';
import type { ReorderIntent, TransferIntent } from './engine/types';
import { HoverCard } from './layout/BoardCard';
import { ColumnsLayout } from './layout/ColumnsLayout';
import { columnMetrics, resolveLayout, visualSlot } from './layout/metrics';
import { PagerDots, PagerTabs } from './layout/Pager';
import { StackedLayout } from './layout/StackedLayout';
import { SwimlaneLayout } from './layout/SwimlaneLayout';
import { MoveSheet } from './sheet/MoveSheet';
import { defaultLabels, resolveTheme } from './theme';
import { moveTargetOf, useBoardController } from './useBoardController';
import { useReducedMotion } from './useReducedMotion';
import type { BoardLabels, BoardProps } from './types';

const NO_IDS: readonly string[] = [];
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
  const theme = useMemo(() => resolveTheme(dark, props.density, props.theme), [dark, props.density, props.theme]);
  const labels = useMemo<BoardLabels>(() => ({ ...defaultLabels, ...props.labels }), [props.labels]);
  const controller = useBoardController(props, labels);
  const reducedMotion = useReducedMotion();
  const rtl = I18nManager.isRTL;

  const [root, setRoot] = useState({ width: 0, height: 0 });
  const onRootLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setRoot((previous) => (previous.width === width && previous.height === height ? previous : { width, height }));
  }, []);

  const mode = resolveLayout(props.layout ?? 'auto', root.width, props.autoBreakpoint);
  const pagerIndicator = mode === 'paged' ? (props.pagerIndicator ?? 'tabs') : 'none';
  // Measured, not assumed: pager chrome grows with the user's text size.
  const [bodyHeight, setBodyHeight] = useState(0);
  const onBodyLayout = useCallback((event: LayoutChangeEvent) => {
    setBodyHeight(event.nativeEvent.layout.height);
  }, []);
  const boardWidth = root.width;
  const boardHeight = bodyHeight;

  const [collapsedLanes, toggleLane] = useCollapsedList(props.collapsedLanes, props.onCollapsedLanesChange);
  const [collapsedColumns, toggleColumn] = useCollapsedList(props.collapsedColumns, props.onCollapsedColumnsChange);
  const canCollapseColumns = mode !== 'paged' && (props.collapsibleColumns ?? mode === 'stacked');

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
  const { moveTo } = controller;
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
    }),
    [closeMoveSheet, highlight, moveTo, openMoveSheet],
  );

  const loadingColumns = useMemo(() => new Set(props.loadingColumns ?? NO_IDS), [props.loadingColumns]);
  const columnTotals = props.columnTotals;
  const columnTotal = useCallback(
    (columnId: string, count: number) => columnTotals?.[columnId] ?? count,
    [columnTotals],
  );

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
    }),
    [
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
  const events = useRef(props);
  events.current = props;
  const onDragStart = useCallback(({ itemId, cellId }: { itemId: string; cellId: string }) => {
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
    }),
    [theme.dropDuration, theme.liftScale, theme.liftShadowOpacity, theme.liftTilt],
  );

  const handleOnly = props.moveModes?.drag === 'handle';
  const DragProvider = gestureAdapter.Provider;
  const DragBoard = gestureAdapter.Board;
  const ready = boardWidth > 0 && boardHeight > 0;

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
          <View style={styles.fill} onLayout={onBodyLayout}>
            {ready ? (
              <DragBoard
                onTransfer={onTransfer}
                onReorder={onReorder}
                onDragStart={onDragStart}
                onDragOver={onDragOver}
                onDragEnd={onDragEnd}
                isDragValid={isDragValid}
                revision={model}
                onLongPressMenu={sheetMode !== false && !handleOnly ? onLongPressMenu : undefined}
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
                horizontalOffset={mode === 'stacked' ? undefined : scrollX}
              >
                {mode === 'stacked' ? <StackedLayout /> : props.groupBy.lanes ? <SwimlaneLayout /> : <ColumnsLayout />}
              </DragBoard>
            ) : null}
          </View>
          {ready && pagerIndicator === 'dots' ? (
            <View style={styles.dots}>
              <PagerDots />
            </View>
          ) : null}
        </DragProvider>
        <MoveSheet itemId={sheetItem} onClose={closeMoveSheet} />
      </BoardContext>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  fill: { flex: 1 },
  tabs: { paddingBottom: 4 },
  dots: { justifyContent: 'center' },
});
