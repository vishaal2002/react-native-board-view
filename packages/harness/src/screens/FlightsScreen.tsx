import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Board,
  applyMove,
  fractionalRank,
  type BoardHandle,
  type BoardLayout,
  type BoardSnapshot,
  type ZoomLevel,
  type CardRenderInfo,
  type GroupBy,
  type MoveOperation,
  type MovePreview,
} from 'react-native-board-view';
import { PEOPLE, PRIORITY_COLORS, STATUSES, makeTasks, random, type Task } from '../data';
import { taskId, taskLabel } from '../ids';
import { ActionButton, Screen, Segmented, TaskCard, Toggle, usePalette } from '../ui';

type Grouping = 'status' | 'assignee' | 'priority';

const GROUPINGS: Record<Grouping, GroupBy<Task>> = {
  status: { columns: { key: 'status', values: STATUSES } },
  assignee: { columns: { key: 'assignee', values: PEOPLE } },
  priority: {
    columns: {
      key: 'priority',
      values: (['urgent', 'high', 'medium', 'low'] as const).map((id) => ({
        id,
        label: id[0]!.toUpperCase() + id.slice(1),
        color: PRIORITY_COLORS[id],
      })),
    },
  },
};

const setRank = (task: Task, rank: string): Task => ({ ...task, rank });
const itemColor = (task: Task) => PRIORITY_COLORS[task.priority];
// C12: what a drop into Done or Review will do, drawn in the slot.
const describeMove = ({ to, itemIds }: MovePreview<Task>) =>
  to.columnId === 'done'
    ? `Closes ${itemIds.length === 1 ? 'the task' : `${itemIds.length} tasks`}`
    : to.columnId === 'review'
      ? 'Asks Bob for a review'
      : null;

/** New ranks in the order `compare` gives, as a sort from the server would. */
function rerank(tasks: readonly Task[], compare: (a: Task, b: Task) => number): Task[] {
  const order = [...tasks].sort(compare);
  const ranks = fractionalRank.nBetween(null, null, order.length);
  const rankOf = new Map(order.map((task, index) => [task.id, ranks[index]!]));
  return tasks.map((task) => ({ ...task, rank: rankOf.get(task.id)! }));
}

/**
 * C6 flights. Everything that changes the board here, a new grouping, a new
 * order, a teammate's moves, changes `items` or `groupBy` from outside a
 * drag. With "Animate changes" on, cards fly to their new places.
 */
export function FlightsScreen({ onBack }: { onBack: () => void }) {
  const palette = usePalette();
  const [items, setItems] = useState(() => makeTasks(18, { seed: 11 }));
  const [grouping, setGrouping] = useState<Grouping>('status');
  const [layout, setLayout] = useState<BoardLayout>('fit');
  const [animate, setAnimate] = useState(true);
  const [seed, setSeed] = useState(1);
  const [level, setLevel] = useState<ZoomLevel>('card');
  const [gather, setGather] = useState(true);
  const [throwing, setThrowing] = useState(false);
  const [lens, setLens] = useState(false);
  const moveModes = useMemo(() => ({ gather, throw: throwing }), [gather, throwing]);
  const board = useRef<BoardHandle>(null);
  // "Leave and come back": the board remounts from a snapshot taken before a teammate's changes.
  const [visit, setVisit] = useState<{ key: number; snapshot?: BoardSnapshot }>({ key: 0 });
  const comeBack = useCallback(() => {
    const snapshot = board.current?.snapshot();
    const next = random(seed + 500);
    setSeed((value) => value + 1);
    setItems((current) => {
      const moved = new Set(
        [...current]
          .sort(() => next() - 0.5)
          .slice(0, 5)
          .map((task) => task.id),
      );
      const changed = current.map((task) =>
        moved.has(task.id)
          ? {
              ...task,
              status: STATUSES[Math.floor(next() * STATUSES.length)]!.id,
              rank: fractionalRank.between(null, current[0]?.rank ?? null),
            }
          : task,
      );
      const fresh = makeTasks(2, { seed: seed + 900 }).map((task, index) => ({
        ...task,
        id: `new-${seed}-${index}`,
        rank: fractionalRank.between(null, changed[0]?.rank ?? null),
      }));
      return [...changed, ...fresh];
    });
    setVisit((current) => ({ key: current.key + 1, snapshot }));
  }, [seed]);
  const groupBy = GROUPINGS[grouping];

  const shuffle = useCallback(() => {
    const next = random(seed);
    const keys = new Map(items.map((task) => [task.id, next()]));
    setItems((current) => rerank(current, (a, b) => keys.get(a.id)! - keys.get(b.id)!));
    setSeed((value) => value + 1);
  }, [items, seed]);

  const byPriority = useCallback(() => {
    const order = ['urgent', 'high', 'medium', 'low'];
    setItems((current) => rerank(current, (a, b) => order.indexOf(a.priority) - order.indexOf(b.priority)));
  }, []);

  // A teammate moves three cards: the data changes with no move of ours.
  const teammate = useCallback(() => {
    const next = random(seed + 100);
    setSeed((value) => value + 1);
    setItems((current) => {
      const picked = new Set(
        [...current]
          .sort(() => next() - 0.5)
          .slice(0, 3)
          .map((task) => task.id),
      );
      return current.map((task) =>
        picked.has(task.id)
          ? {
              ...task,
              status: STATUSES[Math.floor(next() * STATUSES.length)]!.id,
              rank: fractionalRank.between(null, current[0]?.rank ?? null),
            }
          : task,
      );
    });
  }, [seed]);

  const onMove = useCallback(
    (op: MoveOperation) => {
      setItems((current) => current.map((task) => (task.id === op.id ? applyMove(task, op, groupBy, setRank) : task)));
    },
    [groupBy],
  );

  const renderCard = useCallback((info: CardRenderInfo<Task>) => <TaskCard info={info} variant="minimal" />, []);
  const toolbar = useMemo(
    () => (
      <>
        <Toggle label="Animate changes" value={animate} onChange={setAnimate} />
        <Toggle label="Gather" value={gather} onChange={setGather} />
        <Toggle label="Throw" value={throwing} onChange={setThrowing} />
        <Toggle label="Lens" value={lens} onChange={setLens} />
        <Segmented
          options={[
            { label: 'Status', value: 'status' },
            { label: 'Person', value: 'assignee' },
            { label: 'Priority', value: 'priority' },
          ]}
          value={grouping}
          onChange={setGrouping}
        />
        <ActionButton label="Shuffle" onPress={shuffle} />
        <ActionButton label="Sort by priority" onPress={byPriority} />
        <ActionButton label="Teammate moves 3" onPress={teammate} tone="accent" />
        <ActionButton label="Leave & come back" onPress={comeBack} tone="accent" />
        <Segmented
          options={[
            { label: 'Cards', value: 'card' },
            { label: 'Compact', value: 'compact' },
            { label: 'Titles', value: 'title' },
            { label: 'Bars', value: 'dot' },
          ]}
          value={level}
          onChange={setLevel}
        />
        <Segmented
          options={[
            { label: 'Fit', value: 'fit' },
            { label: 'Paged', value: 'paged' },
            { label: 'Stacked', value: 'stacked' },
          ]}
          value={layout}
          onChange={setLayout}
        />
      </>
    ),
    [animate, byPriority, comeBack, gather, grouping, layout, lens, level, shuffle, teammate, throwing],
  );

  return (
    <Screen
      title="Flights"
      subtitle="Regroup, re-sort or let a teammate move cards: each card flies to its new place."
      onBack={onBack}
      toolbar={toolbar}
    >
      <Board
        key={visit.key}
        ref={board}
        initialSnapshot={visit.snapshot}
        describeMove={describeMove}
        items={items}
        getItemId={taskId}
        getItemLabel={taskLabel}
        groupBy={groupBy}
        onMove={onMove}
        renderCard={renderCard}
        layout={layout}
        animateChanges={animate}
        moveModes={moveModes}
        dragLens={lens}
        zoom
        zoomLevel={level}
        onZoomLevelChange={setLevel}
        getItemColor={itemColor}
        undo
        appearance={palette.dark ? 'dark' : 'light'}
      />
    </Screen>
  );
}
