import { createContext, use, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useAnimatedReaction } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useBoard, useStoreValue } from '../context';
import type { Rect } from '../engine/geometry';
import type { ZoneGeometry } from '../engine/types';
import { createValueStore, type ValueStore } from '../store';
import type { BoardDropTargetEvent } from '../types';

/** Zone ids of targets outside the board start with this. */
export const OUTSIDE_TARGET = 'target:';

interface OutsideTarget {
  /** In window coordinates, measured when a drag starts. Null until measured. */
  rect: Rect | null;
  measure(): void;
  accepts(item: unknown): boolean;
  onDrop(event: BoardDropTargetEvent<unknown>): void;
}

interface DropScope {
  readonly targets: Map<string, OutsideTarget>;
  /** The targets' ids, a new list when one comes or goes. */
  readonly ids: ValueStore<readonly string[]>;
  /** The target under the lifted card, or null. */
  readonly hovered: ValueStore<string | null>;
  /** A card is lifted on the board. */
  readonly dragging: ValueStore<boolean>;
}

const DropScopeContext = createContext<DropScope | null>(null);

/**
 * Lets `BoardDropTarget`s outside the board take its cards. Wrap the board
 * and the targets in one scope, anywhere above both.
 */
export function BoardDropScope({ children }: { children: ReactNode }) {
  const [scope] = useState<DropScope>(() => ({
    targets: new Map(),
    ids: createValueStore<readonly string[]>([]),
    hovered: createValueStore<string | null>(null),
    dragging: createValueStore(false),
  }));
  return <DropScopeContext value={scope}>{children}</DropScopeContext>;
}

export interface BoardDropTargetProps<T> {
  /** Unique in the scope. */
  id: string;
  /** A card was dropped here. Nothing moves; the app decides what it means. */
  onDrop: (event: BoardDropTargetEvent<T>) => void;
  /** Whether this card may be dropped here. Default: every card. */
  accepts?: (item: T) => boolean;
  style?: StyleProp<ViewStyle>;
  /** Content, or a function of whether a card is lifted and whether it is over this target. */
  children?: ReactNode | ((state: { dragging: boolean; hovered: boolean }) => ReactNode);
}

/**
 * A view outside the board that takes a lifted card, such as a calendar slot,
 * an avatar to assign to, or a trash can. Inside a `BoardDropScope`.
 */
export function BoardDropTarget<T>({ id, onDrop, accepts, style, children }: BoardDropTargetProps<T>) {
  const scope = use(DropScopeContext);
  if (!scope) throw new Error('BoardDropTarget must be inside a BoardDropScope.');
  const ref = useRef<View>(null);
  const live = useRef({ onDrop, accepts });
  live.current = { onDrop, accepts };
  useEffect(() => {
    const target: OutsideTarget = {
      rect: null,
      measure() {
        ref.current?.measureInWindow((x, y, width, height) => {
          target.rect = width > 0 && height > 0 ? { x, y, width, height } : null;
        });
      },
      accepts: (item) => live.current.accepts?.(item as T) ?? true,
      onDrop: (event) => live.current.onDrop(event as BoardDropTargetEvent<T>),
    };
    scope.targets.set(id, target);
    scope.ids.set([...scope.targets.keys()]);
    return () => {
      if (scope.targets.get(id) === target) scope.targets.delete(id);
      scope.ids.set([...scope.targets.keys()]);
    };
  }, [id, scope]);
  const dragging = useStoreValue(scope.dragging);
  const hovered = useStoreValue(scope.hovered) === id;
  return (
    <View ref={ref} style={style} collapsable={false}>
      {typeof children === 'function' ? children({ dragging, hovered }) : children}
    </View>
  );
}

/**
 * The board's side: registers the scope's targets as drop zones, in board
 * coordinates, while a card is lifted.
 */
export function OutsideTargets({ root }: { root: RefObject<View | null> }) {
  const scope = use(DropScopeContext);
  if (!scope) return null;
  return <ScopeZones scope={scope} root={root} />;
}

function ScopeZones({ scope, root }: { scope: DropScope; root: RefObject<View | null> }) {
  const { adapter } = useBoard();
  const ids = useStoreValue(scope.ids);
  const origin = useRef({ x: 0, y: 0 });
  const dragging = adapter.useDragSource() !== null;
  useEffect(() => {
    scope.dragging.set(dragging);
    if (!dragging) {
      scope.hovered.set(null);
      return;
    }
    // Where everything is now: the screen may have scrolled since the last drag.
    root.current?.measureInWindow((x, y) => {
      origin.current = { x, y };
    });
    for (const target of scope.targets.values()) target.measure();
  }, [dragging, root, scope]);
  const activeZone = adapter.useActiveZone();
  useAnimatedReaction(
    () => activeZone.value,
    (zone, previous) => {
      if (zone !== previous) {
        scheduleOnRN(scope.hovered.set, zone.startsWith(OUTSIDE_TARGET) ? zone.slice(OUTSIDE_TARGET.length) : null);
      }
    },
  );
  return ids.map((id) => <ScopeZone key={id} id={id} scope={scope} origin={origin} />);
}

function ScopeZone({
  id,
  scope,
  origin,
}: {
  id: string;
  scope: DropScope;
  origin: RefObject<{ x: number; y: number }>;
}) {
  const { adapter, controller } = useBoard();
  const geometry = useMemo<ZoneGeometry>(
    () => ({
      outside: true,
      getRect() {
        const rect = scope.targets.get(id)?.rect;
        return rect ? { ...rect, x: rect.x - origin.current.x, y: rect.y - origin.current.y } : null;
      },
      accepts(itemId) {
        const item = controller.itemsById.get(itemId);
        return item != null && (scope.targets.get(id)?.accepts(item) ?? false);
      },
    }),
    [controller.itemsById, id, origin, scope],
  );
  adapter.useZone(OUTSIDE_TARGET + id, geometry);
  return null;
}

/** Calls the outside target's `onDrop`. False when the target is gone. */
export function dropOnOutsideTarget(
  scope: DropScope | null,
  id: string,
  event: BoardDropTargetEvent<unknown>,
): boolean {
  const target = scope?.targets.get(id);
  if (!target) return false;
  target.onDrop(event);
  return true;
}

export function useDropScope(): DropScope | null {
  return use(DropScopeContext);
}
