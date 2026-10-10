import { memo, useCallback, useMemo } from 'react';
import { StyleSheet, View, type AccessibilityActionEvent, type LayoutChangeEvent } from 'react-native';
import { cellId as makeCellId, parseCellId, NO_LANE_ID } from 'board-view-core';
import { useBoard, type BoardContextValue } from '../context';
import { MenuButton } from './defaults';
import { visualSlot } from './metrics';
import { SwipeActions, type SwipeAction } from './SwipeActions';
import type { CardRenderInfo } from '../types';

const MOVE_TO = 'moveTo';
/** Cards narrower than this get `compact` render info and no "…" button. */
const COMPACT_CARD_WIDTH = 200;

/** Width a card gets in its column (or the whole board when stacked). */
function cardWidth(board: BoardContextValue, columnKey: string): number {
  const { metrics, theme, controller, rtl, boardWidth } = board;
  if (metrics.mode === 'stacked') return boardWidth - (theme.columnGap + theme.cellPadding) * 2;
  const columns = controller.model.columns;
  const at = columns.findIndex((column) => column.id === columnKey);
  const slot = at >= 0 ? metrics.slots[visualSlot(at, columns.length, rtl)] : undefined;
  return (slot?.width ?? boardWidth) - theme.cellPadding * 2;
}
const COLUMN_PREFIX = 'c:';
const LANE_PREFIX = 'l:';

export interface BoardCardProps {
  itemId: string;
  cellId: string;
  index: number;
  count: number;
  pending: boolean;
  /** Swimlane cells record card positions themselves; columns read them from FlashList. */
  onSlotLayout?: (itemId: string, top: number, height: number) => void;
}

/**
 * One card: the app's `renderCard` plus everything the board adds around it.
 * The wrapper is a single accessible element whose label carries the card's
 * context and whose custom actions move it without dragging.
 */
export const BoardCard = memo(function BoardCard({
  itemId,
  cellId,
  index,
  count,
  pending,
  onSlotLayout,
}: BoardCardProps) {
  const board = useBoard();
  const { controller, props, theme, labels, adapter, openMoveSheet, sheetMode, rtl } = board;
  const item = controller.itemsById.get(itemId);
  const cell = controller.model.cellById.get(cellId);
  const { laneKey, columnKey } = parseCellId(cellId);
  const hasLanes = props.groupBy.lanes != null;

  const openSheet = useCallback(() => openMoveSheet(itemId), [openMoveSheet, itemId]);

  const actions = useMemo(() => {
    const list: { name: string; label: string }[] = [];
    if (sheetMode !== false) list.push({ name: MOVE_TO, label: labels.moveTo });
    for (const column of controller.model.columns) {
      if (column.id === columnKey) continue;
      if (!controller.canDropTo(itemId, makeCellId(laneKey, column.id))) continue;
      list.push({ name: COLUMN_PREFIX + column.id, label: labels.moveToColumnAction(column.label) });
    }
    if (hasLanes) {
      for (const lane of controller.model.lanes) {
        if (lane.id === laneKey) continue;
        if (!controller.canDropTo(itemId, makeCellId(lane.id, columnKey))) continue;
        list.push({ name: LANE_PREFIX + lane.id, label: labels.moveToLaneAction(lane.label) });
      }
    }
    return list;
  }, [columnKey, controller, hasLanes, itemId, labels, laneKey, sheetMode]);

  const onAccessibilityAction = useCallback(
    (event: AccessibilityActionEvent) => {
      const name = event.nativeEvent.actionName;
      if (name === MOVE_TO) openSheet();
      else if (name.startsWith(COLUMN_PREFIX))
        controller.moveItem(itemId, makeCellId(laneKey, name.slice(2)), 0, 'accessibility');
      else if (name.startsWith(LANE_PREFIX))
        controller.moveItem(itemId, makeCellId(name.slice(2), columnKey), 0, 'accessibility');
    },
    [columnKey, controller, itemId, laneKey, openSheet],
  );

  const swipe = useMemo(() => {
    if (!board.swipeEnabled || item == null || (props.canDrag && !props.canDrag(item))) return null;
    const columns = controller.model.columns;
    const at = columns.findIndex((column) => column.id === columnKey);
    const neighbour = (step: number): SwipeAction | undefined => {
      const column = columns[at + step];
      const target = column ? makeCellId(laneKey, column.id) : null;
      if (!column || !target || !controller.canDropTo(itemId, target)) return undefined;
      return { label: column.label, run: () => controller.moveItem(itemId, target, 0, 'swipe') };
    };
    // Visual right is the next column, or the previous one right-to-left.
    return { toRight: neighbour(rtl ? -1 : 1), toLeft: neighbour(rtl ? 1 : -1) };
  }, [board.swipeEnabled, columnKey, controller, item, itemId, laneKey, props, rtl]);

  const onLayout = useMemo(
    () =>
      onSlotLayout
        ? (event: LayoutChangeEvent) =>
            onSlotLayout(itemId, event.nativeEvent.layout.y, event.nativeEvent.layout.height)
        : undefined,
    [itemId, onSlotLayout],
  );

  if (item == null || !cell) return null;
  const lane = laneKey === NO_LANE_ID ? null : cell.lane;
  const compact = cardWidth(board, columnKey) < COMPACT_CARD_WIDTH;
  const info: CardRenderInfo<unknown> = {
    item,
    cellId,
    index,
    count,
    column: cell.column,
    lane,
    pending,
    dragging: false,
    compact,
    openMoveSheet: openSheet,
  };

  const content = (
    <View
      accessible
      accessibilityLabel={labels.card({
        item: controller.itemLabel(itemId),
        column: cell.column.label,
        lane: lane?.label ?? null,
        position: index + 1,
        count,
        pending,
      })}
      accessibilityActions={actions}
      onAccessibilityAction={onAccessibilityAction}
    >
      {props.renderCard(info)}
      {sheetMode === 'auto' && !compact ? <MenuButton color={theme.mutedText} onPress={openSheet} /> : null}
    </View>
  );

  return (
    <View style={{ paddingBottom: theme.cardGap }} onLayout={onLayout}>
      <adapter.Card itemId={itemId} cellId={cellId} index={index}>
        {swipe && (swipe.toLeft || swipe.toRight) ? (
          <SwipeActions
            toLeft={swipe.toLeft}
            toRight={swipe.toRight}
            blocks={board.horizontalScrollGesture}
            theme={theme}
            reducedMotion={board.reducedMotion}
          >
            {content}
          </SwipeActions>
        ) : (
          content
        )}
      </adapter.Card>
    </View>
  );
});

/** The lifted copy rendered in the drag overlay. Not interactive and hidden from screen readers. */
export function HoverCard({ itemId }: { itemId: string }) {
  const board = useBoard();
  const { controller, props } = board;
  const item = controller.itemsById.get(itemId);
  const location = controller.model.locations.get(itemId);
  const cell = location ? controller.model.cellById.get(location.cellId) : undefined;
  if (item == null || !cell || !location) return null;
  return (
    <View style={styles.hover} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      {props.renderCard({
        item,
        cellId: cell.cellId,
        index: location.index,
        count: cell.items.length,
        column: cell.column,
        lane: props.groupBy.lanes ? cell.lane : null,
        pending: controller.isPending(itemId),
        dragging: true,
        compact: cardWidth(board, cell.columnKey) < COMPACT_CARD_WIDTH,
        openMoveSheet: () => undefined,
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  hover: { width: '100%' },
});
