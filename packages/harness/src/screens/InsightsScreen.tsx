import { useCallback, useState } from 'react';
import {
  Board,
  type BoardLayout,
  type CardRenderInfo,
  type MotionPreset,
  type ThemePresetName,
} from 'react-native-board-view';
import { kanbanGroupBy, makeTasks, type Task } from '../data';
import { taskId, taskLabel } from '../ids';
import { Screen, Segmented, TaskCard, Toggle, usePalette } from '../ui';
import { useTaskStore } from '../useTaskStore';

const LIMITS = { todo: 8, doing: 13, review: 2 };
const LAYOUTS = [
  { label: 'Auto', value: 'auto' },
  { label: 'Multi', value: 'multi' },
  { label: 'Fit', value: 'fit' },
  { label: 'Stacked', value: 'stacked' },
] as const;
type Focus = 'all' | 'urgent' | 'mine';

function seed(): Task[] {
  return makeTasks(40, { seed: 21 });
}

const money = (value: number) =>
  value >= 1000 ? `$${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k` : `$${Math.round(value)}`;
const amountOf = (task: Task) => task.amount ?? null;
const ageOf = (task: Task) => task.ageDays ?? null;
const SPOTLIGHT: Record<Focus, ((task: Task) => boolean) | undefined> = {
  all: undefined,
  urgent: (task) => task.priority === 'urgent' || task.priority === 'high',
  mine: (task) => task.assignee === 'alice',
};

/**
 * 0.7.0: data shown at a glance. WIP limits with meters, column value sums,
 * a spotlight that fades the rest, card ageing, theme and motion presets.
 */
export function InsightsScreen({ onBack }: { onBack: () => void }) {
  const palette = usePalette();
  const [layout, setLayout] = useState<BoardLayout>('auto');
  const [focus, setFocus] = useState<Focus>('all');
  const [block, setBlock] = useState(false);
  const [preset, setPreset] = useState<ThemePresetName>('standard');
  const [motion, setMotion] = useState<MotionPreset>('standard');
  const store = useTaskStore(seed, kanbanGroupBy);
  const renderCard = useCallback((info: CardRenderInfo<Task>) => <TaskCard info={info} variant="rich" />, []);

  return (
    <Screen
      title="Insights"
      subtitle="Limits: To do 8, In progress 13, Review 2. Headers sum deal sizes. Old cards show their age. Spotlight fades the rest."
      onBack={onBack}
      toolbar={
        <>
          <Segmented
            label="Spotlight"
            options={[
              { label: 'All', value: 'all' },
              { label: 'Urgent', value: 'urgent' },
              { label: 'Alice', value: 'mine' },
            ]}
            value={focus}
            onChange={setFocus}
          />
          <Toggle label="Block when full" value={block} onChange={setBlock} />
          <Segmented
            label="Theme"
            options={[
              { label: 'Standard', value: 'standard' },
              { label: 'Paper', value: 'paper' },
              { label: 'Slate', value: 'slate' },
              { label: 'Aurora', value: 'aurora' },
            ]}
            value={preset}
            onChange={setPreset}
          />
          <Segmented
            label="Motion"
            options={[
              { label: 'Standard', value: 'standard' },
              { label: 'Calm', value: 'calm' },
              { label: 'Snappy', value: 'snappy' },
              { label: 'Playful', value: 'playful' },
            ]}
            value={motion}
            onChange={setMotion}
          />
          <Segmented label="Layout" options={LAYOUTS} value={layout} onChange={setLayout} />
        </>
      }
    >
      <Board
        items={store.items}
        getItemId={taskId}
        getItemLabel={taskLabel}
        groupBy={kanbanGroupBy}
        onMove={store.onMove}
        renderCard={renderCard}
        layout={layout}
        columnLimits={LIMITS}
        limitBehavior={block ? 'block' : 'warn'}
        getItemValue={amountOf}
        formatValue={money}
        spotlight={SPOTLIGHT[focus]}
        getItemAge={ageOf}
        staleAfterDays={10}
        themePreset={preset}
        motion={motion}
        appearance={palette.dark ? 'dark' : 'light'}
      />
    </Screen>
  );
}
