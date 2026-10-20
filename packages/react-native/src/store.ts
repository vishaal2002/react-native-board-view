/** Minimal observable value, so a few components can follow it without re-rendering the board. */
export interface ValueStore<V> {
  get(): V;
  set(value: V): void;
  subscribe(listener: () => void): () => void;
}

export function createValueStore<V>(initial: V): ValueStore<V> {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next) {
      if (Object.is(next, value)) return;
      value = next;
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
