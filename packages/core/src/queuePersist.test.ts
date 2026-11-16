import { describe, expect, it, vi } from 'vitest';
import { createMoveQueue, parseQueue, restoreQueue, serializeQueue, type MoveOperation } from './index';

const op = (opId: string, id: string, rank = 'a1'): MoveOperation => ({
  opId,
  id,
  changes: { status: 'done' },
  from: { status: 'todo' },
  rank,
  previousId: null,
  nextId: null,
  source: 'drag',
});

describe('queue persistence', () => {
  it('saves moves onMove has not accepted, in the order they were made, and sends them again after a restart', async () => {
    const never = new Promise<void>(() => {});
    const first = createMoveQueue({ onMove: () => never, readItem: () => null, inflightTimeoutMs: 0 });
    first.enqueue(op('1', 'a'));
    first.enqueue(op('2', 'b'));
    first.enqueue(op('3', 'a', 'a2'));
    expect(first.pending().map((entry) => entry.opId)).toEqual(['1', '2', '3']);
    const saved = serializeQueue(first);
    first.dispose();

    const onMove = vi.fn(async () => {});
    const second = createMoveQueue({ onMove, readItem: () => null, settleTimeoutMs: 0 });
    expect(restoreQueue(second, saved)).toBe(3);
    // The same ops again are skipped.
    expect(restoreQueue(second, saved)).toBe(0);
    expect(second.getOverlay('a')?.rank).toBe('a2');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onMove.mock.calls.map(([sent]) => sent.opId)).toEqual(['1', '2', '3']);
    expect(second.pending()).toEqual([]);
    second.dispose();
  });

  it('drops what does not parse', () => {
    expect(parseQueue('nope')).toEqual([]);
    expect(parseQueue(null)).toEqual([]);
    expect(parseQueue(JSON.stringify({ version: 1, ops: [op('1', 'a'), { opId: 2 }] }))).toEqual([op('1', 'a')]);
  });
});
