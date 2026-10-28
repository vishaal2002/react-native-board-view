/**
 * Test helpers: drive a board's moves in Jest or Vitest without rendering it.
 *
 * `createBoardTester` runs the same move code `<Board>` runs (planning,
 * limits, `canDrop`, the optimistic queue, undo and batches) on plain data,
 * so a test can check what your `onMove` receives and what the board shows,
 * with no native modules to mock.
 *
 * ```ts
 * import { createBoardTester } from 'react-native-board-view/testing';
 *
 * const board = createBoardTester({ items, getItemId: (task) => task.id, groupBy, onMove: saveMove });
 * board.drag('a', { columnId: 'done' });
 * expect(board.column('done')).toEqual(['a', 'c']);
 * await board.settle();
 * expect(saveMove).toHaveBeenCalledWith(expect.objectContaining({ id: 'a', changes: { status: 'done' } }), expect.anything());
 * ```
 */
import {
  NO_LANE_ID,
  applyMove,
  cellId as makeCellId,
  parseCellId,
  type BoardModel,
  type MoveContext,
  type MoveOperation,
  type MoveQueue,
  type MoveSource,
} from 'board-view-core';
import { createMoveSession, createSessionQueue, defaultGetRank, uniqueById, type MoveSession } from './session';
import { defaultLabels } from './theme';
import type { BoardLabels, BoardProps, MoveDestination } from './types';

/** The board props a tester reads. `onMove` is optional: by default every move is accepted. */
export type BoardTesterOptions<T> = Pick<
  BoardProps<T>,
  | 'items'
  | 'getItemId'
  | 'groupBy'
  | 'getRank'
  | 'getItemLabel'
  | 'canDrop'
  | 'readOnly'
  | 'columnLimits'
  | 'columnTotals'
  | 'limitBehavior'
  | 'rankStrategy'
  | 'settleTimeoutMs'
  | 'inflightTimeoutMs'
  | 'onMoveError'
  | 'gateMove'
  | 'confirmInto'
> & {
  onMove?: BoardProps<T>['onMove'];
  labels?: Partial<BoardLabels>;
  /**
   * Apply each move to `items` once `onMove` resolves, like a server that
   * accepts it and an app that re-renders. `true` writes the grouped fields
   * and `item.rank`; pass a function when your items keep the rank elsewhere.
   * Off by default: call `setItems` with what your app would show.
   */
  applyAcceptedMoves?: boolean | ((item: T, op: MoveOperation) => T);
};

export interface BoardTester<T> {
  /** Card ids in one cell, in display order, pending moves included. `laneId` is for swimlanes. */
  column(columnId: string, laneId?: string): string[];
  /** Every column's card ids, by column id (all lanes together). */
  columns(): Record<string, string[]>;
  /** The board as `<Board>` would draw it now. */
  model(): BoardModel<T>;
  /** Moves a card as a drop does: source `drag`. Returns false when the board refuses it. */
  drag(itemId: string, to: MoveDestination): boolean;
  /** Moves a card with another source, such as `sheet` or `accessibility`. */
  move(itemId: string, to: MoveDestination, source?: MoveSource): boolean;
  /** Moves several cards together as a batch. Returns how many moved. */
  moveMany(itemIds: readonly string[], to: MoveDestination, source?: MoveSource): number;
  /** Whether a drop of the card on that column (and lane) would be taken. */
  canMove(itemId: string, to: Pick<MoveDestination, 'columnId' | 'laneId'>): boolean;
  undo(): boolean;
  canUndo(): boolean;
  /** True while a move of this card waits for `onMove`, for `items` to show it, or for its gate. */
  isPending(itemId: string): boolean;
  /** What holds the waiting move (`gateMove`'s value, or `'confirm'`), or null when none waits. */
  gate(): unknown;
  /** Answers the waiting move's gate: its cards go to `onMove`, with `answer` as `context.answer`. */
  submitGate(answer?: unknown): void;
  /** Cancels the waiting move: its cards go back. */
  cancelGate(): void;
  /** Replaces the app's items, as a re-render with new data would. */
  setItems(items: readonly T[]): void;
  /** The items the tester holds now. */
  items(): readonly T[];
  /** Every op `onMove` received, in order. */
  readonly moves: readonly MoveOperation[];
  /** What the board said to screen readers, in order. */
  readonly announcements: readonly string[];
  /** Lets pending `onMove` promises and the queue run. Await it after a move. */
  settle(): Promise<void>;
  /** Clears the queue's timers and aborts in-flight moves. */
  dispose(): void;
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export function createBoardTester<T>(options: BoardTesterOptions<T>): BoardTester<T> {
  const moves: MoveOperation[] = [];
  const announcements: string[] = [];
  const labels: BoardLabels = { ...defaultLabels, ...options.labels };
  let items = options.items;
  let index = uniqueById(items, options.getItemId);

  const apply =
    options.applyAcceptedMoves === true
      ? (item: T, op: MoveOperation) =>
          applyMove(item, op, options.groupBy, (entry, rank) => ({ ...(entry as object), rank }) as T)
      : typeof options.applyAcceptedMoves === 'function'
        ? options.applyAcceptedMoves
        : null;

  const setItems = (next: readonly T[]) => {
    items = next;
    index = uniqueById(items, options.getItemId);
    queue.reconcile();
  };

  const props: BoardProps<T> = {
    ...options,
    items,
    renderCard: () => null,
    async onMove(op: MoveOperation, context: MoveContext) {
      moves.push(op);
      await options.onMove?.(op, context);
      if (apply) setItems(items.map((item) => (options.getItemId(item) === op.id ? apply(item, op) : item)));
    },
  };
  const getRank = (options.getRank ?? defaultGetRank) as (item: T) => string;
  const env = {
    props: () => ({ ...props, items }),
    labels: () => labels,
    getRank: () => getRank,
    itemsById: () => index.byId,
    items: () => index.unique,
    queue: (): MoveQueue => queue,
    announce: (message: string) => {
      announcements.push(message);
    },
  };
  const queue = createSessionQueue(() => session, env);
  const session: MoveSession<T> = createMoveSession(env);
  const hasLanes = options.groupBy.lanes != null;

  return {
    column(columnId, laneId) {
      const model = session.live();
      const lane = hasLanes ? (laneId ?? null) : NO_LANE_ID;
      const ids: string[] = [];
      for (const cell of model.cells) {
        if (cell.columnKey !== columnId || (lane !== null && cell.laneKey !== lane)) continue;
        for (const ref of cell.ranked) ids.push(ref.id);
      }
      return ids;
    },
    columns() {
      const model = session.live();
      const out: Record<string, string[]> = {};
      for (const column of model.columns) out[column.id] = [];
      for (const cell of model.cells) for (const ref of cell.ranked) (out[cell.columnKey] ??= []).push(ref.id);
      return out;
    },
    model: () => session.live(),
    drag: (itemId, to) => session.moveTo(itemId, to, 'drag'),
    move: (itemId, to, source = 'api') => session.moveTo(itemId, to, source),
    moveMany: (itemIds, to, source = 'api') => session.moveManyTo(itemIds, to, source),
    canMove(itemId, to) {
      const at = session.live().locations.get(itemId);
      if (!at) return false;
      const laneKey = hasLanes ? (to.laneId ?? parseCellId(at.cellId).laneKey) : NO_LANE_ID;
      return session.canDropTo(itemId, makeCellId(laneKey, to.columnId));
    },
    undo: () => session.undo(),
    canUndo: () => session.canUndo(),
    isPending: (itemId) =>
      queue.getOverlay(itemId) != null || (session.held.get()?.ops.some((op) => op.id === itemId) ?? false),
    gate: () => session.held.get()?.request ?? null,
    submitGate: (answer) => session.submitGate(answer),
    cancelGate: () => session.cancelGate(),
    setItems,
    items: () => items,
    moves,
    announcements,
    async settle() {
      // A few turns: onMove resolves, the queue settles, applied items reconcile.
      for (let turn = 0; turn < 4; turn += 1) await tick();
    },
    dispose: () => queue.dispose(),
  };
}
