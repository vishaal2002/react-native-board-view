import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { AccessibilityInfo } from 'react-native';
import {
  NO_VALUE_ID,
  createMoveQueue,
  parseCellId,
  planMove,
  projectBoard,
  readAxisValue,
  readItemSnapshot,
  type BoardModel,
  type GroupAxis,
  type GroupBy,
  type MoveQueueEvent,
} from 'board-view-core';
import type { BoardLabels, BoardProps, MoveTarget } from './types';

export interface BoardController<T> {
  readonly model: BoardModel<T>;
  readonly itemsById: ReadonlyMap<string, T>;
  isPending(itemId: string): boolean;
  /** Plans and queues a move. Returns false when nothing changes or the target refuses the card. */
  moveItem(itemId: string, toCellId: string, toIndex: number): boolean;
  canDropTo(itemId: string, cellId: string): boolean;
  itemLabel(itemId: string): string;
}

const defaultGetRank = (item: unknown): string => {
  const rank = (item as { rank?: unknown } | null)?.rank;
  if (typeof rank !== 'string')
    throw new Error('react-native-board-view: pass getRank, or give items a string `rank`.');
  return rank;
};

export function moveTargetOf(cellId: string): MoveTarget {
  const { laneKey, columnKey } = parseCellId(cellId);
  return { cellId, columnId: columnKey, laneId: laneKey === '_' ? null : laneKey };
}

function bucketLabel<T>(axis: GroupAxis<T> | undefined, value: string | null, noValue: string): string | null {
  if (!axis) return null;
  if (value == null || value === NO_VALUE_ID) return noValue;
  return axis.values.find((entry) => entry.id === value)?.label ?? noValue;
}

function announce(message: string): void {
  AccessibilityInfo.announceForAccessibility(message);
}

export function useBoardController<T>(props: BoardProps<T>, labels: BoardLabels): BoardController<T> {
  const { items, getItemId, groupBy, rankStrategy } = props;
  const getRank = (props.getRank ?? defaultGetRank) as (item: T) => string;
  const latest = useRef({ props, labels, getRank });
  latest.current = { props, labels, getRank };

  const itemsById = useMemo(() => {
    const map = new Map<string, T>();
    for (const item of items) map.set(getItemId(item), item);
    return map;
  }, [items, getItemId]);
  const itemsRef = useRef(itemsById);
  itemsRef.current = itemsById;

  const itemLabel = useCallback((itemId: string) => {
    const item = itemsRef.current.get(itemId);
    const getLabel = latest.current.props.getItemLabel;
    return item != null && getLabel ? getLabel(item) : itemId;
  }, []);

  const onEvent = useCallback(
    (event: MoveQueueEvent) => {
      if (event.type !== 'rejected') return;
      const item = itemsRef.current.get(event.op.id);
      const { props: current, labels: text } = latest.current;
      const axes: GroupBy<T> = current.groupBy;
      if (item == null) return;
      announce(
        text.moveFailed({
          item: itemLabel(event.op.id),
          column: bucketLabel(axes.columns, readAxisValue(axes.columns, item), text.noValue) ?? '',
          lane: bucketLabel(axes.lanes, axes.lanes ? readAxisValue(axes.lanes, item) : null, text.noValue),
        }),
      );
    },
    [itemLabel],
  );

  // One queue for the board's lifetime. It reads `items` and `onMove`
  // through refs, so it always sees the latest props.
  const [queue] = useState(() =>
    createMoveQueue({
      onMove: (op) => latest.current.props.onMove(op),
      readItem: (itemId) => {
        const item = itemsRef.current.get(itemId);
        const current = latest.current;
        return item == null ? null : readItemSnapshot(item, current.props.groupBy, current.getRank);
      },
      onEvent: (event) => onEvent(event),
      settleTimeoutMs: props.settleTimeoutMs,
    }),
  );
  const snapshot = useSyncExternalStore(queue.subscribe, queue.getSnapshot, queue.getSnapshot);

  useEffect(() => {
    queue.reconcile();
  }, [queue, itemsById]);

  const model = useMemo(
    () =>
      projectBoard({
        items,
        getItemId,
        getRank,
        groupBy,
        overlays: snapshot.overlays,
        strategy: rankStrategy,
        noValueLabel: labels.noValue,
      }),
    [items, getItemId, getRank, groupBy, snapshot.overlays, rankStrategy, labels.noValue],
  );
  const modelRef = useRef(model);
  modelRef.current = model;

  const pendingIds = useMemo(() => new Set(snapshot.overlays.map((op) => op.id)), [snapshot.overlays]);

  const canDropTo = useCallback((itemId: string, cellId: string) => {
    const item = itemsRef.current.get(itemId);
    const canDrop = latest.current.props.canDrop;
    if (item == null) return false;
    return canDrop ? canDrop(item, moveTargetOf(cellId)) : true;
  }, []);

  const moveItem = useCallback(
    (itemId: string, toCellId: string, toIndex: number) => {
      const item = itemsRef.current.get(itemId);
      const current = modelRef.current;
      const target = current.cellById.get(toCellId);
      if (item == null || !target || !canDropTo(itemId, toCellId)) return false;
      const { props: currentProps, labels: text } = latest.current;
      const op = planMove({
        model: current,
        groupBy: currentProps.groupBy,
        item,
        itemId,
        toCellId,
        toIndex,
        overlay: queue.getOverlay(itemId),
        strategy: currentProps.rankStrategy,
      });
      if (!op) return false;
      queue.enqueue(op);
      const sameCell = current.locations.get(itemId)?.cellId === toCellId;
      announce(
        text.moved({
          item: itemLabel(itemId),
          column: target.column.label,
          lane: currentProps.groupBy.lanes ? target.lane.label : null,
          position: toIndex + 1,
          count: target.items.length + (sameCell ? 0 : 1),
        }),
      );
      return true;
    },
    [canDropTo, itemLabel, queue],
  );

  const isPending = useCallback((itemId: string) => pendingIds.has(itemId), [pendingIds]);

  return { model, itemsById, isPending, moveItem, canDropTo, itemLabel };
}
