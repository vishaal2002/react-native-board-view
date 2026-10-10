import type { ComponentType, ReactNode } from 'react';
import type { LayoutChangeEvent, StyleProp, ViewStyle } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import type { AutoScrollMode } from './autoScroll';
import type { Rect } from './geometry';

/**
 * Internal drag adapter contract (not public API in v1). The board layout
 * talks to an adapter only through these components and hooks, so the
 * engine can be swapped without touching layout or core.
 *
 * - `cellId` is `${laneKey}::${columnKey}`; boards without lanes use `_`.
 * - `toIndex` is the insertion index in the target cell AFTER the dragged
 *   card is removed. The adapter normalizes engine quirks before emitting.
 * - The adapter emits intents only. Core turns them into move operations.
 */
export interface DragCapabilities {
  readonly crossContainer: boolean;
  readonly autoScrollOuter: boolean;
  readonly supportsFlashList: boolean;
}

export interface TransferIntent {
  itemId: string;
  fromCellId: string;
  toCellId: string;
  toIndex: number;
}

export interface ReorderIntent {
  itemId: string;
  cellId: string;
  fromIndex: number;
  toIndex: number;
}

/** Row id of the placeholder a cell renders while a card is lifted. */
export const PLACEHOLDER_ID = '\u0000placeholder';

/** The whole drag as layouts see it: which card is lifted and where its placeholder is. */
export interface DragPlacement {
  readonly itemId: string;
  readonly sourceCellId: string;
  readonly sourceIndex: number;
  readonly height: number;
  readonly cellId: string;
  readonly index: number;
}

/**
 * What one cell must render while a card is lifted: hide the lifted card
 * and show a placeholder of `placeholderHeight` at `placeholderIndex`
 * (an index in the list with the lifted card removed).
 */
export interface CellPlacement {
  readonly hiddenItemId: string | null;
  readonly placeholderIndex: number | null;
  readonly placeholderHeight: number;
}

export interface DragBoardProps {
  /** Returns false when the move is refused; the card then goes home. */
  onTransfer(event: TransferIntent): boolean;
  onReorder(event: ReorderIntent): boolean;
  onDragStart?(event: { itemId: string; cellId: string }): void;
  /** The placeholder moved to a new slot. */
  onDragOver?(event: { itemId: string; cellId: string; index: number }): void;
  onDragEnd?(event: { itemId: string; cancelled: boolean }): void;
  /** Long-press released without moving: the phone "long-press menu". */
  onLongPressMenu?(event: { itemId: string; cellId: string }): void;
  canDrag?(itemId: string): boolean;
  canDrop?(itemId: string, toCellId: string): boolean;
  /**
   * Checked whenever `revision` changes during a drag. False (the card is gone,
   * or app data moved it to another cell) aborts the drag.
   */
  isDragValid?(itemId: string, sourceCellId: string): boolean;
  revision?: unknown;
  /** Mirrors the pointer in board coordinates while dragging. */
  dragPosition?: SharedValue<{ x: number; y: number }>;
  longPressDelay?: number;
  reducedMotion?: boolean;
  /** Phone-sized board: wider auto-scroll edges. */
  compact?: boolean;
  enabled?: boolean;
  /** Renders the lifted card. */
  renderHover(itemId: string): ReactNode;
  colors?: { outline: string; reject: string };
  /**
   * Live horizontal scroll offset on the UI thread. Lets drop-target
   * feedback track sideways scrolling without waiting for JS.
   */
  horizontalOffset?: SharedValue<number>;
  children: ReactNode;
}

/** A scroll container the engine can read and drive while dragging. */
export interface ScrollerHandle {
  readonly axis: 'x' | 'y';
  getOffset(): number;
  getMaxOffset(): number;
  /** Visible extent along the axis, in board coordinates. */
  getViewport(): { start: number; size: number } | null;
  scrollTo(offset: number, animated: boolean): void;
  readonly mode?: AutoScrollMode;
  getPageSize?(): number;
}

/**
 * Geometry a cell gives the engine. Methods run every frame during a drag
 * and must be cheap: read refs and list layouts, never measure views.
 * All positions are in board coordinates. "Displayed" means the list as
 * rendered right now: lifted card hidden, placeholder shown.
 */
export interface CellGeometry {
  /** Visible drop area, or null when off screen. */
  getRect(): Rect | null;
  /** Insertion index (lifted card removed) for a pointer at `y`, from the displayed rows. */
  resolve(y: number): number;
  /** Card under `y`, for starting a drag. `index` is its index in the cell. */
  itemAt(y: number): { itemId: string; index: number; rect: Rect } | null;
  /** Where a displayed row is now; `PLACEHOLDER_ID` gives the placeholder. */
  itemRect(itemId: string): Rect | null;
  /** Scroller that auto-scrolls vertically when hovering this cell. */
  readonly scroller?: ScrollerHandle;
  /** Collapsed lanes and similar cells refuse drops. */
  accepts(): boolean;
}

export interface DragCellProps {
  cellId: string;
  geometry: CellGeometry;
  style?: StyleProp<ViewStyle>;
  onLayout?: (event: LayoutChangeEvent) => void;
  children?: ReactNode;
}

export interface DragCardProps {
  itemId: string;
  cellId: string;
  index: number;
  children: ReactNode;
}

export interface PlaceholderProps {
  height: number;
  radius: number;
  color: string;
  render?: () => ReactNode;
}

export interface DragAdapter {
  readonly capabilities: DragCapabilities;
  readonly Provider: ComponentType<{ children: ReactNode }>;
  readonly Board: ComponentType<DragBoardProps>;
  /** Registers a drop target. Cells register even when empty. */
  readonly Cell: ComponentType<DragCellProps>;
  /** Hides the card while the lifted copy settles over it. */
  readonly Card: ComponentType<DragCardProps>;
  /** The gap a cell renders where the lifted card will land. */
  readonly Placeholder: ComponentType<PlaceholderProps>;
  /** Registers the board's horizontal scroller (or a shared vertical one). */
  readonly useScroller: (key: 'horizontal' | 'vertical', handle: ScrollerHandle | null) => void;
  /** This cell's part of the current drag. Re-renders only cells whose part changes. */
  readonly usePlacement: (cellId: string) => CellPlacement;
  /** The lifted card and its source cell, or null. Changes twice per drag. */
  readonly useDragSource: () => { itemId: string; cellId: string } | null;
  /** The whole placement, for layouts that render every cell in one list. */
  readonly usePlacementState: () => DragPlacement | null;
}
