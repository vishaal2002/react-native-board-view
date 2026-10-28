import { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  Board,
  BoardDropScope,
  BoardDropTarget,
  type BoardDropTargetEvent,
  type BoardMoveContext,
  type CardDropEvent,
  type CardRenderInfo,
  type GatedMove,
  type MoveGateInfo,
  type MoveOperation,
} from 'react-native-board-view';
import { kanbanGroupBy, makeTasks, type Task } from '../data';
import { taskId, taskLabel } from '../ids';
import { EventLog, Screen, TaskCard, usePalette, type Palette } from '../ui';
import { useTaskStore } from '../useTaskStore';

const RESOLUTIONS = ['Fixed', 'Won’t fix', 'Duplicate'];
const CONFIRM_INTO = ['review'];

function seed(): Task[] {
  return makeTasks(24, { seed: 12 });
}

// A move into Done asks for a resolution; the board holds it until one is picked.
const gateMove = (moves: readonly GatedMove<Task>[]) =>
  moves.some((move) => move.op.changes.status === 'done') ? 'resolution' : null;

/**
 * 1.2: moves that ask first. Done needs a resolution, Review asks to confirm,
 * a card held on another card drops onto it, and the bar below the board
 * takes cards.
 */
export function AskFirstScreen({ onBack }: { onBack: () => void }) {
  const palette = usePalette();
  const store = useTaskStore(seed, kanbanGroupBy);
  const { onMove: save, push } = store;

  const onMove = useCallback(
    async (op: MoveOperation, context: BoardMoveContext) => {
      if (context.answer !== undefined) push(`Resolution: ${String(context.answer)}`);
      await save(op, context);
    },
    [push, save],
  );
  const onCardDrop = useCallback(
    (event: CardDropEvent<Task>) => push(`${event.item.title} dropped onto ${event.target.title}`, 'good'),
    [push],
  );
  const onTarget = useCallback(
    (event: BoardDropTargetEvent<Task>) => push(`${event.item.title} → ${event.targetId}`, 'good'),
    [push],
  );
  const renderCard = useCallback((info: CardRenderInfo<Task>) => <TaskCard info={info} variant="minimal" />, []);
  const renderMoveGate = useCallback(
    (info: MoveGateInfo<Task>) => <ResolutionForm info={info} palette={palette} />,
    [palette],
  );

  return (
    <Screen
      title="Moves that ask first"
      subtitle="Done asks for a resolution and Review asks to confirm. Hold a card on another to drop onto it. Drag a card onto the bar below."
      onBack={onBack}
      footer={<EventLog entries={store.log} height={80} />}
    >
      <BoardDropScope>
        <View style={styles.fill}>
          <Board
            items={store.items}
            getItemId={taskId}
            getItemLabel={taskLabel}
            groupBy={kanbanGroupBy}
            onMove={onMove}
            renderCard={renderCard}
            gateMove={gateMove}
            renderMoveGate={renderMoveGate}
            confirmInto={CONFIRM_INTO}
            onCardDrop={onCardDrop}
            dock={false}
            appearance={palette.dark ? 'dark' : 'light'}
          />
        </View>
        <View style={[styles.bar, { borderColor: palette.border }]}>
          {['Trash', 'Assign to me'].map((id) => (
            <BoardDropTarget<Task> key={id} id={id} onDrop={onTarget} style={styles.target}>
              {({ dragging, hovered }) => (
                <View
                  style={[
                    styles.targetFace,
                    {
                      borderColor: hovered ? palette.accent : palette.border,
                      backgroundColor: hovered ? palette.raised : palette.surface,
                      opacity: dragging ? 1 : 0.6,
                    },
                  ]}
                >
                  <Text style={{ color: palette.text, fontWeight: '600' }}>{id}</Text>
                </View>
              )}
            </BoardDropTarget>
          ))}
        </View>
      </BoardDropScope>
    </Screen>
  );
}

function ResolutionForm({ info, palette }: { info: MoveGateInfo<Task>; palette: Palette }) {
  const count = info.moves.length;
  return (
    <View>
      <Text style={[styles.title, { color: palette.text }]}>
        {count > 1 ? `Resolve ${count} cards` : `Resolve “${info.moves[0]?.item.title ?? ''}”`}
      </Text>
      {RESOLUTIONS.map((resolution) => (
        <Pressable
          key={resolution}
          onPress={() => info.submit(resolution)}
          accessibilityRole="button"
          style={({ pressed }) => [styles.option, { borderColor: palette.border, opacity: pressed ? 0.6 : 1 }]}
        >
          <Text style={{ color: palette.text, fontSize: 16 }}>{resolution}</Text>
        </Pressable>
      ))}
      <Pressable
        onPress={info.cancel}
        accessibilityRole="button"
        style={({ pressed }) => [styles.option, styles.cancel, { opacity: pressed ? 0.6 : 1 }]}
      >
        <Text style={{ color: palette.bad, fontSize: 16, fontWeight: '600' }}>Cancel</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  bar: { flexDirection: 'row', gap: 12, padding: 12, borderTopWidth: StyleSheet.hairlineWidth },
  target: { flex: 1 },
  targetFace: {
    minHeight: 56,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  option: { minHeight: 48, justifyContent: 'center', borderBottomWidth: StyleSheet.hairlineWidth },
  cancel: { borderBottomWidth: 0 },
});
