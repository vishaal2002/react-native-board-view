import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  applyMove,
  createMoveQueue,
  fractionalRank,
  planMove,
  projectBoard,
  readItemSnapshot,
  type BoardModel,
  type GroupBy,
  type MoveOperation,
} from './index';

interface Card {
  id: string;
  status: string | null;
  lane: string | null;
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
  lanes: {
    key: 'lane',
    values: [
      { id: 'x', label: 'X' },
      { id: 'y', label: 'Y' },
    ],
  },
};

type Command =
  | { kind: 'move'; item: number; cell: number; index: number }
  | { kind: 'settle'; pick: number; accept: boolean; applyBeforeResolve: boolean };

const command: fc.Arbitrary<Command> = fc.oneof(
  fc.record({
    kind: fc.constant('move' as const),
    item: fc.nat(),
    cell: fc.nat(),
    index: fc.nat(),
  }),
  fc.record({
    kind: fc.constant('settle' as const),
    pick: fc.nat(),
    accept: fc.boolean(),
    applyBeforeResolve: fc.boolean(),
  }),
);

interface InFlight {
  op: MoveOperation;
  resolve: () => void;
  reject: (error: unknown) => void;
}

/** Runs every pending promise callback: a macrotask starts only after the microtask queue drains. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function project(items: readonly Card[], overlays: readonly MoveOperation[]): BoardModel<Card> {
  return projectBoard({ items, getItemId: (card) => card.id, getRank: (card) => card.rank, groupBy, overlays });
}

function layout(model: BoardModel<Card>): string[][] {
  return model.cells.map((cell) => cell.items.map((card) => card.id));
}

describe('move queue with planMove and projectBoard (property)', () => {
  it('always converges to the app data, with every card shown exactly once', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 6 }),
        fc.array(command, { minLength: 1, maxLength: 40 }),
        fc.array(fc.boolean(), { minLength: 40, maxLength: 40 }),
        async (count, commands, finalAccepts) => {
          const ranks = fractionalRank.nBetween(null, null, count);
          let data: Card[] = ranks.map((rank, i) => ({
            id: `c${i}`,
            status: ['todo', 'doing', 'done'][i % 3] ?? null,
            lane: i % 2 ? 'x' : 'y',
            rank,
          }));
          const inFlight: InFlight[] = [];
          const applied = new Set<string>();

          const queue = createMoveQueue({
            onMove: (op) =>
              new Promise<void>((resolve, reject) => {
                inFlight.push({ op, resolve, reject });
              }),
            readItem: (id) => {
              const card = data.find((each) => each.id === id);
              return card ? readItemSnapshot(card, groupBy, (each) => each.rank) : null;
            },
            settleTimeoutMs: 0,
            inflightTimeoutMs: 0,
          });

          const applyToData = (op: MoveOperation) => {
            if (applied.has(op.opId)) return;
            applied.add(op.opId);
            data = data.map((card) =>
              card.id === op.id ? applyMove(card, op, groupBy, (each, rank) => ({ ...each, rank })) : card,
            );
            queue.reconcile();
          };

          const checkShownOnce = () => {
            const model = project(data, queue.getSnapshot().overlays);
            const shown = model.cells.flatMap((cell) => cell.items.map((card) => card.id));
            expect(shown.sort()).toEqual(data.map((card) => card.id).sort());
          };

          const settle = async (entry: InFlight, accept: boolean, applyBeforeResolve: boolean) => {
            inFlight.splice(inFlight.indexOf(entry), 1);
            if (!accept) {
              entry.reject(new Error('rejected'));
              await flush();
              return;
            }
            if (applyBeforeResolve) applyToData(entry.op);
            entry.resolve();
            await flush();
            applyToData(entry.op);
          };

          for (const step of commands) {
            if (step.kind === 'move') {
              const model = project(data, queue.getSnapshot().overlays);
              const card = data[step.item % data.length]!;
              const cell = model.cells[step.cell % model.cells.length]!;
              const room = cell.items.filter((each) => each.id !== card.id).length;
              const op = planMove({
                model,
                groupBy,
                item: card,
                itemId: card.id,
                toCellId: cell.cellId,
                toIndex: step.index % (room + 1),
                overlay: queue.getOverlay(card.id),
              });
              if (op) queue.enqueue(op);
              await flush();
            } else if (inFlight.length > 0) {
              await settle(inFlight[step.pick % inFlight.length]!, step.accept, step.applyBeforeResolve);
            }
            checkShownOnce();
          }

          // Drain: every remaining move settles, in whatever order the queue releases them.
          let turn = 0;
          await flush();
          while (inFlight.length > 0) {
            await settle(inFlight[0]!, finalAccepts[turn % finalAccepts.length]!, turn % 2 === 0);
            turn += 1;
            await flush();
          }

          expect(queue.getSnapshot().overlays).toEqual([]);
          expect(layout(project(data, queue.getSnapshot().overlays))).toEqual(layout(project(data, [])));
          checkShownOnce();
          queue.dispose();
        },
      ),
      { numRuns: 200 },
    );
  });
});
