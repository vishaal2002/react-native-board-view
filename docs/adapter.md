# Adapter contract

Internal in v1. The public board component is not part of the M0 spike. Screens talk to this adapter, and core turns adapter intents into move operations.

```ts
interface DragAdapter {
  capabilities: {
    crossContainer: boolean;
    autoScrollOuter: boolean;
    supportsFlashList: boolean;
  };
  Provider: ComponentType<{ children: ReactNode }>;
  Board: ComponentType<{
    onTransfer(event: { itemId: string; fromCellId: string; toCellId: string; toIndex: number }): void;
    onReorder(event: { itemId: string; cellId: string; fromIndex: number; toIndex: number }): void;
    onDragStart?(event: { itemId: string; cellId: string }): void;
    onDragEnd?(event: { itemId: string; cancelled: boolean }): void;
    canDrag?(itemId: string): boolean;
    canDrop?(itemId: string, toCellId: string): boolean;
    dragPosition?: SharedValue<{ x: number; y: number }>;
    longPressDelay?: number;
    reducedMotion?: boolean;
    children: ReactNode;
  }>;
  Cell: ComponentType<{
    cellId: string;
    scrollRef?: RefObject<unknown>;
    minHeight?: number;
    renderDropIndicator?: () => ReactNode;
    children?: ReactNode;
  }>;
  Card: ComponentType<{ itemId: string; cellId: string; index: number; children: ReactNode }>;
}
```

`cellId` is `` `${laneKey}::${columnKey}` ``. Boards without lanes use `_` as the lane key. Ids must not contain `::`.

`toIndex` is the insertion index in the target cell after the dragged card is removed. An empty cell is `0`. The adapter normalizes engine quirks before emitting the intent.

## Drax 1.1

`draxAdapterCapabilities` is `{ crossContainer: true, autoScrollOuter: false, supportsFlashList: true }`.

Cross-container drag in Drax is experimental (`useSortableBoard`). The implementation is `BoardDragProvider`, `DraxCellBoard`, and `DraxCell`.

Drax reports a slot of `itemCount - 1` when the pointer is past the last card. `resolveDropIndex` turns a pointer in the empty tail into an append. Empty lists already report `0`.

Drax list auto-scroll jumps 20% of the viewport every 250ms. The adapter sets the Drax thresholds so that scroller stays idle, then drives both axes from `dragAbsolutePositionSV` on the Drax context. Continuous mode ramps speed. Paged mode dwells, then flips one page. Reduced motion uses a flat speed.

`canDrop` rejection does not emit `onTransfer`. It emits `onDragEnd` with `cancelled: true`. Drax may keep a shift transform until the cell data changes; the spike logs that as a rejected drop.
