import type { BoardModel } from 'board-view-core';

/** More cards than this changing cell at once is a regroup or a new filter, not a move to flash. */
const EXTERNAL_MOVE_LIMIT = 6;

/**
 * Cards that `items` moved to another cell by themselves: not by a pending
 * move of this board (it had or has an overlay) and not on the first render.
 */
export function externalMovesBetween<T>(
  before: BoardModel<T> | null,
  after: BoardModel<T>,
  pendingBefore: (itemId: string) => boolean,
  pendingNow: (itemId: string) => boolean,
): string[] {
  if (!before) return [];
  const moved: string[] = [];
  for (const cell of after.cells) {
    // A card that changed cell changed the cell it landed in, so a cell the projection kept has none.
    if (before.cellById.get(cell.cellId) === cell) continue;
    for (const { id: itemId } of cell.ranked) {
      const previous = before.locations.get(itemId);
      if (!previous || previous.cellId === cell.cellId) continue;
      if (pendingBefore(itemId) || pendingNow(itemId)) continue;
      moved.push(itemId);
      if (moved.length > EXTERNAL_MOVE_LIMIT) return [];
    }
  }
  return moved;
}

/**
 * Cards whose cell or position differs between two boards. Only cells the
 * projection rebuilt are read: a cell it kept has the same cards in the same
 * places.
 */
export function changedBetween<T>(before: BoardModel<T>, after: BoardModel<T>): Set<string> {
  const changed = new Set<string>();
  if (before === after) return changed;
  for (const cell of after.cells) {
    if (before.cellById.get(cell.cellId) === cell) continue;
    cell.ranked.forEach(({ id }, index) => {
      const previous = before.locations.get(id);
      if (previous?.cellId !== cell.cellId || previous.index !== index) changed.add(id);
    });
  }
  return changed;
}
