import { NO_LANE_ID, NO_VALUE_ID, createOpId, parseCellId } from './ids';
import { readAxisValue } from './group';
import { placeForMove } from './indexSemantics';
import { fractionalRank } from './rank';
import type { BoardModel, GroupAxis, GroupBy, MoveBatch, MoveOperation, MoveSource, RankStrategy } from './types';

export interface PlanMoveInput<T> {
  /** The board as displayed, pending overlays included. */
  model: BoardModel<T>;
  groupBy: GroupBy<T>;
  /** The app's record of the item. */
  item: T;
  itemId: string;
  toCellId: string;
  /** Insertion index in the target cell after the moved item is removed. */
  toIndex: number;
  /** Net pending state of the item, so a follow-up move starts from where the card is shown. */
  overlay?: MoveOperation | null;
  strategy?: RankStrategy;
  opId?: string;
  /** What started the move. Default 'api'. */
  source?: MoveSource;
  /** Marks the op as part of a batch of moves. */
  batch?: MoveBatch;
}

function bucketValue(bucket: string): string | null {
  return bucket === NO_VALUE_ID ? null : bucket;
}

function shownValue<T>(axis: GroupAxis<T>, item: T, overlay: MoveOperation | null | undefined): string | null {
  if (overlay && Object.hasOwn(overlay.changes, axis.key)) return overlay.changes[axis.key] ?? null;
  return readAxisValue(axis, item);
}

/**
 * Turns "put this item at index N of that cell" into a move operation.
 *
 * `changes` holds only the grouped fields whose bucket changes, `from` holds
 * their values before the move (the pending values when a move is already
 * queued). A reorder inside one cell changes only `rank`. Returns null when
 * the item would land where it already is.
 */
export function planMove<T>(input: PlanMoveInput<T>): MoveOperation | null {
  const { model, groupBy, item, itemId, toCellId, toIndex, overlay } = input;
  const location = model.locations.get(itemId);
  const target = model.cellById.get(toCellId);
  if (!location) throw new Error(`Item "${itemId}" is not on the board.`);
  if (!target) throw new Error(`Unknown cell "${toCellId}".`);
  if (location.cellId === toCellId && location.index === toIndex) return null;

  const fromCell = parseCellId(location.cellId);
  const toCell = parseCellId(toCellId);
  if (groupBy.lanes && toCell.laneKey === NO_LANE_ID) {
    throw new Error(`Boards with lanes cannot target the "${NO_LANE_ID}" lane.`);
  }
  if (!groupBy.lanes && toCell.laneKey !== NO_LANE_ID) {
    throw new Error(`Boards without lanes use cell ids that start with "${NO_LANE_ID}::".`);
  }

  const changes: Record<string, string | null> = {};
  const from: Record<string, string | null> = {};
  const axes: Array<[GroupAxis<T>, string, string]> = [[groupBy.columns, fromCell.columnKey, toCell.columnKey]];
  if (groupBy.lanes) axes.push([groupBy.lanes, fromCell.laneKey, toCell.laneKey]);
  for (const [axis, fromBucket, toBucket] of axes) {
    if (fromBucket === toBucket) continue;
    changes[axis.key] = bucketValue(toBucket);
    from[axis.key] = shownValue(axis, item, overlay);
  }

  const place = placeForMove(target.ranked, itemId, toIndex, input.strategy ?? fractionalRank);
  const op: MoveOperation = {
    opId: input.opId ?? createOpId(),
    id: itemId,
    changes,
    from,
    rank: place.rank,
    previousId: place.previousId,
    nextId: place.nextId,
    source: input.source ?? 'api',
  };
  return input.batch ? { ...op, batch: input.batch } : op;
}

/** Applies a move to an app record with the board's own `applyKey` / default field writer. */
export function applyMove<T>(
  item: T,
  op: Pick<MoveOperation, 'changes' | 'rank'>,
  groupBy: GroupBy<T>,
  applyRank: (item: T, rank: string) => T,
): T {
  let next = applyRank(item, op.rank);
  for (const axis of [groupBy.columns, groupBy.lanes]) {
    if (!axis || !Object.hasOwn(op.changes, axis.key)) continue;
    const value = op.changes[axis.key] ?? null;
    if (axis.applyKey) {
      next = axis.applyKey(next, value);
    } else if (typeof next === 'object' && next != null) {
      next = { ...next, [axis.key]: value };
    } else {
      throw new Error(`Cannot write "${axis.key}" onto a non-object item without applyKey.`);
    }
  }
  return next;
}
