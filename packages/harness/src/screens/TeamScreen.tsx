import { useCallback, useMemo, useRef, useState } from 'react';
import { Archive, Users } from 'lucide-react-native';
import {
  Board,
  fractionalRank,
  type BoardHandle,
  type BoardLayout,
  type CardAction,
  type CardActionEvent,
  type CardRenderInfo,
  type GroupBy,
  type GroupValue,
} from 'react-native-board-view';
import { PEOPLE, STATUSES, makeTasks, personName, type Task } from '../data';
import { taskId, taskLabel } from '../ids';
import { ActionButton, EventLog, Screen, Segmented, TaskCard, Toggle, usePalette } from '../ui';
import { useTaskStore } from '../useTaskStore';

const LAYOUTS = [
  { label: 'Paged', value: 'paged' },
  { label: 'Multi', value: 'multi' },
  { label: 'Stacked', value: 'stacked' },
] as const;

function seed(): Task[] {
  return makeTasks(28, { seed: 19 });
}

/** Values in the order of `ids`; the board only reports an order, the app keeps it. */
function ordered(values: readonly GroupValue[], ids: readonly string[]): GroupValue[] {
  return ids.map((id) => values.find((value) => value.id === id)).filter((value): value is GroupValue => value != null);
}

/**
 * 0.8.0: select several cards and move them together, reorder columns and
 * lanes from their headers, and watch a teammate's move flash in.
 */
export function TeamScreen({ onBack }: { onBack: () => void }) {
  const palette = usePalette();
  const board = useRef<BoardHandle>(null);
  const [layout, setLayout] = useState<BoardLayout>('paged');
  const [lanes, setLanes] = useState(false);
  const [columnOrder, setColumnOrder] = useState(() => STATUSES.map((status) => status.id));
  const [laneOrder, setLaneOrder] = useState(() => PEOPLE.map((person) => person.id));
  const [selected, setSelected] = useState<string[]>([]);
  const groupBy = useMemo<GroupBy<Task>>(
    () => ({
      columns: { key: 'status', values: ordered(STATUSES, columnOrder) },
      lanes: lanes ? { key: 'assignee', values: ordered(PEOPLE, laneOrder) } : undefined,
    }),
    [columnOrder, laneOrder, lanes],
  );
  const store = useTaskStore(seed, groupBy, { latencyMs: 300, failureRate: 0 });
  const { setItems, push } = store;

  const actions = useMemo<CardAction[]>(
    () => [
      {
        key: 'archive',
        label: 'Archive',
        icon: <Archive color={palette.bad} size={18} strokeWidth={2.2} />,
        color: palette.bad,
      },
    ],
    [palette.bad],
  );
  const onCardAction = useCallback(
    ({ itemIds }: CardActionEvent<Task>) => {
      setItems((current) => current.filter((task) => !itemIds.includes(task.id)));
      push(`Archived ${itemIds.length} card${itemIds.length === 1 ? '' : 's'}`, 'bad', Archive);
    },
    [push, setItems],
  );
  const onColumnOrderChange = useCallback(
    (ids: string[]) => {
      setColumnOrder(ids);
      push(`Columns: ${ids.join(', ')}`);
    },
    [push],
  );
  const onLaneOrderChange = useCallback(
    (ids: string[]) => {
      setLaneOrder(ids);
      push(`Lanes: ${ids.map((id) => personName(id) ?? id).join(', ')}`);
    },
    [push],
  );

  // Someone else moves a card: the data changes without a move from this board. The first column's top
  // card goes to the top of the second, so both stay on screen and the flash is easy to see.
  const teammateMove = useCallback(() => {
    const [fromId, toId] = columnOrder;
    const to = STATUSES.find((status) => status.id === toId);
    if (!fromId || !to) return;
    setItems((current) => {
      const top = (status: string) =>
        current
          .filter((entry) => entry.status === status)
          .reduce<Task | null>((low, entry) => (low === null || entry.rank < low.rank ? entry : low), null);
      const task = top(fromId);
      if (!task) return current;
      push(`A teammate moved ${task.title} to ${to.label}`, 'info', Users);
      const above = top(to.id)?.rank ?? null;
      return current.map((entry) =>
        entry.id === task.id ? { ...entry, status: to.id, rank: fractionalRank.between(null, above) } : entry,
      );
    });
  }, [columnOrder, push, setItems]);

  const renderCard = useCallback((info: CardRenderInfo<Task>) => <TaskCard info={info} variant="rich" />, []);

  return (
    <Screen
      title="Team board"
      subtitle={
        selected.length > 0
          ? `${selected.length} selected. Tap cards to add them, drag one to move them all, or use Move.`
          : 'Open a card’s … and tap Select to start a selection. Header … reorders columns and lanes.'
      }
      onBack={onBack}
      toolbar={
        <>
          <Segmented label="Layout" options={LAYOUTS} value={layout} onChange={setLayout} />
          <Toggle label="Lanes" value={lanes} onChange={setLanes} />
          <ActionButton label="Teammate move" tone="accent" onPress={teammateMove} />
          <ActionButton
            label="Select 3"
            onPress={() => board.current?.setSelection(store.items.slice(0, 3).map((task) => task.id))}
          />
          <ActionButton label="Undo" onPress={() => board.current?.undo()} />
          <ActionButton label="Reset" onPress={store.reset} />
        </>
      }
      footer={<EventLog entries={store.log} height={96} empty="Moves, batches and reorders show up here." />}
    >
      <Board
        ref={board}
        items={store.items}
        getItemId={taskId}
        getItemLabel={taskLabel}
        groupBy={groupBy}
        onMove={store.onMove}
        renderCard={renderCard}
        layout={lanes && layout === 'paged' ? 'multi' : layout}
        undo
        cardActions={actions}
        onCardAction={onCardAction}
        onSelectionChange={setSelected}
        onColumnOrderChange={onColumnOrderChange}
        onLaneOrderChange={onLaneOrderChange}
        collapsibleColumns={layout !== 'paged'}
        appearance={palette.dark ? 'dark' : 'light'}
      />
    </Screen>
  );
}
