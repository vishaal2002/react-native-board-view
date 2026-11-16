import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Board,
  BoardScrubber,
  applyMove,
  darkTheme,
  fractionalRank,
  lightTheme,
  useBoardFlow,
  useBoardTimeline,
  type BoardHandle,
  type BoardPresence,
  type CardRenderInfo,
  type DragEndEvent,
  type DragStartEvent,
  type GroupBy,
  type MoveOperation,
  type MoveProposal,
  type ProposalEvent,
  type ZoomLevel,
} from 'react-native-board-view';
import { STATUSES, kanbanGroupBy, makeTasks, random, swimlaneGroupBy, type Task } from '../data';
import { taskId, taskLabel } from '../ids';
import { ActionButton, Screen, Segmented, TaskCard, Toggle, usePalette } from '../ui';

const setRank = (task: Task, rank: string): Task => ({ ...task, rank });
const TEAMMATE_MS = 2600;
const STALE = { doing: 5, review: 3 };
const ZOOM = { dotLayout: 'age' as const };
const getAge = (task: Task) => task.ageDays ?? null;
const getBlocked = (task: Task) => (task.locked ? 'Waiting on API' : null);

/** One card another person moves, somewhere other than where it is. */
function teammateMove(items: readonly Task[], next: () => number, pick?: string | null): Task[] {
  const card =
    (pick != null ? items.find((task) => task.id === pick) : undefined) ?? items[Math.floor(next() * items.length)];
  if (!card) return [...items];
  const others = STATUSES.filter((status) => status.id !== card.status);
  const status = others[Math.floor(next() * others.length)]!.id;
  const top = items
    .filter((task) => task.status === status)
    .reduce<Task | null>((low, task) => (low == null || task.rank < low.rank ? task : low), null);
  return items.map((task) =>
    task.id === card.id ? { ...task, status, rank: fractionalRank.between(null, top?.rank ?? null) } : task,
  );
}

/**
 * 1.4, a board with a memory. A teammate keeps moving cards while you drag
 * (nothing moves under your finger), the timeline records every move, the
 * scrubber plays them back, suggestions wait on their cards, and the dot
 * level is an ageing chart you can still drag.
 */
export function MemoryScreen({ onBack }: { onBack: () => void }) {
  const palette = usePalette();
  const board = useRef<BoardHandle>(null);
  const [items, setItems] = useState(() => makeTasks(16, { seed: 21, lockedEvery: 7 }));
  const [teammate, setTeammate] = useState(true);
  const [holding, setHolding] = useState(false);
  const [diff, setDiff] = useState(false);
  const [level, setLevel] = useState<ZoomLevel>('card');
  const [proposals, setProposals] = useState<readonly MoveProposal[]>([]);
  const [grabs, setGrabs] = useState(false);
  const [lanes, setLanes] = useState(false);
  // The last thing that happened, so a check can read it off the screen.
  const [status, setStatus] = useState('');
  const groupBy: GroupBy<Task> = lanes ? swimlaneGroupBy : kanbanGroupBy;
  const groupRef = useRef(groupBy);
  groupRef.current = groupBy;
  // The card this user is holding, which Priya takes when "Priya grabs yours" is on.
  const lifted = useRef<string | null>(null);
  const grabsRef = useRef(grabs);
  grabsRef.current = grabs;
  const timeline = useBoardTimeline<Task>({ actor: 'You', getActor: () => 'Priya' });
  const flow = useBoardFlow(timeline, { doneColumns: ['done'] });
  const seed = useRef(1);

  // Priya moves a card every few seconds, as a sync from the server would.
  useEffect(() => {
    if (!teammate) return;
    const timer = setInterval(() => {
      seed.current += 1;
      const pick = grabsRef.current ? lifted.current : null;
      setItems((current) => teammateMove(current, random(seed.current), pick));
    }, TEAMMATE_MS);
    return () => clearInterval(timer);
  }, [teammate]);

  // Priya holding a card: drawn with her name, and locked here.
  const presence = useMemo<readonly BoardPresence[]>(
    () => (holding && items[3] ? [{ userId: 'priya', name: 'Priya', itemId: items[3].id, color: '#9B6CF2' }] : []),
    [holding, items],
  );

  const onMove = useCallback(async (op: MoveOperation) => {
    await new Promise<void>((resolve) => setTimeout(resolve, 200));
    setItems((current) =>
      current.map((task) => (task.id === op.id ? applyMove(task, op, groupRef.current, setRank) : task)),
    );
  }, []);
  const onDragStart = useCallback((event: DragStartEvent) => {
    lifted.current = event.itemId;
  }, []);
  const onDragEnd = useCallback((event: DragEndEvent) => {
    lifted.current = null;
    setStatus(
      event.reason ? `Drag cancelled: ${event.reason}` : event.cancelled ? 'Drag ended, nothing moved' : 'Dropped',
    );
  }, []);

  // Rules that suggest moves: work in review for a while goes to Done, stale work goes back to To do.
  const suggest = useCallback(() => {
    const next: MoveProposal[] = [];
    for (const task of items) {
      if (task.status === 'review' && (task.ageDays ?? 0) >= 2)
        next.push({ id: `p-${task.id}`, itemId: task.id, to: { columnId: 'done' }, label: 'Reviewed' });
      else if (task.status === 'doing' && (task.ageDays ?? 0) >= 12)
        next.push({
          id: `p-${task.id}`,
          itemId: task.id,
          to: { columnId: 'todo' },
          label: 'Stale',
          reason: 'No change in 12 days',
        });
    }
    setProposals(next.slice(0, 4));
  }, [items]);
  const onProposal = useCallback((event: ProposalEvent<Task>) => {
    setStatus(
      `${event.decision === 'accept' ? 'Accepted' : 'Declined'} ${event.item.title}${event.moved === false ? ' (refused)' : ''}`,
    );
    setProposals((current) => current.filter((entry) => entry.id !== event.proposal.id));
  }, []);

  // A command, as a shortcut or an agent would send it.
  const shortcut = useCallback(() => {
    const first = items.find((task) => task.status === 'todo');
    const result = board.current?.run(
      first
        ? { type: 'move', itemId: first.id, to: { columnId: 'doing' }, origin: 'shortcut' }
        : { type: 'move', itemId: 'none', to: { columnId: 'doing' } },
    );
    if (result) setStatus(result.ok ? `Shortcut moved ${first?.title}` : `Shortcut refused: ${result.reason}`);
  }, [items]);

  const toggleDiff = useCallback(
    (on: boolean) => {
      setDiff(on);
      if (on) timeline.seek(0, 'diff');
      else timeline.live();
    },
    [timeline],
  );

  const renderCard = useCallback((info: CardRenderInfo<Task>) => <TaskCard info={info} />, []);
  const finished = flow.throughput.reduce((sum, day) => sum + day.count, 0);

  return (
    <Screen
      title="A board with a memory"
      subtitle={`${timeline.entries.length} moves recorded · ${finished} finished. ${status || 'Drag while Priya moves cards, then scrub back.'}`}
      onBack={onBack}
      toolbar={
        <>
          <Toggle label="Priya moves cards" value={teammate} onChange={setTeammate} />
          <Toggle label="Priya holds one" value={holding} onChange={setHolding} />
          <Toggle label="Priya grabs yours" value={grabs} onChange={setGrabs} />
          <Toggle label="Lanes" value={lanes} onChange={setLanes} />
          <ActionButton label="Suggest moves" onPress={suggest} tone="accent" />
          <Toggle label="Changes since start" value={diff} onChange={toggleDiff} />
          <ActionButton label="Shortcut: start next" onPress={shortcut} />
          <Segmented
            options={[
              { label: 'Cards', value: 'card' },
              { label: 'Ageing', value: 'dot' },
            ]}
            value={level}
            onChange={setLevel}
          />
        </>
      }
      footer={<BoardScrubber timeline={timeline} theme={palette.dark ? darkTheme : lightTheme} />}
    >
      <Board
        ref={board}
        items={items}
        getItemId={taskId}
        getItemLabel={taskLabel}
        groupBy={groupBy}
        onMove={onMove}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        renderCard={renderCard}
        layout="auto"
        timeline={timeline}
        animateChanges
        getItemAge={getAge}
        staleAfterDays={STALE}
        getBlocked={getBlocked}
        proposals={proposals}
        onProposal={onProposal}
        presence={presence}
        zoom={ZOOM}
        zoomLevel={level}
        onZoomLevelChange={setLevel}
        undo
        appearance={palette.dark ? 'dark' : 'light'}
      />
    </Screen>
  );
}
