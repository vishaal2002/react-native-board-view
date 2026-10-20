# Support policy

This covers `react-native-board-view` 1.x and `board-view-core` 1.x.

## Versions

Both packages follow [semantic versioning](https://semver.org/) from 1.0. The public API is what the [API reference](api.md) lists.

**A major release** is needed to:

- remove or rename an export, a prop, a ref method or a field the board passes to you;
- change what a prop does by default;
- raise the minimum version of a peer dependency.

**A minor or patch release** can:

- add optional props, ref methods, exports and fields the board passes to you;
- add theme tokens and labels;
- fix a bug, even when some app relied on it. The [changelog](../CHANGELOG.md) says when a fix changes behaviour you can see.

**Objects you build yourself.** New theme tokens, labels and render-info fields are required fields on `BoardTheme`, `BoardLabels` and the render-info types. Passing `theme` and `labels` overrides is never affected, because they are partial. Code that builds a whole object, for example in a test, should spread the defaults (`{ ...lightTheme, ... }`, `{ ...defaultLabels, ... }`), so a minor release does not break its type check.

**Experimental features** are off by default and marked _Experimental_ in the API reference: the overview and swipe-to-move. They can change in a minor release, with a note in the changelog.

Only the latest 1.x minor gets fixes. 0.x gets none: see [Migrating to 1.0](migrating.md).

## React Native and Expo

| Dependency                     | 1.x supports                                                 |
| ------------------------------ | ------------------------------------------------------------ |
| `react-native`                 | 0.83 or later, New Architecture                              |
| `react`                        | 19 or later                                                  |
| `react-native-reanimated`      | 4.1 to 4.x                                                   |
| `react-native-worklets`        | 0.5 to 0.x                                                   |
| `react-native-gesture-handler` | 2.28 to 3.x                                                  |
| `@shopify/flash-list`          | 2.0.2 to 2.x                                                 |
| Expo                           | SDKs with React Native 0.83 or later, in a development build |

These minimums hold for all of 1.x. A new React Native or Expo release is supported once the demo app builds and passes the [release gates](spike.md) on it; that support ships in a minor or patch release. The old architecture, Reanimated 3, Expo Go and web are not supported.

## Where it has been tested

1.0 was tested on release builds on:

- a vivo V2158 phone, Android 14: release gates S2–S6;
- the iOS 27 simulator: S4, the side-edge drop and the Move sheet.

It has not run on a physical iPhone, and no screen reader has completed the move test. The demo apps use React Native 0.86 and Expo SDK 57.

## Reporting a problem

Open an issue on [GitHub](https://github.com/vishaal2002/react-native-board-view/issues). Include the package version, React Native and Expo versions, the platform and device, and the smallest board that shows the problem. `react-native-board-view/testing` can often reproduce a move bug without a device: see [Testing your board](../README.md#testing-your-board).
