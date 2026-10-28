import { createContext, use, useSyncExternalStore } from 'react';
import type { GestureType } from 'react-native-gesture-handler';
import type { SharedValue } from 'react-native-reanimated';
import type { DragAdapter } from './engine/types';
import type { ColumnMetrics } from './layout/metrics';
import type { BoardController } from './useBoardController';
import type { GroupValue } from 'board-view-core';
import type { LimitState, PlannerDay } from './insights';
import type { BoardLabels, BoardProps, BoardTheme, CardAction, CardActionEvent, CardDropEvent } from './types';

export { createValueStore, type ValueStore } from './store';
import type { ValueStore } from './store';

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
  /** The column on screen as a visual slot: the page in `paged`, the leading column elsewhere. */
  readonly page: ValueStore<number>;
  /** Id of the column on screen, kept across layout remounts so rotation and the overview return to it. */
  readonly lastColumn: { current: string | null };
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
  /**
   * Calls `onCardAction`. False when the card or action is gone, or refused
   * for this card. `itemIds` defaults to the selection when the card is in it.
   */
  readonly runCardAction: (
    itemId: string,
    action: string,
    source: CardActionEvent<unknown>['source'],
    itemIds?: readonly string[],
  ) => boolean;
  /** `onCardDrop` is set: cards can be dropped onto other cards. */
  readonly cardDrops: boolean;
  /** Whether `onCardDrop` may get this card dropped onto that one. */
  readonly canDropOnCard: (itemId: string, targetId: string) => boolean;
  /** Calls `onCardDrop`. False when either card is gone or the drop is refused. */
  readonly dropOnCard: (itemId: string, targetId: string, source: CardDropEvent<unknown>['source']) => boolean;
  /** `selectable` is on: cards can join a selection. */
  readonly selectable: boolean;
  /** The selected cards, in the order they were picked. Empty when nothing is selected. */
  readonly selection: ValueStore<ReadonlySet<string>>;
  readonly setSelection: (itemIds: readonly string[]) => void;
  readonly toggleSelected: (itemId: string) => void;
  /** Opens the column or lane sheet: move it, collapse it. */
  readonly openHeaderSheet: (target: HeaderSheetTarget) => void;
  /**
   * The header's "…" handler, or undefined where there is nothing to reorder:
   * reorder is off, or the No value column or lane, which is not in `groupBy`.
   */
  readonly headerSheet: (kind: HeaderSheetTarget['kind'], id: string) => (() => void) | undefined;
  /** Columns can be reordered (`onColumnOrderChange`). */
  readonly reorderColumns: boolean;
  /** Lanes can be reordered (`onLaneOrderChange`). */
  readonly reorderLanes: boolean;
  /** Moves a column or lane to a new index among all of them, and tells the app. */
  readonly moveColumn: (columnId: string, toIndex: number) => void;
  readonly moveLane: (laneId: string, toIndex: number) => void;
  /** Lanes have collapse toggles. */
  readonly canCollapseLanes: boolean;
  /** Cards that `items` just moved by itself, to flash once. A new map for every change. */
  readonly externalMoves: ValueStore<ReadonlyMap<string, object>>;
  /** The whole-board overview is showing: cards draw small. */
  readonly overview: boolean;
  readonly setOverview: (open: boolean, columnId?: string) => void;
  /** The drop dock's height while it shows, so the lists end above it instead of under it. */
  readonly setDockInset: (height: number) => void;
  /** Limit, value and planner day for a column header. `items` sums a part of the column, such as one lane's cell. */
  readonly describeColumn: (columnId: string, total: number, items?: readonly unknown[]) => ColumnDescription;
  /** Spotlight and age of a card. */
  readonly describeCard: (item: unknown) => CardDescription;
  /** `layout="planner"`. */
  readonly planner: boolean;
  /** From `motion`: how much slower (above 1) or faster the dock, banner and sheet animate. */
  readonly durationScale: number;
}

export type HeaderSheetTarget = { readonly kind: 'column' | 'lane'; readonly id: string };

export interface ColumnDescription {
  readonly limit: number | null;
  readonly limitState: LimitState;
  readonly value: number | null;
  readonly valueLabel: string | null;
  readonly day: PlannerDay | null;
}

export interface CardDescription {
  readonly dimmed: boolean;
  readonly age: number | null;
  readonly stale: boolean;
}

export const BoardContext = createContext<BoardContextValue | null>(null);

/**
 * What a card reads, apart from the board context: a move, the dock showing
 * or the app re-rendering `<Board>` changes the board context, and every
 * card that read it would redraw. This one changes only with the props and
 * layout cards depend on. A card's own data (item, column, index) come as
 * props, and moves are read when they happen.
 */
export interface CardContextValue<T = unknown> {
  readonly renderCard: BoardProps<T>['renderCard'];
  readonly canDrag?: (item: T) => boolean;
  readonly hasLanes: boolean;
  readonly adapter: DragAdapter;
  readonly theme: BoardTheme;
  readonly labels: BoardLabels;
  readonly rtl: boolean;
  readonly reducedMotion: boolean;
  readonly overview: boolean;
  readonly sheetMode: 'auto' | 'manual' | false;
  /** 'manual': the board draws nothing over the card. */
  readonly cardMarks: 'auto' | 'manual';
  readonly selectable: boolean;
  /** Swipe-to-move is on (`multi` and `fit` layouts). */
  readonly swipeEnabled: boolean;
  readonly horizontalScrollGesture: GestureType;
  /** The columns drawn, in order, for swipe neighbours. The same array until they change. */
  readonly columns: readonly GroupValue[];
  readonly allColumns: readonly GroupValue[];
  readonly allLanes: readonly GroupValue[];
  /** Width a card gets in a column. */
  readonly cardWidth: (columnKey: string) => number;
  readonly describeCard: (item: unknown) => CardDescription;
  /** `cardActions` this card may use. */
  readonly actionsFor: (item: unknown) => readonly CardAction[];
  /** Whether the card's rules let it into a cell, given the columns that are full. */
  readonly allows: (item: unknown, fromColumnKey: string, cellId: string, fullColumns: ReadonlySet<string>) => boolean;
  /** Columns at their limit that refuse cards. */
  readonly fullColumns: ValueStore<ReadonlySet<string>>;
  /** Screen-reader actions are worth building: always on iOS, while an accessibility service runs on Android. */
  readonly accessibilityActions: boolean;
  readonly getItemLabel?: (item: T) => string;
  readonly moveItem: BoardController<T>['moveItem'];
  readonly runCardAction: BoardContextValue<T>['runCardAction'];
  readonly openMoveSheet: (itemId: string) => void;
  readonly toggleSelected: (itemId: string) => void;
  readonly selection: ValueStore<ReadonlySet<string>>;
  readonly highlight: ValueStore<{ readonly itemId: string } | null>;
  readonly externalMoves: ValueStore<ReadonlyMap<string, object>>;
  readonly focusRequest: ValueStore<string | null>;
  readonly scrollApi: { current: ScrollApi | null };
}

export const CardContext = createContext<CardContextValue | null>(null);

/** The board theme alone, for `useBoardTheme` in app cards: it changes far less often than the board. */
export const ThemeContext = createContext<BoardTheme | null>(null);

export function useStoreValue<V>(store: ValueStore<V>): V {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

export function useCard<T = unknown>(): CardContextValue<T> {
  const value = use(CardContext);
  if (!value) throw new Error('react-native-board-view: this component must render inside <Board>.');
  return value as CardContextValue<T>;
}

export function useBoard<T = unknown>(): BoardContextValue<T> {
  const value = use(BoardContext);
  if (!value) throw new Error('react-native-board-view: this component must render inside <Board>.');
  return value as BoardContextValue<T>;
}
