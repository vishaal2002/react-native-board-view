import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { cellId, createProjector, projectBoard } from './index';
import type { GroupBy, MoveOperation, ProjectBoardInput } from './index';

interface Card {
  id: string;
  status: string | null;
  lane: string | null;
  rank: string;
}

const columns = {
  key: 'status',
  values: [
    { id: 'todo', label: 'To do' },
    { id: 'doing', label: 'Doing' },
    { id: 'done', label: 'Done' },
  ],
};
const laned: GroupBy<Card> = {
  columns,
  lanes: {
    key: 'lane',
    values: [
      { id: 'x', label: 'X' },
      { id: 'y', label: 'Y' },
    ],
  },
};
const flat: GroupBy<Card> = { columns };
const getItemId = (card: Card) => card.id;
const getRank = (card: Card) => card.rank;

const statuses = ['todo', 'doing', 'done', 'bogus', null];
const laneValues = ['x', 'y', 'zz', null];
const ranks = ['a0', 'a1', 'a2', 'a0V', 'Zz'];

interface Spec {
  readonly id: number;
  readonly status: number;
  readonly lane: number;
  readonly rank: number;
  /** A new object even when nothing changed, as `setState` with a spread does. */
  readonly fresh: boolean;
}

interface Step {
  readonly cards: readonly Spec[];
  readonly overlays: readonly { id: number; status: number | null; lane: number | null; rank: number }[];
  readonly lanes: boolean;
  readonly label: boolean;
}

const spec: fc.Arbitrary<Spec> = fc.record({
  id: fc.nat(11),
  status: fc.nat(statuses.length - 1),
  lane: fc.nat(laneValues.length - 1),
  rank: fc.nat(ranks.length - 1),
  fresh: fc.boolean(),
});

const step: fc.Arbitrary<Step> = fc.record({
  cards: fc.oneof(
    { weight: 4, arbitrary: fc.uniqueArray(spec, { selector: (card) => card.id, maxLength: 12 }) },
    { weight: 1, arbitrary: fc.array(spec, { maxLength: 12 }) },
  ),
  overlays: fc.array(
    fc.record({
      id: fc.nat(11),
      status: fc.option(fc.nat(statuses.length - 1)),
      lane: fc.option(fc.nat(laneValues.length - 1)),
      rank: fc.nat(ranks.length - 1),
    }),
    { maxLength: 3 },
  ),
  lanes: fc.boolean(),
  label: fc.boolean(),
});

function overlayOf(entry: Step['overlays'][number], index: number): MoveOperation {
  const changes: Record<string, string | null> = {};
  if (entry.status !== null) changes.status = statuses[entry.status] ?? null;
  if (entry.lane !== null) changes.lane = laneValues[entry.lane] ?? null;
  return { opId: `op${index}`, id: `c${entry.id}`, changes, from: {}, rank: ranks[entry.rank] ?? 'a0' };
}

describe('createProjector', () => {
  it('projects the same board as projectBoard over any run of changes', () => {
    fc.assert(
      fc.property(fc.array(step, { minLength: 1, maxLength: 12 }), (steps) => {
        const projector = createProjector<Card>();
        let previous = new Map<string, Card>();
        for (const { cards, overlays, lanes, label } of steps) {
          const next = new Map<string, Card>();
          const items = cards.map((card) => {
            const id = `c${card.id}`;
            const value: Card = {
              id,
              status: statuses[card.status] ?? null,
              lane: laneValues[card.lane] ?? null,
              rank: ranks[card.rank] ?? 'a0',
            };
            const old = previous.get(id);
            const same =
              old && !card.fresh && old.status === value.status && old.lane === value.lane && old.rank === value.rank;
            const item = same ? old : value;
            next.set(id, item);
            return item;
          });
          previous = next;
          const input: ProjectBoardInput<Card> = {
            items,
            getItemId,
            getRank,
            groupBy: lanes ? laned : flat,
            overlays: overlays.map(overlayOf),
            noValueLabel: label ? 'None' : undefined,
          };
          const got = projector.project(input);
          const want = projectBoard(input);
          expect({ ...got, locations: new Map(got.locations) }).toEqual(want);
          expect(got.locations.size).toBe(want.locations.size);
          for (const [id, location] of want.locations) expect(got.locations.get(id)).toEqual(location);
          // Same objects, not just equal ones: renderCard reads the app's own items.
          got.cells.forEach((cell, index) => {
            cell.items.forEach((item, at) => expect(item).toBe(want.cells[index]?.items[at]));
          });
        }
      }),
      { numRuns: 400 },
    );
  });

  it('stays equal to projectBoard over many moves on a large board', () => {
    const projector = createProjector<Card>();
    const ids = Array.from({ length: 300 }, (_, i) => `c${i}`);
    let items: Card[] = ids.map((id, i) => ({
      id,
      status: statuses[i % 3] ?? null,
      lane: laneValues[i % 2] ?? null,
      rank: `a${String(i).padStart(4, '0')}`,
    }));
    for (let step = 0; step < 400; step += 1) {
      const at = (step * 7919) % items.length;
      if (step % 50 === 49) items = items.filter((_, i) => i !== at);
      else
        items = items.map((card, i) =>
          i === at ? { ...card, status: statuses[step % 3] ?? null, rank: `b${step}` } : card,
        );
      const input: ProjectBoardInput<Card> = { items, getItemId, getRank, groupBy: laned };
      const got = projector.project(input);
      const want = projectBoard(input);
      expect(got.cells).toEqual(want.cells);
      expect(new Map(got.locations)).toEqual(want.locations);
      expect(got.locations.size).toBe(want.locations.size);
    }
  });

  const cards: Card[] = [
    { id: 'a', status: 'todo', lane: 'x', rank: 'a0' },
    { id: 'b', status: 'todo', lane: 'x', rank: 'a1' },
    { id: 'c', status: 'doing', lane: 'x', rank: 'a0' },
    { id: 'd', status: 'done', lane: 'y', rank: 'a0' },
  ];
  const input = (items: readonly Card[]): ProjectBoardInput<Card> => ({ items, getItemId, getRank, groupBy: laned });

  it('returns the same model when nothing changed, even for a new array', () => {
    const projector = createProjector<Card>();
    const first = projector.project(input(cards));
    expect(projector.project(input([...cards].reverse()))).toBe(first);
  });

  it('keeps the cells a change did not touch', () => {
    const projector = createProjector<Card>();
    const first = projector.project(input(cards));
    const moved = cards.map((card) => (card.id === 'b' ? { ...card, status: 'doing', rank: 'a1' } : card));
    const second = projector.project(input(moved));
    const todo = cellId('x', 'todo');
    const doing = cellId('x', 'doing');
    const done = cellId('y', 'done');
    expect(second).not.toBe(first);
    expect(second.cellById.get(done)).toBe(first.cellById.get(done));
    expect(second.cellById.get(todo)?.items.map(getItemId)).toEqual(['a']);
    expect(second.cellById.get(doing)?.items.map(getItemId)).toEqual(['c', 'b']);
    expect(second.locations.get('b')).toEqual({ cellId: doing, index: 1 });
  });

  it('redraws only the cell of an item whose object changed in place', () => {
    const projector = createProjector<Card>();
    const first = projector.project(input(cards));
    const edited = cards.map((card) => (card.id === 'd' ? { ...card } : card));
    const second = projector.project(input(edited));
    expect(second.cellById.get(cellId('x', 'todo'))).toBe(first.cellById.get(cellId('x', 'todo')));
    expect(second.cellById.get(cellId('y', 'done'))?.items[0]).toBe(edited[3]);
  });

  it('forgets removed items', () => {
    const projector = createProjector<Card>();
    projector.project(input(cards));
    const second = projector.project(input(cards.filter((card) => card.id !== 'a')));
    expect(second.locations.has('a')).toBe(false);
    expect(second.locations.get('b')).toEqual({ cellId: cellId('x', 'todo'), index: 0 });
  });
});
