import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { generateNKeysBetween } from 'fractional-indexing';
import { cellId } from 'react-native-board-view';
import { BoardDragProvider, DraxCell, DraxCellBoard } from 'react-native-board-view';
import { laneGroup, type SpikeCard } from '../fixtures';
import { idsIn, useLocalBoard } from '../localBoard';
import { theme } from '../theme';
import { Button, CardFace, DropLog, Screen, Stat } from '../ui';

function seed(): SpikeCard[] {
  const ranks = generateNKeysBetween(null, null, 6);
  const rows: Array<[string, string, string, string]> = [
    ['a1', 'Spec', 'todo', 'alice'],
    ['a2', 'Copy', 'todo', 'alice'],
    ['a3', 'Review notes', 'done', 'alice'],
    ['b1', 'QA pass', 'doing', 'bob'],
    ['c1', 'Icons', 'todo', 'cara'],
    ['c2', 'Empty check', 'done', 'cara'],
  ];
  return rows.map((row, index) => ({
    id: row[0],
    title: row[1],
    status: row[2],
    assignee: row[3],
    rank: ranks[index] ?? `a${index}`,
    height: 64,
  }));
}

export function EmptyDropScreen({ onBack }: { onBack: () => void }) {
  const initial = useMemo(seed, []);
  const board = useLocalBoard(initial, laneGroup);
  return (
    <Screen
      title="S2 empty cells"
      subtitle="Drop into empty and occupied cells. An empty drop must report index 0."
      onBack={onBack}
      footer={
        <View>
          <View style={styles.stats}>
            <Stat label="Empty drops" value={String(board.tallies.empty)} />
            <Stat label="Occupied" value={String(board.tallies.occupied)} />
            <Stat label="Mismatches" value={String(board.tallies.mismatch)} warn={board.tallies.mismatch > 0} />
            <Button label="Reset" onPress={board.reset} />
          </View>
          <DropLog entries={board.log} />
        </View>
      }
    >
      <BoardDragProvider>
        <DraxCellBoard
          onTransfer={(event) => board.commit(event.itemId, event.fromCellId, event.toCellId, event.toIndex, event.rawToIndex)}
          onReorder={(event) => board.commit(event.itemId, event.cellId, event.cellId, event.toIndex, event.toIndex)}
        >
          <View style={styles.grid}>
            {laneGroup.lanes?.values.map((lane) => (
              <View key={lane.id} style={styles.lane}>
                <Text style={styles.laneLabel}>{lane.label}</Text>
                <View style={styles.columns}>
                  {laneGroup.columns.values.map((column) => {
                    const id = cellId(lane.id, column.id);
                    const ids = idsIn(board.projected, id);
                    return (
                      <View key={id} style={styles.cell}>
                        <Text style={styles.cellLabel}>
                          {column.label} · {ids.length === 0 ? 'empty' : ids.length}
                        </Text>
                        <DraxCell
                          cellId={id}
                          itemIds={ids}
                          minHeight={96}
                          renderCard={(itemId) => {
                            const card = board.projected.cells.flatMap((cell) => cell.items).find((item) => item.id === itemId);
                            return <CardFace title={card?.title ?? itemId} />;
                          }}
                        />
                      </View>
                    );
                  })}
                </View>
              </View>
            ))}
          </View>
        </DraxCellBoard>
      </BoardDragProvider>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flex: 1 },
  lane: { flex: 1, paddingHorizontal: 8 },
  laneLabel: { color: theme.accent, fontSize: 12, fontWeight: '700' },
  columns: { flex: 1, flexDirection: 'row', gap: 6 },
  cell: { flex: 1, backgroundColor: theme.panel, borderRadius: 10, overflow: 'hidden' },
  cellLabel: { color: theme.muted, fontSize: 11, padding: 6 },
  stats: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, alignItems: 'center', flexWrap: 'wrap' },
});
