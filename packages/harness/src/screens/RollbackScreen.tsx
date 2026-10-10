import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Board, type CardRenderInfo } from 'react-native-board-view';
import { kanbanGroupBy, makeTasks, type Task } from '../data';
import { taskId, taskLabel } from '../ids';
import { EventLog, Screen, Segmented, TaskCard, usePalette } from '../ui';
import { useTaskStore } from '../useTaskStore';

function seed(): Task[] {
  return makeTasks(14, { seed: 21, statuses: ['todo', 'doing', 'review', 'done'] });
}

export function RollbackScreen({ onBack }: { onBack: () => void }) {
  const palette = usePalette();
  const [latencyMs, setLatency] = useState(800);
  const [failureRate, setFailure] = useState(1);
  const store = useTaskStore(seed, kanbanGroupBy, { latencyMs, failureRate });
  const renderCard = useCallback((info: CardRenderInfo<Task>) => <TaskCard info={info} variant="compact" />, []);

  return (
    <Screen
      title="Optimistic moves"
      subtitle="Cards move instantly and show a dot while saving. A rejection puts the card back and is announced. Drag one card twice quickly: the second save waits for the first."
      onBack={onBack}
      toolbar={
        <>
          <Segmented
            label="Server delay"
            options={[
              { label: '0', value: 0 },
              { label: '300ms', value: 300 },
              { label: '800ms', value: 800 },
              { label: '2s', value: 2000 },
            ]}
            value={latencyMs}
            onChange={setLatency}
          />
          <Segmented
            label="Rejects"
            options={[
              { label: '0%', value: 0 },
              { label: '30%', value: 0.3 },
              { label: '100%', value: 1 },
            ]}
            value={failureRate}
            onChange={setFailure}
          />
        </>
      }
      footer={<EventLog entries={store.log} />}
    >
      <View style={styles.fill}>
        <Board
          items={store.items}
          getItemId={taskId}
          getItemLabel={taskLabel}
          groupBy={kanbanGroupBy}
          onMove={store.onMove}
          renderCard={renderCard}
          appearance={palette.dark ? 'dark' : 'light'}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
