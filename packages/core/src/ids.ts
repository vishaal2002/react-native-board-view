/** Stable id for items that match no configured value. */
export const NO_VALUE_ID = '__no_value__';

export const NO_VALUE_LABEL = 'No value';

/** Lane key used when the board has no swimlanes. */
export const NO_LANE_ID = '_';

const CELL_SEPARATOR = '::';

export function cellId(laneKey: string, columnKey: string): string {
  if (laneKey.includes(CELL_SEPARATOR) || columnKey.includes(CELL_SEPARATOR)) {
    throw new Error(
      `Group ids cannot contain "${CELL_SEPARATOR}" (got lane "${laneKey}", column "${columnKey}").`,
    );
  }
  return `${laneKey}${CELL_SEPARATOR}${columnKey}`;
}

export function parseCellId(value: string): { laneKey: string; columnKey: string } {
  const index = value.indexOf(CELL_SEPARATOR);
  if (index <= 0 || index !== value.lastIndexOf(CELL_SEPARATOR)) {
    throw new Error(`Invalid cellId "${value}". Expected "{laneKey}::{columnKey}".`);
  }
  return {
    laneKey: value.slice(0, index),
    columnKey: value.slice(index + CELL_SEPARATOR.length),
  };
}

let opCounter = 0;

/** Unique per move. Not a security token. Safe in React Native and Node. */
export function createOpId(): string {
  opCounter += 1;
  const time = Date.now().toString(36);
  const count = opCounter.toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  return `mv_${time}_${count}_${rand}`;
}
