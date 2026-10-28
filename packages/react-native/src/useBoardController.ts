import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { AccessibilityInfo } from 'react-native';
import { type BoardModel, type MoveQueue, type MoveSource } from 'board-view-core';
import {
  createMoveSession,
  createSessionQueue,
  defaultGetRank,
  fullColumnsOf,
  uniqueById,
  withHeld,
  type HeldMove,
  type UndoEntry,
} from './session';
import type { ValueStore } from './store';
import type { BoardLabels, BoardProps, MoveDestination } from './types';

export { moveTargetOf, resolveDestination } from './session';
export type { HeldMove, UndoEntry, UndoMove } from './session';

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
  /** Columns at their limit that refuse cards (`limitBehavior="block"`). A new set only when it changes. */
  readonly fullColumns: ReadonlySet<string>;
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
  /** The move waiting for `gateMove` or `confirmInto`. Its cards are drawn, pending, where they land. */
  readonly gate: HeldMove | null;
  submitGate(answer?: unknown): void;
  cancelGate(): void;
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
  const gate = useSyncExternalStore(session.held.subscribe, session.held.get, session.held.get);
  const overlays = useMemo(() => withHeld(snapshot.overlays, gate), [gate, snapshot.overlays]);

  useEffect(() => {
    queue.reconcile();
  }, [queue, itemsById]);

  const model = useMemo(
    () =>
      session.projection(overlays, unique, {
        getItemId,
        getRank,
        groupBy,
        strategy: rankStrategy,
        noValue: labels.noValue,
      }),
    [session, unique, overlays, getItemId, getRank, groupBy, rankStrategy, labels.noValue],
  );

  const pendingIds = useMemo(() => new Set(overlays.map((op) => op.id)), [overlays]);
  const fullNow = useMemo(() => fullColumnsOf(model, props, itemsById, overlays), [itemsById, model, props, overlays]);
  // The same set until a column fills or empties, so cards that read it redraw only then.
  const fullRef = useRef(fullNow);
  if (!sameSet(fullRef.current, fullNow)) fullRef.current = fullNow;
  const fullColumns = fullRef.current;

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
      fullColumns,
      itemLabel: session.itemLabel,
      focusRequest: session.focusRequest,
      undo: session.undo,
      canUndo: session.canUndo,
      lastMove: session.lastMove,
      gate,
      submitGate: session.submitGate,
      cancelGate: session.cancelGate,
    }),
    [fullColumns, gate, itemsById, model, pendingIds, session],
  );
}

function sameSet(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  for (const value of a) if (!b.has(value)) return false;
  return true;
}
