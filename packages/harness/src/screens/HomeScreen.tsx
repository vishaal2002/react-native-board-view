import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SECTIONS, type Route } from '../routes';
import { Segmented, useAppearance } from '../ui';

export function HomeScreen({ host, onOpen }: { host: string; onOpen: (route: Route) => void }) {
  const { palette, appearance, setAppearance } = useAppearance();
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.root}>
      <ScrollView
        style={{ backgroundColor: palette.background }}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 }]}
      >
        <View style={styles.hero}>
          <Text style={[styles.kicker, { color: palette.accent }]}>react-native-board-view · {host}</Text>
          <Text style={[styles.heading, { color: palette.text }]} accessibilityRole="header">
            Boards from flat data
          </Text>
          <Text style={[styles.lede, { color: palette.muted }]}>
            Kanban, swimlanes and lists. The board is a projection of your items: every move is an operation your app
            applies or rejects.
          </Text>
          <Segmented
            label="Appearance"
            options={[
              { label: 'System', value: 'auto' },
              { label: 'Light', value: 'light' },
              { label: 'Dark', value: 'dark' },
            ]}
            value={appearance}
            onChange={setAppearance}
          />
        </View>
        {SECTIONS.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={[styles.sectionTitle, { color: palette.muted }]}>{section.title}</Text>
            <View style={styles.grid}>
              {section.entries.map((entry) => (
                <Pressable
                  key={entry.route}
                  onPress={() => onOpen(entry.route)}
                  accessibilityRole="button"
                  accessibilityLabel={`${entry.title}. ${entry.detail}`}
                  style={({ pressed }) => [
                    styles.tile,
                    { backgroundColor: palette.surface, borderColor: palette.border, opacity: pressed ? 0.85 : 1 },
                  ]}
                >
                  <View style={[styles.badge, { backgroundColor: palette.raised }]}>
                    <Text style={[styles.badgeText, { color: palette.accent }]}>{entry.badge}</Text>
                  </View>
                  <View style={styles.tileText}>
                    <Text style={[styles.tileTitle, { color: palette.text }]}>{entry.title}</Text>
                    <Text style={[styles.tileDetail, { color: palette.muted }]}>{entry.detail}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
      <View style={[styles.statusBackdrop, { height: insets.top, backgroundColor: palette.background }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  statusBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, opacity: 0.96 },
  content: { paddingHorizontal: 16, gap: 22 },
  hero: { gap: 10 },
  kicker: { fontSize: 13, fontWeight: '700', letterSpacing: 0.2 },
  heading: { fontSize: 32, fontWeight: '800', letterSpacing: -0.6 },
  lede: { fontSize: 15, lineHeight: 22 },
  section: { gap: 10 },
  sectionTitle: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8 },
  grid: { gap: 10 },
  tile: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
    padding: 14,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  badge: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 20, fontWeight: '700' },
  tileText: { flex: 1, gap: 3 },
  tileTitle: { fontSize: 16, fontWeight: '700' },
  tileDetail: { fontSize: 13, lineHeight: 18 },
});
