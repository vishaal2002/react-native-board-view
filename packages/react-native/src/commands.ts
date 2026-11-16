import { validateCommand, type BoardCommand, type BoardModel, type CommandResult } from 'board-view-core';
import { resolveDestination } from './session';
import type { MoveDestination, ZoomLevel } from './types';

/** What a board can do for a command. Missing pieces make their commands `unavailable`. */
export interface CommandTarget<T> {
  /** The board as plans see it. */
  model(): BoardModel<T>;
  readonly hasLanes: boolean;
  readonly columnIds: ReadonlySet<string>;
  readonly laneIds: ReadonlySet<string>;
  moveTo(itemId: string, to: MoveDestination, origin?: string): boolean;
  moveManyTo(itemIds: readonly string[], to: MoveDestination, origin?: string): number;
  undo(): boolean;
  canUndo(): boolean;
  select?(itemIds: readonly string[]): void;
  scrollToColumn?(columnId: string): void;
  revealItem?(itemId: string): void;
  /** False when the level is not one the board zooms to. */
  zoom?(level: ZoomLevel, columnId?: string): boolean;
  openMoveSheet?(itemId: string): void;
}

const refused = (reason: Exclude<CommandResult, { ok: true }>['reason'], error?: string): CommandResult =>
  error ? { ok: false, reason, error } : { ok: false, reason };

/** Runs a command against a board, checking it first. */
export function runBoardCommand<T>(raw: unknown, target: CommandTarget<T>): CommandResult {
  const checked = validateCommand(raw);
  if (!checked.ok) return refused('invalid', checked.error);
  const command: BoardCommand = checked.command;
  const model = target.model();
  const known = (to: MoveDestination) =>
    target.columnIds.has(to.columnId) && (to.laneId == null || !target.hasLanes || target.laneIds.has(to.laneId));
  switch (command.type) {
    case 'move': {
      const at = model.locations.get(command.itemId);
      if (!at) return refused('unknown-item');
      if (!known(command.to)) return refused('unknown-column');
      const place = resolveDestination(model, command.itemId, command.to, target.hasLanes);
      if (place && place.cellId === at.cellId && place.index === at.index) return refused('no-change');
      return target.moveTo(command.itemId, command.to, command.origin)
        ? { ok: true, command, moved: 1 }
        : refused('refused');
    }
    case 'moveMany': {
      if (!command.itemIds.some((itemId) => model.locations.has(itemId))) return refused('unknown-item');
      if (!known(command.to)) return refused('unknown-column');
      const moved = target.moveManyTo(command.itemIds, command.to, command.origin);
      return moved > 0 ? { ok: true, command, moved } : refused('refused');
    }
    case 'undo':
      if (!target.canUndo()) return refused('no-change');
      return target.undo() ? { ok: true, command } : refused('refused');
    case 'select':
      if (!target.select) return refused('unavailable');
      target.select(command.itemIds.filter((itemId) => model.locations.has(itemId)));
      return { ok: true, command };
    case 'scrollToColumn':
      if (!target.scrollToColumn) return refused('unavailable');
      if (!target.columnIds.has(command.columnId)) return refused('unknown-column');
      target.scrollToColumn(command.columnId);
      return { ok: true, command };
    case 'revealItem':
      if (!target.revealItem) return refused('unavailable');
      if (!model.locations.has(command.itemId)) return refused('unknown-item');
      target.revealItem(command.itemId);
      return { ok: true, command };
    case 'zoom':
      if (command.columnId != null && !target.columnIds.has(command.columnId)) return refused('unknown-column');
      return target.zoom?.(command.level, command.columnId) ? { ok: true, command } : refused('unavailable');
    case 'openMoveSheet':
      if (!target.openMoveSheet) return refused('unavailable');
      if (!model.locations.has(command.itemId)) return refused('unknown-item');
      target.openMoveSheet(command.itemId);
      return { ok: true, command };
  }
}
