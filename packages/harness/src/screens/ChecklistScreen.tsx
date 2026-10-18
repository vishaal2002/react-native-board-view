import { useMemo } from 'react';
import { CircleCheck, CircleX } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { runS1Cases } from '../s1';
import type { Route } from '../routes';
import { Screen, usePalette } from '../ui';

const GATES: { code: string; title: string; detail: string; route: Route }[] = [
  {
    code: 'S2',
    title: 'Empty-cell drops',
    detail: '20 drops into empty cells and 20 into occupied cells, 0 mismatches.',
    route: 'empty',
  },
  {
    code: 'S3',
    title: 'Scale',
    detail: '4 × 500 cards, heights 60–220. Release build: median UI and JS FPS ≥ 55, cards land where dropped.',
    route: 'scale',
  },
  {
    code: 'S4',
    title: 'Auto-scroll',
    detail: 'Reach column 12 and a deep card with no overshoot.',
    route: 'autoscroll',
  },
  {
    code: 'S5',
    title: 'Gesture coexistence',
    detail: 'Paged layout: page swipe, long-press drag and the … button. 0 misfires in 50 tries.',
    route: 'kanban-paged',
  },
  {
    code: 'S6',
    title: 'Rollback',
    detail: 'Reject after 800 ms returns the card. Two rapid moves of one card never overlap.',
    route: 'rollback',
  },
  {
    code: 'S7',
    title: 'Screen reader',
    detail: 'Complete a move with TalkBack or VoiceOver without dragging.',
    route: 'a11y',
  },
];

export function ChecklistScreen({ onBack, onOpen }: { onBack: () => void; onOpen: (route: Route) => void }) {
  const palette = usePalette();
  const s1 = useMemo(() => runS1Cases(), []);
  const passed = s1.every((check) => check.pass);
  return (
    <Screen
      title="Spike gates"
      subtitle="S1 runs here and in CI. S2–S7 are device checks; score S3 and S4 on release builds."
      onBack={onBack}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <Text style={[styles.cardTitle, { color: palette.text }]}>
            S1 · rank and index{' '}
            <Text style={{ color: passed ? palette.good : palette.bad }}>{passed ? 'pass' : 'fail'}</Text>
          </Text>
          {s1.map((check) => (
            <View key={check.id} style={styles.check}>
              {check.pass ? (
                <CircleCheck color={palette.good} size={16} strokeWidth={2.4} />
              ) : (
                <CircleX color={palette.bad} size={16} strokeWidth={2.4} />
              )}
              <Text style={[styles.line, styles.checkText, { color: check.pass ? palette.good : palette.bad }]}>
                {check.name}
              </Text>
            </View>
          ))}
        </View>
        {GATES.map((gate) => (
          <Pressable
            key={gate.code}
            onPress={() => onOpen(gate.route)}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.card,
              styles.gate,
              { backgroundColor: palette.surface, borderColor: palette.border, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <Text style={[styles.code, { color: palette.accent }]}>{gate.code}</Text>
            <View style={styles.gateText}>
              <Text style={[styles.cardTitle, { color: palette.text }]}>{gate.title}</Text>
              <Text style={[styles.detail, { color: palette.muted }]}>{gate.detail}</Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 10, paddingBottom: 40 },
  card: { borderRadius: 14, padding: 14, borderWidth: StyleSheet.hairlineWidth, gap: 4 },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  line: { fontSize: 13, fontWeight: '500' },
  check: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  checkText: { flex: 1 },
  gate: { flexDirection: 'row', gap: 12 },
  code: { fontSize: 15, fontWeight: '800', width: 28 },
  gateText: { flex: 1, gap: 2 },
  detail: { fontSize: 13, lineHeight: 18 },
});
