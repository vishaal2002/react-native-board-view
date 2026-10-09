import { useMemo, useRef, useState } from 'react';
import {
  createMoveFromDrop,
  projectBoard,
  type BoardModel,
  type GroupBy,
} from 'react-native-board-view';
import { applyMove, type SpikeCard } from './fixtures';
import type { DropEntry } from './ui';

export function useLocalBoard(initial: SpikeCard[], groupBy: GroupBy<SpikeCard>) {
  const [items, setItems] = useState(initial);
  const [log, setLog] = useState<DropEntry[]>([]);
  const [tallies, setTallies] = useState({ empty: 0, occupied: 0, mismatch: 0 });
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const projected = useMemo(
    () =>
      projectBoard({
        items,
        getItemId: (item) => item.id,
        getRank: (item) => item.rank,
        groupBy,
      }),
    [groupBy, items],
  );

  const commit = (itemId: string, fromCellId: string, toCellId: string, toIndex: number, rawToIndex = toIndex) => {
    const current = itemsRef.current;
    const board = projectBoard({
      items: current,
      getItemId: (item) => item.id,
      getRank: (item) => item.rank,
      groupBy,
    });
    const item = current.find((card) => card.id === itemId);
    if (!item) return;
    const visible = (board.cellById.get(toCellId)?.items ?? []).map((card) => ({ id: card.id, rank: card.rank }));
    const without = visible.filter((card) => card.id !== itemId);
    let text = `${item.title} ${fromCellId} → ${toCellId} index ${toIndex} (raw ${rawToIndex})`;
    try {
      const op = createMoveFromDrop({
        item,
        itemId,
        groupBy,
        fromCellId,
        toCellId,
        toIndex,
        targetVisible: visible,
      });
      const bad = without.length === 0 ? toIndex !== 0 : toIndex < 0 || toIndex > without.length;
      text += without.length === 0 ? ' · empty cell' : ' · occupied cell';
      if (bad) text += ' · mismatch';
      setItems(applyMove(current, op));
      setLog((entries) => [{ id: op.opId, text, bad }, ...entries].slice(0, 30));
      setTallies((prev) => ({
        empty: prev.empty + (without.length === 0 ? 1 : 0),
        occupied: prev.occupied + (without.length === 0 ? 0 : 1),
        mismatch: prev.mismatch + (bad ? 1 : 0),
      }));
    } catch (error) {
      setLog((entries) =>
        [{ id: `err-${Date.now()}`, text: `${text} · ${error instanceof Error ? error.message : 'invalid index'}`, bad: true }, ...entries].slice(0, 30),
      );
      setTallies((prev) => ({ ...prev, mismatch: prev.mismatch + 1 }));
    }
  };

  return {
    projected,
    log,
    tallies,
    commit,
    reset: () => {
      setItems(initial);
      setLog([]);
      setTallies({ empty: 0, occupied: 0, mismatch: 0 });
    },
  };
}

export function idsIn(board: BoardModel<SpikeCard>, cell: string): string[] {
  return (board.cellById.get(cell)?.items ?? []).map((item) => item.id);
}
