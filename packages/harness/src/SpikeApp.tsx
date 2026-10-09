import { useState } from 'react';
import { I18nManager, StatusBar, View } from 'react-native';
import { AutoScrollScreen } from './screens/AutoScrollScreen';
import { ChecklistScreen } from './screens/ChecklistScreen';
import { EmptyDropScreen } from './screens/EmptyDropScreen';
import { GestureScreen } from './screens/GestureScreen';
import { MoveToScreen } from './screens/MoveToScreen';
import { RollbackScreen } from './screens/RollbackScreen';
import { ScaleScreen } from './screens/ScaleScreen';
import { theme } from './theme';
import type { ScreenId } from './types';

export function SpikeApp({ host }: { host: 'Expo' | 'React Native CLI' }) {
  const [screen, setScreen] = useState<ScreenId>('home');
  const [rtl, setRtl] = useState(I18nManager.isRTL);
  const back = () => setScreen('home');
  return (
    <View style={{ flex: 1, backgroundColor: theme.bg, direction: rtl ? 'rtl' : 'ltr' }}>
      <StatusBar barStyle="light-content" />
      {screen === 'home' ? <ChecklistScreen host={host} rtl={rtl} onRtl={setRtl} onOpen={setScreen} /> : null}
      {screen === 'empty' ? <EmptyDropScreen onBack={back} /> : null}
      {screen === 'scale' ? <ScaleScreen onBack={back} /> : null}
      {screen === 'scroll' ? <AutoScrollScreen onBack={back} /> : null}
      {screen === 'gestures' ? <GestureScreen onBack={back} /> : null}
      {screen === 'rollback' ? <RollbackScreen onBack={back} /> : null}
      {screen === 'move' ? <MoveToScreen onBack={back} /> : null}
    </View>
  );
}
