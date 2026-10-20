import { warnOnce } from './session';
import type { BoardProps } from './types';

/** Old prop names still read in 0.8, and the names that replaced them. 1.0 removes the old ones. */
const RENAMED = [
  ['onEndReached', 'onColumnEndReached'],
  ['onColumnsEndReached', 'onEdgeReached'],
  ['cellLimit', 'laneCellLimit'],
] as const;

/**
 * Maps renamed props to their new names, so the rest of the board reads one
 * name. Warns once in development for each old name in use. The new name
 * wins when both are passed.
 */
export function normalizeProps<T>(props: BoardProps<T>): BoardProps<T> {
  let next: BoardProps<T> | null = null;
  for (const [old, current] of RENAMED) {
    if (props[old] === undefined) continue;
    warnOnce(`\`${old}\` is deprecated and will be removed in 1.0. Use \`${current}\` instead.`);
    if (props[current] !== undefined) continue;
    next ??= { ...props };
    (next as unknown as Record<string, unknown>)[current] = props[old];
  }
  return next ?? props;
}
