import { NO_LANE_ID, NO_VALUE_ID, NO_VALUE_LABEL, cellId } from './ids';
import { readAxisValue } from './group';
import { projectBoard, type ProjectBoardInput } from './project';
import { compareRanked, fractionalRank } from './rank';
import type { BoardCell, BoardModel, GroupAxis, GroupValue, ItemLocation, MoveOperation, RankStrategy } from './types';

/**
 * Projects the board like `projectBoard`, but remembers the last result and
 * rebuilds only the cells whose cards changed. A cell nothing touched keeps
 * its object, `items` and `ranked` arrays, and a call that changes nothing
 * returns the previous model itself, so memoized lists skip their render.
 */
export interface Projector<T> {
  project(input: ProjectBoardInput<T>): BoardModel<T>;
}

interface Entry<T> {
  item: T;
  id: string;
  rank: string;
  laneKey: string;
  columnKey: string;
  cellId: string;
  /** The `project` call that last saw this id. */
  seen: number;
  /** The `project` call that put it in a new cell or gave it a new rank. */
  moved: number;
}

interface State<T> {
  readonly getItemId: (item: T) => string;
  readonly getRank: (item: T) => string;
  readonly groupBy: ProjectBoardInput<T>['groupBy'];
  readonly strategy: RankStrategy;
  readonly noValueLabel: string;
  readonly columnIds: ReadonlySet<string>;
  readonly laneIds: ReadonlySet<string> | null;
  /** By id. Mutated in place: no model points into it. */
  readonly entries: Map<string, Entry<T>>;
  /** Each cell's entries in display order, as of `model`. */
  members: Map<string, Entry<T>[]>;
  model: BoardModel<T> | null;
  columnNoValue: boolean;
  laneNoValue: boolean;
}

/** Past this many arrivals in one cell, sorting the whole cell beats inserting each one. */
const INSERT_LIMIT = 16;

/**
 * `locations` without copying every card on each change: the changes since
 * the last flatten sit over a shared base. Neither map is ever written once
 * built, so an older model keeps reading its own board.
 */
class Locations implements ReadonlyMap<string, ItemLocation> {
  constructor(
    readonly base: ReadonlyMap<string, ItemLocation>,
    /** Null for a card that left the board. */
    readonly patch: ReadonlyMap<string, ItemLocation | null>,
    readonly size: number,
  ) {}

  get(id: string): ItemLocation | undefined {
    const patched = this.patch.get(id);
    return patched === undefined ? this.base.get(id) : (patched ?? undefined);
  }

  has(id: string): boolean {
    const patched = this.patch.get(id);
    return patched === undefined ? this.base.has(id) : patched !== null;
  }

  *entries(): MapIterator<[string, ItemLocation]> {
    for (const [id, location] of this.patch) if (location) yield [id, location];
    for (const [id, location] of this.base) if (!this.patch.has(id)) yield [id, location];
  }

  *keys(): MapIterator<string> {
    for (const [id] of this.entries()) yield id;
  }

  *values(): MapIterator<ItemLocation> {
    for (const [, location] of this.entries()) yield location;
  }

  forEach(callback: (value: ItemLocation, key: string, map: ReadonlyMap<string, ItemLocation>) => void): void {
    for (const [id, location] of this.entries()) callback(location, id, this);
  }

  [Symbol.iterator](): MapIterator<[string, ItemLocation]> {
    return this.entries();
  }
}

/** Writes changes over `previous` and returns the next `locations`, flattening once the patch grows. */
function nextLocations(
  previous: ReadonlyMap<string, ItemLocation>,
  changes: ReadonlyMap<string, ItemLocation | null>,
): ReadonlyMap<string, ItemLocation> {
  const base = previous instanceof Locations ? previous.base : previous;
  const patch = new Map(previous instanceof Locations ? previous.patch : []);
  let size = previous.size;
  for (const [id, location] of changes) {
    const had = previous.has(id);
    if (location && !had) size += 1;
    else if (!location && had) size -= 1;
    patch.set(id, location);
  }
  if (patch.size <= 64 + (base.size >> 3)) return new Locations(base, patch, size);
  const flat = new Map(base);
  for (const [id, location] of patch) {
    if (location) flat.set(id, location);
    else flat.delete(id);
  }
  return flat;
}

function keyOf<T>(axis: GroupAxis<T>, known: ReadonlySet<string>, item: T, overlay: MoveOperation | undefined): string {
  const raw =
    overlay != null && Object.hasOwn(overlay.changes, axis.key)
      ? (overlay.changes[axis.key] ?? null)
      : readAxisValue(axis, item);
  return raw != null && known.has(raw) ? raw : NO_VALUE_ID;
}

function stateFor<T>(input: ProjectBoardInput<T>): State<T> {
  const { columns, lanes } = input.groupBy;
  return {
    getItemId: input.getItemId,
    getRank: input.getRank,
    groupBy: input.groupBy,
    strategy: input.strategy ?? fractionalRank,
    noValueLabel: input.noValueLabel ?? NO_VALUE_LABEL,
    columnIds: new Set(columns.values.map((value) => value.id)),
    laneIds: lanes ? new Set(lanes.values.map((value) => value.id)) : null,
    entries: new Map(),
    members: new Map(),
    model: null,
    columnNoValue: false,
    laneNoValue: false,
  };
}

function sameInputs<T>(state: State<T>, input: ProjectBoardInput<T>): boolean {
  return (
    state.getItemId === input.getItemId &&
    state.getRank === input.getRank &&
    state.groupBy === input.groupBy &&
    state.strategy === (input.strategy ?? fractionalRank) &&
    state.noValueLabel === (input.noValueLabel ?? NO_VALUE_LABEL)
  );
}

function makeCell<T>(lane: GroupValue, column: GroupValue, members: readonly Entry<T>[]): BoardCell<T> {
  return {
    cellId: cellId(lane.id, column.id),
    laneKey: lane.id,
    columnKey: column.id,
    lane,
    column,
    items: members.map((entry) => entry.item),
    ranked: members.map((entry) => ({ id: entry.id, rank: entry.rank })),
  };
}

function insertSorted<T>(list: Entry<T>[], entry: Entry<T>, strategy: RankStrategy): void {
  let low = 0;
  let high = list.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (compareRanked(list[middle]!, entry, strategy) < 0) low = middle + 1;
    else high = middle;
  }
  list.splice(low, 0, entry);
}

function buildAll<T>(state: State<T>): BoardModel<T> {
  const { columns, lanes } = state.groupBy;
  const noValue: GroupValue = { id: NO_VALUE_ID, label: state.noValueLabel };
  const columnBuckets = state.columnNoValue ? [...columns.values, noValue] : [...columns.values];
  let laneBuckets: GroupValue[] = [{ id: NO_LANE_ID, label: '' }];
  if (lanes) laneBuckets = state.laneNoValue ? [...lanes.values, noValue] : [...lanes.values];
  const members = new Map<string, Entry<T>[]>();
  for (const entry of state.entries.values()) {
    const list = members.get(entry.cellId);
    if (list) list.push(entry);
    else members.set(entry.cellId, [entry]);
  }
  for (const list of members.values()) list.sort((a, b) => compareRanked(a, b, state.strategy));
  state.members = members;

  const cells: BoardCell<T>[] = [];
  const cellById = new Map<string, BoardCell<T>>();
  const locations = new Map<string, ItemLocation>();
  for (const lane of laneBuckets) {
    for (const column of columnBuckets) {
      const cell = makeCell(lane, column, members.get(cellId(lane.id, column.id)) ?? []);
      cell.ranked.forEach((ref, index) => locations.set(ref.id, { cellId: cell.cellId, index }));
      cells.push(cell);
      cellById.set(cell.cellId, cell);
    }
  }
  return { lanes: laneBuckets, columns: columnBuckets, cells, cellById, locations };
}

function rebuild<T>(
  state: State<T>,
  model: BoardModel<T>,
  dirty: ReadonlySet<string>,
  arrivals: ReadonlyMap<string, Entry<T>[]>,
  removed: readonly string[],
  call: number,
): BoardModel<T> {
  const changes = new Map<string, ItemLocation | null>();
  for (const id of removed) changes.set(id, null);
  const cellById = new Map(model.cellById);
  const cells = model.cells.map((cell) => {
    if (!dirty.has(cell.cellId)) return cell;
    const at = cell.cellId;
    // Cards that stayed, in their old order, then each arrival in its place.
    const list = (state.members.get(at) ?? []).filter(
      (entry) => entry.seen === call && entry.moved !== call && entry.cellId === at,
    );
    const incoming = arrivals.get(at) ?? [];
    if (incoming.length > INSERT_LIMIT) {
      list.push(...incoming);
      list.sort((a, b) => compareRanked(a, b, state.strategy));
    } else {
      for (const entry of incoming) insertSorted(list, entry, state.strategy);
    }
    state.members.set(at, list);
    const next = makeCell(cell.lane, cell.column, list);
    next.ranked.forEach((ref, index) => {
      const old = model.locations.get(ref.id);
      if (old?.cellId !== at || old.index !== index) changes.set(ref.id, { cellId: at, index });
    });
    cellById.set(at, next);
    return next;
  });
  const locations = changes.size > 0 ? nextLocations(model.locations, changes) : model.locations;
  return { lanes: model.lanes, columns: model.columns, cells, cellById, locations };
}

export function createProjector<T>(): Projector<T> {
  let state: State<T> | null = null;
  let call = 0;

  return {
    project(input) {
      if (!state || !sameInputs(state, input)) state = stateFor(input);
      const current = state;
      call += 1;

      const overlays = new Map<string, MoveOperation>();
      for (const overlay of input.overlays ?? []) overlays.set(overlay.id, overlay);
      const { columns, lanes } = current.groupBy;
      const dirty = new Set<string>();
      // Cards new to a cell, or with a new rank there.
      const arrivals = new Map<string, Entry<T>[]>();
      const arrive = (entry: Entry<T>) => {
        entry.moved = call;
        dirty.add(entry.cellId);
        const list = arrivals.get(entry.cellId);
        if (list) list.push(entry);
        else arrivals.set(entry.cellId, [entry]);
      };
      let columnNoValue = false;
      let laneNoValue = false;
      let seen = 0;

      for (const item of input.items) {
        const id = current.getItemId(item);
        const overlay = overlays.get(id);
        const columnKey = keyOf(columns, current.columnIds, item, overlay);
        const laneKey = lanes && current.laneIds ? keyOf(lanes, current.laneIds, item, overlay) : NO_LANE_ID;
        const rank = overlay?.rank ?? current.getRank(item);
        if (columnKey === NO_VALUE_ID) columnNoValue = true;
        if (laneKey === NO_VALUE_ID) laneNoValue = true;
        let entry = current.entries.get(id);
        if (entry == null) {
          entry = { item, id, rank, laneKey, columnKey, cellId: cellId(laneKey, columnKey), seen: call, moved: 0 };
          current.entries.set(id, entry);
          arrive(entry);
        } else {
          // The same id twice: `projectBoard` keeps both copies, so let it decide.
          if (entry.seen === call) {
            state = null;
            return projectBoard(input);
          }
          entry.seen = call;
          const item0 = entry.item;
          entry.item = item;
          if (entry.laneKey !== laneKey || entry.columnKey !== columnKey) {
            dirty.add(entry.cellId);
            entry.cellId = cellId(laneKey, columnKey);
            entry.laneKey = laneKey;
            entry.columnKey = columnKey;
            entry.rank = rank;
            arrive(entry);
          } else if (entry.rank !== rank) {
            entry.rank = rank;
            arrive(entry);
          } else if (item0 !== item) {
            dirty.add(entry.cellId);
          }
        }
        seen += 1;
      }

      const removed: string[] = [];
      if (current.entries.size > seen) {
        for (const entry of current.entries.values()) {
          if (entry.seen === call) continue;
          removed.push(entry.id);
          dirty.add(entry.cellId);
        }
        for (const id of removed) current.entries.delete(id);
      }

      let model = current.model;
      if (model == null || columnNoValue !== current.columnNoValue || laneNoValue !== current.laneNoValue) {
        current.columnNoValue = columnNoValue;
        current.laneNoValue = laneNoValue;
        model = buildAll(current);
      } else if (dirty.size > 0) {
        model = rebuild(current, model, dirty, arrivals, removed, call);
      }
      current.model = model;
      return model;
    },
  };
}
