import { useCallback, useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { useBoard, useStoreValue } from '../context';
import { visualSlot } from './metrics';

function useCurrentPage(): number {
  const { page } = useBoard();
  return useStoreValue(page);
}

/** Cards per column, or the app's `columnTotals` where it passes them. */
function useColumnCounts(): Map<string, number> {
  const { controller, columnTotal } = useBoard();
  const counts = new Map<string, number>();
  for (const cell of controller.model.cells)
    counts.set(cell.columnKey, (counts.get(cell.columnKey) ?? 0) + cell.items.length);
  for (const [columnId, count] of counts) counts.set(columnId, columnTotal(columnId, count));
  return counts;
}

/** Column chips for the paged layout. Tap to jump; the active chip follows swipes. */
export function PagerTabs() {
  const { controller, theme, labels, rtl, scrollApi, reducedMotion } = useBoard();
  const current = useCurrentPage();
  const counts = useColumnCounts();
  const columns = controller.model.columns;
  const scrollRef = useRef<ScrollView>(null);
  const chips = useRef(new Map<string, { x: number; width: number }>());
  const viewport = useRef(0);
  const active = columns[visualSlot(current, columns.length, rtl)];

  useEffect(() => {
    const chip = active ? chips.current.get(active.id) : undefined;
    if (!chip) return;
    const x = Math.max(0, chip.x - (viewport.current - chip.width) / 2);
    scrollRef.current?.scrollTo({ x, animated: !reducedMotion });
  }, [active, reducedMotion]);

  const onViewport = useCallback((event: LayoutChangeEvent) => {
    viewport.current = event.nativeEvent.layout.width;
  }, []);

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.tabs}
      contentContainerStyle={styles.tabsContent}
      onLayout={onViewport}
      accessibilityRole="tablist"
    >
      {columns.map((column) => {
        const selected = column.id === active?.id;
        const count = counts.get(column.id) ?? 0;
        return (
          <Pressable
            key={column.id}
            onPress={() => scrollApi.current?.toColumn(column.id, !reducedMotion)}
            onLayout={(event) => {
              const { x, width } = event.nativeEvent.layout;
              chips.current.set(column.id, { x, width });
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={labels.columnTab(column.label, count)}
            style={({ pressed }) => [
              styles.tab,
              { backgroundColor: selected ? theme.accent : theme.columnBackground, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            {column.color ? (
              <View style={[styles.dot, { backgroundColor: selected ? '#FFFFFF' : column.color }]} />
            ) : null}
            <Text
              numberOfLines={1}
              style={[
                styles.tabText,
                { color: selected ? '#FFFFFF' : theme.text },
                theme.fontFamily ? { fontFamily: theme.fontFamily } : null,
              ]}
            >
              {column.label}
            </Text>
            <Text style={[styles.tabCount, { color: selected ? 'rgba(255,255,255,0.85)' : theme.mutedText }]}>
              {count}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** Page dots for the paged layout. */
export function PagerDots() {
  const { controller, theme } = useBoard();
  const current = useCurrentPage();
  return (
    <View style={styles.dots} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      {controller.model.columns.map((column, index) => (
        <View
          key={column.id}
          style={[
            styles.pageDot,
            index === current
              ? { backgroundColor: theme.accent, width: 18 }
              : { backgroundColor: theme.emptyCellBorder },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: { flexGrow: 0 },
  tabsContent: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 2, gap: 8 },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 34,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 17,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  tabText: { fontSize: 14, fontWeight: '700', maxWidth: 160 },
  tabCount: { fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingVertical: 10 },
  pageDot: { height: 6, width: 6, borderRadius: 3 },
});
