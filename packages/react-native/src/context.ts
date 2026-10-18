import { createContext, use, useSyncExternalStore } from 'react';
import type { GestureType } from 'react-native-gesture-handler';
import type { SharedValue } from 'react-native-reanimated';
import type { DragAdapter } from './engine/types';
import type { ColumnMetrics } from './layout/metrics';
import type { BoardController } from './useBoardController';
import type { GroupValue } from 'board-view-core';
import type { BoardLabels, BoardProps, BoardTheme, CardAction, CardActionEvent } from './types';

/** Minimal observable value, so a few components can follow it without re-rendering the board. */
export interface ValueStore<V> {
  get(): V;
  set(value: V): void;
  subscribe(listener: () => void): () => void;
}

export function createValueStore<V>(initial: V): ValueStore<V> {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next) {
      if (Object.is(next, value)) return;
      value = next;
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** Set by the active layout; used by tabs, the move sheet and the imperative handle. */
export interface ScrollApi {
  toColumn(columnId: string, animated: boolean): void;
  toItem(itemId: string, animated: boolean): void;
}

export interface BoardContextValue<T = unknown> {
  readonly props: BoardProps<T>;
  readonly controller: BoardController<T>;
  readonly adapter: DragAdapter;
  readonly theme: BoardTheme;
  readonly labels: BoardLabels;
  readonly metrics: ColumnMetrics;
  readonly boardWidth: number;
  readonly boardHeight: number;
  readonly rtl: boolean;
  readonly reducedMotion: boolean;
  /** Horizontal scroll offset on the UI thread, for headers that stay put. */
  readonly scrollX: SharedValue<number>;
  /** Native gesture of the horizontal scroller, so card swipes can block it. */
  readonly horizontalScrollGesture: GestureType;
  /** Current page of the paged layout (visual slot). */
  readonly page: ValueStore<number>;
  readonly scrollApi: { current: ScrollApi | null };
  readonly sheetMode: 'auto' | 'manual' | false;
  readonly swipeEnabled: boolean;
  readonly autoScroll: boolean;
  readonly canCollapseColumns: boolean;
  readonly collapsedColumns: ReadonlySet<string>;
  readonly collapsedLanes: ReadonlySet<string>;
  readonly toggleColumn: (columnId: string) => void;
  readonly toggleLane: (laneId: string) => void;
  readonly openMoveSheet: (itemId: string) => void;
  /** Columns in `loadingColumns`. */
  readonly loadingColumns: ReadonlySet<string>;
  /** `columnTotals` for a column, else the count passed in. */
  readonly columnTotal: (columnId: string, count: number) => number;
  /** The card `scrollToItem` asked to flash. A new object for every request. */
  readonly highlight: ValueStore<{ readonly itemId: string } | null>;
  /**
   * Every column and lane, hidden empty ones included, for the Move sheet, the
   * dock and screen-reader actions. `controller.model` holds only what is drawn.
   */
  readonly allColumns: readonly GroupValue[];
  readonly allLanes: readonly GroupValue[];
  /** `cardActions` this card may use. Empty in read-only boards. */
  readonly cardActionsFor: (itemId: string) => readonly CardAction[];
  /** Calls `onCardAction`. False when the card or action is gone, or refused for this card. */
  readonly runCardAction: (itemId: string, action: string, source: CardActionEvent<unknown>['source']) => boolean;
  /** The whole-board overview is showing: cards draw small. */
  readonly overview: boolean;
  readonly setOverview: (open: boolean, columnId?: string) => void;
  /** The drop dock's height while it shows, so the lists end above it instead of under it. */
  readonly setDockInset: (height: number) => void;
}

export const BoardContext = createContext<BoardContextValue | null>(null);

export function useStoreValue<V>(store: ValueStore<V>): V {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

export function useBoard<T = unknown>(): BoardContextValue<T> {
  const value = use(BoardContext);
  if (!value) throw new Error('react-native-board-view: this component must render inside <Board>.');
  return value as BoardContextValue<T>;
}
