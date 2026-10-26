import { useCallback, useMemo, useState, type Ref } from 'react';
import type { ScrollView, ScrollViewProps } from 'react-native';
import Animated, {
  useAnimatedRef,
  useScrollOffset,
  useSharedValue,
  type AnimatedRef,
  type SharedValue,
} from 'react-native-reanimated';
import type { UiScrollTarget } from '../engine/types';

type ScrollProps = ScrollViewProps & { ref?: Ref<ScrollView> };

let nextTargetId = 1;

/** A new id for every UI scroll target: horizontal board scrollers and FlashLists alike. */
export function useUiTargetId(): number {
  const [id] = useState(() => nextTargetId++);
  return id;
}

function setRef<T>(ref: Ref<T> | undefined, value: T | null): void {
  if (typeof ref === 'function') ref(value);
  else if (ref) ref.current = value;
}

/**
 * FlashList's scroll view, with an animated ref so auto-scroll can move it from
 * the UI thread. The offset is tracked here, where the scroll view exists by the
 * time the effect runs, so Reanimated never sees an unattached ref.
 */
function UiScrollView({
  ref,
  animatedRef,
  offset,
  ...rest
}: ScrollProps & { animatedRef: AnimatedRef<Animated.ScrollView>; offset: SharedValue<number> }) {
  useScrollOffset(animatedRef, offset);
  const merged = useCallback(
    (node: Animated.ScrollView | null) => {
      setRef(ref, node as unknown as ScrollView | null);
      animatedRef(node);
    },
    [animatedRef, ref],
  );
  // Android scrolls a list inside the app's own scroll view only when it opts in.
  return <Animated.ScrollView nestedScrollEnabled {...rest} ref={merged} />;
}

/**
 * Pass `renderScrollComponent` to a FlashList, and `target` to its scroller
 * handle. The engine then drives auto-scroll on the UI thread, at the screen's
 * frame rate, instead of once per JS frame.
 */
export function useFlashListUiScroll() {
  const animatedRef = useAnimatedRef<Animated.ScrollView>();
  const offset = useSharedValue(0);
  const id = useUiTargetId();
  const renderScrollComponent = useCallback(
    (props: ScrollProps) => <UiScrollView {...props} animatedRef={animatedRef} offset={offset} />,
    [animatedRef, offset],
  );
  const target = useMemo<UiScrollTarget>(() => ({ id, ref: animatedRef, offset }), [animatedRef, id, offset]);
  return { renderScrollComponent, target };
}
