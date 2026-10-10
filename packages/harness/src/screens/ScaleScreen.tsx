import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Board, type BoardLayout, type CardRenderInfo, type GroupBy } from 'react-native-board-view';
import { STATUSES, makeTasks, type Task } from '../data';
import { taskId, taskLabel } from '../ids';
import { EventLog, FpsMeter, Screen, Segmented, TaskCard, usePalette } from '../ui';
import { useTaskStore } from '../useTaskStore';

const COLUMNS = STATUSES.slice(1, 5);
const groupBy: GroupBy<Task> = { columns: { key: 'status', values: COLUMNS } };

function seed(): Task[] {
  // 2,000 tasks dealt round-robin: exactly 500 per column, heights 60–220.
  return makeTasks(2000, { seed: 77, heights: { min: 60, max: 220 } }).map((task, index) => ({
    ...task,
    status: COLUMNS[index % COLUMNS.length]?.id ?? null,
  }));
}

export function ScaleScreen({ onBack }: { onBack: () => void }) {
  const palette = usePalette();
  const [layout, setLayout] = useState<BoardLayout>('auto');
  const store = useTaskStore(seed, groupBy);
  const renderCard = useCallback((info: CardRenderInfo<Task>) => <TaskCard info={info} variant="minimal" />, []);
  return (
    <Screen
      title="S3 · 4 × 500 cards"
      subtitle="FlashList columns, card heights 60–220. Scroll deep, then drag between columns. Judge FPS on a release build."
      onBack={onBack}
      toolbar={
        <Segmented
          label="Layout"
          options={[
            { label: 'Auto', value: 'auto' },
            { label: 'Paged', value: 'paged' },
            { label: 'Multi', value: 'multi' },
            { label: 'Stacked', value: 'stacked' },
          ]}
          value={layout}
          onChange={setLayout}
        />
      }
      footer={<EventLog entries={store.log} height={80} />}
    >
      <View style={styles.fill}>
        <Board
          items={store.items}
          getItemId={taskId}
          getItemLabel={taskLabel}
          groupBy={groupBy}
          onMove={store.onMove}
          renderCard={renderCard}
          layout={layout}
          appearance={palette.dark ? 'dark' : 'light'}
        />
        <FpsMeter />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
