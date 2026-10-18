import { memo, useCallback, useEffect, useMemo, useRef, type ReactNode, type RefObject } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent, type LayoutRectangle } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInDown, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { cellId as makeCellId, parseCellId, type GroupValue } from 'board-view-core';
import { useBoard } from '../context';
import type { ZoneGeometry } from '../engine/types';
import type { BoardTheme, CardAction } from '../types';

/** Zone ids the board reads back in `onZoneDrop`. */
export const DOCK_COLUMN = 'dock-column:';
export const DOCK_ACTION = 'dock-action:';

type Frames = RefObject<Map<string, LayoutRectangle>>;

const PANEL = 'panel';
/** Space around the dock panel, and between it and the lists above it. */
const PANEL_MARGIN = 12;

/** A rect in board coordinates from the panel, row and chip frames. Null until all three are laid out. */
function chipRect(frames: Frames, row: string, chip: string) {
  const map = frames.current;
  const panel = map.get(PANEL);
  const line = map.get(row);
  const own = map.get(chip);
  if (!panel || !line || !own) return null;
  return { x: panel.x + line.x + own.x, y: panel.y + line.y + own.y, width: own.width, height: own.height };
}

/**
 * The drop dock: a tray that slides up while a card is lifted. Column chips move
 * the card to the top of a column without scrolling there; action tiles hand it
 * to `onCardAction`. Drawn above the lists and below the lifted card. Touches
 * never reach it: the board's pan owns the finger for the whole drag.
 */
export function DropDock() {
  const board = useBoard();
  const { adapter, props, controller, allColumns, theme, cardActionsFor, setDockInset } = board;
  const source = adapter.useDragSource();
  // Only once the finger moves: a long press released in place opens the Move sheet instead.
  const moved = adapter.useDragMoved();
  const options = typeof props.dock === 'object' ? props.dock : {};
  const columnOption = options.columns ?? true;
  const columns = useMemo(() => {
    if (columnOption === false) return [];
    if (columnOption === true) return allColumns;
    const byId = new Map(allColumns.map((column) => [column.id, column]));
    return columnOption.map((id) => byId.get(id)).filter((column): column is GroupValue => column != null);
  }, [allColumns, columnOption]);
  const frames = useRef(new Map<string, LayoutRectangle>());
  const record = useCallback((key: string, event: LayoutChangeEvent) => {
    frames.current.set(key, event.nativeEvent.layout);
  }, []);
  const onPanelLayout = useCallback(
    (event: LayoutChangeEvent) => {
      record(PANEL, event);
      setDockInset(event.nativeEvent.layout.height + PANEL_MARGIN * 2);
    },
    [record, setDockInset],
  );

  const actions = source && options.actions !== false ? cardActionsFor(source.itemId) : [];
  const visible = source != null && moved && (columns.length > 0 || actions.length > 0);
  useEffect(() => {
    if (!visible) setDockInset(0);
  }, [setDockInset, visible]);
  useEffect(() => () => setDockInset(0), [setDockInset]);

  if (!visible || !source) return null;
  const { laneKey, columnKey } = parseCellId(source.cellId);
  const reduced = board.reducedMotion;

  return (
    <Animated.View
      entering={reduced ? undefined : SlideInDown.duration(180)}
      exiting={reduced ? undefined : FadeOut.duration(120)}
      pointerEvents="none"
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      onLayout={onPanelLayout}
      style={[styles.panel, { backgroundColor: theme.sheetBackground, borderColor: theme.sheetDivider }]}
    >
      {actions.length > 0 ? (
        <View style={styles.actions} onLayout={(event) => record('row:actions', event)}>
          {actions.map((action) => (
            <DockZone
              key={action.key}
              zoneId={DOCK_ACTION + action.key}
              row="row:actions"
              frames={frames}
              onLayout={record}
              accepts={yes}
              style={styles.actionTile}
              theme={theme}
              tint={action.color}
            >
              <ActionLabel action={action} theme={theme} />
            </DockZone>
          ))}
        </View>
      ) : null}
      {columns.length > 0 ? (
        <View style={styles.chips} onLayout={(event) => record('row:columns', event)}>
          {columns.map((column) => {
            const target = makeCellId(laneKey, column.id);
            return (
              <DockZone
                key={column.id}
                zoneId={DOCK_COLUMN + column.id}
                row="row:columns"
                frames={frames}
                onLayout={record}
                accepts={(itemId) => controller.canDropTo(itemId, target)}
                allowed={controller.canDropTo(source.itemId, target)}
                style={styles.chip}
                theme={theme}
              >
                <View style={[styles.dot, { backgroundColor: column.color ?? theme.mutedText }]} />
                <Text
                  numberOfLines={1}
                  style={[
                    styles.chipText,
                    { color: theme.text, fontWeight: column.id === columnKey ? '800' : '600' },
                    theme.fontFamily ? { fontFamily: theme.fontFamily } : null,
                  ]}
                >
                  {column.label}
                </Text>
              </DockZone>
            );
          })}
        </View>
      ) : null}
    </Animated.View>
  );
}

const yes = () => true;

function ActionLabel({ action, theme }: { action: CardAction; theme: BoardTheme }) {
  const color = action.color ?? theme.text;
  return (
    <>
      {action.icon ? <View style={styles.icon}>{action.icon}</View> : null}
      <Text
        numberOfLines={1}
        style={[styles.actionText, { color }, theme.fontFamily ? { fontFamily: theme.fontFamily } : null]}
      >
        {action.label}
      </Text>
    </>
  );
}

const DockZone = memo(function DockZone({
  zoneId,
  row,
  frames,
  onLayout,
  accepts,
  allowed = true,
  style,
  theme,
  tint,
  children,
}: {
  zoneId: string;
  row: string;
  frames: Frames;
  onLayout: (key: string, event: LayoutChangeEvent) => void;
  accepts: (itemId: string) => boolean;
  allowed?: boolean;
  style: object;
  theme: BoardTheme;
  tint?: string;
  children: ReactNode;
}) {
  const { adapter } = useBoard();
  const active = adapter.useActiveZone();
  const live = useRef(accepts);
  live.current = accepts;
  const geometry = useMemo<ZoneGeometry>(
    () => ({ getRect: () => chipRect(frames, row, zoneId), accepts: (itemId) => live.current(itemId) }),
    [frames, row, zoneId],
  );
  adapter.useZone(zoneId, geometry);
  const accent = tint ?? theme.accent;
  const color = allowed ? accent : theme.reject;
  const idle = theme.sheetDivider;
  const hover = useAnimatedStyle(() => {
    const on = active.value === zoneId;
    return {
      transform: [{ scale: withTiming(on ? 1.08 : 1, { duration: 120 }) }],
      borderColor: on ? color : idle,
    };
  });
  const fill = useAnimatedStyle(() => ({ opacity: withTiming(active.value === zoneId ? 0.16 : 0, { duration: 120 }) }));
  return (
    <Animated.View
      entering={FadeIn.duration(120)}
      onLayout={(event) => onLayout(zoneId, event)}
      style={[style, { opacity: allowed ? 1 : 0.35 }, hover]}
    >
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: color, borderRadius: 18 }, fill]} />
      {children}
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    left: PANEL_MARGIN,
    right: PANEL_MARGIN,
    bottom: PANEL_MARGIN,
    zIndex: 500,
    elevation: 12,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 10,
    gap: 8,
    shadowColor: '#0B1220',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
  },
  actions: { flexDirection: 'row', gap: 8 },
  actionTile: {
    flex: 1,
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 8,
    overflow: 'hidden',
  },
  icon: { alignItems: 'center', justifyContent: 'center' },
  actionText: { fontSize: 14, fontWeight: '700', flexShrink: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 38,
    maxWidth: 180,
    paddingHorizontal: 12,
    borderRadius: 19,
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  chipText: { fontSize: 13, flexShrink: 1 },
});
