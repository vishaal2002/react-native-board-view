// The slice of `react-native` that hook tests touch. Real rendering is covered on devices.
export const AccessibilityInfo = {
  announceForAccessibility: (_message: string): void => undefined,
  sendAccessibilityEvent: (): void => undefined,
};

// Haptics look up the app's native module; tests replace `get` with a spy.
export type TurboModule = object;
export const TurboModuleRegistry = {
  get: <T>(_name: string): T | null => null,
};
