import { describe, expect, it, vi } from 'vitest';
import { NO_LANE_ID, NO_VALUE_ID, ToIndexError, applyMove, cellId, planMove, projectBoard, rankBetween } from './index';
import type { BoardModel, GroupAxis, GroupBy, MoveOperation, PlanMoveInput } from './index';

interface Card {
  id: string;
  rank: string;
  status?: string | null;
  assignee?: string | null;
  title?: string;
}

const columns: GroupAxis<Card> = {
  key: 'status',
  values: [
    { id: 'todo', label: 'To do' },
    { id: 'doing', label: 'Doing' },
    { id: 'done', label: 'Done' },
  ],
};

const lanes: GroupAxis<Card> = {
  key: 'assignee',
  values: [
    { id: 'alice', label: 'Alice' },
    { id: 'bob', label: 'Bob' },
  ],
};

const laned: GroupBy<Card> = { columns, lanes };
const unlaned: GroupBy<Card> = { columns };

const cards: readonly Card[] = [
  { id: 'a', rank: 'a0', status: 'todo', assignee: 'alice', title: 'A' },
  { id: 'b', rank: 'a1', status: 'todo', assignee: 'alice', title: 'B' },
  { id: 'c', rank: 'a2', status: 'doing', assignee: 'bob', title: 'C' },
  { id: 'd', rank: 'a3', status: 'mystery', assignee: 'alice', title: 'D' },
  { id: 'e', rank: 'a4', status: 'todo', assignee: 'alice', title: 'E' },
];

function project(groupBy: GroupBy<Card> = laned, overlays: MoveOperation[] = [], items = cards): BoardModel<Card> {
  return projectBoard({ items, getItemId: (card) => card.id, getRank: (card) => card.rank, groupBy, overlays });
}

function card(id: string): Card {
  const found = cards.find((each) => each.id === id);
  if (!found) throw new Error(`No fixture card "${id}"`);
  return found;
}

type PlanArgs = Omit<PlanMoveInput<Card>, 'item' | 'model' | 'groupBy'> & {
  model?: BoardModel<Card>;
  groupBy?: GroupBy<Card>;
};

function plan({ model, groupBy = laned, ...rest }: PlanArgs): MoveOperation | null {
  return planMove({
    model: model ?? project(groupBy),
    groupBy,
    item: card(rest.itemId),
    opId: 'op',
    ...rest,
  });
}

function idsIn(board: BoardModel<Card>, lane: string, column: string): string[] | undefined {
  return board.cellById.get(cellId(lane, column))?.items.map((item) => item.id);
}

const aliceTodo = cellId('alice', 'todo');

describe('planMove', () => {
  describe('within one cell', () => {
    it('changes only the rank', () => {
      const op = plan({ itemId: 'a', toCellId: aliceTodo, toIndex: 1 });
      expect(op).toEqual({
        opId: 'op',
        id: 'a',
        changes: {},
        from: {},
        rank: rankBetween('a1', 'a4'),
        previousId: 'b',
        nextId: 'e',
        source: 'api',
      });
    });

    it('treats toIndex as the index after removal when moving down', () => {
      const op = plan({ itemId: 'a', toCellId: aliceTodo, toIndex: 2 });
      expect(op?.rank).toBe(rankBetween('a4', null));
      expect(idsIn(project(laned, op ? [op] : []), 'alice', 'todo')).toEqual(['b', 'e', 'a']);
    });

    it('moves a card up', () => {
      const op = plan({ itemId: 'e', toCellId: aliceTodo, toIndex: 0 });
      expect(op?.rank).toBe(rankBetween(null, 'a0'));
      expect(idsIn(project(laned, op ? [op] : []), 'alice', 'todo')).toEqual(['e', 'a', 'b']);
    });

    it.each([
      ['a', 0],
      ['b', 1],
      ['e', 2],
    ])('returns null when %s stays at index %i', (itemId, toIndex) => {
      expect(plan({ itemId, toCellId: aliceTodo, toIndex })).toBeNull();
    });

    it('throws ToIndexError past the end of the cell after removal', () => {
      expect(() => plan({ itemId: 'a', toCellId: aliceTodo, toIndex: 3 })).toThrow(ToIndexError);
    });
  });

  describe('across cells', () => {
    it('changes only the column when the lane stays the same', () => {
      const op = plan({ itemId: 'a', toCellId: cellId('alice', 'doing'), toIndex: 0 });
      expect(op).toEqual({
        opId: 'op',
        id: 'a',
        changes: { status: 'doing' },
        from: { status: 'todo' },
        rank: 'a0',
        previousId: null,
        nextId: null,
        source: 'api',
      });
    });

    it('changes only the lane when the column stays the same', () => {
      const op = plan({ itemId: 'a', toCellId: cellId('bob', 'todo'), toIndex: 0 });
      expect(op?.changes).toEqual({ assignee: 'bob' });
      expect(op?.from).toEqual({ assignee: 'alice' });
    });

    it('changes both lane and column on a swimlane drop', () => {
      const op = plan({ itemId: 'a', toCellId: cellId('bob', 'doing'), toIndex: 1 });
      expect(op).toEqual({
        opId: 'op',
        id: 'a',
        changes: { status: 'doing', assignee: 'bob' },
        from: { status: 'todo', assignee: 'alice' },
        rank: rankBetween('a2', null),
        previousId: 'c',
        nextId: null,
        source: 'api',
      });
      expect(idsIn(project(laned, op ? [op] : []), 'bob', 'doing')).toEqual(['c', 'a']);
    });

    it('does not shift indexes in the target cell for a card from elsewhere', () => {
      const op = plan({ itemId: 'c', toCellId: aliceTodo, toIndex: 1 });
      expect(op?.rank).toBe(rankBetween('a0', 'a1'));
      expect(idsIn(project(laned, op ? [op] : []), 'alice', 'todo')).toEqual(['a', 'c', 'b', 'e']);
    });

    it('is not a no-op when the index matches but the cell differs', () => {
      expect(plan({ itemId: 'a', toCellId: cellId('bob', 'todo'), toIndex: 0 })).not.toBeNull();
    });

    it('ranks a drop into an empty cell at index 0 with no neighbours', () => {
      const op = plan({ itemId: 'a', toCellId: cellId('bob', 'done'), toIndex: 0 });
      expect(op?.rank).toBe(rankBetween(null, null));
    });

    it('rejects any index other than 0 in an empty cell', () => {
      expect(() => plan({ itemId: 'a', toCellId: cellId('bob', 'done'), toIndex: 1 })).toThrow(ToIndexError);
    });

    it('writes null when the card is dropped into No value', () => {
      const op = plan({ itemId: 'a', toCellId: cellId('alice', NO_VALUE_ID), toIndex: 0 });
      expect(op?.changes).toEqual({ status: null });
      expect(op?.from).toEqual({ status: 'todo' });
      expect(op?.rank).toBe(rankBetween(null, 'a3'));
    });

    it('writes null for the lane when the card is dropped into the No value lane', () => {
      const items = [...cards, { id: 'f', rank: 'a5', status: 'todo', assignee: 'carol' }];
      const model = project(laned, [], items);
      const op = plan({ model, itemId: 'a', toCellId: cellId(NO_VALUE_ID, 'todo'), toIndex: 0 });
      expect(op?.changes).toEqual({ assignee: null });
      expect(op?.from).toEqual({ assignee: 'alice' });
    });

    it('reports the raw app value in from when the card was in No value', () => {
      const op = plan({ itemId: 'd', toCellId: aliceTodo, toIndex: 0 });
      expect(op?.changes).toEqual({ status: 'todo' });
      expect(op?.from).toEqual({ status: 'mystery' });
    });

    it('ranks only against items visible in the target cell', () => {
      const visible = cards.filter((each) => each.id !== 'b');
      const model = project(laned, [], visible);
      const op = plan({ model, itemId: 'c', toCellId: aliceTodo, toIndex: 1 });
      expect(op?.rank).toBe(rankBetween('a0', 'a4'));
    });
  });

  describe('with a pending overlay', () => {
    it('reports the pending value in from, not the app record', () => {
      const first = plan({ itemId: 'a', toCellId: cellId('alice', 'done'), toIndex: 0, opId: 'first' });
      if (!first) throw new Error('expected a move');
      const second = plan({
        model: project(laned, [first]),
        itemId: 'a',
        toCellId: cellId('alice', 'doing'),
        toIndex: 0,
        overlay: first,
        opId: 'second',
      });
      expect(second?.changes).toEqual({ status: 'doing' });
      expect(second?.from).toEqual({ status: 'done' });
    });

    it('reports a pending No value as null in from', () => {
      const first = plan({ itemId: 'a', toCellId: cellId('alice', NO_VALUE_ID), toIndex: 0, opId: 'first' });
      if (!first) throw new Error('expected a move');
      const second = plan({
        model: project(laned, [first]),
        itemId: 'a',
        toCellId: aliceTodo,
        toIndex: 0,
        overlay: first,
      });
      expect(second?.from).toEqual({ status: null });
    });

    it('reads fields the overlay did not change from the app record', () => {
      const first = plan({ itemId: 'a', toCellId: cellId('alice', 'done'), toIndex: 0, opId: 'first' });
      if (!first) throw new Error('expected a move');
      const second = plan({
        model: project(laned, [first]),
        itemId: 'a',
        toCellId: cellId('bob', 'done'),
        toIndex: 0,
        overlay: first,
      });
      expect(second?.changes).toEqual({ assignee: 'bob' });
      expect(second?.from).toEqual({ assignee: 'alice' });
    });

    it('plans a reorder in the pending cell as a rank-only move', () => {
      const first = plan({ itemId: 'a', toCellId: cellId('bob', 'doing'), toIndex: 0, opId: 'first' });
      if (!first) throw new Error('expected a move');
      const model = project(laned, [first]);
      expect(idsIn(model, 'bob', 'doing')).toEqual(['a', 'c']);
      const second = plan({ model, itemId: 'a', toCellId: cellId('bob', 'doing'), toIndex: 1, overlay: first });
      expect(second?.changes).toEqual({});
      expect(second?.rank).toBe(rankBetween('a2', null));
    });
  });

  describe('opId', () => {
    it('uses the given opId', () => {
      expect(plan({ itemId: 'a', toCellId: cellId('bob', 'done'), toIndex: 0, opId: 'mine' })?.opId).toBe('mine');
    });

    it('creates a fresh opId when none is given', () => {
      const input = { model: project(), groupBy: laned, item: card('a'), itemId: 'a', toCellId: aliceTodo, toIndex: 1 };
      const first = planMove(input);
      const second = planMove(input);
      expect(first?.opId).toMatch(/^mv_/);
      expect(second?.opId).toMatch(/^mv_/);
      expect(first?.opId).not.toBe(second?.opId);
    });
  });

  describe('invalid input', () => {
    it('throws for an item that is not on the board', () => {
      expect(() =>
        planMove({
          model: project(),
          groupBy: laned,
          item: card('a'),
          itemId: 'ghost',
          toCellId: aliceTodo,
          toIndex: 0,
        }),
      ).toThrow(/Item "ghost" is not on the board/);
    });

    it('throws for an unknown target cell', () => {
      expect(() => plan({ itemId: 'a', toCellId: cellId('carol', 'todo'), toIndex: 0 })).toThrow(
        /Unknown cell "carol::todo"/,
      );
    });

    it('throws when a laned board targets the "_" lane', () => {
      expect(() => plan({ itemId: 'a', toCellId: cellId(NO_LANE_ID, 'todo'), toIndex: 0 })).toThrow();
      expect(() =>
        plan({
          model: project(unlaned),
          groupBy: laned,
          itemId: 'a',
          toCellId: cellId(NO_LANE_ID, 'doing'),
          toIndex: 0,
        }),
      ).toThrow(/cannot target the "_" lane/);
    });

    it('throws when a board without lanes targets a named lane', () => {
      expect(() => plan({ groupBy: unlaned, itemId: 'a', toCellId: cellId('alice', 'doing'), toIndex: 0 })).toThrow();
      expect(() =>
        plan({ model: project(laned), groupBy: unlaned, itemId: 'a', toCellId: cellId('bob', 'doing'), toIndex: 0 }),
      ).toThrow(/start with "_::"/);
    });
  });

  describe('on a board without lanes', () => {
    it('writes only the column field', () => {
      const op = plan({ groupBy: unlaned, itemId: 'a', toCellId: cellId(NO_LANE_ID, 'done'), toIndex: 0 });
      expect(op?.changes).toEqual({ status: 'done' });
      expect(op?.from).toEqual({ status: 'todo' });
    });
  });

  it('projects the planned move without editing the source item', () => {
    const source = structuredClone(card('a'));
    const op = plan({ itemId: 'a', toCellId: cellId('bob', 'doing'), toIndex: 1 });
    const board = project(laned, op ? [op] : []);
    expect(card('a')).toEqual(source);
    expect(idsIn(board, 'alice', 'todo')).toEqual(['b', 'e']);
    expect(idsIn(board, 'bob', 'doing')).toEqual(['c', 'a']);
  });
});

describe('applyMove', () => {
  const setRank = (item: Card, rank: string): Card => ({ ...item, rank });

  it('writes the rank and changed fields with the default writer, returning a new object', () => {
    const source = card('a');
    const before = structuredClone(source);
    const next = applyMove(source, { changes: { status: 'doing', assignee: 'bob' }, rank: 'a9' }, laned, setRank);
    expect(next).toEqual({ ...before, status: 'doing', assignee: 'bob', rank: 'a9' });
    expect(next).not.toBe(source);
    expect(source).toEqual(before);
  });

  it('writes null for a No value move', () => {
    expect(applyMove(card('a'), { changes: { status: null }, rank: 'a0' }, laned, setRank).status).toBeNull();
  });

  it('leaves fields that are not in changes alone', () => {
    const next = applyMove(card('a'), { changes: {}, rank: 'a7' }, laned, setRank);
    expect(next).toEqual({ ...card('a'), rank: 'a7' });
  });

  it('ignores changes for fields the board does not group by', () => {
    const next = applyMove(card('a'), { changes: { title: 'Hacked' }, rank: 'a0' }, laned, setRank);
    expect(next.title).toBe('A');
  });

  it('uses applyKey when the axis provides one', () => {
    interface Row {
      id: string;
      order: string;
      meta: { state: string; owner: string };
    }
    const applyState = vi.fn(
      (row: Row, value: string | null): Row => ({
        ...row,
        meta: { ...row.meta, state: (value ?? 'none').toUpperCase() },
      }),
    );
    const groupBy: GroupBy<Row> = {
      columns: { key: 'state', values: [], getKey: (row) => row.meta.state, applyKey: applyState },
      lanes: { key: 'owner', values: [], getKey: (row) => row.meta.owner },
    };
    const row: Row = { id: 'r', order: 'a0', meta: { state: 'TODO', owner: 'alice' } };
    const next = applyMove(row, { changes: { state: 'done' }, rank: 'a5' }, groupBy, (item, rank) => ({
      ...item,
      order: rank,
    }));
    expect(applyState).toHaveBeenCalledTimes(1);
    expect(applyState).toHaveBeenCalledWith({ ...row, order: 'a5' }, 'done');
    expect(next).toEqual({ id: 'r', order: 'a5', meta: { state: 'DONE', owner: 'alice' } });
    expect(next).not.toHaveProperty('state');
  });

  it('calls applyRank first, then the column writer, then the lane writer', () => {
    const calls: string[] = [];
    const groupBy: GroupBy<Card> = {
      columns: {
        ...columns,
        applyKey: (item, value) => {
          calls.push(`column:${value}`);
          return { ...item, status: value };
        },
      },
      lanes: {
        ...lanes,
        applyKey: (item, value) => {
          calls.push(`lane:${value}`);
          return { ...item, assignee: value };
        },
      },
    };
    applyMove(card('a'), { changes: { assignee: 'bob', status: 'done' }, rank: 'a5' }, groupBy, (item, rank) => {
      calls.push(`rank:${rank}`);
      return { ...item, rank };
    });
    expect(calls).toEqual(['rank:a5', 'column:done', 'lane:bob']);
  });

  it('throws for a primitive item without applyKey', () => {
    const groupBy: GroupBy<string> = { columns: { key: 'status', values: [], getKey: (item) => item } };
    expect(() => applyMove('todo', { changes: { status: 'done' }, rank: 'a0' }, groupBy, (item) => item)).toThrow(
      /Cannot write "status" onto a non-object item without applyKey/,
    );
  });

  it('puts the card where the overlay showed it once the app applies the move', () => {
    const op = plan({ itemId: 'a', toCellId: cellId('bob', 'doing'), toIndex: 1 });
    if (!op) throw new Error('expected a move');
    const optimistic = project(laned, [op]);
    const applied = project(
      laned,
      [],
      cards.map((each) => (each.id === op.id ? applyMove(each, op, laned, setRank) : each)),
    );
    expect(applied.locations).toEqual(optimistic.locations);
  });
});

describe('planMove neighbors and source', () => {
  it('reports the visible neighbors the card lands between', () => {
    const op = plan({ itemId: 'c', toCellId: aliceTodo, toIndex: 1 });
    expect(op?.previousId).toBe('a');
    expect(op?.nextId).toBe('b');
  });

  it('reports null at the top and bottom of a cell', () => {
    expect(plan({ itemId: 'e', toCellId: aliceTodo, toIndex: 0 })?.previousId).toBeNull();
    expect(plan({ itemId: 'a', toCellId: aliceTodo, toIndex: 2 })?.nextId).toBeNull();
  });

  it('reports where the card really lands next to tied ranks', () => {
    const tied: Card[] = [
      { id: 'x', rank: 'a1', status: 'todo', assignee: 'alice' },
      { id: 'y', rank: 'a1', status: 'todo', assignee: 'alice' },
      { id: 'z', rank: 'a2', status: 'todo', assignee: 'alice' },
      { id: 'm', rank: 'a5', status: 'doing', assignee: 'alice' },
    ];
    const model = project(laned, [], tied);
    const item = tied[3];
    if (!item) throw new Error('fixture');
    // Index 1 sits between the tied x and y; the card lands after the tie, before z.
    const op = planMove({ model, groupBy: laned, item, itemId: 'm', toCellId: aliceTodo, toIndex: 1 });
    expect(op?.previousId).toBe('y');
    expect(op?.nextId).toBe('z');
    const after = project(laned, op ? [op] : [], tied);
    expect(idsIn(after, 'alice', 'todo')).toEqual(['x', 'y', 'm', 'z']);
  });

  it('carries the source, defaulting to api', () => {
    expect(plan({ itemId: 'a', toCellId: aliceTodo, toIndex: 1 })?.source).toBe('api');
    expect(plan({ itemId: 'a', toCellId: aliceTodo, toIndex: 1, source: 'sheet' })?.source).toBe('sheet');
  });
});
