# Drag adapter contract (internal)

The layouts in `packages/react-native/src/layout` talk to the drag engine only through this contract (`src/engine/types.ts`). It is not public API, and it can change in a minor release. It exists so the engine can be replaced without touching the layouts or the core. Why the engine is our own: [decisions/0001-own-drag-engine.md](decisions/0001-own-drag-engine.md).

```ts
interface DragAdapter {
  capabilities: { crossContainer: boolean; autoScrollOuter: boolean; supportsFlashList: boolean };
  Provider: ComponentType<{ children: ReactNode }>;
  Board: ComponentType<DragBoardProps>; // the gesture, hit-testing loop, auto-scroll and hover overlay
  Cell: ComponentType<DragCellProps>; // registers a drop target's geometry
  Card: ComponentType<DragCardProps>; // hides the real card while its lifted copy settles
  Placeholder: ComponentType<PlaceholderProps>;
  useScroller(axis: 'horizontal' | 'vertical', handle: ScrollerHandle | null): void;
  usePlacement(cellId: string): CellPlacement; // what this cell must render right now
  useDragSource(): { itemId: string; cellId: string } | null;
  usePlacementState(): DragPlacement | null;
}
```

## Ids and indexes

- **Cell ids:** `cellId` is `` `${laneKey}::${columnKey}` ``. Boards without lanes use `_` as the lane key. `cellId()` rejects any id that would make this ambiguous.
- **Insertion index:** `toIndex` is the insertion index in the target cell _after the dragged card is removed_. An empty cell is `0`.

## How a cell describes itself

A cell registers a `CellGeometry`. The engine never calls `measure()` on cards. It asks the geometry instead:

| Method         | Returns                                                                                                                |
| -------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `getRect()`    | The cell's frame in board coordinates, with the live horizontal and vertical scroll applied.                           |
| `itemAt(y)`    | The card under a pointer: its id, index and rect. Used to start a drag.                                                |
| `resolve(y)`   | The insertion index for a pointer, from a binary search over row midpoints.                                            |
| `itemRect(id)` | The rect of a card, or of the placeholder (`PLACEHOLDER_ID`). Used to fly the lifted copy home or to its landing spot. |
| `scroller`     | The cell's own vertical scroller, if it has one, for auto-scroll.                                                      |
| `accepts()`    | `false` for collapsed cells.                                                                                           |

Column cells read row layouts from FlashList v2 (`getLayout`, `getFirstItemOffset`). Swimlane cells record their row frames from `onLayout`.

## Placement: feedback without a drop line

While a card is lifted, the engine publishes a `DragPlacement`: the lifted item, its source cell, and the target cell and index.

- **Each list:**
  - It renders its rows with the lifted card left out.
  - It inserts a placeholder row the height of the lifted card at the target index (`displayedRows`).
- **On drop:** the placeholder is swapped for the card in a single React render, so nothing blinks.
- **Damping:** a new slot must hold for two frames, and the engine waits two frames after each placeholder move before it reads the layouts again. This keeps the placeholder from oscillating.

## Lifecycle

1. **Start:**
   - A long press (default 200 ms) on the board starts the drag. The pan fails if the finger moves past the touch slop first, so scrolling keeps working.
   - The engine resolves the card under the finger and mounts the lifted copy in the overlay.
   - It then swaps the card for a placeholder.
2. **During the drag:**
   - A JS `requestAnimationFrame` loop hit-tests the pointer against the registered cells, moves the placeholder, and runs auto-scroll on both axes.
   - Auto-scroll starts only after the finger has moved. It keeps using the last column's scroller when the finger goes past that column's edge.
   - The lifted copy follows the finger on the UI thread.
3. **On release:**

   | Where the finger is released              | What happens                                                                                           |
   | ----------------------------------------- | ------------------------------------------------------------------------------------------------------ |
   | Over a cell that accepts the card         | `onTransfer` or `onReorder` runs. If it returns `false`, the move was refused and the card flies home. |
   | Anywhere else                             | The drag is cancelled.                                                                                 |
   | Without having moved (a long-press "tap") | `onLongPressMenu` runs, which opens the Move sheet.                                                    |

4. **Data changes:** the `revision` and `isDragValid` props abort the drag when app data removes the card or moves it somewhere else.
