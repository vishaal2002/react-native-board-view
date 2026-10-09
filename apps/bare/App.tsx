import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SpikeApp } from 'board-view-harness';

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SpikeApp host="React Native CLI" />
    </GestureHandlerRootView>
  );
}
