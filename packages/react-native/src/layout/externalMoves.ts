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
  for (const [itemId, location] of after.locations) {
    const previous = before.locations.get(itemId);
    if (!previous || previous.cellId === location.cellId) continue;
    if (pendingBefore(itemId) || pendingNow(itemId)) continue;
    moved.push(itemId);
    if (moved.length > EXTERNAL_MOVE_LIMIT) return [];
  }
  return moved;
}
