import { useCallback, useMemo, useRef, useState } from 'react';
import { Board, addDays, dayColumns, toDayId, type CardRenderInfo, type GroupBy } from 'react-native-board-view';
import { makeTasks, random, type Task } from '../data';
import { taskId, taskLabel } from '../ids';
import { EventLog, Screen, TaskCard, usePalette } from '../ui';
import { useTaskStore } from '../useTaskStore';

/** Days loaded at a time when the board reaches either end. */
const STEP = 7;

function startOfWindow(): Date {
  return addDays(new Date(), -3);
}

function seed(): Task[] {
  const next = random(5);
  const today = new Date();
  return makeTasks(36, { seed: 9 }).map((task) => ({
    ...task,
    day: toDayId(addDays(today, Math.floor(next() * 16) - 5)),
  }));
}

// Stable references: an inline `getRank` or `theme` is new on every render.
const getRank = (task: Task) => task.rank;
const THEME = { columnWidth: 232 } as const;

/**
 * `layout="planner"`: a column per day, today marked, weekends set back, and
 * more days added as the board reaches either end.
 */

export function PlannerScreen({ onBack }: { onBack: () => void }) {
  const palette = usePalette();
  const [range, setRange] = useState(() => ({ start: startOfWindow(), count: 14 }));
  const groupBy = useMemo<GroupBy<Task>>(
    () => ({ columns: { key: 'day', values: dayColumns(range.start, range.count) } }),
    [range],
  );
  const store = useTaskStore(seed, groupBy);
  const { push } = store;
  const live = useRef(range);
  live.current = range;
  const onEdgeReached = useCallback(
    (edge: 'start' | 'end') => {
      const current = live.current;
      if (edge === 'start') {
        setRange({ start: addDays(current.start, -STEP), count: current.count + STEP });
        push(`Loaded ${STEP} earlier days`);
      } else {
        setRange({ start: current.start, count: current.count + STEP });
        push(`Loaded ${STEP} more days`);
      }
    },
    [push],
  );
  const renderCard = useCallback((info: CardRenderInfo<Task>) => <TaskCard info={info} variant="compact" />, []);

  return (
    <Screen
      title="Week planner"
      subtitle="A column per day. Today has the accent; weekends sit back. Scroll to either end for more days."
      onBack={onBack}
      footer={<EventLog entries={store.log} height={72} empty="Moves and loaded days show up here." />}
    >
      <Board
        items={store.items}
        getItemId={taskId}
        getItemLabel={taskLabel}
        getRank={getRank}
        groupBy={groupBy}
        onMove={store.onMove}
        renderCard={renderCard}
        layout="planner"
        initialColumnId={toDayId(new Date())}
        onEdgeReached={onEdgeReached}
        theme={THEME}
        appearance={palette.dark ? 'dark' : 'light'}
      />
    </Screen>
  );
}
