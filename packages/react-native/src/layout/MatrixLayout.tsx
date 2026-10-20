import { Fragment, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { cellId as makeCellId } from 'board-view-core';
import { useBoard } from '../context';
import { COMPACT_HEADER_WIDTH, ColumnList, type ListApi } from './ColumnsLayout';
import { DefaultColumnHeader } from './defaults';
import { MATRIX_GUTTER, visualSlot } from './metrics';

/** Minimum height of a matrix cell's list, so a crowded grid still shows a card or two. */
export const MIN_CELL = 96;
/** Height the column headers take, for deciding before layout whether the lanes fit. */
export const MATRIX_HEADER_ESTIMATE = 56;

/** Whether every lane gets at least `MIN_CELL` of height; the board draws swimlanes when they do not. */
export function matrixFits(lanes: number, height: number, gap: number): boolean {
  return MATRIX_HEADER_ESTIMATE + gap + Math.max(1, lanes) * (MIN_CELL + gap) <= height;
}

/**
 * Swimlane boards as a grid: lanes are rows, columns are columns, and every
 * cell is on screen. Each cell is the same FlashList a column uses, so drag,
 * auto-scroll and the placeholder behave the same. Built for small grids,
 * such as a 2 × 2 priority matrix; it never scrolls as a whole.
 */
export function MatrixLayout() {
  const board = useBoard();
  const { metrics, controller, boardHeight, theme, rtl, scrollApi, labels } = board;
  const columns = controller.model.columns;
  const lanes = controller.model.lanes;
  const lists = useRef(new Map<string, ListApi>());
  const pendingReveal = useRef(new Map<string, number>());
  // Every lane's cell of a column reaches its end together: the column reports it once.
  const endTimes = useRef(new Map<string, number>());
  const [headerHeight, setHeaderHeight] = useState(0);
  const onHeaderLayout = (event: LayoutChangeEvent) => setHeaderHeight(event.nativeEvent.layout.height);
  const live = useRef(controller);
  live.current = controller;

  useEffect(() => {
    scrollApi.current = {
      toColumn: () => undefined,
      toItem(itemId, animated) {
        const location = live.current.model.locations.get(itemId);
        if (location) lists.current.get(location.cellId)?.scrollToIndex(location.index, animated);
      },
    };
    return () => {
      scrollApi.current = null;
    };
  }, [scrollApi]);

  const gap = metrics.gap;
  const rows = Math.max(1, lanes.length);
  const rowHeight = Math.max(MIN_CELL, (boardHeight - headerHeight - gap * (rows + 1)) / rows);
  const font = theme.fontFamily ? { fontFamily: theme.fontFamily } : null;

  return (
    <View style={styles.fill}>
      <View
        style={[styles.headers, { paddingTop: gap, paddingLeft: MATRIX_GUTTER, gap, direction: 'ltr' }]}
        onLayout={onHeaderLayout}
      >
        {metrics.slots.map((slot, visual) => {
          const column = columns[visualSlot(visual, columns.length, rtl)];
          if (!column) return null;
          const count = lanes.reduce(
            (sum, lane) => sum + (controller.model.cellById.get(makeCellId(lane.id, column.id))?.items.length ?? 0),
            0,
          );
          const total = board.columnTotal(column.id, count);
          // The same header as every other layout: custom renderers, limits, sums and the column sheet.
          const info = {
            column,
            count,
            total,
            collapsed: false,
            compact: slot.width < COMPACT_HEADER_WIDTH,
            openColumnSheet: board.headerSheet('column', column.id),
            ...board.describeColumn(column.id, total),
          };
          return (
            <View key={column.id} style={{ width: slot.width }}>
              {board.props.renderColumnHeader ? (
                board.props.renderColumnHeader(info)
              ) : (
                <DefaultColumnHeader info={info} theme={theme} labels={labels} />
              )}
            </View>
          );
        })}
      </View>
      {headerHeight > 0
        ? lanes.map((lane, row) => {
            const top = headerHeight + gap + row * (rowHeight + gap);
            // A fragment, not a view: cells are placed against the layout's own top.
            return (
              <Fragment key={lane.id}>
                <View
                  accessible
                  accessibilityRole="header"
                  accessibilityLabel={lane.label}
                  style={[styles.gutter, { top, height: rowHeight, width: MATRIX_GUTTER }]}
                >
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.laneText,
                      { color: theme.mutedText, width: rowHeight, transform: [{ rotate: '-90deg' }] },
                      font,
                    ]}
                  >
                    {lane.label}
                  </Text>
                </View>
                {metrics.slots.map((slot, visual) => {
                  const column = columns[visualSlot(visual, columns.length, rtl)];
                  const cell = column ? controller.model.cellById.get(makeCellId(lane.id, column.id)) : undefined;
                  if (!cell) return null;
                  return (
                    <View
                      key={cell.cellId}
                      accessibilityLabel={`${lane.label}, ${cell.column.label}`}
                      style={[
                        styles.cell,
                        {
                          left: slot.x,
                          top,
                          width: slot.width,
                          height: rowHeight,
                          backgroundColor: theme.columnBackground,
                          borderColor: theme.columnBorder,
                          borderRadius: theme.radius,
                        },
                      ]}
                    >
                      <ColumnList
                        cell={cell}
                        slot={slot}
                        listTop={top}
                        listHeight={rowHeight}
                        onScreen
                        loading={board.loadingColumns.has(cell.columnKey)}
                        getScrollX={zero}
                        lists={lists}
                        pendingReveal={pendingReveal}
                        endTimes={endTimes}
                      />
                    </View>
                  );
                })}
              </Fragment>
            );
          })
        : null}
      {lanes.length === 0 ? (
        <Text style={[styles.none, { color: theme.mutedText }, font]}>{labels.emptyCell}</Text>
      ) : null}
    </View>
  );
}

const zero = () => 0;

const styles = StyleSheet.create({
  fill: { flex: 1 },
  headers: { flexDirection: 'row', alignItems: 'flex-end' },
  gutter: { position: 'absolute', left: 0, alignItems: 'center', justifyContent: 'center', overflow: 'visible' },
  laneText: { fontSize: 12, fontWeight: '800', textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.6 },
  cell: { position: 'absolute', overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  none: { textAlign: 'center', marginTop: 40 },
});
