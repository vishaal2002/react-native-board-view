import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeOut, SlideInDown } from 'react-native-reanimated';
import { NO_LANE_ID, parseCellId } from 'board-view-core';
import { useBoard, useStoreValue } from '../context';
import { useScreenReader } from '../useReducedMotion';
import type { UndoEntry } from '../useBoardController';

const DEFAULT_TIMEOUT = 5000;
/** Moves a person made. `api` moves come from the app, which can offer its own undo. */
const SHOWN_FOR = new Set(['drag', 'sheet', 'swipe', 'accessibility']);

/**
 * "Moved “Fix login” to Done · Undo" after each move a person makes. It goes
 * away after `undo.timeoutMs`, when a drag starts, or when the move is undone or
 * rolled back. With a screen reader running it stays until dismissed.
 */
export function UndoBanner() {
  const board = useBoard();
  const { controller, props, theme, labels, adapter, reducedMotion } = board;
  const entry = useStoreValue(controller.lastMove);
  const dragging = adapter.useDragSource() !== null;
  const screenReader = useScreenReader();
  const [shown, setShown] = useState<UndoEntry | null>(null);
  const timeoutMs = typeof props.undo === 'object' ? (props.undo.timeoutMs ?? DEFAULT_TIMEOUT) : DEFAULT_TIMEOUT;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!entry || !SHOWN_FOR.has(entry.source)) {
      setShown(null);
      return;
    }
    setShown(entry);
    if (screenReader) return;
    timer.current = setTimeout(() => setShown(null), timeoutMs);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [entry, screenReader, timeoutMs]);

  if (!shown || dragging) return null;
  const cell = controller.model.cellById.get(shown.toCellId);
  if (!cell) return null;
  const font = theme.fontFamily ? { fontFamily: theme.fontFamily } : null;
  const message = labels.undoBanner({
    item: controller.itemLabel(shown.itemId),
    column: cell.column.label,
    lane: parseCellId(shown.toCellId).laneKey === NO_LANE_ID ? null : cell.lane.label,
  });

  return (
    <Animated.View
      entering={reducedMotion ? undefined : SlideInDown.duration(200)}
      exiting={reducedMotion ? undefined : FadeOut.duration(150)}
      style={styles.wrap}
      pointerEvents="box-none"
    >
      <View style={[styles.banner, { backgroundColor: theme.text }]}>
        <Text style={[styles.message, { color: theme.background }, font]} numberOfLines={2}>
          {message}
        </Text>
        <Pressable
          onPress={() => {
            setShown(null);
            controller.undo();
          }}
          accessibilityRole="button"
          accessibilityLabel={`${labels.undo}. ${message}`}
          hitSlop={8}
          style={({ pressed }) => [styles.button, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Text style={[styles.undo, { color: theme.background }, font]}>{labels.undo}</Text>
        </Pressable>
        <Pressable
          onPress={() => setShown(null)}
          accessibilityRole="button"
          accessibilityLabel={labels.dismiss}
          hitSlop={8}
          style={({ pressed }) => [styles.close, { opacity: pressed ? 0.6 : 1 }]}
        >
          <CloseIcon color={theme.background} />
        </Pressable>
      </View>
    </Animated.View>
  );
}

/** A plain close cross, drawn with views so the board needs no icon font. */
function CloseIcon({ color }: { color: string }) {
  return (
    <View style={styles.cross}>
      <View style={[styles.bar, { backgroundColor: color, transform: [{ rotate: '45deg' }] }]} />
      <View style={[styles.bar, { backgroundColor: color, transform: [{ rotate: '-45deg' }] }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, bottom: 16, alignItems: 'center', zIndex: 400 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    width: '100%',
    maxWidth: 480,
    minHeight: 52,
    paddingLeft: 16,
    paddingRight: 6,
    borderRadius: 14,
    elevation: 8,
    shadowColor: '#0B1220',
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
  message: { flex: 1, fontSize: 14, fontWeight: '600', paddingVertical: 8 },
  button: { minHeight: 44, minWidth: 64, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  undo: { fontSize: 15, fontWeight: '800', textDecorationLine: 'underline' },
  close: { minHeight: 44, minWidth: 40, alignItems: 'center', justifyContent: 'center' },
  cross: { width: 14, height: 14, alignItems: 'center', justifyContent: 'center', opacity: 0.8 },
  bar: { position: 'absolute', width: 16, height: 2, borderRadius: 1 },
});
