import { createContext, use, useSyncExternalStore } from 'react';
import type { GestureType } from 'react-native-gesture-handler';
import type { SharedValue } from 'react-native-reanimated';
import type { DragAdapter } from './engine/types';
import type { ColumnMetrics } from './layout/metrics';
import type { BoardController } from './useBoardController';
import type { BoardLabels, BoardProps, BoardTheme } from './types';

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
