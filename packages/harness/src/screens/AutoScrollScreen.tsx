import { useCallback, useState } from 'react';
import {
  Board,
  fractionalRank,
  type BoardLayout,
  type CardRenderInfo,
  type GroupBy,
  type GroupValue,
} from 'react-native-board-view';
import type { Task } from '../data';
import { taskId, taskLabel } from '../ids';
import { EventLog, Screen, Segmented, Stat, TaskCard, usePalette } from '../ui';
import { useTaskStore } from '../useTaskStore';

const COLUMNS: GroupValue[] = Array.from({ length: 12 }, (_, index) => ({
  id: `c${index + 1}`,
  label: `Column ${index + 1}`,
}));
const groupBy: GroupBy<Task> = { columns: { key: 'status', values: COLUMNS } };
const DEEP = 60;

function seed(): Task[] {
  const total = DEEP + (COLUMNS.length - 1) * 2;
  const ranks = fractionalRank.nBetween(null, null, total);
  return ranks.map((rank, index) => {
    const column = index < DEEP ? 0 : 1 + Math.floor((index - DEEP) / 2);
    return {
      id: `s${index}`,
      title: index < DEEP ? `Deep card ${index + 1}` : `Card in column ${column + 1}`,
      rank,
      status: COLUMNS[column]?.id ?? null,
      assignee: null,
      tags: [],
      priority: 'medium',
      height: 88,
    };
  });
}

export function AutoScrollScreen({ onBack }: { onBack: () => void }) {
  const palette = usePalette();
  const [layout, setLayout] = useState<BoardLayout>('auto');
  const [column, setColumn] = useState('c1');
  const store = useTaskStore(seed, groupBy);
  const renderCard = useCallback((info: CardRenderInfo<Task>) => <TaskCard info={info} variant="minimal" />, []);
  return (
    <Screen
      title="S4 · Auto-scroll"
      subtitle="Hold a card at the right edge to travel to column 12 (paged: dwell to flip a page). Hold at the bottom of column 1 to reach the deep cards. Release anywhere: no overshoot."
      onBack={onBack}
      toolbar={
        <>
          <Segmented
            label="Layout"
            options={[
              { label: 'Auto', value: 'auto' },
              { label: 'Paged', value: 'paged' },
              { label: 'Multi', value: 'multi' },
            ]}
            value={layout}
            onChange={setLayout}
          />
          <Stat label="Page" value={column.toUpperCase()} />
        </>
      }
      footer={<EventLog entries={store.log} height={80} />}
    >
      <Board
        items={store.items}
        getItemId={taskId}
        getItemLabel={taskLabel}
        groupBy={groupBy}
        onMove={store.onMove}
        renderCard={renderCard}
        layout={layout}
        pagerIndicator="dots"
        onColumnChange={setColumn}
        appearance={palette.dark ? 'dark' : 'light'}
      />
    </Screen>
  );
}
