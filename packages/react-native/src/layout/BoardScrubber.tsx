import { useCallback, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type AccessibilityActionEvent,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useBoardTheme } from '../CardView';
import { defaultLabels } from '../theme';
import { nearestStep, type BoardTimeline } from '../timeline';
import type { BoardLabels, BoardTheme } from '../types';

export interface BoardScrubberProps {
  timeline: BoardTimeline;
  /** Default: the surrounding board's theme, else the light theme. Pass `darkTheme` outside a board in dark mode. */
  theme?: BoardTheme;
  labels?: Partial<Pick<BoardLabels, 'live' | 'play' | 'pause' | 'timelinePosition'>>;
  /** Milliseconds per step while playing. Default 700. */
  stepMs?: number;
  style?: StyleProp<ViewStyle>;
}

const THUMB = 22;

/**
 * A scrubber for the board's timeline: drag along the track to see the
 * board at any point, play the changes, or go back to live. Screen readers
 * adjust it a step at a time. Build your own from `useBoardTimeline()` when
 * this does not fit.
 */
export function BoardScrubber({ timeline, theme: themeProp, labels: labelsProp, stepMs, style }: BoardScrubberProps) {
  const fallback = useBoardTheme();
  const theme = themeProp ?? fallback;
  const labels = { ...defaultLabels, ...labelsProp };
  const [width, setWidth] = useState(0);
  const onLayout = useCallback((event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width), []);
  const { steps, entries, position } = timeline;
  const total = entries.length;
  const now = position ?? total;
  const stepIndex = Math.max(
    0,
    steps.findIndex((value) => value >= now),
  );
  const fraction = total === 0 ? 1 : now / total;
  const live = useRef(timeline);
  live.current = timeline;

  const seekAt = useCallback(
    (x: number) => {
      const current = live.current;
      if (width <= 0 || current.entries.length === 0) return;
      const wanted = (Math.max(0, Math.min(width, x)) / width) * current.entries.length;
      const best = nearestStep(current.steps, wanted);
      current.seek(best);
    },
    [width],
  );
  const onTouch = useCallback((event: GestureResponderEvent) => seekAt(event.nativeEvent.locationX), [seekAt]);
  const onAccessibilityAction = useCallback((event: AccessibilityActionEvent) => {
    live.current.step(event.nativeEvent.actionName === 'increment' ? 1 : -1);
  }, []);

  const caption =
    position == null
      ? labels.live
      : labels.timelinePosition({ at: timeline.at, step: stepIndex + 1, steps: Math.max(1, steps.length) });
  const font = theme.fontFamily ? { fontFamily: theme.fontFamily } : null;
  const disabled = total === 0;

  return (
    <View style={[styles.wrap, style]}>
      <Text
        style={[styles.caption, { color: position == null ? theme.mutedText : theme.text }, font]}
        numberOfLines={1}
      >
        {caption}
      </Text>
      <View style={styles.row}>
        <Pressable
          onPress={() => (timeline.playing ? timeline.pause() : timeline.play({ stepMs }))}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityState={{ disabled }}
          hitSlop={6}
          style={({ pressed }) => [
            styles.button,
            {
              backgroundColor: theme.columnBackground,
              borderColor: theme.columnBorder,
              opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
            },
          ]}
        >
          <Text style={[styles.buttonText, { color: theme.text }, font]}>
            {timeline.playing ? labels.pause : labels.play}
          </Text>
        </Pressable>
        <View
          style={styles.track}
          onLayout={onLayout}
          onStartShouldSetResponder={() => !disabled}
          onMoveShouldSetResponder={() => !disabled}
          onResponderGrant={onTouch}
          onResponderMove={onTouch}
          onResponderTerminationRequest={() => false}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={caption}
          accessibilityValue={{ min: 0, max: total, now }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={onAccessibilityAction}
        >
          <View pointerEvents="none" style={[styles.rail, { backgroundColor: theme.columnBorder }]} />
          <View
            pointerEvents="none"
            style={[styles.rail, styles.fill, { width: width * fraction, backgroundColor: theme.accent }]}
          />
          {width > 0 && total > 0
            ? steps.map((value) => (
                <View
                  key={value}
                  pointerEvents="none"
                  style={[styles.tick, { left: (value / total) * width - 1, backgroundColor: theme.mutedText }]}
                />
              ))
            : null}
          <View
            pointerEvents="none"
            style={[
              styles.thumb,
              {
                left: width * fraction - THUMB / 2,
                backgroundColor: position == null ? theme.accent : theme.cardBackground,
                borderColor: theme.accent,
              },
            ]}
          />
        </View>
        <Pressable
          onPress={() => timeline.live()}
          disabled={position == null}
          accessibilityRole="button"
          accessibilityState={{ disabled: position == null }}
          hitSlop={6}
          style={({ pressed }) => [
            styles.button,
            {
              backgroundColor: position == null ? theme.columnBackground : theme.accent,
              borderColor: position == null ? theme.columnBorder : theme.accent,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <Text style={[styles.buttonText, { color: position == null ? theme.mutedText : theme.cardBackground }, font]}>
            {labels.live}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6, paddingHorizontal: 12, paddingVertical: 8 },
  caption: { fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  button: {
    minHeight: 36,
    minWidth: 56,
    paddingHorizontal: 12,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { fontSize: 13, fontWeight: '800' },
  track: { flex: 1, height: 44, justifyContent: 'center' },
  rail: { position: 'absolute', left: 0, right: 0, height: 4, borderRadius: 2 },
  fill: { right: undefined },
  tick: { position: 'absolute', width: 2, height: 10, borderRadius: 1, opacity: 0.5 },
  thumb: { position: 'absolute', width: THUMB, height: THUMB, borderRadius: THUMB / 2, borderWidth: 3 },
});
