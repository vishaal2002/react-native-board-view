import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing';
import {
  cellId,
  orderAfterMove,
  planMove,
  projectBoard,
  rankForMove,
  type GroupBy,
  type MoveOperation,
  type RankedRef,
} from 'board-view-core';

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
  assignee: string;
}

function check(id: string, name: string, pass: boolean, detail: string): S1Check {
  return { id, name, pass, detail };
}

/**
 * S1 cases. Unit tests and the spike checklist both call this, so the
 * device screen and CI cannot drift.
 */
export function runS1Cases(): S1Check[] {
  const results: S1Check[] = [];
  const [a, b, c, d] = generateNKeysBetween(null, null, 4);
  if (!a || !b || !c || !d) {
    return [check('s1-setup', 'Fixture keys', false, 'fractional-indexing returned too few keys')];
  }
  const column: RankedRef[] = [
    { id: 'a', rank: a },
    { id: 'b', rank: b },
    { id: 'c', rank: c },
    { id: 'd', rank: d },
  ];
  const ids = column.map((item) => item.id);

  const down = orderAfterMove(ids, 'a', 1);
  const downRank = rankForMove(column, 'a', 1);
  results.push(
    check(
      's1-down',
      'Same cell, down one',
      down.join(',') === 'b,a,c,d' && downRank === generateKeyBetween(b, c),
      `order ${down.join(' ')} rank ${downRank} between ${b} and ${c}`,
    ),
  );

  const toEnd = orderAfterMove(ids, 'a', 3);
  const endRank = rankForMove(column, 'a', 3);
  results.push(
    check(
      's1-end',
      'Same cell, to end',
      toEnd.join(',') === 'b,c,d,a' && endRank === generateKeyBetween(d, null),
      `order ${toEnd.join(' ')} rank ${endRank} after ${d}`,
    ),
  );

  const toStart = orderAfterMove(ids, 'd', 0);
  const startRank = rankForMove(column, 'd', 0);
  results.push(
    check(
      's1-start',
      'Same cell, to start',
      toStart.join(',') === 'd,a,b,c' && startRank === generateKeyBetween(null, a),
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

  // The app filtered out the item ranked between b and c. It must not be a boundary.
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
      filteredRank === generateKeyBetween(b, c) && filteredRank !== generateKeyBetween(b, hidden),
      `visible between ${b} and ${c} → ${filteredRank}; hidden ${hidden} ignored`,
    ),
  );

  const cards: Card[] = [
    { id: 'a', rank: a, status: 'todo', assignee: 'alice' },
    { id: 'b', rank: b, status: 'todo', assignee: 'alice' },
    { id: 'c', rank: c, status: 'doing', assignee: 'alice' },
  ];
  const groupBy: GroupBy<Card> = {
    columns: {
      key: 'status',
      values: [
        { id: 'todo', label: 'To do' },
        { id: 'doing', label: 'Doing' },
        { id: 'done', label: 'Done' },
      ],
    },
    lanes: {
      key: 'assignee',
      values: [
        { id: 'alice', label: 'Alice' },
        { id: 'bob', label: 'Bob' },
      ],
    },
  };
  const project = (overlays: MoveOperation[] = []) =>
    projectBoard({ items: cards, getItemId: (item) => item.id, getRank: (item) => item.rank, groupBy, overlays });
  const model = project();
  const card = cards[0] as Card;
  const plan = (toCellId: string, toIndex: number) =>
    planMove({ model, groupBy, item: card, itemId: 'a', toCellId, toIndex, opId: 's1-op' });

  const noop = plan(cellId('alice', 'todo'), 0);
  const sameCell = plan(cellId('alice', 'todo'), 1);
  const empty = plan(cellId('bob', 'done'), 0);
  results.push(
    check(
      's1-toindex',
      'toIndex is after removal; same slot is a no-op; empty cell is 0',
      orderAfterMove(['a', 'b', 'c'], 'b', 0).join(',') === 'b,a,c' &&
        noop === null &&
        sameCell != null &&
        Object.keys(sameCell.changes).length === 0 &&
        sameCell.rank > b &&
        empty?.rank === generateKeyBetween(null, null),
      `no-op ${noop === null}, reorder rank ${sameCell?.rank}, empty-cell rank ${empty?.rank}`,
    ),
  );

  const op = plan(cellId('bob', 'doing'), 0);
  const projected = op ? project([op]) : model;
  const todoIds = projected.cellById.get(cellId('alice', 'todo'))?.ranked.map((item) => item.id) ?? [];
  const doingIds = projected.cellById.get(cellId('bob', 'doing'))?.ranked.map((item) => item.id) ?? [];
  results.push(
    check(
      's1-project',
      'Swimlane move changes two fields and projects without editing items',
      op != null &&
        todoIds.join(',') === 'b' &&
        doingIds.join(',') === 'a' &&
        card.status === 'todo' &&
        op.changes.status === 'doing' &&
        op.changes.assignee === 'bob' &&
        op.from.status === 'todo' &&
        op.from.assignee === 'alice',
      `alice/todo [${todoIds}] bob/doing [${doingIds}] changes ${JSON.stringify(op?.changes)}`,
    ),
  );

  return results;
}
