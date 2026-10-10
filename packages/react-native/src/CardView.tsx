import { memo, use, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { BoardContext } from './context';
import { lightTheme } from './theme';
import type { BoardTheme } from './types';

export interface CardTag {
  label: string;
  color?: string;
}

export interface CardViewProps {
  title: string;
  description?: string;
  tags?: readonly CardTag[];
  /** Small text in the footer, e.g. a due date. */
  meta?: string;
  /** Shown as initials in the footer. */
  assignee?: string;
  /** Colored bar on the leading edge, e.g. priority. */
  accentColor?: string;
  /** Pass `info.pending` to show a quiet "saving" state. */
  pending?: boolean;
  /** Pass `info.dragging` for the lifted look. */
  dragging?: boolean;
  /** Pass `info.compact` in narrow columns: title and accent only. */
  compact?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}

/** The theme of the surrounding board, or the light theme outside one. */
export function useBoardTheme(): BoardTheme {
  return use(BoardContext)?.theme ?? lightTheme;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

function tint(color: string, alpha: number): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(color)?.[1];
  if (!hex) return color;
  const value = Number.parseInt(hex, 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}

/**
 * A ready-made card for `renderCard`. Optional: the board accepts any view.
 * Follows the board theme, so it matches light, dark and custom themes.
 */
export const CardView = memo(function CardView({
  title,
  description,
  tags,
  meta,
  assignee,
  accentColor,
  pending = false,
  dragging = false,
  compact = false,
  onPress,
  style,
  children,
}: CardViewProps) {
  const theme = useBoardTheme();
  const fontFamily = theme.fontFamily ? { fontFamily: theme.fontFamily } : null;
  const body = (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.cardBackground,
          borderColor: dragging ? theme.accent : theme.cardBorder,
          borderRadius: theme.cardRadius,
        },
        dragging ? styles.lifted : styles.resting,
        style,
      ]}
    >
      {accentColor ? <View style={[styles.accent, { backgroundColor: accentColor }]} /> : null}
      {compact ? (
        <View style={styles.compactContent}>
          <Text style={[styles.compactTitle, { color: theme.text }, fontFamily]} numberOfLines={3}>
            {title}
          </Text>
          {pending ? <View style={[styles.saving, { backgroundColor: theme.accent }]} /> : null}
        </View>
      ) : (
        <View style={styles.content}>
          <Text style={[styles.title, { color: theme.text }, fontFamily]} numberOfLines={3}>
            {title}
          </Text>
          {description ? (
            <Text style={[styles.description, { color: theme.mutedText }, fontFamily]} numberOfLines={2}>
              {description}
            </Text>
          ) : null}
          {tags && tags.length > 0 ? (
            <View style={styles.tags}>
              {tags.map((tag) => (
                <View
                  key={tag.label}
                  style={[styles.tag, { backgroundColor: tint(tag.color ?? theme.mutedText, 0.14) }]}
                >
                  <Text style={[styles.tagText, { color: tag.color ?? theme.mutedText }, fontFamily]}>{tag.label}</Text>
                </View>
              ))}
            </View>
          ) : null}
          {children}
          {meta || assignee || pending ? (
            <View style={styles.footer}>
              {pending ? <View style={[styles.saving, { backgroundColor: theme.accent }]} /> : null}
              <Text style={[styles.meta, { color: theme.mutedText }, fontFamily]} numberOfLines={1}>
                {meta ?? ''}
              </Text>
              {assignee ? (
                <View style={[styles.avatar, { backgroundColor: tint(theme.accent, 0.16) }]}>
                  <Text style={[styles.avatarText, { color: theme.accent }]}>{initials(assignee)}</Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => (pressed ? styles.pressed : null)}>
      {body}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: { flexDirection: 'row', borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  resting: {
    shadowColor: '#0B1220',
    shadowOpacity: 0.06,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  lifted: {
    shadowColor: '#0B1220',
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  accent: { width: 4 },
  content: { flex: 1, paddingHorizontal: 12, paddingVertical: 11, gap: 6 },
  title: { fontSize: 15, fontWeight: '600', lineHeight: 20, paddingRight: 22 },
  compactContent: { flex: 1, paddingHorizontal: 8, paddingVertical: 8, gap: 6 },
  compactTitle: { fontSize: 13, fontWeight: '600', lineHeight: 17 },
  description: { fontSize: 13, lineHeight: 18 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: { paddingHorizontal: 8, paddingVertical: 2, minHeight: 22, borderRadius: 11, justifyContent: 'center' },
  tagText: { fontSize: 12, fontWeight: '600' },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  saving: { width: 6, height: 6, borderRadius: 3 },
  meta: { flex: 1, fontSize: 12, fontWeight: '500' },
  avatar: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 11, fontWeight: '700' },
  pressed: { opacity: 0.85 },
});
