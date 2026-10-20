import { memo, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  AccessibilityInfo,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type AccessibilityActionEvent,
  type LayoutChangeEvent,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { cellId as makeCellId, parseCellId, type BoardCell, type GroupValue } from 'board-view-core';
import { useBoard, useCard } from '../context';
import { MenuButton } from './defaults';
import { MiniCard } from './Overview';
import { SwipeActions, type SwipeAction } from './SwipeActions';
import type { CardRenderInfo } from '../types';

const MOVE_TO = 'moveTo';
const SELECT = 'select';
/** Cards narrower than this get `compact` render info and no "…" button. */
const COMPACT_CARD_WIDTH = 200;

const COLUMN_PREFIX = 'c:';
const LANE_PREFIX = 'l:';
const ACTION_PREFIX = 'a:';

const NO_FULL_COLUMNS: ReadonlySet<string> = new Set();
const noFullColumns = () => NO_FULL_COLUMNS;

export interface BoardCardProps {
  itemId: string;
  /** The card's item. A prop, so a card redraws when its own item changes and not when another card moves. */
  item: unknown;
  cellId: string;
  column: GroupValue;
  /** Null outside swimlanes. */
  lane: GroupValue | null;
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
  item,
  cellId,
  column,
  lane,
  index,
  count,
  pending,
  onSlotLayout,
}: BoardCardProps) {
  const card = useCard();
  const { theme, labels, adapter, openMoveSheet, sheetMode, rtl, overview, hasLanes } = card;
  const { allColumns, allLanes, runCardAction, moveItem, allows } = card;
  const { laneKey, columnKey } = parseCellId(cellId);

  const openSheet = useCallback(() => openMoveSheet(itemId), [openMoveSheet, itemId]);

  // After a move from the sheet or a screen-reader action, focus follows the card to its new place.
  const accessibleRef = useRef<View>(null);
  const { focusRequest } = card;
  const focused = useSyncExternalStore(
    focusRequest.subscribe,
    () => focusRequest.get() === itemId,
    () => false,
  );
  const { highlight, externalMoves, selection } = card;
  const highlighted = useSyncExternalStore(
    highlight.subscribe,
    () => {
      const request = highlight.get();
      return request?.itemId === itemId ? request : null;
    },
    () => null,
  );
  const flashed = useSyncExternalStore(
    externalMoves.subscribe,
    () => externalMoves.get().get(itemId) ?? null,
    () => null,
  );
  const selected = useSyncExternalStore(
    selection.subscribe,
    () => selection.get().has(itemId),
    () => false,
  );
  const selecting = useSyncExternalStore(
    selection.subscribe,
    () => selection.get().size > 0,
    () => false,
  );
  const { toggleSelected: toggle } = card;
  const toggleSelected = useCallback(() => toggle(itemId), [toggle, itemId]);
  // Pointer hover (iPad, Android with a mouse, ChromeOS): a quiet outline.
  const [hovered, setHovered] = useState(false);
  const onPointerEnter = useCallback(() => setHovered(true), []);
  const onPointerLeave = useCallback(() => setHovered(false), []);

  useEffect(() => {
    if (!focused) return;
    const frame = requestAnimationFrame(() => {
      if (accessibleRef.current) AccessibilityInfo.sendAccessibilityEvent(accessibleRef.current, 'focus');
      focusRequest.set(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [focusRequest, focused]);

  // Full columns matter only to the screen-reader actions and the swipe targets; other cards ignore them.
  const { accessibilityActions, swipeEnabled, fullColumns: fullStore, actionsFor, selectable } = card;
  const fullColumns = useSyncExternalStore(
    fullStore.subscribe,
    accessibilityActions || swipeEnabled ? fullStore.get : noFullColumns,
    noFullColumns,
  );
  const appActions = actionsFor(item);
  const actions = useMemo(() => {
    const list: { name: string; label: string }[] = [];
    if (!accessibilityActions) return list;
    if (sheetMode !== false) list.push({ name: MOVE_TO, label: labels.moveTo });
    if (selectable) list.push({ name: SELECT, label: selected ? labels.deselect : labels.select });
    for (const target of allColumns) {
      if (target.id === columnKey) continue;
      if (!allows(item, columnKey, makeCellId(laneKey, target.id), fullColumns)) continue;
      list.push({ name: COLUMN_PREFIX + target.id, label: labels.moveToColumnAction(target.label) });
    }
    if (hasLanes) {
      for (const target of allLanes) {
        if (target.id === laneKey) continue;
        if (!allows(item, columnKey, makeCellId(target.id, columnKey), fullColumns)) continue;
        list.push({ name: LANE_PREFIX + target.id, label: labels.moveToLaneAction(target.label) });
      }
    }
    for (const action of appActions) list.push({ name: ACTION_PREFIX + action.key, label: action.label });
    return list;
  }, [
    accessibilityActions,
    allColumns,
    allLanes,
    allows,
    appActions,
    columnKey,
    fullColumns,
    hasLanes,
    item,
    labels,
    laneKey,
    selectable,
    selected,
    sheetMode,
  ]);

  const onAccessibilityAction = useCallback(
    (event: AccessibilityActionEvent) => {
      const name = event.nativeEvent.actionName;
      // The card may land in a column that is not mounted (a paged board): bring it on screen so focus can follow.
      const reveal = (moved: boolean) => {
        if (moved) requestAnimationFrame(() => card.scrollApi.current?.toItem(itemId, !card.reducedMotion));
      };
      if (name === MOVE_TO) openSheet();
      else if (name === SELECT) toggleSelected();
      else if (name.startsWith(COLUMN_PREFIX))
        reveal(moveItem(itemId, makeCellId(laneKey, name.slice(2)), 0, 'accessibility'));
      else if (name.startsWith(LANE_PREFIX))
        reveal(moveItem(itemId, makeCellId(name.slice(2), columnKey), 0, 'accessibility'));
      else if (name.startsWith(ACTION_PREFIX)) runCardAction(itemId, name.slice(2), 'accessibility');
    },
    [card, columnKey, itemId, laneKey, moveItem, openSheet, runCardAction, toggleSelected],
  );

  const { columns, canDrag } = card;
  const swipe = useMemo(() => {
    if (!swipeEnabled || (canDrag && !canDrag(item))) return null;
    const at = columns.findIndex((entry) => entry.id === columnKey);
    const neighbour = (step: number): SwipeAction | undefined => {
      const next = columns[at + step];
      const target = next ? makeCellId(laneKey, next.id) : null;
      if (!next || !target || !allows(item, columnKey, target, fullColumns)) return undefined;
      return { label: next.label, run: () => moveItem(itemId, target, 0, 'swipe') };
    };
    // Visual right is the next column, or the previous one right-to-left.
    return { toRight: neighbour(rtl ? -1 : 1), toLeft: neighbour(rtl ? 1 : -1) };
  }, [allows, canDrag, columnKey, columns, fullColumns, item, itemId, laneKey, moveItem, rtl, swipeEnabled]);

  const gap = useMemo(() => ({ paddingBottom: theme.cardGap }), [theme.cardGap]);
  const onLayout = useMemo(
    () =>
      onSlotLayout
        ? (event: LayoutChangeEvent) =>
            onSlotLayout(itemId, event.nativeEvent.layout.y, event.nativeEvent.layout.height)
        : undefined,
    [itemId, onSlotLayout],
  );

  const compact = card.cardWidth(columnKey) < COMPACT_CARD_WIDTH;
  const described = card.describeCard(item);
  const label = card.getItemLabel ? card.getItemLabel(item) : itemId;
  const info: CardRenderInfo<unknown> = {
    item,
    cellId,
    index,
    count,
    column,
    lane,
    pending,
    dragging: false,
    compact,
    ...described,
    selected,
    selecting,
    highlighted: highlighted != null || flashed != null,
    hovered,
    dragCount: 0,
    openMoveSheet: openSheet,
    toggleSelected,
  };
  const marks = card.cardMarks === 'auto';

  const content = (
    <View
      ref={accessibleRef}
      accessible
      accessibilityLabel={labels.card({
        item: label,
        column: column.label,
        lane: lane?.label ?? null,
        position: index + 1,
        count,
        pending,
        dimmed: described.dimmed,
        staleDays: described.stale ? Math.round(described.age ?? 0) : null,
        selected,
      })}
      accessibilityState={selecting ? { selected } : undefined}
      accessibilityActions={actions}
      onAccessibilityAction={onAccessibilityAction}
      // A hardware keyboard on Android reaches each card with Tab and the arrows.
      focusable={Platform.OS === 'android'}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      {overview ? <MiniCard label={label} color={column.color} theme={theme} /> : card.renderCard(info)}
      {sheetMode === 'auto' && !compact && !overview ? (
        <MenuButton color={theme.mutedText} onPress={openSheet} />
      ) : null}
      {marks && described.dimmed ? (
        // A veil in the column's color, not opacity: opacity on a card with an Android elevation shadow draws a grey halo.
        <View
          pointerEvents="none"
          style={[styles.veil, { backgroundColor: theme.columnBackground, borderRadius: theme.cardRadius }]}
        />
      ) : null}
      {marks && (highlighted || flashed) ? (
        <HighlightRing
          request={highlighted ?? flashed!}
          color={theme.accent}
          radius={theme.cardRadius}
          reducedMotion={card.reducedMotion}
        />
      ) : null}
      {marks && hovered && !selected && !overview ? (
        <View
          pointerEvents="none"
          style={[
            styles.ring,
            styles.hoverRing,
            { borderColor: theme.accent, borderRadius: theme.cardRadius + RING_OUTSET },
          ]}
        />
      ) : null}
      {marks && selected ? <SelectedMark itemId={itemId} /> : null}
      {selecting && !overview ? (
        // While selecting, a tap picks the card instead of reaching the card's own onPress.
        <Pressable
          onPress={toggleSelected}
          style={styles.cover}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
      ) : null}
    </View>
  );

  return (
    <adapter.Card itemId={itemId} cellId={cellId} index={index} style={gap} onLayout={onLayout}>
      {swipe && (swipe.toLeft || swipe.toRight) ? (
        <SwipeActions
          toLeft={swipe.toLeft}
          toRight={swipe.toRight}
          blocks={card.horizontalScrollGesture}
          theme={theme}
          reducedMotion={card.reducedMotion}
        >
          {content}
        </SwipeActions>
      ) : (
        content
      )}
    </adapter.Card>
  );
});

const RING_OUTSET = 3;

/** The outline `scrollToItem({ highlight: true })` flashes on a card. Opacity only, so it never moves layout. */
function HighlightRing({
  request,
  color,
  radius,
  reducedMotion,
}: {
  request: object;
  color: string;
  radius: number;
  reducedMotion: boolean;
}) {
  const opacity = useSharedValue(reducedMotion ? 1 : 0);
  useEffect(() => {
    if (reducedMotion) {
      opacity.value = 1;
      return;
    }
    opacity.value = 0;
    opacity.value = withSequence(
      withTiming(1, { duration: 160 }),
      withTiming(0.3, { duration: 280 }),
      withTiming(1, { duration: 280 }),
      withDelay(560, withTiming(0, { duration: 320 })),
    );
  }, [opacity, reducedMotion, request]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.ring, { borderColor: color, borderRadius: radius + RING_OUTSET }, style]}
    />
  );
}

/** The lifted copy rendered in the drag overlay. Not interactive and hidden from screen readers. */
export function HoverCard({ itemId }: { itemId: string }) {
  const board = useBoard();
  const { controller, theme, selection } = board;
  const selected = useSyncExternalStore(selection.subscribe, selection.get, selection.get);
  const item = controller.itemsById.get(itemId);
  const location = controller.model.locations.get(itemId);
  const cell = location ? controller.model.cellById.get(location.cellId) : undefined;
  if (item == null || !cell || !location) return null;
  // A selected card carries the selection, except cards that cannot be dragged: a card edge peeks out
  // behind it, and a badge counts them.
  const { canDrag } = board.props;
  const carried =
    selected.size > 1 && selected.has(itemId)
      ? [...selected].filter((id) => {
          if (id === itemId) return true;
          const other = controller.itemsById.get(id);
          return other != null && (!canDrag || canDrag(other));
        })
      : null;
  const dragCount = carried ? carried.length : 1;
  const stack = dragCount > 1 && board.props.cardMarks !== 'manual';
  return (
    <View>
      {stack ? (
        <View
          pointerEvents="none"
          style={[
            styles.stackEdge,
            { backgroundColor: theme.cardBackground, borderColor: theme.cardBorder, borderRadius: theme.cardRadius },
          ]}
        />
      ) : null}
      <HoverBody itemId={itemId} item={item} cell={cell} index={location.index} dragCount={dragCount} />
      {stack ? (
        <View pointerEvents="none" style={[styles.stackBadge, { backgroundColor: theme.accent }]}>
          <Text style={[styles.stackCount, { color: theme.cardBackground }]}>{dragCount}</Text>
        </View>
      ) : null}
    </View>
  );
}

/**
 * The check on a selected card. During a drag of the selection, the cards
 * riding along fade, so the board shows they are on the move.
 */
function SelectedMark({ itemId }: { itemId: string }) {
  const { theme, adapter, selection } = useCard();
  const source = adapter.useDragSource();
  const riding = source != null && source.itemId !== itemId && selection.get().has(source.itemId);
  return (
    <>
      <View
        pointerEvents="none"
        style={[
          styles.ring,
          styles.selectedRing,
          { borderColor: theme.accent, borderRadius: theme.cardRadius + RING_OUTSET },
        ]}
      />
      <View
        pointerEvents="none"
        style={[styles.check, { backgroundColor: theme.accent, borderColor: theme.cardBackground }]}
      >
        <View style={[styles.checkMark, { borderColor: theme.cardBackground }]} />
      </View>
      {riding ? (
        <View
          pointerEvents="none"
          style={[styles.veil, { backgroundColor: theme.columnBackground, borderRadius: theme.cardRadius }]}
        />
      ) : null}
    </>
  );
}

function HoverBody({
  itemId,
  item,
  cell,
  index,
  dragCount,
}: {
  itemId: string;
  item: unknown;
  cell: BoardCell<unknown>;
  index: number;
  dragCount: number;
}) {
  const board = useBoard();
  const { cardWidth } = useCard();
  const { controller, props } = board;
  if (board.overview) {
    return (
      <View style={styles.hover} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <MiniCard label={controller.itemLabel(itemId)} color={cell.column.color} theme={board.theme} />
      </View>
    );
  }
  return (
    <View style={styles.hover} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      {props.renderCard({
        item,
        cellId: cell.cellId,
        index,
        count: cell.items.length,
        column: cell.column,
        lane: props.groupBy.lanes ? cell.lane : null,
        pending: controller.isPending(itemId),
        dragging: true,
        compact: cardWidth(cell.columnKey) < COMPACT_CARD_WIDTH,
        ...board.describeCard(item),
        dimmed: false,
        selected: board.selection.get().has(itemId),
        selecting: board.selection.get().size > 0,
        highlighted: false,
        hovered: false,
        dragCount,
        openMoveSheet: () => undefined,
        toggleSelected: () => undefined,
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  hover: { width: '100%' },
  cover: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  hoverRing: { opacity: 0.35, borderWidth: 2 },
  selectedRing: { borderWidth: 2.5 },
  check: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkMark: {
    width: 10,
    height: 6,
    marginTop: -2,
    borderLeftWidth: 2.5,
    borderBottomWidth: 2.5,
    transform: [{ rotate: '-45deg' }],
  },
  stackEdge: {
    position: 'absolute',
    top: 6,
    left: 6,
    right: -6,
    bottom: -6,
    borderWidth: StyleSheet.hairlineWidth,
    opacity: 0.9,
  },
  stackBadge: {
    position: 'absolute',
    top: -10,
    right: -10,
    minWidth: 28,
    height: 28,
    paddingHorizontal: 7,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stackCount: { fontSize: 14, fontWeight: '800', fontVariant: ['tabular-nums'] },
  // Out of the spotlight: still there, still movable, but quiet.
  veil: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.68 },
  ring: {
    position: 'absolute',
    top: -RING_OUTSET,
    left: -RING_OUTSET,
    right: -RING_OUTSET,
    bottom: -RING_OUTSET,
    borderWidth: 3,
  },
});
