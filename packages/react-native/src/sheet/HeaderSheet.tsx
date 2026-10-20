import { useCallback, useEffect, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useBoard, type HeaderSheetTarget } from '../context';
import { Chevron } from '../layout/defaults';

const OFFSCREEN = 600;
const OPEN_MS = 240;
const CLOSE_MS = 180;

interface Entry {
  readonly key: string;
  readonly label: string;
  readonly chevron: 'up' | 'down' | 'left' | 'right';
  readonly disabled: boolean;
  readonly run: () => void;
}

/**
 * The sheet a column or lane header's "…" opens: move it left or right (up
 * or down for lanes), to either end, and collapse it. The board only reports
 * the new order; the app passes `groupBy` back in it.
 */
export function HeaderSheet({ target, onClose }: { target: HeaderSheetTarget | null; onClose: () => void }) {
  const board = useBoard();
  const { theme, labels, props, reducedMotion, rtl } = board;
  const [shown, setShown] = useState<HeaderSheetTarget | null>(target);
  const offset = useSharedValue(OFFSCREEN);
  const backdrop = useSharedValue(0);
  const finishClose = useCallback(() => setShown(null), []);

  useEffect(() => {
    if (target) {
      setShown(target);
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
  }, [backdrop, board.durationScale, finishClose, offset, reducedMotion, target]);

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: offset.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }));

  const current = target ?? shown;
  const lanes = current?.kind === 'lane';
  const values = lanes ? (props.groupBy.lanes?.values ?? []) : props.groupBy.columns.values;
  const index = current ? values.findIndex((value) => value.id === current.id) : -1;
  const value = index >= 0 ? values[index] : undefined;
  const last = values.length - 1;
  const move = (to: number) => {
    if (!current) return;
    if (lanes) board.moveLane(current.id, to);
    else board.moveColumn(current.id, to);
    onClose();
  };
  const reorder = lanes ? board.reorderLanes : board.reorderColumns;
  // Columns read left to right, so "left" is earlier, mirrored right-to-left.
  const back = lanes ? 'up' : rtl ? 'right' : 'left';
  const forward = lanes ? 'down' : rtl ? 'left' : 'right';
  const entries: Entry[] = reorder
    ? [
        {
          key: 'back',
          label: lanes ? labels.moveLaneUp : labels.moveColumnLeft,
          chevron: back,
          disabled: index <= 0,
          run: () => move(index - 1),
        },
        {
          key: 'forward',
          label: lanes ? labels.moveLaneDown : labels.moveColumnRight,
          chevron: forward,
          disabled: index >= last,
          run: () => move(index + 1),
        },
        {
          key: 'first',
          label: lanes ? labels.moveLaneFirst : labels.moveColumnFirst,
          chevron: back,
          disabled: index <= 0,
          run: () => move(0),
        },
        {
          key: 'last',
          label: lanes ? labels.moveLaneLast : labels.moveColumnLast,
          chevron: forward,
          disabled: index >= last,
          run: () => move(last),
        },
      ]
    : [];
  const collapsible = lanes ? board.canCollapseLanes : board.canCollapseColumns;
  if (current && collapsible) {
    const collapsed = lanes ? board.collapsedLanes.has(current.id) : board.collapsedColumns.has(current.id);
    const name = value?.label ?? current.id;
    entries.push({
      key: 'collapse',
      label: lanes
        ? collapsed
          ? labels.expandLane(name)
          : labels.collapseLane(name)
        : collapsed
          ? labels.expandColumn(name)
          : labels.collapseColumn(name),
      chevron: collapsed ? 'down' : 'up',
      disabled: false,
      run: () => {
        if (lanes) board.toggleLane(current.id);
        else board.toggleColumn(current.id);
        onClose();
      },
    });
  }
  const font = theme.fontFamily ? { fontFamily: theme.fontFamily } : null;

  return (
    <Modal
      visible={shown != null}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
      supportedOrientations={['portrait', 'landscape']}
    >
      <View style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: theme.sheetBackdrop }, backdropStyle]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={labels.cancel}
          />
        </Animated.View>
        {value ? (
          <Animated.View
            accessibilityViewIsModal
            style={[styles.sheet, { backgroundColor: theme.sheetBackground }, sheetStyle]}
          >
            <View style={[styles.grabber, { backgroundColor: theme.sheetDivider }]} />
            <Text style={[styles.title, { color: theme.text }, font]} accessibilityRole="header" numberOfLines={2}>
              {lanes ? labels.laneSheetTitle(value.label) : labels.columnSheetTitle(value.label)}
            </Text>
            <Text style={[styles.subtitle, { color: theme.mutedText }, font]}>
              {`${labels.position} ${index + 1} / ${values.length}`}
            </Text>
            <View style={styles.list}>
              {entries.map((entry) => (
                <Pressable
                  key={entry.key}
                  disabled={entry.disabled}
                  onPress={entry.run}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: entry.disabled }}
                  style={({ pressed }) => [
                    styles.row,
                    {
                      borderColor: theme.sheetDivider,
                      opacity: entry.disabled ? 0.4 : 1,
                      backgroundColor: pressed ? theme.sheetDivider : 'transparent',
                    },
                  ]}
                >
                  <Chevron direction={entry.chevron} color={theme.text} size={7} />
                  <Text style={[styles.rowText, { color: theme.text }, font]} numberOfLines={1}>
                    {entry.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.cancel,
                { backgroundColor: theme.columnBackground, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Text style={[styles.cancelText, { color: theme.text }, font]}>{labels.cancel}</Text>
            </Pressable>
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
  subtitle: { fontSize: 13, fontWeight: '500', marginTop: 2 },
  list: { marginTop: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
  },
  rowText: { flex: 1, fontSize: 16, fontWeight: '600' },
  cancel: {
    marginTop: 12,
    minHeight: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: { fontSize: 16, fontWeight: '700' },
});
