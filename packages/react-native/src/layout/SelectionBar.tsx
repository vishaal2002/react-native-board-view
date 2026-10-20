import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeOut, SlideInDown } from 'react-native-reanimated';
import { useBoard, useStoreValue } from '../context';

/**
 * "3 selected · Move · Done" while a selection is open. Move opens the Move
 * sheet for every selected card; Done ends the selection. Hidden during a
 * drag, which carries the selection with it.
 */
export function SelectionBar() {
  const board = useBoard();
  const { theme, labels, adapter, reducedMotion, sheetMode } = board;
  const selected = useStoreValue(board.selection);
  const dragging = adapter.useDragSource() !== null;
  if (selected.size === 0 || dragging) return null;
  const ids = [...selected];
  const font = theme.fontFamily ? { fontFamily: theme.fontFamily } : null;
  const count = labels.selectedCount(ids.length);

  return (
    <Animated.View
      entering={reducedMotion ? undefined : SlideInDown.duration(Math.round(200 * board.durationScale))}
      exiting={reducedMotion ? undefined : FadeOut.duration(Math.round(150 * board.durationScale))}
      style={styles.wrap}
      pointerEvents="box-none"
    >
      <View style={[styles.bar, { backgroundColor: theme.text }]} accessibilityRole="toolbar">
        <Text
          style={[styles.count, { color: theme.background }, font]}
          numberOfLines={1}
          accessibilityLiveRegion="polite"
        >
          {count}
        </Text>
        {sheetMode !== false ? (
          <Pressable
            onPress={() => {
              const first = ids[0];
              if (first != null) board.openMoveSheet(first);
            }}
            accessibilityRole="button"
            accessibilityLabel={`${labels.moveSelected}, ${count}`}
            hitSlop={4}
            style={({ pressed }) => [styles.primary, { backgroundColor: theme.background, opacity: pressed ? 0.7 : 1 }]}
          >
            <Text style={[styles.primaryText, { color: theme.text }, font]}>{labels.moveSelected}</Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={() => board.setSelection([])}
          accessibilityRole="button"
          hitSlop={4}
          style={({ pressed }) => [styles.secondary, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Text style={[styles.secondaryText, { color: theme.background }, font]}>{labels.clearSelection}</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, bottom: 16, alignItems: 'center', zIndex: 410 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    maxWidth: 480,
    minHeight: 56,
    paddingLeft: 18,
    paddingRight: 6,
    borderRadius: 16,
    elevation: 8,
    shadowColor: '#0B1220',
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
  count: { flex: 1, fontSize: 15, fontWeight: '700' },
  primary: {
    minHeight: 44,
    minWidth: 72,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { fontSize: 15, fontWeight: '800' },
  secondary: { minHeight: 44, minWidth: 64, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontSize: 15, fontWeight: '700' },
});
