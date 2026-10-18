import type { BoardModel } from 'board-view-core';

/**
 * The model the layouts draw: columns with no cards in any lane, and lanes
 * with no cards, left out when asked. Cells, `cellById` and locations stay
 * whole, so moves into a hidden column still plan against the real board.
 */
export function visibleModel<T>(model: BoardModel<T>, hideColumns: boolean, hideLanes: boolean): BoardModel<T> {
  if (!hideColumns && !hideLanes) return model;
  const usedColumns = new Set<string>();
  const usedLanes = new Set<string>();
  for (const cell of model.cells) {
    if (cell.items.length === 0) continue;
    usedColumns.add(cell.columnKey);
    usedLanes.add(cell.laneKey);
  }
  const columns = hideColumns ? model.columns.filter((column) => usedColumns.has(column.id)) : model.columns;
  const lanes = hideLanes ? model.lanes.filter((lane) => usedLanes.has(lane.id)) : model.lanes;
  if (columns.length === model.columns.length && lanes.length === model.lanes.length) return model;
  const shownColumns = new Set(columns.map((column) => column.id));
  const shownLanes = new Set(lanes.map((lane) => lane.id));
  return {
    ...model,
    columns,
    lanes,
    cells: model.cells.filter((cell) => shownColumns.has(cell.columnKey) && shownLanes.has(cell.laneKey)),
  };
}
