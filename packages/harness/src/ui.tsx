import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFrameCallback } from 'react-native-reanimated';
import { runOnJS } from 'react-native-worklets';
import { theme } from './theme';

export function Screen({
  title,
  subtitle,
  onBack,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        {onBack ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Back to checklist" onPress={onBack} style={styles.back}>
            <Text style={styles.backText}>Checklist</Text>
          </Pressable>
        ) : null}
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      <View style={styles.body}>{children}</View>
      {footer}
    </View>
  );
}

export function Button({
  label,
  onPress,
  tone = 'default',
}: {
  label: string;
  onPress: () => void;
  tone?: 'default' | 'danger' | 'good';
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.button}>
      <Text style={[styles.buttonText, tone === 'danger' && { color: theme.bad }, tone === 'good' && { color: theme.good }]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Stat({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, warn && { color: theme.bad }]}>{value}</Text>
    </View>
  );
}

export interface DropEntry {
  id: string;
  text: string;
  bad?: boolean;
}

export function DropLog({ entries }: { entries: readonly DropEntry[] }) {
  return (
    <View style={styles.log}>
      <Text style={styles.logTitle}>Drop log</Text>
      {entries.length === 0 ? <Text style={styles.subtitle}>Drops land here.</Text> : null}
      {entries.slice(0, 6).map((entry) => (
        <Text key={entry.id} style={[styles.logLine, entry.bad && { color: theme.bad }]}>
          {entry.text}
        </Text>
      ))}
    </View>
  );
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2 : (sorted[mid] ?? 0);
}

export function FpsMeter() {
  const jsSamples = useRef<number[]>([]);
  const uiSamples = useRef<number[]>([]);
  const [readout, setReadout] = useState({ js: 0, ui: 0 });

  useEffect(() => {
    let last = Date.now();
    let frame = 0;
    const tick = () => {
      const now = Date.now();
      const dt = now - last;
      last = now;
      if (dt > 0 && dt < 250) {
        jsSamples.current.push(1000 / dt);
        if (jsSamples.current.length > 90) jsSamples.current.shift();
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const timer = setInterval(() => {
      setReadout({ js: Math.round(median(jsSamples.current)), ui: Math.round(median(uiSamples.current)) });
    }, 400);
    return () => {
      cancelAnimationFrame(frame);
      clearInterval(timer);
    };
  }, []);

  const pushUi = (fps: number) => {
    uiSamples.current.push(fps);
    if (uiSamples.current.length > 90) uiSamples.current.shift();
  };

  useFrameCallback((frame) => {
    'worklet';
    const dt = frame.timeSincePreviousFrame;
    if (dt && dt > 0 && dt < 250) runOnJS(pushUi)(1000 / dt);
  });

  return (
    <View style={styles.fps}>
      <Text style={styles.fpsText}>JS {readout.js} · UI {readout.ui}</Text>
      <Text style={styles.fpsNote}>Dev figures. Score S3 on a release build.</Text>
    </View>
  );
}

export function CardFace({ title, detail, height }: { title: string; detail?: string; height?: number }) {
  return (
    <View style={[styles.card, height ? { height } : null]}>
      <Text style={styles.cardTitle}>{title}</Text>
      {detail ? <Text style={styles.cardDetail}>{detail}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8, gap: 4 },
  body: { flex: 1 },
  title: { color: theme.text, fontSize: 22, fontWeight: '700' },
  subtitle: { color: theme.muted, fontSize: 13, lineHeight: 18 },
  back: { alignSelf: 'flex-start', paddingVertical: 4 },
  backText: { color: theme.accent, fontSize: 15, fontWeight: '600' },
  button: {
    backgroundColor: theme.panel,
    borderColor: theme.line,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  buttonText: { color: theme.text, fontSize: 14, fontWeight: '600' },
  stat: { backgroundColor: theme.panel, borderRadius: 10, padding: 8, minWidth: 88 },
  statLabel: { color: theme.muted, fontSize: 11 },
  statValue: { color: theme.text, fontSize: 16, fontWeight: '700' },
  log: { paddingHorizontal: 16, paddingBottom: 12, gap: 2 },
  logTitle: { color: theme.muted, fontSize: 12, fontWeight: '700' },
  logLine: { color: theme.text, fontSize: 12 },
  fps: {
    position: 'absolute',
    top: 8,
    right: 12,
    backgroundColor: '#0c1118cc',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    zIndex: 20,
  },
  fpsText: { color: theme.text, fontSize: 12, fontWeight: '700' },
  fpsNote: { color: theme.muted, fontSize: 10 },
  card: {
    backgroundColor: theme.card,
    borderRadius: 10,
    marginHorizontal: 8,
    marginVertical: 4,
    padding: 10,
    minHeight: 56,
    justifyContent: 'center',
  },
  cardTitle: { color: theme.text, fontSize: 15, fontWeight: '600' },
  cardDetail: { color: theme.muted, fontSize: 12, marginTop: 2 },
});
