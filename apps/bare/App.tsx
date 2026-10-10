import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { DemoApp } from 'board-view-harness';

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <DemoApp host="React Native CLI" />
    </GestureHandlerRootView>
  );
}
