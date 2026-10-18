import { useCallback, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  Board,
  applyMove,
  fractionalRank,
  type CardRenderInfo,
  type GroupBy,
  type MoveOperation,
} from 'react-native-board-view';
import { Screen, Toggle, usePalette } from '../ui';

interface Todo {
  id: string;
  title: string;
  importance: string;
  urgency: string;
  rank: string;
}

const groupBy: GroupBy<Todo> = {
  columns: {
    key: 'importance',
    values: [
      { id: 'important', label: 'Important', color: '#E5484D' },
      { id: 'minor', label: 'Not important', color: '#8B95A7' },
    ],
  },
  lanes: {
    key: 'urgency',
    values: [
      { id: 'urgent', label: 'Urgent' },
      { id: 'later', label: 'Not urgent' },
    ],
  },
};

const TITLES: [string, string, string][] = [
  ['Fix the checkout crash', 'important', 'urgent'],
  ['Reply to the auditor', 'important', 'urgent'],
  ['Renew the TLS certificate', 'important', 'urgent'],
  ['Plan the Q3 roadmap', 'important', 'later'],
  ['Write the onboarding guide', 'important', 'later'],
  ['Pair with the new hire', 'important', 'later'],
  ['Book the team offsite', 'important', 'later'],
  ['Answer the vendor survey', 'minor', 'urgent'],
  ['Approve expense reports', 'minor', 'urgent'],
  ['Tidy the shared drive', 'minor', 'later'],
  ['Rename old branches', 'minor', 'later'],
];

function seed(): Todo[] {
  const ranks = fractionalRank.nBetween(null, null, TITLES.length);
  return TITLES.map(([title, importance, urgency], index) => ({
    id: `m${index}`,
    title,
    importance,
    urgency,
    rank: ranks[index]!,
  }));
}

const setRank = (todo: Todo, rank: string): Todo => ({ ...todo, rank });

/** `layout="matrix"`: an Eisenhower 2 × 2. Lanes are rows, every cell is on screen. */
export function MatrixScreen({ onBack }: { onBack: () => void }) {
  const palette = usePalette();
  const [items, setItems] = useState(seed);
  const [undo, setUndo] = useState(true);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const onMove = useCallback((op: MoveOperation) => {
    const next = itemsRef.current.map((todo) => (todo.id === op.id ? applyMove(todo, op, groupBy, setRank) : todo));
    itemsRef.current = next;
    setItems(next);
  }, []);
  const renderCard = useCallback(
    ({ item, dragging }: CardRenderInfo<Todo>) => (
      <View
        style={[
          styles.card,
          { backgroundColor: palette.surface, borderColor: palette.border },
          dragging ? styles.lifted : null,
        ]}
      >
        <Text style={[styles.title, { color: palette.text }]} numberOfLines={2}>
          {item.title}
        </Text>
      </View>
    ),
    [palette],
  );

  return (
    <Screen
      title="Priority matrix"
      subtitle={'layout="matrix": urgency × importance. Every cell on screen; drag between them.'}
      onBack={onBack}
      toolbar={<Toggle label="Undo banner" value={undo} onChange={setUndo} />}
    >
      <Board
        items={items}
        getItemId={(todo) => todo.id}
        getItemLabel={(todo) => todo.title}
        groupBy={groupBy}
        onMove={onMove}
        renderCard={renderCard}
        layout="matrix"
        undo={undo}
        appearance={palette.dark ? 'dark' : 'light'}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, padding: 10, minHeight: 48 },
  lifted: { elevation: 8, shadowOpacity: 0.2, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  title: { fontSize: 14, fontWeight: '600' },
});
