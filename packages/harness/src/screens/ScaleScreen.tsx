import { useMemo } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { BoardDragProvider, DraxCell, DraxCellBoard, cellId } from 'react-native-board-view';
import { makeCards, reviewColumns, type SpikeCard } from '../fixtures';
import { idsIn, useLocalBoard } from '../localBoard';
import { theme } from '../theme';
import { CardFace, DropLog, FpsMeter, Screen, Stat } from '../ui';
import type { GroupBy } from 'react-native-board-view';

const groupBy: GroupBy<SpikeCard> = { columns: reviewColumns };

export function ScaleScreen({ onBack }: { onBack: () => void }) {
  const { width, height } = useWindowDimensions();
  const initial = useMemo(
    () => makeCards(2000, reviewColumns.values.map((column) => column.id), ['alice'], 11),
    [],
  );
  const board = useLocalBoard(initial, groupBy);
  const columnWidth = Math.min(320, Math.max(260, width * 0.78));
  const columnHeight = Math.max(280, height - 230);
  return (
    <Screen
      title="S3 scale"
      subtitle="Four FlashList columns, 500 cards each, heights 60–220. Scroll, then drag. Judge FPS on a release build."
      onBack={onBack}
      footer={
        <View>
          <View style={styles.stats}>
            <Stat label="Mismatches" value={String(board.tallies.mismatch)} warn={board.tallies.mismatch > 0} />
            <Stat label="Drops" value={String(board.tallies.empty + board.tallies.occupied)} />
          </View>
          <DropLog entries={board.log} />
        </View>
      }
    >
      <FpsMeter />
      <BoardDragProvider>
        <DraxCellBoard
          horizontal
          mode="continuous"
          pageSize={columnWidth}
          onTransfer={(event) => board.commit(event.itemId, event.fromCellId, event.toCellId, event.toIndex, event.rawToIndex)}
          onReorder={(event) => board.commit(event.itemId, event.cellId, event.cellId, event.toIndex)}
        >
          {reviewColumns.values.map((column) => {
            const id = cellId('_', column.id);
            const ids = idsIn(board.projected, id);
            return (
              <View key={id} style={[styles.column, { width: columnWidth, height: columnHeight }]}>
                <Text style={styles.header}>
                  {column.label} · {ids.length}
                </Text>
                <DraxCell
                  cellId={id}
                  itemIds={ids}
                  renderCard={(itemId) => {
                    const card = findCard(board.projected.cells, itemId);
                    return <CardFace title={card?.title ?? itemId} detail={card ? `${card.height}px` : undefined} height={card?.height} />;
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

function findCard(cells: readonly { items: readonly SpikeCard[] }[], itemId: string): SpikeCard | undefined {
  for (const cell of cells) {
    const found = cell.items.find((item) => item.id === itemId);
    if (found) return found;
  }
  return undefined;
}

const styles = StyleSheet.create({
  column: { backgroundColor: theme.panel, margin: 8, borderRadius: 12, overflow: 'hidden' },
  header: { color: theme.text, fontWeight: '700', padding: 10 },
  stats: { flexDirection: 'row', gap: 8, paddingHorizontal: 16 },
});
