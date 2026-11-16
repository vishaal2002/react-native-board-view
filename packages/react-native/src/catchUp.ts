import {
  NO_LANE_ID,
  NO_VALUE_ID,
  fractionalRank,
  parseCellId,
  type BoardModel,
  type GroupBy,
  type MoveOperation,
  type RankStrategy,
} from 'board-view-core';
import type { BoardSnapshot } from './types';

/** Where every card is now, as plain JSON an app can keep (`ref.snapshot()`). */
export function snapshotOf<T>(model: BoardModel<T>, at: number = Date.now()): BoardSnapshot {
  const places: Record<string, readonly [string, number]> = {};
  for (const [itemId, location] of model.locations) places[itemId] = [location.cellId, location.index];
  return { version: 1, at, places };
}

/** A group key back from a cell id's part: the No value bucket is null. */
function rawKey(key: string): string | null {
  return key === NO_VALUE_ID ? null : key;
}

/**
 * The cards a snapshot knew, and one pending move per card that puts it back
 * where the snapshot had it, in the snapshot's order. Projected together they
 * draw the board as it was. Cards the snapshot never saw, and cards whose
 * column or lane no longer exists, are left out: they come in fresh.
 */
export function snapshotBoard<T>(
  snapshot: BoardSnapshot,
  items: readonly T[],
  getItemId: (item: T) => string,
  groupBy: GroupBy<T>,
  strategy: RankStrategy = fractionalRank,
): { items: T[]; overlays: MoveOperation[] } {
  const columns = new Set(groupBy.columns.values.map((value) => value.id));
  const lanes = groupBy.lanes ? new Set(groupBy.lanes.values.map((value) => value.id)) : null;
  const known = (key: string, ids: ReadonlySet<string>) => key === NO_VALUE_ID || ids.has(key);
  const byCell = new Map<string, { itemId: string; index: number }[]>();
  const kept: T[] = [];
  for (const item of items) {
    const itemId = getItemId(item);
    // `places` is a plain object: an id such as "constructor" must not read Object.prototype.
    const place = Object.hasOwn(snapshot.places, itemId) ? snapshot.places[itemId] : undefined;
    if (!place) continue;
    const [cellId, index] = place;
    let parts: { laneKey: string; columnKey: string };
    try {
      parts = parseCellId(cellId);
    } catch {
      continue;
    }
    if (!known(parts.columnKey, columns)) continue;
    if (lanes ? !known(parts.laneKey, lanes) : parts.laneKey !== NO_LANE_ID) continue;
    kept.push(item);
    const list = byCell.get(cellId);
    if (list) list.push({ itemId, index });
    else byCell.set(cellId, [{ itemId, index }]);
  }
  const overlays: MoveOperation[] = [];
  for (const [cellId, entries] of byCell) {
    entries.sort((a, b) => a.index - b.index);
    const ranks = strategy.nBetween(null, null, entries.length);
    const { laneKey, columnKey } = parseCellId(cellId);
    const changes: Record<string, string | null> = { [groupBy.columns.key]: rawKey(columnKey) };
    if (groupBy.lanes) changes[groupBy.lanes.key] = rawKey(laneKey);
    entries.forEach(({ itemId }, index) => {
      overlays.push({
        opId: `snapshot:${itemId}`,
        id: itemId,
        changes,
        from: {},
        rank: ranks[index]!,
        previousId: null,
        nextId: null,
        source: 'api',
      });
    });
  }
  return { items: kept, overlays };
}

/** What changed since a snapshot: cards in another cell, cards it never saw, and cards gone since. */
export function catchUpCounts<T>(
  snapshot: BoardSnapshot,
  model: BoardModel<T>,
): { moved: number; added: number; removed: number } {
  let moved = 0;
  let added = 0;
  for (const [itemId, location] of model.locations) {
    const place = Object.hasOwn(snapshot.places, itemId) ? snapshot.places[itemId] : undefined;
    if (!place) added += 1;
    else if (place[0] !== location.cellId) moved += 1;
  }
  let removed = 0;
  for (const itemId of Object.keys(snapshot.places)) if (!model.locations.has(itemId)) removed += 1;
  return { moved, added, removed };
}
