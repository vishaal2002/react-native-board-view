import { use, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { CardContext } from '../context';
import { lightTheme } from '../theme';

export interface DragHandleProps {
  /** What to draw. Default: a six-dot grip in the board's muted text color. */
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Extra touch area around the handle. Default 8 on every side. */
  hitSlop?: number;
}

/**
 * Put this in `renderCard` and pass `moveModes={{ drag: 'handle' }}`: dragging
 * then starts from the handle as soon as the finger moves, and the rest of
 * the card keeps its taps and scrolling. In the other drag modes it only
 * draws its children. Screen readers skip it: the card already has move actions.
 */
export function DragHandle({ children, style, hitSlop = 8 }: DragHandleProps) {
  // The card context, not the board's: a handle inside every card must not redraw with each move.
  const board = use(CardContext);
  const color = (board?.theme ?? lightTheme).mutedText;
  const Handle = board?.adapter.Handle;
  const grip = children ?? (
    <View style={styles.grip}>
      {DOTS.map((dot) => (
        <View key={dot} style={[styles.dot, { backgroundColor: color }]} />
      ))}
    </View>
  );
  const content = (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {grip}
    </View>
  );
  if (!Handle) return <View style={style}>{content}</View>;
  return (
    <Handle style={[styles.area, style]} hitSlop={hitSlop}>
      {content}
    </Handle>
  );
}

const DOTS = [0, 1, 2, 3, 4, 5];

const styles = StyleSheet.create({
  area: { minWidth: 28, minHeight: 32, alignItems: 'center', justifyContent: 'center' },
  grip: { width: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 3 },
  dot: { width: 3.5, height: 3.5, borderRadius: 2 },
});
