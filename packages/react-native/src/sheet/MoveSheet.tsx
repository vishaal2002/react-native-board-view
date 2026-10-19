import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextStyle,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { NO_LANE_ID, cellId as makeCellId, parseCellId, type GroupValue } from 'board-view-core';
import { useBoard } from '../context';
import { Chevron, CountPill } from '../layout/defaults';
import type { BoardTheme } from '../types';

type Position = 'top' | 'bottom';

/** Off-screen start and end of the sheet's slide. Taller than any sheet: it is capped at 86% of the screen. */
const OFFSCREEN = 1200;
const OPEN_MS = 260;
const CLOSE_MS = 200;
/** A drag down past this many points, or flung faster than this, closes the sheet. */
const DISMISS_DISTANCE = 110;
const DISMISS_VELOCITY = 900;
/** Boards with more columns than this get a search field. */
const SEARCH_FROM = 6;

function font(theme: BoardTheme): StyleProp<TextStyle> {
  return theme.fontFamily ? { fontFamily: theme.fontFamily } : null;
}

/**
 * The "Move to…" sheet: the accessible, no-drag way to move a card. Quick
 * moves (up, down, the next column), then lane, position and one tap on a
 * column. Your `cardActions` sit at the end. Drag the top of the sheet down,
 * tap outside or press Cancel to close it.
 */
export function MoveSheet({ itemId, onClose }: { itemId: string | null; onClose: () => void }) {
  const board = useBoard();
  const { controller, theme, labels, props, reducedMotion, scrollApi, allColumns, allLanes } = board;
  // The item stays on screen while the sheet slides away after `itemId` clears.
  const [shownId, setShownId] = useState<string | null>(itemId);
  const [laneId, setLaneId] = useState<string | null>(null);
  const [position, setPosition] = useState<Position>('top');
  const [query, setQuery] = useState('');
  const offset = useSharedValue(OFFSCREEN);
  const backdrop = useSharedValue(0);

  const finishClose = useCallback(() => setShownId(null), []);
  useEffect(() => {
    if (itemId != null) {
      setShownId(itemId);
      setLaneId(null);
      setPosition('top');
      setQuery('');
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
  }, [backdrop, board.durationScale, finishClose, itemId, offset, reducedMotion]);

  const dismiss = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY(8)
        .failOffsetX([-20, 20])
        .onUpdate((event) => {
          'worklet';
          offset.value = Math.max(0, event.translationY);
        })
        .onEnd((event) => {
          'worklet';
          if (event.translationY > DISMISS_DISTANCE || event.velocityY > DISMISS_VELOCITY) {
            scheduleOnRN(onClose);
          } else {
            offset.value = withSpring(0, { damping: 22, stiffness: 260 });
          }
        }),
    [offset, onClose],
  );

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: offset.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }));

  const id = itemId ?? shownId;
  const location = id != null ? controller.model.locations.get(id) : undefined;
  const cell = location ? controller.model.cellById.get(location.cellId) : undefined;
  const current = location ? parseCellId(location.cellId) : null;
  const lanes = props.groupBy.lanes ? allLanes : [];
  const lane = laneId ?? current?.laneKey ?? NO_LANE_ID;
  const laneLabel = lanes.find((entry) => entry.id === lane)?.label;
  const actions = id != null ? board.cardActionsFor(id) : [];
  const searchable = allColumns.length > SEARCH_FROM;
  const needle = query.trim().toLocaleLowerCase();
  const columns = needle
    ? allColumns.filter((column) => column.label.toLocaleLowerCase().includes(needle))
    : allColumns;

  const moveTo = (targetCellId: string, index: number, close: boolean) => {
    if (id == null) return;
    const moved = controller.moveItem(id, targetCellId, index, 'sheet');
    if (!close) return;
    onClose();
    if (moved) requestAnimationFrame(() => scrollApi.current?.toItem(id, !reducedMotion));
  };

  const indexIn = (targetCellId: string, at: Position) => {
    const target = controller.model.cellById.get(targetCellId);
    if (!target) return 0;
    return at === 'top' ? 0 : target.items.length - (location?.cellId === targetCellId ? 1 : 0);
  };

  const choose = (column: GroupValue) => {
    const target = makeCellId(lane, column.id);
    if (!controller.model.cellById.has(target)) return;
    moveTo(target, indexIn(target, position), true);
  };

  /** The nearest column in `step`'s direction that takes the card, in the card's own lane. */
  const neighbour = (step: 1 | -1): GroupValue | undefined => {
    if (id == null || !current) return undefined;
    const at = allColumns.findIndex((column) => column.id === current.columnKey);
    for (let index = at + step; index >= 0 && index < allColumns.length; index += step) {
      const column = allColumns[index];
      if (column && controller.canDropTo(id, makeCellId(current.laneKey, column.id))) return column;
    }
    return undefined;
  };
  const previous = neighbour(-1);
  const next = neighbour(1);
  const index = location?.index ?? 0;
  const count = cell?.items.length ?? 0;

  /** `text` is what the button shows; `label` is what a screen reader says. */
  const quick: {
    key: string;
    text: string;
    label: string;
    disabled: boolean;
    run: () => void;
    chevron: 'up' | 'down' | 'left' | 'right';
  }[] =
    location && current
      ? [
          {
            key: 'up',
            text: labels.moveUp,
            label: labels.moveUp,
            chevron: 'up',
            disabled: index === 0,
            run: () => moveTo(location.cellId, index - 1, false),
          },
          {
            key: 'down',
            text: labels.moveDown,
            label: labels.moveDown,
            chevron: 'down',
            disabled: index >= count - 1,
            run: () => moveTo(location.cellId, index + 1, false),
          },
          {
            key: 'previous',
            text: previous?.label ?? labels.previousColumn,
            label: previous ? `${labels.previousColumn}: ${previous.label}` : labels.previousColumn,
            chevron: board.rtl ? 'right' : 'left',
            disabled: !previous,
            run: () => {
              if (!previous) return;
              const target = makeCellId(current.laneKey, previous.id);
              moveTo(target, indexIn(target, position), true);
            },
          },
          {
            key: 'next',
            text: next?.label ?? labels.nextColumn,
            label: next ? `${labels.nextColumn}: ${next.label}` : labels.nextColumn,
            chevron: board.rtl ? 'left' : 'right',
            disabled: !next,
            run: () => {
              if (!next) return;
              const target = makeCellId(current.laneKey, next.id);
              moveTo(target, indexIn(target, position), true);
            },
          },
        ]
      : [];

  const visible = shownId != null;
  const ready = id != null && location != null && cell != null && current != null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
      supportedOrientations={['portrait', 'landscape']}
    >
      <GestureHandlerRootView style={styles.root}>
        <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: theme.sheetBackdrop }, backdropStyle]}>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={labels.cancel}
            />
          </Animated.View>
          {ready ? (
            <Animated.View
              accessibilityViewIsModal
              style={[styles.sheet, { backgroundColor: theme.sheetBackground }, sheetStyle]}
            >
              <GestureDetector gesture={dismiss}>
                <View style={styles.head} collapsable={false}>
                  <View style={[styles.grabber, { backgroundColor: theme.sheetDivider }]} />
                  <Text
                    style={[styles.title, { color: theme.text }, font(theme)]}
                    accessibilityRole="header"
                    numberOfLines={2}
                  >
                    {labels.moveSheetTitle(controller.itemLabel(id))}
                  </Text>
                  <Text style={[styles.subtitle, { color: theme.mutedText }, font(theme)]} numberOfLines={1}>
                    {labels.currentPlace({
                      item: controller.itemLabel(id),
                      column: cell.column.label,
                      lane: props.groupBy.lanes ? cell.lane.label : null,
                      position: index + 1,
                      count,
                    })}
                  </Text>
                </View>
              </GestureDetector>

              <ScrollView
                style={styles.body}
                contentContainerStyle={styles.bodyContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.quick}>
                  {quick.map((entry) => (
                    <Pressable
                      key={entry.key}
                      disabled={entry.disabled}
                      onPress={entry.run}
                      accessibilityRole="button"
                      accessibilityLabel={entry.label}
                      accessibilityState={{ disabled: entry.disabled }}
                      style={({ pressed }) => [
                        styles.quickButton,
                        {
                          backgroundColor: pressed ? theme.sheetDivider : theme.columnBackground,
                          opacity: entry.disabled ? 0.4 : 1,
                        },
                      ]}
                    >
                      <Chevron direction={entry.chevron} color={theme.text} size={7} />
                      <Text style={[styles.quickText, { color: theme.text }, font(theme)]} numberOfLines={1}>
                        {entry.text}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                {lanes.length > 0 ? (
                  <>
                    <Text style={[styles.section, { color: theme.mutedText }, font(theme)]}>{labels.lane}</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                      {lanes.map((entry) => {
                        const selected = entry.id === lane;
                        const own = entry.id === current.laneKey;
                        return (
                          <Pressable
                            key={entry.id}
                            onPress={() => setLaneId(entry.id)}
                            accessibilityRole="radio"
                            accessibilityState={{ selected }}
                            accessibilityLabel={own ? `${entry.label}, ${labels.current}` : entry.label}
                            style={[
                              styles.chip,
                              { borderColor: selected ? theme.accent : theme.sheetDivider },
                              selected ? { backgroundColor: theme.accent } : null,
                            ]}
                          >
                            <Text style={[styles.chipText, { color: selected ? '#FFFFFF' : theme.text }, font(theme)]}>
                              {own ? `• ${entry.label}` : entry.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </>
                ) : null}

                <Text style={[styles.section, { color: theme.mutedText }, font(theme)]}>{labels.position}</Text>
                <View
                  style={[styles.segment, { backgroundColor: theme.columnBackground }]}
                  accessibilityRole="radiogroup"
                >
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
                        <Text
                          style={[styles.segmentText, { color: selected ? theme.text : theme.mutedText }, font(theme)]}
                        >
                          {value === 'top' ? labels.top : labels.bottom}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Text style={[styles.section, { color: theme.mutedText }, font(theme)]}>{labels.column}</Text>
                {searchable ? (
                  <TextInput
                    value={query}
                    onChangeText={setQuery}
                    placeholder={labels.searchColumns}
                    placeholderTextColor={theme.mutedText}
                    accessibilityLabel={labels.searchColumns}
                    autoCorrect={false}
                    autoCapitalize="none"
                    clearButtonMode="while-editing"
                    returnKeyType="done"
                    style={[
                      styles.search,
                      { color: theme.text, backgroundColor: theme.columnBackground, borderColor: theme.sheetDivider },
                      font(theme),
                    ]}
                  />
                ) : null}
                {columns.length === 0 ? (
                  <Text style={[styles.empty, { color: theme.mutedText }, font(theme)]}>{labels.noColumnsMatch}</Text>
                ) : null}
                {columns.map((column) => {
                  const target = makeCellId(lane, column.id);
                  const targetCell = controller.model.cellById.get(target);
                  const isCurrent = location.cellId === target;
                  const allowed = targetCell != null && controller.canDropTo(id, target);
                  return (
                    <Pressable
                      key={column.id}
                      disabled={!allowed}
                      onPress={() => choose(column)}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: !allowed }}
                      accessibilityLabel={`${labels.moveToColumnAction(column.label)}${laneLabel ? `, ${labels.lane} ${laneLabel}` : ''}, ${position === 'top' ? labels.top : labels.bottom}${isCurrent ? `, ${labels.current}` : ''}`}
                      style={({ pressed }) => [
                        styles.row,
                        { borderColor: theme.sheetDivider, opacity: allowed ? 1 : 0.4 },
                        isCurrent ? { backgroundColor: theme.columnBackground } : null,
                        pressed ? { backgroundColor: theme.sheetDivider } : null,
                      ]}
                    >
                      <View style={[styles.dot, { backgroundColor: column.color ?? theme.mutedText }]} />
                      <Text style={[styles.rowText, { color: theme.text }, font(theme)]} numberOfLines={1}>
                        {column.label}
                      </Text>
                      {isCurrent ? (
                        <Text style={[styles.current, { color: theme.accent }, font(theme)]}>{labels.current}</Text>
                      ) : null}
                      <CountPill count={targetCell?.items.length ?? 0} theme={theme} />
                    </Pressable>
                  );
                })}

                {actions.length > 0 ? (
                  <>
                    <Text style={[styles.section, { color: theme.mutedText }, font(theme)]}>{labels.actions}</Text>
                    {actions.map((action) => (
                      <Pressable
                        key={action.key}
                        onPress={() => {
                          board.runCardAction(id, action.key, 'sheet');
                          onClose();
                        }}
                        accessibilityRole="button"
                        style={({ pressed }) => [
                          styles.row,
                          { borderColor: theme.sheetDivider },
                          pressed ? { backgroundColor: theme.sheetDivider } : null,
                        ]}
                      >
                        {action.icon ? <View style={styles.icon}>{action.icon}</View> : null}
                        <Text
                          style={[styles.rowText, { color: action.color ?? theme.text }, font(theme)]}
                          numberOfLines={1}
                        >
                          {action.label}
                        </Text>
                      </Pressable>
                    ))}
                  </>
                ) : null}
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
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 18,
    paddingBottom: Platform.OS === 'ios' ? 34 : 22,
    maxHeight: '86%',
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  head: { paddingTop: 10, paddingBottom: 4 },
  grabber: { alignSelf: 'center', width: 38, height: 5, borderRadius: 3, marginBottom: 12 },
  title: { fontSize: 18, fontWeight: '700' },
  subtitle: { fontSize: 13, fontWeight: '500', marginTop: 2 },
  body: { flexGrow: 0, flexShrink: 1 },
  bodyContent: { paddingBottom: 4 },
  quick: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  quickButton: {
    flexGrow: 1,
    flexBasis: '45%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  quickText: { flexShrink: 1, fontSize: 14, fontWeight: '600' },
  section: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 16,
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
  search: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    fontSize: 15,
    marginBottom: 6,
  },
  empty: { fontSize: 14, paddingVertical: 14, textAlign: 'center' },
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
  icon: { width: 20, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, fontSize: 16, fontWeight: '600' },
  current: { fontSize: 12, fontWeight: '700' },
  cancel: {
    marginTop: 12,
    minHeight: 48,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: { fontSize: 16, fontWeight: '700' },
});
