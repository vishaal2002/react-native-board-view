import { memo, useMemo, useRef } from 'react';
import { StyleSheet, Text, View, type AccessibilityActionEvent } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';
import { NO_LANE_ID, cellId as makeCellId, type BoardCell } from 'board-view-core';
import { useBoard, type BoardContextValue } from '../context';
import type { ColumnSlot } from './metrics';
import { visualSlot } from './metrics';
import { OverviewHeader } from './Overview';
import { DOT, ageGeometry, ageScale, layoutDots, type AgeLive } from './ageing';
import { useHorizontalScroller } from './useHorizontalScroller';

const HEADER = 44;
const SHOW_CARDS = 'showCards';

/** Ages of every card on the board, and the bands drawn across it. */
function useAges(board: BoardContextValue) {
  const { controller, describeCard } = board;
  const bandsOption = typeof board.props.zoom === 'object' ? board.props.zoom.ageBands : undefined;
  return useMemo(() => {
    const ages = new Map<string, number>();
    for (const cell of controller.model.cells) {
      cell.items.forEach((item, index) => {
        const age = describeCard(item, cell.columnKey).age;
        if (age != null) ages.set(cell.ranked[index]!.id, age);
      });
    }
    const { bands, top } = ageScale([...ages.values()], bandsOption);
    return { ages, bands, top };
  }, [bandsOption, controller.model.cells, describeCard]);
}

/**
 * The `dot` level drawn as an ageing chart: a column per column, each card
 * a dot at the height of its age, with percentile bands across the board.
 * Dots drag to other columns like cards do; a drop lands at the top.
 */
export const AgeingLayout = memo(function AgeingLayout() {
  const board = useBoard();
  // The full height, dock or not: dots keep their places while the dock covers the bottom during a drag.
  const { metrics, controller, fullHeight: boardHeight, rtl, horizontalScrollGesture } = board;
  const scroller = useHorizontalScroller();
  const columns = controller.model.columns;
  const { ages, bands, top } = useAges(board);
  const height = Math.max(0, boardHeight - metrics.gap * 2);
  return (
    <GestureDetector gesture={horizontalScrollGesture}>
      <Animated.ScrollView
        ref={scroller.scrollRef as never}
        horizontal
        style={styles.ltr}
        contentContainerStyle={{ width: metrics.contentWidth, height: boardHeight }}
        scrollEnabled={metrics.scrollable}
        showsHorizontalScrollIndicator={false}
        contentOffset={{ x: scroller.initialOffset, y: 0 }}
        onScroll={scroller.onScroll}
        onContentSizeChange={scroller.onContentSizeChange}
        scrollEventThrottle={16}
      >
        {metrics.slots.map((slot, visual) => {
          const column = columns[visualSlot(visual, columns.length, rtl)];
          const cell = column ? controller.model.cellById.get(makeCellId(NO_LANE_ID, column.id)) : undefined;
          if (!cell) return null;
          return (
            <AgeColumn
              key={cell.cellId}
              cell={cell}
              slot={slot}
              top={metrics.gap}
              height={height}
              ages={ages}
              bands={bands}
              ageTop={top}
              labelBands={visual === 0}
              getScrollX={scroller.getOffset}
            />
          );
        })}
      </Animated.ScrollView>
    </GestureDetector>
  );
});

interface AgeColumnProps {
  cell: BoardCell<unknown>;
  slot: ColumnSlot;
  top: number;
  height: number;
  ages: ReadonlyMap<string, number>;
  bands: readonly number[];
  ageTop: number;
  labelBands: boolean;
  getScrollX: () => number;
}

const AgeColumn = memo(function AgeColumn({
  cell,
  slot,
  top,
  height,
  ages,
  bands,
  ageTop,
  labelBands,
  getScrollX,
}: AgeColumnProps) {
  const board = useBoard();
  const { theme, labels, adapter, props, columnTotal } = board;
  const placement = adapter.usePlacement(cell.cellId);
  const chart = { width: slot.width, height: Math.max(0, height - HEADER - theme.cellPadding) };
  const overAge = bands.at(-1) ?? null;
  const getItemColor = props.getItemColor as ((item: unknown) => string | null | undefined) | undefined;
  const dots = useMemo(
    () =>
      layoutDots(
        cell,
        ages,
        ageTop,
        chart,
        (item) => getItemColor?.(item) ?? cell.column.color ?? theme.accent,
        overAge,
      ),
    // `chart` is rebuilt every render; its two numbers are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ageTop, ages, cell, chart.height, chart.width, getItemColor, overAge, theme.accent],
  );
  const live = useRef<AgeLive>({
    board,
    dots,
    slot,
    chartTop: top + HEADER,
    chartHeight: chart.height,
    hidden: placement.hiddenItemId,
    getScrollX,
  });
  live.current = {
    board,
    dots,
    slot,
    chartTop: top + HEADER,
    chartHeight: chart.height,
    hidden: placement.hiddenItemId,
    getScrollX,
  };
  const geometry = useMemo(() => ageGeometry(live), []);
  const total = columnTotal(cell.columnKey, cell.items.length);
  const oldest = dots.reduce<number | null>((max, dot) => (max == null || dot.age > max ? dot.age : max), null);
  const summary = labels.ageColumnSummary({
    column: cell.column.label,
    count: total,
    oldest,
    overBand: dots.filter((dot) => dot.over).length,
  });
  const onAction = (event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === SHOW_CARDS) board.setOverview(false, cell.columnKey);
  };
  const target = placement.placeholderIndex !== null && placement.hiddenItemId == null;
  const scale = (age: number) => chart.height - DOT / 2 - (Math.min(age, ageTop) / ageTop) * (chart.height - DOT);

  return (
    <View
      style={[
        styles.column,
        {
          left: slot.x,
          top,
          width: slot.width,
          height,
          backgroundColor: target ? theme.laneHeaderBackground : theme.columnBackground,
          borderColor: theme.columnBorder,
          borderRadius: theme.radius,
        },
      ]}
      accessible
      accessibilityLabel={summary}
      accessibilityActions={[{ name: SHOW_CARDS, label: labels.showCards }]}
      onAccessibilityAction={onAction}
    >
      <OverviewHeader column={cell.column} count={total} />
      <adapter.Cell cellId={cell.cellId} geometry={geometry} style={{ height: chart.height }}>
        <View
          style={StyleSheet.absoluteFill}
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
        >
          {bands.map((band, index) => (
            <View
              key={band}
              pointerEvents="none"
              style={[
                styles.band,
                {
                  top: scale(band),
                  borderColor: index === bands.length - 1 ? theme.warning : theme.mutedText,
                },
              ]}
            >
              {labelBands ? (
                <Text
                  style={[styles.bandText, { color: index === bands.length - 1 ? theme.warning : theme.mutedText }]}
                >
                  {`${Math.round(band)}d`}
                </Text>
              ) : null}
            </View>
          ))}
          {dots.map((dot) => (
            <adapter.Card
              key={dot.itemId}
              itemId={dot.itemId}
              cellId={cell.cellId}
              index={dot.index}
              style={[styles.dotBox, { left: dot.x, top: dot.y }]}
            >
              <View
                style={[
                  styles.dot,
                  { backgroundColor: dot.color },
                  dot.over ? { borderColor: theme.warning, borderWidth: 2 } : null,
                ]}
              />
            </adapter.Card>
          ))}
        </View>
      </adapter.Cell>
    </View>
  );
});

const styles = StyleSheet.create({
  ltr: { direction: 'ltr' },
  column: { position: 'absolute', borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  band: { position: 'absolute', left: 0, right: 0, height: 0, borderTopWidth: 1, borderStyle: 'dashed' },
  bandText: { position: 'absolute', left: 3, top: -14, fontSize: 9, fontWeight: '800' },
  dotBox: { position: 'absolute', width: DOT, height: DOT },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2 },
});
