import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  createJournal,
  diffBoards,
  fractionalRank,
  placesAt,
  placesOf,
  positionAt,
  projectBoard,
  restoreJournal,
  serializeJournal,
  type GroupBy,
  type JournalEntry,
  type JournalPlace,
} from './index';

interface Card {
  id: string;
  status: string;
  rank: string;
}

const groupBy: GroupBy<Card> = {
  columns: {
    key: 'status',
    values: [
      { id: 'todo', label: 'To do' },
      { id: 'doing', label: 'Doing' },
      { id: 'done', label: 'Done' },
    ],
  },
};
const COLUMNS = ['todo', 'doing', 'done'];

const project = (items: readonly Card[]) =>
  projectBoard({ items, getItemId: (card) => card.id, getRank: (card) => card.rank, groupBy });

function entry(itemId: string, from: JournalPlace | null, to: JournalPlace | null, at = 1): JournalEntry {
  return { id: `${itemId}:${at}`, at, itemId, from, to, observed: false };
}

describe('createJournal', () => {
  it('keeps the newest entries up to its limit', () => {
    const journal = createJournal({ limit: 2 });
    journal.append([entry('a', null, { cellId: '_::todo', rank: 'a0' }, 1)]);
    journal.append([
      entry('b', null, { cellId: '_::todo', rank: 'a1' }, 2),
      entry('c', null, { cellId: '_::todo', rank: 'a2' }, 3),
    ]);
    expect(journal.entries().map((e) => e.itemId)).toEqual(['b', 'c']);
  });

  it('publishes a new array to subscribers on each change, and drops a rolled-back op', () => {
    const journal = createJournal();
    let calls = 0;
    const stop = journal.subscribe(() => (calls += 1));
    const first = journal.entries();
    journal.append([{ ...entry('a', null, { cellId: '_::todo', rank: 'a0' }), opId: 'op1' }]);
    expect(journal.entries()).not.toBe(first);
    journal.removeOp('op1');
    journal.removeOp('missing');
    expect(journal.entries()).toEqual([]);
    expect(calls).toBe(2);
    stop();
  });

  it('relinks a later move of the same card when an earlier one rolls back', () => {
    const journal = createJournal();
    const a = { cellId: '_::todo', rank: 'a0' };
    const b = { cellId: '_::doing', rank: 'a0' };
    const c = { cellId: '_::done', rank: 'a0' };
    journal.append([
      { ...entry('x', a, b, 1), opId: 'op1' },
      { ...entry('x', b, c, 2), opId: 'op2' },
    ]);
    journal.removeOp('op1');
    expect(journal.entries().map((e) => [e.opId, e.from, e.to])).toEqual([['op2', a, c]]);
  });
});

describe('serializeJournal and restoreJournal', () => {
  it('round-trips, sorts by time and drops broken entries', () => {
    const entries = [
      entry('b', { cellId: '_::todo', rank: 'a1' }, { cellId: '_::done', rank: 'a0' }, 5),
      entry('a', null, { cellId: '_::todo', rank: 'a0' }, 2),
    ];
    const restored = restoreJournal(serializeJournal(entries));
    expect(restored.map((e) => e.itemId)).toEqual(['a', 'b']);
    const broken = JSON.stringify({
      version: 1,
      entries: [{ id: 'x' }, entries[0], { ...entries[1], from: null, to: null }],
    });
    expect(restoreJournal(broken)).toEqual([entries[0]]);
    expect(restoreJournal('not json')).toEqual([]);
    expect(restoreJournal(null)).toEqual([]);
  });
});

describe('positionAt', () => {
  it('counts the entries at or before a time', () => {
    const entries = [1, 2, 2, 5].map((at, index) => entry(String(index), null, { cellId: '_::todo', rank: 'a0' }, at));
    expect(positionAt(entries, 0)).toBe(0);
    expect(positionAt(entries, 2)).toBe(3);
    expect(positionAt(entries, 4)).toBe(3);
    expect(positionAt(entries, 9)).toBe(4);
  });
});

describe('diffBoards', () => {
  it('records moves, reorders, arrivals and departures, and only for included cards', () => {
    const before = project([
      { id: 'a', status: 'todo', rank: 'a0' },
      { id: 'b', status: 'todo', rank: 'a1' },
      { id: 'c', status: 'doing', rank: 'a0' },
      { id: 'd', status: 'done', rank: 'a0' },
    ]);
    const after = project([
      { id: 'a', status: 'done', rank: 'a1' },
      { id: 'b', status: 'todo', rank: 'Zz' },
      { id: 'c', status: 'doing', rank: 'a0' },
      { id: 'e', status: 'doing', rank: 'a1' },
    ]);
    const entries = diffBoards(before, after, (id) => id !== 'b', { at: 7, actor: () => 'priya' });
    const byId = new Map(entries.map((e) => [e.itemId, e]));
    expect([...byId.keys()].sort()).toEqual(['a', 'd', 'e']);
    expect(byId.get('a')).toMatchObject({
      from: { cellId: '_::todo', rank: 'a0' },
      to: { cellId: '_::done', rank: 'a1' },
      observed: true,
      actor: 'priya',
      at: 7,
    });
    expect(byId.get('d')).toMatchObject({ from: { cellId: '_::done', rank: 'a0' }, to: null });
    expect(byId.get('e')).toMatchObject({ from: null, to: { cellId: '_::doing', rank: 'a1' } });
  });

  it('records nothing for the same board', () => {
    const model = project([{ id: 'a', status: 'todo', rank: 'a0' }]);
    expect(diffBoards(model, model, () => true, { at: 1 })).toEqual([]);
  });
});

type Step =
  | { kind: 'move'; item: number; column: number; slot: number }
  | { kind: 'add'; column: number }
  | { kind: 'remove'; item: number };

const step: fc.Arbitrary<Step> = fc.oneof(
  {
    weight: 5,
    arbitrary: fc.record({ kind: fc.constant('move' as const), item: fc.nat(), column: fc.nat(), slot: fc.nat() }),
  },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant('add' as const), column: fc.nat() }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant('remove' as const), item: fc.nat() }) },
);

const sorted = (places: ReadonlyMap<string, JournalPlace>) => [...places].sort(([x], [y]) => (x < y ? -1 : 1));

describe('journal replay (property)', () => {
  it('placesAt reproduces the board after every change, from the final board and the entries', () => {
    fc.assert(
      fc.property(fc.array(step, { minLength: 1, maxLength: 30 }), (steps) => {
        let next = 0;
        const newId = () => `card${next++}`;
        let items: Card[] = fractionalRank
          .nBetween(null, null, 5)
          .map((rank, index) => ({ id: newId(), status: COLUMNS[index % 3]!, rank }));
        let model = project(items);
        const entries: JournalEntry[] = [];
        const checkpoints: { position: number; places: Map<string, JournalPlace> }[] = [
          { position: 0, places: placesOf(model) },
        ];
        steps.forEach((change, at) => {
          if (change.kind === 'add') {
            const top = items
              .filter((card) => card.status === COLUMNS[change.column % 3])
              .reduce<Card | null>((low, card) => (low == null || card.rank < low.rank ? card : low), null);
            items = [
              ...items,
              {
                id: newId(),
                status: COLUMNS[change.column % 3]!,
                rank: fractionalRank.between(null, top?.rank ?? null),
              },
            ];
          } else if (items.length > 0 && change.kind === 'remove') {
            items = items.filter((_, index) => index !== change.item % items.length);
          } else if (items.length > 0 && change.kind === 'move') {
            const card = items[change.item % items.length]!;
            const status = COLUMNS[change.column % 3]!;
            const others = items
              .filter((other) => other.status === status && other.id !== card.id)
              .sort((x, y) => (x.rank < y.rank ? -1 : x.rank > y.rank ? 1 : 0));
            const slot = change.slot % (others.length + 1);
            const rank = fractionalRank.between(others[slot - 1]?.rank ?? null, others[slot]?.rank ?? null);
            items = items.map((other) => (other.id === card.id ? { ...other, status, rank } : other));
          }
          const after = project(items);
          entries.push(...diffBoards(model, after, () => true, { at }));
          checkpoints.push({ position: entries.length, places: placesOf(after) });
          model = after;
        });
        const now = placesOf(model);
        for (const { position, places } of checkpoints) {
          expect(sorted(placesAt(entries, now, position))).toEqual(sorted(places));
        }
      }),
      { numRuns: 200 },
    );
  });
});
