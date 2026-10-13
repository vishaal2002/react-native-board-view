import { FlashList, type FlashListRef, type ListRenderItemInfo } from '@shopify/flash-list';
import { memo, useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import {
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { NO_LANE_ID, type BoardCell, type BoardModel, type GroupValue } from 'board-view-core';
import { useBoard, type BoardContextValue } from '../context';
import { rawInsertionIndex, slotIndexAt, type Rect, type SlotSource } from '../engine/geometry';
import { PLACEHOLDER_ID, type CellGeometry, type DragPlacement, type ScrollerHandle } from '../engine/types';
import { BoardCard } from './BoardCard';
import { DefaultColumnHeader, DefaultEmptyCell, DefaultLaneHeader, LoadingFooter } from './defaults';
import { cardIndexFromRaw } from './displayed';

const SECTION_SPACING = 12;
const CLOSING_PAD = 4;

type Row =
  | { kind: 'lane'; key: string; lane: GroupValue; count: number; collapsed: boolean }
  | { kind: 'section'; key: string; cellId: string; collapsed: boolean; last: boolean }
  | { kind: 'card'; key: string; cellId: string; itemId: string; last: boolean }
  | { kind: 'placeholder'; key: string; cellId: string; height: number; last: boolean }
  | { kind: 'empty'; key: string; cellId: string; last: boolean }
  | { kind: 'footer'; key: string; cellId: string };

interface CellRange {
  header: number;
  /** First body row: a card, the placeholder or the empty row. */
  first: number;
  /** Card and placeholder rows. */
  count: number;
  /** Placeholder position among body rows, or -1. */
  placeholderAt: number;
  /** Last row of the drop area. */
  lastBody: number;
  /** The last body row also closes the section (no footer below it). */
  closing: boolean;
}

interface Rows {
  rows: Row[];
  ranges: Map<string, CellRange>;
}

interface BuildOptions {
  getItemId: (item: unknown) => string;
  hasFooter: boolean;
  placement: DragPlacement | null;
}

/** Body rows of one cell: its cards without the lifted one, the placeholder, or the empty row. */
function cellBody(
  cell: BoardCell<unknown>,
  options: BuildOptions,
): { body: Row[]; count: number; placeholderAt: number } {
  const { placement } = options;
  const hidden = placement?.sourceCellId === cell.cellId ? placement.itemId : null;
  const body: Row[] = [];
  for (const item of cell.items) {
    const itemId = options.getItemId(item);
    if (itemId !== hidden) body.push({ kind: 'card', key: `card:${itemId}`, cellId: cell.cellId, itemId, last: false });
  }
  let placeholderAt = -1;
  if (placement?.cellId === cell.cellId) {
    placeholderAt = Math.min(placement.index, body.length);
    body.splice(placeholderAt, 0, {
      kind: 'placeholder',
      key: `placeholder:${cell.cellId}`,
      cellId: cell.cellId,
      height: placement.height,
      last: false,
    });
  }
  const count = body.length;
  if (count === 0) body.push({ kind: 'empty', key: `empty:${cell.cellId}`, cellId: cell.cellId, last: false });
  const tail = body.at(-1);
  if (tail && !options.hasFooter) body[body.length - 1] = { ...tail, last: true } as Row;
  return { body, count, placeholderAt };
}

function buildRows(
  model: BoardModel<unknown>,
  hasLanes: boolean,
  collapsedLanes: ReadonlySet<string>,
  collapsedColumns: ReadonlySet<string>,
  options: BuildOptions,
): Rows {
  const rows: Row[] = [];
  const ranges = new Map<string, CellRange>();
  for (const lane of model.lanes) {
    const laneCells = model.cells.filter((cell) => cell.laneKey === lane.id);
    if (hasLanes) {
      const count = laneCells.reduce((sum, cell) => sum + cell.items.length, 0);
      const collapsed = collapsedLanes.has(lane.id);
      rows.push({ kind: 'lane', key: `lane:${lane.id}`, lane, count, collapsed });
      if (collapsed) continue;
    }
    for (const cell of laneCells) {
      const collapsed = collapsedColumns.has(cell.columnKey);
      const header = rows.length;
      rows.push({ kind: 'section', key: `section:${cell.cellId}`, cellId: cell.cellId, collapsed, last: collapsed });
      if (collapsed) continue;
      const { body, count, placeholderAt } = cellBody(cell, options);
      const first = rows.length;
      rows.push(...body);
      const lastBody = rows.length - 1;
      if (options.hasFooter) rows.push({ kind: 'footer', key: `footer:${cell.cellId}`, cellId: cell.cellId });
      ranges.set(cell.cellId, { header, first, count, placeholderAt, lastBody, closing: !options.hasFooter });
    }
  }
  return { rows, ranges };
}

interface StackedLive {
  board: BoardContextValue;
  rows: Row[];
  ranges: Map<string, CellRange>;
  top: number;
  height: number;
}

function closingExtra(theme: { cellPadding: number; cardGap: number }): number {
  return SECTION_SPACING + Math.max(0, theme.cellPadding - theme.cardGap) + CLOSING_PAD;
}

function stackedGeometry(
  cellId: string,
  live: RefObject<StackedLive>,
  listRef: RefObject<FlashListRef<Row> | null>,
  scrollY: RefObject<number>,
  scroller: ScrollerHandle,
): CellGeometry {
  const range = () => live.current.ranges.get(cellId);
  const rowTop = (row: number) => {
    const layout = listRef.current?.getLayout(row);
    return layout ? (listRef.current?.getFirstItemOffset() ?? 0) + layout.y : undefined;
  };
  const toBoard = (contentY: number) => live.current.top + contentY - scrollY.current;
  const toContent = (y: number) => y - live.current.top + scrollY.current;
  const slots: SlotSource = {
    get count() {
      return range()?.count ?? 0;
    },
    slot(index) {
      const current = range();
      if (!current) return undefined;
      const row = current.first + index;
      const layout = listRef.current?.getLayout(row);
      const top = rowTop(row);
      if (!layout || top === undefined) return undefined;
      // The closing row also carries the section's bottom padding and spacing.
      const extra = current.closing && row === current.lastBody ? closingExtra(live.current.board.theme) : 0;
      return { top, height: layout.height - extra };
    },
  };
  const margin = () => live.current.board.theme.columnGap;
  const rect = (): Rect | null => {
    const current = range();
    if (!current) return null;
    const top = rowTop(current.header);
    const bottomLayout = listRef.current?.getLayout(current.lastBody);
    const bottomTop = rowTop(current.lastBody);
    if (top === undefined || !bottomLayout || bottomTop === undefined) return null;
    const { top: viewTop, height: viewHeight, board } = live.current;
    const y1 = Math.max(viewTop, toBoard(top));
    const y2 = Math.min(viewTop + viewHeight, toBoard(bottomTop + bottomLayout.height));
    if (y2 <= y1) return null;
    return { x: margin(), y: y1, width: board.boardWidth - margin() * 2, height: y2 - y1 };
  };
  const bodyRect = (index: number): Rect | null => {
    const slot = slots.slot(index);
    if (!slot) return null;
    const { cellPadding, cardGap } = live.current.board.theme;
    return {
      x: margin() + cellPadding,
      y: toBoard(slot.top),
      width: live.current.board.boardWidth - (margin() + cellPadding) * 2,
      height: Math.max(0, slot.height - cardGap),
    };
  };
  const visible = (found: Rect | null): Rect | null => {
    const { top, height } = live.current;
    if (!found || found.y + found.height < top || found.y > top + height) return null;
    return found;
  };

  return {
    scroller,
    accepts: () => true,
    getRect: rect,
    resolve(y) {
      const current = range();
      return cardIndexFromRaw(rawInsertionIndex(slots, toContent(y)), current?.placeholderAt ?? -1);
    },
    itemAt(y) {
      const current = range();
      const contentY = toContent(y);
      const index = slotIndexAt(slots, contentY);
      if (!current || index < 0) return null;
      const row = live.current.rows[current.first + index];
      if (row?.kind !== 'card') return null;
      const found = bodyRect(index);
      if (!found || toBoard(contentY) > found.y + found.height) return null;
      const location = live.current.board.controller.model.locations.get(row.itemId);
      return location ? { itemId: row.itemId, index: location.index, rect: found } : null;
    },
    itemRect(itemId) {
      const current = range();
      if (!current) return null;
      for (let index = 0; index < current.count; index += 1) {
        const row = live.current.rows[current.first + index];
        if (itemId === PLACEHOLDER_ID ? row?.kind === 'placeholder' : row?.kind === 'card' && row.itemId === itemId) {
          return visible(bodyRect(index));
        }
      }
      return null;
    },
  };
}

/**
 * Stacked: one vertical FlashList, a section per column (and a group per
 * lane). No sideways scrolling at all; drags auto-scroll the one list.
 */
export function StackedLayout() {
  const board = useBoard();
  const { controller, props, adapter, scrollApi, collapsedLanes, collapsedColumns, autoScroll, loadingColumns } = board;
  const placement = adapter.usePlacementState();
  const listRef = useRef<FlashListRef<Row>>(null);
  const scrollY = useRef(0);
  const contentHeight = useRef(0);
  const [frame, setFrame] = useState({ top: 0, height: 0 });
  const hasLanes = props.groupBy.lanes != null;
  const { rows, ranges } = useMemo(
    () =>
      buildRows(controller.model as BoardModel<unknown>, hasLanes, collapsedLanes, collapsedColumns, {
        getItemId: props.getItemId,
        hasFooter: props.renderColumnFooter != null,
        placement,
      }),
    [
      collapsedColumns,
      collapsedLanes,
      controller.model,
      hasLanes,
      placement,
      props.getItemId,
      props.renderColumnFooter,
    ],
  );
  const live = useRef<StackedLive>({ board, rows, ranges, top: frame.top, height: frame.height });
  live.current = { board, rows, ranges, top: frame.top, height: frame.height };

  const scroller = useMemo<ScrollerHandle>(
    () => ({
      axis: 'y',
      getOffset: () => scrollY.current,
      getMaxOffset: () => Math.max(0, contentHeight.current - live.current.height),
      getViewport: () => ({ start: live.current.top, size: live.current.height }),
      scrollTo(offset) {
        scrollY.current = offset;
        listRef.current?.scrollToOffset({ offset, animated: false });
      },
    }),
    [],
  );
  adapter.useScroller('vertical', autoScroll ? scroller : null);

  const geometries = useRef(new Map<string, CellGeometry>());
  const geometryFor = (cellId: string) => {
    let found = geometries.current.get(cellId);
    if (!found) {
      found = stackedGeometry(cellId, live, listRef, scrollY, scroller);
      geometries.current.set(cellId, found);
    }
    return found;
  };

  useEffect(() => {
    const scrollToRow = (row: number, animated: boolean) => {
      if (row >= 0) listRef.current?.scrollToIndex({ index: row, animated, viewPosition: 0.2 });
    };
    scrollApi.current = {
      toColumn(columnId, animated) {
        const cell = live.current.board.controller.model.cells.find((entry) => entry.columnKey === columnId);
        const range = cell ? live.current.ranges.get(cell.cellId) : undefined;
        if (range) scrollToRow(range.header, animated);
      },
      toItem(itemId, animated) {
        const row = live.current.rows.findIndex((entry) => entry.kind === 'card' && entry.itemId === itemId);
        scrollToRow(row, animated);
      },
    };
    return () => {
      scrollApi.current = null;
    };
  }, [scrollApi]);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { y, height } = event.nativeEvent.layout;
    setFrame((previous) => (previous.top === y && previous.height === height ? previous : { top: y, height }));
  }, []);
  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollY.current = event.nativeEvent.contentOffset.y;
  }, []);
  const onContentSizeChange = useCallback((_width: number, height: number) => {
    contentHeight.current = height;
  }, []);
  const lastColumnId = controller.model.columns.at(-1)?.id;
  const onEndReached = board.props.onEndReached;
  const endAt = useRef(0);
  const notifyEnd = useCallback(() => {
    if (!lastColumnId) return;
    const now = Date.now();
    if (now - endAt.current < 400) return;
    endAt.current = now;
    onEndReached?.(lastColumnId);
  }, [lastColumnId, onEndReached]);
  const renderRow = useCallback(({ item }: ListRenderItemInfo<Row>) => <StackedRow row={item} />, []);

  return (
    <View style={styles.fill} onLayout={onLayout}>
      <View style={styles.registry} pointerEvents="none">
        {[...ranges.keys()].map((cellId) => (
          <adapter.Cell key={cellId} cellId={cellId} geometry={geometryFor(cellId)} />
        ))}
      </View>
      {frame.height > 0 ? (
        <FlashList
          ref={listRef}
          data={rows}
          keyExtractor={rowKey}
          getItemType={rowType}
          renderItem={renderRow}
          extraData={[controller.model, board.theme, controller.isPending]}
          onScroll={onScroll}
          scrollEventThrottle={16}
          onContentSizeChange={onContentSizeChange}
          onEndReached={onEndReached ? notifyEnd : undefined}
          onEndReachedThreshold={0}
          ListFooterComponent={
            loadingColumns.size > 0 ? <LoadingFooter theme={board.theme} label={board.labels.loadingMore} /> : null
          }
          onRefresh={props.onRefresh}
          refreshing={props.onRefresh ? props.refreshing === true : undefined}
          contentContainerStyle={{ paddingTop: board.theme.columnGap, paddingBottom: 48 }}
          maintainVisibleContentPosition={NO_ANCHORING}
          showsVerticalScrollIndicator={false}
        />
      ) : null}
    </View>
  );
}

const NO_ANCHORING = { disabled: true };
const rowKey = (row: Row) => row.key;
const rowType = (row: Row) => row.kind;

const StackedRow = memo(function StackedRow({ row }: { row: Row }) {
  if (row.kind === 'lane') return <LaneHeaderRow row={row} />;
  if (row.kind === 'section') return <SectionHeaderRow row={row} />;
  return <BodyRow row={row} />;
});

function LaneHeaderRow({ row }: { row: Extract<Row, { kind: 'lane' }> }) {
  const { theme, labels, props, toggleLane } = useBoard();
  const info = {
    lane: row.lane,
    count: row.count,
    collapsed: row.collapsed,
    toggleCollapsed: () => toggleLane(row.lane.id),
  };
  return (
    <View style={[styles.laneRow, { marginHorizontal: theme.columnGap }]}>
      {props.renderLaneHeader ? (
        props.renderLaneHeader(info)
      ) : (
        <DefaultLaneHeader info={info} theme={theme} labels={labels} />
      )}
    </View>
  );
}

function sectionStyle(theme: BoardContextValue['theme']) {
  return {
    marginHorizontal: theme.columnGap,
    backgroundColor: theme.columnBackground,
    paddingHorizontal: theme.cellPadding,
  };
}

function closingStyle(theme: BoardContextValue['theme']) {
  return {
    borderBottomLeftRadius: theme.radius,
    borderBottomRightRadius: theme.radius,
    marginBottom: SECTION_SPACING,
    paddingBottom: Math.max(0, theme.cellPadding - theme.cardGap) + CLOSING_PAD,
  };
}

function SectionHeaderRow({ row }: { row: Extract<Row, { kind: 'section' }> }) {
  const { theme, labels, props, controller, toggleColumn, canCollapseColumns, columnTotal } = useBoard();
  const cell = controller.model.cellById.get(row.cellId);
  if (!cell) return null;
  const hasLanes = props.groupBy.lanes != null;
  const info = {
    column: cell.column,
    count: cell.items.length,
    // A lane section holds part of a column, so the column total belongs to boards without lanes.
    total: hasLanes ? cell.items.length : columnTotal(cell.columnKey, cell.items.length),
    collapsed: row.collapsed,
    compact: false,
    toggleCollapsed: canCollapseColumns ? () => toggleColumn(cell.columnKey) : undefined,
  };
  return (
    <View
      style={[
        sectionStyle(theme),
        styles.section,
        { borderTopLeftRadius: theme.radius, borderTopRightRadius: theme.radius, paddingHorizontal: 0 },
        row.last ? { ...closingStyle(theme), paddingBottom: 0 } : null,
      ]}
    >
      {props.renderColumnHeader ? (
        props.renderColumnHeader(info)
      ) : (
        <DefaultColumnHeader info={info} theme={theme} labels={labels} />
      )}
    </View>
  );
}

function BodyRow({ row }: { row: Exclude<Row, { kind: 'lane' } | { kind: 'section' }> }) {
  const { theme, labels, props, controller, adapter, loadingColumns } = useBoard();
  const cell = controller.model.cellById.get(row.cellId);
  if (!cell) return null;
  const closes = row.kind === 'footer' || row.last;
  const frame = [sectionStyle(theme), closes ? closingStyle(theme) : null];

  if (row.kind === 'card') {
    return (
      <View style={frame}>
        <BoardCard
          itemId={row.itemId}
          cellId={row.cellId}
          index={controller.model.locations.get(row.itemId)?.index ?? 0}
          count={cell.items.length}
          pending={controller.isPending(row.itemId)}
        />
      </View>
    );
  }
  const lane = cell.laneKey === NO_LANE_ID ? null : cell.lane;
  if (row.kind === 'footer') {
    return (
      <View style={frame}>
        {props.renderColumnFooter?.({
          column: cell.column,
          lane,
          count: cell.items.length,
          loading: loadingColumns.has(cell.columnKey),
        })}
      </View>
    );
  }
  return (
    <View style={frame}>
      <View style={{ paddingBottom: theme.cardGap }}>
        {row.kind === 'placeholder' ? (
          <adapter.Placeholder
            height={row.height}
            radius={theme.cardRadius}
            color={theme.accent}
            render={props.renderDropIndicator}
          />
        ) : props.renderEmptyCell ? (
          props.renderEmptyCell({ column: cell.column, lane })
        ) : (
          <DefaultEmptyCell theme={theme} labels={labels} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  registry: { position: 'absolute', width: 0, height: 0, overflow: 'hidden' },
  laneRow: { marginBottom: 10 },
  section: { overflow: 'hidden' },
});
