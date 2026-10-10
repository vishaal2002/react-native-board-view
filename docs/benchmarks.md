# Benchmarks

These are measured numbers, each with its device and build. Take them as a regression baseline, not as a promise. We have not yet run them on a low-end physical Android phone or on iOS hardware. Those runs are release gates (see the release gates section of the README).

## How to measure

1. Build the release variant of `apps/bare`:

   ```sh
   cd apps/bare/android && ./gradlew assembleRelease
   ```

2. Install it and open **S3 · 4 × 500 cards**.
3. Read the FPS meter in the top right. It shows the **median** JS-thread and UI-thread frame rates over the last 6 s, and the **lowest** 500 ms window.
   - The UI-thread count comes from Reanimated's frame callback, so the meter does not load the JS thread it is measuring.
4. When a drag ends, the screen also prints how many times the placeholder changed slot during that drag.
5. "Slow cards (2 ms)" makes every card render spin for 2 ms. It stands in for an expensive app card.

## 2026-10-10: Android emulator, Pixel 9 Pro AVD (arm64, API 36), release build

Setup:

- Host: Apple Silicon.
- Data: 4 columns × 500 cards, heights 60–220.
- Layout: `auto`, which is paged on a phone.
- Drags were injected through the emulator console as a continuous touch stream.

| Scenario                                               | JS fps (median / low) | UI fps (median / low) |
| ------------------------------------------------------ | --------------------- | --------------------- |
| Idle board                                             | 60 / 60               | 60 / 60               |
| Lift a card and hold it still for 7 s                  | 60 / 47               | 60 / 43               |
| Plain finger scrolling of a column, no drag            | 29 / 25               | 48 / 27               |
| Drag with vertical auto-scroll, 7 s                    | 30 / 25               | 30 / 27               |
| Drag with page flips and then vertical auto-scroll     | 31 / 23               | 32 / 27               |
| Slow cards (2 ms each), drag with vertical auto-scroll | 25 / 13               | 25 / 17               |

The engine itself was instrumented with timers for this run; the timers were removed afterwards.

- **Per frame:** about **0.10 ms** of auto-scroll stepping plus **0.04 ms** of hit-testing.
- **Worst frame:** 5 ms, on a slot change. It rises to 21 ms with slow cards, because the lists re-render their cards on that frame.
- **Stability:** holding a card still caused 1 slot change in 7.4 s. The placeholder does not oscillate.

### Reading the results

- **Drag logic is not the bottleneck.** During auto-scroll, frame rate follows FlashList rendering the cells that scroll into view. A finger scroll with no drag lands in the same range on this emulator: JS 29.
- **Hover card.** It follows the finger on the UI thread, so it keeps tracking while the JS thread renders cells.
- **UI-thread drop during auto-scroll.** UI falls to the JS rate because auto-scroll issues `scrollToOffset` from the JS loop. A known follow-up is to drive auto-scroll from the UI thread with Reanimated `scrollTo`. That would decouple scroll smoothness from JS load; cell rendering would still lag behind on slow JS.
- **The emulator is not a phone.** These numbers say nothing about real low-end devices.

### Fixed during this run

- Auto-scroll used to stop when the finger moved past a column's top or bottom edge, for example onto a footer or tab bar. It now keeps scrolling the last column under the finger, as long as the finger stays within that column's width.
- Placeholder moves caused by auto-scroll no longer run a layout animation.

## Still to measure (release gates)

| Device                                        | Build   | Workload                        |
| --------------------------------------------- | ------- | ------------------------------- |
| Low-end Android (Galaxy A14 / Pixel 4a class) | Release | The six scenarios above         |
| iPhone 12 class                               | Release | The six scenarios above         |
| Any                                           | Release | Swimlanes, 20 lanes × 6 columns |

## Gesture Handler 3 check, 2026-10-10

The same release build was rebuilt against `react-native-gesture-handler` **3.3.0** (npm `latest`) and run on the Pixel 9 Pro AVD. Every flow below worked:

- long-press drag with a committed reorder;
- page swipes in the paged layout;
- swipe-to-move in the multi layout;
- long-press-and-release opening the Move sheet;
- a move from the sheet.

The engine uses only the builder API (`Gesture.Pan`, `Gesture.Native`, `GestureDetector`, `blocksExternalGesture`). GH3 still exports it, and `onFinalize` still receives `success`. The peer range is `>=2.28 <4`. The demo apps stay on 2.32, which Expo SDK 57 pins.
