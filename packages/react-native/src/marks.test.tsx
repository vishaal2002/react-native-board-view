// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccessibilityInfo } from 'react-native';
import {
  NO_LANE_ID,
  cellId,
  fractionalRank,
  placesOf,
  projectBoard,
  type GroupBy,
  type MoveOperation,
} from 'board-view-core';
import { NO_MARKS, cardBadgesOf, describeCardOf, presenceByItem, proposedCounts } from './cardMarks';
import { runBoardCommand, type CommandTarget } from './commands';
import { DOT, ageGeometry, ageScale, layoutDots, type AgeLive } from './layout/ageing';
import { liveIndexFor } from './session';
import { defaultLabels } from './theme';
import { nearestStep, observedEntries, pastBoard, useBoardFlow, useBoardTimeline } from './timeline';
import { useBoardController } from './useBoardController';
import type { BoardContextValue } from './context';
import type { BoardProps, MoveProposal } from './types';

interface Task {
  id: string;
  status: string | null;
  lane?: string | null;
  rank: string;
}

const columns = [
  { id: 'todo', label: 'To do' },
  { id: 'doing', label: 'Doing' },
  { id: 'done', label: 'Done' },
];
const groupBy: GroupBy<Task> = { columns: { key: 'status', values: columns } };
const laneGroupBy: GroupBy<Task> = {
  columns: { key: 'status', values: columns },
  lanes: {
    key: 'lane',
    values: [
      { id: 'x', label: 'X' },
      { id: 'y', label: 'Y' },
    ],
  },
};
const ranks = fractionalRank.nBetween(null, null, 6);
const seed: Task[] = [
  { id: 'a', status: 'todo', rank: ranks[0]! },
  { id: 'b', status: 'todo', rank: ranks[1]! },
  { id: 'c', status: 'todo', rank: ranks[2]! },
  { id: 'd', status: 'doing', rank: ranks[3]! },
  { id: 'e', status: 'done', rank: ranks[4]! },
];
const project = (items: readonly Task[], by: GroupBy<Task> = groupBy) =>
  projectBoard({ items, getItemId: (task) => task.id, getRank: (task) => task.rank, groupBy: by });
const todo = cellId(NO_LANE_ID, 'todo');
const doing = cellId(NO_LANE_ID, 'doing');
const done = cellId(NO_LANE_ID, 'done');

beforeEach(() => {
  vi.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('describeCardOf', () => {
  const age = (item: unknown) => (item as { age: number | null }).age;
  it('marks stale per column, with 14 days for columns left out', () => {
    const rules = { getItemAge: age, staleAfterDays: { doing: 3 } };
    expect(describeCardOf({ age: 3 }, 'doing', rules).stale).toBe(true);
    expect(describeCardOf({ age: 3 }, 'todo', rules).stale).toBe(false);
    expect(describeCardOf({ age: 14 }, 'todo', rules).stale).toBe(true);
    expect(describeCardOf({ age: 2 }, 'todo', { getItemAge: age, staleAfterDays: 2 }).stale).toBe(true);
  });

  it('clamps ages and ignores ones that are not finite', () => {
    expect(describeCardOf({ age: -4 }, 'todo', { getItemAge: age }).age).toBe(0);
    expect(describeCardOf({ age: Number.NaN }, 'todo', { getItemAge: age })).toMatchObject({ age: null, stale: false });
    expect(describeCardOf({}, 'todo', {})).toEqual({
      dimmed: false,
      age: null,
      stale: false,
      blocked: false,
      blockedReason: null,
    });
  });

  it('reads blocked as true or a reason, and an empty reason as not blocked', () => {
    const blocked = (item: unknown) => (item as { blocked: boolean | string | null }).blocked;
    expect(describeCardOf({ blocked: true }, 'todo', { getBlocked: blocked })).toMatchObject({
      blocked: true,
      blockedReason: null,
    });
    expect(describeCardOf({ blocked: 'API' }, 'todo', { getBlocked: blocked })).toMatchObject({
      blocked: true,
      blockedReason: 'API',
    });
    expect(describeCardOf({ blocked: '' }, 'todo', { getBlocked: blocked }).blocked).toBe(false);
    expect(describeCardOf({ blocked: null }, 'todo', { getBlocked: blocked }).blocked).toBe(false);
    expect(describeCardOf({}, 'todo', { spotlight: () => false }).dimmed).toBe(true);
  });
});

describe('proposals, presence and badges', () => {
  const model = project(seed);
  const proposals: MoveProposal[] = [
    { id: 'p1', itemId: 'a', to: { columnId: 'done' }, label: 'Ready' },
    { id: 'p2', itemId: 'b', to: { columnId: 'done' } },
    { id: 'p3', itemId: 'gone', to: { columnId: 'done' } },
    { id: 'p4', itemId: 'c', to: { columnId: 'nowhere' } },
  ];

  it('counts proposals into each column, only for cards on the board', () => {
    expect([...proposedCounts(proposals, model.locations)]).toEqual([
      ['done', 2],
      ['nowhere', 1],
    ]);
    expect(proposedCounts(undefined, model.locations).size).toBe(0);
  });

  it('groups presence by card', () => {
    const grouped = presenceByItem([
      { userId: '1', name: 'Priya', itemId: 'a' },
      { userId: '2', name: 'Bob', itemId: 'a' },
      { userId: '3', name: 'Cara', itemId: 'b' },
    ]);
    expect(grouped.get('a')?.map((entry) => entry.name)).toEqual(['Priya', 'Bob']);
    expect(grouped.get('b')).toHaveLength(1);
  });

  it('draws proposals with their target, presence and the diff, and answers through decide', () => {
    const decide = vi.fn();
    const badges = cardBadgesOf({
      proposals,
      presence: presenceByItem([{ userId: '1', name: 'Priya', itemId: 'd' }]),
      changed: new Map([['e', null]]),
      locations: model.locations,
      columns,
      lanes: [],
      hasLanes: false,
      decide,
    });
    expect([...badges.keys()].sort()).toEqual(['a', 'b', 'd', 'e']);
    const shown = badges.get('a')!.proposal!;
    expect(shown).toMatchObject({ id: 'p1', label: 'Ready', target: { column: { id: 'done' }, lane: null } });
    shown.accept();
    badges.get('b')!.proposal!.decline();
    expect(decide.mock.calls).toEqual([
      ['p1', 'accept'],
      ['p2', 'decline'],
    ]);
    expect(badges.get('d')!.presence![0]!.name).toBe('Priya');
    expect(badges.get('e')!.changed).toBe(true);
  });

  it("puts a proposal in the card's own lane unless it names one", () => {
    const items: Task[] = [{ id: 'a', status: 'todo', lane: 'y', rank: ranks[0]! }];
    const lanes = laneGroupBy.lanes!.values;
    const badges = cardBadgesOf({
      proposals: [
        { id: 'p1', itemId: 'a', to: { columnId: 'done' } },
        { id: 'p2', itemId: 'a', to: { columnId: 'done', laneId: 'x' } },
      ],
      presence: new Map(),
      changed: null,
      locations: project(items, laneGroupBy).locations,
      columns,
      lanes,
      hasLanes: true,
      decide: () => undefined,
    });
    // The later proposal for the same card wins.
    expect(badges.get('a')!.proposal!.target.lane?.id).toBe('x');
    const single = cardBadgesOf({
      proposals: [{ id: 'p1', itemId: 'a', to: { columnId: 'done' } }],
      presence: new Map(),
      changed: null,
      locations: project(items, laneGroupBy).locations,
      columns,
      lanes,
      hasLanes: true,
      decide: () => undefined,
    });
    expect(single.get('a')!.proposal!.target.lane?.id).toBe('y');
  });

  it('returns the shared empty map when there is nothing to draw', () => {
    const empty = {
      presence: new Map(),
      changed: null,
      locations: model.locations,
      columns,
      lanes: [],
      hasLanes: false,
      decide: () => undefined,
    };
    expect(cardBadgesOf({ ...empty, proposals: [] })).toBe(NO_MARKS);
    expect(cardBadgesOf({ ...empty, proposals: [{ id: 'p', itemId: 'gone', to: { columnId: 'done' } }] })).toBe(
      NO_MARKS,
    );
  });
});

describe('observedEntries', () => {
  const before = project(seed);
  const moved = seed.map((task) =>
    task.id === 'a' || task.id === 'b'
      ? { ...task, status: 'done', rank: ranks[5]! + (task.id === 'b' ? '1' : '') }
      : task,
  );
  const after = project(moved);
  const board = (model: typeof before, pending: string[] = [], keys = 'status') => ({
    model,
    isPending: (id: string) => pending.includes(id),
    keys,
  });

  it('records what the data moved by itself, with who moved it', () => {
    const entries = observedEntries(board(before), board(after), 42, (id) => (id === 'a' ? 'Priya' : undefined));
    expect(entries.map((entry) => entry.itemId).sort()).toEqual(['a', 'b']);
    expect(entries.find((entry) => entry.itemId === 'a')).toMatchObject({ at: 42, actor: 'Priya', observed: true });
    expect(entries.find((entry) => entry.itemId === 'b')!.actor).toBeUndefined();
  });

  it("leaves out the board's own pending moves, before or after", () => {
    expect(observedEntries(board(before, ['a']), board(after, ['b']), 1).map((entry) => entry.itemId)).toEqual([]);
  });

  it('records nothing for the same board or a new grouping', () => {
    expect(observedEntries(board(before), board(before), 1)).toEqual([]);
    expect(observedEntries(board(before), board(after, [], 'assignee'), 1)).toEqual([]);
  });
});

describe('the ageing chart', () => {
  it('draws bands at the 50th and 85th percentile, without duplicates, and tops out above them', () => {
    expect(ageScale([1, 2, 3, 4, 10], undefined)).toEqual({ bands: [3, 10], top: 12 });
    expect(ageScale([5, 5, 5], undefined).bands).toEqual([5]);
    expect(ageScale([], undefined)).toEqual({ bands: [], top: 1 });
    expect(ageScale([2], [30, -1, Number.NaN, 7])).toEqual({ bands: [7, 30], top: 36 });
  });

  const cell = project(seed).cellById.get(todo)!;
  const ages = new Map([
    ['a', 10],
    ['b', 10],
    ['c', 0],
  ]);
  const dots = layoutDots(cell, ages, 10, { width: 100, height: 210 }, () => '#000', 5);

  it('puts older cards higher, spreads ties sideways and marks ones past the top band', () => {
    expect(dots.map((dot) => dot.itemId)).toEqual(['a', 'b', 'c']);
    const [a, b, c] = dots;
    expect(a!.y).toBe(0);
    expect(c!.y).toBe(200);
    expect(a!.y).toBe(b!.y);
    expect(a!.x).not.toBe(b!.x);
    expect([a!.over, b!.over, c!.over]).toEqual([true, true, false]);
    for (const dot of dots) expect(dot.x >= 0 && dot.x <= 100 - DOT).toBe(true);
  });

  const live = (hidden: string | null = null): { current: AgeLive } => ({
    current: {
      board: { controller: { model: project(seed) } } as unknown as BoardContextValue,
      dots,
      slot: { x: 200, width: 100, collapsed: false } as AgeLive['slot'],
      chartTop: 50,
      chartHeight: 210,
      hidden,
      getScrollX: () => 100,
    },
  });

  it('picks up the dot nearest the finger, using x for dots side by side', () => {
    const geometry = ageGeometry(live());
    const [a, b] = dots;
    const at = (dot: typeof a) => ({ x: 100 + dot!.x + DOT / 2, y: 50 + dot!.y + DOT / 2 });
    expect(geometry.itemAt(at(a).y, at(a).x)?.itemId).toBe('a');
    expect(geometry.itemAt(at(b).y, at(b).x)?.itemId).toBe('b');
    expect(geometry.itemAt(at(a).y, at(a).x + 60)).toBeNull();
    expect(geometry.getRect()).toEqual({ x: 100, y: 50, width: 100, height: 210 });
    expect(geometry.visibleItems()).toHaveLength(3);
    expect(geometry.itemRect('c')).toEqual({ x: 100 + dots[2]!.x, y: 250, width: DOT, height: DOT });
  });

  it('drops a card from elsewhere on top, and leaves a card in its own column where it is', () => {
    expect(ageGeometry(live()).resolve(120)).toBe(0);
    expect(ageGeometry(live('c')).resolve(120)).toBe(2);
  });
});

describe('nearestStep', () => {
  it('snaps to the closest step, ties to the earlier', () => {
    expect(nearestStep([0, 3, 10], 6)).toBe(3);
    expect(nearestStep([0, 3, 10], 7)).toBe(10);
    expect(nearestStep([0, 4], 2)).toBe(0);
    expect(nearestStep([], 5)).toBe(0);
  });
});

describe('runBoardCommand on a full board', () => {
  const target = (overrides: Partial<CommandTarget<Task>> = {}): CommandTarget<Task> => ({
    model: () => project(seed),
    hasLanes: false,
    columnIds: new Set(columns.map((column) => column.id)),
    laneIds: new Set(),
    moveTo: () => true,
    moveManyTo: () => 2,
    undo: () => true,
    canUndo: () => true,
    select: vi.fn(),
    scrollToColumn: vi.fn(),
    revealItem: vi.fn(),
    zoom: (level) => level !== 'compact',
    openMoveSheet: vi.fn(),
    ...overrides,
  });

  it('runs view commands, dropping unknown cards from a selection', () => {
    const board = target();
    expect(runBoardCommand({ type: 'select', itemIds: ['a', 'zz'] }, board).ok).toBe(true);
    expect(board.select).toHaveBeenCalledWith(['a']);
    expect(runBoardCommand({ type: 'scrollToColumn', columnId: 'done' }, board).ok).toBe(true);
    expect(runBoardCommand({ type: 'scrollToColumn', columnId: 'zz' }, board)).toEqual({
      ok: false,
      reason: 'unknown-column',
    });
    expect(runBoardCommand({ type: 'revealItem', itemId: 'a' }, board).ok).toBe(true);
    expect(runBoardCommand({ type: 'revealItem', itemId: 'zz' }, board)).toEqual({ ok: false, reason: 'unknown-item' });
    expect(runBoardCommand({ type: 'openMoveSheet', itemId: 'a' }, board).ok).toBe(true);
    expect(board.openMoveSheet).toHaveBeenCalledWith('a');
    expect(runBoardCommand({ type: 'zoom', level: 'dot' }, board).ok).toBe(true);
    expect(runBoardCommand({ type: 'zoom', level: 'compact' }, board)).toEqual({ ok: false, reason: 'unavailable' });
    expect(runBoardCommand({ type: 'zoom', level: 'card', columnId: 'zz' }, board)).toEqual({
      ok: false,
      reason: 'unknown-column',
    });
  });

  it('says unavailable when the board cannot do it, and checks lanes on swimlane boards', () => {
    const bare = target({
      select: undefined,
      openMoveSheet: undefined,
      scrollToColumn: undefined,
      revealItem: undefined,
    });
    for (const command of [
      { type: 'select', itemIds: [] },
      { type: 'openMoveSheet', itemId: 'a' },
      { type: 'scrollToColumn', columnId: 'done' },
      { type: 'revealItem', itemId: 'a' },
    ])
      expect(runBoardCommand(command, bare)).toEqual({ ok: false, reason: 'unavailable' });
    const lanes = target({ hasLanes: true, laneIds: new Set(['x']) });
    expect(runBoardCommand({ type: 'move', itemId: 'a', to: { columnId: 'done', laneId: 'zz' } }, lanes)).toEqual({
      ok: false,
      reason: 'unknown-column',
    });
    expect(runBoardCommand({ type: 'undo' }, target({ canUndo: () => false }))).toEqual({
      ok: false,
      reason: 'no-change',
    });
    expect(runBoardCommand({ type: 'undo' }, target({ undo: () => false }))).toEqual({ ok: false, reason: 'refused' });
    expect(runBoardCommand({ type: 'moveMany', itemIds: ['zz'], to: { columnId: 'done' } }, target())).toEqual({
      ok: false,
      reason: 'unknown-item',
    });
  });
});

describe('default labels for 1.4', () => {
  it('read naturally', () => {
    expect(defaultLabels.presenceMoving({ names: ['Priya'] })).toBe('Priya is moving this');
    expect(defaultLabels.presenceMoving({ names: ['Priya', 'Bob', 'Cara'] })).toBe(
      'Priya, Bob and Cara are moving this',
    );
    expect(defaultLabels.proposed({ column: 'Done', lane: 'X', label: 'Ready' })).toBe(
      'Suggested: move to Done, X. Ready',
    );
    expect(defaultLabels.proposalCount(1)).toBe('1 suggestion');
    expect(defaultLabels.ageColumnSummary({ column: 'Doing', count: 1, oldest: 4.4, overBand: 0 })).toBe(
      'Doing, 1 card, oldest 4 days',
    );
    expect(defaultLabels.ageColumnSummary({ column: 'Doing', count: 3, oldest: null, overBand: 2 })).toBe(
      'Doing, 3 cards, 2 past the top band',
    );
    expect(defaultLabels.cardChangedWhileDragging({ item: 'A', reason: 'removed' })).toBe(
      'A was removed. Move cancelled',
    );
    expect(defaultLabels.timelinePosition({ at: null, step: 1, steps: 4 })).toBe('Start, step 1 of 4');
  });
});

type Props = BoardProps<Task>;
const props = (overrides: Partial<Props> = {}): Props => ({
  items: seed,
  getItemId: (task) => task.id,
  groupBy,
  onMove: () => undefined,
  renderCard: () => null,
  ...overrides,
});
const ids = (model: ReturnType<typeof project>, cell: string) =>
  model.cellById.get(cell)?.ranked.map((ref) => ref.id) ?? [];

describe('holding items: more cases', () => {
  it('drops a selection next to the cards the user saw, against live data', () => {
    const onMove = vi.fn();
    const { result, rerender } = renderHook((p: Props) => useBoardController(p, defaultLabels), {
      initialProps: props({ onMove }),
    });
    act(() => result.current.hold());
    const held = result.current.model;
    // Someone adds x at the top of Doing while a and b are carried between d and the end.
    const live = [...seed, { id: 'x', status: 'doing', rank: fractionalRank.between(null, ranks[3]!) }];
    rerender(props({ onMove, items: live }));
    act(() => result.current.resume());
    const index = liveIndexFor(held, result.current.liveModel(), 'a', new Set(['a', 'b']), doing, 1);
    act(() => {
      result.current.moveItems(['a', 'b'], doing, index, 'drag', 'a');
    });
    expect(ids(result.current.liveModel(), doing)).toEqual(['x', 'd', 'a', 'b']);
    act(() => result.current.release());
    expect(ids(result.current.model, doing)).toEqual(['x', 'd', 'a', 'b']);
  });

  it('says a held card was removed', () => {
    const { result, rerender } = renderHook((p: Props) => useBoardController(p, defaultLabels), {
      initialProps: props(),
    });
    act(() => result.current.hold());
    rerender(props({ items: seed.filter((task) => task.id !== 'a') }));
    expect(result.current.changedSinceHold('a')).toBe('removed');
    expect(result.current.changedSinceHold('zz')).toBeNull();
    // A new object with the same fields is not a change.
    rerender(props({ items: seed.map((task) => ({ ...task })) }));
    expect(result.current.changedSinceHold('a')).toBeNull();
  });

  it('keeps settling moves out of sight while held, and lets them land on release', async () => {
    let items = seed;
    const { result, rerender } = renderHook((p: Props) => useBoardController(p, defaultLabels), {
      initialProps: props({
        onMove: async (op) => {
          items = items.map((task) => (task.id === op.id ? { ...task, status: 'done', rank: op.rank } : task));
        },
      }),
    });
    act(() => {
      result.current.moveItem('a', done, 0, 'sheet');
    });
    act(() => result.current.hold());
    await act(async () => undefined);
    rerender(props({ items }));
    // The overlay still draws a where it went; the held items do not show it yet.
    expect(ids(result.current.model, done)).toEqual(['a', 'e']);
    act(() => result.current.release());
    expect(ids(result.current.model, done)).toEqual(['a', 'e']);
    expect(result.current.isPending('a')).toBe(false);
  });

  it('a gated move waits through a hold and still lands', () => {
    const onMove = vi.fn();
    const { result } = renderHook((p: Props) => useBoardController(p, defaultLabels), {
      initialProps: props({ onMove, confirmInto: ['done'] }),
    });
    act(() => {
      result.current.moveItem('a', done, 0, 'drag');
    });
    expect(result.current.gate).not.toBeNull();
    act(() => result.current.hold());
    act(() => result.current.release());
    act(() => result.current.submitGate());
    expect(ids(result.current.model, done)).toEqual(['a', 'e']);
  });
});

describe('the journal through the controller: more cases', () => {
  it('records undo as its own move, and a batch with one batch id', () => {
    const { result: timeline } = renderHook(() => useBoardTimeline<Task>());
    const { result } = renderHook((p: Props) => useBoardController(p, defaultLabels), {
      initialProps: props({ timeline: timeline.current }),
    });
    act(() => {
      result.current.moveItems(['a', 'b'], done, 0, 'drag');
    });
    act(() => {
      result.current.undo();
    });
    const entries = timeline.current.entries;
    expect(entries.map((entry) => [entry.itemId, entry.source])).toEqual([
      ['a', 'drag'],
      ['b', 'drag'],
      ['b', 'undo'],
      ['a', 'undo'],
    ]);
    expect(entries[0]!.batchId).toBeDefined();
    expect(entries[0]!.batchId).toBe(entries[1]!.batchId);
    expect(entries[0]!.at).toBe(entries[1]!.at);
  });

  it('records a gated move only once it is submitted, and nothing when it is cancelled', () => {
    const { result: timeline } = renderHook(() => useBoardTimeline<Task>());
    const { result } = renderHook((p: Props) => useBoardController(p, defaultLabels), {
      initialProps: props({ timeline: timeline.current, confirmInto: ['done'] }),
    });
    act(() => {
      result.current.moveItem('a', done, 0, 'drag');
    });
    expect(timeline.current.entries).toHaveLength(0);
    act(() => result.current.cancelGate());
    expect(timeline.current.entries).toHaveLength(0);
    act(() => {
      result.current.moveItem('a', done, 0, 'drag');
    });
    act(() => result.current.submitGate());
    expect(timeline.current.entries).toHaveLength(1);
  });

  it('forgets only the rejected card of a batch', async () => {
    const { result: timeline } = renderHook(() => useBoardTimeline<Task>());
    const onMove = vi.fn(async (op: MoveOperation) => {
      if (op.id === 'b') throw new Error('no');
    });
    const { result } = renderHook((p: Props) => useBoardController(p, defaultLabels), {
      initialProps: props({ timeline: timeline.current, onMove }),
    });
    act(() => {
      result.current.moveItems(['a', 'b'], done, 0, 'drag');
    });
    await act(async () => undefined);
    await act(async () => undefined);
    expect(timeline.current.entries.map((entry) => entry.itemId)).toEqual(['a']);
  });
});

describe('the timeline: more cases', () => {
  const entry = (id: string, at: number) => ({
    id,
    at,
    itemId: 'a',
    from: { cellId: todo, rank: 'a0' },
    to: { cellId: done, rank: 'a1' },
    observed: true,
  });

  it('keeps its place while new entries arrive, and drops the oldest past its limit', () => {
    const { result } = renderHook(() => useBoardTimeline({ limit: 3, initial: [entry('1', 1), entry('2', 2)] }));
    act(() => result.current.seek(1));
    act(() => result.current.core.journal.append([entry('3', 3)]));
    expect(result.current.position).toBe(1);
    act(() => result.current.core.journal.append([entry('4', 4)]));
    expect(result.current.entries.map((e) => e.id)).toEqual(['2', '3', '4']);
    act(() => result.current.seek(99));
    expect(result.current.position).toBeNull();
    act(() => result.current.seek(-3, 'diff'));
    expect(result.current).toMatchObject({ position: 0, mode: 'diff' });
  });

  it('does not play an empty journal, and pauses', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useBoardTimeline());
    act(() => result.current.play());
    expect(result.current.playing).toBe(false);
    act(() => result.current.core.journal.append([entry('1', 1), entry('2', 2)]));
    act(() => result.current.play({ stepMs: 50 }));
    expect(result.current).toMatchObject({ playing: true, position: 0 });
    act(() => result.current.pause());
    act(() => vi.advanceTimersByTime(200));
    expect(result.current).toMatchObject({ playing: false, position: 0 });
  });

  it('flow metrics follow the journal', () => {
    const { result } = renderHook(() => {
      const timeline = useBoardTimeline({ initial: [entry('1', 1000)] });
      return useBoardFlow(timeline, { doneColumns: ['done'] });
    });
    expect(result.current.columns.done?.entered).toBe(1);
    expect(result.current.throughput).toHaveLength(1);
  });

  it('draws a swimlane board as it was, and ignores places in columns that no longer exist', () => {
    const items: Task[] = [
      { id: 'a', status: 'done', lane: 'y', rank: ranks[0]! },
      { id: 'b', status: 'todo', lane: 'x', rank: ranks[1]! },
    ];
    const live = project(items, laneGroupBy);
    const past = pastBoard(
      [
        {
          ...entry('1', 1),
          from: { cellId: cellId('x', 'todo'), rank: 'a5' },
          to: { cellId: cellId('y', 'done'), rank: ranks[0]! },
        },
        {
          ...entry('2', 2),
          itemId: 'b',
          from: { cellId: cellId('x', 'gone'), rank: 'a0' },
          to: { cellId: cellId('x', 'todo'), rank: ranks[1]! },
        },
      ],
      0,
      live,
      items,
      (task) => task.id,
      laneGroupBy,
    );
    expect(past.overlays).toEqual([
      expect.objectContaining({ id: 'a', changes: { status: 'todo', lane: 'x' }, rank: 'a5' }),
    ]);
    const drawn = projectBoard({
      items: past.items,
      getItemId: (task) => task.id,
      getRank: (task) => task.rank,
      groupBy: laneGroupBy,
      overlays: past.overlays,
    });
    expect(placesOf(drawn).get('a')).toEqual({ cellId: cellId('x', 'todo'), rank: 'a5' });
  });
});
