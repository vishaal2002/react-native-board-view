import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

/** Follows the system "reduce motion" setting while the app runs. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then(
      (value) => {
        if (alive) setReduced(value);
      },
      () => undefined,
    );
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      alive = false;
      subscription.remove();
    };
  }, []);
  return reduced;
}

/** Follows whether a screen reader (VoiceOver, TalkBack) is running. */
export function useScreenReader(): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isScreenReaderEnabled().then(
      (value) => {
        if (alive) setEnabled(value);
      },
      () => undefined,
    );
    const subscription = AccessibilityInfo.addEventListener('screenReaderChanged', setEnabled);
    return () => {
      alive = false;
      subscription.remove();
    };
  }, []);
  return enabled;
}

/**
 * Whether cards need their screen-reader actions. On Android only an
 * accessibility service (TalkBack, Switch Access, Voice Access) can use
 * them, and building them for every card is a large part of what a card
 * costs to mount. iOS has no such check (Full Keyboard Access uses them
 * too), so it is always true there.
 */
export function useAccessibilityServices(): boolean {
  const android = Platform.OS === 'android';
  const [enabled, setEnabled] = useState(!android);
  useEffect(() => {
    if (!android) return;
    let alive = true;
    AccessibilityInfo.isAccessibilityServiceEnabled().then(
      (value) => {
        if (alive) setEnabled(value);
      },
      () => undefined,
    );
    // React Native sends this event on Android; its type declarations leave the name out.
    const changed = 'accessibilityServiceChanged' as 'screenReaderChanged';
    const subscription = AccessibilityInfo.addEventListener(changed, setEnabled);
    return () => {
      alive = false;
      subscription.remove();
    };
  }, [android]);
  return enabled;
}
