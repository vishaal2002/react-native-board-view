import { memo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';
import type { LimitState, PlannerDay } from '../insights';
import type { BoardLabels, BoardTheme, ColumnHeaderRenderInfo, LaneHeaderRenderInfo } from '../types';

type Direction = 'down' | 'right' | 'up' | 'left';
const ROTATION: Record<Direction, string> = { down: '45deg', right: '-45deg', up: '225deg', left: '135deg' };

export function Chevron({ direction, color, size = 8 }: { direction: Direction; color: string; size?: number }) {
  return (
    <View style={[styles.chevronBox, { width: size * 2, height: size * 2 }]}>
      <View
        style={{
          width: size,
          height: size,
          borderRightWidth: 2,
          borderBottomWidth: 2,
          borderColor: color,
          transform: [{ rotate: ROTATION[direction] }],
          marginTop: direction === 'down' ? -size / 3 : direction === 'up' ? size / 3 : 0,
        }}
      />
    </View>
  );
}

function font(theme: BoardTheme): StyleProp<TextStyle> {
  return theme.fontFamily ? { fontFamily: theme.fontFamily } : null;
}

export function CountPill({ count, theme }: { count: number; theme: BoardTheme }) {
  return (
    <View style={[styles.pill, { backgroundColor: theme.background }]}>
      <Text style={[styles.pillText, { color: theme.mutedText }, font(theme)]}>{count}</Text>
    </View>
  );
}

/** Color of a count and meter against a limit. */
function limitColor(state: LimitState, theme: BoardTheme): string {
  if (state === 'over') return theme.reject;
  if (state === 'at') return theme.warning;
  return theme.accent;
}

/** "5/6", tinted as the column fills. */
function LimitPill({
  total,
  limit,
  state,
  theme,
}: {
  total: number;
  limit: number;
  state: LimitState;
  theme: BoardTheme;
}) {
  const full = state === 'at' || state === 'over';
  const color = limitColor(state, theme);
  return (
    <View style={[styles.pill, { backgroundColor: full ? color : theme.background }]}>
      <Text style={[styles.pillText, { color: full ? theme.cardBackground : theme.mutedText }, font(theme)]}>
        {total}/{limit}
      </Text>
    </View>
  );
}

/** A thin bar under the header that fills toward the limit. */
function LimitMeter({
  total,
  limit,
  state,
  theme,
}: {
  total: number;
  limit: number;
  state: LimitState;
  theme: BoardTheme;
}) {
  const ratio = Math.min(1, total / limit);
  return (
    <View
      style={[styles.meter, { backgroundColor: theme.background }]}
      importantForAccessibility="no"
      accessibilityElementsHidden
    >
      <View style={[styles.meterFill, { width: `${ratio * 100}%`, backgroundColor: limitColor(state, theme) }]} />
    </View>
  );
}

const longDate = new Map<string, Intl.DateTimeFormat>();
function formatDay(date: Date, style: 'weekday' | 'month' | 'long'): string {
  const options: Intl.DateTimeFormatOptions =
    style === 'weekday'
      ? { weekday: 'short' }
      : style === 'month'
        ? { month: 'short' }
        : { weekday: 'long', day: 'numeric', month: 'long' };
  let format = longDate.get(style);
  if (!format) {
    format = new Intl.DateTimeFormat(undefined, options);
    longDate.set(style, format);
  }
  return format.format(date);
}

/** The planner's header: weekday and date, with today in an accent disc. */
function DayTitle({ day, theme }: { day: PlannerDay; theme: BoardTheme }) {
  return (
    <View style={styles.dayTitle}>
      <View style={[styles.dayNumber, day.today ? { backgroundColor: theme.accent } : null]}>
        <Text style={[styles.dayNumberText, { color: day.today ? theme.cardBackground : theme.text }, font(theme)]}>
          {day.date.getDate()}
        </Text>
      </View>
      <View>
        <Text style={[styles.weekday, { color: day.today ? theme.accent : theme.text }, font(theme)]}>
          {formatDay(day.date, 'weekday')}
        </Text>
        <Text style={[styles.month, { color: theme.mutedText }, font(theme)]}>{formatDay(day.date, 'month')}</Text>
      </View>
    </View>
  );
}

export const DefaultColumnHeader = memo(function DefaultColumnHeader({
  info,
  theme,
  labels,
}: {
  info: ColumnHeaderRenderInfo;
  theme: BoardTheme;
  labels: BoardLabels;
}) {
  const { column, total, collapsed, toggleCollapsed, compact, limit, limitState: state, valueLabel, day } = info;
  const { openColumnSheet } = info;
  const summary = labels.columnSummary({
    column: column.label,
    total,
    limit,
    limitState: state,
    valueLabel,
    date: day ? formatDay(day.date, 'long') : null,
    today: day?.today ?? false,
  });
  const title = day ? (
    <View accessible accessibilityRole="header" accessibilityLabel={summary} style={styles.dayTitleBox}>
      <DayTitle day={day} theme={theme} />
    </View>
  ) : (
    <Text
      numberOfLines={compact ? 2 : 1}
      style={[compact ? styles.columnTitleCompact : styles.columnTitle, { color: theme.text }, font(theme)]}
      accessibilityRole="header"
      accessibilityLabel={summary}
    >
      {column.label}
    </Text>
  );
  // The title's label already reads the count, limit and sum: the pills stay silent.
  const count = (
    <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      {limit != null && state !== 'none' ? (
        <LimitPill total={total} limit={limit} state={state} theme={theme} />
      ) : (
        <CountPill count={total} theme={theme} />
      )}
    </View>
  );
  const value = valueLabel ? (
    <Text
      numberOfLines={1}
      style={[styles.value, { color: theme.mutedText }, font(theme)]}
      importantForAccessibility="no"
      accessibilityElementsHidden
    >
      {valueLabel}
    </Text>
  ) : null;
  const meter =
    limit != null && state !== 'none' ? (
      <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <LimitMeter total={total} limit={limit} state={state} theme={theme} />
      </View>
    ) : null;
  const menu = openColumnSheet ? (
    <HeaderMenuButton color={theme.mutedText} onPress={openColumnSheet} label={`${labels.openMenu}, ${column.label}`} />
  ) : null;
  const toggle = toggleCollapsed ? (
    <Pressable
      onPress={toggleCollapsed}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={collapsed ? labels.expandColumn(column.label) : labels.collapseColumn(column.label)}
      style={styles.iconButton}
    >
      <Chevron direction={collapsed ? 'right' : 'down'} color={theme.mutedText} size={7} />
    </Pressable>
  ) : null;
  const dot = column.color ? <View style={[styles.dot, { backgroundColor: column.color }]} /> : null;

  if (compact) {
    // Narrow columns: the name gets its own line instead of being truncated.
    return (
      <View>
        <View style={styles.columnHeaderCompact}>
          {title}
          <View style={styles.compactRow}>
            {day ? null : dot}
            {count}
            {value}
            <View style={styles.spacer} />
            {menu}
            {toggle}
          </View>
        </View>
        {meter}
      </View>
    );
  }
  return (
    <View>
      <View style={styles.columnHeader}>
        {day ? null : dot}
        {title}
        {count}
        <View style={styles.spacer} />
        {value}
        {menu}
        {toggle}
      </View>
      {meter}
    </View>
  );
});

/** A lane's cards per column, as one thin bar in the columns' colors. */
function DistributionBar({ shares, theme }: { shares: LaneHeaderRenderInfo['distribution']; theme: BoardTheme }) {
  const total = shares.reduce((sum, share) => sum + share.count, 0);
  if (total === 0) return null;
  return (
    <View
      style={[styles.distribution, { backgroundColor: theme.background }]}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      {shares.map((share) =>
        share.count > 0 ? (
          <View
            key={share.column.id}
            style={{ flex: share.count, backgroundColor: share.column.color ?? theme.mutedText }}
          />
        ) : null,
      )}
    </View>
  );
}

export const DefaultLaneHeader = memo(function DefaultLaneHeader({
  info,
  theme,
  labels,
}: {
  info: LaneHeaderRenderInfo;
  theme: BoardTheme;
  labels: BoardLabels;
}) {
  const { lane, count, collapsed, toggleCollapsed, openLaneSheet } = info;
  const surface = [styles.laneHeader, { backgroundColor: theme.laneHeaderBackground, borderRadius: theme.radius - 4 }];
  const body = (
    <>
      {toggleCollapsed ? <Chevron direction={collapsed ? 'right' : 'down'} color={theme.mutedText} size={7} /> : null}
      {lane.color ? <View style={[styles.dot, { backgroundColor: lane.color }]} /> : null}
      <Text numberOfLines={1} style={[styles.laneTitle, { color: theme.text }, font(theme)]}>
        {lane.label}
      </Text>
      <CountPill count={count} theme={theme} />
      <View style={styles.spacer} />
      <DistributionBar shares={info.distribution} theme={theme} />
    </>
  );
  const menu = openLaneSheet ? (
    <HeaderMenuButton color={theme.mutedText} onPress={openLaneSheet} label={`${labels.openMenu}, ${lane.label}`} />
  ) : null;
  if (!toggleCollapsed) {
    return (
      <View style={surface}>
        <View
          accessible
          accessibilityRole="header"
          accessibilityLabel={`${lane.label}, ${count}`}
          style={styles.laneBody}
        >
          {body}
        </View>
        {menu}
      </View>
    );
  }
  return (
    <View style={surface}>
      <Pressable
        onPress={toggleCollapsed}
        accessibilityRole="button"
        accessibilityState={{ expanded: !collapsed }}
        accessibilityLabel={`${collapsed ? labels.expandLane(lane.label) : labels.collapseLane(lane.label)}, ${count}`}
        style={({ pressed }) => [styles.laneBody, { opacity: pressed ? 0.7 : 1 }]}
      >
        {body}
      </Pressable>
      {menu}
    </View>
  );
});

/** The "…" on a column or lane header that opens its sheet, when they can be reordered. 44pt with its slop. */
function HeaderMenuButton({ color, onPress, label }: { color: string; onPress: () => void; label: string }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.headerMenu, pressed ? styles.menuPressed : null]}
    >
      <View style={[styles.menuDot, { backgroundColor: color }]} />
      <View style={[styles.menuDot, { backgroundColor: color }]} />
      <View style={[styles.menuDot, { backgroundColor: color }]} />
    </Pressable>
  );
}

export function DefaultEmptyCell({ theme, labels }: { theme: BoardTheme; labels: BoardLabels }) {
  return (
    <View
      style={[
        styles.empty,
        { minHeight: theme.cellMinHeight, borderColor: theme.emptyCellBorder, borderRadius: theme.cardRadius },
      ]}
    >
      <Text style={[styles.emptyText, { color: theme.mutedText }, font(theme)]}>{labels.emptyCell}</Text>
    </View>
  );
}

export function MenuButton({ color, onPress }: { color: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      // 36×32 plus the slop is a 48×44 touch target.
      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      // The card itself carries the "Move to…" accessibility action.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={({ pressed }) => [styles.menu, pressed ? styles.menuPressed : null]}
    >
      <View style={[styles.menuDot, { backgroundColor: color }]} />
      <View style={[styles.menuDot, { backgroundColor: color }]} />
      <View style={[styles.menuDot, { backgroundColor: color }]} />
    </Pressable>
  );
}

/** The spinner at the end of a column (or the board) while the app loads more cards. */
export function LoadingFooter({ theme, label }: { theme: BoardTheme; label: string }) {
  return (
    <View style={styles.loading} accessible accessibilityRole="progressbar" accessibilityLabel={label}>
      <ActivityIndicator color={theme.mutedText} />
    </View>
  );
}

export function ShowMoreButton({ label, theme, onPress }: { label: string; theme: BoardTheme; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.showMore, { borderRadius: theme.cardRadius, opacity: pressed ? 0.7 : 1 }]}
    >
      <Text style={[styles.showMoreText, { color: theme.accent }, font(theme)]}>{label}</Text>
    </Pressable>
  );
}

export function CollapsedColumnStrip({
  label,
  count,
  color,
  theme,
  expandLabel,
  onExpand,
  height,
}: {
  label: string;
  count: number;
  color?: string;
  theme: BoardTheme;
  expandLabel: string;
  onExpand: () => void;
  height: number;
}) {
  const textLength = Math.max(80, height - 120);
  return (
    <Pressable onPress={onExpand} accessibilityRole="button" accessibilityLabel={expandLabel} style={styles.strip}>
      <Chevron direction="right" color={theme.mutedText} size={7} />
      {color ? <View style={[styles.dot, styles.stripDot, { backgroundColor: color }]} /> : null}
      <CountPill count={count} theme={theme} />
      <View style={[styles.stripLabelBox, { height: textLength }]}>
        <Text numberOfLines={1} style={[styles.stripLabel, { width: textLength, color: theme.text }, font(theme)]}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chevronBox: { alignItems: 'center', justifyContent: 'center' },
  spacer: { flex: 1 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  pill: {
    minWidth: 22,
    minHeight: 20,
    paddingHorizontal: 6,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillText: { fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] },
  columnHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, minHeight: 46 },
  columnTitle: { fontSize: 15, fontWeight: '700', flexShrink: 1, letterSpacing: -0.1 },
  columnHeaderCompact: { paddingHorizontal: 10, paddingTop: 10, paddingBottom: 2, gap: 4 },
  columnTitleCompact: { fontSize: 14, fontWeight: '700', lineHeight: 18 },
  compactRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 28 },
  iconButton: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  laneHeader: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  laneBody: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    minHeight: 44,
  },
  headerMenu: {
    width: 36,
    height: 32,
    borderRadius: 16,
    flexDirection: 'row',
    gap: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  laneTitle: { fontSize: 14, fontWeight: '700', flexShrink: 1 },
  value: { fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'], flexShrink: 0 },
  meter: { height: 3, marginHorizontal: 12, marginBottom: 6, borderRadius: 2, overflow: 'hidden' },
  meterFill: { height: 3, borderRadius: 2 },
  distribution: { flexDirection: 'row', width: 72, height: 6, borderRadius: 3, overflow: 'hidden', gap: 1 },
  dayTitleBox: { flexShrink: 1 },
  dayTitle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dayNumber: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  dayNumberText: { fontSize: 16, fontWeight: '800', fontVariant: ['tabular-nums'] },
  weekday: { fontSize: 14, fontWeight: '800' },
  month: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
  empty: { borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 13, fontWeight: '500' },
  menu: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 36,
    height: 32,
    borderRadius: 16,
    flexDirection: 'row',
    gap: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuPressed: { backgroundColor: 'rgba(127, 127, 127, 0.18)' },
  menuDot: { width: 4, height: 4, borderRadius: 2 },
  showMore: { minHeight: 44, paddingVertical: 10, alignItems: 'center', justifyContent: 'center' },
  loading: { paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  showMoreText: { fontSize: 13, fontWeight: '600' },
  strip: { flex: 1, alignItems: 'center', paddingTop: 12, gap: 10 },
  stripDot: { marginTop: 2 },
  stripLabelBox: { width: '100%', alignItems: 'center', justifyContent: 'center' },
  stripLabel: { fontSize: 14, fontWeight: '700', transform: [{ rotate: '90deg' }], textAlign: 'left' },
});
