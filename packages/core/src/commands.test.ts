import { describe, expect, it } from 'vitest';
import { boardCommandSchema, validateCommand } from './index';

describe('validateCommand', () => {
  it('accepts every command type', () => {
    const commands = [
      { type: 'move', itemId: 'a', to: { columnId: 'done' } },
      { type: 'move', itemId: 'a', to: { columnId: 'done', laneId: 'x', index: 'end' }, origin: 'agent' },
      { type: 'moveMany', itemIds: ['a', 'b'], to: { columnId: 'done', index: 2 } },
      { type: 'undo' },
      { type: 'select', itemIds: [] },
      { type: 'scrollToColumn', columnId: 'done' },
      { type: 'revealItem', itemId: 'a' },
      { type: 'zoom', level: 'dot' },
      { type: 'zoom', level: 'card', columnId: 'done' },
      { type: 'openMoveSheet', itemId: 'a' },
    ];
    for (const command of commands) expect(validateCommand(command)).toEqual({ ok: true, command });
  });

  it('says why a value is not a command', () => {
    const cases: [unknown, RegExp][] = [
      [null, /object/],
      [{ type: 'explode' }, /Unknown command/],
      [{ type: 'move', to: { columnId: 'done' } }, /itemId/],
      [{ type: 'move', itemId: 'a', to: { columnId: '' } }, /columnId/],
      [{ type: 'move', itemId: 'a', to: { columnId: 'done', index: -1 } }, /index/],
      [{ type: 'move', itemId: 'a', to: { columnId: 'done', index: 1.5 } }, /index/],
      [{ type: 'moveMany', itemIds: [], to: { columnId: 'done' } }, /itemIds/],
      [{ type: 'zoom', level: 'huge' }, /level/],
      [{ type: 'undo', origin: 4 }, /origin/],
    ];
    for (const [value, error] of cases) {
      const result = validateCommand(value);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(error);
    }
  });
});

describe('boardCommandSchema', () => {
  it('has a variant per command type, each requiring its own fields', () => {
    const variants = boardCommandSchema.oneOf.map((variant) => [variant.properties.type.const, variant.required]);
    expect(Object.fromEntries(variants)).toEqual({
      move: ['type', 'itemId', 'to'],
      moveMany: ['type', 'itemIds', 'to'],
      undo: ['type'],
      select: ['type', 'itemIds'],
      scrollToColumn: ['type', 'columnId'],
      revealItem: ['type', 'itemId'],
      zoom: ['type', 'level'],
      openMoveSheet: ['type', 'itemId'],
    });
    expect(JSON.parse(JSON.stringify(boardCommandSchema))).toEqual(boardCommandSchema);
  });
});
