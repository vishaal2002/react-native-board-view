import { fractionalRank, type GroupAxis, type GroupBy, type GroupValue } from 'react-native-board-view';

export type Priority = 'urgent' | 'high' | 'medium' | 'low';

export interface Task {
  id: string;
  title: string;
  description?: string;
  rank: string;
  status: string | null;
  assignee: string | null;
  tags: string[];
  priority: Priority;
  due?: string;
  locked?: boolean;
  /** Fixed card height for the scale test. */
  height?: number;
}

export const STATUSES: GroupValue[] = [
  { id: 'backlog', label: 'Backlog', color: '#8B95A7' },
  { id: 'todo', label: 'To do', color: '#4F86F7' },
  { id: 'doing', label: 'In progress', color: '#F2A93B' },
  { id: 'review', label: 'Review', color: '#9B6CF2' },
  { id: 'done', label: 'Done', color: '#2DB67C' },
];

export const PEOPLE: GroupValue[] = [
  { id: 'alice', label: 'Alice Moreau', color: '#E5484D' },
  { id: 'bob', label: 'Bob Chen', color: '#2F6FEB' },
  { id: 'cara', label: 'Cara Diaz', color: '#9B6CF2' },
  { id: 'dev', label: 'Dev Patel', color: '#0EA5A4' },
];

export const TAG_COLORS: Record<string, string> = {
  Bug: '#E5484D',
  Feature: '#2F6FEB',
  Design: '#9B6CF2',
  Docs: '#2DB67C',
  Infra: '#E58A1F',
  Research: '#0E9F9F',
};

export const PRIORITY_COLORS: Record<Priority, string> = {
  urgent: '#E5484D',
  high: '#F2A93B',
  medium: '#4F86F7',
  low: '#8B95A7',
};

const STATUS_AXIS: GroupAxis<Task> = { key: 'status', values: STATUSES };
const PEOPLE_AXIS: GroupAxis<Task> = { key: 'assignee', values: PEOPLE };

export const kanbanGroupBy: GroupBy<Task> = { columns: STATUS_AXIS };
export const swimlaneGroupBy: GroupBy<Task> = { columns: STATUS_AXIS, lanes: PEOPLE_AXIS };

const VERBS = ['Design', 'Build', 'Fix', 'Refactor', 'Document', 'Test', 'Ship', 'Review', 'Profile', 'Polish'];
const THINGS = [
  'onboarding flow',
  'crash on resume',
  'search filters',
  'offline queue',
  'settings screen',
  'push notifications',
  'billing page',
  'image cache',
  'dark mode',
  'sync conflicts',
  'export to CSV',
  'login with SSO',
  'board animations',
  'release notes',
  'error reporting',
  'deep links',
];
const DETAILS = [
  'Agree on the spec with design before starting.',
  'Repro steps are in the ticket thread.',
  'Needs a quick pass from QA on Android.',
  'Blocked on the API change landing first.',
  undefined,
  'Small one. Good first issue.',
  undefined,
];
const TAG_NAMES = Object.keys(TAG_COLORS);
const PRIORITIES: Priority[] = ['urgent', 'high', 'medium', 'medium', 'low', 'low'];
const MONTHS = ['Oct', 'Nov', 'Dec'];

/** Small deterministic PRNG, so every launch shows the same board. */
export function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(next: () => number, list: readonly T[]): T {
  return list[Math.floor(next() * list.length)] as T;
}

export interface MakeTasksOptions {
  seed?: number;
  statuses?: readonly (string | null)[];
  assignees?: readonly (string | null)[];
  heights?: { min: number; max: number };
  lockedEvery?: number;
}

/** Tasks with ranks from the board's own rank strategy, spread across statuses and people. */
export function makeTasks(count: number, options: MakeTasksOptions = {}): Task[] {
  const next = random(options.seed ?? 7);
  const statuses = options.statuses ?? STATUSES.map((status) => status.id);
  const assignees = options.assignees ?? PEOPLE.map((person) => person.id);
  const ranks = fractionalRank.nBetween(null, null, count);
  return ranks.map((rank, index) => {
    const tagCount = Math.floor(next() * 3);
    const tags = new Set<string>();
    for (let tag = 0; tag < tagCount; tag += 1) tags.add(pick(next, TAG_NAMES));
    const heights = options.heights;
    return {
      id: `t${index + 1}`,
      title: `${pick(next, VERBS)} ${pick(next, THINGS)}`,
      description: pick(next, DETAILS),
      rank,
      status: statuses[Math.floor(next() * statuses.length)] ?? null,
      assignee: assignees[Math.floor(next() * assignees.length)] ?? null,
      tags: [...tags],
      priority: pick(next, PRIORITIES),
      due: next() > 0.45 ? `${pick(next, MONTHS)} ${1 + Math.floor(next() * 28)}` : undefined,
      locked: options.lockedEvery ? index % options.lockedEvery === 0 : undefined,
      height: heights ? heights.min + Math.floor(next() * (heights.max - heights.min + 1)) : undefined,
    };
  });
}

export function personName(id: string | null): string | undefined {
  return PEOPLE.find((person) => person.id === id)?.label;
}
