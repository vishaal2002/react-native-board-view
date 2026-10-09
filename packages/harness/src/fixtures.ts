import { generateNKeysBetween } from 'fractional-indexing';
import { cellId, type GroupBy } from 'react-native-board-view';

export interface SpikeCard {
  id: string;
  title: string;
  rank: string;
  status: string;
  assignee: string;
  height: number;
}

export const statusColumns = {
  key: 'status',
  values: [
    { id: 'todo', label: 'To do' },
    { id: 'doing', label: 'In progress' },
    { id: 'done', label: 'Done' },
  ],
};

export const reviewColumns = {
  key: 'status',
  values: [
    { id: 'todo', label: 'To do' },
    { id: 'doing', label: 'In progress' },
    { id: 'review', label: 'Review' },
    { id: 'done', label: 'Done' },
  ],
};

export const peopleLanes = {
  key: 'assignee',
  values: [
    { id: 'alice', label: 'Alice' },
    { id: 'bob', label: 'Bob' },
    { id: 'cara', label: 'Cara' },
  ],
};

export const kanbanGroup: GroupBy<SpikeCard> = { columns: statusColumns };
export const laneGroup: GroupBy<SpikeCard> = { columns: statusColumns, lanes: peopleLanes };

export function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeCards(
  count: number,
  statuses: readonly string[],
  assignees: readonly string[],
  seed: number,
): SpikeCard[] {
  const ranks = generateNKeysBetween(null, null, count);
  const rand = mulberry32(seed);
  return ranks.map((rank, index) => ({
    id: `c${index + 1}`,
    title: `Card ${index + 1}`,
    rank,
    status: statuses[index % statuses.length] ?? 'todo',
    assignee: assignees[index % assignees.length] ?? 'alice',
    height: 60 + Math.floor(rand() * 161),
  }));
}

export function columnCell(status: string, lane = '_'): string {
  return cellId(lane, status);
}

export function applyMove(items: readonly SpikeCard[], op: { id: string; rank: string; changes: Readonly<Record<string, string | null>> }): SpikeCard[] {
  return items.map((item) => {
    if (item.id !== op.id) return item;
    return {
      ...item,
      rank: op.rank,
      status: op.changes.status ?? item.status,
      assignee: op.changes.assignee ?? item.assignee,
    };
  });
}
