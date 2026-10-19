import { describe, expect, it } from 'vitest';
import { fractionalRank, projectBoard, type GroupBy } from 'board-view-core';
import {
  addDays,
  columnStats,
  dayColumns,
  formatCompact,
  laneDistribution,
  limitState,
  parseDayId,
  plannerDay,
  sumValues,
  toDayId,
} from './insights';

interface Deal {
  id: string;
  stage: string;
  owner: string;
  amount: number | null;
  rank: string;
}

const groupBy: GroupBy<Deal> = {
  columns: {
    key: 'stage',
    values: [
      { id: 'lead', label: 'Lead', color: '#111111' },
      { id: 'won', label: 'Won', color: '#222222' },
    ],
  },
  lanes: {
    key: 'owner',
    values: [
      { id: 'ana', label: 'Ana' },
      { id: 'ben', label: 'Ben' },
    ],
  },
};

const ranks = fractionalRank.nBetween(null, null, 4);
const model = projectBoard<Deal>({
  items: [
    { id: 'a', stage: 'lead', owner: 'ana', amount: 1000, rank: ranks[0]! },
    { id: 'b', stage: 'lead', owner: 'ben', amount: 250.5, rank: ranks[1]! },
    { id: 'c', stage: 'won', owner: 'ana', amount: null, rank: ranks[2]! },
    { id: 'd', stage: 'won', owner: 'ana', amount: 4000, rank: ranks[3]! },
  ],
  getItemId: (deal) => deal.id,
  getRank: (deal) => deal.rank,
  groupBy,
});

describe('columnStats', () => {
  it('counts every lane and sums values, skipping missing ones', () => {
    const stats = columnStats(model, (deal) => deal.amount);
    expect(stats.get('lead')).toEqual({ count: 2, value: 1250.5 });
    expect(stats.get('won')).toEqual({ count: 2, value: 4000 });
  });

  it('leaves value null without getItemValue', () => {
    expect(columnStats(model).get('lead')).toEqual({ count: 2, value: null });
    expect(sumValues([1, 2], undefined)).toBeNull();
    expect(sumValues([1, Number.NaN, 2], (value) => value)).toBe(3);
  });
});

describe('limitState', () => {
  it('reports under, at and over a positive limit, and none without one', () => {
    expect(limitState(2, 3)).toBe('under');
    expect(limitState(3, 3)).toBe('at');
    expect(limitState(4, 3)).toBe('over');
    expect(limitState(4, undefined)).toBe('none');
    expect(limitState(4, 0)).toBe('none');
  });
});

describe('formatCompact', () => {
  it('shortens large numbers and keeps small ones', () => {
    expect(formatCompact(12)).toBe('12');
    expect(formatCompact(1234)).toBe('1.2k');
    expect(formatCompact(1500000)).toBe('1.5M');
    expect(formatCompact(-2500)).toBe('-2.5k');
    expect(formatCompact(250000)).toBe('250k');
    expect(formatCompact(3.14159)).toBe('3.14');
  });
});

describe('laneDistribution', () => {
  it('lists the lane count per column in column order', () => {
    expect(laneDistribution(model, 'ana').map((share) => [share.column.id, share.count])).toEqual([
      ['lead', 1],
      ['won', 2],
    ]);
  });
});

describe('planner days', () => {
  it('round-trips day ids in local time and rejects other ids', () => {
    const date = new Date(2026, 9, 19);
    expect(toDayId(date)).toBe('2026-10-19');
    expect(parseDayId('2026-10-19')?.getDate()).toBe(19);
    expect(parseDayId('2026-02-31')).toBeNull();
    expect(parseDayId('todo')).toBeNull();
    expect(toDayId(addDays(date, 13))).toBe('2026-11-01');
  });

  it('builds day columns with labels and optional colors', () => {
    const columns = dayColumns(new Date(2026, 9, 19), 3, {
      locale: 'en-GB',
      color: (day) => (day.getDay() === 2 ? 'red' : undefined),
    });
    expect(columns.map((column) => column.id)).toEqual(['2026-10-19', '2026-10-20', '2026-10-21']);
    expect(columns[0]?.label).toBe('Mon 19 Oct');
    expect(columns[1]?.color).toBe('red');
    expect(columns[0]).not.toHaveProperty('color');
  });

  it('marks today and weekends', () => {
    const now = new Date(2026, 9, 19);
    expect(plannerDay('2026-10-19', now)).toMatchObject({ today: true, weekend: false });
    expect(plannerDay('2026-10-24', now)).toMatchObject({ today: false, weekend: true });
    expect(plannerDay('todo', now)).toBeNull();
  });
});
