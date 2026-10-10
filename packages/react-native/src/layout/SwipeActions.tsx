import { useMemo, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector, type GestureType } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import type { BoardTheme } from '../types';

const COMMIT = 72;
const LIMIT = 120;
const RESIST = 0.18;

export interface SwipeAction {
  label: string;
  run: () => void;
}

/**
 * Swipe a card sideways to run an action. The card follows the finger and
 * reveals where it is going; past the commit distance, release runs it.
 * Blocks the board's sideways scroll while a card swipe is possible, so the
 * two never fight. Used only in layouts without paging.
 */
export function SwipeActions({
  toLeft,
  toRight,
  blocks,
  theme,
  reducedMotion,
  children,
}: {
  toLeft?: SwipeAction;
  toRight?: SwipeAction;
  blocks?: GestureType;
  theme: BoardTheme;
  reducedMotion: boolean;
  children: ReactNode;
}) {
  const translateX = useSharedValue(0);
  const hasLeft = toLeft != null;
  const hasRight = toRight != null;
  const runLeft = toLeft?.run;
  const runRight = toRight?.run;

  const gesture = useMemo(() => {
    const back = { duration: reducedMotion ? 0 : 180 };
    let pan = Gesture.Pan()
      .activeOffsetX([-14, 14])
      .failOffsetY([-10, 10])
      .onUpdate((event) => {
        'worklet';
        let x = event.translationX;
        if ((x > 0 && !hasRight) || (x < 0 && !hasLeft)) x *= RESIST;
        translateX.value = Math.max(-LIMIT, Math.min(LIMIT, x));
      })
      .onEnd(() => {
        'worklet';
        const x = translateX.value;
        if (x >= COMMIT && hasRight && runRight) scheduleOnRN(runRight);
        else if (x <= -COMMIT && hasLeft && runLeft) scheduleOnRN(runLeft);
        translateX.value = withTiming(0, back);
      })
      .onFinalize(() => {
        'worklet';
        if (translateX.value !== 0) translateX.value = withTiming(0, back);
      });
    if (blocks) pan = pan.blocksExternalGesture(blocks);
    return pan;
  }, [blocks, hasLeft, hasRight, reducedMotion, runLeft, runRight, translateX]);

  const contentStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.value }] }));
  const rightReveal = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [12, COMMIT], [0, 1], Extrapolation.CLAMP),
  }));
  const leftReveal = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [-COMMIT, -12], [1, 0], Extrapolation.CLAMP),
  }));

  return (
    <View>
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.track, { borderRadius: theme.cardRadius }]}>
        <Animated.View style={[styles.reveal, styles.start, rightReveal]}>
          {toRight ? (
            <Text numberOfLines={1} style={[styles.label, { color: theme.accent }]}>
              {toRight.label} ›
            </Text>
          ) : null}
        </Animated.View>
        <Animated.View style={[styles.reveal, styles.end, leftReveal]}>
          {toLeft ? (
            <Text numberOfLines={1} style={[styles.label, { color: theme.accent }]}>
              ‹ {toLeft.label}
            </Text>
          ) : null}
        </Animated.View>
      </View>
      <GestureDetector gesture={gesture}>
        <Animated.View style={contentStyle}>{children}</Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', overflow: 'hidden' },
  reveal: { flex: 1, justifyContent: 'center', paddingHorizontal: 14 },
  start: { alignItems: 'flex-start' },
  end: { alignItems: 'flex-end' },
  label: { fontSize: 13, fontWeight: '700', maxWidth: 140 },
});
