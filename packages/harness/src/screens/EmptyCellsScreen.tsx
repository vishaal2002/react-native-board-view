import { useCallback, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Board,
  fractionalRank,
  projectBoard,
  type BoardLayout,
  type CardRenderInfo,
  type GroupBy,
  type MoveOperation,
} from 'react-native-board-view';
import { PEOPLE, STATUSES, type Task } from '../data';
import { taskId, taskLabel, taskRank } from '../ids';
import { EventLog, Screen, Segmented, Stat, TaskCard, usePalette } from '../ui';
import { useTaskStore } from '../useTaskStore';

const groupBy: GroupBy<Task> = {
  columns: { key: 'status', values: STATUSES.slice(1, 4) },
  lanes: { key: 'assignee', values: PEOPLE.slice(0, 3) },
};

function seed(): Task[] {
  const rows: [string, string, string][] = [
    ['Spec', 'todo', 'alice'],
    ['Copy', 'todo', 'alice'],
    ['Review notes', 'review', 'alice'],
    ['QA pass', 'doing', 'bob'],
    ['Icons', 'todo', 'cara'],
    ['Empty check', 'review', 'cara'],
  ];
  const ranks = fractionalRank.nBetween(null, null, rows.length);
  return rows.map(([title, status, assignee], index) => ({
    id: `e${index}`,
    title,
    rank: ranks[index] ?? 'a0',
    status,
    assignee,
    tags: [],
    priority: 'medium',
  }));
}

export function EmptyCellsScreen({ onBack }: { onBack: () => void }) {
  const palette = usePalette();
  const [layout, setLayout] = useState<BoardLayout>('fit');
  const store = useTaskStore(seed, groupBy);
  const [tally, setTally] = useState({ empty: 0, occupied: 0, mismatch: 0 });
  const itemsRef = useRef(store.items);
  itemsRef.current = store.items;
  const { onMove: save } = store;

  // Checks every drop: a drop into an empty cell must land at index 0.
  const onMove = useCallback(
    async (op: MoveOperation) => {
      const before = projectBoard({
        items: itemsRef.current,
        getItemId: taskId,
        getRank: taskRank,
        groupBy,
        overlays: [op],
      });
      const at = before.locations.get(op.id);
      const cell = at ? before.cellById.get(at.cellId) : undefined;
      const wasEmpty = cell != null && cell.items.length === 1;
      await save(op);
      setTally((current) => ({
        empty: current.empty + (wasEmpty ? 1 : 0),
        occupied: current.occupied + (wasEmpty ? 0 : 1),
        mismatch: current.mismatch + (wasEmpty && at?.index !== 0 ? 1 : 0),
      }));
    },
    [save],
  );
  const renderCard = useCallback((info: CardRenderInfo<Task>) => <TaskCard info={info} variant="minimal" />, []);

  return (
    <Screen
      title="S2 · Empty cells"
      subtitle="3 × 3 grid with empty cells. Make 20 drops into empty cells and 20 into occupied ones. Mismatches must stay 0."
      onBack={onBack}
      toolbar={
        <>
          <Segmented
            label="Layout"
            options={[
              { label: 'Fit', value: 'fit' },
              { label: 'Paged', value: 'paged' },
              { label: 'Stacked', value: 'stacked' },
            ]}
            value={layout}
            onChange={setLayout}
          />
          <Stat label="Empty drops" value={String(tally.empty)} />
          <Stat label="Occupied" value={String(tally.occupied)} />
          <Stat label="Mismatches" value={String(tally.mismatch)} tone={tally.mismatch > 0 ? 'bad' : 'good'} />
        </>
      }
      footer={<EventLog entries={store.log} height={80} />}
    >
      <View style={styles.fill}>
        <Board
          items={store.items}
          getItemId={taskId}
          getItemLabel={taskLabel}
          groupBy={groupBy}
          onMove={onMove}
          renderCard={renderCard}
          layout={layout}
          appearance={palette.dark ? 'dark' : 'light'}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
