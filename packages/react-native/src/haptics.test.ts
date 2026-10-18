import { afterEach, describe, expect, it, vi } from 'vitest';
import { TurboModuleRegistry } from 'react-native';
import { hapticsFor, resetSystemHaptics, systemHaptics } from './haptics';

const global = globalThis as { expo?: unknown };

afterEach(() => {
  delete global.expo;
  vi.restoreAllMocks();
  resetSystemHaptics();
});

describe('haptics', () => {
  it('is off for false and uses the app function when given one', () => {
    const own = vi.fn();
    expect(hapticsFor(false)).toBeNull();
    expect(hapticsFor(own)).toBe(own);
  });

  it('uses expo-haptics when the app has it', () => {
    const impactAsync = vi.fn(() => Promise.resolve());
    global.expo = { modules: { ExpoHaptics: { impactAsync } } };
    hapticsFor(true)?.('lift');
    expect(impactAsync).toHaveBeenCalledWith('light');
  });

  it('falls back to react-native-haptic-feedback', () => {
    const trigger = vi.fn();
    vi.spyOn(TurboModuleRegistry, 'get').mockReturnValue({ trigger } as never);
    hapticsFor(undefined)?.('lift');
    expect(trigger).toHaveBeenCalledWith('impactLight', expect.objectContaining({ enableVibrateFallback: false }));
  });

  it('does nothing when the app has no haptics module', () => {
    expect(systemHaptics()).toBeNull();
    expect(hapticsFor(true)).toBeNull();
  });
});
