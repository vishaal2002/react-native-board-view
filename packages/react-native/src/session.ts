import {
  NO_LANE_ID,
  NO_VALUE_ID,
  cellId as makeCellId,
  createMoveQueue,
  createOpId,
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
import { createValueStore, type ValueStore } from './store';
import type { BoardLabels, BoardProps, MoveDestination, MoveTarget } from './types';

/** One card of an undoable move: where it came from and where it went. */
export interface UndoMove {
  readonly opId: string;
  readonly itemId: string;
  readonly fromCellId: string;
  /** Insertion index in the source cell, with the card left out. */
  readonly fromIndex: number;
  readonly toCellId: string;
}

/** A move the board can revert: one card, or every card of a batch. */
export interface UndoEntry {
  /** The first move's op id. */
  readonly id: string;
  readonly moves: readonly UndoMove[];
  readonly source: MoveSource;
}

/** Where one card of a batch should go. */
interface Step {
  readonly itemId: string;
  readonly cellId: string;
  /** Insertion index, or a card the moved one lands right before or after. */
  readonly place: number | { readonly after: string } | { readonly before: string };
}

/** The board as projected, and what it was projected from. */
interface Projection<T> {
  readonly model: BoardModel<T>;
  readonly overlays: readonly MoveOperation[];
  readonly items: readonly unknown[];
  readonly inputs: ProjectionInputs<T>;
}

/** The props a projection reads besides items and overlays. */
export interface ProjectionInputs<T> {
  readonly getItemId: (item: T) => string;
  readonly getRank: (item: T) => string;
  readonly groupBy: GroupBy<T>;
  readonly strategy: BoardProps<T>['rankStrategy'];
  readonly noValue: string;
}

function sameInputs<T>(a: ProjectionInputs<T>, b: ProjectionInputs<T>): boolean {
  return (
    a.getItemId === b.getItemId &&
    a.getRank === b.getRank &&
    a.groupBy === b.groupBy &&
    a.strategy === b.strategy &&
    a.noValue === b.noValue
  );
}

/** Two overlays put a card in the same cell at the same rank. */
function samePlace<T>(a: MoveOperation, b: MoveOperation, groupBy: GroupBy<T>): boolean {
  const axes = groupBy.lanes ? [groupBy.columns, groupBy.lanes] : [groupBy.columns];
  return (
    a.rank === b.rank &&
    axes.every(
      ({ key }) => Object.hasOwn(a.changes, key) === Object.hasOwn(b.changes, key) && a.changes[key] === b.changes[key],
    )
  );
}

/** The item already holds what its overlay says: dropping the overlay leaves the card where it is. */
function shows<T>(item: T | undefined, op: MoveOperation, inputs: ProjectionInputs<T>): boolean {
  if (item == null || inputs.getRank(item) !== op.rank) return false;
  const { columns, lanes } = inputs.groupBy;
  return (lanes ? [columns, lanes] : [columns]).every(
    (axis) => !Object.hasOwn(op.changes, axis.key) || readAxisValue(axis, item) === (op.changes[axis.key] ?? null),
  );
}

/**
 * The new overlays project the same board as the old ones, over the same
 * items: every card keeps its overlay's cell and rank, and an overlay that
 * went away was one the items already show. The queue merges a card's
 * pending moves the way `withOverlay` does, so a planned batch matches what
 * the queue then holds.
 */
function sameOverlays<T>(
  before: readonly MoveOperation[],
  after: readonly MoveOperation[],
  items: ReadonlyMap<string, T>,
  inputs: ProjectionInputs<T>,
): boolean {
  const kept = new Map(after.map((op) => [op.id, op]));
  if (kept.size > before.length) return false;
  let matched = 0;
  for (const op of before) {
    const next = kept.get(op.id);
    if (next) {
      if (!samePlace(op, next, inputs.groupBy)) return false;
      matched += 1;
    } else if (!shows(items.get(op.id), op, inputs)) {
      return false;
    }
  }
  return matched === kept.size;
}

/** Moves remembered for undo. Older ones are dropped. */
const UNDO_DEPTH = 20;

/** What a session reads, always the latest: the hook passes refs, the test kit plain state. */
export interface SessionEnv<T> {
  props(): BoardProps<T>;
  labels(): BoardLabels;
  getRank(): (item: T) => string;
  /** Items by id, duplicates dropped. */
  itemsById(): ReadonlyMap<string, T>;
  /** The same items as a list, in the order given. */
  items(): readonly T[];
  queue(): MoveQueue;
  announce(message: string): void;
}

export interface MoveSession<T> {
  /** The board right now, moves queued since the last render included. */
  live(): BoardModel<T>;
  /**
   * The board for these overlays and items, for the hook to draw. A move the
   * session just planned already projected it, so a drop projects the board
   * once, not three times.
   */
  projection(overlays: readonly MoveOperation[], items: readonly T[], inputs: ProjectionInputs<T>): BoardModel<T>;
  canDropTo(itemId: string, cellId: string): boolean;
  moveItem(itemId: string, toCellId: string, toIndex: number, source: MoveSource): boolean;
  moveItems(
    itemIds: readonly string[],
    toCellId: string,
    toIndex: number,
    source: MoveSource,
    anchorId?: string,
  ): number;
  moveTo(itemId: string, to: MoveDestination, source?: MoveSource): boolean;
  moveManyTo(itemIds: readonly string[], to: MoveDestination, source?: MoveSource): number;
  undo(entryId?: string): boolean;
  canUndo(): boolean;
  itemLabel(itemId: string): string;
  /** The queue's event handler. */
  onEvent(event: MoveQueueEvent): void;
  readonly focusRequest: ValueStore<string | null>;
  readonly lastMove: ValueStore<UndoEntry | null>;
}

const warned = new Set<string>();

/** Warns once per message in development. */
export function warnOnce(message: string): void {
  if (!__DEV__ || warned.has(message)) return;
  warned.add(message);
  console.warn(`react-native-board-view: ${message}`);
}

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

/**
 * A full column refuses a card from elsewhere. The count is its loaded cards
 * in every lane, or the server total when the app passes one, plus moves into
 * the column the server has not shown yet, minus moves out of it.
 */
function isFull<T>(
  model: BoardModel<T>,
  props: BoardProps<T>,
  items: ReadonlyMap<string, T>,
  overlays: readonly MoveOperation[],
  itemId: string,
  cellId: string,
): boolean {
  const { columnKey } = parseCellId(cellId);
  const from = model.locations.get(itemId);
  if (from && parseCellId(from.cellId).columnKey === columnKey) return false;
  return columnIsFull(model, props, items, overlays, columnKey);
}

/** The column has reached its limit, counted as `isFull` counts it. */
function columnIsFull<T>(
  model: BoardModel<T>,
  props: BoardProps<T>,
  items: ReadonlyMap<string, T>,
  overlays: readonly MoveOperation[],
  columnKey: string,
): boolean {
  const limit = props.columnLimits?.[columnKey];
  if (limit == null || !Number.isFinite(limit) || limit <= 0) return false;
  const total = props.columnTotals?.[columnKey];
  if (total == null) {
    let loaded = 0;
    for (const cell of model.cells) if (cell.columnKey === columnKey) loaded += cell.items.length;
    return loaded >= limit;
  }
  let pending = 0;
  for (const op of overlays) {
    const item = items.get(op.id);
    const at = model.locations.get(op.id);
    if (item == null || !at) continue;
    const stored = readAxisValue(props.groupBy.columns, item) ?? NO_VALUE_ID;
    const shown = parseCellId(at.cellId).columnKey;
    if (shown === columnKey && stored !== columnKey) pending += 1;
    else if (stored === columnKey && shown !== columnKey) pending -= 1;
  }
  return total + pending >= limit;
}

/** Columns at their limit that refuse cards: empty unless `limitBehavior` is `block`. */
export function fullColumnsOf<T>(
  model: BoardModel<T>,
  props: BoardProps<T>,
  items: ReadonlyMap<string, T>,
  overlays: readonly MoveOperation[],
): ReadonlySet<string> {
  const full = new Set<string>();
  if (props.limitBehavior !== 'block' || !props.columnLimits) return full;
  for (const column of model.columns) {
    if (columnIsFull(model, props, items, overlays, column.id)) full.add(column.id);
  }
  return full;
}

/**
 * The same rules as `canDropTo`, for a card that knows its column and the
 * board's full columns. Cards use it so they redraw only when a column fills
 * or empties, not on every move.
 */
export function rulesAllow<T>(
  props: Pick<BoardProps<T>, 'readOnly' | 'limitBehavior' | 'canDrop'>,
  item: T,
  fromColumnKey: string,
  cellId: string,
  fullColumns: ReadonlySet<string>,
): boolean {
  if (props.readOnly) return false;
  const { columnKey } = parseCellId(cellId);
  if (props.limitBehavior === 'block' && columnKey !== fromColumnKey && fullColumns.has(columnKey)) return false;
  return props.canDrop ? props.canDrop(item, moveTargetOf(cellId)) : true;
}

/** `overlays` with `op` added, merged into the item's pending overlay the way the queue merges them. */
function withOverlay(overlays: readonly MoveOperation[], op: MoveOperation): MoveOperation[] {
  const previous = overlays.find((entry) => entry.id === op.id);
  const next = previous
    ? { ...op, changes: { ...previous.changes, ...op.changes }, from: { ...op.from, ...previous.from } }
    : op;
  return [...overlays.filter((entry) => entry.id !== op.id), next];
}

/** Item ids in board order: column by column, lane by lane, top to bottom. Unknown ids are dropped. */
export function inBoardOrder<T>(model: BoardModel<T>, itemIds: readonly string[]): string[] {
  const columns = new Map(model.columns.map((column, index) => [column.id, index]));
  const lanes = new Map(model.lanes.map((lane, index) => [lane.id, index]));
  const keyed: { id: string; key: readonly number[] }[] = [];
  for (const id of new Set(itemIds)) {
    const at = model.locations.get(id);
    if (!at) continue;
    const { laneKey, columnKey } = parseCellId(at.cellId);
    keyed.push({ id, key: [columns.get(columnKey) ?? 0, lanes.get(laneKey) ?? 0, at.index] });
  }
  keyed.sort((a, b) => a.key[0]! - b.key[0]! || a.key[1]! - b.key[1]! || a.key[2]! - b.key[2]!);
  return keyed.map((entry) => entry.id);
}

export function createMoveSession<T>(env: SessionEnv<T>): MoveSession<T> {
  const focusRequest = createValueStore<string | null>(null);
  const lastMove = createValueStore<UndoEntry | null>(null);
  let history: UndoEntry[] = [];
  // "Moved" is announced once the app accepts the move, so it never reports a move that rolls back.
  const announcements = new Map<string, string>();
  let cache: Projection<T> | null = null;

  function inputsNow(): ProjectionInputs<T> {
    const props = env.props();
    return {
      getItemId: props.getItemId,
      getRank: env.getRank(),
      groupBy: props.groupBy,
      strategy: props.rankStrategy,
      noValue: env.labels().noValue,
    };
  }

  function project(overlays: readonly MoveOperation[], inputs = inputsNow(), items = env.items()): BoardModel<T> {
    return projectBoard({
      items,
      getItemId: inputs.getItemId,
      getRank: inputs.getRank,
      groupBy: inputs.groupBy,
      overlays,
      strategy: inputs.strategy,
      noValueLabel: inputs.noValue,
    });
  }

  function projectionOf(overlays: readonly MoveOperation[], items: readonly T[], inputs = inputsNow()): Projection<T> {
    if (cache && cache.overlays === overlays && cache.items === items && sameInputs(cache.inputs, inputs)) return cache;
    // The queue publishes a new list when a move settles: often the same board, which need not be projected again.
    const same =
      cache != null &&
      cache.items === items &&
      sameInputs(cache.inputs, inputs) &&
      sameOverlays(cache.overlays, overlays, env.itemsById(), inputs);
    cache = { model: same ? cache!.model : project(overlays, inputs, items), overlays, items, inputs };
    return cache;
  }

  /**
   * The board as it is right now. A move queued since the last render is
   * already in the queue but not yet on screen, so a second move in the same
   * tick plans against a fresh projection instead of stale neighbours.
   */
  function current(): Projection<T> {
    return projectionOf(env.queue().getSnapshot().overlays, env.items());
  }

  function itemLabel(itemId: string): string {
    const item = env.itemsById().get(itemId);
    const getLabel = env.props().getItemLabel;
    return item != null && getLabel ? getLabel(item) : itemId;
  }

  function allowed(
    state: { model: BoardModel<T>; overlays: readonly MoveOperation[] },
    itemId: string,
    cellId: string,
  ) {
    const props = env.props();
    if (props.readOnly) return false;
    const item = env.itemsById().get(itemId);
    if (item == null) return false;
    if (props.limitBehavior === 'block' && isFull(state.model, props, env.itemsById(), state.overlays, itemId, cellId))
      return false;
    return props.canDrop ? props.canDrop(item, moveTargetOf(cellId)) : true;
  }

  function setLast(entry: UndoEntry | null) {
    lastMove.set(entry);
  }

  /**
   * Plans every step against the board as the earlier steps leave it, then
   * queues them together, so a batch knows its size before `onMove` sees it.
   * Steps the board refuses are skipped. Returns the queued ops.
   */
  function run(steps: readonly Step[], source: MoveSource): MoveOperation[] {
    const props = env.props();
    if (props.readOnly || steps.length === 0) return [];
    const start = current();
    let state: { model: BoardModel<T>; overlays: readonly MoveOperation[] } = start;
    const planned: { op: MoveOperation; from: { cellId: string; index: number } }[] = [];
    // A refused card leaves a gap in the chain: the cards placed next to it go next to whatever stands in for it.
    const standIn = new Map<string, string | number>();
    const resolve = (itemId: string): string | number => {
      let current: string | number = itemId;
      while (typeof current === 'string' && standIn.has(current)) current = standIn.get(current)!;
      return current;
    };
    for (const step of steps) {
      const neighbourId =
        typeof step.place === 'number' ? null : 'after' in step.place ? step.place.after : step.place.before;
      const skip = () => {
        standIn.set(step.itemId, neighbourId == null ? (step.place as number) : resolve(neighbourId));
      };
      const item = env.itemsById().get(step.itemId);
      const from = state.model.locations.get(step.itemId);
      const target = state.model.cellById.get(step.cellId);
      if (item == null || !from || !target || !allowed(state, step.itemId, step.cellId)) {
        skip();
        continue;
      }
      // Counted without the moved card.
      const size = target.items.length - (from.cellId === step.cellId ? 1 : 0);
      let index: number;
      const anchor = neighbourId == null ? (step.place as number) : resolve(neighbourId);
      if (typeof anchor === 'number') {
        // The anchor itself was refused: take the slot it would have had.
        index = anchor;
      } else {
        const neighbour = state.model.locations.get(anchor);
        if (!neighbour || neighbour.cellId !== step.cellId) {
          skip();
          continue;
        }
        // Indexes count the cell without the moved card: one above the neighbour shifts it up.
        const shift = from.cellId === step.cellId && from.index < neighbour.index ? 1 : 0;
        const after = typeof step.place !== 'number' && 'after' in step.place;
        index = neighbour.index - shift + (after ? 1 : 0);
      }
      // An undo clamps: the cell may have shrunk since (cards deleted). Anywhere else an index out of range
      // means the data changed under the gesture, and planning refuses it.
      if (source === 'undo') index = Math.max(0, Math.min(size, index));
      let op: MoveOperation | null;
      try {
        op = planMove({
          model: state.model,
          groupBy: props.groupBy,
          item,
          itemId: step.itemId,
          toCellId: step.cellId,
          toIndex: index,
          overlay: state.overlays.find((entry) => entry.id === step.itemId) ?? null,
          strategy: props.rankStrategy,
          source,
        });
      } catch (error) {
        // Data changed under the gesture, or a neighbor has an invalid rank: refuse the move.
        warnOnce(`move of "${step.itemId}" was refused: ${error instanceof Error ? error.message : String(error)}`);
        skip();
        continue;
      }
      // Null: the card is already exactly there, so it still anchors its neighbours.
      if (!op) continue;
      planned.push({ op, from });
      const overlays = withOverlay(state.overlays, op);
      state = { model: project(overlays), overlays };
    }
    if (planned.length === 0) return [];

    const labels = env.labels();
    const size = planned.length;
    const batchId = size > 1 ? createOpId() : null;
    const ops = planned.map(({ op }, index) => (batchId ? { ...op, batch: { id: batchId, index, size } } : op));
    // One announcement per move: the last op of a batch carries it.
    const last = ops.at(-1)!;
    const landedAt = state.model.locations.get(last.id);
    const landed = landedAt ? state.model.cellById.get(landedAt.cellId) : undefined;
    if (landed && landedAt) {
      const lane = props.groupBy.lanes ? landed.lane.label : null;
      announcements.set(
        last.opId,
        size > 1
          ? labels.movedMany({ count: size, column: landed.column.label, lane })
          : labels.moved({
              item: itemLabel(last.id),
              column: landed.column.label,
              lane,
              position: landedAt.index + 1,
              count: landed.items.length,
            }),
      );
    }
    const queue = env.queue();
    for (const op of ops) queue.enqueue(op);
    // The plan already projected the board these moves leave: keep it rather than project it again.
    const queued = queue.getSnapshot().overlays;
    const inputs = inputsNow();
    if (
      state.model !== start.model &&
      state.overlays.length === queued.length &&
      sameOverlays(state.overlays, queued, env.itemsById(), inputs)
    ) {
      cache = { model: state.model, overlays: queued, items: env.items(), inputs };
    }

    if (source !== 'undo') {
      const moves = planned.map(({ op, from }, index) => ({
        opId: ops[index]!.opId,
        itemId: op.id,
        fromCellId: from.cellId,
        fromIndex: from.index,
        toCellId: state.model.locations.get(op.id)?.cellId ?? from.cellId,
      }));
      const entry: UndoEntry = { id: ops[0]!.opId, moves, source };
      history = [...history.slice(1 - UNDO_DEPTH), entry];
      setLast(entry);
    }
    // Moves made without a finger on the card keep the screen reader on it.
    if (source === 'sheet' || source === 'accessibility' || source === 'undo') focusRequest.set(ops[0]!.id);
    return ops;
  }

  function moveItems(
    itemIds: readonly string[],
    toCellId: string,
    toIndex: number,
    source: MoveSource,
    anchorId?: string,
  ): number {
    const ordered = inBoardOrder(current().model, itemIds);
    const anchor = anchorId != null && ordered.includes(anchorId) ? anchorId : ordered[0];
    if (anchor == null) return 0;
    const at = ordered.indexOf(anchor);
    const steps: Step[] = [{ itemId: anchor, cellId: toCellId, place: toIndex }];
    // Cards after the anchor follow it in order; cards before it stack up above it.
    for (let index = at + 1; index < ordered.length; index += 1)
      steps.push({ itemId: ordered[index]!, cellId: toCellId, place: { after: ordered[index - 1]! } });
    for (let index = at - 1; index >= 0; index -= 1)
      steps.push({ itemId: ordered[index]!, cellId: toCellId, place: { before: ordered[index + 1]! } });
    return run(steps, source).length;
  }

  /** The moves of an entry whose cards are still where they landed, from a cell that still exists. */
  function revertible(entry: UndoEntry): UndoMove[] {
    const { model } = current();
    return entry.moves.filter(
      (move) => model.locations.get(move.itemId)?.cellId === move.toCellId && model.cellById.has(move.fromCellId),
    );
  }

  function drop(entry: UndoEntry) {
    history = history.filter((candidate) => candidate.id !== entry.id);
    if (lastMove.get()?.id === entry.id) setLast(null);
  }

  /** Drops entries from the top whose cards have all moved on: they can never be undone. */
  function pruneStale() {
    for (let top = history.at(-1); top && revertible(top).length === 0; top = history.at(-1)) drop(top);
  }

  /** A move rolled back or was cancelled: it can no longer be undone. A batch keeps its other cards. */
  function forget(opId: string) {
    const next: UndoEntry[] = [];
    for (const entry of history) {
      if (!entry.moves.some((move) => move.opId === opId)) {
        next.push(entry);
        continue;
      }
      const moves = entry.moves.filter((move) => move.opId !== opId);
      const kept = moves.length > 0 ? { ...entry, moves } : null;
      if (kept) next.push(kept);
      if (lastMove.get()?.id === entry.id) setLast(kept);
    }
    history = next;
  }

  function destination(itemId: string, to: MoveDestination) {
    return resolveDestination(current().model, itemId, to, env.props().groupBy.lanes != null);
  }

  return {
    live: () => current().model,
    projection: (overlays, items, inputs) => projectionOf(overlays, items, inputs).model,
    canDropTo: (itemId, cellId) => allowed(current(), itemId, cellId),
    moveItem: (itemId, toCellId, toIndex, source) =>
      run([{ itemId, cellId: toCellId, place: toIndex }], source).length > 0,
    moveItems,
    moveTo(itemId, to, source = 'api') {
      const target = destination(itemId, to);
      return target ? run([{ itemId, cellId: target.cellId, place: target.index }], source).length > 0 : false;
    },
    moveManyTo(itemIds, to, source = 'api') {
      const ordered = inBoardOrder(current().model, itemIds);
      const first = ordered[0];
      const target = first == null ? null : destination(first, to);
      return target ? moveItems(ordered, target.cellId, target.index, source) : 0;
    },
    undo(entryId) {
      if (entryId == null) pruneStale();
      const entry = entryId == null ? history.at(-1) : history.find((candidate) => candidate.id === entryId);
      if (!entry) return false;
      const moves = revertible(entry);
      if (moves.length === 0) {
        drop(entry);
        return false;
      }
      // Last moved goes back first, so each card finds the neighbours it left.
      const steps = moves
        .slice()
        .reverse()
        .map((move) => ({ itemId: move.itemId, cellId: move.fromCellId, place: move.fromIndex }));
      // Refused (a full column in block mode): keep the entry, so undo works once there is room.
      if (run(steps, 'undo').length === 0) return false;
      drop(entry);
      return true;
    },
    canUndo() {
      pruneStale();
      return history.length > 0;
    },
    itemLabel,
    onEvent(event) {
      if (event.type === 'resolved') {
        const message = announcements.get(event.op.opId);
        announcements.delete(event.op.opId);
        if (message) env.announce(message);
        return;
      }
      if (event.type === 'cancelled') {
        announcements.delete(event.op.opId);
        forget(event.op.opId);
        return;
      }
      if (event.type !== 'rejected') return;
      announcements.delete(event.op.opId);
      forget(event.op.opId);
      const props = env.props();
      const labels = env.labels();
      props.onMoveError?.(event.op, event.error);
      const item = env.itemsById().get(event.op.id);
      if (item == null) return;
      const axes: GroupBy<T> = props.groupBy;
      env.announce(
        labels.moveFailed({
          item: itemLabel(event.op.id),
          column: bucketLabel(axes.columns, readAxisValue(axes.columns, item), labels.noValue) ?? '',
          lane: bucketLabel(axes.lanes, axes.lanes ? readAxisValue(axes.lanes, item) : null, labels.noValue),
        }),
      );
    },
    focusRequest,
    lastMove,
  };
}

/** Reads `item.rank`. A missing rank sorts first instead of crashing the render. */
export const defaultGetRank = (item: unknown): string => {
  const rank = (item as { rank?: unknown } | null)?.rank;
  if (typeof rank === 'string') return rank;
  warnOnce('an item has no string `rank`. Pass `getRank`, or give every item a rank (see seedRanks).');
  return '';
};

/** Items with duplicate ids keep the first; the rest would collide as React keys. */
export function uniqueById<T>(items: readonly T[], getItemId: (item: T) => string) {
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

/** A queue that reads the session and props through `env`, so it always sees the latest. */
export function createSessionQueue<T>(
  session: () => MoveSession<T>,
  env: { props(): BoardProps<T>; itemsById(): ReadonlyMap<string, T>; getRank(): (item: T) => string },
): MoveQueue {
  return createMoveQueue({
    onMove: (op, context) => env.props().onMove(op, context),
    readItem: (itemId) => {
      const item = env.itemsById().get(itemId);
      return item == null ? null : readItemSnapshot(item, env.props().groupBy, env.getRank());
    },
    onEvent: (event) => session().onEvent(event),
    get settleTimeoutMs() {
      return env.props().settleTimeoutMs;
    },
    get inflightTimeoutMs() {
      return env.props().inflightTimeoutMs;
    },
  });
}
