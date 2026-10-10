import { generateNKeysBetween } from 'fractional-indexing';
import { describe, expect, it } from 'vitest';
import { NO_LANE_ID, NO_VALUE_ID, NO_VALUE_LABEL, cellId, projectBoard } from './index';
import type { BoardModel, GroupAxis, GroupBy, GroupValue, MoveOperation, ProjectBoardInput } from './index';

interface Card {
  id: string;
  rank: string;
  status?: string | null;
  assignee?: string | null;
}

const columns: GroupAxis<Card> = {
  key: 'status',
  values: [
    { id: 'todo', label: 'To do', color: '#888' },
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

function project(items: readonly Card[], options: Partial<ProjectBoardInput<Card>> = {}): BoardModel<Card> {
  return projectBoard({
    items,
    getItemId: (card) => card.id,
    getRank: (card) => card.rank,
    groupBy: laned,
    ...options,
  });
}

function idsIn<T extends { id: string }>(board: BoardModel<T>, lane: string, column: string): string[] | undefined {
  return board.cellById.get(cellId(lane, column))?.items.map((item) => item.id);
}

function op(id: string, changes: Record<string, string | null>, rank: string, opId = `op-${id}`): MoveOperation {
  return { opId, id, changes, from: {}, rank };
}

function expectLocationsMatchCells<T>(board: BoardModel<T>, itemCount: number): void {
  expect(board.locations.size).toBe(itemCount);
  for (const cell of board.cells) {
    cell.ranked.forEach((ref, index) => {
      expect(board.locations.get(ref.id)).toEqual({ cellId: cell.cellId, index });
    });
  }
}

const cards: Card[] = [
  { id: 'a', rank: 'a0', status: 'todo', assignee: 'alice' },
  { id: 'b', rank: 'a1', status: 'todo', assignee: 'alice' },
  { id: 'c', rank: 'a2', status: 'doing', assignee: 'bob' },
];

describe('projectBoard', () => {
  describe('columns and lanes', () => {
    it('keeps the configured column and lane order, including empty columns', () => {
      const board = project(cards);
      expect(board.columns.map((column) => column.id)).toEqual(['todo', 'doing', 'done']);
      expect(board.lanes.map((lane) => lane.id)).toEqual(['alice', 'bob']);
      expect(board.cells.map((cell) => cell.cellId)).toEqual([
        'alice::todo',
        'alice::doing',
        'alice::done',
        'bob::todo',
        'bob::doing',
        'bob::done',
      ]);
      expect(board.cellById.get(cellId('alice', 'done'))).toMatchObject({ items: [], ranked: [] });
      expect(board.cellById.get(cellId('bob', 'todo'))).toMatchObject({ items: [], ranked: [] });
    });

    it('builds every configured cell for an empty item list', () => {
      const board = project([]);
      expect(board.cells).toHaveLength(6);
      expect(board.cells.every((cell) => cell.items.length === 0)).toBe(true);
      expect(board.locations.size).toBe(0);
    });

    it('passes the configured group values through to cells', () => {
      const board = project(cards);
      const cell = board.cellById.get(cellId('alice', 'todo'));
      expect(cell?.column).toBe(columns.values[0]);
      expect(cell?.column.color).toBe('#888');
      expect(cell?.lane).toBe(lanes.values[0]);
      expect(cell).toMatchObject({ laneKey: 'alice', columnKey: 'todo' });
      expect(board.cellById.size).toBe(board.cells.length);
      for (const each of board.cells) expect(board.cellById.get(each.cellId)).toBe(each);
    });

    it('matches configured ids exactly', () => {
      const board = project([{ id: 'a', rank: 'a0', status: 'Todo', assignee: 'alice' }]);
      expect(idsIn(board, 'alice', NO_VALUE_ID)).toEqual(['a']);
      expect(idsIn(board, 'alice', 'todo')).toEqual([]);
    });
  });

  describe('the No value bucket', () => {
    it('is left out when every item matches a configured value', () => {
      const board = project(cards);
      expect(board.columns.some((column) => column.id === NO_VALUE_ID)).toBe(false);
      expect(board.lanes.some((lane) => lane.id === NO_VALUE_ID)).toBe(false);
    });

    it('collects unknown, empty, null and missing column values', () => {
      const board = project([
        ...cards,
        { id: 'unknown', rank: 'a5', status: 'mystery', assignee: 'alice' },
        { id: 'empty', rank: 'a6', status: '', assignee: 'alice' },
        { id: 'null', rank: 'a7', status: null, assignee: 'alice' },
        { id: 'missing', rank: 'a8', assignee: 'alice' },
      ]);
      expect(board.columns.map((column) => column.id)).toEqual(['todo', 'doing', 'done', NO_VALUE_ID]);
      expect(board.columns.at(-1)).toEqual<GroupValue>({ id: NO_VALUE_ID, label: NO_VALUE_LABEL });
      expect(idsIn(board, 'alice', NO_VALUE_ID)).toEqual(['unknown', 'empty', 'null', 'missing']);
    });

    it('adds the No value column to every lane', () => {
      const board = project([...cards, { id: 'd', rank: 'a5', status: 'mystery', assignee: 'alice' }]);
      expect(idsIn(board, 'bob', NO_VALUE_ID)).toEqual([]);
      expect(board.cells).toHaveLength(8);
    });

    it('adds a No value lane when an item has no matching lane', () => {
      const board = project([...cards, { id: 'd', rank: 'a5', status: 'done', assignee: 'carol' }]);
      expect(board.lanes.map((lane) => lane.id)).toEqual(['alice', 'bob', NO_VALUE_ID]);
      expect(board.columns.map((column) => column.id)).toEqual(['todo', 'doing', 'done']);
      expect(idsIn(board, NO_VALUE_ID, 'done')).toEqual(['d']);
      expect(idsIn(board, NO_VALUE_ID, 'todo')).toEqual([]);
    });

    it('uses a custom noValueLabel on both axes', () => {
      const board = project([{ id: 'd', rank: 'a5', status: null, assignee: null }], { noValueLabel: 'Unsorted' });
      expect(board.columns.at(-1)).toEqual({ id: NO_VALUE_ID, label: 'Unsorted' });
      expect(board.lanes.at(-1)).toEqual({ id: NO_VALUE_ID, label: 'Unsorted' });
      expect(idsIn(board, NO_VALUE_ID, NO_VALUE_ID)).toEqual(['d']);
    });
  });

  describe('order within a cell', () => {
    it('follows the global rank filtered to that cell, whatever the input order', () => {
      const board = project([
        { id: 'late', rank: 'a5', status: 'todo', assignee: 'alice' },
        { id: 'other', rank: 'a2', status: 'doing', assignee: 'alice' },
        { id: 'early', rank: 'a1', status: 'todo', assignee: 'alice' },
        { id: 'middle', rank: 'a3', status: 'todo', assignee: 'alice' },
      ]);
      expect(idsIn(board, 'alice', 'todo')).toEqual(['early', 'middle', 'late']);
      expect(idsIn(board, 'alice', 'doing')).toEqual(['other']);
    });

    it('breaks equal ranks by id', () => {
      const board = project([
        { id: 'c', rank: 'a1', status: 'todo', assignee: 'alice' },
        { id: 'a', rank: 'a1', status: 'todo', assignee: 'alice' },
        { id: 'z', rank: 'a0', status: 'todo', assignee: 'alice' },
        { id: 'b', rank: 'a1', status: 'todo', assignee: 'alice' },
      ]);
      expect(idsIn(board, 'alice', 'todo')).toEqual(['z', 'a', 'b', 'c']);
    });
  });

  describe('overlays', () => {
    it('shows an item in the overlay cell at the overlay rank', () => {
      const board = project(cards, { overlays: [op('a', { status: 'doing', assignee: 'bob' }, 'a3')] });
      expect(idsIn(board, 'alice', 'todo')).toEqual(['b']);
      expect(idsIn(board, 'bob', 'doing')).toEqual(['c', 'a']);
    });

    it('applies only the latest overlay for an item', () => {
      const board = project(cards, {
        overlays: [op('a', { status: 'doing' }, 'a5', 'first'), op('a', { status: 'done' }, 'a6', 'second')],
      });
      expect(idsIn(board, 'alice', 'doing')).toEqual([]);
      expect(idsIn(board, 'alice', 'done')).toEqual(['a']);
      expect(board.cellById.get(cellId('alice', 'done'))?.ranked).toEqual([{ id: 'a', rank: 'a6' }]);
    });

    it('keeps the item value for fields the overlay does not change', () => {
      const board = project(cards, { overlays: [op('a', {}, 'a5')] });
      expect(idsIn(board, 'alice', 'todo')).toEqual(['b', 'a']);
    });

    it('moves an item into No value when the overlay writes null', () => {
      const board = project(cards, { overlays: [op('a', { status: null }, 'a0')] });
      expect(board.columns.at(-1)?.id).toBe(NO_VALUE_ID);
      expect(idsIn(board, 'alice', NO_VALUE_ID)).toEqual(['a']);
    });

    it('moves an item out of No value', () => {
      const unknown: Card = { id: 'd', rank: 'a5', status: 'mystery', assignee: 'alice' };
      const board = project([...cards, unknown], { overlays: [op('d', { status: 'done' }, 'a5')] });
      expect(board.columns.map((column) => column.id)).toEqual(['todo', 'doing', 'done']);
      expect(idsIn(board, 'alice', 'done')).toEqual(['d']);
    });

    it('ignores overlays for items that are not in the list', () => {
      const board = project(cards, { overlays: [op('ghost', { status: 'done' }, 'a0')] });
      expect(board.locations.has('ghost')).toBe(false);
      expect(idsIn(board, 'alice', 'done')).toEqual([]);
    });

    it('does not copy or mutate source items', () => {
      const items = structuredClone(cards);
      const before = structuredClone(items);
      const board = project(items, { overlays: [op('a', { status: 'done', assignee: 'bob' }, 'z0')] });
      expect(items).toEqual(before);
      expect(board.cellById.get(cellId('bob', 'done'))?.items[0]).toBe(items[0]);
      expect(board.cellById.get(cellId('alice', 'todo'))?.items[0]).toBe(items[1]);
    });
  });

  describe('locations and ranked refs', () => {
    it('records the displayed cell and index of every item, overlays included', () => {
      const items: Card[] = [
        ...cards,
        { id: 'd', rank: 'a3', status: 'doing', assignee: 'bob' },
        { id: 'e', rank: 'a4', status: 'mystery', assignee: 'alice' },
      ];
      const board = project(items, { overlays: [op('b', { status: 'doing', assignee: 'bob' }, 'a2V')] });
      expect(board.locations.get('a')).toEqual({ cellId: 'alice::todo', index: 0 });
      expect(board.locations.get('b')).toEqual({ cellId: 'bob::doing', index: 1 });
      expect(board.locations.get('c')).toEqual({ cellId: 'bob::doing', index: 0 });
      expect(board.locations.get('d')).toEqual({ cellId: 'bob::doing', index: 2 });
      expect(board.locations.get('e')).toEqual({ cellId: `alice::${NO_VALUE_ID}`, index: 0 });
      expectLocationsMatchCells(board, items.length);
    });

    it('keeps ranked refs parallel to items, with the overlay rank as the effective rank', () => {
      const board = project(cards, { overlays: [op('a', {}, 'a1V')] });
      const cell = board.cellById.get(cellId('alice', 'todo'));
      expect(cell?.items.map((item) => item.id)).toEqual(cell?.ranked.map((ref) => ref.id));
      expect(cell?.ranked).toEqual([
        { id: 'b', rank: 'a1' },
        { id: 'a', rank: 'a1V' },
      ]);
      expect(cell?.items[1]?.rank).toBe('a0');
    });
  });

  it('reads group keys through custom getKey readers', () => {
    interface Row {
      key: string;
      order: string;
      fields: { State: string; Owner?: { handle: string } };
    }
    const groupBy: GroupBy<Row> = {
      columns: { key: 'status', values: columns.values, getKey: (row) => row.fields.State.toLowerCase() },
      lanes: { key: 'assignee', values: lanes.values, getKey: (row) => row.fields.Owner?.handle },
    };
    const rows: Row[] = [
      { key: 'r1', order: 'a1', fields: { State: 'DONE', Owner: { handle: 'bob' } } },
      { key: 'r2', order: 'a0', fields: { State: 'Done', Owner: { handle: 'bob' } } },
      { key: 'r3', order: 'a2', fields: { State: 'TODO' } },
    ];
    const board = projectBoard({ items: rows, getItemId: (row) => row.key, getRank: (row) => row.order, groupBy });
    expect(board.cellById.get(cellId('bob', 'done'))?.items.map((row) => row.key)).toEqual(['r2', 'r1']);
    expect(board.cellById.get(cellId(NO_VALUE_ID, 'todo'))?.items.map((row) => row.key)).toEqual(['r3']);
  });

  it('puts every item in lane "_" when the board has no lanes', () => {
    const board = project([...cards, { id: 'd', rank: 'a3', status: 'done', assignee: 'carol' }], {
      groupBy: { columns },
    });
    expect(board.lanes).toEqual([{ id: NO_LANE_ID, label: '' }]);
    expect(board.cells.map((cell) => cell.cellId)).toEqual(['_::todo', '_::doing', '_::done']);
    expect(idsIn(board, NO_LANE_ID, 'todo')).toEqual(['a', 'b']);
    expect(idsIn(board, NO_LANE_ID, 'doing')).toEqual(['c']);
    expect(idsIn(board, NO_LANE_ID, 'done')).toEqual(['d']);
    expect(board.cells.every((cell) => cell.laneKey === NO_LANE_ID)).toBe(true);
  });

  it('projects 20k items across 6 columns and 5 lanes well under 200ms', () => {
    const columnValues = Array.from({ length: 6 }, (_, index) => ({ id: `c${index}`, label: `Column ${index}` }));
    const laneValues = Array.from({ length: 5 }, (_, index) => ({ id: `l${index}`, label: `Lane ${index}` }));
    const count = 20_000;
    const ranks = generateNKeysBetween(null, null, count);
    const items: Card[] = ranks.map((rank, index) => ({
      id: `item-${(index * 7919) % count}`,
      rank,
      status: `c${(index * 31) % 6}`,
      assignee: `l${(index * 17) % 5}`,
    }));
    items.reverse();
    const overlays = items
      .slice(0, 200)
      .map((item, index) => op(item.id, { status: `c${index % 6}` }, ranks[index] ?? 'a0'));

    const start = performance.now();
    const board = projectBoard({
      items,
      getItemId: (item) => item.id,
      getRank: (item) => item.rank,
      groupBy: {
        columns: { key: 'status', values: columnValues },
        lanes: { key: 'assignee', values: laneValues },
      },
      overlays,
    });
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(200);
    expect(board.cells).toHaveLength(30);
    expect(board.cells.reduce((total, cell) => total + cell.items.length, 0)).toBe(count);
    expectLocationsMatchCells(board, count);
  });
});
