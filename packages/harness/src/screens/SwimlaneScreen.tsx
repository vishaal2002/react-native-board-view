import { useCallback, useMemo, useState } from 'react';
import { Board, type BoardLayout, type CardRenderInfo } from 'react-native-board-view';
import { PEOPLE, makeTasks, swimlaneGroupBy, type Task } from '../data';
import { taskId, taskLabel } from '../ids';
import { ActionButton, Screen, Segmented, TaskCard, usePalette } from '../ui';
import { useTaskStore } from '../useTaskStore';

const LAYOUTS = [
  { label: 'Auto', value: 'auto' },
  { label: 'Paged', value: 'paged' },
  { label: 'Multi', value: 'multi' },
  { label: 'Fit', value: 'fit' },
  { label: 'Stacked', value: 'stacked' },
] as const;

const labels = { noValue: 'Unassigned' };

function seed(): Task[] {
  return makeTasks(64, {
    seed: 11,
    assignees: [...PEOPLE.map((person) => person.id), null],
  });
}

export function SwimlaneScreen({
  onBack,
  initialLayout = 'auto',
}: {
  onBack: () => void;
  initialLayout?: BoardLayout;
}) {
  const palette = usePalette();
  const [layout, setLayout] = useState<BoardLayout>(initialLayout);
  const [limit, setLimit] = useState(4);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const store = useTaskStore(seed, swimlaneGroupBy);
  const laneIds = useMemo(() => [...PEOPLE.map((person) => person.id), '__no_value__'], []);
  const renderCard = useCallback((info: CardRenderInfo<Task>) => <TaskCard info={info} variant="compact" />, []);

  return (
    <Screen
      title="Swimlanes"
      subtitle="Status columns × assignee lanes. A drop across lanes changes two fields in one move."
      onBack={onBack}
      toolbar={
        <>
          <Segmented label="Layout" options={LAYOUTS} value={layout} onChange={setLayout} />
          <Segmented
            label="Cards per cell"
            options={[
              { label: '2', value: 2 },
              { label: '4', value: 4 },
              { label: '50', value: 50 },
            ]}
            value={limit}
            onChange={setLimit}
          />
          <ActionButton label="Collapse all" onPress={() => setCollapsed(laneIds)} />
          <ActionButton label="Expand all" onPress={() => setCollapsed([])} />
        </>
      }
    >
      <Board
        items={store.items}
        getItemId={taskId}
        getItemLabel={taskLabel}
        groupBy={swimlaneGroupBy}
        onMove={store.onMove}
        renderCard={renderCard}
        layout={layout}
        cellLimit={limit}
        collapsedLanes={collapsed}
        onCollapsedLanesChange={setCollapsed}
        labels={labels}
        appearance={palette.dark ? 'dark' : 'light'}
      />
    </Screen>
  );
}
