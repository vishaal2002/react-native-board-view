# react-native-board-view

The board is a projection, not the source of truth.

```text
application data → board model → board view
interaction → move operation → application / server
```

You pass flat items and a `groupBy` config. The package derives a board. Kanban is the default shape, not the data model. An optional second `groupBy` adds swimlanes.

The library does not create, edit, delete, fetch, sync, or persist items. It can hold only ephemeral UI state: the pending-move overlay, drag state, collapsed lanes, and scroll position. It does not know about Redux, Zustand, TanStack Query, REST, GraphQL, local-first storage, or WebSockets. Your `onMove` handler does.

This repository is the **M0 spike**. S1 is automated. S2–S7 are device gates in the example apps. The full `<Board>` component from the product sketch is not exported yet, so the spike does not freeze that API.

## Both Expo and the React Native CLI

`react-native-board-view` and `react-native-board-view-core` do not import `expo` or `expo-modules`. The same spike UI is mounted by:

- `apps/example` — Expo SDK 57 dev client / Expo web
- `apps/bare` — React Native CLI 0.86.3, New Architecture on

Native pieces (Gesture Handler, Reanimated, Worklets) are peer dependencies. Install them in the app. Autolinking then sees one copy, whether the app was created with Expo or `npx @react-native-community/cli init`.

### Expo

```bash
npx expo install react-native-board-view react-native-reanimated react-native-worklets react-native-gesture-handler @shopify/flash-list
```

Wrap the root in `GestureHandlerRootView` and import `react-native-gesture-handler` before any other import in the entry file. `babel-preset-expo` enables the Worklets plugin when Reanimated is installed. SDK 55 and later are New Architecture only. This repo runs on SDK 57.

### React Native CLI

```bash
npm install react-native-board-view react-native-reanimated react-native-worklets react-native-gesture-handler @shopify/flash-list
```

```js
// index.js — first line
import 'react-native-gesture-handler';
```

```js
// babel.config.js
module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: ['react-native-worklets/plugin'],
};
```

Rebuild the native app after adding those peers. React Native 0.83 and later in this line are New Architecture only.

## Versions checked for this spike

Checked against npm and Expo’s SDK 57 bundle on 9 Oct 2026.

| Package | What this repo uses | Notes |
| --- | --- | --- |
| Expo | SDK **57.0.27** | Current stable. SDK 55 is the floor in the brief, not the current SDK. SDK 56 has a Hermes v1 memory regression with Reanimated; SDK 57.0.9+ fixes it. |
| React Native | **0.86.3** | SDK 57 and the CLI app both use this. |
| Reanimated | **4.5.1** | Reanimated 4 is required. npm `latest` is 4.7.x and wants Worklets 0.13. Do not mix that into an SDK 57 app. |
| Worklets | **0.10.1** | Separate package. The brief does not name it. Reanimated 4 will not start without the matching major. |
| Gesture Handler | **2.32.0** | See below. |
| FlashList | **2.3.3** | v2 is correct. There is no v2-incompatible v4 on npm. v2 is New Architecture only and does not use `estimatedItemSize`. Expo’s bundled floor is 2.0.2. |
| Drax | **1.1.0** | Rewrite from March 2026. The 0.10 `DraxList` API is gone. |
| fractional-indexing | **4.0.0** | Default keys are unchanged. The v4 break only affects a custom digit alphabet, which we do not pass. |

### Gesture Handler is v2

SDK 57 bundles `react-native-gesture-handler@~2.32.0`, not v3. Expo Router and React Navigation still use the v2 builder (`Gesture.Pan()`). v3’s hook API (`usePanGesture`) is not compatible in the same app.

Drax 1.1 detects v3 at startup and otherwise uses `Gesture.Pan()`. This package does not call Gesture Handler itself. The peer range is `>=2.28.0 <3`, which both Expo SDK 55–57 and a React Native CLI app can install. Develop and test against 2.32.0. Drax was written against a Gesture Handler 3 beta, so S2–S5 are the check that the v2 path is good enough.

### Drax, plainly

Cross-container drag is marked experimental. The adapter turns off Drax’s stepped list auto-scroll (20% of the viewport every 250ms) and drives both axes from `dragAbsolutePositionSV`, because Drax does not scroll an outer board. `getSlotFromPosition` maps the empty tail to the last index; `resolveDropIndex` corrects that when the pointer is past the content. If S2 or S3 show that correction is wrong, Drax is not the engine.

## Rank and moves

One global fractional rank per item. A cell’s order is that rank filtered to the cell. Ties break by item id. `rankBetween` and `rebalanceRanks` use `fractional-indexing`. Rank is computed between the visible neighbors in the target cell, so filtered items are not boundaries.

```ts
{ opId, id, changes, from, rank }
```

`onMove` may return a promise. The overlay updates inside `enqueue`, before `onMove` runs. Moves on one item are serialized. A rejection removes the overlay and cancels later queued moves for that item. The overlay stays after resolve until `reconcile` sees the item’s rank and grouped fields match. That does not depend on `setState` timing.

`null` in `changes` / `from` is the “No value” bucket. Column and lane order, labels, and empty columns come from config.

## Run the spike

```bash
npm install
npm test
npm run example:web
```

Expo native:

```bash
npm run example
npm run android -w board-view-example
```

React Native CLI:

```bash
npm run bare
npm run android -w board-view-bare
```

iOS needs a Mac (`npm run ios` in either app). S3 and S4 need a release build on a device.

## Layout of the repo

- `packages/core` — grouping, rank, move operations, optimistic queue. No React Native imports.
- `packages/react-native` — Drax adapter. No Expo imports.
- `packages/harness` — checklist, FPS, drop log, S2–S7. Shared by both apps.
- `apps/example` — Expo.
- `apps/bare` — React Native CLI.

See [docs/adapter.md](docs/adapter.md) and [docs/spike.md](docs/spike.md).

## Not in this spike

WIP limits, sub-columns, column reorder, multi-select, Reanimated 3, item CRUD, fetching, and multi-value groupBy. Phone swipe actions, collapsible lanes, and the per-cell size claim can be cut if the spike fails. “Move to…” stays.
