import type { ReactNode, Ref } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import type { GroupBy, GroupValue, MoveContext, MoveOperation, RankStrategy } from 'board-view-core';
import type { HapticHandler } from './haptics';
import type { LaneShare, LimitState, PlannerDay } from './insights';

/**
 * - `paged`: one column per page with snapping and a peek of the next one. Phones.
 *   Renders the visible page ±1.
 * - `multi`: fixed-width columns side by side, scrolling sideways. Tablets.
 * - `fit`: columns share the width, so nothing scrolls sideways while they stay at least
 *   `theme.minColumnWidth` wide; past that the board scrolls instead of squashing cards.
 * - `stacked`: one vertical list with a collapsible section per column. No sideways scrolling.
 * - `matrix`: swimlane boards only. Lanes are rows and columns are columns, and
 *   every cell is on screen at once, each scrolling on its own. For small grids
 *   such as a 2 × 2 priority matrix. Boards without lanes use `fit` instead.
 * - `planner`: a column per day, side by side like `multi`, with day headers,
 *   today marked, weekends dimmed and a Today button. Column ids are
 *   `YYYY-MM-DD` dates: build them with `dayColumns`, and add more days from
 *   `onEdgeReached`.
 * - `auto`: `paged` below 600pt of board width, else `multi`.
 */
export type BoardLayout = 'auto' | 'paged' | 'multi' | 'fit' | 'stacked' | 'matrix' | 'planner';

/** How `columnLimits` are enforced. */
export type LimitBehavior = 'warn' | 'block';

/** Timing and feel of lift, landing, the dock and the banner. Reduced motion still wins. */
export type MotionPreset = 'standard' | 'calm' | 'snappy' | 'playful';

export interface MoveModes {
  /**
   * `'auto'`: long-press anywhere on a card. `'handle'`: drag only from a
   * `<DragHandle>` in your card, with no long press, so the rest of the card
   * keeps its own taps and scrolling. Default 'auto'.
   */
  drag?: 'auto' | 'handle' | false;
  /**
   * "Move to…" sheet, opened from the card's "…" button and, with long-press
   * drag, by long-pressing then releasing without moving. 'manual' keeps the sheet but leaves the
   * button to you: call `openMoveSheet` from `renderCard`. Default 'auto'.
   * Screen-reader move actions stay available in every mode.
   */
  sheet?: 'auto' | 'manual' | false;
  /**
   * With long-press drag, a long press released without moving opens the Move
   * sheet. False keeps long press for dragging only; the "…" button and
   * screen-reader actions still open the sheet. Default true.
   */
  longPressSheet?: boolean;
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

/**
 * Something the app can do with a card besides moving it, such as Archive or
 * Assign to me. Offered in the drop dock, the Move sheet and the card's
 * screen-reader actions. The board never edits items: it calls `onCardAction`.
 */
export interface CardAction {
  readonly key: string;
  readonly label: string;
  /** Drawn before the label in the dock and the sheet. */
  readonly icon?: ReactNode;
  /** Label and icon tint, e.g. red for Delete. Default: the theme's text color. */
  readonly color?: string;
}

export interface CardActionEvent<T> {
  readonly action: string;
  readonly itemId: string;
  readonly item: T;
  readonly from: MoveTarget;
  readonly source: 'dock' | 'sheet' | 'accessibility';
  /**
   * Every card the action applies to: the selected cards when the card is part
   * of a selection, else just this one. `itemId` is always among them.
   */
  readonly itemIds: readonly string[];
}

/** One card of a move held by `gateMove`. */
export interface GatedMove<T> {
  readonly op: MoveOperation;
  readonly item: T;
}

/** What `renderMoveGate` gets while a held move waits for the user. */
export interface MoveGateInfo<T> {
  /** What `gateMove` returned, or `'confirm'` for a column in `confirmInto`. */
  readonly request: unknown;
  /** Every card of the move: one, or a whole batch. */
  readonly moves: readonly GatedMove<T>[];
  /** Where the cards are going. */
  readonly to: MoveTarget;
  /** Queues the moves. `answer` reaches `onMove` as `context.answer`. */
  readonly submit: (answer?: unknown) => void;
  /** Sends the cards back where they were. */
  readonly cancel: () => void;
}

/** `onMove`'s context: the queue's signal, and the answer when the move was held by `gateMove`. */
export interface BoardMoveContext extends MoveContext {
  /** What the gate submitted. Undefined when the move was not held. */
  readonly answer?: unknown;
}

/** A lifted card was dropped onto another card. Nothing moved. */
export interface CardDropEvent<T> {
  readonly itemId: string;
  readonly item: T;
  readonly targetId: string;
  readonly target: T;
  /** Every card dragged: the selected cards when the card is part of a selection, else just this one. */
  readonly itemIds: readonly string[];
  readonly source: 'drag' | 'sheet';
}

/** A lifted card was dropped on a `BoardDropTarget`. Nothing moved. */
export interface BoardDropTargetEvent<T> {
  readonly targetId: string;
  readonly itemId: string;
  readonly item: T;
  /** Every card dragged: the selected cards when the card is part of a selection, else just this one. */
  readonly itemIds: readonly string[];
  readonly from: MoveTarget;
}

/** What the drop dock shows while a card is lifted. */
export interface DropDockOptions {
  /**
   * Column chips. Dropping a card on one moves it to the top of that column,
   * in the card's lane. `true`: every column. A list of column ids: those
   * columns, in that order. Default true.
   */
  columns?: boolean | readonly string[];
  /** `cardActions` as drop targets. Default true. */
  actions?: boolean;
}

export interface UndoOptions {
  /** How long the banner stays, in ms. It stays until dismissed while a screen reader runs. Default 5000. */
  timeoutMs?: number;
}

export interface UndoBannerContext {
  readonly item: string;
  readonly column: string;
  readonly lane: string | null;
  /** Cards the move took: more than 1 for a batch. */
  readonly count: number;
}

export interface DragStartEvent {
  readonly itemId: string;
  readonly from: MoveTarget;
  /** The cards riding along: the selection when the lifted card is selected, else just it. */
  readonly itemIds: readonly string[];
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
  /** `spotlight` is set and this card is outside it: draw it quietly. The board fades it unless `cardMarks` is 'manual'. */
  readonly dimmed: boolean;
  /** `getItemAge` for this card, in days, or null. */
  readonly age: number | null;
  /** `age` has reached `staleAfterDays`. */
  readonly stale: boolean;
  /** The card is in the selection. The board draws a check and an outline unless `cardMarks` is 'manual'. */
  readonly selected: boolean;
  /** A selection is open: a tap on a card selects it instead of `onPress`. */
  readonly selecting: boolean;
  /** `scrollToItem` with `highlight`, or a move from your data, is pointing at this card for a moment. */
  readonly highlighted: boolean;
  /** A pointer (mouse, trackpad) is over the card. */
  readonly hovered: boolean;
  /** On the lifted copy: how many cards this drag moves, more than 1 when it carries the selection. 0 elsewhere. */
  readonly dragCount: number;
  readonly openMoveSheet: () => void;
  /** Adds the card to the selection, or takes it out. */
  readonly toggleSelected: () => void;
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
  /** `columnLimits` for this column, or null. */
  readonly limit: number | null;
  /** `total` against `limit`. `none` without a limit. */
  readonly limitState: LimitState;
  /** Sum of `getItemValue` over the column's cards, or null without it. */
  readonly value: number | null;
  /** `value` through `formatValue`, or null. */
  readonly valueLabel: string | null;
  /** In the planner, the day this column is. Null elsewhere and for non-date columns. */
  readonly day: PlannerDay | null;
  /** Present when `onColumnOrderChange` is set: opens the column's sheet, with move and collapse. */
  readonly openColumnSheet?: () => void;
}

export interface LaneHeaderRenderInfo {
  readonly lane: GroupValue;
  readonly count: number;
  readonly collapsed: boolean;
  /** Present when lanes can collapse (`collapsibleLanes`, on by default). */
  readonly toggleCollapsed?: () => void;
  /** Present when `onLaneOrderChange` is set: opens the lane's sheet, with move and collapse. */
  readonly openLaneSheet?: () => void;
  /** The lane's cards per column, in column order: the default header draws it as a bar. */
  readonly distribution: readonly LaneShare[];
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
  readonly animated?: boolean;
  /** Flash an outline on the card once it is on screen. Default false. */
  readonly highlight?: boolean;
}

/** Built-in palettes, each with a light and a dark variant. */
export type ThemePresetName = 'standard' | 'paper' | 'slate' | 'aurora';

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
  /** Scale of the lifted card. 1 keeps it flat. */
  liftScale: number;
  /** Tilt of the lifted card, in degrees. */
  liftTilt: number;
  /**
   * iOS shadow under the lifted card, 0 to 1, drawn on top of the shadow your
   * card draws itself (`CardView` has one while `dragging`). Android ignores it:
   * there, give your card an `elevation` while `dragging`.
   */
  liftShadowOpacity: number;
  /** Milliseconds a dropped card takes to land, or to fly home. */
  dropDuration: number;
  /** A column at its limit, and stale cards. */
  warning: string;
}

export interface CardAccessibilityContext {
  readonly item: string;
  readonly column: string;
  readonly lane: string | null;
  readonly position: number;
  readonly count: number;
  readonly pending: boolean;
  /** Outside the `spotlight`. */
  readonly dimmed: boolean;
  /** Days old, when `getItemAge` is given and the card is stale. */
  readonly staleDays: number | null;
  /** In the selection. */
  readonly selected: boolean;
}

export interface ColumnSummaryContext {
  readonly column: string;
  readonly total: number;
  readonly limit: number | null;
  readonly limitState: LimitState;
  readonly valueLabel: string | null;
  /** Planner columns: the full date, such as "Monday 19 October". */
  readonly date: string | null;
  readonly today: boolean;
}

export interface MoveAnnouncementContext {
  readonly item: string;
  readonly column: string;
  readonly lane: string | null;
  readonly position: number;
  readonly count: number;
}

/** A batch of cards moved together. */
export interface BatchAnnouncementContext {
  readonly count: number;
  readonly column: string;
  readonly lane: string | null;
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
  /** Move sheet section with `cardActions`. */
  actions: string;
  /** Move sheet subtitle: where the card is now. */
  currentPlace: (context: MoveAnnouncementContext) => string;
  moveUp: string;
  moveDown: string;
  previousColumn: string;
  nextColumn: string;
  /** Placeholder of the Move sheet's column search. */
  searchColumns: string;
  noColumnsMatch: string;
  undo: string;
  dismiss: string;
  undoBanner: (context: UndoBannerContext) => string;
  /** Accessibility label of the overview, and of the button that leaves it. */
  overview: string;
  closeOverview: string;
  /** What a screen reader says for a column header. */
  columnSummary: (context: ColumnSummaryContext) => string;
  /** Next to a column the Move sheet cannot use because it is full. */
  full: string;
  /** The planner's button back to today. */
  today: string;
  /** A batch moved, once `onMove` accepts its last card. */
  movedMany: (context: BatchAnnouncementContext) => string;
  /** Card action and Move sheet button that starts a selection with the card. */
  select: string;
  /** Card action that takes a selected card out of the selection. */
  deselect: string;
  /** The selection bar's count, such as "3 selected". */
  selectedCount: (count: number) => string;
  /** Selection bar button that opens the Move sheet for every selected card. */
  moveSelected: string;
  /** Selection bar button that ends the selection. */
  clearSelection: string;
  /** Move sheet title for a selection. */
  moveManyTitle: (count: number) => string;
  /** Column and lane sheet actions, and their screen-reader actions. */
  moveColumnLeft: string;
  moveColumnRight: string;
  moveColumnFirst: string;
  moveColumnLast: string;
  moveLaneUp: string;
  moveLaneDown: string;
  moveLaneFirst: string;
  moveLaneLast: string;
  /** Announced after a column or lane moves. */
  columnMoved: (context: { readonly column: string; readonly position: number; readonly count: number }) => string;
  laneMoved: (context: { readonly lane: string; readonly position: number; readonly count: number }) => string;
  /** Title of the column sheet. */
  columnSheetTitle: (column: string) => string;
  laneSheetTitle: (lane: string) => string;
  /** Announced when data moves a card while the board is on screen (`highlightExternalMoves`). */
  externallyMoved: (context: { readonly item: string; readonly column: string }) => string;
  /** Screen-reader action and hint on a card that a keyboard or pointer can open the sheet with. */
  openMenu: string;
  /** Title of the board's own confirmation for `confirmInto`. */
  confirmMoveTitle: (context: { readonly item: string; readonly count: number; readonly column: string }) => string;
  /** Its button. */
  confirmMove: string;
  /** Announced when a held move is cancelled. */
  moveCancelled: string;
  /** Move sheet row and screen-reader action that drops the card onto another card (`onCardDrop`). */
  dropOnto: string;
  /** Title of the card picker it opens. */
  dropOntoTitle: (item: string) => string;
  /** Placeholder of the picker's search. */
  searchCards: string;
  noCardsMatch: string;
  /** Announced after a card is dropped onto another. */
  droppedOnto: (context: { readonly item: string; readonly target: string }) => string;
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
  /**
   * Moves several cards to one cell together, keeping their board order:
   * one `onMove` per card, each with the same `op.batch.id`. Returns how many
   * moved. Cards the target refuses stay where they are.
   */
  moveItems(itemIds: readonly string[], to: MoveDestination): number;
  /**
   * Reverts the newest move whose cards are still where they landed, through
   * `onMove` with `source: 'undo'`; a batch comes back as one batch. Moves made
   * by undo are not undone again. Returns false when there is nothing to undo
   * or the target refuses the cards (a full column in `block` mode).
   */
  undo(): boolean;
  canUndo(): boolean;
  /** Replaces the selection. An empty list ends it. Ignored with `selectable={false}`. */
  setSelection(itemIds: readonly string[]): void;
  getSelection(): readonly string[];
  /**
   * Experimental. Opens or closes the whole-board overview. Closing with a
   * `columnId` scrolls to that column. Needs `overview`.
   */
  setOverview(open: boolean, columnId?: string): void;
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
   * Called once per card moved, in order per item; a multi-card move calls it
   * once per card with a shared `op.batch`. Resolve when the move is
   * accepted; reject to roll the card back. The overlay stays until `items`
   * shows the move (or `settleTimeoutMs` passes), so `setState` timing never
   * matters. Pass `context.signal` to your request: it aborts when the move
   * times out (`inflightTimeoutMs`) or the board unmounts. A move held by
   * `gateMove` arrives once the user submits, with the answer in `context.answer`.
   */
  onMove: (op: MoveOperation, context: BoardMoveContext) => Promise<void> | void;
  /** A move was rejected (or timed out) and rolled back. The board already announces it to screen readers. */
  onMoveError?: (op: MoveOperation, error: unknown) => void;
  onDragStart?: (event: DragStartEvent) => void;
  onDragOver?: (event: DragOverEvent) => void;
  onDragEnd?: (event: DragEndEvent) => void;
  canDrag?: (item: T) => boolean;
  canDrop?: (item: T, target: MoveTarget) => boolean;
  /** Actions offered in the drop dock, the Move sheet and screen-reader actions. */
  cardActions?: readonly CardAction[];
  /** Hide an action for one card. Default: every action for every card. */
  canPerformAction?: (item: T, action: string) => boolean;
  /** A card action was chosen. The board does not change the item. */
  onCardAction?: (event: CardActionEvent<T>) => void;
  /**
   * Holds a move to ask the user first, such as a field the new column
   * needs. Return anything but null or undefined to hold it: the cards wait,
   * dimmed, in their new place while `renderMoveGate` shows in the board's
   * sheet, and `onMove` is called only once the user submits. Called once
   * per move, with every card of a batch. Undo is never held.
   */
  gateMove?: (moves: readonly GatedMove<T>[]) => unknown;
  /** The form for a held move, drawn in the board's sheet. Without it, the board asks to confirm. */
  renderMoveGate?: (info: MoveGateInfo<T>) => ReactNode;
  /** Column ids whose moves ask to confirm first, such as Done or Lost. `gateMove` is asked first. */
  confirmInto?: readonly string[];
  /**
   * A lifted card rested on another card and was dropped there. Nothing
   * moves: the app decides what it means, such as a merge, a link or a
   * subtask. Turns on dropping onto cards, and "Drop onto…" in the Move sheet.
   */
  onCardDrop?: (event: CardDropEvent<T>) => void;
  /** Whether a card may be dropped onto another. Default: every card but itself. */
  canDropOnCard?: (item: T, target: T) => boolean;
  /** How long a lifted card rests on another before that card becomes the target, in ms. Default 450. */
  cardDropDelayMs?: number;
  /**
   * A tray that slides up once a lifted card moves: column chips that move the
   * card without scrolling, and your `cardActions`. The lists end above it.
   * On by default; false turns it off.
   */
  dock?: boolean | DropDockOptions;
  /**
   * A light haptic when a card lifts. `true` uses your app's expo-haptics or
   * react-native-haptic-feedback when one is installed, and does nothing
   * otherwise. Pass a function to use your own. Default true.
   */
  haptics?: boolean | HapticHandler;
  /**
   * A banner after each move with an Undo button. `board.undo()` works
   * without it. Off by default.
   */
  undo?: boolean | UndoOptions;

  renderCard: (info: CardRenderInfo<T>) => ReactNode;
  /**
   * The marks the board draws over your card: the selection check and
   * outline, the highlight ring, the pointer outline, the spotlight fade and
   * the stacked edge and count on a dragged selection. 'manual' draws none of
   * them, and your card draws what it wants from `selected`, `highlighted`,
   * `hovered`, `dimmed` and `dragCount`. Default 'auto'.
   */
  cardMarks?: 'auto' | 'manual';
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
  /** Column to show first, in the layouts that scroll sideways. Ignored once `columnId` is set. */
  initialColumnId?: string;
  /**
   * Column to keep on screen. Changing it scrolls there. Update it from
   * `onColumnChange` so a swipe stays where the finger left it.
   */
  columnId?: string;
  /**
   * The column now on screen: the page in `paged`, the first fully visible
   * column in `multi`, `fit` and the planner.
   */
  onColumnChange?: (columnId: string) => void;
  /**
   * The user reached the end of a column. The board does not fetch: append
   * items and pass them back in. It fires again only after that append moves
   * the end off screen and the user scrolls to it. Paged, multi and fit fire
   * this for the column that was scrolled. Swimlanes share one vertical list,
   * so the bottom of that list fires it once per column. Stacked fires it for
   * the last column.
   */
  onColumnEndReached?: (columnId: string) => void;
  /**
   * Columns that are fetching more cards, for example after `onColumnEndReached`.
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
  /**
   * Work-in-progress limits by column id. Headers show the count against the
   * limit with a meter, in the warning color when full and the reject color
   * when over.
   */
  columnLimits?: Readonly<Record<string, number>>;
  /** `block` refuses drops into a full column, everywhere: drag, dock, sheet and screen reader. Default `warn`. */
  limitBehavior?: LimitBehavior;
  /** A number per card, such as a deal amount. Headers show each column's sum. */
  getItemValue?: (item: T) => number | null | undefined;
  /** How header sums read. Default: compact, such as "12.4k". */
  formatValue?: (value: number) => string;
  /**
   * Cards for which this returns false fade back, and keep their place, so a
   * search or filter shows its matches in context. Moving still works.
   */
  spotlight?: (item: T) => boolean;
  /** How old a card is, in days. Passed to `renderCard`, and `CardView` shows it. */
  getItemAge?: (item: T) => number | null | undefined;
  /** Cards at least this many days old are `stale`. Default 14. */
  staleAfterDays?: number;
  /**
   * The board reached its first or last column, sideways: in the planner, add
   * days to `groupBy.columns`. Fires in the planner, `multi` and `fit`, and
   * once per width on a board that fits the screen, so short boards grow too.
   */
  onEdgeReached?: (edge: 'start' | 'end') => void;
  /** Lane headers in swimlanes and section headers in stacked stay pinned while their cards scroll. Default true. */
  stickyHeaders?: boolean;
  /** Feel of lift, landing, the dock and the banner. `theme` lift tokens still win. Default `standard`. */
  motion?: MotionPreset;
  /** A built-in palette for light and dark. `theme` overrides still win. Default `standard`. */
  themePreset?: ThemePresetName;
  /** Hide columns with no cards in any lane, e.g. for a filtered "my cards" view. The dock and the Move sheet still list them. */
  hideEmptyColumns?: boolean;
  /** Swimlanes: hide lanes with no cards. The Move sheet still lists them. */
  hideEmptyLanes?: boolean;
  /**
   * Experimental. Pinch in on the board to see every column at once, with
   * small cards you can still drag. Pinch out, or tap a column's header, to
   * go back. Boards without lanes, in the paged, multi and fit layouts.
   */
  overview?: boolean;
  /** Controlled overview state. Omit to let pinches open and close it. Needs `overview`. */
  overviewOpen?: boolean;
  onOverviewChange?: (open: boolean) => void;
  /** Collapse toggles on column headers. Default: on in `stacked`, off elsewhere. Never in `paged` or `matrix`. */
  collapsibleColumns?: boolean;
  /** Controlled. Omit both to let the board keep this state itself. */
  collapsedColumns?: readonly string[];
  onCollapsedColumnsChange?: (columnIds: string[]) => void;
  /** Collapse toggles on lane headers in swimlanes. Default true. */
  collapsibleLanes?: boolean;
  /** Controlled. Omit both to let the board keep this state itself. */
  collapsedLanes?: readonly string[];
  onCollapsedLanesChange?: (laneIds: string[]) => void;
  /**
   * Lets people reorder columns: long-press a column header to drag it, or use
   * the header's sheet and screen-reader actions. The board does not change
   * `groupBy`: save the order and pass the columns back in it.
   */
  onColumnOrderChange?: (columnIds: string[]) => void;
  /** The same for swimlanes: long-press a lane header, or use its sheet. */
  onLaneOrderChange?: (laneIds: string[]) => void;
  /**
   * Multi-select. Start a selection from a card's Move sheet or screen-reader
   * actions, or with `setSelection`; then taps select cards, a bar shows the
   * count, and dragging a selected card moves them all. Default true.
   */
  selectable?: boolean;
  /** Controlled selection. Omit both to let the board keep it. */
  selection?: readonly string[];
  onSelectionChange?: (itemIds: string[]) => void;
  /**
   * When `items` moves a card to another cell by itself (another user, a sync),
   * the card flashes once and screen readers hear where it went. Default true.
   */
  highlightExternalMoves?: boolean;
  moveModes?: MoveModes;
  /**
   * Display only. Scrolling, paging, collapse and Show more stay on.
   * Drag, swipe, the Move sheet and screen-reader move actions stay off.
   */
  readOnly?: boolean;
  /** Scroll the board while a card is held near an edge. Default true. */
  autoScroll?: boolean;
  /** Long-press time before a drag starts, in ms. 150–250 suits most apps. Default 200. */
  longPressDelay?: number;

  appearance?: 'auto' | 'light' | 'dark';
  density?: 'comfortable' | 'compact';
  theme?: Partial<BoardTheme>;
  labels?: Partial<BoardLabels>;

  /** Cards shown per swimlane cell before "Show more". Default 50. */
  laneCellLimit?: number;
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
