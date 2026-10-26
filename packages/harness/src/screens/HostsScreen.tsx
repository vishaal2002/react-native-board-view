import BottomSheet from '@gorhom/bottom-sheet';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import PagerView from 'react-native-pager-view';
import { Board, type CardRenderInfo } from 'react-native-board-view';
import { kanbanGroupBy, makeTasks, type Task } from '../data';
import { taskId, taskLabel } from '../ids';
import { EventLog, Screen, Segmented, Stat, TaskCard, usePalette, type Palette } from '../ui';
import { useTaskStore } from '../useTaskStore';

type Host = 'pager' | 'sheet' | 'scroll';

const HOSTS = [
  { label: 'Pager', value: 'pager' },
  { label: 'Bottom sheet', value: 'sheet' },
  { label: 'Scroll view', value: 'scroll' },
] as const;

const SNAP_POINTS = ['45%', '92%'];
const SCROLL_BOARD_HEIGHT = 520;

function seed(): Task[] {
  return makeTasks(120, { seed: 8 });
}

/**
 * S8: the board inside the screens apps put it in. A pager (Material top
 * tabs use one), a bottom sheet and a scrolling screen. Each must keep its
 * own gesture: page swipes, sheet drags and screen scrolls still work, and
 * card drags never move the host.
 */
export function HostsScreen({ onBack }: { onBack: () => void }) {
  const palette = usePalette();
  const [host, setHost] = useState<Host>('pager');
  const [hostState, setHostState] = useState('');
  const store = useTaskStore(seed, kanbanGroupBy);
  const renderCard = useCallback((info: CardRenderInfo<Task>) => <TaskCard info={info} variant="minimal" />, []);

  const board = (
    <Board
      items={store.items}
      getItemId={taskId}
      getItemLabel={taskLabel}
      groupBy={kanbanGroupBy}
      onMove={store.onMove}
      renderCard={renderCard}
      appearance={palette.dark ? 'dark' : 'light'}
    />
  );

  const changeHost = useCallback((next: Host) => {
    setHost(next);
    setHostState('');
  }, []);

  return (
    <Screen
      title="S8 · Hosts"
      subtitle="The board in a pager, a bottom sheet and a scroll view. Page, drag the sheet and scroll, then drag cards: the host must never move during a card drag."
      onBack={onBack}
      toolbar={
        <>
          <Segmented label="Host" options={HOSTS} value={host} onChange={changeHost} />
          <Stat label="Host" value={hostState || '–'} />
        </>
      }
      footer={<EventLog entries={store.log} height={80} />}
    >
      {host === 'pager' ? <PagerHost board={board} palette={palette} onState={setHostState} /> : null}
      {host === 'sheet' ? <SheetHost board={board} palette={palette} onState={setHostState} /> : null}
      {host === 'scroll' ? <ScrollHost board={board} palette={palette} onState={setHostState} /> : null}
    </Screen>
  );
}

interface HostProps {
  board: ReactNode;
  palette: Palette;
  onState: (state: string) => void;
}

function Filler({ label, palette, height }: { label: string; palette: Palette; height?: number }) {
  return (
    <View style={[styles.filler, { borderColor: palette.border, height }]}>
      <Text style={{ color: palette.muted }}>{label}</Text>
    </View>
  );
}

/** Three tabs with the board in the middle, so it has a neighbour on each side. */
function PagerHost({ board, palette, onState }: HostProps) {
  return (
    <PagerView
      style={styles.fill}
      initialPage={1}
      onPageSelected={(event) => onState(`page ${event.nativeEvent.position + 1}/3`)}
    >
      <View key="inbox" style={styles.page}>
        <Filler label="Inbox tab" palette={palette} />
      </View>
      <View key="board" style={styles.fill}>
        {board}
      </View>
      <View key="notes" style={styles.page}>
        <Filler label="Notes tab" palette={palette} />
      </View>
    </PagerView>
  );
}

function SheetHost({ board, palette, onState }: HostProps) {
  const snapPoints = useMemo(() => SNAP_POINTS, []);
  return (
    <View style={styles.fill}>
      <Filler label="Screen behind the sheet" palette={palette} />
      <BottomSheet
        index={0}
        snapPoints={snapPoints}
        // The board fills the sheet and has no height of its own to size it by.
        enableDynamicSizing={false}
        // The sheet moves by its handle only, so the board's columns keep their vertical scroll.
        enableContentPanningGesture={false}
        onChange={(index) => onState(`sheet ${SNAP_POINTS[index] ?? 'closed'}`)}
        backgroundStyle={{ backgroundColor: palette.surface }}
        handleIndicatorStyle={{ backgroundColor: palette.muted }}
      >
        <View style={styles.fill}>{board}</View>
      </BottomSheet>
    </View>
  );
}

function ScrollHost({ board, palette, onState }: HostProps) {
  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => onState(`y ${Math.round(event.nativeEvent.contentOffset.y)}`),
    [onState],
  );
  return (
    <ScrollView style={styles.fill} onScroll={onScroll} scrollEventThrottle={64}>
      <Filler label="Content above the board" palette={palette} height={280} />
      <View style={{ height: SCROLL_BOARD_HEIGHT }}>{board}</View>
      <Filler label="Content below the board" palette={palette} height={900} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  page: { flex: 1, padding: 16 },
  filler: {
    margin: 16,
    minHeight: 120,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
