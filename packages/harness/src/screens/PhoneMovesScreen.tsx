import { useCallback, useMemo, useRef, useState } from 'react';
import { Archive, UserPlus } from 'lucide-react-native';
import {
  Board,
  type BoardHandle,
  type BoardLayout,
  type CardAction,
  type CardActionEvent,
  type CardRenderInfo,
} from 'react-native-board-view';
import { kanbanGroupBy, makeTasks, type Task } from '../data';
import { taskId, taskLabel } from '../ids';
import { ActionButton, EventLog, Screen, Segmented, TaskCard, Toggle, usePalette } from '../ui';
import { useTaskStore } from '../useTaskStore';

const LAYOUTS = [
  { label: 'Auto', value: 'auto' },
  { label: 'Paged', value: 'paged' },
  { label: 'Multi', value: 'multi' },
  { label: 'Fit', value: 'fit' },
] as const;

const ME = 'alice';
const NO_LONG_PRESS_SHEET = { longPressSheet: false } as const;

function seed(): Task[] {
  return makeTasks(30, { seed: 11 });
}

/**
 * 0.6.0: the drop dock, undo, the pinch-in overview and hidden empty columns.
 * Archive and Assign to me are app actions: the board only reports them.
 */
export function PhoneMovesScreen({ onBack }: { onBack: () => void }) {
  const palette = usePalette();
  const board = useRef<BoardHandle>(null);
  const [layout, setLayout] = useState<BoardLayout>('auto');
  const [dock, setDock] = useState(true);
  const [undo, setUndo] = useState(true);
  const [longPressSheet, setLongPressSheet] = useState(true);
  const [mine, setMine] = useState(false);
  const [overview, setOverview] = useState(false);
  const store = useTaskStore(seed, kanbanGroupBy);
  const { setItems, push } = store;

  const actions = useMemo<CardAction[]>(
    () => [
      {
        key: 'archive',
        label: 'Archive',
        icon: <Archive color={palette.bad} size={18} strokeWidth={2.2} />,
        color: palette.bad,
      },
      { key: 'mine', label: 'Assign to me', icon: <UserPlus color={palette.text} size={18} strokeWidth={2.2} /> },
    ],
    [palette.bad, palette.text],
  );
  const onCardAction = useCallback(
    ({ action, item, source }: CardActionEvent<Task>) => {
      if (action === 'archive') {
        setItems((current) => current.filter((task) => task.id !== item.id));
        push(`Archived ${item.title} (${source})`, 'bad', Archive);
      } else if (action === 'mine') {
        setItems((current) => current.map((task) => (task.id === item.id ? { ...task, assignee: ME } : task)));
        push(`Assigned ${item.title} to Alice (${source})`, 'good', UserPlus);
      }
    },
    [push, setItems],
  );
  const canPerformAction = useCallback((item: Task, action: string) => action !== 'mine' || item.assignee !== ME, []);

  const items = useMemo(
    () => (mine ? store.items.filter((task) => task.assignee === ME) : store.items),
    [mine, store.items],
  );
  const renderCard = useCallback((info: CardRenderInfo<Task>) => <TaskCard info={info} variant="rich" />, []);

  return (
    <Screen
      title="Phone moves"
      subtitle="Lift a card: the dock slides up. Drop on a column chip, Archive or Assign. Undo from the banner. Pinch in for the overview."
      onBack={onBack}
      toolbar={
        <>
          <Segmented label="Layout" options={LAYOUTS} value={layout} onChange={setLayout} />
          <Toggle label="Dock" value={dock} onChange={setDock} />
          <Toggle label="Undo banner" value={undo} onChange={setUndo} />
          <Toggle label="Long-press sheet" value={longPressSheet} onChange={setLongPressSheet} />
          <Toggle label="Only mine (hide empty)" value={mine} onChange={setMine} />
          <ActionButton
            label={overview ? 'Close overview' : 'Overview'}
            tone="accent"
            onPress={() => board.current?.setOverview(!overview)}
          />
          <ActionButton label="Undo" onPress={() => board.current?.undo()} />
          <ActionButton label="Reset" onPress={store.reset} />
        </>
      }
      footer={<EventLog entries={store.log} height={96} empty="Moves and actions show up here." />}
    >
      <Board
        ref={board}
        items={items}
        getItemId={taskId}
        getItemLabel={taskLabel}
        groupBy={kanbanGroupBy}
        onMove={store.onMove}
        renderCard={renderCard}
        layout={layout}
        dock={dock}
        moveModes={longPressSheet ? undefined : NO_LONG_PRESS_SHEET}
        undo={undo}
        cardActions={actions}
        canPerformAction={canPerformAction}
        onCardAction={onCardAction}
        hideEmptyColumns={mine}
        overview
        onOverviewChange={setOverview}
        appearance={palette.dark ? 'dark' : 'light'}
      />
    </Screen>
  );
}
