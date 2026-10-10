import { FlashList, type FlashListRef, type ListRenderItemInfo } from '@shopify/flash-list';
import { memo, useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import {
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';
import { NO_LANE_ID, cellId as makeCellId, type BoardCell } from 'board-view-core';
import { useBoard, type BoardContextValue } from '../context';
import { rawInsertionIndex, slotIndexAt, type Rect, type SlotSource } from '../engine/geometry';
import { PLACEHOLDER_ID, type CellGeometry, type ScrollerHandle } from '../engine/types';
import { BoardCard } from './BoardCard';
import { CollapsedColumnStrip, DefaultColumnHeader, DefaultEmptyCell } from './defaults';
import { PLACEHOLDER_ROW, cardIndexFromRaw, displayedRows, isPlaceholder, type DisplayedRow } from './displayed';
import type { ColumnSlot } from './metrics';
import { visualSlot } from './metrics';
import { useHorizontalScroller } from './useHorizontalScroller';

/** Columns narrower than this get the stacked header. */
export const COMPACT_HEADER_WIDTH = 180;

export interface ListApi {
  scrollToIndex(index: number, animated: boolean): void;
}

type ListRegistry = RefObject<Map<string, ListApi>>;

/** Boards without lanes in the paged, multi and fit layouts: a sideways row of FlashList columns. */
export function ColumnsLayout() {
  const board = useBoard();
  const { metrics, controller, boardHeight, rtl, adapter, scrollApi, horizontalScrollGesture } = board;
  const scroller = useHorizontalScroller();
  const source = adapter.useDragSource();
  const columns = controller.model.columns;
  const paged = metrics.mode === 'paged';
  const verticalPadding = paged ? 8 : metrics.gap;
  const columnHeight = Math.max(0, boardHeight - verticalPadding * 2);
  const lists = useRef(new Map<string, ListApi>());
  const pendingReveal = useRef(new Map<string, number>());
  const live = useRef({ controller, columns, rtl, toSlot: scroller.toSlot });
  live.current = { controller, columns, rtl, toSlot: scroller.toSlot };

  useEffect(() => {
    const toColumn = (columnId: string, animated: boolean) => {
      const { columns: current, rtl: mirrored, toSlot } = live.current;
      const at = current.findIndex((column) => column.id === columnId);
      if (at >= 0) toSlot(visualSlot(at, current.length, mirrored), animated);
    };
    scrollApi.current = {
      toColumn,
      toItem(itemId, animated) {
        const location = live.current.controller.model.locations.get(itemId);
        const cell = location ? live.current.controller.model.cellById.get(location.cellId) : undefined;
        if (!location || !cell) return;
        toColumn(cell.columnKey, animated);
        const list = lists.current.get(location.cellId);
        if (list) list.scrollToIndex(location.index, animated);
        else pendingReveal.current.set(location.cellId, location.index);
      },
    };
    return () => {
      scrollApi.current = null;
    };
  }, [scrollApi]);

  return (
    <GestureDetector gesture={horizontalScrollGesture}>
      <Animated.ScrollView
        ref={scroller.scrollRef as never}
        horizontal
        style={styles.ltr}
        contentContainerStyle={{ width: metrics.contentWidth, height: boardHeight }}
        scrollEnabled={metrics.scrollable}
        showsHorizontalScrollIndicator={false}
        snapToInterval={paged ? metrics.pageSize : undefined}
        decelerationRate={paged ? 'fast' : 'normal'}
        disableIntervalMomentum={paged}
        contentOffset={{ x: scroller.initialOffset, y: 0 }}
        onScroll={scroller.onScroll}
        scrollEventThrottle={16}
      >
        {metrics.slots.map((slot, visual) => {
          const column = columns[visualSlot(visual, columns.length, rtl)];
          const cell = column ? controller.model.cellById.get(makeCellId(NO_LANE_ID, column.id)) : undefined;
          if (!cell) return null;
          const inWindow = visual >= scroller.range.first && visual <= scroller.range.last;
          return (
            <BoardColumn
              key={cell.cellId}
              cell={cell}
              slot={slot}
              top={verticalPadding}
              height={columnHeight}
              mounted={inWindow || source?.cellId === cell.cellId}
              getScrollX={scroller.getOffset}
              lists={lists}
              pendingReveal={pendingReveal}
            />
          );
        })}
      </Animated.ScrollView>
    </GestureDetector>
  );
}

interface BoardColumnProps {
  cell: BoardCell<unknown>;
  slot: ColumnSlot;
  top: number;
  height: number;
  mounted: boolean;
  getScrollX: () => number;
  lists: ListRegistry;
  pendingReveal: RefObject<Map<string, number>>;
}

const BoardColumn = memo(function BoardColumn({
  cell,
  slot,
  top,
  height,
  mounted,
  getScrollX,
  lists,
  pendingReveal,
}: BoardColumnProps) {
  const board = useBoard();
  const { theme, labels, props, canCollapseColumns, toggleColumn } = board;
  const [listFrame, setListFrame] = useState({ y: 0, height: 0 });
  const count = cell.items.length;
  const toggle = useCallback(() => toggleColumn(cell.columnKey), [cell.columnKey, toggleColumn]);
  const onListLayout = useCallback((event: LayoutChangeEvent) => {
    const { y, height: next } = event.nativeEvent.layout;
    setListFrame((previous) => (previous.y === y && previous.height === next ? previous : { y, height: next }));
  }, []);

  const frame = [
    styles.column,
    {
      left: slot.x,
      top,
      width: slot.width,
      height,
      backgroundColor: theme.columnBackground,
      borderColor: theme.columnBorder,
      borderRadius: theme.radius,
      direction: board.rtl ? ('rtl' as const) : ('ltr' as const),
    },
  ];

  if (slot.collapsed) {
    return (
      <View style={frame}>
        <CollapsedColumnStrip
          label={cell.column.label}
          count={count}
          color={cell.column.color}
          theme={theme}
          expandLabel={labels.expandColumn(cell.column.label)}
          onExpand={toggle}
          height={height}
        />
      </View>
    );
  }

  const headerInfo = {
    column: cell.column,
    count,
    collapsed: false,
    compact: slot.width < COMPACT_HEADER_WIDTH,
    toggleCollapsed: canCollapseColumns ? toggle : undefined,
  };
  return (
    <View style={frame}>
      {props.renderColumnHeader ? (
        props.renderColumnHeader(headerInfo)
      ) : (
        <DefaultColumnHeader info={headerInfo} theme={theme} labels={labels} />
      )}
      <View style={styles.listBox} onLayout={onListLayout}>
        {mounted && listFrame.height > 0 ? (
          <ColumnList
            cell={cell}
            slot={slot}
            listTop={top + listFrame.y}
            listHeight={listFrame.height}
            getScrollX={getScrollX}
            lists={lists}
            pendingReveal={pendingReveal}
          />
        ) : null}
      </View>
      {props.renderColumnFooter ? props.renderColumnFooter({ column: cell.column, lane: null, count }) : null}
    </View>
  );
});

interface ColumnListProps {
  cell: BoardCell<unknown>;
  slot: ColumnSlot;
  listTop: number;
  listHeight: number;
  getScrollX: () => number;
  lists: ListRegistry;
  pendingReveal: RefObject<Map<string, number>>;
}

interface ColumnLive {
  board: BoardContextValue;
  cell: BoardCell<unknown>;
  rows: readonly DisplayedRow<unknown>[];
  placeholderAt: number;
  slot: ColumnSlot;
  listTop: number;
  listHeight: number;
  getScrollX: () => number;
}

/**
 * Cell geometry for a FlashList column. Row positions come from FlashList's
 * own layouts (measured on screen, estimated off screen), so nothing is
 * measured during a drag and a 500-card column costs a binary search.
 */
function columnGeometry(
  live: RefObject<ColumnLive>,
  listRef: RefObject<FlashListRef<unknown> | null>,
  scrollY: RefObject<number>,
  contentHeight: RefObject<number>,
): CellGeometry {
  const firstOffset = () => listRef.current?.getFirstItemOffset() ?? live.current.board.theme.cellPadding;
  const slots: SlotSource = {
    get count() {
      return live.current.rows.length;
    },
    slot(index) {
      const layout = listRef.current?.getLayout(index);
      return layout ? { top: firstOffset() + layout.y, height: layout.height } : undefined;
    },
  };
  const rect = (): Rect => {
    const current = live.current;
    return {
      x: current.slot.x - current.getScrollX(),
      y: current.listTop,
      width: current.slot.width,
      height: current.listHeight,
    };
  };
  const toContent = (y: number) => y - live.current.listTop + scrollY.current;
  const toBoard = (contentY: number) => contentY - scrollY.current + live.current.listTop;
  const rowRect = (index: number): Rect | null => {
    const slot = slots.slot(index);
    if (!slot) return null;
    const outer = rect();
    const { cellPadding, cardGap } = live.current.board.theme;
    return {
      x: outer.x + cellPadding,
      y: toBoard(slot.top),
      width: outer.width - cellPadding * 2,
      height: Math.max(0, slot.height - cardGap),
    };
  };
  const scroller: ScrollerHandle = {
    axis: 'y',
    getOffset: () => scrollY.current,
    getMaxOffset: () => Math.max(0, contentHeight.current - live.current.listHeight),
    getViewport: () => ({ start: live.current.listTop, size: live.current.listHeight }),
    scrollTo(offset) {
      scrollY.current = offset;
      listRef.current?.scrollToOffset({ offset, animated: false });
    },
  };

  return {
    scroller,
    accepts: () => true,
    getRect: rect,
    resolve(y) {
      return cardIndexFromRaw(rawInsertionIndex(slots, toContent(y)), live.current.placeholderAt);
    },
    itemAt(y) {
      const contentY = toContent(y);
      const index = slotIndexAt(slots, contentY);
      const slot = index >= 0 ? slots.slot(index) : undefined;
      const row = index >= 0 ? live.current.rows[index] : undefined;
      if (!slot || row === undefined || isPlaceholder(row)) return null;
      // A press in the gap below a card is not on the card.
      if (contentY > slot.top + slot.height - live.current.board.theme.cardGap) return null;
      const found = rowRect(index);
      const itemId = live.current.board.props.getItemId(row);
      const location = live.current.board.controller.model.locations.get(itemId);
      return found && location ? { itemId, index: location.index, rect: found } : null;
    },
    itemRect(itemId) {
      const current = live.current;
      const index =
        itemId === PLACEHOLDER_ID
          ? current.placeholderAt
          : current.rows.findIndex((row) => !isPlaceholder(row) && current.board.props.getItemId(row) === itemId);
      if (index < 0) return null;
      const found = rowRect(index);
      if (!found || found.y + found.height < current.listTop || found.y > current.listTop + current.listHeight)
        return null;
      return found;
    },
  };
}

function ColumnList({ cell, slot, listTop, listHeight, getScrollX, lists, pendingReveal }: ColumnListProps) {
  const board = useBoard();
  const { controller, theme, adapter, props, labels } = board;
  const placement = adapter.usePlacement(cell.cellId);
  const listRef = useRef<FlashListRef<unknown>>(null);
  const scrollY = useRef(0);
  const contentHeight = useRef(0);
  const getItemId = props.getItemId;
  const rows = useMemo(() => displayedRows(cell.items, getItemId, placement), [cell.items, getItemId, placement]);
  const placeholderAt = placement.placeholderIndex === null ? -1 : rows.indexOf(PLACEHOLDER_ROW);
  const live = useRef<ColumnLive>({ board, cell, rows, placeholderAt, slot, listTop, listHeight, getScrollX });
  live.current = { board, cell, rows, placeholderAt, slot, listTop, listHeight, getScrollX };
  const [initialIndex] = useState(() => {
    const index = pendingReveal.current.get(cell.cellId);
    pendingReveal.current.delete(cell.cellId);
    return index;
  });

  const geometry = useMemo(() => columnGeometry(live, listRef, scrollY, contentHeight), []);

  useEffect(() => {
    const registry = lists.current;
    registry.set(cell.cellId, {
      scrollToIndex(index, animated) {
        listRef.current?.scrollToIndex({ index, animated, viewPosition: 0.3 });
      },
    });
    return () => {
      registry.delete(cell.cellId);
    };
  }, [cell.cellId, lists]);

  const placeholderHeight = placement.placeholderHeight;
  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<DisplayedRow<unknown>>) => {
      if (isPlaceholder(item)) {
        return (
          <View style={{ paddingBottom: theme.cardGap }}>
            <adapter.Placeholder
              height={placeholderHeight}
              radius={theme.cardRadius}
              color={theme.accent}
              render={props.renderDropIndicator}
            />
          </View>
        );
      }
      const id = getItemId(item);
      return (
        <BoardCard
          itemId={id}
          cellId={cell.cellId}
          index={controller.model.locations.get(id)?.index ?? 0}
          count={cell.items.length}
          pending={controller.isPending(id)}
        />
      );
    },
    [adapter, cell, controller, getItemId, placeholderHeight, props.renderDropIndicator, theme],
  );
  const keyExtractor = useCallback(
    (row: DisplayedRow<unknown>) => (isPlaceholder(row) ? PLACEHOLDER_ID : getItemId(row)),
    [getItemId],
  );

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollY.current = event.nativeEvent.contentOffset.y;
  }, []);
  const onContentSizeChange = useCallback((_width: number, height: number) => {
    contentHeight.current = height;
  }, []);

  const empty = (
    <View>
      {props.renderEmptyCell ? (
        props.renderEmptyCell({ column: cell.column, lane: null })
      ) : (
        <DefaultEmptyCell theme={theme} labels={labels} />
      )}
    </View>
  );

  return (
    <adapter.Cell cellId={cell.cellId} geometry={geometry} style={styles.fill}>
      <FlashList
        ref={listRef}
        data={rows}
        keyExtractor={keyExtractor}
        getItemType={rowType}
        renderItem={renderItem}
        extraData={controller.isPending}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onContentSizeChange={onContentSizeChange}
        contentContainerStyle={{
          paddingHorizontal: theme.cellPadding,
          paddingTop: theme.cellPadding,
          paddingBottom: Math.max(0, theme.cellPadding - theme.cardGap) + 24,
        }}
        ListEmptyComponent={empty}
        initialScrollIndex={initialIndex}
        maintainVisibleContentPosition={NO_ANCHORING}
        showsVerticalScrollIndicator={false}
      />
    </adapter.Cell>
  );
}

// A board column is not a chat log: inserting the placeholder must not scroll it.
const NO_ANCHORING = { disabled: true };
const rowType = (row: DisplayedRow<unknown>) => (isPlaceholder(row) ? 'placeholder' : 'card');

const styles = StyleSheet.create({
  ltr: { direction: 'ltr' },
  column: { position: 'absolute', overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  listBox: { flex: 1 },
  fill: { flex: 1 },
});
