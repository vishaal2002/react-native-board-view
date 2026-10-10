import { memo, useCallback, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Board, type BoardLayout, type CardRenderInfo, type GroupBy } from 'react-native-board-view';
import { STATUSES, makeTasks, type Task } from '../data';
import { taskId, taskLabel } from '../ids';
import { EventLog, FpsMeter, Screen, Segmented, TaskCard, Toggle, usePalette } from '../ui';
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

/** Burns ~2 ms of JS per render: a stand-in for an expensive app card. */
const SlowCard = memo(function SlowCard({ info }: { info: CardRenderInfo<Task> }) {
  const until = Date.now() + 2;
  while (Date.now() < until) {
    // busy-wait
  }
  return <TaskCard info={info} variant="minimal" />;
});

export function ScaleScreen({ onBack }: { onBack: () => void }) {
  const palette = usePalette();
  const [layout, setLayout] = useState<BoardLayout>('auto');
  const store = useTaskStore(seed, groupBy);
  const [slow, setSlow] = useState(false);
  // Placeholder moves per drag: a stable drag moves it only when the finger crosses a card.
  const drag = useRef({ moves: 0, started: 0 });
  const [lastDrag, setLastDrag] = useState<string | null>(null);
  const onDragStart = useCallback(() => {
    drag.current = { moves: 0, started: Date.now() };
  }, []);
  const onDragOver = useCallback(() => {
    drag.current.moves += 1;
  }, []);
  const onDragEnd = useCallback(() => {
    const seconds = (Date.now() - drag.current.started) / 1000;
    setLastDrag(`Last drag: ${drag.current.moves} slot changes in ${seconds.toFixed(1)} s`);
  }, []);
  const renderCard = useCallback(
    (info: CardRenderInfo<Task>) => (slow ? <SlowCard info={info} /> : <TaskCard info={info} variant="minimal" />),
    [slow],
  );
  return (
    <Screen
      title="S3 · 4 × 500 cards"
      subtitle="FlashList columns, card heights 60–220. Scroll deep, then drag between columns. Judge FPS on a release build."
      onBack={onBack}
      toolbar={
        <>
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
          <Toggle label="Slow cards (2 ms)" value={slow} onChange={setSlow} />
        </>
      }
      footer={
        <>
          {lastDrag ? <Text style={[styles.stat, { color: palette.muted }]}>{lastDrag}</Text> : null}
          <EventLog entries={store.log} height={80} />
        </>
      }
    >
      <View style={styles.fill}>
        <Board
          items={store.items}
          getItemId={taskId}
          getItemLabel={taskLabel}
          groupBy={groupBy}
          onMove={store.onMove}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
          renderCard={renderCard}
          layout={layout}
          appearance={palette.dark ? 'dark' : 'light'}
        />
        <FpsMeter />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 }, stat: { fontSize: 12, fontWeight: '600', paddingBottom: 4 } });
