// @vitest-environment jsdom
import fc from 'fast-check';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccessibilityInfo } from 'react-native';
import {
  cellId,
  fractionalRank,
  placesOf,
  projectBoard,
  restoreJournal,
  type GroupBy,
  type JournalEntry,
  type MoveOperation,
} from 'board-view-core';
import { createBoardTester } from './testing';
import { liveIndexFor } from './session';
import { defaultLabels } from './theme';
import { changedSince, pastBoard, stepsOf, useBoardTimeline } from './timeline';
import { useBoardController } from './useBoardController';
import type { BoardProps } from './types';

interface Task {
  id: string;
  status: string | null;
  rank: string;
}

const groupBy: GroupBy<Task> = {
  columns: {
    key: 'status',
    values: [
      { id: 'todo', label: 'To do' },
      { id: 'doing', label: 'Doing' },
      { id: 'done', label: 'Done' },
    ],
  },
};
const ranks = fractionalRank.nBetween(null, null, 4);
const seed: Task[] = [
  { id: 'a', status: 'todo', rank: ranks[0]! },
  { id: 'b', status: 'todo', rank: ranks[1]! },
  { id: 'c', status: 'todo', rank: ranks[2]! },
  { id: 'd', status: 'done', rank: ranks[3]! },
];
const todo = cellId('_', 'todo');
const done = cellId('_', 'done');
const project = (items: readonly Task[]) =>
  projectBoard({ items, getItemId: (task) => task.id, getRank: (task) => task.rank, groupBy });
const ids = (model: ReturnType<typeof project>, cell: string) =>
  model.cellById.get(cell)?.ranked.map((ref) => ref.id) ?? [];

beforeEach(() => {
  vi.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('commands through the test kit', () => {
  it('moves with an origin, and says why a command did nothing', async () => {
    const board = createBoardTester({ items: seed, getItemId: (task) => task.id, groupBy, applyAcceptedMoves: true });
    expect(board.run({ type: 'move', itemId: 'a', to: { columnId: 'done' }, origin: 'agent' })).toMatchObject({
      ok: true,
      moved: 1,
    });
    await board.settle();
    expect(board.column('done')).toEqual(['a', 'd']);
    expect([...board.origins.values()]).toEqual(['agent']);
    expect(board.run({ type: 'move', itemId: 'a', to: { columnId: 'done' } })).toEqual({
      ok: false,
      reason: 'no-change',
    });
    expect(board.run({ type: 'move', itemId: 'zz', to: { columnId: 'done' } })).toEqual({
      ok: false,
      reason: 'unknown-item',
    });
    expect(board.run({ type: 'move', itemId: 'a', to: { columnId: 'nowhere' } })).toEqual({
      ok: false,
      reason: 'unknown-column',
    });
    expect(board.run({ type: 'nope' })).toMatchObject({ ok: false, reason: 'invalid' });
    expect(board.run({ type: 'zoom', level: 'dot' })).toEqual({ ok: false, reason: 'unavailable' });
    expect(board.run({ type: 'moveMany', itemIds: ['b', 'c'], to: { columnId: 'doing' } })).toMatchObject({
      ok: true,
      moved: 2,
    });
    expect(board.run({ type: 'undo' })).toMatchObject({ ok: true });
    board.dispose();
  });

  it('refuses a move the board rules refuse', () => {
    const board = createBoardTester({
      items: seed,
      getItemId: (task) => task.id,
      groupBy,
      canDrop: (_task, target) => target.columnId !== 'doing',
    });
    expect(board.run({ type: 'move', itemId: 'a', to: { columnId: 'doing' } })).toEqual({
      ok: false,
      reason: 'refused',
    });
    board.dispose();
  });

  it('saves moves onMove has not accepted and queues them again on a new board', async () => {
    const first = createBoardTester({
      items: seed,
      getItemId: (task) => task.id,
      groupBy,
      onMove: () => new Promise<void>(() => {}),
      inflightTimeoutMs: 0,
    });
    first.drag('a', { columnId: 'done' });
    const saved = first.serializeQueue();
    first.dispose();
    const second = createBoardTester({ items: seed, getItemId: (task) => task.id, groupBy });
    expect(second.restoreQueue(saved)).toBe(1);
    expect(second.column('done')).toEqual(['a', 'd']);
    await second.settle();
    expect(second.moves.map((op) => op.id)).toEqual(['a']);
    second.dispose();
  });
});

describe('liveIndexFor', () => {
  const held = project(seed);
  it('lands next to the card the user saw above the slot', () => {
    // Someone added x at the top and moved b to Done while d was held between a and b.
    const live = project([
      { id: 'x', status: 'todo', rank: fractionalRank.between(null, ranks[0]!) },
      ...seed.map((task) => (task.id === 'b' ? { ...task, status: 'done' } : task)),
    ]);
    // Held Todo is a, b, c: index 1 is between a and b.
    expect(liveIndexFor(held, live, 'd', new Set(['d']), todo, 1)).toBe(2);
    // Above the slot is gone? Fall back to the card below.
    expect(liveIndexFor(held, live, 'd', new Set(['d']), todo, 2)).toBe(2);
  });

  it('walks out to the nearest card still there when both neighbours left (seen on the Android emulator)', () => {
    // Held Backlog: t1 (lifted), t9, t4, t5, t6, t7. Dropped between t9 and t4; both left during the hold.
    const cards = ['t1', 't9', 't4', 't5', 't6', 't7'];
    const rank = fractionalRank.nBetween(null, null, cards.length);
    const before = project(cards.map((id, at) => ({ id, status: 'todo', rank: rank[at]! })));
    const after = project(
      cards
        .filter((id) => id !== 't9' && id !== 't4')
        .map((id) => ({ id, status: 'todo', rank: rank[cards.indexOf(id)]! })),
    );
    // Live Todo without t1 is t5, t6, t7: the card goes above t5, as the user saw it.
    expect(liveIndexFor(before, after, 't1', new Set(['t1']), todo, 1)).toBe(0);
    // Only t4 is gone: t9, right above the slot, is still there, so the card goes after it.
    const keptAbove = project(
      cards.filter((id) => id !== 't4').map((id) => ({ id, status: 'todo', rank: rank[cards.indexOf(id)]! })),
    );
    expect(liveIndexFor(before, keptAbove, 't1', new Set(['t1']), todo, 1)).toBe(1);
  });

  it('skips the cards that move with it, and clamps when both neighbours are gone', () => {
    // a rides along, so the card goes in above b; a still counts in the index until it moves.
    expect(liveIndexFor(held, held, 'd', new Set(['d', 'a']), todo, 1)).toBe(1);
    const empty = project([{ id: 'd', status: 'done', rank: ranks[3]! }]);
    expect(liveIndexFor(held, empty, 'd', new Set(['d']), todo, 2)).toBe(0);
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

describe('holding items while a card is lifted', () => {
  it('draws the held data until release, plans the drop against live data, and notices a changed card', () => {
    const { result, rerender } = renderHook((p: Props) => useBoardController(p, defaultLabels), {
      initialProps: props(),
    });
    act(() => result.current.hold());
    const remote = seed.map((task) => (task.id === 'c' ? { ...task, status: 'done' } : task));
    rerender(props({ items: remote }));
    // Nothing moved under the finger.
    expect(ids(result.current.model, todo)).toEqual(['a', 'b', 'c']);
    expect(result.current.changedSinceHold('a')).toBeNull();
    expect(result.current.changedSinceHold('c')).toBe('changed');
    act(() => result.current.resume());
    expect(ids(result.current.liveModel(), todo)).toEqual(['a', 'b']);
    act(() => result.current.release());
    expect(ids(result.current.model, done)).toEqual(['c', 'd']);
  });

  it('does nothing with holdChangesWhileDragging off', () => {
    const { result, rerender } = renderHook((p: Props) => useBoardController(p, defaultLabels), {
      initialProps: props({ holdChangesWhileDragging: false }),
    });
    act(() => result.current.hold());
    rerender(props({ holdChangesWhileDragging: false, items: seed.slice(1) }));
    expect(ids(result.current.model, todo)).toEqual(['b', 'c']);
    expect(result.current.holding).toBe(false);
  });

  it('0 wrong drops with remote changes during the drag (property)', () => {
    const remoteChange = fc.record({ item: fc.nat(), column: fc.nat(2), slot: fc.nat(), remove: fc.boolean() });
    fc.assert(
      fc.property(fc.array(remoteChange, { maxLength: 50 }), fc.nat(), (changes, dropAt) => {
        const columns = ['todo', 'doing', 'done'];
        const many = fractionalRank.nBetween(null, null, 12);
        const start: Task[] = many.map((rank, index) => ({ id: `t${index}`, status: columns[index % 3]!, rank }));
        const held = project(start);
        const dragged = 't2';
        // The user dropped the card at an index of held Todo.
        const seen = ids(held, todo).filter((id) => id !== dragged);
        const index = dropAt % (seen.length + 1);
        let live = start;
        for (const change of changes) {
          const target = live[change.item % live.length]!;
          if (target.id === dragged) continue;
          if (change.remove) {
            live = live.filter((task) => task.id !== target.id);
            continue;
          }
          const others = live
            .filter((task) => task.status === columns[change.column] && task.id !== target.id)
            .sort((x, y) => (x.rank < y.rank ? -1 : 1));
          const slot = change.slot % (others.length + 1);
          const rank = fractionalRank.between(others[slot - 1]?.rank ?? null, others[slot]?.rank ?? null);
          live = live.map((task) =>
            task.id === target.id ? { ...task, status: columns[change.column]!, rank } : task,
          );
        }
        const liveModel = project(live);
        const at = liveIndexFor(held, liveModel, dragged, new Set([dragged]), todo, index);
        const board = createBoardTester({ items: live, getItemId: (task) => task.id, groupBy });
        const moved = board.move(dragged, { columnId: 'todo', index: at });
        const after = board.column('todo');
        board.dispose();
        // The card lands next to the nearest card the user saw around the slot that is still in Todo:
        // right after it when it was above, right before it when it was below; the closer one, above on a tie.
        const there = new Set(ids(liveModel, todo));
        let expected: { id: string; side: 'after' | 'before' } | null = null;
        for (let distance = 1; distance <= seen.length && !expected; distance += 1) {
          const above = seen[index - distance];
          const below = seen[index + distance - 1];
          if (above != null && there.has(above)) expected = { id: above, side: 'after' };
          else if (below != null && there.has(below)) expected = { id: below, side: 'before' };
        }
        if (!moved) return after.includes(dragged);
        const landed = after.indexOf(dragged);
        if (!expected) return landed >= 0;
        return expected.side === 'after' ? after[landed - 1] === expected.id : after[landed + 1] === expected.id;
      }),
      { numRuns: 300 },
    );
  });
});

describe('journal through the controller', () => {
  it('records the board’s own moves, and forgets one that rolls back', async () => {
    let reject = (_error: unknown) => {};
    const { result: timeline } = renderHook(() => useBoardTimeline<Task>({ actor: 'me' }));
    const onMove = vi.fn(
      (op: MoveOperation) =>
        new Promise<void>((resolve, fail) => {
          if (op.id === 'b') reject = fail;
          else resolve();
        }),
    );
    const { result } = renderHook((p: Props) => useBoardController(p, defaultLabels), {
      initialProps: props({ onMove, timeline: timeline.current }),
    });
    act(() => {
      result.current.moveItem('a', done, 0, 'drag');
    });
    act(() => {
      result.current.moveToFrom('b', { columnId: 'doing' }, 'agent');
    });
    expect(timeline.current.entries).toHaveLength(2);
    expect(timeline.current.entries[0]).toMatchObject({
      itemId: 'a',
      observed: false,
      source: 'drag',
      actor: 'me',
      from: { cellId: todo, rank: ranks[0] },
      to: { cellId: done },
    });
    expect(timeline.current.entries[1]).toMatchObject({ itemId: 'b', origin: 'agent' });
    // Let onMove run, then refuse b.
    await act(async () => undefined);
    await act(async () => {
      reject(new Error('no'));
    });
    expect(timeline.current.entries.map((entry) => entry.itemId)).toEqual(['a']);
  });
});

describe('the time machine', () => {
  const later = seed.map((task) =>
    task.id === 'a' ? { ...task, status: 'done', rank: fractionalRank.between(null, ranks[3]!) } : task,
  );
  const now = project(later);
  const entries: JournalEntry[] = [
    {
      id: '1',
      at: 10,
      itemId: 'a',
      from: { cellId: todo, rank: ranks[0]! },
      to: { cellId: done, rank: later[0]!.rank },
      observed: true,
    },
    { id: '2', at: 20, itemId: 'e', from: null, to: { cellId: todo, rank: 'a9' }, observed: true },
  ];
  const withE = [...later, { id: 'e', status: 'todo', rank: 'a9' }];

  it('draws the board as it was, leaving out cards that came later', () => {
    const past = pastBoard(entries, 0, project(withE), withE, (task) => task.id, groupBy);
    expect(past.items.map((task) => task.id)).toEqual(['a', 'b', 'c', 'd']);
    const board = projectBoard({
      items: past.items,
      getItemId: (task) => task.id,
      getRank: (task) => task.rank,
      groupBy,
      overlays: past.overlays,
    });
    expect(placesOf(board)).toEqual(placesOf(project(seed)));
  });

  it('lists the cards that changed column since a position', () => {
    expect([...changedSince(entries, 0, now).keys()]).toEqual(['a']);
    expect(changedSince(entries, 1, now).size).toBe(0);
  });

  it('stops once per change', () => {
    expect(stepsOf([])).toEqual([0]);
    expect(stepsOf([...entries, { ...entries[1]!, id: '3' }])).toEqual([0, 1, 3]);
  });

  it('seeks, steps, plays to live, saves and reports changes', () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useBoardTimeline({ initial: JSON.stringify({ version: 1, entries }), onChange }),
    );
    expect(result.current.entries).toHaveLength(2);
    expect(result.current.position).toBeNull();
    act(() => result.current.seek(0));
    expect(result.current).toMatchObject({ position: 0, mode: 'past', at: null });
    act(() => result.current.step(1));
    expect(result.current).toMatchObject({ position: 1, at: 10 });
    act(() => result.current.step(5));
    expect(result.current.position).toBeNull();
    act(() => result.current.seekTime(15, 'diff'));
    expect(result.current).toMatchObject({ position: 1, mode: 'diff' });
    act(() => result.current.play({ from: 0, stepMs: 100 }));
    expect(result.current).toMatchObject({ position: 0, playing: true });
    act(() => vi.advanceTimersByTime(100));
    expect(result.current.position).toBe(1);
    act(() => vi.advanceTimersByTime(100));
    expect(result.current).toMatchObject({ position: null, playing: false });
    expect(restoreJournal(result.current.serialize())).toEqual(entries);
    expect(onChange).not.toHaveBeenCalled();
    act(() => result.current.clear());
    expect(result.current.entries).toEqual([]);
    expect(onChange).toHaveBeenCalledWith([]);
    vi.useRealTimers();
  });
});
