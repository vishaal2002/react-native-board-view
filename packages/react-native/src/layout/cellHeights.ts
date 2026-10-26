/** Card height used before any swimlane cell has been measured. */
const FALLBACK_CARD_HEIGHT = 72;

/**
 * Heights of swimlane cells. A lane row is as tall as its tallest cell, so a
 * cell outside the column window keeps the height its cards last had, or a
 * guess from the cards measured so far: the lane does not change height as the
 * board pages. Cells stretch to their lane, so this keeps the rows' own
 * heights, never the cell's.
 */
export interface CellHeights {
  /** A cell drew rows (cards, and a placeholder during a drag) of these heights, gap included. */
  record(cellId: string, rows: readonly number[]): void;
  /** Height for a cell that is not drawn, now showing `cards` rows, plus `chrome` for padding and border. */
  estimate(cellId: string, cards: number, chrome: number, minHeight: number): number;
}

export function createCellHeights(): CellHeights {
  const cells = new Map<string, { sum: number; count: number }>();
  // Sums over every measured cell, for the average row.
  let sum = 0;
  let count = 0;
  const perRow = () => (count > 0 ? sum / count : FALLBACK_CARD_HEIGHT);
  return {
    record(cellId, rows) {
      const previous = cells.get(cellId);
      if (previous) {
        sum -= previous.sum;
        count -= previous.count;
      }
      const next = { sum: rows.reduce((total, height) => total + height, 0), count: rows.length };
      cells.set(cellId, next);
      sum += next.sum;
      count += next.count;
    },
    estimate(cellId, cards, chrome, minHeight) {
      const known = cells.get(cellId);
      const rows = known ? known.sum + (cards - known.count) * perRow() : cards * perRow();
      return Math.max(minHeight, Math.round(chrome + rows));
    },
  };
}
