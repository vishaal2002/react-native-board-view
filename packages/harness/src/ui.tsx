import { createContext, memo, use, useEffect, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { useFrameCallback, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CardView, type CardRenderInfo } from 'react-native-board-view';
import { PRIORITY_COLORS, TAG_COLORS, personName, type Task } from './data';
import type { LogEntry } from './useTaskStore';

export interface Palette {
  dark: boolean;
  background: string;
  surface: string;
  raised: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
  good: string;
  bad: string;
}

const light: Palette = {
  dark: false,
  background: '#F3F4F7',
  surface: '#FFFFFF',
  raised: '#E9EBF0',
  border: '#DDE1E8',
  text: '#162033',
  muted: '#5B677A',
  accent: '#2F6FEB',
  good: '#1F9D63',
  bad: '#D93F3F',
};

const dark: Palette = {
  dark: true,
  background: '#0E1116',
  surface: '#171B22',
  raised: '#222833',
  border: '#2A313C',
  text: '#E8ECF2',
  muted: '#98A2B3',
  accent: '#6EA0FF',
  good: '#4CD394',
  bad: '#FF7A7A',
};

export type Appearance = 'auto' | 'light' | 'dark';

interface AppearanceContextValue {
  appearance: Appearance;
  setAppearance: (value: Appearance) => void;
  palette: Palette;
}

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme();
  const [appearance, setAppearance] = useState<Appearance>('auto');
  const isDark = appearance === 'dark' || (appearance === 'auto' && scheme === 'dark');
  return (
    <AppearanceContext value={{ appearance, setAppearance, palette: isDark ? dark : light }}>
      {children}
    </AppearanceContext>
  );
}

export function useAppearance(): AppearanceContextValue {
  const value = use(AppearanceContext);
  if (!value) throw new Error('AppearanceProvider missing');
  return value;
}

export function usePalette(): Palette {
  return useAppearance().palette;
}

export function Screen({
  title,
  subtitle,
  onBack,
  toolbar,
  footer,
  children,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  toolbar?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.screen, { backgroundColor: palette.background, paddingTop: insets.top }]}>
      <View style={styles.header}>
        {onBack ? (
          <Pressable
            onPress={onBack}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={styles.back}
          >
            <View style={[styles.backChevron, { borderColor: palette.accent }]} />
          </Pressable>
        ) : null}
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: palette.text }]} numberOfLines={1} accessibilityRole="header">
            {title}
          </Text>
          {subtitle ? (
            <Text style={[styles.subtitle, { color: palette.muted }]} numberOfLines={2}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>
      {toolbar ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.toolbarScroll}
          contentContainerStyle={styles.toolbar}
        >
          {toolbar}
        </ScrollView>
      ) : null}
      <View style={styles.body}>{children}</View>
      {footer ? (
        <View style={{ paddingBottom: insets.bottom }}>{footer}</View>
      ) : (
        <View style={{ height: insets.bottom }} />
      )}
    </View>
  );
}

export function Segmented<V extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label?: string;
  options: readonly { label: string; value: V }[];
  value: V;
  onChange: (value: V) => void;
}) {
  const palette = usePalette();
  return (
    <View style={styles.control}>
      {label ? <Text style={[styles.controlLabel, { color: palette.muted }]}>{label}</Text> : null}
      <View style={[styles.segmented, { backgroundColor: palette.raised }]} accessibilityRole="radiogroup">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={String(option.value)}
              onPress={() => onChange(option.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              style={[styles.segment, selected ? { backgroundColor: palette.surface } : null]}
            >
              <Text style={[styles.segmentText, { color: selected ? palette.text : palette.muted }]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  const palette = usePalette();
  return (
    <Pressable
      onPress={() => onChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      style={[styles.toggle, { backgroundColor: value ? palette.accent : palette.raised }]}
    >
      <Text style={[styles.segmentText, { color: value ? '#FFFFFF' : palette.muted }]}>{label}</Text>
    </Pressable>
  );
}

export function ActionButton({
  label,
  onPress,
  tone = 'default',
}: {
  label: string;
  onPress: () => void;
  tone?: 'default' | 'accent';
}) {
  const palette = usePalette();
  const accent = tone === 'accent';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.toggle,
        { backgroundColor: accent ? palette.accent : palette.raised, opacity: pressed ? 0.75 : 1 },
      ]}
    >
      <Text style={[styles.segmentText, { color: accent ? '#FFFFFF' : palette.text }]}>{label}</Text>
    </Pressable>
  );
}

export function Stat({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' }) {
  const palette = usePalette();
  const color = tone === 'good' ? palette.good : tone === 'bad' ? palette.bad : palette.text;
  return (
    <View style={[styles.stat, { backgroundColor: palette.surface, borderColor: palette.border }]}>
      <Text style={[styles.statLabel, { color: palette.muted }]}>{label}</Text>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
    </View>
  );
}

export function EventLog({
  entries,
  height = 132,
  empty = 'Moves show up here.',
}: {
  entries: readonly LogEntry[];
  height?: number;
  empty?: string;
}) {
  const palette = usePalette();
  return (
    <View style={[styles.log, { height, backgroundColor: palette.surface, borderColor: palette.border }]}>
      <ScrollView contentContainerStyle={styles.logContent}>
        {entries.length === 0 ? <Text style={[styles.logLine, { color: palette.muted }]}>{empty}</Text> : null}
        {entries.map((entry) => (
          <Text
            key={entry.id}
            numberOfLines={1}
            style={[
              styles.logLine,
              { color: entry.tone === 'good' ? palette.good : entry.tone === 'bad' ? palette.bad : palette.muted },
            ]}
          >
            {entry.text}
          </Text>
        ))}
      </ScrollView>
    </View>
  );
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

const WINDOW_MS = 500;
const WINDOWS = 12;

/**
 * Median JS-thread and UI-thread frame rates over the last few seconds.
 * UI frames are counted on the UI thread and read twice a second, so the
 * meter does not load the JS thread it measures. Meaningful in release builds.
 */
export function FpsMeter() {
  const palette = usePalette();
  const uiFrames = useSharedValue(0);
  const [readout, setReadout] = useState({ js: 0, ui: 0 });

  useFrameCallback(() => {
    'worklet';
    uiFrames.value += 1;
  });

  useEffect(() => {
    let jsFrames = 0;
    let frame = 0;
    const tick = () => {
      jsFrames += 1;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    let last = Date.now();
    let lastUi = uiFrames.value;
    const js: number[] = [];
    const ui: number[] = [];
    const timer = setInterval(() => {
      const now = Date.now();
      const seconds = (now - last) / 1000;
      last = now;
      const uiNow = uiFrames.value;
      js.push(jsFrames / seconds);
      ui.push((uiNow - lastUi) / seconds);
      jsFrames = 0;
      lastUi = uiNow;
      if (js.length > WINDOWS) js.shift();
      if (ui.length > WINDOWS) ui.shift();
      setReadout({ js: Math.round(median(js)), ui: Math.round(median(ui)) });
    }, WINDOW_MS);
    return () => {
      cancelAnimationFrame(frame);
      clearInterval(timer);
    };
  }, [uiFrames]);

  return (
    <View style={[styles.fps, { backgroundColor: palette.surface, borderColor: palette.border }]} pointerEvents="none">
      <Text style={[styles.fpsText, { color: palette.text }]}>
        JS {readout.js} · UI {readout.ui}
      </Text>
      <Text style={[styles.fpsNote, { color: palette.muted }]}>{__DEV__ ? 'debug build' : 'release build'}</Text>
    </View>
  );
}

export type CardStyle = 'rich' | 'minimal' | 'compact';

/** The demo's renderCard: the library's CardView with task data. */
export const TaskCard = memo(function TaskCard({
  info,
  variant = 'rich',
}: {
  info: CardRenderInfo<Task>;
  variant?: CardStyle;
}) {
  const { item, pending, dragging, compact } = info;
  const minHeight = item.height ? { minHeight: item.height } : undefined;
  if (variant === 'minimal' || compact) {
    return (
      <CardView
        title={item.title}
        accentColor={compact ? PRIORITY_COLORS[item.priority] : undefined}
        pending={pending}
        dragging={dragging}
        compact={compact}
        style={minHeight}
      />
    );
  }
  if (variant === 'compact') {
    return (
      <CardView
        title={item.title}
        accentColor={PRIORITY_COLORS[item.priority]}
        assignee={personName(item.assignee)}
        pending={pending}
        dragging={dragging}
      />
    );
  }
  return (
    <CardView
      title={item.locked ? `🔒 ${item.title}` : item.title}
      description={item.description}
      tags={item.tags.map((tag) => ({ label: tag, color: TAG_COLORS[tag] }))}
      meta={item.due ? `Due ${item.due}` : undefined}
      assignee={personName(item.assignee)}
      accentColor={PRIORITY_COLORS[item.priority]}
      pending={pending}
      dragging={dragging}
      style={minHeight}
    />
  );
});

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 6,
  },
  back: { width: 32, height: 36, justifyContent: 'center' },
  backChevron: {
    width: 12,
    height: 12,
    borderLeftWidth: 2.5,
    borderBottomWidth: 2.5,
    transform: [{ rotate: '45deg' }],
    marginLeft: 6,
  },
  headerText: { flex: 1 },
  title: { fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
  subtitle: { fontSize: 13, lineHeight: 18, marginTop: 2 },
  toolbarScroll: { flexGrow: 0 },
  toolbar: { paddingHorizontal: 16, paddingVertical: 8, gap: 10, alignItems: 'flex-end' },
  body: { flex: 1 },
  control: { gap: 4 },
  controlLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginLeft: 2 },
  segmented: { flexDirection: 'row', borderRadius: 10, padding: 3 },
  segment: { paddingHorizontal: 12, height: 30, borderRadius: 8, justifyContent: 'center' },
  segmentText: { fontSize: 13, fontWeight: '700' },
  toggle: { paddingHorizontal: 14, height: 36, borderRadius: 10, justifyContent: 'center' },
  stat: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: StyleSheet.hairlineWidth,
    minWidth: 84,
  },
  statLabel: { fontSize: 11, fontWeight: '600' },
  statValue: { fontSize: 16, fontWeight: '800', fontVariant: ['tabular-nums'] },
  log: { marginHorizontal: 12, marginTop: 6, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth },
  logContent: { padding: 10, gap: 3 },
  logLine: { fontSize: 12, fontWeight: '500', fontVariant: ['tabular-nums'] },
  fps: {
    position: 'absolute',
    top: 8,
    right: 12,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: StyleSheet.hairlineWidth,
    zIndex: 50,
  },
  fpsText: { fontSize: 12, fontWeight: '800', fontVariant: ['tabular-nums'] },
  fpsNote: { fontSize: 10 },
});
