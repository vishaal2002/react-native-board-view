import type { ReactNode } from 'react';

/**
 * Internal adapter contract. Not a stable public API.
 * cellId is `{laneKey}::{columnKey}`. With no lanes, laneKey is `_`.
 * toIndex is the insertion index after the dragged card is removed.
 * The adapter emits intents. Core turns them into move operations.
 */
export interface DragCapabilities {
  readonly crossContainer: boolean;
  readonly autoScrollOuter: boolean;
  readonly supportsFlashList: boolean;
}

export interface DragTransfer {
  itemId: string;
  fromCellId: string;
  toCellId: string;
  toIndex: number;
  /** Index from the engine before tail normalization. */
  rawToIndex: number;
}

export interface DragReorder {
  itemId: string;
  cellId: string;
  fromIndex: number;
  toIndex: number;
}

export interface CellScrollMetrics {
  cellId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  offset: number;
  maxOffset: number;
  contentEnd: number;
  itemIds: readonly string[];
  scrollTo: (offset: number) => void;
  remeasure: () => void;
}

export interface DraxCellBoardProps {
  children: ReactNode;
  horizontal?: boolean;
  mode?: 'continuous' | 'paged';
  pageSize?: number;
  reducedMotion?: boolean;
  active?: boolean;
  canDrag?: (itemId: string) => boolean;
  canDrop?: (itemId: string, toCellId: string) => boolean;
  onTransfer: (event: DragTransfer) => void;
  onReorder: (event: DragReorder) => void;
  onDragStart?: (event: { itemId: string; cellId: string }) => void;
  onDragEnd?: (event: { itemId: string; cancelled: boolean }) => void;
  onDropRejected?: (event: { itemId: string; toCellId: string }) => void;
  onHorizontalOffset?: (offset: number, maxOffset: number) => void;
}

export interface DraxCellProps {
  cellId: string;
  itemIds: readonly string[];
  renderCard: (itemId: string, index: number) => ReactNode;
  minHeight?: number;
  longPressDelay?: number;
  dragActivationFailOffset?: number;
  onVerticalOffset?: (offset: number, maxOffset: number) => void;
}
