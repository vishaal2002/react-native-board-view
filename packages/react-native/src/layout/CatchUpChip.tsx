import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp, FadeOut } from 'react-native-reanimated';
import { useBoard } from '../context';

/** "7 moved · 2 new", at the top of the board for a moment after `initialSnapshot` plays. */
export function CatchUpChip({ text }: { text: string }) {
  const { theme, reducedMotion } = useBoard();
  return (
    <View pointerEvents="none" style={styles.box}>
      <Animated.View
        entering={reducedMotion ? undefined : FadeInUp.duration(200)}
        exiting={reducedMotion ? undefined : FadeOut.duration(200)}
        style={[styles.chip, { backgroundColor: theme.text }]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Text
          style={[styles.text, { color: theme.background }, theme.fontFamily ? { fontFamily: theme.fontFamily } : null]}
        >
          {text}
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { position: 'absolute', top: 8, left: 0, right: 0, alignItems: 'center', zIndex: 1001, elevation: 1001 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16 },
  text: { fontSize: 13, fontWeight: '700' },
});
