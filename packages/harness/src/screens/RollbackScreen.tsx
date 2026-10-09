import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import {
  BoardDragProvider,
  DraxCell,
  DraxCellBoard,
  cellId,
  createMoveFromDrop,
  createMoveQueue,
  projectBoard,
  useMoveQueueSnapshot,
  type MoveQueue,
} from 'react-native-board-view';
import { generateNKeysBetween } from 'fractional-indexing';
import { applyMove, kanbanGroup, type SpikeCard } from '../fixtures';
import { theme } from '../theme';
import { Button, CardFace, Screen, Stat } from '../ui';

export function RollbackScreen({ onBack }: { onBack: () => void }) {
  const initial = useMemo(seed, []);
  const [items, setItems] = useState(initial);
  const [rejectMoves, setRejectMoves] = useState(true);
  const [lines, setLines] = useState<string[]>([]);
  const rejectRef = useRef(rejectMoves);
  rejectRef.current = rejectMoves;
  const log = (line: string) => setLines((current) => [line, ...current].slice(0, 8));
  const queue = useRef<MoveQueue | null>(null);
  if (!queue.current) {
    queue.current = createMoveQueue({
      onEvent: (event) => {
        if (event.type === 'inflight') log(`In flight ${event.op.opId} → ${event.op.changes.status}`);
        if (event.type === 'resolved') log(`Resolved ${event.op.opId}`);
        if (event.type === 'rejected') log(`Rejected ${event.op.opId}`);
        if (event.type === 'cancelled') log(`Cancelled ${event.op.opId}`);
        if (event.type === 'cleared') log(`Overlay cleared ${event.opId}`);
      },
      onMove: (op) =>
        new Promise<void>((resolve, reject) => {
          setTimeout(() => {
            if (rejectRef.current) {
              reject(new Error('rejected'));
              return;
            }
            setItems((current) => applyMove(current, op));
            resolve();
          }, 800);
        }),
    });
  }
  const activeQueue = queue.current;
  const snapshot = useMoveQueueSnapshot(activeQueue);
  const projected = useMemo(
    () =>
      projectBoard({
        items,
        getItemId: (item) => item.id,
        getRank: (item) => item.rank,
        groupBy: kanbanGroup,
        overlays: snapshot.overlays,
      }),
    [items, snapshot.overlays],
  );

  useEffect(() => {
    activeQueue.reconcile((itemId) => {
      const item = items.find((card) => card.id === itemId);
      if (!item) return null;
      return { rank: item.rank, fields: { status: item.status } };
    });
  }, [activeQueue, items]);

  const enqueue = (itemId: string, toStatus: string, fromStatus: string) => {
    const item = items.find((card) => card.id === itemId);
    if (!item) return;
    const overlay = activeQueue.getOverlay(itemId);
    const visible = (projected.cellById.get(cellId('_', toStatus))?.items ?? []).map((card) => ({
      id: card.id,
      rank: card.rank,
    }));
    const op = createMoveFromDrop({
      item,
      itemId,
      groupBy: kanbanGroup,
      fromCellId: cellId('_', fromStatus),
      toCellId: cellId('_', toStatus),
      toIndex: 0,
      targetVisible: visible,
      current: overlay ? { fields: overlay.changes, rank: overlay.rank } : undefined,
    });
    activeQueue.enqueue(op);
    log(`Queued ${op.opId} → ${toStatus}`);
  };

  const fireTwo = () => {
    const card = projected.cellById.get(cellId('_', 'todo'))?.items[0];
    if (!card) {
      log('No card left in To do');
      return;
    }
    const first = createMoveFromDrop({
      item: card,
      itemId: card.id,
      groupBy: kanbanGroup,
      fromCellId: cellId('_', 'todo'),
      toCellId: cellId('_', 'doing'),
      toIndex: 0,
      targetVisible: (projected.cellById.get(cellId('_', 'doing'))?.items ?? []).map((item) => ({ id: item.id, rank: item.rank })),
    });
    const secondVisible = [{ id: card.id, rank: first.rank }];
    const second = createMoveFromDrop({
      item: card,
      itemId: card.id,
      groupBy: kanbanGroup,
      fromCellId: cellId('_', 'doing'),
      toCellId: cellId('_', 'done'),
      toIndex: 0,
      targetVisible: secondVisible,
      current: { fields: first.changes, rank: first.rank },
    });
    activeQueue.enqueue(first);
    activeQueue.enqueue(second);
    log(`Queued ${first.opId} then ${second.opId}`);
  };

  return (
    <Screen
      title="S6 rollback"
      subtitle="Reject stays on for the 800ms failure. Turn it off to let a move land. Two rapid moves share one card queue."
      onBack={onBack}
      footer={
        <View style={styles.footer}>
          <View style={styles.row}>
            <Text style={styles.copy}>Reject moves</Text>
            <Switch accessibilityLabel="Reject moves after 800 milliseconds" value={rejectMoves} onValueChange={setRejectMoves} />
          </View>
          <Button label="Move first card" onPress={() => enqueue('r1', 'doing', 'todo')} />
          <Button label="Two rapid moves" onPress={fireTwo} />
          <Stat label="Overlays" value={String(snapshot.overlays.length)} />
          {lines.map((line, index) => (
            <Text key={`${line}-${index}`} style={styles.line}>
              {line}
            </Text>
          ))}
        </View>
      }
    >
      <BoardDragProvider>
        <DraxCellBoard
          horizontal
          mode="continuous"
          onTransfer={(event) => {
            const item = items.find((card) => card.id === event.itemId);
            if (!item) return;
            const overlay = activeQueue.getOverlay(event.itemId);
            const op = createMoveFromDrop({
              item,
              itemId: event.itemId,
              groupBy: kanbanGroup,
              fromCellId: event.fromCellId,
              toCellId: event.toCellId,
              toIndex: event.toIndex,
              targetVisible: (projected.cellById.get(event.toCellId)?.items ?? []).map((card) => ({ id: card.id, rank: card.rank })),
              current: overlay ? { fields: overlay.changes, rank: overlay.rank } : undefined,
            });
            activeQueue.enqueue(op);
          }}
          onReorder={(event) => {
            const item = items.find((card) => card.id === event.itemId);
            if (!item) return;
            const op = createMoveFromDrop({
              item,
              itemId: event.itemId,
              groupBy: kanbanGroup,
              fromCellId: event.cellId,
              toCellId: event.cellId,
              toIndex: event.toIndex,
              targetVisible: (projected.cellById.get(event.cellId)?.items ?? []).map((card) => ({ id: card.id, rank: card.rank })),
            });
            activeQueue.enqueue(op);
          }}
        >
          {kanbanGroup.columns.values.map((column) => {
            const id = cellId('_', column.id);
            const ids = (projected.cellById.get(id)?.items ?? []).map((item) => item.id);
            return (
              <View key={id} style={styles.column}>
                <Text style={styles.header}>{column.label}</Text>
                <DraxCell
                  cellId={id}
                  itemIds={ids}
                  renderCard={(itemId) => {
                    const card = projected.cells.flatMap((cell) => cell.items).find((item) => item.id === itemId);
                    return <CardFace title={card?.title ?? itemId} detail={snapshot.overlays.some((op) => op.id === itemId) ? 'Pending' : undefined} />;
                  }}
                />
              </View>
            );
          })}
        </DraxCellBoard>
      </BoardDragProvider>
    </Screen>
  );
}

function seed(): SpikeCard[] {
  const ranks = generateNKeysBetween(null, null, 4);
  return [0, 1, 2, 3].map((index) => ({
    id: `r${index + 1}`,
    title: `Rollback ${index + 1}`,
    rank: ranks[index] ?? `a${index}`,
    status: 'todo',
    assignee: 'alice',
    height: 68,
  }));
}

const styles = StyleSheet.create({
  column: { width: 220, height: 420, backgroundColor: theme.panel, margin: 8, borderRadius: 12, overflow: 'hidden' },
  header: { color: theme.text, fontWeight: '700', padding: 10 },
  footer: { padding: 12, gap: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  copy: { color: theme.text },
  line: { color: theme.muted, fontSize: 12 },
});
