import { useCallback } from 'react';
import { Board, type CardRenderInfo, type MoveTarget } from 'react-native-board-view';
import { kanbanGroupBy, makeTasks, type Task } from '../data';
import { taskId, taskLabel } from '../ids';
import { EventLog, Screen, TaskCard, usePalette } from '../ui';
import { useTaskStore } from '../useTaskStore';

function seed(): Task[] {
  return makeTasks(28, { seed: 5, lockedEvery: 5 });
}

const canDrag = (task: Task) => !task.locked;

/** Only reviewed work can be done; bugs never go back to the backlog. */
const canDrop = (task: Task, target: MoveTarget) => {
  if (target.columnId === 'done' && task.status !== 'review' && task.status !== 'done') return false;
  if (target.columnId === 'backlog' && task.tags.includes('Bug')) return false;
  return true;
};

export function RulesScreen({ onBack }: { onBack: () => void }) {
  const palette = usePalette();
  const store = useTaskStore(seed, kanbanGroupBy);
  const renderCard = useCallback((info: CardRenderInfo<Task>) => <TaskCard info={info} />, []);
  return (
    <Screen
      title="Rules"
      subtitle="🔒 cards can't be dragged. Done only accepts cards from Review, and bugs can't go back to Backlog. Refused cells turn red and the card returns."
      onBack={onBack}
      footer={<EventLog entries={store.log} height={88} />}
    >
      <Board
        items={store.items}
        getItemId={taskId}
        getItemLabel={taskLabel}
        groupBy={kanbanGroupBy}
        onMove={store.onMove}
        renderCard={renderCard}
        canDrag={canDrag}
        canDrop={canDrop}
        appearance={palette.dark ? 'dark' : 'light'}
      />
    </Screen>
  );
}
