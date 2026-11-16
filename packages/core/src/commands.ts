/**
 * Board commands: every change an app, a shortcut, a deep link or an agent
 * can ask a board for, as plain JSON. A board runs them through one path
 * (`ref.run`), with the same rules as a drag: `canDrop`, limits, gates and
 * the optimistic queue.
 */

/** Where a card goes. `laneId` defaults to the card's lane; `index` to the top. */
export interface CommandDestination {
  readonly columnId: string;
  readonly laneId?: string;
  readonly index?: number | 'end';
}

export type BoardCommand =
  | { readonly type: 'move'; readonly itemId: string; readonly to: CommandDestination; readonly origin?: string }
  | {
      readonly type: 'moveMany';
      readonly itemIds: readonly string[];
      readonly to: CommandDestination;
      readonly origin?: string;
    }
  | { readonly type: 'undo'; readonly origin?: string }
  | { readonly type: 'select'; readonly itemIds: readonly string[]; readonly origin?: string }
  | { readonly type: 'scrollToColumn'; readonly columnId: string; readonly origin?: string }
  | { readonly type: 'revealItem'; readonly itemId: string; readonly origin?: string }
  | {
      readonly type: 'zoom';
      readonly level: 'card' | 'compact' | 'title' | 'dot';
      readonly columnId?: string;
      readonly origin?: string;
    }
  | { readonly type: 'openMoveSheet'; readonly itemId: string; readonly origin?: string };

export type BoardCommandType = BoardCommand['type'];

/**
 * Why a command did nothing:
 * - `invalid`: not a command (see `validateCommand`).
 * - `unknown-item`, `unknown-column`: not on the board.
 * - `refused`: `canDrop`, a full column, `readOnly`, or a move already waiting for its gate.
 * - `no-change`: the card is already there, or nothing to undo.
 * - `unavailable`: the board cannot do it now, such as zoom on a board without it.
 */
export type CommandRefusal = 'invalid' | 'unknown-item' | 'unknown-column' | 'refused' | 'no-change' | 'unavailable';

export type CommandResult =
  | { readonly ok: true; readonly command: BoardCommand; readonly moved?: number }
  | { readonly ok: false; readonly reason: CommandRefusal; readonly error?: string };

const ZOOM_LEVELS = ['card', 'compact', 'title', 'dot'] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isId = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

function destinationError(value: unknown): string | null {
  if (!isRecord(value)) return '`to` must be an object.';
  if (!isId(value.columnId)) return '`to.columnId` must be a non-empty string.';
  if (value.laneId !== undefined && !isId(value.laneId)) return '`to.laneId` must be a non-empty string.';
  const { index } = value;
  if (index !== undefined && index !== 'end' && !(typeof index === 'number' && Number.isInteger(index) && index >= 0))
    return '`to.index` must be a whole number from 0, or "end".';
  return null;
}

function idsError(value: unknown, field: string): string | null {
  if (!Array.isArray(value) || value.length === 0 || !value.every(isId))
    return `\`${field}\` must be a non-empty list of ids.`;
  return null;
}

/** Why `value` is not a command, or null when it is one. */
function commandError(value: unknown): string | null {
  if (!isRecord(value)) return 'A command must be an object.';
  if (value.origin !== undefined && typeof value.origin !== 'string') return '`origin` must be a string.';
  switch (value.type) {
    case 'move':
      return isId(value.itemId) ? destinationError(value.to) : '`itemId` must be a non-empty string.';
    case 'moveMany':
      return idsError(value.itemIds, 'itemIds') ?? destinationError(value.to);
    case 'undo':
      return null;
    case 'select':
      return Array.isArray(value.itemIds) && value.itemIds.every(isId)
        ? null
        : '`itemIds` must be a list of ids (empty ends the selection).';
    case 'scrollToColumn':
      return isId(value.columnId) ? null : '`columnId` must be a non-empty string.';
    case 'revealItem':
    case 'openMoveSheet':
      return isId(value.itemId) ? null : '`itemId` must be a non-empty string.';
    case 'zoom':
      if (!ZOOM_LEVELS.includes(value.level as (typeof ZOOM_LEVELS)[number]))
        return '`level` must be card, compact, title or dot.';
      return value.columnId === undefined || isId(value.columnId) ? null : '`columnId` must be a non-empty string.';
    default:
      return `Unknown command type ${JSON.stringify(value.type)}.`;
  }
}

/**
 * Checks untrusted JSON (a deep link, an agent's tool call, a saved shortcut)
 * before it reaches a board. Returns the command, or the reason it is not one.
 */
export function validateCommand(
  value: unknown,
): { readonly ok: true; readonly command: BoardCommand } | { readonly ok: false; readonly error: string } {
  const error = commandError(value);
  return error == null ? { ok: true, command: value as BoardCommand } : { ok: false, error };
}

const id = { type: 'string', minLength: 1 } as const;
const origin = {
  type: 'string',
  description: 'Who asked: "shortcut", "agent", "proposal". Passed to onMove as context.origin.',
} as const;
const destination = {
  type: 'object',
  required: ['columnId'],
  additionalProperties: false,
  properties: {
    columnId: id,
    laneId: { ...id, description: "Swimlanes only. Default: the card's lane." },
    index: {
      description: 'Insertion index in the target cell, the card itself left out. Default 0, the top.',
      oneOf: [{ type: 'integer', minimum: 0 }, { const: 'end' }],
    },
  },
} as const;

function variant(type: BoardCommandType, description: string, properties: Record<string, unknown> = {}) {
  const required = ['type', ...Object.keys(properties).filter((key) => key !== 'columnId' || type !== 'zoom')];
  return {
    type: 'object',
    description,
    required,
    additionalProperties: false,
    properties: { type: { const: type }, ...properties, origin },
  };
}

/**
 * JSON Schema (2020-12) for `BoardCommand`, for tool definitions, App
 * Intents, deep-link parsers and form builders. `validateCommand` checks the
 * same rules without a schema library.
 */
export const boardCommandSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://github.com/vishaal2002/react-native-board-view/schemas/board-command.json',
  title: 'BoardCommand',
  description: 'A change to ask a board for. The board applies its own rules and the app still decides in onMove.',
  oneOf: [
    variant('move', 'Move one card.', { itemId: id, to: destination }),
    variant('moveMany', 'Move cards together, keeping their board order.', {
      itemIds: { type: 'array', items: id, minItems: 1 },
      to: destination,
    }),
    variant('undo', 'Revert the newest move whose cards are still where they landed.'),
    variant('select', 'Replace the selection. An empty list ends it.', { itemIds: { type: 'array', items: id } }),
    variant('scrollToColumn', 'Bring a column on screen.', { columnId: id }),
    variant('revealItem', 'Scroll to a card and flash it.', { itemId: id }),
    variant('zoom', 'Zoom to a level of detail.', {
      level: { enum: [...ZOOM_LEVELS] },
      columnId: { ...id, description: 'Back at card level, the column to open.' },
    }),
    variant('openMoveSheet', "Open a card's Move sheet.", { itemId: id }),
  ],
} as const;
