import { useCallback, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react-native';
import { applyMove, projectBoard, type GroupBy, type MoveOperation } from 'react-native-board-view';
import type { Task } from './data';

export interface ServerSimulation {
  latencyMs: number;
  failureRate: number;
}

export interface LogEntry {
  id: string;
  text: string;
  tone: 'info' | 'good' | 'bad';
  /** Drawn before the text. Default: a check for good, a cross for bad, nothing for info. */
  icon?: LucideIcon;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const setRank = (task: Task, rank: string): Task => ({ ...task, rank });

function describe(op: MoveOperation): string {
  const fields = Object.entries(op.changes)
    .map(([key, value]) => `${key}→${value ?? '∅'}`)
    .join(' ');
  return fields.length > 0 ? fields : 'reorder';
}

/**
 * The app side of the projection: a plain list in React state plus an
 * `onMove` that pretends to be a server. The board never touches this list;
 * it only shows overlays until the list catches up.
 */
export function useTaskStore(
  initial: () => Task[],
  groupBy: GroupBy<Task>,
  simulation: ServerSimulation = { latencyMs: 0, failureRate: 0 },
) {
  const [items, setItems] = useState(initial);
  const [log, setLog] = useState<LogEntry[]>([]);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const simulationRef = useRef(simulation);
  simulationRef.current = simulation;
  const counter = useRef(0);

  const push = useCallback((text: string, tone: LogEntry['tone'] = 'info', icon?: LucideIcon) => {
    counter.current += 1;
    const entry = { id: String(counter.current), text, tone, icon };
    setLog((entries) => [entry, ...entries].slice(0, 40));
  }, []);

  const onMove = useCallback(
    async (op: MoveOperation) => {
      const task = itemsRef.current.find((entry) => entry.id === op.id);
      const name = task?.title ?? op.id;
      const { latencyMs, failureRate } = simulationRef.current;
      if (latencyMs > 0) push(`… ${name}: ${describe(op)}`);
      if (latencyMs > 0) await wait(latencyMs);
      if (Math.random() < failureRate) {
        push(`Rejected ${name}`, 'bad');
        throw new Error('The server rejected this move.');
      }
      const next = itemsRef.current.map((entry) =>
        entry.id === op.id ? applyMove(entry, op, groupBy, setRank) : entry,
      );
      itemsRef.current = next;
      setItems(next);
      const model = projectBoard({
        items: next,
        getItemId: (entry) => entry.id,
        getRank: (entry) => entry.rank,
        groupBy,
      });
      const at = model.locations.get(op.id);
      const cell = at ? model.cellById.get(at.cellId) : undefined;
      push(
        `${name} → ${cell ? `${cell.lane.label ? `${cell.lane.label} / ` : ''}${cell.column.label}` : '?'} #${(at?.index ?? 0) + 1}`,
        'good',
      );
    },
    [groupBy, push],
  );

  const reset = useCallback(() => {
    const fresh = initial();
    itemsRef.current = fresh;
    setItems(fresh);
    setLog([]);
  }, [initial]);

  return { items, setItems, onMove, log, push, reset };
}
