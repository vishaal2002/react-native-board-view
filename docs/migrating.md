# Migrating to 1.0

1.0 adds no features beyond `cardMarks` and changes nothing that 0.8 did not already warn about. Most apps on 0.8 only need the renames below.

## From 0.8

1. **Use the new prop names.** 0.8 accepted the old names with a warning in development. 1.0 ignores them, so a board that still passes them stops loading pages or shows the default lane limit.

   | 0.8                   | 1.0                  |
   | --------------------- | -------------------- |
   | `onEndReached`        | `onColumnEndReached` |
   | `onColumnsEndReached` | `onEdgeReached`      |
   | `cellLimit`           | `laneCellLimit`      |

   TypeScript reports each of them as an unknown prop. In JavaScript, search for the old names.

2. **Hand-built `CardRenderInfo`.** It has three new required fields: `highlighted`, `hovered` and `dragCount`. This matters only if you build one yourself, for example to render a card in a test or a storybook. Use `false`, `false` and `0`.

3. **Optional: draw your own marks.** `cardMarks="manual"` stops the board drawing over your card: no selection check or outline, highlight ring, pointer outline, spotlight fade, or stacked edge and count on a dragged selection. Your `renderCard` draws them from `selected`, `highlighted`, `hovered`, `dimmed` and `dragCount`. Leave it out to keep 0.8's look.

## From 0.7 or earlier

Do the steps above, then the ones for each version you skip. The full list is in the [changelog](../CHANGELOG.md), under **Breaking** in each version.

**Objects you build by hand.** `theme` and `labels` overrides are partial, so passing them is never affected. Code that builds a whole `BoardTheme`, `BoardLabels`, a render-info object or a `BoardHandle` mock must add the fields each version added. Spreading the defaults keeps it working:

```tsx
import { defaultLabels, lightTheme } from 'react-native-board-view';

const theme = { ...lightTheme, accent: '#0F766E' };
const labels = { ...defaultLabels, moveTo: 'Send to…' };
```

**Behaviour that changed by default.**

| Since | Change                                                                            | To keep the older behaviour |
| ----- | --------------------------------------------------------------------------------- | --------------------------- |
| 0.6   | Drags show the drop dock, and the lists shorten while it shows                    | `dock={false}`              |
| 0.6   | A card ticks on lift when your app has a haptics module                           | `haptics={false}`           |
| 0.7   | Lane and section headers stay pinned                                              | `stickyHeaders={false}`     |
| 0.8   | While a selection is open, a tap selects a card instead of reaching its `onPress` | `selectable={false}`        |

**Types.**

- 0.6: `MoveSource` has `'undo'`. An exhaustive `switch` over `op.source` needs a case for it.
- 0.8: `ColumnHeaderRenderInfo.limit` is `number | null`, and `LaneHeaderRenderInfo.toggleCollapsed` is optional.
- 0.8: `CardActionEvent` and `DragStartEvent` carry `itemIds`, for a dragged or acted-on selection.
- 0.8: `MoveOperation` can carry `batch` (`{ id, index, size }`) when several cards move together. Each card still reaches `onMove` on its own, so existing handlers work unchanged.

## Checking the upgrade

- Run your type check. Every removed name and new required field shows up there.
- If you use the [test kit](../README.md#testing-your-board), your board tests run the same move code as the board.
- Drag a card, open the Move sheet, and select two cards on a device. These touch the most code that changed in 0.8.
