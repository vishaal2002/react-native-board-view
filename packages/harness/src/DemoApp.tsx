import { useCallback, useEffect, useState } from 'react';
import { BackHandler, StatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { Route } from './routes';
import { AccessibilityScreen } from './screens/AccessibilityScreen';
import { AutoScrollScreen } from './screens/AutoScrollScreen';
import { ChecklistScreen } from './screens/ChecklistScreen';
import { CustomScreen } from './screens/CustomScreen';
import { EmptyCellsScreen } from './screens/EmptyCellsScreen';
import { HomeScreen } from './screens/HomeScreen';
import { KanbanScreen } from './screens/KanbanScreen';
import { LiveDataScreen } from './screens/LiveDataScreen';
import { RollbackScreen } from './screens/RollbackScreen';
import { RulesScreen } from './screens/RulesScreen';
import { ScaleScreen } from './screens/ScaleScreen';
import { ShowcaseScreen } from './screens/ShowcaseScreen';
import { SwimlaneScreen } from './screens/SwimlaneScreen';
import { ThemeScreen } from './screens/ThemeScreen';
import { AppearanceProvider, usePalette } from './ui';

function Router({ host }: { host: string }) {
  const palette = usePalette();
  const [stack, setStack] = useState<Route[]>(['home']);
  const route = stack[stack.length - 1] ?? 'home';
  const open = useCallback((next: Route) => setStack((current) => [...current, next]), []);
  const back = useCallback(() => setStack((current) => (current.length > 1 ? current.slice(0, -1) : current)), []);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (stack.length <= 1) return false;
      back();
      return true;
    });
    return () => subscription.remove();
  }, [back, stack.length]);

  let screen;
  switch (route) {
    case 'home':
      screen = <HomeScreen host={host} onOpen={open} />;
      break;
    case 'kanban':
      screen = <KanbanScreen onBack={back} />;
      break;
    case 'kanban-paged':
      screen = <KanbanScreen onBack={back} initialLayout="paged" />;
      break;
    case 'kanban-multi':
      screen = <KanbanScreen onBack={back} initialLayout="multi" />;
      break;
    case 'kanban-fit':
      screen = <KanbanScreen onBack={back} initialLayout="fit" />;
      break;
    case 'kanban-stacked':
      screen = <KanbanScreen onBack={back} initialLayout="stacked" />;
      break;
    case 'swimlanes':
      screen = <SwimlaneScreen onBack={back} />;
      break;
    case 'swimlanes-stacked':
      screen = <SwimlaneScreen onBack={back} initialLayout="stacked" />;
      break;
    case 'showcase':
      screen = <ShowcaseScreen onBack={back} />;
      break;
    case 'live':
      screen = <LiveDataScreen onBack={back} />;
      break;
    case 'rollback':
      screen = <RollbackScreen onBack={back} />;
      break;
    case 'rules':
      screen = <RulesScreen onBack={back} />;
      break;
    case 'a11y':
      screen = <AccessibilityScreen onBack={back} />;
      break;
    case 'theme':
      screen = <ThemeScreen onBack={back} />;
      break;
    case 'custom':
      screen = <CustomScreen onBack={back} />;
      break;
    case 'scale':
      screen = <ScaleScreen onBack={back} />;
      break;
    case 'autoscroll':
      screen = <AutoScrollScreen onBack={back} />;
      break;
    case 'empty':
      screen = <EmptyCellsScreen onBack={back} />;
      break;
    case 'checklist':
      screen = <ChecklistScreen onBack={back} onOpen={open} />;
      break;
  }

  return (
    <View style={[styles.root, { backgroundColor: palette.background }]}>
      <StatusBar barStyle={palette.dark ? 'light-content' : 'dark-content'} />
      {screen}
    </View>
  );
}

/** The example app, shared by the Expo and React Native CLI hosts. */
export function DemoApp({ host }: { host: 'Expo' | 'React Native CLI' }) {
  return (
    <SafeAreaProvider>
      <AppearanceProvider>
        <Router host={host} />
      </AppearanceProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
