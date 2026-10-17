import { useCallback, useState } from 'react';
import { Board, NO_VALUE_ID, fractionalRank, type BoardLayout, type CardRenderInfo } from 'react-native-board-view';
import { STATUSES, kanbanGroupBy, makeTasks, type Task } from '../data';
import { taskId, taskLabel } from '../ids';
import { Screen, Segmented, TaskCard, Toggle, usePalette, type CardStyle } from '../ui';
import { useTaskStore } from '../useTaskStore';

const MODES = {
  'auto-swipe': { swipe: 'auto' },
  'auto-noswipe': {},
  'handle-swipe': { drag: 'handle', swipe: 'auto' },
  'handle-noswipe': { drag: 'handle' },
} as const;

const LAYOUTS = [
  { label: 'Auto', value: 'auto' },
  { label: 'Paged', value: 'paged' },
  { label: 'Multi', value: 'multi' },
  { label: 'Fit', value: 'fit' },
  { label: 'Stacked', value: 'stacked' },
] as const;

function seed(): Task[] {
  // The last two tasks have no status, so they land in the automatic "No value" column.
  return makeTasks(36, { seed: 3 }).map((task, index) => (index >= 34 ? { ...task, status: null } : task));
}

export function KanbanScreen({ onBack, initialLayout = 'auto' }: { onBack: () => void; initialLayout?: BoardLayout }) {
  const palette = usePalette();
  const [layout, setLayout] = useState<BoardLayout>(initialLayout);
  const [density, setDensity] = useState<'comfortable' | 'compact'>('comfortable');
  const [pager, setPager] = useState<'tabs' | 'dots' | 'none'>('tabs');
  const [cardStyle, setCardStyle] = useState<CardStyle>('rich');
  const [collapsible, setCollapsible] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);
  const [swipe, setSwipe] = useState(true);
  const [readOnly, setReadOnly] = useState(false);
  const [dragFrom, setDragFrom] = useState<'auto' | 'handle'>('auto');
  const [columnId, setColumnId] = useState('backlog');
  const [loaded, setLoaded] = useState<string | null>(null);
  const store = useTaskStore(seed, kanbanGroupBy);
  const setItems = store.setItems;
  const onEndReached = useCallback(
    (id: string) => {
      setItems((current) => {
        const status = id === NO_VALUE_ID ? null : id;
        const last = current.reduce<string | null>((end, task) => {
          if (task.status !== status) return end;
          return end === null || task.rank > end ? task.rank : end;
        }, null);
        const task: Task = {
          id: `loaded-${id}-${current.length}`,
          title: 'Loaded from the end of the column',
          rank: fractionalRank.between(last, null),
          status,
          assignee: null,
          tags: [],
          priority: 'low',
        };
        return [...current, task];
      });
      setLoaded(id);
    },
    [setItems],
  );
  const renderCard = useCallback(
    (info: CardRenderInfo<Task>) => <TaskCard info={info} variant={cardStyle} handle={dragFrom === 'handle'} />,
    [cardStyle, dragFrom],
  );

  return (
    <Screen
      title="Kanban"
      subtitle={
        loaded
          ? `Loaded a card into ${STATUSES.find((status) => status.id === loaded)?.label ?? 'No value'}. Scroll that column to the end to load another.`
          : 'Flat tasks grouped by status. Long-press to drag, tap … to move, or swipe sideways on wide layouts.'
      }
      onBack={onBack}
      toolbar={
        <>
          <Segmented label="Layout" options={LAYOUTS} value={layout} onChange={setLayout} />
          <Segmented
            label="Pager"
            options={[
              { label: 'Tabs', value: 'tabs' },
              { label: 'Dots', value: 'dots' },
              { label: 'None', value: 'none' },
            ]}
            value={pager}
            onChange={setPager}
          />
          <Segmented
            label="Density"
            options={[
              { label: 'Comfy', value: 'comfortable' },
              { label: 'Compact', value: 'compact' },
            ]}
            value={density}
            onChange={setDensity}
          />
          <Segmented
            label="Cards"
            options={[
              { label: 'Rich', value: 'rich' },
              { label: 'Compact', value: 'compact' },
              { label: 'Minimal', value: 'minimal' },
            ]}
            value={cardStyle}
            onChange={setCardStyle}
          />
          <Segmented
            label="Drag from"
            options={[
              { label: 'Long-press', value: 'auto' },
              { label: 'Handle', value: 'handle' },
            ]}
            value={dragFrom}
            onChange={setDragFrom}
          />
          <Toggle label="Collapsible" value={collapsible} onChange={setCollapsible} />
          <Toggle label="Auto-scroll" value={autoScroll} onChange={setAutoScroll} />
          <Toggle label="Swipe (multi, fit)" value={swipe} onChange={setSwipe} />
          <Toggle label="Read only" value={readOnly} onChange={setReadOnly} />
          <Segmented
            label="Column"
            options={STATUSES.map((status) => ({ label: status.label, value: status.id }))}
            value={columnId}
            onChange={setColumnId}
          />
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
        pagerIndicator={pager}
        density={density}
        collapsibleColumns={collapsible}
        autoScroll={autoScroll}
        moveModes={MODES[`${dragFrom}-${swipe ? 'swipe' : 'noswipe'}`]}
        readOnly={readOnly}
        columnId={columnId}
        onColumnChange={setColumnId}
        onEndReached={onEndReached}
        appearance={palette.dark ? 'dark' : 'light'}
      />
    </Screen>
  );
}
