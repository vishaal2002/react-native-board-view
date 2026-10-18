import { Fragment, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { cellId as makeCellId } from 'board-view-core';
import { useBoard } from '../context';
import { ColumnList, type ListApi } from './ColumnsLayout';
import { CountPill } from './defaults';
import { MATRIX_GUTTER, visualSlot } from './metrics';

/** Minimum height of a matrix cell's list, so a crowded grid still shows a card or two. */
const MIN_CELL = 96;

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
      <View style={[styles.headers, { paddingTop: gap }]} onLayout={onHeaderLayout}>
        {metrics.slots.map((slot, visual) => {
          const column = columns[visualSlot(visual, columns.length, rtl)];
          if (!column) return null;
          const count = lanes.reduce(
            (sum, lane) => sum + (controller.model.cellById.get(makeCellId(lane.id, column.id))?.items.length ?? 0),
            0,
          );
          return (
            <View
              key={column.id}
              accessibilityRole="header"
              style={[styles.header, { left: slot.x, width: slot.width }]}
            >
              <View style={[styles.dot, { backgroundColor: column.color ?? theme.mutedText }]} />
              <Text style={[styles.headerText, { color: theme.text }, font]} numberOfLines={1}>
                {column.label}
              </Text>
              <CountPill count={board.columnTotal(column.id, count)} theme={theme} />
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
                  accessibilityRole="header"
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
  headers: { height: 44, flexDirection: 'row' },
  header: {
    position: 'absolute',
    bottom: 0,
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 6,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  headerText: { flex: 1, fontSize: 14, fontWeight: '800' },
  gutter: { position: 'absolute', left: 0, alignItems: 'center', justifyContent: 'center', overflow: 'visible' },
  laneText: { fontSize: 12, fontWeight: '800', textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.6 },
  cell: { position: 'absolute', overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  none: { textAlign: 'center', marginTop: 40 },
});
