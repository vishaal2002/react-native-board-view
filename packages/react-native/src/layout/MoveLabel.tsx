import { StyleSheet, Text, View } from 'react-native';
import { useBoard } from '../context';
import { moveTargetOf } from '../useBoardController';

/**
 * `describeMove`'s line, in a pill under the lifted card, where the finger is:
 * the card itself covers its slot. It reads the placement, so it draws again
 * only when the slot changes.
 */
export function MoveLabel() {
  const board = useBoard();
  const placement = board.adapter.usePlacementState();
  const describe = board.props.describeMove;
  if (!placement || !describe) return null;
  const item = board.controller.itemsById.get(placement.itemId);
  if (item == null) return null;
  const selected = board.selection.get();
  const itemIds = selected.has(placement.itemId) ? [...selected] : [placement.itemId];
  const text = describe({
    item,
    itemId: placement.itemId,
    itemIds,
    from: moveTargetOf(placement.sourceCellId),
    to: moveTargetOf(placement.cellId),
    index: placement.index,
  });
  if (!text) return null;
  return (
    <View style={styles.box} pointerEvents="none">
      <View style={[styles.pill, { backgroundColor: board.theme.text }]}>
        <Text
          numberOfLines={2}
          style={[
            styles.text,
            { color: board.theme.background },
            board.theme.fontFamily ? { fontFamily: board.theme.fontFamily } : null,
          ]}
        >
          {text}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { position: 'absolute', top: '100%', left: -24, right: -24, alignItems: 'center', marginTop: 8 },
  pill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, maxWidth: 260 },
  text: { fontSize: 12, fontWeight: '700', textAlign: 'center' },
});
