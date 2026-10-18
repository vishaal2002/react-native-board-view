/**
 * Group and move types for the board projection.
 * The library never mutates application items. `applyKey` is stored so the
 * app can apply a move with the same config the board used to read it.
 */

export interface GroupValue {
  readonly id: string;
  readonly label: string;
  /** Optional accent for headers and the move sheet. Display only. */
  readonly color?: string;
}

export interface GroupAxis<T> {
  /** Field name written into move operations, e.g. "status". */
  readonly key: string;
  /** Explicit order. Empty entries are real columns or lanes. */
  readonly values: readonly GroupValue[];
  /** Read the group key. Defaults to `item[key]`. Return null for no value. */
  readonly getKey?: (item: T) => string | null | undefined;
  /**
   * App-supplied writer. The library does not call this while projecting.
   * `null` means the no-value bucket.
   */
  readonly applyKey?: (item: T, value: string | null) => T;
}

export interface GroupBy<T> {
  readonly columns: GroupAxis<T>;
  readonly lanes?: GroupAxis<T>;
}

/** One global rank per item. Opaque sortable string. */
export interface RankedRef {
  readonly id: string;
  readonly rank: string;
}

export interface RankStrategy {
  between(before: string | null, after: string | null): string;
  nBetween(before: string | null, after: string | null, count: number): string[];
  compare(a: string, b: string): number;
}

/** What started a move. `undo` is the board reverting an earlier move. */
export type MoveSource = 'drag' | 'sheet' | 'swipe' | 'accessibility' | 'api' | 'undo';

/**
 * A single move. `opId` is unique so the app can dedupe retries.
 * `changes` / `from` carry every grouped field the board writes
 * (a swimlane drop may include two). `null` is the no-value bucket.
 */
export interface MoveOperation {
  readonly opId: string;
  readonly id: string;
  readonly changes: Readonly<Record<string, string | null>>;
  readonly from: Readonly<Record<string, string | null>>;
  readonly rank: string;
  /**
   * The visible cards the moved card lands between in the target cell, in
   * display order; null at either end. A server that keeps its own order
   * (integer positions, LexoRank) can place the card from these instead of
   * `rank`.
   */
  readonly previousId: string | null;
  readonly nextId: string | null;
  readonly source: MoveSource;
}

export interface BoardCell<T> {
  readonly cellId: string;
  readonly laneKey: string;
  readonly columnKey: string;
  readonly lane: GroupValue;
  readonly column: GroupValue;
  /** Items in display order: global rank filtered to this cell, ties by id. */
  readonly items: readonly T[];
  /** Ids and effective ranks (overlay included), parallel to `items`. */
  readonly ranked: readonly RankedRef[];
}

export interface ItemLocation {
  readonly cellId: string;
  readonly index: number;
}

export interface BoardModel<T> {
  readonly lanes: readonly GroupValue[];
  readonly columns: readonly GroupValue[];
  readonly cells: readonly BoardCell<T>[];
  readonly cellById: ReadonlyMap<string, BoardCell<T>>;
  /** Where each item is displayed, overlays included. */
  readonly locations: ReadonlyMap<string, ItemLocation>;
}

export interface ItemMoveSnapshot {
  readonly rank: string;
  readonly fields: Readonly<Record<string, string | null>>;
}
