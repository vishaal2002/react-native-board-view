# Drag adapter contract (internal)

The layouts in `packages/react-native/src/layout` talk to the drag engine only through this contract (`src/engine/types.ts`). It is not public API, and it can change in a minor release. It exists so the engine can be replaced without touching the layouts or the core. Why the engine is our own: [decisions/0001-own-drag-engine.md](decisions/0001-own-drag-engine.md).

```ts
interface DragAdapter {
  capabilities: { crossContainer: boolean; autoScrollOuter: boolean; supportsFlashList: boolean };
  Provider: ComponentType<{ children: ReactNode }>;
  Board: ComponentType<DragBoardProps>; // the gesture, hit-testing loop, auto-scroll and hover overlay
  Cell: ComponentType<DragCellProps>; // registers a drop target's geometry
  Card: ComponentType<DragCardProps>; // hides the real card while its lifted copy settles
  Handle: ComponentType<DragHandleProps>; // starts a drag when the board is in handle mode
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
| `scroller`     | The cell's own vertical scroller, if it has one, for auto-scroll. A `ui` target lets that scroll run on the UI thread. |
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
   - By default, a long press (200 ms) on the board starts the drag. The pan fails if the finger moves past the touch slop first, so scrolling keeps working.
   - With `handleOnly`, the same board pan uses manual activation. A `Handle` only marks that the touch began on it (`handleDown`). The pan activates once the finger moves 3 points from where it went down, and fails at once for touches that did not start on a handle, so lists keep scrolling. A tap on the handle does not open the Move sheet.
   - The board owns the drag in both modes. A pan on the handle itself would die as soon as its card is swapped for the placeholder, and the drag would never end.
   - The engine resolves the card under the finger and mounts the lifted copy in the overlay. The copy is keyed per drag. Its first layout calls `onHoverLaidOut`, which shows the copy and hides the real card in the same UI frame.
   - Two frames later the card is swapped for a placeholder. A release before that gap appears settles the copy onto the card's original rect, and a long-press "tap" in that window still opens the Move sheet.
2. **During the drag:**
   - A JS `requestAnimationFrame` loop hit-tests the pointer against the registered cells and moves the placeholder.
   - The same loop picks the scroller under the finger and publishes its limits. Continuous scrollers that carry a `ui` target are moved on the UI thread (`scrollTo` from a frame callback). Paged horizontal scrolling stays in JS: one page per dwell.
   - Auto-scroll starts only after the finger has moved. It keeps using the last column's scroller when the finger goes past that column's edge.
   - The lifted copy follows the finger on the UI thread. Scale and tilt come from one `liftProgress` value, so both stay numbers in the transform.
3. **On release:**

   | Where the finger is released              | What happens                                                                                           |
   | ----------------------------------------- | ------------------------------------------------------------------------------------------------------ |
   | Over a cell that accepts the card         | `onTransfer` or `onReorder` runs. If it returns `false`, the move was refused and the card flies home. |
   | Anywhere else                             | The drag is cancelled.                                                                                 |
   | Without having moved (a long-press "tap") | `onLongPressMenu` runs, which opens the Move sheet.                                                    |

   On release the UI thread stops auto-scroll in the same frame (`armed` is cleared in `onFinalize`), so the list cannot move under a landing that JS has already computed.

   The drop then shows the real card under the copy, and hides the copy two frames later. A list that draws the card a frame late shows the copy for that frame, never an empty slot.

4. **Data changes:** the `revision` and `isDragValid` props abort the drag when app data removes the card or moves it somewhere else.

## Handle

`Handle` is the adapter's drag grip. `DragHandle` in `layout/DragHandle.tsx` is the public view: a six-dot grip, hidden from screen readers, rendered through `adapter.Handle`.

- **`handleOnly` on `DragBoardProps`:** the board sets this when `moveModes.drag === 'handle'`. `HandleContext` is then true, and each `Handle` attaches a `Gesture.Manual()` that sets `handleDown` on touch-down. It never activates, so it blocks nothing. The board pan clears `handleDown` in `onFinalize`, even when the handle unmounted mid-touch.
- **Anywhere else:** `Handle` renders a plain view. The board's long press still starts the drag, including from the grip.

## UI scroll targets

A `ScrollerHandle` may carry `ui: { id, ref: AnimatedRef, offset: SharedValue }`. `id` is unique per scroll view.

- **Who sets it:** column FlashLists and the stacked list, through `useFlashListUiScroll()` (`renderScrollComponent` wraps a Reanimated `ScrollView` and merges refs). Swimlane lane lists do the same. The horizontal board scroller sets it in `multi` and `fit` only.
- **Who does not:** paged horizontal scrolling. Page flips stay in JS so a dwell moves exactly one page.
- **What JS publishes:** when they change, the loop writes the active target's id, viewport, edge zone, max offset and reduced-motion flag into the `autoX` and `autoY` shared values. It swaps the target when the finger changes scroller. The target itself reaches the UI thread through React state, a frame or more later, so the frame callback skips limits whose id is not its own target's.
- **What the UI thread does:** `UiAutoScroll` runs only while a target exists. It integrates `stepAutoScroll` in continuous mode and calls `scrollTo`. It keeps the offsets it wrote recently: an offset none of them explains was changed by someone else, such as FlashList correcting for a row above, and it continues from that offset. Sub-pixel steps wait until they add up to half a point. `uiScrollTick` tells the JS loop that content moved, so hit-testing stays in step.

`stepAutoScroll`, `edgeZone` and `edgeDirection` are worklets. The JS paged path calls the same functions. Behavior is covered by `autoScroll.test.ts`.

## LiftStyle

`DragBoardProps.lift` is `{ scale, tilt, shadowOpacity, dropMs }`. `Board` fills it from `theme.liftScale`, `liftTilt`, `liftShadowOpacity` and `dropDuration`. `shadowOpacity` is an iOS shadow on the overlay wrapper. Android draws no shadow from it, and the card's own shadow (for `CardView`, while `dragging`) shows on both.

The overlay animates one `liftProgress` shared value from 0 to 1. Scale is `1 + (scale - 1) * progress` and rotation is `` `${tilt * progress}deg` ``, both plain numbers. `withTiming` is not placed inside the transform string. Reduced motion keeps progress at 0, so there is no scale and no tilt. The drop (and the fly-home) uses `dropMs`, or 0 when reduced motion is on.
