import { memo, useCallback } from 'react';
import { Cloud } from 'lucide-react-native';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  Board,
  useBoardTheme,
  type CardRenderInfo,
  type ColumnFooterRenderInfo,
  type ColumnHeaderRenderInfo,
  type EmptyCellRenderInfo,
  type GroupBy,
} from 'react-native-board-view';
import { PRIORITY_COLORS, STATUSES, TAG_COLORS, kanbanGroupBy, makeTasks, personName, type Task } from '../data';
import { taskId, taskLabel } from '../ids';
import { EventLog, Screen, usePalette } from '../ui';
import { useTaskStore } from '../useTaskStore';

function seed(): Task[] {
  return makeTasks(22, { seed: 51, statuses: ['todo', 'doing', 'review'] });
}

const moveModes = { sheet: 'manual' } as const;
const groupBy: GroupBy<Task> = { columns: { key: 'status', values: STATUSES.slice(1, 5) } };

function initials(name: string | undefined): string {
  return (name ?? '?')
    .split(' ')
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 2);
}

const Ticket = memo(function Ticket({ info }: { info: CardRenderInfo<Task> }) {
  const theme = useBoardTheme();
  const { item, pending, dragging, openMoveSheet, index, count } = info;
  // `cardMarks="manual"`: the board draws nothing over the ticket, so it shows selection, highlight and hover itself.
  const { selected, highlighted, hovered, dimmed, dragCount } = info;
  const marked = dragging || selected || highlighted;
  return (
    <View
      style={[
        styles.ticket,
        {
          backgroundColor: theme.cardBackground,
          borderColor: marked ? theme.accent : hovered ? theme.mutedText : theme.cardBorder,
        },
        marked ? styles.ticketMarked : null,
        dragging ? styles.ticketLifted : null,
        dimmed ? styles.ticketDimmed : null,
      ]}
    >
      <View style={styles.ticketTop}>
        <View style={[styles.flag, { backgroundColor: PRIORITY_COLORS[item.priority] }]} />
        <Text style={[styles.ticketKey, { color: theme.mutedText }]}>
          {item.id.toUpperCase()} · {index + 1}/{count}
        </Text>
        {pending ? <ActivityIndicator size="small" color={theme.accent} /> : null}
        {dragCount > 1 ? (
          <Text style={[styles.carrying, { backgroundColor: theme.accent, color: theme.cardBackground }]}>
            {dragCount} tickets
          </Text>
        ) : null}
        {selected ? <Text style={[styles.picked, { color: theme.accent }]}>Picked</Text> : null}
        <Pressable onPress={openMoveSheet} hitSlop={8} style={[styles.moveButton, { borderColor: theme.cardBorder }]}>
          <Text style={[styles.moveText, { color: theme.accent }]}>Move</Text>
        </Pressable>
      </View>
      <Text style={[styles.ticketTitle, { color: theme.text }]}>{item.title}</Text>
      <View style={styles.ticketBottom}>
        <View style={styles.tagDots}>
          {item.tags.map((tag) => (
            <View key={tag} style={[styles.tagDot, { backgroundColor: TAG_COLORS[tag] }]} />
          ))}
        </View>
        <View style={[styles.avatar, { backgroundColor: theme.accent }]}>
          <Text style={styles.avatarText}>{initials(personName(item.assignee))}</Text>
        </View>
      </View>
    </View>
  );
});

function Header({ info, total }: { info: ColumnHeaderRenderInfo; total: number }) {
  const theme = useBoardTheme();
  const share = total > 0 ? info.count / total : 0;
  return (
    <View style={styles.header}>
      <View style={styles.headerRow}>
        <Text style={[styles.headerTitle, { color: theme.text }]}>{info.column.label}</Text>
        <Text style={[styles.headerCount, { color: theme.mutedText }]}>{Math.round(share * 100)}%</Text>
      </View>
      <View style={[styles.track, { backgroundColor: theme.background }]}>
        <View style={[styles.bar, { width: `${share * 100}%`, backgroundColor: info.column.color ?? theme.accent }]} />
      </View>
    </View>
  );
}

function Empty({ column }: EmptyCellRenderInfo) {
  const theme = useBoardTheme();
  return (
    <View style={[styles.empty, { borderColor: theme.emptyCellBorder }]}>
      <Cloud color={theme.mutedText} size={30} strokeWidth={1.8} />
      <Text style={[styles.emptyText, { color: theme.mutedText }]}>Nothing in {column.label.toLowerCase()} yet</Text>
    </View>
  );
}

export function CustomScreen({ onBack }: { onBack: () => void }) {
  const palette = usePalette();
  const store = useTaskStore(seed, kanbanGroupBy, { latencyMs: 600, failureRate: 0 });
  const total = store.items.length;
  const renderCard = useCallback((info: CardRenderInfo<Task>) => <Ticket info={info} />, []);
  const renderColumnHeader = useCallback(
    (info: ColumnHeaderRenderInfo) => <Header info={info} total={total} />,
    [total],
  );
  const renderEmptyCell = useCallback((info: EmptyCellRenderInfo) => <Empty {...info} />, []);
  const { push } = store;
  const renderColumnFooter = useCallback(
    ({ column }: ColumnFooterRenderInfo) => (
      <Pressable
        onPress={() => push(`“Add card” tapped in ${column.label}. Creating items is up to your app.`)}
        style={({ pressed }) => [styles.footer, { opacity: pressed ? 0.6 : 1 }]}
      >
        <Text style={[styles.footerText, { color: palette.accent }]}>＋ Add card</Text>
      </Pressable>
    ),
    [palette.accent, push],
  );
  const renderDropIndicator = useCallback(
    () => (
      <View style={[styles.indicator, { borderColor: palette.accent }]}>
        <View style={[styles.indicatorDot, { backgroundColor: palette.accent }]} />
      </View>
    ),
    [palette.accent],
  );

  return (
    <Screen
      title="Custom renderers"
      subtitle="Card, column header, empty cell, footer and drop indicator are all app components. The ticket draws its own selection and highlight. The “Move” button opens the board's sheet."
      onBack={onBack}
      footer={<EventLog entries={store.log} height={80} />}
    >
      <Board
        items={store.items}
        getItemId={taskId}
        getItemLabel={taskLabel}
        groupBy={groupBy}
        onMove={store.onMove}
        renderCard={renderCard}
        renderColumnHeader={renderColumnHeader}
        renderEmptyCell={renderEmptyCell}
        renderColumnFooter={renderColumnFooter}
        renderDropIndicator={renderDropIndicator}
        moveModes={moveModes}
        cardMarks="manual"
        appearance={palette.dark ? 'dark' : 'light'}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  ticket: { borderRadius: 12, borderWidth: 1, padding: 12, gap: 8 },
  ticketMarked: { borderWidth: 2, padding: 11 },
  ticketLifted: { transform: [{ rotate: '-1.5deg' }] },
  ticketDimmed: { opacity: 0.4 },
  carrying: {
    fontSize: 11,
    fontWeight: '800',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
  picked: { fontSize: 12, fontWeight: '800' },
  ticketTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flag: { width: 10, height: 10, borderRadius: 2 },
  ticketKey: { flex: 1, fontSize: 11, fontWeight: '700', letterSpacing: 0.4 },
  moveButton: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, height: 24, justifyContent: 'center' },
  moveText: { fontSize: 12, fontWeight: '700' },
  ticketTitle: { fontSize: 15, fontWeight: '700' },
  ticketBottom: { flexDirection: 'row', alignItems: 'center' },
  tagDots: { flex: 1, flexDirection: 'row', gap: 4 },
  tagDot: { width: 8, height: 8, borderRadius: 4 },
  avatar: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  header: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8, gap: 8 },
  headerRow: { flexDirection: 'row', alignItems: 'baseline' },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '800' },
  headerCount: { fontSize: 12, fontWeight: '700' },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  bar: { height: 6, borderRadius: 3 },
  empty: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingVertical: 22,
    alignItems: 'center',
    gap: 4,
  },
  emptyText: { fontSize: 13, fontWeight: '600' },
  footer: { paddingVertical: 12, alignItems: 'center' },
  footerText: { fontSize: 14, fontWeight: '700' },
  indicator: { flex: 1, height: 10, marginTop: -3.5, borderRadius: 5, borderWidth: 2, justifyContent: 'center' },
  indicatorDot: { width: 6, height: 6, borderRadius: 3, marginLeft: -1 },
});
