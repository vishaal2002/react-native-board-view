import { useCallback, useRef } from 'react';
import { Board, type BoardHandle, type CardRenderInfo } from 'react-native-board-view';
import { makeTasks, swimlaneGroupBy, type Task } from '../data';
import { taskId, taskLabel } from '../ids';
import { ActionButton, EventLog, Screen, TaskCard, usePalette } from '../ui';
import { useTaskStore } from '../useTaskStore';

function seed(): Task[] {
  return makeTasks(18, { seed: 31 });
}

const moveModes = { drag: false, sheet: 'auto', swipe: false } as const;

export function AccessibilityScreen({ onBack }: { onBack: () => void }) {
  const palette = usePalette();
  const board = useRef<BoardHandle>(null);
  const store = useTaskStore(seed, swimlaneGroupBy, { latencyMs: 400, failureRate: 0 });
  const renderCard = useCallback((info: CardRenderInfo<Task>) => <TaskCard info={info} variant="compact" />, []);
  const first = store.items[0];
  return (
    <Screen
      title="Move without dragging"
      subtitle="Drag is off. Turn on VoiceOver or TalkBack: each card reads its column, lane and position, and offers “Move to …” actions. Moves and failures are announced."
      onBack={onBack}
      toolbar={
        first ? (
          <ActionButton
            label="Open “Move to…” for the first card"
            tone="accent"
            onPress={() => board.current?.openMoveSheet(first.id)}
          />
        ) : null
      }
      footer={<EventLog entries={store.log} height={88} />}
    >
      <Board
        ref={board}
        items={store.items}
        getItemId={taskId}
        getItemLabel={taskLabel}
        groupBy={swimlaneGroupBy}
        onMove={store.onMove}
        renderCard={renderCard}
        moveModes={moveModes}
        layout="stacked"
        appearance={palette.dark ? 'dark' : 'light'}
      />
    </Screen>
  );
}
