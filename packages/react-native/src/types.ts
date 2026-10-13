import type { ReactNode, Ref } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import type { GroupBy, GroupValue, MoveContext, MoveOperation, RankStrategy } from 'board-view-core';

/**
 * - `paged`: one column per page with snapping and a peek of the next one. Phones.
 *   Renders the visible page ±1.
 * - `multi`: fixed-width columns side by side, scrolling sideways. Tablets.
 * - `fit`: columns share the width, so nothing scrolls sideways while they stay at least
 *   `theme.minColumnWidth` wide; past that the board scrolls instead of squashing cards.
 * - `stacked`: one vertical list with a collapsible section per column. No sideways scrolling.
 * - `auto`: `paged` below 600pt of board width, else `multi`.
 */
export type BoardLayout = 'auto' | 'paged' | 'multi' | 'fit' | 'stacked';

export interface MoveModes {
  /** Long-press drag. Default 'auto'. */
  drag?: 'auto' | false;
  /**
   * "Move to…" sheet, opened from the card's "…" button and by long-pressing
   * then releasing without moving. 'manual' keeps the sheet but leaves the
   * button to you: call `openMoveSheet` from `renderCard`. Default 'auto'.
   * Screen-reader move actions stay available in every mode.
   */
  sheet?: 'auto' | 'manual' | false;
  /**
   * Swipe a card sideways to move it to the neighbouring column. Only in the
   * `multi` and `fit` layouts: on paged phone layouts a sideways swipe turns
   * the page. Off by default (experimental): it competes with sideways
   * scrolling, and a mis-swipe moves a card.
   */
  swipe?: 'auto' | false;
}

export interface MoveTarget {
  readonly cellId: string;
  readonly columnId: string;
  /** Null on boards without lanes. */
  readonly laneId: string | null;
}

export interface DragStartEvent {
  readonly itemId: string;
  readonly from: MoveTarget;
}

/** The drop target changed while dragging: a good moment for a selection haptic. */
export interface DragOverEvent {
  readonly itemId: string;
  readonly target: MoveTarget;
  /** Insertion index in the target cell, after removing the dragged card. */
  readonly index: number;
}

export interface DragEndEvent {
  readonly itemId: string;
  /** True when the card went back: released outside a target, refused, or interrupted. */
  readonly cancelled: boolean;
}

export interface CardRenderInfo<T> {
  readonly item: T;
  readonly cellId: string;
  /** Position in its cell, pending moves included. */
  readonly index: number;
  readonly count: number;
  readonly column: GroupValue;
  readonly lane: GroupValue | null;
  /** A move of this card is waiting for `onMove` or for your data to show it. */
  readonly pending: boolean;
  /** True for the lifted copy that follows the finger. */
  readonly dragging: boolean;
  /** The column is narrow (cards under 200pt wide): show less. */
  readonly compact: boolean;
  readonly openMoveSheet: () => void;
}

export interface ColumnHeaderRenderInfo {
  readonly column: GroupValue;
  /** Cards the board has for this column. */
  readonly count: number;
  /** `columnTotals` for this column, or `count` when you pass none. */
  readonly total: number;
  readonly collapsed: boolean;
  /** The column is narrow (under 180pt): stack the header instead of truncating. */
  readonly compact: boolean;
  /** Present when the column can collapse in this layout. */
  readonly toggleCollapsed?: () => void;
}

export interface LaneHeaderRenderInfo {
  readonly lane: GroupValue;
  readonly count: number;
  readonly collapsed: boolean;
  readonly toggleCollapsed: () => void;
}

export interface EmptyCellRenderInfo {
  readonly column: GroupValue;
  readonly lane: GroupValue | null;
}

export interface ColumnFooterRenderInfo {
  readonly column: GroupValue;
  readonly lane: GroupValue | null;
  readonly count: number;
  /** The column is in `loadingColumns`. */
  readonly loading: boolean;
}

/**
 * Where `moveItem` puts a card. `NO_VALUE_ID` is the No value column or lane.
 */
export interface MoveDestination {
  readonly columnId: string;
  /** Swimlanes only. Default: the card's current lane. */
  readonly laneId?: string;
  /**
   * Position in the target cell, counted without the moved card. Default 0,
   * the top. `'end'` is the bottom. Out-of-range numbers are clamped.
   */
  readonly index?: number | 'end';
}

export interface ScrollToItemOptions {
  animated?: boolean;
  /** Flash an outline on the card once it is on screen. Default false. */
  highlight?: boolean;
}

export interface BoardTheme {
  background: string;
  columnBackground: string;
  columnBorder: string;
  laneHeaderBackground: string;
  cardBackground: string;
  cardBorder: string;
  text: string;
  mutedText: string;
  /** Drop line, drop-target outline, active tab. */
  accent: string;
  /** Outline over a cell that refuses the card. */
  reject: string;
  emptyCellBorder: string;
  sheetBackground: string;
  sheetBackdrop: string;
  sheetDivider: string;
  /** Corner radius of columns and cells. */
  radius: number;
  cardRadius: number;
  /** Column width in the `multi` layout. */
  columnWidth: number;
  /** Width of a collapsed column strip. */
  collapsedColumnWidth: number;
  /** The `fit` layout never shrinks columns below this; it scrolls sideways instead. */
  minColumnWidth: number;
  columnGap: number;
  /** Padding around cards inside a column or cell. */
  cellPadding: number;
  /** Space between cards. */
  cardGap: number;
  cellMinHeight: number;
  fontFamily?: string;
}

export interface CardAccessibilityContext {
  item: string;
  column: string;
  lane: string | null;
  position: number;
  count: number;
  pending: boolean;
}

export interface MoveAnnouncementContext {
  item: string;
  column: string;
  lane: string | null;
  position: number;
  count: number;
}

export interface BoardLabels {
  noValue: string;
  moveTo: string;
  moveSheetTitle: (item: string) => string;
  column: string;
  lane: string;
  position: string;
  top: string;
  bottom: string;
  cancel: string;
  current: string;
  showMore: (hidden: number) => string;
  expandLane: (lane: string) => string;
  collapseLane: (lane: string) => string;
  expandColumn: (column: string) => string;
  collapseColumn: (column: string) => string;
  emptyCell: string;
  card: (context: CardAccessibilityContext) => string;
  moveToColumnAction: (column: string) => string;
  moveToLaneAction: (lane: string) => string;
  moved: (context: MoveAnnouncementContext) => string;
  moveFailed: (context: { item: string; column: string; lane: string | null }) => string;
  columnTab: (column: string, count: number) => string;
  /** Screen-reader label of the spinner at the end of a loading column. */
  loadingMore: string;
}

/** Imperative controls, through the `ref` prop. */
export interface BoardHandle {
  scrollToColumn(columnId: string, options?: { animated?: boolean }): void;
  scrollToItem(itemId: string, options?: ScrollToItemOptions): void;
  /**
   * Moves a card the way a drop does: on screen at once, then `onMove` with
   * `source: 'api'`, and a rollback if it rejects. `canDrop` and `readOnly`
   * apply. Returns false when nothing was queued: an unknown card or
   * column, a refused target, or a move that changes nothing.
   */
  moveItem(itemId: string, to: MoveDestination): boolean;
  openMoveSheet(itemId: string): void;
  closeMoveSheet(): void;
}

export interface BoardProps<T> {
  /** Flat items, already filtered by the app. The board never copies or edits them. */
  items: readonly T[];
  getItemId: (item: T) => string;
  /** One global sortable rank per item. Default: `item.rank`. */
  getRank?: (item: T) => string;
  /** Name used in screen-reader labels and the move sheet. Default: the id. */
  getItemLabel?: (item: T) => string;
  groupBy: GroupBy<T>;
  /**
   * Called once per move, in order per item. Resolve when the move is
   * accepted; reject to roll the card back. The overlay stays until `items`
   * shows the move (or `settleTimeoutMs` passes), so `setState` timing never
   * matters. Pass `context.signal` to your request: it aborts when the move
   * times out (`inflightTimeoutMs`) or the board unmounts.
   */
  onMove: (op: MoveOperation, context: MoveContext) => Promise<void> | void;
  /** A move was rejected (or timed out) and rolled back. The board already announces it to screen readers. */
  onMoveError?: (op: MoveOperation, error: unknown) => void;
  onDragStart?: (event: DragStartEvent) => void;
  onDragOver?: (event: DragOverEvent) => void;
  onDragEnd?: (event: DragEndEvent) => void;
  canDrag?: (item: T) => boolean;
  canDrop?: (item: T, target: MoveTarget) => boolean;

  renderCard: (info: CardRenderInfo<T>) => ReactNode;
  renderColumnHeader?: (info: ColumnHeaderRenderInfo) => ReactNode;
  renderLaneHeader?: (info: LaneHeaderRenderInfo) => ReactNode;
  renderEmptyCell?: (info: EmptyCellRenderInfo) => ReactNode;
  renderColumnFooter?: (info: ColumnFooterRenderInfo) => ReactNode;
  renderDropIndicator?: () => ReactNode;

  layout?: BoardLayout;
  /** Under `layout="auto"`, boards narrower than this many points are paged, wider ones multi. Default 600. */
  autoBreakpoint?: number;
  /** Paged layout only: column chips above the board, page dots, or nothing. Default 'tabs'. */
  pagerIndicator?: 'tabs' | 'dots' | 'none';
  /** Column to show first in the paged and multi layouts. Ignored once `columnId` is set. */
  initialColumnId?: string;
  /**
   * Column to keep on screen. Changing it scrolls there. Update it from
   * `onColumnChange` so a swipe stays where the finger left it.
   */
  columnId?: string;
  /** Paged layout: the column now on screen. */
  onColumnChange?: (columnId: string) => void;
  /**
   * The user reached the end of a column. The board does not fetch: append
   * items and pass them back in. It fires again only after that append moves
   * the end off screen and the user scrolls to it. Paged, multi and fit fire
   * this for the column that was scrolled. Swimlanes share one vertical list,
   * so the bottom of that list fires it once per column. Stacked fires it for
   * the last column.
   */
  onEndReached?: (columnId: string) => void;
  /**
   * Columns that are fetching more cards, for example after `onEndReached`.
   * A spinner shows where that event fired: at the end of the column in the
   * paged, multi and fit layouts, and at the end of the board in swimlanes
   * and stacked.
   */
  loadingColumns?: readonly string[];
  /**
   * Server-side card counts by column id, for columns you load in pages.
   * Headers, tabs and screen-reader labels show these instead of the number
   * of cards loaded.
   */
  columnTotals?: Readonly<Record<string, number>>;
  /** Pull down on a list to refresh. The board does not fetch: set `refreshing` while you do. */
  onRefresh?: () => void;
  /** Shows the pull-to-refresh spinner. Needs `onRefresh`. */
  refreshing?: boolean;
  /** Collapse toggles on column headers. Default: on in `stacked`, off elsewhere. Never in `paged`. */
  collapsibleColumns?: boolean;
  /** Controlled. Omit both to let the board keep this state itself. */
  collapsedColumns?: readonly string[];
  onCollapsedColumnsChange?: (columnIds: string[]) => void;
  /** Controlled. Omit both to let the board keep this state itself. */
  collapsedLanes?: readonly string[];
  onCollapsedLanesChange?: (laneIds: string[]) => void;
  moveModes?: MoveModes;
  /**
   * Display only. Scrolling, paging, collapse and Show more stay on.
   * Drag, swipe, the Move sheet and screen-reader move actions stay off.
   */
  readOnly?: boolean;
  /** Scroll the board while a card is held near an edge. Default true. */
  autoScroll?: boolean;
  /** Long-press time before a drag starts, 150–250 ms. Default 200. */
  longPressDelay?: number;

  appearance?: 'auto' | 'light' | 'dark';
  density?: 'comfortable' | 'compact';
  theme?: Partial<BoardTheme>;
  labels?: Partial<BoardLabels>;

  /** Cards shown per swimlane cell before "Show more". Default 50. */
  cellLimit?: number;
  /** Replaces the default fractional-indexing ranks. */
  rankStrategy?: RankStrategy;
  /** How long a resolved move may wait for `items` to show it. Default 5000. */
  settleTimeoutMs?: number;
  /**
   * How long `onMove` may stay pending before the move rolls back with a
   * `MoveTimeoutError`. Default 30000. Set 0 when `onMove` waits for the user,
   * e.g. a form that asks for required fields.
   */
  inflightTimeoutMs?: number;
  ref?: Ref<BoardHandle>;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}
