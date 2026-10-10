import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Board, type BoardLayout, type BoardTheme, type CardRenderInfo } from 'react-native-board-view';
import { kanbanGroupBy, makeTasks, type Task } from '../data';
import { taskId, taskLabel } from '../ids';
import { Screen, Segmented, TaskCard, usePalette, type CardStyle } from '../ui';
import { useTaskStore } from '../useTaskStore';

type Preset = 'default' | 'ocean' | 'sunset' | 'mono';
type Indicator = 'line' | 'pill' | 'glow';

const PRESETS: Record<Exclude<Preset, 'default'>, { light: Partial<BoardTheme>; dark: Partial<BoardTheme> }> = {
  ocean: {
    light: {
      background: '#EAF4FA',
      columnBackground: '#D6EAF6',
      laneHeaderBackground: '#C8E1F2',
      cardBackground: '#FFFFFF',
      text: '#0B2540',
      mutedText: '#4B6A85',
      accent: '#0284C7',
      emptyCellBorder: '#9CC6E2',
    },
    dark: {
      background: '#06131D',
      columnBackground: '#0C2232',
      laneHeaderBackground: '#103049',
      cardBackground: '#12304A',
      cardBorder: 'rgba(56, 189, 248, 0.16)',
      text: '#E3F2FD',
      mutedText: '#8FB3CC',
      accent: '#38BDF8',
      emptyCellBorder: '#1E4A68',
    },
  },
  sunset: {
    light: {
      background: '#FFF5EF',
      columnBackground: '#FCE6DA',
      laneHeaderBackground: '#F8D9C8',
      cardBackground: '#FFFFFF',
      text: '#3A1A0C',
      mutedText: '#8A5A44',
      accent: '#EA580C',
      emptyCellBorder: '#EDB89C',
    },
    dark: {
      background: '#1A0E09',
      columnBackground: '#2A1610',
      laneHeaderBackground: '#381E15',
      cardBackground: '#3A2219',
      cardBorder: 'rgba(251, 146, 60, 0.16)',
      text: '#FDEBE1',
      mutedText: '#C99A84',
      accent: '#FB923C',
      emptyCellBorder: '#5A3325',
    },
  },
  mono: {
    light: {
      background: '#FFFFFF',
      columnBackground: '#F4F4F5',
      laneHeaderBackground: '#E4E4E7',
      cardBackground: '#FFFFFF',
      cardBorder: '#D4D4D8',
      text: '#09090B',
      mutedText: '#52525B',
      accent: '#18181B',
      emptyCellBorder: '#D4D4D8',
    },
    dark: {
      background: '#09090B',
      columnBackground: '#18181B',
      laneHeaderBackground: '#27272A',
      cardBackground: '#1F1F23',
      cardBorder: '#3F3F46',
      text: '#FAFAFA',
      mutedText: '#A1A1AA',
      accent: '#FAFAFA',
      emptyCellBorder: '#3F3F46',
    },
  },
};

function seed(): Task[] {
  return makeTasks(30, { seed: 41 });
}

export function ThemeScreen({ onBack }: { onBack: () => void }) {
  const palette = usePalette();
  const [preset, setPreset] = useState<Preset>('ocean');
  const [radius, setRadius] = useState(14);
  const [width, setWidth] = useState(280);
  const [cards, setCards] = useState<CardStyle>('rich');
  const [indicator, setIndicator] = useState<Indicator>('pill');
  const [layout, setLayout] = useState<BoardLayout>('auto');
  const store = useTaskStore(seed, kanbanGroupBy);

  const theme = useMemo<Partial<BoardTheme>>(() => {
    const colors = preset === 'default' ? {} : PRESETS[preset][palette.dark ? 'dark' : 'light'];
    return { ...colors, radius, cardRadius: Math.max(0, radius - 4), columnWidth: width };
  }, [palette.dark, preset, radius, width]);

  const accent = theme.accent ?? palette.accent;
  const renderDropIndicator = useMemo(() => {
    if (indicator === 'line') return undefined;
    if (indicator === 'pill') return () => <View style={[styles.pill, { backgroundColor: accent }]} />;
    return () => <View style={[styles.glow, { backgroundColor: accent, shadowColor: accent }]} />;
  }, [accent, indicator]);
  const renderCard = useCallback((info: CardRenderInfo<Task>) => <TaskCard info={info} variant={cards} />, [cards]);

  return (
    <Screen
      title="Theming"
      subtitle="Every color, radius and spacing is a theme token. Light and dark follow the system or your override."
      onBack={onBack}
      toolbar={
        <>
          <Segmented
            label="Palette"
            options={[
              { label: 'Default', value: 'default' },
              { label: 'Ocean', value: 'ocean' },
              { label: 'Sunset', value: 'sunset' },
              { label: 'Mono', value: 'mono' },
            ]}
            value={preset}
            onChange={setPreset}
          />
          <Segmented
            label="Radius"
            options={[
              { label: '0', value: 0 },
              { label: '8', value: 8 },
              { label: '14', value: 14 },
              { label: '22', value: 22 },
            ]}
            value={radius}
            onChange={setRadius}
          />
          <Segmented
            label="Drop indicator"
            options={[
              { label: 'Line', value: 'line' },
              { label: 'Pill', value: 'pill' },
              { label: 'Glow', value: 'glow' },
            ]}
            value={indicator}
            onChange={setIndicator}
          />
          <Segmented
            label="Cards"
            options={[
              { label: 'Rich', value: 'rich' },
              { label: 'Compact', value: 'compact' },
              { label: 'Minimal', value: 'minimal' },
            ]}
            value={cards}
            onChange={setCards}
          />
          <Segmented
            label="Column width"
            options={[
              { label: '240', value: 240 },
              { label: '280', value: 280 },
              { label: '340', value: 340 },
            ]}
            value={width}
            onChange={setWidth}
          />
          <Segmented
            label="Layout"
            options={[
              { label: 'Auto', value: 'auto' },
              { label: 'Multi', value: 'multi' },
              { label: 'Fit', value: 'fit' },
            ]}
            value={layout}
            onChange={setLayout}
          />
        </>
      }
    >
      <Board
        items={store.items}
        getItemId={taskId}
        getItemLabel={taskLabel}
        groupBy={kanbanGroupBy}
        onMove={store.onMove}
        renderCard={renderCard}
        renderDropIndicator={renderDropIndicator}
        theme={theme}
        layout={layout}
        appearance={palette.dark ? 'dark' : 'light'}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  pill: { flex: 1, height: 6, marginTop: -1.5, borderRadius: 3 },
  glow: {
    flex: 1,
    borderRadius: 2,
    shadowOpacity: 0.9,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
});
