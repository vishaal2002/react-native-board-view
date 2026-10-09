import { useSyncExternalStore } from 'react';
import type { MoveQueue, MoveQueueSnapshot } from 'react-native-board-view-core';

export function useMoveQueueSnapshot(queue: MoveQueue): MoveQueueSnapshot {
  return useSyncExternalStore(queue.subscribe, queue.getSnapshot, queue.getSnapshot);
}
