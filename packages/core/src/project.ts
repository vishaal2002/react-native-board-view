import { NO_LANE_ID, NO_VALUE_ID, cellId } from './ids';
import { bucketsForAxis, resolveBucket } from './group';
import { compareRanked } from './rank';
import type { BoardCell, BoardModel, GroupBy, GroupValue, MoveOperation, RankStrategy } from './types';
import { fractionalRank } from './rank';

export interface ProjectBoardInput<T> {
  items: readonly T[];
  getItemId: (item: T) => string;
  getRank: (item: T) => string;
  groupBy: GroupBy<T>;
  /** Pending moves. Latest entry per item wins. Items are not copied or edited. */
  overlays?: readonly MoveOperation[];
  strategy?: RankStrategy;
}

interface Placed<T> {
  item: T;
  id: string;
  rank: string;
  laneKey: string;
  columnKey: string;
}

function latestOverlays(overlays: readonly MoveOperation[] | undefined): Map<string, MoveOperation> {
  const map = new Map<string, MoveOperation>();
  if (!overlays) return map;
  for (const overlay of overlays) map.set(overlay.id, overlay);
  return map;
}

export function projectBoard<T>(input: ProjectBoardInput<T>): BoardModel<T> {
  const strategy = input.strategy ?? fractionalRank;
  const overlays = latestOverlays(input.overlays);
  const placed: Placed<T>[] = [];

  for (const item of input.items) {
    const id = input.getItemId(item);
    const overlay = overlays.get(id);
    const columnHas = overlay != null && Object.prototype.hasOwnProperty.call(overlay.changes, input.groupBy.columns.key);
    const columnKey = resolveBucket(
      input.groupBy.columns,
      item,
      columnHas ? overlay?.changes[input.groupBy.columns.key] : undefined,
      columnHas,
    );
    let laneKey = NO_LANE_ID;
    if (input.groupBy.lanes) {
      const laneHas = overlay != null && Object.prototype.hasOwnProperty.call(overlay.changes, input.groupBy.lanes.key);
      laneKey = resolveBucket(
        input.groupBy.lanes,
        item,
        laneHas ? overlay?.changes[input.groupBy.lanes.key] : undefined,
        laneHas,
      );
    }
    placed.push({
      item,
      id,
      rank: overlay?.rank ?? input.getRank(item),
      laneKey,
      columnKey,
    });
  }

  const columnBuckets = bucketsForAxis(
    input.groupBy.columns,
        placed.some((item) => item.columnKey === NO_VALUE_ID),
  );
  const laneBuckets: GroupValue[] = input.groupBy.lanes
    ? bucketsForAxis(
        input.groupBy.lanes,
        placed.some((item) => item.laneKey === NO_VALUE_ID),
      )
    : [{ id: NO_LANE_ID, label: '' }];

  const cells: BoardCell<T>[] = [];
  const cellById = new Map<string, BoardCell<T>>();

  for (const lane of laneBuckets) {
    for (const column of columnBuckets) {
      const id = cellId(lane.id, column.id);
      const items = placed
        .filter((item) => item.laneKey === lane.id && item.columnKey === column.id)
        .sort((a, b) => compareRanked(a, b, strategy))
        .map((item) => item.item);
      const cell: BoardCell<T> = {
        cellId: id,
        laneKey: lane.id,
        columnKey: column.id,
        lane,
        column,
        items,
      };
      cells.push(cell);
      cellById.set(id, cell);
    }
  }

  return { lanes: laneBuckets, columns: columnBuckets, cells, cellById };
}

export function snapshotFromItem<T>(
  item: T,
  groupBy: GroupBy<T>,
  getRank: (item: T) => string,
  read: (axisKey: string, item: T) => string | null,
): { rank: string; fields: Record<string, string | null> } {
  const fields: Record<string, string | null> = {
    [groupBy.columns.key]: read(groupBy.columns.key, item),
  };
  if (groupBy.lanes) {
    fields[groupBy.lanes.key] = read(groupBy.lanes.key, item);
  }
  return { rank: getRank(item), fields };
}
