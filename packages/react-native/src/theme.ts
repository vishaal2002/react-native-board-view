import type { BoardLabels, BoardTheme } from './types';

type Metrics = Pick<
  BoardTheme,
  | 'radius'
  | 'cardRadius'
  | 'columnWidth'
  | 'collapsedColumnWidth'
  | 'minColumnWidth'
  | 'columnGap'
  | 'cellPadding'
  | 'cardGap'
  | 'cellMinHeight'
>;

const comfortable: Metrics = {
  radius: 14,
  cardRadius: 10,
  columnWidth: 300,
  collapsedColumnWidth: 48,
  minColumnWidth: 136,
  columnGap: 12,
  cellPadding: 8,
  cardGap: 8,
  cellMinHeight: 88,
};

/** Tighter spacing for dense boards. Pass `density="compact"`. */
export const compactMetrics: Metrics = {
  radius: 10,
  cardRadius: 8,
  columnWidth: 256,
  collapsedColumnWidth: 40,
  minColumnWidth: 112,
  columnGap: 8,
  cellPadding: 6,
  cardGap: 6,
  cellMinHeight: 64,
};

export const lightTheme: BoardTheme = {
  background: '#F3F4F7',
  columnBackground: '#E9EBF0',
  columnBorder: 'transparent',
  laneHeaderBackground: '#DFE2E9',
  cardBackground: '#FFFFFF',
  cardBorder: 'rgba(15, 23, 42, 0.08)',
  text: '#162033',
  mutedText: '#5B677A',
  accent: '#2F6FEB',
  reject: '#D93F3F',
  emptyCellBorder: '#C3C9D4',
  sheetBackground: '#FFFFFF',
  sheetBackdrop: 'rgba(9, 18, 36, 0.45)',
  sheetDivider: '#E3E6EC',
  ...comfortable,
};

export const darkTheme: BoardTheme = {
  background: '#0E1116',
  columnBackground: '#171B22',
  columnBorder: 'transparent',
  laneHeaderBackground: '#1F242D',
  cardBackground: '#222833',
  cardBorder: 'rgba(255, 255, 255, 0.06)',
  text: '#E8ECF2',
  mutedText: '#98A2B3',
  accent: '#6EA0FF',
  reject: '#FF7A7A',
  emptyCellBorder: '#363E4C',
  sheetBackground: '#1A1F27',
  sheetBackdrop: 'rgba(0, 0, 0, 0.62)',
  sheetDivider: '#2A313C',
  ...comfortable,
};

const where = (column: string, lane: string | null) => (lane ? `${column}, lane ${lane}` : column);

export const defaultLabels: BoardLabels = {
  noValue: 'No value',
  moveTo: 'Move to…',
  moveSheetTitle: (item) => `Move “${item}”`,
  column: 'Column',
  lane: 'Lane',
  position: 'Position',
  top: 'Top',
  bottom: 'Bottom',
  cancel: 'Cancel',
  current: 'Current',
  showMore: (hidden) => `Show ${hidden} more`,
  expandLane: (lane) => `Expand lane ${lane}`,
  collapseLane: (lane) => `Collapse lane ${lane}`,
  expandColumn: (column) => `Expand ${column}`,
  collapseColumn: (column) => `Collapse ${column}`,
  emptyCell: 'No cards',
  card: ({ item, column, lane, position, count, pending }) =>
    `${item}, ${where(column, lane)}, ${position} of ${count}${pending ? ', saving' : ''}`,
  moveToColumnAction: (column) => `Move to ${column}`,
  moveToLaneAction: (lane) => `Move to lane ${lane}`,
  moved: ({ item, column, lane, position, count }) =>
    `Moved ${item} to ${where(column, lane)}, ${position} of ${count}`,
  moveFailed: ({ item, column, lane }) => `Could not move ${item}. It is back in ${where(column, lane)}`,
  columnTab: (column, count) => `${column}, ${count} cards`,
};
