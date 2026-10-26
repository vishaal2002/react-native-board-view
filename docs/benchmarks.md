# Benchmarks

These are measured numbers, each with its device and build. Take them as a regression baseline, not as a promise. Since 0.8.1 they include one Android phone, a vivo V2158. We have not yet run them on a low-end Android phone or on iOS hardware. Those runs are release gates (see the release gates section of the README).

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
- **UI-thread drop during auto-scroll.** UI falls to the JS rate because auto-scroll issues `scrollToOffset` from the JS loop. 0.5.0 drives continuous scrollers from the UI thread. That run is the 2026-10-15 section. Cell rendering can still limit the JS rate.
- **The emulator is not a phone.** These numbers say nothing about real low-end devices.

### Fixed during this run

- Auto-scroll used to stop when the finger moved past a column's top or bottom edge, for example onto a footer or tab bar. It now keeps scrolling the last column under the finger, as long as the finger stays within that column's width.
- Placeholder moves caused by auto-scroll no longer run a layout animation.

A later debug session on the same emulator (2026-10-10) checked Show more, read-only mode, paging, and a long-press reorder. It was not a release build, so it added no frame-rate numbers.

## 2026-10-15: same Pixel 9 Pro AVD, release build, 0.5.0

Host: Apple Silicon Mac, drawing from battery (37% and discharging at the swimlane run). Display 1280×2856 at 60 Hz. Touches came from `adb emu event mouse`.

`dumpsys gfxinfo` was reset, then read after the interval. "Total frames rendered" is what the app drew in that window.

### Column list, 500 cards, card held at the bottom edge for 4 s

This pair was measured earlier the same day. The JS-driven build is the 0.4.0 path (scroll commands from the JS loop). It was not reinstalled after the UI-thread build replaced it.

| Build                   | Frames drawn | About  | Janky frames |
| ----------------------- | ------------ | ------ | ------------ |
| JS-driven, as in 0.4.0  | 170          | 42 fps | 42–45%       |
| UI thread, this release | 245          | 61 fps | 0.4%         |

During auto-scroll the FPS meter read JS 29–31 and UI 60 on both builds. JS stays there because FlashList is rendering cells. The hover card and, in 0.5.0, the scroll offset do not wait for that.

### Swimlanes, 20 lanes × 6 columns (1,200 cards)

The Scale screen's "20 lanes × 6" board. Lane-list auto-scroll is the UI-thread path.

| Scenario                                   | What was drawn                                                              |
| ------------------------------------------ | --------------------------------------------------------------------------- |
| Idle, board still                          | 4 frames in about 4 s. The screen was not animating, so this is not a rate. |
| Card lifted and held still for 4.0 s       | 2 frames, both marked janky. The overlay is still once the lift tween ends. |
| Drag with lane-list auto-scroll for 4.01 s | 225 frames (about 56 fps). Janky frames: 17 (7.56%).                        |

The meter just after that drag read JS 31 / UI 60, lowest 500 ms window 29 / 58. The drag moved the placeholder 35 times in 4.5 s. An idle reading of JS 17 / UI 17 taken during that battery run was the host, not the board. On 2026-10-17, on mains power, the settled 20 × 6 board read JS 60 / UI 60.

## 2026-10-17: re-run after the 0.5.0 fixes

Same AVD and release build method, host on mains power. Each row is `dumpsys gfxinfo` over 4 s with the card held at the edge.

| Scenario                                  | Frames drawn | Janky frames |
| ----------------------------------------- | ------------ | ------------ |
| 4 × 500, column auto-scroll (two runs)    | 246 and 245  | 0%           |
| 4 × 500, stacked list auto-scroll         | 246          | 0%           |
| 20 lanes × 6, lane auto-scroll (two runs) | 228 and 227  | 8.3%, 7.9%   |
| Auto-scroll screen, `multi`, sideways     | 201          | 7.0%         |
| Auto-scroll screen, `fit`, sideways       | 106          | 12.3%        |

The `fit` row draws fewer frames because the board reached column 12 and stopped partway through the 4 s. Every drop above landed at the index shown. Frame-by-frame captures of a lift and a drop showed no empty slot.

## 2026-10-18: 0.6.0 against 0.5.0

Same AVD, release builds of both versions installed in turn, measured by one script. The host was on battery, which throttles the emulator: every number here is far below the 2026-10-17 mains-power run, plain scrolling included. Read this table only as a comparison between the two builds.

| Build | Column auto-scroll, 4 s | Janky     | Plain list scrolling | Janky  |
| ----- | ----------------------- | --------- | -------------------- | ------ |
| 0.5.0 | 121 and 119 frames      | 98%, 94%  | 91 frames            | 88%    |
| 0.6.0 | 120 and 118 frames      | 96%, 100% | 89–91 frames         | 82–89% |
| 0.7.0 | 119 and 123 frames      | 99%, 95%  | 90 frames            | 88%    |

0.7.0 was measured on 2026-10-19 with the same script on the same throttled host, as the baseline for the performance pass, now 0.8.1. 0.8.0 adds features, not speed, and was not measured. No regression in 0.6.0 or 0.7.0. 0.6.0's drop zones cost a lookup over an empty map when the dock is off, and a few rect reads when it shows.

**Method change.** In 0.6.0 the drop dock covers the bottom of the board while a card is held, and the lists end above it. Hold the card at the lists' new bottom edge, just above the dock. Holding at the bottom of the screen puts the finger on a dock chip, where auto-scroll correctly stops: two early 0.6.0 runs drew 1 and 2 frames that way.

A mains-power run of 0.6.0 is still to do.

## 2026-10-20: 0.8.1 against 0.8.0 on a phone

The first run on real hardware.

- **Phone:** vivo V2158, Android 14 (API 34), arm64, 1080 × 2376, 60 Hz, about 7.3 GB of RAM.
- **Builds:** release builds of 0.8.0 and 0.8.1, installed in turn over Wi-Fi `adb`.
- **Power:** on battery, 46% at the start of the day and 29% at the end. Builds were compared within the same hour, never across the day.
- **Input:** touches came from `adb shell input motionevent`.
- **Frames:** each row is `dumpsys gfxinfo` over 4 s with the card held just above the drop dock, or over six flicks for scrolling.

### Frame stats

| Board         | Scenario       | 0.8.0 janky             | 0.8.1 janky              |
| ------------- | -------------- | ----------------------- | ------------------------ |
| 4 × 500       | Plain scroll   | 0.4–0.8%                | 0.4%                     |
| 4 × 500       | Auto-scroll    | 0–0.8%                  | 0.4%                     |
| 4 × 500, slow | Auto-scroll    | 0.4–1.7%                | 0.4–0.8%                 |
| 20 lanes × 6  | Lane scrolling | 6.1–7.5%, mean 6.7% (5) | 2.6–7.2%, mean 3.8% (11) |
| 20 lanes × 6  | Auto-scroll    | 6.2–7.5%, mean 6.9% (8) | 3.4–9.2%, mean 5.8% (15) |

The number in brackets is how many runs.

The JS meter during lane auto-scroll read a median of 56–60 and a lowest 500 ms window of 33–44 on 0.8.0. On 0.8.1 it read 57–60 and 40–52. The 4 × 500 board read 60 / 60 on both builds.

### JS work

From builds of both versions instrumented with timers and render counters (removed afterwards), on the same phone. The sheet times come from screen recordings:

| Work                                  | 0.8.0        | 0.8.1        |
| ------------------------------------- | ------------ | ------------ |
| Mount one lane row (60 cards), median | 185 ms       | about 90 ms  |
| Card renders for one drop (20 × 6)    | 480          | 4            |
| Card renders while the dock shows     | up to 360    | 0            |
| Board projections for one drop        | 4            | 2            |
| Move sheet, tap to first sheet frame  | about 450 ms | about 100 ms |

### What is left

- **The 4 × 500 board** meets the 0.8.1 target, 0–3% janky, on this phone, and already did on 0.8.0.
- **The 20 lanes × 6 board** does not. Its median auto-scroll frame is 18 ms on both builds: most of the remaining cost is native.
  - A swimlane row draws every column's cards, 60 views or more, even when one column is on screen.
  - The UI thread creates them as each lane scrolls in.
- **Virtualizing columns inside a lane** is the next lever. It changes how lane rows measure, so it waits until after 1.0.
- **Projecting the board** for 1,200 cards takes 4–5 ms on this phone once the CPU has ramped up. The first projection after a drop can take 30–60 ms, because the drop arrives while the CPU is still at low clock.

### Fixed during this run

Holding a card in the drop dock's padding scrolled the list without moving the placeholder. The drop then put the card back. Holding just above the dock was unaffected, which is why earlier runs held there.

## 2026-10-20: 1.0.0 on the same phone

A check that 1.0 kept 0.8.1's numbers: the same vivo V2158, release build, same script, on battery at 20%. Each row is one run unless it says otherwise.

| Board         | Scenario       | Janky frames |
| ------------- | -------------- | ------------ |
| 4 × 500       | Plain scroll   | 0.8%         |
| 4 × 500       | Auto-scroll    | 0.8%, 0.4%   |
| 4 × 500, slow | Plain scroll   | 0.4%         |
| 4 × 500, slow | Auto-scroll    | 0.4%, 0.4%   |
| 20 lanes × 6  | Lane scrolling | 3.5%         |
| 20 lanes × 6  | Auto-scroll    | 3.5%, 5.6%   |

All within 0.8.1's ranges. The 20 lanes × 6 board is still above the 0–3% target, as in 0.8.1.

## 2026-10-26: 1.1 lane window on the emulator

Release builds on the Pixel 9 Pro emulator, one with the 1.1 column window in lanes and one with it turned off, on the 20 lanes × 6 board in the paged layout. Native views counted with `dumpsys activity top`.

| Build      | Native views |
| ---------- | ------------ |
| Window off | 735–835      |
| Window on  | 435–535      |

With an accessibility service running, every cell is drawn again: 735 views on, 435 off, in the same run. Frame times on the emulator were about 90% janky for both builds, the host being throttled, so they say nothing. The phone's numbers for 1.1 are still to measure.

## Still to measure (release gates)

| Device                                        | Build   | Workload                |
| --------------------------------------------- | ------- | ----------------------- |
| Low-end Android (Galaxy A14 / Pixel 4a class) | Release | The six scenarios above |
| iPhone 12 class                               | Release | The six scenarios above |

## Gesture Handler 3 check, 2026-10-10

The same release build was rebuilt against `react-native-gesture-handler` **3.3.0** (npm `latest`) and run on the Pixel 9 Pro AVD. Every flow below worked:

- long-press drag with a committed reorder;
- page swipes in the paged layout;
- swipe-to-move in the multi layout;
- long-press-and-release opening the Move sheet;
- a move from the sheet.

The engine uses only the builder API (`Gesture.Pan`, `Gesture.Native`, `GestureDetector`, `blocksExternalGesture`). GH3 still exports it, and `onFinalize` still receives `success`. The peer range is `>=2.28 <4`. The demo apps stay on 2.32, which Expo SDK 57 pins.
