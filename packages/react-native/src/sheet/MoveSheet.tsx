import { useEffect, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
} from 'react-native';
import Animated, { FadeOut, SlideInDown } from 'react-native-reanimated';
import { NO_LANE_ID, cellId as makeCellId, parseCellId, type GroupValue } from 'board-view-core';
import { useBoard } from '../context';
import { CountPill } from '../layout/defaults';
import type { BoardTheme } from '../types';

type Position = 'top' | 'bottom';

function font(theme: BoardTheme): StyleProp<TextStyle> {
  return theme.fontFamily ? { fontFamily: theme.fontFamily } : null;
}

/**
 * The "Move to…" sheet: the accessible, no-drag way to move a card. Lane,
 * position, then one tap on a column moves it and scrolls the card into view.
 */
export function MoveSheet({ itemId, onClose }: { itemId: string | null; onClose: () => void }) {
  const board = useBoard();
  const { controller, theme, labels, props, reducedMotion, scrollApi } = board;
  const location = itemId != null ? controller.model.locations.get(itemId) : undefined;
  const current = location ? parseCellId(location.cellId) : null;
  const lanes = props.groupBy.lanes ? controller.model.lanes : [];
  const [laneId, setLaneId] = useState<string | null>(null);
  const [position, setPosition] = useState<Position>('top');

  useEffect(() => {
    setLaneId(null);
    setPosition('top');
  }, [itemId]);

  const lane = laneId ?? current?.laneKey ?? NO_LANE_ID;
  const visible = itemId != null && location != null;

  const choose = (column: GroupValue) => {
    if (itemId == null) return;
    const target = makeCellId(lane, column.id);
    const cell = controller.model.cellById.get(target);
    if (!cell) return;
    const sameCell = location?.cellId === target;
    const index = position === 'top' ? 0 : cell.items.length - (sameCell ? 1 : 0);
    const moved = controller.moveItem(itemId, target, index, 'sheet');
    onClose();
    if (moved) requestAnimationFrame(() => scrollApi.current?.toItem(itemId, !reducedMotion));
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType={reducedMotion ? 'none' : 'fade'}
      onRequestClose={onClose}
      statusBarTranslucent
      supportedOrientations={['portrait', 'landscape']}
    >
      <View style={styles.root}>
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: theme.sheetBackdrop }]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={labels.cancel}
        />
        {visible ? (
          <Animated.View
            entering={reducedMotion ? undefined : SlideInDown.duration(240)}
            exiting={reducedMotion ? undefined : FadeOut.duration(120)}
            accessibilityViewIsModal
            style={[styles.sheet, { backgroundColor: theme.sheetBackground }]}
          >
            <View style={[styles.grabber, { backgroundColor: theme.sheetDivider }]} />
            <Text
              style={[styles.title, { color: theme.text }, font(theme)]}
              accessibilityRole="header"
              numberOfLines={2}
            >
              {labels.moveSheetTitle(controller.itemLabel(itemId))}
            </Text>

            {lanes.length > 0 ? (
              <>
                <Text style={[styles.section, { color: theme.mutedText }, font(theme)]}>{labels.lane}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                  {lanes.map((entry) => {
                    const selected = entry.id === lane;
                    return (
                      <Pressable
                        key={entry.id}
                        onPress={() => setLaneId(entry.id)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected }}
                        style={[
                          styles.chip,
                          { borderColor: selected ? theme.accent : theme.sheetDivider },
                          selected ? { backgroundColor: theme.accent } : null,
                        ]}
                      >
                        <Text style={[styles.chipText, { color: selected ? '#FFFFFF' : theme.text }, font(theme)]}>
                          {entry.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </>
            ) : null}

            <Text style={[styles.section, { color: theme.mutedText }, font(theme)]}>{labels.position}</Text>
            <View style={[styles.segment, { backgroundColor: theme.columnBackground }]} accessibilityRole="radiogroup">
              {(['top', 'bottom'] as const).map((value) => {
                const selected = value === position;
                return (
                  <Pressable
                    key={value}
                    onPress={() => setPosition(value)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    style={[styles.segmentItem, selected ? { backgroundColor: theme.sheetBackground } : null]}
                  >
                    <Text style={[styles.segmentText, { color: selected ? theme.text : theme.mutedText }, font(theme)]}>
                      {value === 'top' ? labels.top : labels.bottom}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={[styles.section, { color: theme.mutedText }, font(theme)]}>{labels.column}</Text>
            <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
              {controller.model.columns.map((column) => {
                const target = makeCellId(lane, column.id);
                const cell = controller.model.cellById.get(target);
                const isCurrent = location?.cellId === target;
                const allowed = itemId != null && cell != null && controller.canDropTo(itemId, target);
                return (
                  <Pressable
                    key={column.id}
                    disabled={!allowed}
                    onPress={() => choose(column)}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !allowed }}
                    accessibilityLabel={`${labels.moveToColumnAction(column.label)}${lanes.length > 0 ? `, ${labels.lane} ${lanes.find((entry) => entry.id === lane)?.label ?? ''}` : ''}, ${position === 'top' ? labels.top : labels.bottom}`}
                    style={({ pressed }) => [
                      styles.row,
                      { borderColor: theme.sheetDivider, opacity: allowed ? 1 : 0.4 },
                      pressed ? { backgroundColor: theme.columnBackground } : null,
                    ]}
                  >
                    <View style={[styles.dot, { backgroundColor: column.color ?? theme.mutedText }]} />
                    <Text style={[styles.rowText, { color: theme.text }, font(theme)]} numberOfLines={1}>
                      {column.label}
                    </Text>
                    {isCurrent ? (
                      <Text style={[styles.current, { color: theme.accent }, font(theme)]}>{labels.current}</Text>
                    ) : null}
                    <CountPill count={cell?.items.length ?? 0} theme={theme} />
                  </Pressable>
                );
              })}
            </ScrollView>

            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.cancel,
                { backgroundColor: theme.columnBackground, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Text style={[styles.cancelText, { color: theme.text }, font(theme)]}>{labels.cancel}</Text>
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
    maxHeight: '86%',
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  grabber: { alignSelf: 'center', width: 38, height: 5, borderRadius: 3, marginBottom: 12 },
  title: { fontSize: 18, fontWeight: '700', marginBottom: 6 },
  section: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 14,
    marginBottom: 8,
  },
  chips: { gap: 8, paddingRight: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    minHeight: 36,
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: 'center',
  },
  chipText: { fontSize: 14, fontWeight: '600' },
  segment: { flexDirection: 'row', borderRadius: 10, padding: 3 },
  segmentItem: {
    flex: 1,
    minHeight: 36,
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentText: { fontSize: 14, fontWeight: '600' },
  list: { flexGrow: 0, maxHeight: 340 },
  listContent: { paddingBottom: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  rowText: { flex: 1, fontSize: 16, fontWeight: '600' },
  current: { fontSize: 12, fontWeight: '700' },
  cancel: {
    marginTop: 14,
    minHeight: 48,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: { fontSize: 16, fontWeight: '700' },
});
