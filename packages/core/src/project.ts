import { NO_LANE_ID, NO_VALUE_ID, NO_VALUE_LABEL, cellId } from './ids';
import { readAxisValue } from './group';
import { compareRanked, fractionalRank } from './rank';
import type {
  BoardCell,
  BoardModel,
  GroupAxis,
  GroupBy,
  GroupValue,
  ItemLocation,
  MoveOperation,
  RankStrategy,
} from './types';

export interface ProjectBoardInput<T> {
  items: readonly T[];
  getItemId: (item: T) => string;
  getRank: (item: T) => string;
  groupBy: GroupBy<T>;
  /** Pending moves. Latest entry per item wins. Items are not copied or edited. */
  overlays?: readonly MoveOperation[];
  strategy?: RankStrategy;
  /** Label of the bucket for items with no configured value. */
  noValueLabel?: string;
}

interface Placed<T> {
  item: T;
  id: string;
  rank: string;
}

function bucketOf<T>(
  axis: GroupAxis<T>,
  known: ReadonlySet<string>,
  item: T,
  overlay: MoveOperation | undefined,
): string {
  const raw =
    overlay != null && Object.hasOwn(overlay.changes, axis.key)
      ? (overlay.changes[axis.key] ?? null)
      : readAxisValue(axis, item);
  return raw != null && known.has(raw) ? raw : NO_VALUE_ID;
}

/**
 * Derives the board from flat items. Unknown and empty group values share the
 * "No value" bucket, which only appears when an item lands in it. Each cell is
 * the global rank order filtered to that cell; equal ranks break by id.
 */
export function projectBoard<T>(input: ProjectBoardInput<T>): BoardModel<T> {
  const strategy = input.strategy ?? fractionalRank;
  const overlays = new Map<string, MoveOperation>();
  for (const overlay of input.overlays ?? []) overlays.set(overlay.id, overlay);

  const { columns, lanes } = input.groupBy;
  const columnIds = new Set(columns.values.map((value) => value.id));
  const laneIds = lanes ? new Set(lanes.values.map((value) => value.id)) : null;
  const buckets = new Map<string, Placed<T>[]>();
  let columnNoValue = false;
  let laneNoValue = false;

  for (const item of input.items) {
    const id = input.getItemId(item);
    const overlay = overlays.get(id);
    const columnKey = bucketOf(columns, columnIds, item, overlay);
    const laneKey = lanes && laneIds ? bucketOf(lanes, laneIds, item, overlay) : NO_LANE_ID;
    if (columnKey === NO_VALUE_ID) columnNoValue = true;
    if (laneKey === NO_VALUE_ID) laneNoValue = true;
    const key = cellId(laneKey, columnKey);
    const bucket = buckets.get(key);
    const placed = { item, id, rank: overlay?.rank ?? input.getRank(item) };
    if (bucket) bucket.push(placed);
    else buckets.set(key, [placed]);
  }

  const noValue: GroupValue = { id: NO_VALUE_ID, label: input.noValueLabel ?? NO_VALUE_LABEL };
  const withNoValue = (values: readonly GroupValue[], used: boolean): GroupValue[] =>
    used ? [...values, noValue] : [...values];
  const columnBuckets = withNoValue(columns.values, columnNoValue);
  const laneBuckets = lanes ? withNoValue(lanes.values, laneNoValue) : [{ id: NO_LANE_ID, label: '' }];

  const cells: BoardCell<T>[] = [];
  const cellById = new Map<string, BoardCell<T>>();
  const locations = new Map<string, ItemLocation>();

  for (const lane of laneBuckets) {
    for (const column of columnBuckets) {
      const id = cellId(lane.id, column.id);
      const placed = buckets.get(id) ?? [];
      placed.sort((a, b) => compareRanked(a, b, strategy));
      const items = placed.map((entry) => entry.item);
      const ranked = placed.map((entry) => ({ id: entry.id, rank: entry.rank }));
      placed.forEach((entry, index) => locations.set(entry.id, { cellId: id, index }));
      const cell: BoardCell<T> = { cellId: id, laneKey: lane.id, columnKey: column.id, lane, column, items, ranked };
      cells.push(cell);
      cellById.set(id, cell);
    }
  }

  return { lanes: laneBuckets, columns: columnBuckets, cells, cellById, locations };
}
