import { useCallback, useRef, useState } from 'react';
import {
  Board,
  applyMove,
  fractionalRank,
  type BoardHandle,
  type CardRenderInfo,
  type MoveOperation,
} from 'react-native-board-view';
import { STATUSES, kanbanGroupBy, makeTasks, type Task } from '../data';
import { taskId, taskLabel } from '../ids';
import { ActionButton, Screen, TaskCard, usePalette } from '../ui';

/** Cards the fake server sends per request. */
const PAGE = 6;
const LATENCY_MS = 900;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const setRank = (task: Task, rank: string): Task => ({ ...task, rank });
const byRank = (a: Task, b: Task) => (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0);

function serverSeed(): Task[] {
  return makeTasks(110, { seed: 5 });
}

function totalsOf(server: readonly Task[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const task of server) if (task.status) totals[task.status] = (totals[task.status] ?? 0) + 1;
  return totals;
}

/** The first page of every column, as a fresh app launch would fetch it. */
function firstPages(server: readonly Task[]): Task[] {
  return STATUSES.flatMap((status) =>
    server
      .filter((task) => task.status === status.id)
      .sort(byRank)
      .slice(0, PAGE),
  );
}

/**
 * The app owns paging: it keeps a "server" list, loads one page per column,
 * fetches the next page on `onEndReached`, and passes the server's totals.
 * The board only reports the end and shows the spinner.
 */
export function LiveDataScreen({ onBack }: { onBack: () => void }) {
  const palette = usePalette();
  const board = useRef<BoardHandle>(null);
  const server = useRef<Task[]>(serverSeed());
  const [items, setItems] = useState(() => firstPages(server.current));
  const [loading, setLoading] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [columnId, setColumnId] = useState('backlog');
  const [columnTotals, setColumnTotals] = useState(() => totalsOf(server.current));
  const fresh = useRef(0);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const onEndReached = useCallback((id: string) => {
    const loaded = itemsRef.current.filter((task) => task.status === id).length;
    const total = server.current.filter((task) => task.status === id).length;
    if (loaded >= total) return;
    setLoading((current) => (current.includes(id) ? current : [...current, id]));
    void wait(LATENCY_MS).then(() => {
      setItems((current) => {
        const have = new Set(current.map((task) => task.id));
        const next = server.current
          .filter((task) => task.status === id && !have.has(task.id))
          .sort(byRank)
          .slice(0, PAGE);
        return [...current, ...next];
      });
      setLoading((current) => current.filter((entry) => entry !== id));
    });
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void wait(LATENCY_MS).then(() => {
      // Someone else added a card while we were away: it lands on top of Backlog.
      fresh.current += 1;
      const top = server.current.filter((task) => task.status === 'backlog').sort(byRank)[0];
      server.current = [
        ...server.current,
        {
          id: `fresh-${fresh.current}`,
          title: `New from the server #${fresh.current}`,
          description: 'Pulled in by a refresh.',
          rank: fractionalRank.between(null, top?.rank ?? null),
          status: 'backlog',
          assignee: 'cara',
          tags: ['Feature'],
          priority: 'high',
        },
      ];
      setItems(firstPages(server.current));
      setColumnTotals(totalsOf(server.current));
      setRefreshing(false);
    });
  }, []);

  const onMove = useCallback(async (op: MoveOperation) => {
    await wait(250);
    const apply = (list: readonly Task[]) =>
      list.map((task) => (task.id === op.id ? applyMove(task, op, kanbanGroupBy, setRank) : task));
    server.current = apply(server.current);
    setItems(apply);
    setColumnTotals(totalsOf(server.current));
  }, []);

  /** The card Find last card picked, so Move it to the top moves the same one after more cards load. */
  const found = useRef<string | null>(null);
  const find = useCallback(() => {
    const task = itemsRef.current
      .filter((entry) => entry.status === columnId)
      .sort(byRank)
      .at(-1);
    if (!task) return;
    found.current = task.id;
    board.current?.scrollToItem(task.id, { highlight: true });
  }, [columnId]);
  const toTop = useCallback(() => {
    const id = found.current;
    if (!id || !board.current?.moveItem(id, { columnId, index: 0 })) return;
    requestAnimationFrame(() => board.current?.scrollToItem(id, { highlight: true }));
  }, [columnId]);

  const renderCard = useCallback((info: CardRenderInfo<Task>) => <TaskCard info={info} />, []);

  return (
    <Screen
      title="Live data"
      subtitle="Pages of 6 per column with server totals. Scroll to the end to load more, pull down to refresh."
      onBack={onBack}
      toolbar={
        <>
          <ActionButton label="Find last card" onPress={find} />
          <ActionButton label="Move it to the top" onPress={toTop} tone="accent" />
        </>
      }
    >
      <Board
        ref={board}
        items={items}
        getItemId={taskId}
        getItemLabel={taskLabel}
        groupBy={kanbanGroupBy}
        onMove={onMove}
        renderCard={renderCard}
        layout="auto"
        columnId={columnId}
        onColumnChange={setColumnId}
        onColumnEndReached={onEndReached}
        loadingColumns={loading}
        columnTotals={columnTotals}
        onRefresh={onRefresh}
        refreshing={refreshing}
        appearance={palette.dark ? 'dark' : 'light'}
      />
    </Screen>
  );
}
