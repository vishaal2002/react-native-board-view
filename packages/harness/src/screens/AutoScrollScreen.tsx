import { useMemo, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { BoardDragProvider, DraxCell, DraxCellBoard, cellId, type AutoScrollMode } from 'react-native-board-view';
import { generateNKeysBetween } from 'fractional-indexing';
import { type SpikeCard } from '../fixtures';
import { idsIn, useLocalBoard } from '../localBoard';
import { theme } from '../theme';
import { Button, CardFace, Screen, Stat } from '../ui';

const COLUMN_COUNT = 12;
const DEEP_INDEX = 24;

export function AutoScrollScreen({ onBack }: { onBack: () => void }) {
  const { width, height } = useWindowDimensions();
  const [mode, setMode] = useState<AutoScrollMode>('continuous');
  const [reachedColumn, setReachedColumn] = useState(false);
  const [reachedCard, setReachedCard] = useState(false);
  const [overshotColumn, setOvershotColumn] = useState(false);
  const [overshotCard, setOvershotCard] = useState(false);
  const columnWidth = mode === 'paged' ? width : Math.min(280, width * 0.72);
  const columnHeight = Math.max(240, height - 280);
  const columns = useMemo(
    () => Array.from({ length: COLUMN_COUNT }, (_, index) => ({ id: `c${index + 1}`, label: `Column ${index + 1}` })),
    [],
  );
  const initial = useMemo(() => build(columns.map((column) => column.id)), [columns]);
  const groupBy = useMemo(
    () => ({ columns: { key: 'status', values: columns } }),
    [columns],
  );
  const board = useLocalBoard(initial, groupBy);
  const targetX = (COLUMN_COUNT - 1) * columnWidth;
  const deepCards = board.projected.cellById.get(cellId('_', 'c1'))?.items ?? [];
  const targetY = deepCards.slice(0, DEEP_INDEX).reduce((sum, card) => sum + card.height + 8, 0);

  return (
    <Screen
      title="S4 auto-scroll"
      subtitle="Drag a card from column 1. Hold the right edge until column 12, then the bottom edge until a deep card. Lift when you arrive."
      onBack={onBack}
      footer={
        <View style={styles.footer}>
          <Stat label="Far column" value={reachedColumn ? 'reached' : 'not yet'} />
          <Stat label="Deep card" value={reachedCard ? 'reached' : 'not yet'} />
          <Stat label="Overshoot" value={overshotColumn || overshotCard ? 'yes' : 'no'} warn={overshotColumn || overshotCard} />
          <Button label={mode === 'paged' ? 'Paged' : 'Continuous'} onPress={() => setMode((value) => (value === 'paged' ? 'continuous' : 'paged'))} />
        </View>
      }
    >
      <BoardDragProvider>
        <DraxCellBoard
          horizontal
          mode={mode}
          pageSize={columnWidth}
          onHorizontalOffset={(offset) => {
            if (offset >= targetX - 24) setReachedColumn(true);
            if (offset > targetX + columnWidth * 0.45) setOvershotColumn(true);
          }}
          onTransfer={(event) => board.commit(event.itemId, event.fromCellId, event.toCellId, event.toIndex, event.rawToIndex)}
          onReorder={(event) => board.commit(event.itemId, event.cellId, event.cellId, event.toIndex)}
        >
          {columns.map((column) => {
            const id = cellId('_', column.id);
            const ids = idsIn(board.projected, id);
            return (
              <View key={id} style={[styles.column, { width: columnWidth, height: columnHeight }]}>
                <Text style={styles.header}>{column.label}</Text>
                <DraxCell
                  cellId={id}
                  itemIds={ids}
                  onVerticalOffset={
                    column.id === 'c1'
                      ? (offset) => {
                          if (offset >= Math.max(0, targetY - 20)) setReachedCard(true);
                          if (targetY > 0 && offset > targetY + 220) setOvershotCard(true);
                        }
                      : undefined
                  }
                  renderCard={(itemId) => {
                    const card = deepCards.find((item) => item.id === itemId) ?? findAny(board.projected.cells, itemId);
                    return <CardFace title={card?.title ?? itemId} height={card?.height ?? 72} />;
                  }}
                />
              </View>
            );
          })}
        </DraxCellBoard>
      </BoardDragProvider>
    </Screen>
  );
}

function build(statuses: string[]): SpikeCard[] {
  const ranks = generateNKeysBetween(null, null, 40 + statuses.length);
  const cards: SpikeCard[] = [];
  statuses.forEach((status, columnIndex) => {
    const count = columnIndex === 0 ? 36 : 1;
    for (let index = 0; index < count; index += 1) {
      const rankIndex = cards.length;
      cards.push({
        id: `${status}-${index + 1}`,
        title: columnIndex === 0 ? `Deep ${index + 1}` : `Card ${columnIndex + 1}`,
        rank: ranks[rankIndex] ?? `a${rankIndex}`,
        status,
        assignee: 'alice',
        height: 88,
      });
    }
  });
  return cards;
}

function findAny(cells: readonly { items: readonly SpikeCard[] }[], itemId: string): SpikeCard | undefined {
  for (const cell of cells) {
    const found = cell.items.find((item) => item.id === itemId);
    if (found) return found;
  }
  return undefined;
}

const styles = StyleSheet.create({
  column: { backgroundColor: theme.panel, marginRight: 8, borderRadius: 12, overflow: 'hidden' },
  header: { color: theme.text, fontWeight: '700', padding: 10 },
  footer: { flexDirection: 'row', gap: 8, padding: 12, flexWrap: 'wrap', alignItems: 'center' },
});
