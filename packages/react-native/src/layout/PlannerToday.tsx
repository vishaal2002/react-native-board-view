import { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import Animated, { FadeIn, FadeOut, useAnimatedReaction } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useBoard } from '../context';
import { toDayId } from '../insights';
import { visualSlot } from './metrics';

/**
 * The planner's way back to today. It shows only while today's column is off
 * screen, and only when the board has a column for today.
 */
export function PlannerToday() {
  const {
    controller,
    metrics,
    boardWidth,
    scrollX,
    scrollApi,
    labels,
    theme,
    rtl,
    reducedMotion,
    durationScale,
    adapter,
  } = useBoard();
  const columns = controller.model.columns;
  const todayId = toDayId(new Date());
  const at = columns.findIndex((column) => column.id === todayId);
  const slot = at >= 0 ? metrics.slots[visualSlot(at, columns.length, rtl)] : undefined;
  const start = slot?.x ?? -1;
  const end = slot ? slot.x + slot.width : -1;
  const [away, setAway] = useState(false);
  // The dock takes the bottom of the board while a card is held.
  const dragging = adapter.useDragSource() !== null;

  useAnimatedReaction(
    () => {
      if (start < 0) return false;
      const left = scrollX.value;
      // Away once less than half of today's column is on screen.
      const shown = Math.min(end, left + boardWidth) - Math.max(start, left);
      return shown < (end - start) / 2;
    },
    (next, previous) => {
      if (next !== previous) scheduleOnRN(setAway, next);
    },
  );

  if (!slot || !away || dragging) return null;
  const duration = reducedMotion ? 0 : Math.round(160 * durationScale);
  return (
    <Animated.View
      entering={duration ? FadeIn.duration(duration) : undefined}
      exiting={duration ? FadeOut.duration(duration) : undefined}
      style={[styles.wrap, rtl ? styles.left : styles.right]}
    >
      <Pressable
        onPress={() => scrollApi.current?.toColumn(todayId, !reducedMotion)}
        accessibilityRole="button"
        hitSlop={8}
        style={({ pressed }) => [styles.button, { backgroundColor: theme.accent, opacity: pressed ? 0.8 : 1 }]}
      >
        <Text
          style={[
            styles.text,
            { color: theme.cardBackground },
            theme.fontFamily ? { fontFamily: theme.fontFamily } : null,
          ]}
        >
          {labels.today}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', bottom: 16, zIndex: 300 },
  right: { right: 16 },
  left: { left: 16 },
  button: {
    minHeight: 36,
    paddingHorizontal: 16,
    borderRadius: 18,
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#0B1220',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  text: { fontSize: 14, fontWeight: '800' },
});
