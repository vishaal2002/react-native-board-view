import { useCallback, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Board, type BoardLayout, type CardRenderInfo } from 'react-native-board-view';
import { PEOPLE, kanbanGroupBy, makeTasks, swimlaneGroupBy, type Task } from '../data';
import { taskId, taskLabel } from '../ids';
import { Screen, Segmented, TaskCard, Toggle, useAppearance } from '../ui';
import { useTaskStore } from '../useTaskStore';

const LAYOUTS = [
  { label: 'Paged', value: 'paged' },
  { label: 'Multi', value: 'multi' },
  { label: 'Fit', value: 'fit' },
  { label: 'Stacked', value: 'stacked' },
] as const;

const laneLabels = { noValue: 'Unassigned' };

function seed(): Task[] {
  return makeTasks(30, { seed: 3, assignees: PEOPLE.map((person) => person.id) });
}

/**
 * A board the way an app would ship it: no paging, no simulated server, no
 * extra rules. Most README captures come from this screen.
 */
export function ShowcaseScreen({ onBack }: { onBack: () => void }) {
  const { palette, appearance, setAppearance } = useAppearance();
  const [layout, setLayout] = useState<BoardLayout>('paged');
  const [lanes, setLanes] = useState(false);
  const groupBy = lanes ? swimlaneGroupBy : kanbanGroupBy;
  const store = useTaskStore(seed, groupBy);
  const renderCard = useCallback(
    (info: CardRenderInfo<Task>) => <TaskCard info={info} variant={lanes ? 'compact' : 'rich'} />,
    [lanes],
  );
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const board = (
    <Board
      items={store.items}
      getItemId={taskId}
      getItemLabel={taskLabel}
      groupBy={groupBy}
      onMove={store.onMove}
      renderCard={renderCard}
      layout={layout}
      laneCellLimit={3}
      labels={lanes ? laneLabels : undefined}
      appearance={palette.dark ? 'dark' : 'light'}
    />
  );

  // Landscape is the tablet preview: the board gets the whole screen.
  if (window.width > window.height) {
    return (
      <View
        style={[
          styles.fill,
          {
            backgroundColor: palette.background,
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
            paddingLeft: insets.left,
            paddingRight: insets.right,
          },
        ]}
      >
        {board}
      </View>
    );
  }

  return (
    <Screen
      title="Sprint 42"
      onBack={onBack}
      toolbar={
        <>
          <Segmented label="Layout" options={LAYOUTS} value={layout} onChange={setLayout} />
          <Toggle label="Lanes" value={lanes} onChange={setLanes} />
          <Segmented
            label="Theme"
            options={[
              { label: 'Light', value: 'light' },
              { label: 'Dark', value: 'dark' },
            ]}
            value={appearance === 'dark' || (appearance === 'auto' && palette.dark) ? 'dark' : 'light'}
            onChange={setAppearance}
          />
        </>
      }
    >
      {board}
    </Screen>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
