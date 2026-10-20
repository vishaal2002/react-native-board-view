import { FlashList, type FlashListRef, type ListRenderItemInfo } from '@shopify/flash-list';
import { createContext, memo, use, useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { cellId as makeCellId, type BoardCell, type GroupValue } from 'board-view-core';
import { laneDistribution } from '../insights';
import { useBoard, useStoreValue, type BoardContextValue } from '../context';
import { rawInsertionIndex, slotIndexAt, type Rect, type Slot, type SlotSource } from '../engine/geometry';
import { PLACEHOLDER_ID, type CellGeometry, type ScrollerHandle } from '../engine/types';
import { BoardCard } from './BoardCard';
import {
  Chevron,
  CountPill,
  DefaultColumnHeader,
  DefaultEmptyCell,
  DefaultLaneHeader,
  LoadingFooter,
  ShowMoreButton,
} from './defaults';
import { PLACEHOLDER_ROW, cardIndexFromRaw, displayedRows, isPlaceholder, type DisplayedRow } from './displayed';
import { showsCellFooter, visualSlot, type ColumnSlot } from './metrics';
import { COMPACT_HEADER_WIDTH } from './ColumnsLayout';
import { useFlashListUiScroll } from './uiScroll';
import { useHorizontalScroller } from './useHorizontalScroller';

const DEFAULT_CELL_LIMIT = 50;
const LANE_SPACING = 14;
const ROW_SPACING = 8;

interface LanesFrame {
  top: number;
  height: number;
}

interface LanesContextValue {
  listRef: RefObject<FlashListRef<GroupValue> | null>;
  scrollY: RefObject<number>;
  frame: RefObject<LanesFrame>;
  getScrollX: () => number;
  scroller: ScrollerHandle;
  limitOf: (cellId: string) => number;
  showMore: (cellId: string) => void;
}

const LanesContext = createContext<LanesContextValue | null>(null);

function useLanes(): LanesContextValue {
  const value = use(LanesContext);
  if (!value) throw new Error('Swimlane cells must render inside SwimlaneLayout.');
  return value;
}

/**
 * Swimlanes: lanes are the virtualized unit (one vertical FlashList of
 * lanes inside the sideways board scroller). Cells are plain views capped
 * at `cellLimit` cards with "Show more". Column headers sit above the lane
 * list inside the sideways scroller, so they stay aligned; lane headers stay
 * pinned to the left edge while the board scrolls.
 */
export function SwimlaneLayout() {
  const board = useBoard();
  const {
    metrics,
    controller,
    boardHeight,
    boardWidth,
    rtl,
    adapter,
    scrollApi,
    horizontalScrollGesture,
    collapsedLanes,
    props,
    autoScroll,
    loadingColumns,
  } = board;
  const scroller = useHorizontalScroller();
  const columns = controller.model.columns;
  const lanes = controller.model.lanes;
  const cellLimit = Math.max(1, props.laneCellLimit ?? DEFAULT_CELL_LIMIT);
  const listRef = useRef<FlashListRef<GroupValue>>(null);
  const scrollY = useRef(0);
  const contentHeight = useRef(0);
  const frame = useRef<LanesFrame>({ top: 0, height: 0 });
  const [listBox, setListBox] = useState<LanesFrame>({ top: 0, height: 0 });
  const [limits, setLimits] = useState<ReadonlyMap<string, number>>(() => new Map());
  // Expansions belong to one cellLimit. A new cap starts from that cap, not a leftover page.
  const [limitsFor, setLimitsFor] = useState(cellLimit);
  if (limitsFor !== cellLimit) {
    setLimitsFor(cellLimit);
    setLimits(new Map());
  }
  const limitsRef = useRef(limits);
  limitsRef.current = limits;
  const verticalPadding = metrics.mode === 'paged' ? 8 : metrics.gap;

  const onListLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const { y, height } = event.nativeEvent.layout;
      const next = { top: verticalPadding + y, height };
      frame.current = next;
      setListBox((previous) => (previous.top === next.top && previous.height === next.height ? previous : next));
    },
    [verticalPadding],
  );

  const { renderScrollComponent, target: laneTarget } = useFlashListUiScroll();
  const laneScroller = useMemo<ScrollerHandle>(
    () => ({
      axis: 'y',
      getOffset: () => scrollY.current,
      getMaxOffset: () => Math.max(0, contentHeight.current - frame.current.height),
      getViewport: () => ({ start: frame.current.top, size: frame.current.height }),
      scrollTo(offset) {
        scrollY.current = offset;
        listRef.current?.scrollToOffset({ offset, animated: false });
      },
      ui: laneTarget,
    }),
    [laneTarget],
  );
  adapter.useScroller('vertical', autoScroll ? laneScroller : null);

  // A card just moved past its cell's limit stays in sight: the limit grows to include it.
  const { model, isPending } = controller;
  useEffect(() => {
    let next: Map<string, number> | null = null;
    for (const [itemId, location] of model.locations) {
      if (!isPending(itemId)) continue;
      const limit = (next ?? limitsRef.current).get(location.cellId) ?? cellLimit;
      if (location.index < limit) continue;
      next ??= new Map(limitsRef.current);
      next.set(location.cellId, location.index + 1);
    }
    if (next) setLimits(next);
  }, [cellLimit, isPending, model]);

  const limitOf = useCallback((cellId: string) => limits.get(cellId) ?? cellLimit, [cellLimit, limits]);
  const showMore = useCallback(
    (cellId: string) =>
      setLimits((previous) => {
        const next = new Map(previous);
        next.set(cellId, (previous.get(cellId) ?? cellLimit) + cellLimit);
        return next;
      }),
    [cellLimit],
  );

  const lanesContext = useMemo<LanesContextValue>(
    () => ({ listRef, scrollY, frame, getScrollX: scroller.getOffset, scroller: laneScroller, limitOf, showMore }),
    [laneScroller, limitOf, scroller.getOffset, showMore],
  );

  const live = useRef({ controller, lanes, columns, rtl, toSlot: scroller.toSlot, cellLimit });
  live.current = { controller, lanes, columns, rtl, toSlot: scroller.toSlot, cellLimit };
  useEffect(() => {
    const toColumn = (columnId: string, animated: boolean) => {
      const { columns: current, rtl: mirrored, toSlot } = live.current;
      const at = current.findIndex((column) => column.id === columnId);
      if (at >= 0) toSlot(visualSlot(at, current.length, mirrored), animated);
    };
    scrollApi.current = {
      toColumn,
      toItem(itemId, animated) {
        const current = live.current;
        const location = current.controller.model.locations.get(itemId);
        const cell = location ? current.controller.model.cellById.get(location.cellId) : undefined;
        if (!location || !cell) return;
        toColumn(cell.columnKey, animated);
        if (location.index >= (limitsRef.current.get(cell.cellId) ?? current.cellLimit)) {
          setLimits((previous) => new Map(previous).set(cell.cellId, location.index + 1));
        }
        const laneIndex = current.lanes.findIndex((lane) => lane.id === cell.laneKey);
        if (laneIndex >= 0) listRef.current?.scrollToIndex({ index: laneIndex, animated, viewPosition: 0 });
      },
    };
    return () => {
      scrollApi.current = null;
    };
  }, [scrollApi]);

  const renderLane = useCallback(
    ({ item, index }: ListRenderItemInfo<GroupValue>) => (
      <LaneRow lane={item} laneIndex={index} limits={limits} cellLimit={cellLimit} />
    ),
    [cellLimit, limits],
  );
  // The lane whose header has scrolled off the top: a copy of it stays pinned there.
  const sticky = props.stickyHeaders !== false;
  const [pinnedLane, setPinnedLane] = useState<GroupValue | null>(null);
  const lanesRef = useRef(lanes);
  lanesRef.current = lanes;
  const pinAt = useCallback(
    (y: number) => {
      if (!sticky) return;
      const list = listRef.current;
      const current = lanesRef.current;
      const first = list?.getFirstItemOffset() ?? 0;
      let found: GroupValue | null = null;
      // Binary search: lane rows are laid out top to bottom.
      let low = 0;
      let high = current.length - 1;
      while (list && low <= high) {
        const mid = (low + high) >> 1;
        const layout = list.getLayout(mid);
        if (!layout) break;
        const top = first + layout.y;
        if (y < top) high = mid - 1;
        else if (y >= top + layout.height) low = mid + 1;
        else {
          found = y > top + 1 ? (current[mid] ?? null) : null;
          break;
        }
      }
      setPinnedLane((previous) => (previous?.id === found?.id ? previous : found));
    },
    [sticky],
  );
  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = event.nativeEvent.contentOffset.y;
      scrollY.current = y;
      pinAt(y);
    },
    [pinAt],
  );
  // Lanes collapsing, or being added, removed or reordered, move the rows without a scroll: pin again once they lay out.
  useEffect(() => {
    const frame = requestAnimationFrame(() => pinAt(scrollY.current));
    return () => cancelAnimationFrame(frame);
  }, [collapsedLanes, lanes, pinAt]);
  const dragging = adapter.useDragSource() !== null;
  const extraData = useMemo(
    () => [controller.model, collapsedLanes, limits, metrics],
    [collapsedLanes, controller.model, limits, metrics],
  );
  const onContentSizeChange = useCallback((_width: number, height: number) => {
    contentHeight.current = height;
  }, []);
  const columnIds = columns.map((column) => column.id).join('\0');
  const onEndReached = props.onColumnEndReached;
  const endAt = useRef(0);
  const notifyEnd = useCallback(() => {
    if (!onEndReached) return;
    const now = Date.now();
    if (now - endAt.current < 400) return;
    endAt.current = now;
    for (const id of columnIds.split('\0')) if (id) onEndReached(id);
  }, [columnIds, onEndReached]);

  return (
    <LanesContext value={lanesContext}>
      <GestureDetector gesture={horizontalScrollGesture}>
        <Animated.ScrollView
          ref={scroller.scrollRef as never}
          horizontal
          style={styles.ltr}
          contentContainerStyle={{ width: Math.max(metrics.contentWidth, boardWidth), height: boardHeight }}
          scrollEnabled={metrics.scrollable}
          showsHorizontalScrollIndicator={false}
          snapToInterval={metrics.mode === 'paged' ? metrics.pageSize : undefined}
          decelerationRate={metrics.mode === 'paged' ? 'fast' : 'normal'}
          disableIntervalMomentum={metrics.mode === 'paged'}
          contentOffset={{ x: scroller.initialOffset, y: 0 }}
          onScroll={scroller.onScroll}
          scrollEventThrottle={16}
        >
          <View style={[styles.fill, { paddingTop: verticalPadding, direction: rtl ? 'rtl' : 'ltr' }]}>
            <View style={[styles.headerRow, { paddingLeft: metrics.paddingStart, gap: metrics.gap, direction: 'ltr' }]}>
              {metrics.slots.map((slot, visual) => {
                const column = columns[visualSlot(visual, columns.length, rtl)];
                return column ? <ColumnHeaderCell key={column.id} column={column} slot={slot} /> : null;
              })}
            </View>
            <View style={styles.fill} onLayout={onListLayout}>
              {listBox.height > 0 ? (
                <FlashList
                  ref={listRef}
                  renderScrollComponent={renderScrollComponent}
                  data={lanes as GroupValue[]}
                  keyExtractor={laneKey}
                  renderItem={renderLane}
                  extraData={extraData}
                  onScroll={onScroll}
                  scrollEventThrottle={16}
                  onContentSizeChange={onContentSizeChange}
                  onEndReached={onEndReached ? notifyEnd : undefined}
                  onEndReachedThreshold={0}
                  ListFooterComponent={loadingColumns.size > 0 ? <PinnedLoading /> : null}
                  onRefresh={props.onRefresh}
                  refreshing={props.onRefresh ? props.refreshing === true : undefined}
                  contentContainerStyle={styles.lanesContent}
                  maintainVisibleContentPosition={NO_ANCHORING}
                  showsVerticalScrollIndicator={false}
                />
              ) : null}
              {sticky && pinnedLane && !dragging ? (
                // A copy for the eye: hidden during a drag, so it never covers the drop line, and from screen
                // readers, which reach the real header in the list.
                <View
                  style={[styles.pinnedLane, { backgroundColor: board.theme.background }]}
                  pointerEvents="box-none"
                  importantForAccessibility="no-hide-descendants"
                  accessibilityElementsHidden
                >
                  <LaneHeaderBar lane={pinnedLane} />
                </View>
              ) : null}
            </View>
          </View>
        </Animated.ScrollView>
      </GestureDetector>
    </LanesContext>
  );
}

const laneKey = (lane: GroupValue) => lane.id;
// Lanes above the finger change height while a card is dragged: that must not scroll the list.
const NO_ANCHORING = { disabled: true };

/** Lanes scroll sideways with the board; the spinner stays in the middle of the screen. */
function PinnedLoading() {
  const { scrollX, metrics, boardWidth, theme, labels } = useBoard();
  const maxShift = Math.max(0, metrics.contentWidth - boardWidth);
  const pinned = useAnimatedStyle(() => ({
    transform: [{ translateX: Math.min(Math.max(scrollX.value, 0), maxShift) }],
  }));
  return (
    <Animated.View style={[{ width: boardWidth }, pinned]}>
      <LoadingFooter theme={theme} label={labels.loadingMore} />
    </Animated.View>
  );
}

function ColumnHeaderCell({ column, slot }: { column: GroupValue; slot: ColumnSlot }) {
  const board = useBoard();
  const { controller, props, theme, labels, canCollapseColumns, toggleColumn, columnTotal, describeColumn } = board;
  const loaded = useMemo(
    () =>
      controller.model.cells.reduce((sum, cell) => (cell.columnKey === column.id ? sum + cell.items.length : sum), 0),
    [column.id, controller.model],
  );
  const count = columnTotal(column.id, loaded);
  const toggle = useCallback(() => toggleColumn(column.id), [column.id, toggleColumn]);
  if (slot.collapsed) {
    return (
      <Pressable
        onPress={toggle}
        accessibilityRole="button"
        accessibilityLabel={`${labels.expandColumn(column.label)}, ${count}`}
        style={({ pressed }) => [styles.collapsedHeader, { width: slot.width, opacity: pressed ? 0.6 : 1 }]}
      >
        <Chevron direction="right" color={theme.mutedText} size={7} />
        <CountPill count={count} theme={theme} />
      </Pressable>
    );
  }
  const info = {
    column,
    count: loaded,
    total: count,
    collapsed: false,
    compact: slot.width < COMPACT_HEADER_WIDTH,
    toggleCollapsed: canCollapseColumns ? toggle : undefined,
    openColumnSheet: board.headerSheet('column', column.id),
    ...describeColumn(column.id, count),
  };
  return (
    <View style={{ width: slot.width }}>
      {props.renderColumnHeader ? (
        props.renderColumnHeader(info)
      ) : (
        <DefaultColumnHeader info={info} theme={theme} labels={labels} />
      )}
    </View>
  );
}

/** A lane's header, held still while the board scrolls sideways. Also the pinned copy at the top of the list. */
const LaneHeaderBar = memo(function LaneHeaderBar({ lane }: { lane: GroupValue }) {
  const board = useBoard();
  const { controller, metrics, theme, labels, props, collapsedLanes, toggleLane, scrollX, boardWidth } = board;
  const collapsed = collapsedLanes.has(lane.id);
  const count = useMemo(
    () => controller.model.cells.reduce((sum, cell) => (cell.laneKey === lane.id ? sum + cell.items.length : sum), 0),
    [controller.model, lane.id],
  );
  const toggle = useCallback(() => toggleLane(lane.id), [lane.id, toggleLane]);
  const maxShift = Math.max(0, metrics.contentWidth - boardWidth);
  const pinned = useAnimatedStyle(() => ({
    transform: [{ translateX: Math.min(Math.max(scrollX.value, 0), maxShift) }],
  }));
  const distribution = useMemo(() => laneDistribution(controller.model, lane.id), [controller.model, lane.id]);
  const info = {
    lane,
    count,
    collapsed,
    toggleCollapsed: board.canCollapseLanes ? toggle : undefined,
    openLaneSheet: board.headerSheet('lane', lane.id),
    distribution,
  };
  return (
    <Animated.View
      style={[
        { width: boardWidth - metrics.paddingStart - metrics.paddingEnd, marginLeft: metrics.paddingStart },
        pinned,
      ]}
    >
      {props.renderLaneHeader ? (
        props.renderLaneHeader(info)
      ) : (
        <DefaultLaneHeader info={info} theme={theme} labels={labels} />
      )}
    </Animated.View>
  );
});

const LaneRow = memo(function LaneRow({
  lane,
  laneIndex,
  limits,
  cellLimit,
}: {
  lane: GroupValue;
  laneIndex: number;
  limits: ReadonlyMap<string, number>;
  cellLimit: number;
}) {
  const board = useBoard();
  const { controller, metrics, collapsedLanes, rtl, page } = board;
  const currentPage = useStoreValue(page);
  const collapsed = collapsedLanes.has(lane.id);
  const columns = controller.model.columns;
  const [rowY, setRowY] = useState(0);
  const onRowLayout = useCallback((event: LayoutChangeEvent) => setRowY(event.nativeEvent.layout.y), []);

  return (
    <View style={styles.lane}>
      <LaneHeaderBar lane={lane} />
      {collapsed ? null : (
        <View
          style={[styles.cellRow, { paddingLeft: metrics.paddingStart, gap: metrics.gap, direction: 'ltr' }]}
          onLayout={onRowLayout}
        >
          {metrics.slots.map((slot, visual) => {
            const column = columns[visualSlot(visual, columns.length, rtl)];
            const cell = column ? controller.model.cellById.get(makeCellId(lane.id, column.id)) : undefined;
            if (!cell) return null;
            return (
              <SwimCell
                key={cell.cellId}
                cell={cell}
                slot={slot}
                laneIndex={laneIndex}
                rowY={rowY}
                limit={limits.get(cell.cellId) ?? cellLimit}
                showFooter={showsCellFooter(metrics.mode, visual, currentPage)}
              />
            );
          })}
        </View>
      )}
    </View>
  );
});

interface SwimLive {
  board: BoardContextValue;
  lanes: LanesContextValue;
  cell: BoardCell<unknown>;
  rows: readonly DisplayedRow<unknown>[];
  placeholderAt: number;
  slot: ColumnSlot;
  laneIndex: number;
  rowY: number;
  height: number;
}

function rowKey(row: DisplayedRow<unknown>, getId: (item: unknown) => string): string {
  return isPlaceholder(row) ? PLACEHOLDER_ID : getId(row);
}

/** Cell geometry for a swimlane cell: rows are plain views that report their own layout. */
function swimGeometry(live: RefObject<SwimLive>, slotsByKey: RefObject<Map<string, Slot>>): CellGeometry {
  const keyAt = (index: number): string | undefined => {
    const row = live.current.rows[index];
    return row === undefined ? undefined : rowKey(row, live.current.board.props.getItemId);
  };
  const slots: SlotSource = {
    get count() {
      return live.current.rows.length;
    },
    slot(index) {
      const key = keyAt(index);
      return key === undefined ? undefined : slotsByKey.current.get(key);
    },
  };
  const rect = (): Rect | null => {
    const { lanes, laneIndex, rowY, slot, height } = live.current;
    const layout = lanes.listRef.current?.getLayout(laneIndex);
    if (!layout || height <= 0) return null;
    const firstOffset = lanes.listRef.current?.getFirstItemOffset() ?? 0;
    return {
      x: slot.x - lanes.getScrollX(),
      y: lanes.frame.current.top + firstOffset + layout.y - lanes.scrollY.current + rowY,
      width: slot.width,
      height,
    };
  };
  const rowRect = (index: number, outer: Rect): Rect | null => {
    const slot = slots.slot(index);
    if (!slot) return null;
    const { cellPadding, cardGap } = live.current.board.theme;
    return {
      x: outer.x + cellPadding,
      y: outer.y + slot.top,
      width: outer.width - cellPadding * 2,
      height: Math.max(0, slot.height - cardGap),
    };
  };

  return {
    get scroller() {
      return live.current.lanes.scroller;
    },
    accepts: () => true,
    getRect: rect,
    resolve(y) {
      const outer = rect();
      if (!outer) return 0;
      return cardIndexFromRaw(rawInsertionIndex(slots, y - outer.y), live.current.placeholderAt);
    },
    itemAt(y) {
      const outer = rect();
      if (!outer) return null;
      const local = y - outer.y;
      const index = slotIndexAt(slots, local);
      const slot = index >= 0 ? slots.slot(index) : undefined;
      const row = index >= 0 ? live.current.rows[index] : undefined;
      if (!slot || row === undefined || isPlaceholder(row)) return null;
      if (local > slot.top + slot.height - live.current.board.theme.cardGap) return null;
      const found = rowRect(index, outer);
      const itemId = live.current.board.props.getItemId(row);
      const location = live.current.board.controller.model.locations.get(itemId);
      return found && location ? { itemId, index: location.index, rect: found } : null;
    },
    itemRect(itemId) {
      const current = live.current;
      const outer = rect();
      if (!outer) return null;
      const index =
        itemId === PLACEHOLDER_ID
          ? current.placeholderAt
          : current.rows.findIndex((row) => !isPlaceholder(row) && current.board.props.getItemId(row) === itemId);
      const found = index >= 0 ? rowRect(index, outer) : null;
      const frame = current.lanes.frame.current;
      if (!found || found.y + found.height < frame.top || found.y > frame.top + frame.height) return null;
      return found;
    },
  };
}

const SwimCell = memo(function SwimCell({
  cell,
  slot,
  laneIndex,
  rowY,
  limit,
  showFooter,
}: {
  cell: BoardCell<unknown>;
  slot: ColumnSlot;
  laneIndex: number;
  rowY: number;
  /** How many cards this cell may show. A number so memo sees Show more. */
  limit: number;
  /** False on a peeked paged column, where Show more would be clipped. */
  showFooter: boolean;
}) {
  const board = useBoard();
  const lanes = useLanes();
  const { theme, labels, props, controller, adapter } = board;
  const placement = adapter.usePlacement(cell.cellId);
  const [height, setHeight] = useState(0);
  const getItemId = props.getItemId;
  const rows = useMemo(
    () => displayedRows(cell.items, getItemId, placement, limit),
    [cell.items, getItemId, limit, placement],
  );
  const placeholderAt = placement.placeholderIndex === null ? -1 : rows.indexOf(PLACEHOLDER_ROW);
  const visibleCards = rows.length - (placeholderAt >= 0 ? 1 : 0);
  const hiddenCount = cell.items.length - (placement.hiddenItemId !== null ? 1 : 0) - visibleCards;
  const slotsByKey = useRef(new Map<string, Slot>());
  const live = useRef<SwimLive>({ board, lanes, cell, rows, placeholderAt, slot, laneIndex, rowY, height });
  live.current = { board, lanes, cell, rows, placeholderAt, slot, laneIndex, rowY, height };
  const geometry = useMemo(() => swimGeometry(live, slotsByKey), []);

  const onLayout = useCallback((event: LayoutChangeEvent) => setHeight(event.nativeEvent.layout.height), []);
  const onSlotLayout = useCallback((key: string, top: number, slotHeight: number) => {
    slotsByKey.current.set(key, { top, height: slotHeight });
  }, []);
  const onPlaceholderLayout = useCallback(
    (event: LayoutChangeEvent) =>
      onSlotLayout(PLACEHOLDER_ID, event.nativeEvent.layout.y, event.nativeEvent.layout.height),
    [onSlotLayout],
  );
  const more = useCallback(() => lanes.showMore(cell.cellId), [cell.cellId, lanes]);

  const frameStyle = [
    styles.cell,
    {
      width: slot.width,
      minHeight: theme.cellMinHeight + theme.cellPadding * 2,
      padding: theme.cellPadding,
      paddingBottom: Math.max(0, theme.cellPadding - theme.cardGap),
      backgroundColor: theme.columnBackground,
      borderColor: theme.columnBorder,
      borderRadius: theme.radius,
      direction: board.rtl ? ('rtl' as const) : ('ltr' as const),
    },
  ];

  if (slot.collapsed) {
    return (
      <Pressable
        onPress={() => board.toggleColumn(cell.columnKey)}
        accessibilityRole="button"
        accessibilityLabel={`${board.labels.expandColumn(cell.column.label)}, ${cell.items.length}`}
        style={[frameStyle, styles.collapsedCell]}
      >
        <CountPill count={cell.items.length} theme={theme} />
      </Pressable>
    );
  }

  return (
    <adapter.Cell cellId={cell.cellId} geometry={geometry} style={frameStyle} onLayout={onLayout}>
      {rows.length === 0 ? (
        <View style={{ paddingBottom: theme.cardGap }}>
          {props.renderEmptyCell ? (
            props.renderEmptyCell({ column: cell.column, lane: cell.lane })
          ) : (
            <DefaultEmptyCell theme={theme} labels={labels} />
          )}
        </View>
      ) : (
        rows.map((row) => {
          if (isPlaceholder(row)) {
            return (
              <View key={PLACEHOLDER_ID} style={{ paddingBottom: theme.cardGap }} onLayout={onPlaceholderLayout}>
                <adapter.Placeholder
                  height={placement.placeholderHeight}
                  radius={theme.cardRadius}
                  color={theme.accent}
                  render={props.renderDropIndicator}
                />
              </View>
            );
          }
          const id = getItemId(row);
          return (
            <BoardCard
              key={id}
              itemId={id}
              cellId={cell.cellId}
              index={controller.model.locations.get(id)?.index ?? 0}
              count={cell.items.length}
              pending={controller.isPending(id)}
              onSlotLayout={onSlotLayout}
            />
          );
        })
      )}
      {showFooter && hiddenCount > 0 ? (
        <ShowMoreButton label={labels.showMore(hiddenCount)} theme={theme} onPress={more} />
      ) : null}
      {showFooter && props.renderColumnFooter
        ? props.renderColumnFooter({
            column: cell.column,
            lane: cell.lane,
            count: cell.items.length,
            loading: board.loadingColumns.has(cell.columnKey),
          })
        : null}
    </adapter.Cell>
  );
});

const styles = StyleSheet.create({
  ltr: { direction: 'ltr' },
  fill: { flex: 1 },
  headerRow: { flexDirection: 'row', paddingBottom: 6 },
  collapsedHeader: { alignItems: 'center', gap: 6, paddingVertical: 10, minHeight: 44 },
  lanesContent: { paddingBottom: 32 },
  pinnedLane: { position: 'absolute', left: 0, right: 0, top: 0, paddingBottom: 4, zIndex: 20 },
  lane: { paddingBottom: LANE_SPACING },
  cellRow: { flexDirection: 'row', alignItems: 'stretch', paddingTop: ROW_SPACING },
  cell: { borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  collapsedCell: { alignItems: 'center' },
});
