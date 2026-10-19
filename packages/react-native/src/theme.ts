import type { BoardLabels, BoardTheme, MotionPreset, ThemePresetName } from './types';

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

/** How the lifted card looks and how long a drop takes. Density does not change these. */
const lift: Pick<BoardTheme, 'liftScale' | 'liftTilt' | 'liftShadowOpacity' | 'dropDuration'> = {
  liftScale: 1.03,
  liftTilt: 0,
  liftShadowOpacity: 0.25,
  dropDuration: 200,
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
  warning: '#B45309',
  ...comfortable,
  ...lift,
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
  warning: '#F2B544',
  ...comfortable,
  ...lift,
  // A dark board needs a stronger shadow for the lifted card to read as raised.
  liftShadowOpacity: 0.55,
};

type Palette = Omit<
  BoardTheme,
  keyof Metrics | 'liftScale' | 'liftTilt' | 'liftShadowOpacity' | 'dropDuration' | 'fontFamily'
>;

/**
 * Built-in palettes. Each passes WCAG AA for text and muted text on cards and
 * columns, in light and dark (checked in `theme.test.ts`).
 */
export const themePresets: Record<Exclude<ThemePresetName, 'standard'>, { light: Palette; dark: Palette }> = {
  paper: {
    light: {
      background: '#F6F1E9',
      columnBackground: '#EDE6DA',
      columnBorder: 'transparent',
      laneHeaderBackground: '#E4DCCD',
      cardBackground: '#FFFDF8',
      cardBorder: 'rgba(60, 40, 10, 0.10)',
      text: '#2B2418',
      mutedText: '#655742',
      accent: '#A8481F',
      reject: '#B42318',
      emptyCellBorder: '#CFC4B1',
      sheetBackground: '#FFFDF8',
      sheetBackdrop: 'rgba(30, 20, 5, 0.45)',
      sheetDivider: '#E8E0D2',
      warning: '#9A5A06',
    },
    dark: {
      background: '#1C1915',
      columnBackground: '#24201B',
      columnBorder: 'transparent',
      laneHeaderBackground: '#2C2721',
      cardBackground: '#302A23',
      cardBorder: 'rgba(255, 240, 220, 0.07)',
      text: '#F1E9DC',
      mutedText: '#BDB19E',
      accent: '#EE9468',
      reject: '#F4877B',
      emptyCellBorder: '#4A4238',
      sheetBackground: '#27221C',
      sheetBackdrop: 'rgba(0, 0, 0, 0.6)',
      sheetDivider: '#3A332B',
      warning: '#E7AB45',
    },
  },
  slate: {
    light: {
      background: '#EEF1F5',
      columnBackground: '#E2E7EE',
      columnBorder: 'transparent',
      laneHeaderBackground: '#D7DEE8',
      cardBackground: '#FFFFFF',
      cardBorder: 'rgba(15, 23, 42, 0.10)',
      text: '#0F172A',
      mutedText: '#475569',
      accent: '#0F766E',
      reject: '#B91C1C',
      emptyCellBorder: '#B6C0CE',
      sheetBackground: '#FFFFFF',
      sheetBackdrop: 'rgba(15, 23, 42, 0.5)',
      sheetDivider: '#DCE2EA',
      warning: '#A44D07',
    },
    dark: {
      background: '#0B1220',
      columnBackground: '#111A2B',
      columnBorder: 'transparent',
      laneHeaderBackground: '#172238',
      cardBackground: '#1A2539',
      cardBorder: 'rgba(255, 255, 255, 0.07)',
      text: '#E2E8F0',
      mutedText: '#9AA9BD',
      accent: '#2DD4BF',
      reject: '#F87171',
      emptyCellBorder: '#2B3A52',
      sheetBackground: '#141E30',
      sheetBackdrop: 'rgba(0, 0, 0, 0.65)',
      sheetDivider: '#25324A',
      warning: '#FBBF24',
    },
  },
  aurora: {
    light: {
      background: '#F4F2FB',
      columnBackground: '#EAE6F7',
      columnBorder: 'transparent',
      laneHeaderBackground: '#DFD9F2',
      cardBackground: '#FFFFFF',
      cardBorder: 'rgba(60, 30, 120, 0.10)',
      text: '#1E1538',
      mutedText: '#564D72',
      accent: '#6D28D9',
      reject: '#C81E1E',
      emptyCellBorder: '#C7BEE3',
      sheetBackground: '#FFFFFF',
      sheetBackdrop: 'rgba(30, 15, 60, 0.45)',
      sheetDivider: '#E4DEF4',
      warning: '#A44D07',
    },
    dark: {
      background: '#0E0B1A',
      columnBackground: '#161127',
      columnBorder: 'transparent',
      laneHeaderBackground: '#1E1835',
      cardBackground: '#221B3B',
      cardBorder: 'rgba(255, 255, 255, 0.07)',
      text: '#ECE8FB',
      mutedText: '#ADA5CC',
      accent: '#A78BFA',
      reject: '#FB7185',
      emptyCellBorder: '#3A3160',
      sheetBackground: '#1A1430',
      sheetBackdrop: 'rgba(0, 0, 0, 0.65)',
      sheetDivider: '#2E2650',
      warning: '#FBBF24',
    },
  },
};

/** Lift tokens per motion preset, and how much slower (above 1) or faster the dock, banner and sheet animate. */
export const motionPresets: Record<
  MotionPreset,
  { lift: Pick<BoardTheme, 'liftScale' | 'liftTilt' | 'dropDuration'>; durationScale: number; overshoot: boolean }
> = {
  standard: { lift: { liftScale: 1.03, liftTilt: 0, dropDuration: 200 }, durationScale: 1, overshoot: false },
  calm: { lift: { liftScale: 1.02, liftTilt: 0, dropDuration: 280 }, durationScale: 1.4, overshoot: false },
  snappy: { lift: { liftScale: 1.03, liftTilt: 0, dropDuration: 130 }, durationScale: 0.7, overshoot: false },
  playful: { lift: { liftScale: 1.06, liftTilt: 2.5, dropDuration: 320 }, durationScale: 1.15, overshoot: true },
};

const where = (column: string, lane: string | null) => (lane ? `${column}, lane ${lane}` : column);

/**
 * The theme `Board` actually uses. Compact spacing is applied after the
 * palette, and a partial `theme` override wins last, so density never
 * resets lift tokens and callers can still replace them.
 */
export function resolveTheme(
  dark: boolean,
  density: 'comfortable' | 'compact' | undefined,
  override?: Partial<BoardTheme>,
  preset: ThemePresetName = 'standard',
  motion: MotionPreset = 'standard',
): BoardTheme {
  const palette = preset === 'standard' ? null : themePresets[preset][dark ? 'dark' : 'light'];
  return {
    ...(dark ? darkTheme : lightTheme),
    ...palette,
    ...(density === 'compact' ? compactMetrics : null),
    ...motionPresets[motion].lift,
    ...override,
  };
}

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
  card: ({ item, column, lane, position, count, pending, dimmed, staleDays }) =>
    `${item}, ${where(column, lane)}, ${position} of ${count}${pending ? ', saving' : ''}${staleDays != null ? `, ${staleDays} days old` : ''}${dimmed ? ', outside the filter' : ''}`,
  moveToColumnAction: (column) => `Move to ${column}`,
  moveToLaneAction: (lane) => `Move to lane ${lane}`,
  moved: ({ item, column, lane, position, count }) =>
    `Moved ${item} to ${where(column, lane)}, ${position} of ${count}`,
  moveFailed: ({ item, column, lane }) => `Could not move ${item}. It is back in ${where(column, lane)}`,
  columnTab: (column, count) => `${column}, ${count} cards`,
  loadingMore: 'Loading more cards',
  actions: 'Actions',
  currentPlace: ({ column, lane, position, count }) => `In ${where(column, lane)} · ${position} of ${count}`,
  moveUp: 'Up',
  moveDown: 'Down',
  previousColumn: 'Previous column',
  nextColumn: 'Next column',
  searchColumns: 'Find a column',
  noColumnsMatch: 'No columns match',
  undo: 'Undo',
  dismiss: 'Dismiss',
  undoBanner: ({ item, column, lane }) => `Moved “${item}” to ${where(column, lane)}`,
  overview: 'Board overview',
  closeOverview: 'Back to the board',
  columnSummary: ({ column, total, limit, limitState, valueLabel, date, today }) =>
    [
      date ? `${date}${today ? ', today' : ''}` : column,
      limit != null
        ? `${total} of ${limit} cards${limitState === 'over' ? ', over the limit' : limitState === 'at' ? ', full' : ''}`
        : `${total} cards`,
      valueLabel ? `total ${valueLabel}` : null,
    ]
      .filter(Boolean)
      .join(', '),
  full: 'Full',
  today: 'Today',
};
