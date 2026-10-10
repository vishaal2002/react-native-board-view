import { memo } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';
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

export const DefaultColumnHeader = memo(function DefaultColumnHeader({
  info,
  theme,
  labels,
}: {
  info: ColumnHeaderRenderInfo;
  theme: BoardTheme;
  labels: BoardLabels;
}) {
  const { column, count, collapsed, toggleCollapsed, compact } = info;
  const title = (
    <Text
      numberOfLines={compact ? 2 : 1}
      style={[compact ? styles.columnTitleCompact : styles.columnTitle, { color: theme.text }, font(theme)]}
      accessibilityRole="header"
    >
      {column.label}
    </Text>
  );
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
      <View style={styles.columnHeaderCompact}>
        {title}
        <View style={styles.compactRow}>
          {dot}
          <CountPill count={count} theme={theme} />
          <View style={styles.spacer} />
          {toggle}
        </View>
      </View>
    );
  }
  return (
    <View style={styles.columnHeader}>
      {dot}
      {title}
      <CountPill count={count} theme={theme} />
      <View style={styles.spacer} />
      {toggle}
    </View>
  );
});

export const DefaultLaneHeader = memo(function DefaultLaneHeader({
  info,
  theme,
  labels,
}: {
  info: LaneHeaderRenderInfo;
  theme: BoardTheme;
  labels: BoardLabels;
}) {
  const { lane, count, collapsed, toggleCollapsed } = info;
  return (
    <Pressable
      onPress={toggleCollapsed}
      accessibilityRole="button"
      accessibilityState={{ expanded: !collapsed }}
      accessibilityLabel={collapsed ? labels.expandLane(lane.label) : labels.collapseLane(lane.label)}
      style={({ pressed }) => [
        styles.laneHeader,
        { backgroundColor: theme.laneHeaderBackground, borderRadius: theme.radius - 4, opacity: pressed ? 0.8 : 1 },
      ]}
    >
      <Chevron direction={collapsed ? 'right' : 'down'} color={theme.mutedText} size={7} />
      {lane.color ? <View style={[styles.dot, { backgroundColor: lane.color }]} /> : null}
      <Text numberOfLines={1} style={[styles.laneTitle, { color: theme.text }, font(theme)]}>
        {lane.label}
      </Text>
      <CountPill count={count} theme={theme} />
    </Pressable>
  );
});

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
  laneHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, minHeight: 40 },
  laneTitle: { fontSize: 14, fontWeight: '700', flexShrink: 1 },
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
  showMore: { paddingVertical: 10, alignItems: 'center' },
  showMoreText: { fontSize: 13, fontWeight: '600' },
  strip: { flex: 1, alignItems: 'center', paddingTop: 12, gap: 10 },
  stripDot: { marginTop: 2 },
  stripLabelBox: { width: '100%', alignItems: 'center', justifyContent: 'center' },
  stripLabel: { fontSize: 14, fontWeight: '700', transform: [{ rotate: '90deg' }], textAlign: 'left' },
});
