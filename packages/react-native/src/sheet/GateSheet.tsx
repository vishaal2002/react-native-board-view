import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useBoard } from '../context';
import type { HeldMove } from '../useBoardController';
import { moveTargetOf } from '../useBoardController';
import type { GatedMove, MoveGateInfo } from '../types';

const OFFSCREEN = 600;
const OPEN_MS = 240;
const CLOSE_MS = 180;

/**
 * The sheet a held move waits in: your `renderMoveGate` form, or the board's
 * own confirmation. The cards stay, pending, where they land until the user
 * submits or cancels. Tapping outside or pressing back cancels.
 */
export function GateSheet({ gate }: { gate: HeldMove | null }) {
  const board = useBoard();
  const { theme, labels, props, reducedMotion, controller } = board;
  const [shown, setShown] = useState<HeldMove | null>(gate);
  const offset = useSharedValue(OFFSCREEN);
  const backdrop = useSharedValue(0);
  const finishClose = useCallback(() => setShown(null), []);

  useEffect(() => {
    if (gate) {
      setShown(gate);
      const open = reducedMotion ? 0 : Math.round(OPEN_MS * board.durationScale);
      offset.value = withTiming(0, { duration: open, easing: Easing.out(Easing.cubic) });
      backdrop.value = withTiming(1, { duration: open });
      return;
    }
    const duration = reducedMotion ? 0 : Math.round(CLOSE_MS * board.durationScale);
    backdrop.value = withTiming(0, { duration });
    offset.value = withTiming(OFFSCREEN, { duration, easing: Easing.in(Easing.cubic) }, (done) => {
      'worklet';
      if (done) scheduleOnRN(finishClose);
    });
  }, [backdrop, board.durationScale, finishClose, gate, offset, reducedMotion]);

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: offset.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }));

  const current = gate ?? shown;
  const { submitGate, cancelGate, itemsById, model } = controller;
  const info = useMemo<MoveGateInfo<unknown> | null>(() => {
    if (!current) return null;
    const moves = current.ops.flatMap((op): GatedMove<unknown>[] => {
      const item = itemsById.get(op.id);
      return item == null ? [] : [{ op, item }];
    });
    return {
      request: current.request,
      moves,
      to: moveTargetOf(current.toCellId),
      submit: (answer?: unknown) => submitGate(answer),
      cancel: cancelGate,
    };
  }, [cancelGate, current, itemsById, submitGate]);
  // Only an open gate cancels: a tap on the backdrop while the sheet slides away does nothing.
  const cancel = gate ? cancelGate : undefined;
  const font = theme.fontFamily ? { fontFamily: theme.fontFamily } : null;
  const column = current ? (model.cellById.get(current.toCellId)?.column.label ?? '') : '';
  const first = current?.ops[0];

  return (
    <Modal
      visible={shown != null}
      transparent
      animationType="none"
      onRequestClose={cancel}
      statusBarTranslucent
      supportedOrientations={['portrait', 'landscape']}
    >
      <View style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: theme.sheetBackdrop }, backdropStyle]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={cancel}
            accessibilityRole="button"
            accessibilityLabel={labels.cancel}
          />
        </Animated.View>
        {info ? (
          <Animated.View
            accessibilityViewIsModal
            style={[styles.sheet, { backgroundColor: theme.sheetBackground }, sheetStyle]}
          >
            <View style={[styles.grabber, { backgroundColor: theme.sheetDivider }]} />
            {props.renderMoveGate && info.request !== 'confirm' ? (
              props.renderMoveGate(info)
            ) : (
              <>
                <Text style={[styles.title, { color: theme.text }, font]} accessibilityRole="header" numberOfLines={3}>
                  {labels.confirmMoveTitle({
                    item: first ? controller.itemLabel(first.id) : '',
                    count: current?.ops.length ?? 0,
                    column,
                  })}
                </Text>
                <View style={styles.buttons}>
                  <Pressable
                    onPress={cancel}
                    accessibilityRole="button"
                    style={({ pressed }) => [
                      styles.button,
                      { backgroundColor: theme.columnBackground, opacity: pressed ? 0.7 : 1 },
                    ]}
                  >
                    <Text style={[styles.buttonText, { color: theme.text }, font]}>{labels.cancel}</Text>
                  </Pressable>
                  <Pressable
                    onPress={gate ? () => submitGate() : undefined}
                    accessibilityRole="button"
                    style={({ pressed }) => [
                      styles.button,
                      { backgroundColor: theme.accent, opacity: pressed ? 0.7 : 1 },
                    ]}
                  >
                    <Text style={[styles.buttonText, { color: theme.cardBackground }, font]}>{labels.confirmMove}</Text>
                  </Pressable>
                </View>
              </>
            )}
          </Animated.View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 34 : 22,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  grabber: { alignSelf: 'center', width: 38, height: 5, borderRadius: 3, marginBottom: 12 },
  title: { fontSize: 18, fontWeight: '700' },
  buttons: { flexDirection: 'row', gap: 12, marginTop: 18 },
  button: { flex: 1, minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 16, fontWeight: '700' },
});
