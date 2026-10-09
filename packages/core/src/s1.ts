import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing';
import { cellId } from './ids';
import { normalizeToIndex, orderAfterMove, rankForMove } from './indexSemantics';
import { createMoveFromDrop } from './move';
import { projectBoard } from './project';
import type { RankedRef } from './types';

export interface S1Check {
  readonly id: string;
  readonly name: string;
  readonly pass: boolean;
  readonly detail: string;
}

interface Card {
  id: string;
  rank: string;
  status: string;
  assignee?: string;
}

function keys(count: number): string[] {
  return generateNKeysBetween(null, null, count);
}

function check(id: string, name: string, pass: boolean, detail: string): S1Check {
  return { id, name, pass, detail };
}

/**
 * S1 cases. Unit tests and the spike checklist both call this so the
 * device screen and CI cannot drift.
 */
export function runS1Cases(): S1Check[] {
  const results: S1Check[] = [];
  const [a, b, c, d] = keys(4);
  if (!a || !b || !c || !d) {
    return [check('s1-setup', 'Fixture keys', false, 'fractional-indexing returned too few keys')];
  }
  const column: RankedRef[] = [
    { id: 'a', rank: a },
    { id: 'b', rank: b },
    { id: 'c', rank: c },
    { id: 'd', rank: d },
  ];

  const down = orderAfterMove(
    column.map((item) => item.id),
    'a',
    1,
  );
  const downRank = rankForMove(column, 'a', 1);
  results.push(
    check(
      's1-down',
      'Same cell, down one',
      down.join(',') === 'b,a,c,d' && downRank === generateKeyBetween(b, c) && b < downRank && downRank < c,
      `order ${down.join(' ')} rank ${downRank} between ${b} and ${c}`,
    ),
  );

  const toEnd = orderAfterMove(
    column.map((item) => item.id),
    'a',
    3,
  );
  const endRank = rankForMove(column, 'a', 3);
  results.push(
    check(
      's1-end',
      'Same cell, to end',
      toEnd.join(',') === 'b,c,d,a' && endRank === generateKeyBetween(d, null) && endRank > d,
      `order ${toEnd.join(' ')} rank ${endRank} after ${d}`,
    ),
  );

  const toStart = orderAfterMove(
    column.map((item) => item.id),
    'd',
    0,
  );
  const startRank = rankForMove(column, 'd', 0);
  results.push(
    check(
      's1-start',
      'Same cell, to start',
      toStart.join(',') === 'd,a,b,c' && startRank === generateKeyBetween(null, a) && startRank < a,
      `order ${toStart.join(' ')} rank ${startRank} before ${a}`,
    ),
  );

  const other: RankedRef[] = [
    { id: 'x', rank: a },
    { id: 'y', rank: c },
  ];
  const crossRank = rankForMove(other, 'z', 1);
  const crossOrder = orderAfterMove(['x', 'y'], 'z', 1);
  results.push(
    check(
      's1-cross',
      'Cross cell',
      crossOrder.join(',') === 'x,z,y' && crossRank === generateKeyBetween(a, c),
      `order ${crossOrder.join(' ')} rank ${crossRank}`,
    ),
  );

  const hidden = generateKeyBetween(b, c);
  const visible: RankedRef[] = [
    { id: 'b', rank: b },
    { id: 'c', rank: c },
  ];
  const filteredRank = rankForMove(visible, 'a', 1);
  results.push(
    check(
      's1-filtered',
      'Hidden neighbor is not a rank boundary',
      filteredRank === generateKeyBetween(b, c) &&
        filteredRank !== generateKeyBetween(b, hidden) &&
        b < filteredRank &&
        filteredRank < c,
      `visible between ${b} and ${c} => ${filteredRank}; hidden ${hidden} was not a neighbor`,
    ),
  );

  const empty = rankForMove([], 'a', 0);
  const clamped = normalizeToIndex({
    reportedIndex: 2,
    itemCountAfterRemoval: 3,
    pointerContent: 400,
    contentEnd: 300,
  });
  const emptyIndex = normalizeToIndex({
    reportedIndex: 4,
    itemCountAfterRemoval: 0,
    pointerContent: 10,
    contentEnd: 0,
  });
  const kept = normalizeToIndex({
    reportedIndex: 1,
    itemCountAfterRemoval: 3,
    pointerContent: 40,
    contentEnd: 300,
  });
  results.push(
    check(
      's1-toindex',
      'toIndex is after removal; empty tail appends; empty cell is 0',
      orderAfterMove(['a', 'b', 'c'], 'b', 0).join(',') === 'b,a,c' &&
        orderAfterMove(['a', 'b', 'c'], 'a', 0).join(',') === 'a,b,c' &&
        empty === generateKeyBetween(null, null) &&
        clamped === 3 &&
        emptyIndex === 0 &&
        kept === 1,
      `tail ${clamped}, empty ${emptyIndex}, mid ${kept}, empty-cell rank ${empty}`,
    ),
  );

  const cards: Card[] = [
    { id: 'a', rank: a, status: 'todo', assignee: 'alice' },
    { id: 'b', rank: b, status: 'todo', assignee: 'alice' },
    { id: 'c', rank: c, status: 'doing', assignee: 'alice' },
  ];
  const groupBy = {
    columns: {
      key: 'status',
      values: [
        { id: 'todo', label: 'To do' },
        { id: 'doing', label: 'Doing' },
      ],
    },
    lanes: {
      key: 'assignee',
      values: [{ id: 'alice', label: 'Alice' }],
    },
  };
  const fromCell = cellId('alice', 'todo');
  const toCell = cellId('alice', 'doing');
  const doing = projectBoard({
    items: cards,
    getItemId: (item) => item.id,
    getRank: (item) => item.rank,
    groupBy,
  }).cellById.get(toCell);
  const op = createMoveFromDrop({
    item: cards[0] as Card,
    itemId: 'a',
    groupBy,
    fromCellId: fromCell,
    toCellId: toCell,
    toIndex: 0,
    targetVisible: (doing?.items ?? []).map((item) => ({ id: item.id, rank: item.rank })),
    opId: 's1-op',
  });
  const projected = projectBoard({
    items: cards,
    getItemId: (item) => item.id,
    getRank: (item) => item.rank,
    groupBy,
    overlays: [op],
  });
  const todoIds = projected.cellById.get(fromCell)?.items.map((item) => item.id) ?? [];
  const doingIds = projected.cellById.get(toCell)?.items.map((item) => item.id) ?? [];
  results.push(
    check(
      's1-project',
      'Overlay projects the move without editing items',
      todoIds.join(',') === 'b' &&
        doingIds[0] === 'a' &&
        cards[0]?.status === 'todo' &&
        cards[0]?.rank === a &&
        op.changes.status === 'doing' &&
        op.changes.assignee === 'alice' &&
        op.from.status === 'todo' &&
        op.rank < c,
      `todo [${todoIds}] doing [${doingIds}] rank ${op.rank}`,
    ),
  );

  return results;
}
