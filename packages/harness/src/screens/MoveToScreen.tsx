import { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Modal, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { generateNKeysBetween } from 'fractional-indexing';
import {
  cellId,
  createMoveFromDrop,
  projectBoard,
  rankForMove,
} from 'react-native-board-view';
import { applyMove, laneGroup, type SpikeCard } from '../fixtures';
import { theme } from '../theme';
import { Screen } from '../ui';

export function MoveToScreen({ onBack }: { onBack: () => void }) {
  const initial = useMemo(seed, []);
  const [items, setItems] = useState(initial);
  const [selected, setSelected] = useState<SpikeCard | null>(null);
  const [systemReduced, setSystemReduced] = useState(false);
  const [forceReduced, setForceReduced] = useState(false);
  const reduced = systemReduced || forceReduced;
  const board = useMemo(
    () => projectBoard({ items, getItemId: (item) => item.id, getRank: (item) => item.rank, groupBy: laneGroup }),
    [items],
  );

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (mounted) setSystemReduced(value);
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setSystemReduced);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  const move = (card: SpikeCard, status: string, assignee: string) => {
    const fromLane = card.assignee;
    const fromStatus = card.status;
    const toCell = cellId(assignee, status);
    const visible = (board.cellById.get(toCell)?.items ?? []).map((item) => ({ id: item.id, rank: item.rank }));
    const toIndex = visible.filter((item) => item.id !== card.id).length;
    const op = createMoveFromDrop({
      item: card,
      itemId: card.id,
      groupBy: laneGroup,
      fromCellId: cellId(fromLane, fromStatus),
      toCellId: toCell,
      toIndex,
      targetVisible: visible,
    });
    setItems((current) => applyMove(current, op));
    setSelected(null);
    const column = laneGroup.columns.values.find((value) => value.id === status)?.label ?? status;
    const lane = laneGroup.lanes?.values.find((value) => value.id === assignee)?.label ?? assignee;
    AccessibilityInfo.announceForAccessibility(`Moved ${card.title} to ${column}, lane ${lane}.`);
  };

  return (
    <Screen
      title="S7 Move to…"
      subtitle="This is the accessible path. Use the sheet or the card’s accessibility actions. Dragging is not required."
      onBack={onBack}
    >
      <View style={styles.row}>
        <Text style={styles.copy}>Reduced motion {systemReduced ? '(system on)' : ''}</Text>
        <Switch accessibilityLabel="Force reduced motion" value={forceReduced} onValueChange={setForceReduced} />
      </View>
      {board.lanes.map((lane) => (
        <View key={lane.id}>
          <Text style={styles.lane}>{lane.label || 'Board'}</Text>
          {board.columns.map((column) => {
            const cell = board.cellById.get(cellId(lane.id, column.id));
            return (cell?.items ?? []).map((card, index) => {
              const total = cell?.items.length ?? 0;
              const label = `${card.title}, ${column.label}, lane ${lane.label}, ${index + 1} of ${total}`;
              const actions = laneGroup.columns.values.flatMap((targetColumn) =>
                (laneGroup.lanes?.values ?? []).map((targetLane) => ({
                  name: `move-${targetLane.id}-${targetColumn.id}`,
                  label: `Move to ${targetColumn.label}, ${targetLane.label}`,
                })),
              );
              return (
                <Pressable
                  key={card.id}
                  accessible
                  accessibilityRole="button"
                  accessibilityLabel={label}
                  accessibilityHint="Opens Move to, or use the accessibility actions"
                  accessibilityActions={actions}
                  onAccessibilityAction={(event) => {
                    const name = event.nativeEvent.actionName;
                    const match = /^move-(.+)-([^-]+)$/.exec(name);
                    if (!match?.[1] || !match[2]) return;
                    move(card, match[2], match[1]);
                  }}
                  onPress={() => setSelected(card)}
                  style={styles.card}
                >
                  <Text style={styles.cardTitle}>{card.title}</Text>
                  <Text style={styles.copy}>
                    {column.label} · {lane.label} · {index + 1} of {total}
                  </Text>
                </Pressable>
              );
            });
          })}
        </View>
      ))}
      <Modal visible={selected != null} animationType={reduced ? 'none' : 'slide'} transparent onRequestClose={() => setSelected(null)}>
        <View style={styles.sheetWrap}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Move {selected?.title}</Text>
            {laneGroup.lanes?.values.map((lane) =>
              laneGroup.columns.values.map((column) => (
                <Pressable
                  key={`${lane.id}-${column.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Move to ${column.label}, lane ${lane.label}`}
                  onPress={() => {
                    if (selected) move(selected, column.id, lane.id);
                  }}
                  style={styles.target}
                >
                  <Text style={styles.cardTitle}>
                    {column.label} · {lane.label}
                  </Text>
                </Pressable>
              )),
            )}
            <Pressable accessibilityRole="button" accessibilityLabel="Cancel move" onPress={() => setSelected(null)} style={styles.target}>
              <Text style={styles.copy}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

function seed(): SpikeCard[] {
  const ranks = generateNKeysBetween(null, null, 4);
  return [
    ['Design', 'todo', 'alice'],
    ['Build', 'doing', 'alice'],
    ['Ship', 'todo', 'bob'],
    ['Notes', 'done', 'cara'],
  ].map((row, index) => ({
    id: `m${index + 1}`,
    title: row[0] ?? 'Card',
    status: row[1] ?? 'todo',
    assignee: row[2] ?? 'alice',
    rank: ranks[index] ?? rankForMove([], `m${index + 1}`, 0),
    height: 64,
  }));
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16 },
  copy: { color: theme.muted, fontSize: 13 },
  lane: { color: theme.accent, fontWeight: '700', paddingHorizontal: 16, marginTop: 8 },
  card: { marginHorizontal: 16, marginTop: 8, backgroundColor: theme.card, borderRadius: 12, padding: 12 },
  cardTitle: { color: theme.text, fontSize: 16, fontWeight: '600' },
  sheetWrap: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#0008' },
  sheet: { backgroundColor: theme.panel, padding: 16, borderTopLeftRadius: 16, borderTopRightRadius: 16, gap: 8 },
  sheetTitle: { color: theme.text, fontSize: 18, fontWeight: '700' },
  target: { paddingVertical: 10 },
});
