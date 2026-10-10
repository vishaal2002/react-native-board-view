// The slice of `react-native` that hook tests touch. Real rendering is covered on devices.
export const AccessibilityInfo = {
  announceForAccessibility: (_message: string): void => undefined,
  sendAccessibilityEvent: (): void => undefined,
};
