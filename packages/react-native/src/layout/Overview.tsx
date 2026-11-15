import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import type { GroupValue } from 'board-view-core';
import { useBoard } from '../context';
import type { BoardTheme, ZoomLevel } from '../types';

/** The overview is the `fit` layout with tight spacing and columns this narrow. */
const OVERVIEW_COLUMN = 64;

export function overviewTheme(theme: BoardTheme): BoardTheme {
  return {
    ...theme,
    minColumnWidth: OVERVIEW_COLUMN,
    collapsedColumnWidth: Math.min(theme.collapsedColumnWidth, 36),
    columnGap: 6,
    cellPadding: 4,
    cardGap: 4,
    radius: 10,
    cardRadius: 6,
  };
}

/** Every zoom level, from your cards out. */
export const ZOOM_LEVELS: readonly ZoomLevel[] = ['card', 'compact', 'title', 'dot'];

/** The levels a board steps through: `zoom` wins, then the older `overview` (cards and titles). */
export function zoomLevelsOf(
  zoom: boolean | { levels?: readonly ZoomLevel[] } | undefined,
  overview: boolean | undefined,
) {
  if (zoom === true) return ZOOM_LEVELS;
  if (zoom) return ZOOM_LEVELS.filter((level) => level === 'card' || (zoom.levels ?? ZOOM_LEVELS).includes(level));
  return overview ? (['card', 'title'] as const) : (['card'] as const);
}

/** The theme a zoom level draws with: narrower columns and tighter spacing each step out. */
export function zoomTheme(theme: BoardTheme, level: ZoomLevel): BoardTheme {
  switch (level) {
    case 'card':
      return theme;
    case 'compact':
      return { ...theme, minColumnWidth: 150, columnGap: 8, cellPadding: 6, cardGap: 6 };
    case 'title':
      return overviewTheme(theme);
    case 'dot':
      return {
        ...theme,
        minColumnWidth: DOT_COLUMN,
        collapsedColumnWidth: Math.min(theme.collapsedColumnWidth, 24),
        columnGap: 4,
        cellPadding: 3,
        cardGap: 2,
        radius: 8,
        cardRadius: 3,
      };
  }
}

/** Columns at the dot level: a header's dot and count, and a stack of bars. */
const DOT_COLUMN = 40;

/** A card at the dot level: a short bar in its color. */
export function DotCard({ color, theme }: { color?: string; theme: BoardTheme }) {
  return <View style={[styles.dot, { backgroundColor: color ?? theme.accent, borderRadius: theme.cardRadius }]} />;
}

function font(theme: BoardTheme) {
  return theme.fontFamily ? { fontFamily: theme.fontFamily } : null;
}

/** Above the overview: its name and a way back that does not need a pinch. */
export function OverviewBar() {
  const { theme, labels, setOverview, reducedMotion } = useBoard();
  return (
    <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(160)} style={styles.bar}>
      <Text style={[styles.barTitle, { color: theme.text }, font(theme)]} accessibilityRole="header">
        {labels.overview}
      </Text>
      <Pressable
        onPress={() => setOverview(false)}
        accessibilityRole="button"
        hitSlop={8}
        style={({ pressed }) => [
          styles.back,
          { backgroundColor: theme.columnBackground, borderColor: theme.accent, opacity: pressed ? 0.7 : 1 },
        ]}
      >
        <Text style={[styles.backText, { color: theme.text }, font(theme)]}>{labels.closeOverview}</Text>
      </Pressable>
    </Animated.View>
  );
}

/** A column header in the overview. Tapping it opens the board at that column. */
export const OverviewHeader = memo(function OverviewHeader({ column, count }: { column: GroupValue; count: number }) {
  const { theme, setOverview } = useBoard();
  return (
    <Pressable
      onPress={() => setOverview(false, column.id)}
      accessibilityRole="button"
      accessibilityLabel={`${column.label}, ${count}`}
      style={({ pressed }) => [styles.header, { opacity: pressed ? 0.6 : 1 }]}
    >
      <View style={[styles.headerDot, { backgroundColor: column.color ?? theme.mutedText }]} />
      <Text style={[styles.headerText, { color: theme.text }, font(theme)]} numberOfLines={1}>
        {column.label}
      </Text>
      <Text style={[styles.headerCount, { color: theme.mutedText }, font(theme)]}>{count}</Text>
    </Pressable>
  );
});

/** A card in the overview: its label and its column's color, small enough for a whole column to fit. */
export function MiniCard({ label, color, theme }: { label: string; color?: string; theme: BoardTheme }) {
  return (
    <View
      style={[
        styles.mini,
        { backgroundColor: theme.cardBackground, borderColor: theme.cardBorder, borderRadius: theme.cardRadius },
      ]}
    >
      <View style={[styles.miniBar, { backgroundColor: color ?? theme.accent }]} />
      <Text style={[styles.miniText, { color: theme.text }, font(theme)]} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 4,
  },
  barTitle: { fontSize: 16, fontWeight: '800', flexShrink: 1 },
  back: { minHeight: 36, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1.5, justifyContent: 'center' },
  backText: { fontSize: 13, fontWeight: '700' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 44, paddingHorizontal: 8 },
  headerDot: { width: 7, height: 7, borderRadius: 4 },
  headerText: { flex: 1, fontSize: 12, fontWeight: '800' },
  headerCount: { fontSize: 11, fontWeight: '700', fontVariant: ['tabular-nums'] },
  mini: {
    flexDirection: 'row',
    gap: 5,
    paddingVertical: 5,
    paddingRight: 6,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  miniBar: { width: 3 },
  dot: { height: 6 },
  miniText: { flex: 1, fontSize: 11, lineHeight: 14, fontWeight: '600' },
});
