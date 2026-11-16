import { parseCellId, type GroupValue, type ItemLocation, type JournalPlace } from 'board-view-core';
import type { CardDescription, CardMark } from './context';
import type { BoardPresence, CardProposal, MoveProposal } from './types';

export const NO_MARKS: ReadonlyMap<string, CardMark> = new Map();
export const DEFAULT_STALE_DAYS = 14;

export interface CardRules {
  readonly spotlight?: (item: unknown) => boolean;
  readonly getItemAge?: (item: unknown) => number | null | undefined;
  readonly staleAfterDays?: number | Readonly<Record<string, number>>;
  readonly getBlocked?: (item: unknown) => boolean | string | null | undefined;
}

/** Spotlight, age, staleness and blocked state of a card in a column. */
export function describeCardOf(item: unknown, columnKey: string, rules: CardRules): CardDescription {
  const dimmed = rules.spotlight ? !rules.spotlight(item) : false;
  const raw = rules.getItemAge ? rules.getItemAge(item) : null;
  const age = typeof raw === 'number' && Number.isFinite(raw) ? Math.max(0, raw) : null;
  const stale = rules.staleAfterDays;
  const limit = typeof stale === 'number' ? stale : (stale?.[columnKey] ?? DEFAULT_STALE_DAYS);
  const mark = rules.getBlocked ? rules.getBlocked(item) : null;
  const reason = typeof mark === 'string' && mark.length > 0 ? mark : null;
  return {
    dimmed,
    age,
    stale: age != null && age >= limit,
    blocked: mark === true || reason != null,
    blockedReason: reason,
  };
}

/** How many proposals point into each column, counting only cards on the board. */
export function proposedCounts(
  proposals: readonly MoveProposal[] | undefined,
  locations: ReadonlyMap<string, ItemLocation>,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const proposal of proposals ?? []) {
    if (!locations.has(proposal.itemId)) continue;
    counts.set(proposal.to.columnId, (counts.get(proposal.to.columnId) ?? 0) + 1);
  }
  return counts;
}

/** Presence entries grouped by the card they hold. */
export function presenceByItem(presence: readonly BoardPresence[] | undefined): Map<string, BoardPresence[]> {
  const byItem = new Map<string, BoardPresence[]>();
  for (const entry of presence ?? []) {
    const list = byItem.get(entry.itemId);
    if (list) list.push(entry);
    else byItem.set(entry.itemId, [entry]);
  }
  return byItem;
}

export interface BadgeInputs {
  readonly proposals: readonly MoveProposal[] | undefined;
  readonly presence: ReadonlyMap<string, readonly BoardPresence[]>;
  /** The timeline's diff: cards that changed column since the position shown. */
  readonly changed: ReadonlyMap<string, JournalPlace | null> | null;
  readonly locations: ReadonlyMap<string, ItemLocation>;
  readonly columns: readonly GroupValue[];
  readonly lanes: readonly GroupValue[];
  readonly hasLanes: boolean;
  readonly decide: (proposalId: string, decision: 'accept' | 'decline') => void;
}

/**
 * What the board draws on each card besides its content. A proposal for a
 * card that is not on the board, or into a column that does not exist, is
 * left out. Returns the shared empty map when there is nothing to draw.
 */
export function cardBadgesOf(inputs: BadgeInputs): ReadonlyMap<string, CardMark> {
  const { proposals, presence, changed } = inputs;
  if (!proposals?.length && presence.size === 0 && !changed?.size) return NO_MARKS;
  const next = new Map<string, { -readonly [K in keyof CardMark]: CardMark[K] }>();
  const markOf = (itemId: string) => {
    let mark = next.get(itemId);
    if (!mark) next.set(itemId, (mark = {}));
    return mark;
  };
  for (const proposal of proposals ?? []) {
    const at = inputs.locations.get(proposal.itemId);
    const column = inputs.columns.find((entry) => entry.id === proposal.to.columnId);
    if (!at || !column) continue;
    const laneId = inputs.hasLanes ? (proposal.to.laneId ?? parseCellId(at.cellId).laneKey) : null;
    const lane = laneId == null ? null : (inputs.lanes.find((entry) => entry.id === laneId) ?? null);
    const shown: CardProposal = {
      ...proposal,
      target: { column, lane },
      accept: () => inputs.decide(proposal.id, 'accept'),
      decline: () => inputs.decide(proposal.id, 'decline'),
    };
    markOf(proposal.itemId).proposal = shown;
  }
  for (const [itemId, people] of presence) markOf(itemId).presence = people;
  for (const itemId of changed?.keys() ?? []) markOf(itemId).changed = true;
  return next.size === 0 ? NO_MARKS : next;
}
