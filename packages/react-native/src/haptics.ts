import { TurboModuleRegistry, type TurboModule } from 'react-native';

/** Moments the board can give haptic feedback for. */
export type HapticEvent = 'lift';
export type HapticHandler = (event: HapticEvent) => void;

interface ExpoHaptics {
  impactAsync?: (style: string) => Promise<void>;
}

interface HapticFeedbackSpec extends TurboModule {
  trigger?: (type: string, options: { enableVibrateFallback: boolean; ignoreAndroidSystemSettings: boolean }) => void;
}

let resolved: HapticHandler | null | undefined;

/**
 * The app's own haptics module, found at runtime: expo-haptics, then
 * react-native-haptic-feedback. Nothing is imported, so the board adds no
 * dependency and works without either; then there is no haptic. React
 * Native's `Vibration` is never used: it needs a permission on Android and
 * buzzes for 400 ms on iOS.
 */
export function systemHaptics(): HapticHandler | null {
  if (resolved !== undefined) return resolved;
  resolved = null;
  try {
    const expo = (globalThis as { expo?: { modules?: Record<string, unknown> } }).expo?.modules?.ExpoHaptics as
      | ExpoHaptics
      | undefined;
    const impact = expo?.impactAsync;
    if (impact) {
      resolved = () => {
        impact('light').catch(() => undefined);
      };
      return resolved;
    }
    const feedback = TurboModuleRegistry.get<HapticFeedbackSpec>('RNHapticFeedback');
    const trigger = feedback?.trigger;
    if (trigger) {
      resolved = () => trigger('impactLight', { enableVibrateFallback: false, ignoreAndroidSystemSettings: false });
    }
  } catch {
    resolved = null;
  }
  return resolved;
}

/** The handler for a `haptics` prop: off for false, the app's function, or the system one for true. */
export function hapticsFor(option: boolean | HapticHandler | undefined): HapticHandler | null {
  if (option === false) return null;
  if (typeof option === 'function') return option;
  return systemHaptics();
}

/** Tests only: forget the module found earlier. */
export function resetSystemHaptics(): void {
  resolved = undefined;
}
