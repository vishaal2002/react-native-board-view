import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { AccessibilityInfo } from 'react-native';
import {
  NO_LANE_ID,
  NO_VALUE_ID,
  cellId as makeCellId,
  createMoveQueue,
  parseCellId,
  planMove,
  projectBoard,
  readAxisValue,
  readItemSnapshot,
  type BoardModel,
  type GroupAxis,
  type GroupBy,
  type MoveOperation,
  type MoveQueue,
  type MoveQueueEvent,
  type MoveSource,
} from 'board-view-core';
import { createValueStore, type ValueStore } from './context';
import type { BoardLabels, BoardProps, MoveDestination, MoveTarget } from './types';

/** A move the board can revert: where the card came from and where it went. */
export interface UndoEntry {
  readonly opId: string;
  readonly itemId: string;
  readonly fromCellId: string;
  /** Insertion index in the source cell, with the card left out. */
  readonly fromIndex: number;
  readonly toCellId: string;
  readonly source: MoveSource;
}

/** Moves remembered for undo. Older ones are dropped. */
const UNDO_DEPTH = 20;

export interface BoardController<T> {
  readonly model: BoardModel<T>;
  readonly itemsById: ReadonlyMap<string, T>;
  isPending(itemId: string): boolean;
  /**
   * Plans and queues a move. Returns false when nothing changes, the target
   * refuses the card, or the move cannot be planned against the current data.
   */
  moveItem(itemId: string, toCellId: string, toIndex: number, source: MoveSource): boolean;
  /** `moveItem` for the imperative handle: a column, lane and index instead of a cell. */
  moveTo(itemId: string, to: MoveDestination): boolean;
  canDropTo(itemId: string, cellId: string): boolean;
  itemLabel(itemId: string): string;
  /** The card that should take screen-reader focus once it renders in its new place. */
  readonly focusRequest: ValueStore<string | null>;
  /** Reverts the newest move whose card is still where it landed. */
  undo(): boolean;
  canUndo(): boolean;
  /** The newest undoable move, or null once it is undone, rolled back or cancelled. */
  readonly lastMove: ValueStore<UndoEntry | null>;
}

const warned = new Set<string>();

/** Warns once per message in development. */
function warnOnce(message: string): void {
  if (!__DEV__ || warned.has(message)) return;
  warned.add(message);
  console.warn(`react-native-board-view: ${message}`);
}

/** Reads `item.rank`. A missing rank sorts first instead of crashing the render. */
const defaultGetRank = (item: unknown): string => {
  const rank = (item as { rank?: unknown } | null)?.rank;
  if (typeof rank === 'string') return rank;
  warnOnce('an item has no string `rank`. Pass `getRank`, or give every item a rank (see seedRanks).');
  return '';
};

export function moveTargetOf(cellId: string): MoveTarget {
  const { laneKey, columnKey } = parseCellId(cellId);
  return { cellId, columnId: columnKey, laneId: laneKey === NO_LANE_ID ? null : laneKey };
}

function bucketLabel<T>(axis: GroupAxis<T> | undefined, value: string | null, noValue: string): string | null {
  if (!axis) return null;
  if (value == null || value === NO_VALUE_ID) return noValue;
  return axis.values.find((entry) => entry.id === value)?.label ?? noValue;
}

/**
 * The cell and insertion index for a destination, or null when the card or
 * the cell does not exist. Lanes default to the card's lane, and the index is
 * clamped to the cell with the card itself left out.
 */
export function resolveDestination<T>(
  model: BoardModel<T>,
  itemId: string,
  to: MoveDestination,
  hasLanes: boolean,
): { cellId: string; index: number } | null {
  const from = model.locations.get(itemId);
  if (!from) return null;
  const laneKey = hasLanes ? (to.laneId ?? parseCellId(from.cellId).laneKey) : NO_LANE_ID;
  const cellId = makeCellId(laneKey, to.columnId);
  const cell = model.cellById.get(cellId);
  if (!cell) return null;
  const size = cell.items.length - (from.cellId === cellId ? 1 : 0);
  const wanted = to.index === 'end' ? size : Math.trunc(to.index ?? 0);
  return { cellId, index: Math.min(size, Math.max(0, Number.isFinite(wanted) ? wanted : size)) };
}

function announce(message: string): void {
  AccessibilityInfo.announceForAccessibility(message);
}

/** Items with duplicate ids keep the first; the rest would collide as React keys. */
function uniqueById<T>(items: readonly T[], getItemId: (item: T) => string) {
  const byId = new Map<string, T>();
  let duplicates = false;
  for (const item of items) {
    const id = getItemId(item);
    if (byId.has(id)) {
      duplicates = true;
      warnOnce(`duplicate item id "${id}". Only the first item with an id is shown.`);
      continue;
    }
    byId.set(id, item);
  }
  return { byId, unique: duplicates ? [...byId.values()] : items };
}

export function useBoardController<T>(props: BoardProps<T>, labels: BoardLabels): BoardController<T> {
  const { items, getItemId, groupBy, rankStrategy } = props;
  const getRank = (props.getRank ?? defaultGetRank) as (item: T) => string;
  const latest = useRef({ props, labels, getRank });
  latest.current = { props, labels, getRank };

  const { byId: itemsById, unique } = useMemo(() => uniqueById(items, getItemId), [items, getItemId]);
  const itemsRef = useRef(itemsById);
  itemsRef.current = itemsById;

  const itemLabel = useCallback((itemId: string) => {
    const item = itemsRef.current.get(itemId);
    const getLabel = latest.current.props.getItemLabel;
    return item != null && getLabel ? getLabel(item) : itemId;
  }, []);

  const [focusRequest] = useState(() => createValueStore<string | null>(null));
  const history = useRef<UndoEntry[]>([]);
  const [lastMove] = useState(() => createValueStore<UndoEntry | null>(null));
  const forget = useCallback(
    (opId: string) => {
      history.current = history.current.filter((entry) => entry.opId !== opId);
      if (lastMove.get()?.opId === opId) lastMove.set(null);
    },
    [lastMove],
  );

  // "Moved" is announced once the app accepts the move, so it never reports a move that rolls back.
  const announcements = useRef(new Map<string, string>());

  const onEvent = useCallback(
    (event: MoveQueueEvent) => {
      if (event.type === 'resolved') {
        const message = announcements.current.get(event.op.opId);
        announcements.current.delete(event.op.opId);
        if (message) announce(message);
        return;
      }
      if (event.type === 'cancelled') {
        announcements.current.delete(event.op.opId);
        forget(event.op.opId);
        return;
      }
      if (event.type !== 'rejected') return;
      announcements.current.delete(event.op.opId);
      forget(event.op.opId);
      const { props: current, labels: text } = latest.current;
      current.onMoveError?.(event.op, event.error);
      const item = itemsRef.current.get(event.op.id);
      if (item == null) return;
      const axes: GroupBy<T> = current.groupBy;
      announce(
        text.moveFailed({
          item: itemLabel(event.op.id),
          column: bucketLabel(axes.columns, readAxisValue(axes.columns, item), text.noValue) ?? '',
          lane: bucketLabel(axes.lanes, axes.lanes ? readAxisValue(axes.lanes, item) : null, text.noValue),
        }),
      );
    },
    [forget, itemLabel],
  );

  // The queue reads props through refs, so it always sees the latest ones,
  // timeouts included.
  const createQueue = useCallback(
    (): MoveQueue =>
      createMoveQueue({
        onMove: (op, context) => latest.current.props.onMove(op, context),
        readItem: (itemId) => {
          const item = itemsRef.current.get(itemId);
          const current = latest.current;
          return item == null ? null : readItemSnapshot(item, current.props.groupBy, current.getRank);
        },
        onEvent,
        get settleTimeoutMs() {
          return latest.current.props.settleTimeoutMs;
        },
        get inflightTimeoutMs() {
          return latest.current.props.inflightTimeoutMs;
        },
      }),
    [onEvent],
  );
  const [queue, setQueue] = useState(createQueue);
  const [retired] = useState(() => new WeakSet<MoveQueue>());
  useEffect(() => {
    // StrictMode unmounts and remounts once: replace the queue it disposed.
    if (retired.has(queue)) {
      setQueue(createQueue());
      return;
    }
    return () => {
      retired.add(queue);
      queue.dispose();
    };
  }, [createQueue, queue, retired]);

  const snapshot = useSyncExternalStore(queue.subscribe, queue.getSnapshot, queue.getSnapshot);

  useEffect(() => {
    queue.reconcile();
  }, [queue, itemsById]);

  const model = useMemo(
    () =>
      projectBoard({
        items: unique,
        getItemId,
        getRank,
        groupBy,
        overlays: snapshot.overlays,
        strategy: rankStrategy,
        noValueLabel: labels.noValue,
      }),
    [unique, getItemId, getRank, groupBy, snapshot.overlays, rankStrategy, labels.noValue],
  );
  const modelRef = useRef(model);
  modelRef.current = model;

  const pendingIds = useMemo(() => new Set(snapshot.overlays.map((op) => op.id)), [snapshot.overlays]);

  const canDropTo = useCallback((itemId: string, cellId: string) => {
    if (latest.current.props.readOnly) return false;
    const item = itemsRef.current.get(itemId);
    const canDrop = latest.current.props.canDrop;
    if (item == null) return false;
    return canDrop ? canDrop(item, moveTargetOf(cellId)) : true;
  }, []);

  const moveItem = useCallback(
    (itemId: string, toCellId: string, toIndex: number, source: MoveSource) => {
      if (latest.current.props.readOnly) return false;
      const item = itemsRef.current.get(itemId);
      const current = modelRef.current;
      const target = current.cellById.get(toCellId);
      if (item == null || !target || !canDropTo(itemId, toCellId)) return false;
      const { props: currentProps, labels: text } = latest.current;
      let op: MoveOperation | null;
      try {
        op = planMove({
          model: current,
          groupBy: currentProps.groupBy,
          item,
          itemId,
          toCellId,
          toIndex,
          overlay: queue.getOverlay(itemId),
          strategy: currentProps.rankStrategy,
          source,
        });
      } catch (error) {
        // Data changed under the gesture, or a neighbor has an invalid rank: refuse the move.
        warnOnce(`move of "${itemId}" was refused: ${error instanceof Error ? error.message : String(error)}`);
        return false;
      }
      if (!op) return false;
      const sameCell = current.locations.get(itemId)?.cellId === toCellId;
      announcements.current.set(
        op.opId,
        text.moved({
          item: itemLabel(itemId),
          column: target.column.label,
          lane: currentProps.groupBy.lanes ? target.lane.label : null,
          position: toIndex + 1,
          count: target.items.length + (sameCell ? 0 : 1),
        }),
      );
      const from = current.locations.get(itemId);
      queue.enqueue(op);
      if (source !== 'undo' && from) {
        const entry: UndoEntry = {
          opId: op.opId,
          itemId,
          fromCellId: from.cellId,
          fromIndex: from.index,
          toCellId,
          source,
        };
        history.current = [...history.current.slice(1 - UNDO_DEPTH), entry];
        lastMove.set(entry);
      }
      // Moves made without a finger on the card keep the screen reader on it.
      if (source === 'sheet' || source === 'accessibility' || source === 'undo') focusRequest.set(itemId);
      return true;
    },
    [canDropTo, focusRequest, itemLabel, lastMove, queue],
  );

  /** The newest entry whose card is still in the cell it was moved to, dropping stale ones. */
  const undoTarget = useCallback((): UndoEntry | null => {
    const current = modelRef.current;
    while (history.current.length > 0) {
      const entry = history.current.at(-1);
      if (
        entry &&
        current.locations.get(entry.itemId)?.cellId === entry.toCellId &&
        current.cellById.has(entry.fromCellId)
      )
        return entry;
      history.current = history.current.slice(0, -1);
    }
    return null;
  }, []);

  const undo = useCallback(() => {
    for (let entry = undoTarget(); entry; entry = undoTarget()) {
      history.current = history.current.slice(0, -1);
      if (lastMove.get()?.opId === entry.opId) lastMove.set(null);
      const current = modelRef.current;
      const cell = current.cellById.get(entry.fromCellId);
      const at = current.locations.get(entry.itemId);
      if (!cell || !at) continue;
      const size = cell.items.length - (at.cellId === entry.fromCellId ? 1 : 0);
      if (moveItem(entry.itemId, entry.fromCellId, Math.min(entry.fromIndex, size), 'undo')) return true;
    }
    return false;
  }, [lastMove, moveItem, undoTarget]);

  const canUndo = useCallback(() => undoTarget() !== null, [undoTarget]);

  const moveTo = useCallback(
    (itemId: string, to: MoveDestination) => {
      const target = resolveDestination(modelRef.current, itemId, to, latest.current.props.groupBy.lanes != null);
      return target ? moveItem(itemId, target.cellId, target.index, 'api') : false;
    },
    [moveItem],
  );

  const isPending = useCallback((itemId: string) => pendingIds.has(itemId), [pendingIds]);

  return {
    model,
    itemsById,
    isPending,
    moveItem,
    moveTo,
    canDropTo,
    itemLabel,
    focusRequest,
    undo,
    canUndo,
    lastMove,
  };
}
