import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { BoardDragProvider, DraxCell, DraxCellBoard, cellId } from 'react-native-board-view';
import { generateNKeysBetween } from 'fractional-indexing';
import { kanbanGroup, type SpikeCard } from '../fixtures';
import { idsIn, useLocalBoard } from '../localBoard';
import { theme } from '../theme';
import { Screen, Stat } from '../ui';

export function GestureScreen({ onBack }: { onBack: () => void }) {
  const { width, height } = useWindowDimensions();
  const initial = useRef(seed()).current;
  const board = useLocalBoard(initial, kanbanGroup);
  const [counts, setCounts] = useState({ pages: 0, drags: 0, actions: 0, misfires: 0 });
  const dragging = useRef(false);
  const lastAction = useRef(0);
  const page = useRef(0);
  const columnWidth = width;
  const columnHeight = Math.max(240, height - 250);

  const bump = (key: keyof typeof counts) => {
    setCounts((current) => ({ ...current, [key]: current[key] + 1 }));
  };

  return (
    <Screen
      title="S5 gestures"
      subtitle="Phone paging. Swipe changes the page. Long-press drags. The … button opens an action. Do 50 mixed attempts."
      onBack={onBack}
      footer={
        <View style={styles.footer}>
          <Stat label="Pages" value={String(counts.pages)} />
          <Stat label="Drags" value={String(counts.drags)} />
          <Stat label="Actions" value={String(counts.actions)} />
          <Stat label="Misfires" value={String(counts.misfires)} warn={counts.misfires > 0} />
        </View>
      }
    >
      <BoardDragProvider>
        <DraxCellBoard
          horizontal
          mode="paged"
          pageSize={columnWidth}
          onHorizontalOffset={(offset) => {
            const next = Math.round(offset / Math.max(1, columnWidth));
            if (next === page.current) return;
            page.current = next;
            if (dragging.current) bump('misfires');
            else bump('pages');
          }}
          onDragStart={() => {
            dragging.current = true;
            if (Date.now() - lastAction.current < 400) bump('misfires');
            else bump('drags');
          }}
          onDragEnd={() => {
            dragging.current = false;
          }}
          onTransfer={(event) => board.commit(event.itemId, event.fromCellId, event.toCellId, event.toIndex, event.rawToIndex)}
          onReorder={(event) => board.commit(event.itemId, event.cellId, event.cellId, event.toIndex)}
        >
          {kanbanGroup.columns.values.map((column) => {
            const id = cellId('_', column.id);
            return (
              <View key={id} style={[styles.column, { width: columnWidth, height: columnHeight }]}>
                <Text style={styles.header}>{column.label}</Text>
                <DraxCell
                  cellId={id}
                  itemIds={idsIn(board.projected, id)}
                  dragActivationFailOffset={18}
                  longPressDelay={200}
                  renderCard={(itemId) => (
                    <View style={styles.card}>
                      <Text style={styles.cardTitle}>{itemId}</Text>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Actions for ${itemId}`}
                        onPress={() => {
                          lastAction.current = Date.now();
                          if (dragging.current) bump('misfires');
                          else bump('actions');
                        }}
                        style={styles.more}
                      >
                        <Text style={styles.moreText}>…</Text>
                      </Pressable>
                    </View>
                  )}
                />
              </View>
            );
          })}
        </DraxCellBoard>
      </BoardDragProvider>
    </Screen>
  );
}

function seed(): SpikeCard[] {
  const ranks = generateNKeysBetween(null, null, 6);
  return ['todo', 'doing', 'done'].flatMap((status, column) =>
    [0, 1].map((index) => ({
      id: `${status}-${index + 1}`,
      title: `${status} ${index + 1}`,
      rank: ranks[column * 2 + index] ?? `a${column}${index}`,
      status,
      assignee: 'alice',
      height: 72,
    })),
  );
}

const styles = StyleSheet.create({
  column: { backgroundColor: theme.panel },
  header: { color: theme.text, fontWeight: '700', padding: 12 },
  card: {
    margin: 12,
    backgroundColor: theme.card,
    borderRadius: 12,
    minHeight: 72,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTitle: { color: theme.text, fontSize: 16, fontWeight: '600' },
  more: { paddingHorizontal: 12, paddingVertical: 8 },
  moreText: { color: theme.accent, fontSize: 22, fontWeight: '700' },
  footer: { flexDirection: 'row', gap: 8, padding: 12, flexWrap: 'wrap' },
});
