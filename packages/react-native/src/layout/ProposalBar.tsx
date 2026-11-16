import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeOut, SlideInDown } from 'react-native-reanimated';
import { useBoard, useStoreValue } from '../context';

/**
 * "3 suggestions · Decline all · Accept all" while `proposals` has any.
 * Each card answers its own; this answers them all. Hidden during a drag
 * and while a selection shows its own bar.
 */
export function ProposalBar({
  count,
  onDecideAll,
}: {
  count: number;
  onDecideAll: (decision: 'accept' | 'decline') => void;
}) {
  const board = useBoard();
  const { theme, labels, adapter, reducedMotion } = board;
  const selected = useStoreValue(board.selection);
  const dragging = adapter.useDragSource() !== null;
  if (count === 0 || dragging || selected.size > 0) return null;
  const font = theme.fontFamily ? { fontFamily: theme.fontFamily } : null;
  const text = labels.proposalCount(count);
  return (
    <Animated.View
      entering={reducedMotion ? undefined : SlideInDown.duration(Math.round(200 * board.durationScale))}
      exiting={reducedMotion ? undefined : FadeOut.duration(Math.round(150 * board.durationScale))}
      style={styles.wrap}
      pointerEvents="box-none"
    >
      <View
        style={[styles.bar, { backgroundColor: theme.sheetBackground, borderColor: theme.accent }]}
        accessibilityRole="toolbar"
      >
        <Text style={[styles.count, { color: theme.text }, font]} numberOfLines={1} accessibilityLiveRegion="polite">
          {text}
        </Text>
        <Pressable
          onPress={() => onDecideAll('decline')}
          accessibilityRole="button"
          accessibilityLabel={`${labels.declineAll}, ${text}`}
          hitSlop={4}
          style={({ pressed }) => [styles.secondary, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Text style={[styles.secondaryText, { color: theme.mutedText }, font]}>{labels.declineAll}</Text>
        </Pressable>
        <Pressable
          onPress={() => onDecideAll('accept')}
          accessibilityRole="button"
          accessibilityLabel={`${labels.acceptAll}, ${text}`}
          hitSlop={4}
          style={({ pressed }) => [styles.primary, { backgroundColor: theme.accent, opacity: pressed ? 0.7 : 1 }]}
        >
          <Text style={[styles.primaryText, { color: theme.sheetBackground }, font]}>{labels.acceptAll}</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, bottom: 16, alignItems: 'center', zIndex: 405 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    width: '100%',
    maxWidth: 480,
    minHeight: 56,
    paddingLeft: 18,
    paddingRight: 6,
    borderRadius: 16,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    elevation: 6,
    shadowColor: '#0B1220',
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  count: { flex: 1, fontSize: 15, fontWeight: '700' },
  primary: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { fontSize: 15, fontWeight: '800' },
  secondary: { minHeight: 44, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontSize: 15, fontWeight: '700' },
});
