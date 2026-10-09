import { NO_LANE_ID, NO_VALUE_ID, createOpId, parseCellId } from './ids';
import { readAxisValue } from './group';
import { rankForMove } from './indexSemantics';
import type { GroupBy, MoveOperation, RankStrategy, RankedRef } from './types';
import { fractionalRank } from './rank';

export interface CreateMoveInput<T> {
  item: T;
  itemId: string;
  groupBy: GroupBy<T>;
  fromCellId: string;
  toCellId: string;
  toIndex: number;
  /**
   * Display order of the target cell, including the dragged item when the
   * move stays in that cell. Rank is taken between these visible neighbors.
   */
  targetVisible: readonly RankedRef[];
  /**
   * Fields and rank the move starts from. Pass the current overlay when a
   * move is already pending, otherwise omit and the item is read directly.
   */
  current?: {
    fields: Readonly<Record<string, string | null>>;
    rank: string;
  };
  opId?: string;
  strategy?: RankStrategy;
}

function fieldValue(bucket: string): string | null {
  return bucket === NO_VALUE_ID ? null : bucket;
}

function axisFields<T>(
  groupBy: GroupBy<T>,
  item: T,
  laneKey: string,
  columnKey: string,
  current: CreateMoveInput<T>['current'],
  which: 'from' | 'to',
): Record<string, string | null> {
  const fields: Record<string, string | null> = {};
  const columnRaw =
    which === 'from'
      ? (current?.fields[groupBy.columns.key] ?? readAxisValue(groupBy.columns, item))
      : fieldValue(columnKey);
  fields[groupBy.columns.key] = columnRaw === NO_VALUE_ID ? null : columnRaw;

  if (groupBy.lanes && laneKey !== NO_LANE_ID) {
    const laneRaw =
      which === 'from'
        ? (current?.fields[groupBy.lanes.key] ?? readAxisValue(groupBy.lanes, item))
        : fieldValue(laneKey);
    fields[groupBy.lanes.key] = laneRaw === NO_VALUE_ID ? null : laneRaw;
  } else if (groupBy.lanes && which === 'to' && laneKey === NO_LANE_ID) {
    // A board with lanes should not address the synthetic lane.
  }
  return fields;
}

export function createMoveFromDrop<T>(input: CreateMoveInput<T>): MoveOperation {
  const fromCell = parseCellId(input.fromCellId);
  const toCell = parseCellId(input.toCellId);
  const strategy = input.strategy ?? fractionalRank;
  const from = axisFields(input.groupBy, input.item, fromCell.laneKey, fromCell.columnKey, input.current, 'from');
  const changes = axisFields(input.groupBy, input.item, toCell.laneKey, toCell.columnKey, input.current, 'to');

  if (input.groupBy.lanes && toCell.laneKey === NO_LANE_ID) {
    throw new Error('Boards with lanes cannot target the synthetic "_" lane.');
  }
  if (input.groupBy.lanes == null && (fromCell.laneKey !== NO_LANE_ID || toCell.laneKey !== NO_LANE_ID)) {
    throw new Error(`Boards without lanes must use cell ids starting with "${NO_LANE_ID}::".`);
  }

  // `from` for a follow-up move is the pending destination, not the server record.
  const fromFields = input.current ? { ...input.current.fields } : from;
  const rank = rankForMove(input.targetVisible, input.itemId, input.toIndex, strategy);

  return {
    opId: input.opId ?? createOpId(),
    id: input.itemId,
    changes,
    from: fromFields,
    rank,
  };
}
