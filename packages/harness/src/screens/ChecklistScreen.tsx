import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { runS1Cases } from 'react-native-board-view';
import { theme } from '../theme';
import type { ScreenId } from '../types';

const manual: { id: ScreenId; code: string; title: string; detail: string }[] = [
  { id: 'empty', code: 'S2', title: 'Empty-cell drops', detail: '3×3 grid. 20 drops on empty cells and 20 on occupied cells. Mismatches stay at 0.' },
  { id: 'scale', code: 'S3', title: 'Scale', detail: '4 columns × 500 cards, heights 60–220. Release build, median UI and JS FPS ≥ 55, toIndex in range.' },
  { id: 'scroll', code: 'S4', title: 'Auto-scroll', detail: 'Hold a drag in the edge until column 12 and a deep card. No overshoot.' },
  { id: 'gestures', code: 'S5', title: 'Gesture coexistence', detail: 'Paged layout. Page swipe, long-press drag, and the … action. 0 misfires in 50 attempts.' },
  { id: 'rollback', code: 'S6', title: 'Rollback', detail: 'Reject a move after 800ms. Then fire two rapid moves. The card returns and the second call does not race.' },
  { id: 'move', code: 'S7', title: 'Screen reader', detail: 'Complete a move with TalkBack or VoiceOver using Move to…. Do not drag.' },
];

export function ChecklistScreen({
  host,
  rtl,
  onRtl,
  onOpen,
}: {
  host: string;
  rtl: boolean;
  onRtl: (value: boolean) => void;
  onOpen: (screen: ScreenId) => void;
}) {
  const cases = runS1Cases();
  const failed = cases.filter((item) => !item.pass).length;
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.kicker}>react-native-board-view</Text>
      <Text style={styles.title}>Spike checklist</Text>
      <Text style={styles.copy}>
        This {host} build is the M0 harness. The board is a projection: items stay in your store, and a move is an operation you apply or reject.
      </Text>
      <View style={styles.row}>
        <Text style={styles.copy}>Layout direction preview</Text>
        <Switch accessibilityLabel="Preview right to left layout" value={rtl} onValueChange={onRtl} />
      </View>
      <View style={styles.block}>
        <Text style={styles.blockTitle}>S1 rank and index · {failed === 0 ? 'pass' : `${failed} failed`}</Text>
        <Text style={styles.copy}>Automated here and in unit tests. Same-cell, cross-cell, filtered neighbors, toIndex.</Text>
        {cases.map((item) => (
          <Text key={item.id} style={[styles.case, !item.pass && { color: theme.bad }]}>
            {item.pass ? 'Pass' : 'Fail'} · {item.name}
          </Text>
        ))}
      </View>
      {manual.map((item) => (
        <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`${item.code} ${item.title}`} onPress={() => onOpen(item.id)} style={styles.link}>
          <Text style={styles.linkCode}>{item.code}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.linkTitle}>{item.title}</Text>
            <Text style={styles.copy}>{item.detail}</Text>
          </View>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  kicker: { color: theme.accent, fontSize: 13, fontWeight: '700' },
  title: { color: theme.text, fontSize: 28, fontWeight: '700' },
  copy: { color: theme.muted, fontSize: 14, lineHeight: 20 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  block: { backgroundColor: theme.panel, borderRadius: 12, padding: 12, gap: 4 },
  blockTitle: { color: theme.text, fontSize: 16, fontWeight: '700' },
  case: { color: theme.good, fontSize: 13 },
  link: { flexDirection: 'row', gap: 12, backgroundColor: theme.panel, borderRadius: 12, padding: 12 },
  linkCode: { color: theme.accent, fontWeight: '700', width: 32 },
  linkTitle: { color: theme.text, fontSize: 16, fontWeight: '700' },
});
