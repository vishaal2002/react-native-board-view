import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { AccessibilityInfo } from 'react-native';
import { projectBoard, type BoardModel, type MoveQueue, type MoveSource } from 'board-view-core';
import { createMoveSession, createSessionQueue, defaultGetRank, uniqueById, type UndoEntry } from './session';
import type { ValueStore } from './store';
import type { BoardLabels, BoardProps, MoveDestination } from './types';

export { moveTargetOf, resolveDestination } from './session';
export type { UndoEntry, UndoMove } from './session';

export interface BoardController<T> {
  readonly model: BoardModel<T>;
  readonly itemsById: ReadonlyMap<string, T>;
  isPending(itemId: string): boolean;
  /**
   * Plans and queues a move. Returns false when nothing changes, the target
   * refuses the card, or the move cannot be planned against the current data.
   */
  moveItem(itemId: string, toCellId: string, toIndex: number, source: MoveSource): boolean;
  /**
   * Moves several cards to one cell as a batch, keeping their board order.
   * `anchorId`, when one of them, lands at `toIndex` and the others gather
   * around it; otherwise the first lands there. Returns how many moved.
   */
  moveItems(
    itemIds: readonly string[],
    toCellId: string,
    toIndex: number,
    source: MoveSource,
    anchorId?: string,
  ): number;
  /** `moveItem` for the imperative handle: a column, lane and index instead of a cell. */
  moveTo(itemId: string, to: MoveDestination): boolean;
  moveManyTo(itemIds: readonly string[], to: MoveDestination): number;
  canDropTo(itemId: string, cellId: string): boolean;
  itemLabel(itemId: string): string;
  /** The card that should take screen-reader focus once it renders in its new place. */
  readonly focusRequest: ValueStore<string | null>;
  /**
   * Reverts a move: the one named by `entryId`, else the newest whose cards
   * are still where they landed. Never falls back to an older move when the
   * chosen one is refused.
   */
  undo(entryId?: string): boolean;
  canUndo(): boolean;
  /** The newest undoable move, or null once it is undone, rolled back or cancelled. */
  readonly lastMove: ValueStore<UndoEntry | null>;
}

export function useBoardController<T>(props: BoardProps<T>, labels: BoardLabels): BoardController<T> {
  const { items, getItemId, groupBy, rankStrategy } = props;
  const getRank = (props.getRank ?? defaultGetRank) as (item: T) => string;
  const { byId: itemsById, unique } = useMemo(() => uniqueById(items, getItemId), [items, getItemId]);

  const latest = useRef({ props, labels, getRank, itemsById, unique });
  latest.current = { props, labels, getRank, itemsById, unique };

  // The session and queue read everything through `latest`, so they always see the latest props.
  const [env] = useState(() => ({
    props: () => latest.current.props,
    labels: () => latest.current.labels,
    getRank: () => latest.current.getRank,
    itemsById: () => latest.current.itemsById,
    items: () => latest.current.unique,
    queue: (): MoveQueue => queueRef.current,
    announce: (message: string) => AccessibilityInfo.announceForAccessibility(message),
  }));
  const [session] = useState(() => createMoveSession<T>(env));
  const createQueue = () => createSessionQueue(() => session, env);
  const [queue, setQueue] = useState(createQueue);
  const queueRef = useRef(queue);
  queueRef.current = queue;
  const [retired] = useState(() => new WeakSet<MoveQueue>());
  useEffect(() => {
    // StrictMode unmounts and remounts once: replace the queue it disposed.
    if (retired.has(queue)) {
      setQueue(createSessionQueue(() => session, env));
      return;
    }
    return () => {
      retired.add(queue);
      queue.dispose();
    };
  }, [env, queue, retired, session]);

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
  // The render's projection is the session's too, until a move queues another.
  session.adopt(model, snapshot.overlays, unique);

  const pendingIds = useMemo(() => new Set(snapshot.overlays.map((op) => op.id)), [snapshot.overlays]);

  return useMemo(
    () => ({
      model,
      itemsById,
      isPending: (itemId: string) => pendingIds.has(itemId),
      moveItem: session.moveItem,
      moveItems: session.moveItems,
      moveTo: (itemId: string, to: MoveDestination) => session.moveTo(itemId, to),
      moveManyTo: (itemIds: readonly string[], to: MoveDestination) => session.moveManyTo(itemIds, to),
      canDropTo: session.canDropTo,
      itemLabel: session.itemLabel,
      focusRequest: session.focusRequest,
      undo: session.undo,
      canUndo: session.canUndo,
      lastMove: session.lastMove,
    }),
    [itemsById, model, pendingIds, session],
  );
}
