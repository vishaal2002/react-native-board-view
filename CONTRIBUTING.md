# Contributing

## Setup

```sh
npm install
npm test           # vitest: core, controller hooks, the queue property test
npm run typecheck
npm run lint
npm run format:check
npm run build      # bob builds both packages into lib/
```

## Demo apps

Both apps mount the same demo, `packages/harness`. Each layout, rule and stress test has its own screen.

| App            | What it is                              | Start Metro       | Run                                     |
| -------------- | --------------------------------------- | ----------------- | --------------------------------------- |
| `apps/example` | Expo SDK 57; needs a development build  | `npm run example` | `npm run android -w board-view-example` |
| `apps/bare`    | React Native CLI 0.86, New Architecture | `npm run bare`    | `npm run android -w board-view-bare`    |

Things to know about the demo apps:

- **Workspace sources:** both apps resolve workspace packages through the `source` export condition, so you edit `src/` and Metro picks the change up. No build step is needed.
- **Performance:** measure on a release build (`cd apps/bare/android && ./gradlew assembleRelease`) with the Scale screen's FPS meter. Never judge performance in debug. See [docs/benchmarks.md](docs/benchmarks.md).

## Where things live

| Path                                              | What                                                                                     |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `packages/core`                                   | Pure TypeScript model: grouping, ranks, move planning, the move queue. No React imports. |
| `packages/react-native/src/engine`                | The drag engine (internal; see [docs/adapter.md](docs/adapter.md)).                      |
| `packages/react-native/src/layout`                | Columns, swimlanes and stacked layouts; cards, pager, defaults.                          |
| `packages/react-native/src/useBoardController.ts` | Glue between props, the core model and the move queue.                                   |
| `packages/harness`                                | The shared demo app.                                                                     |
| `docs/`                                           | Decisions, release gates, benchmarks and recipes.                                        |

## Rules of the road

- **The board is a projection.** Never add a code path that edits, caches or persists items. UI state only.
- **No Expo imports** in the packages. `npm run check:hosts` enforces this.
- **Tests:**
  - New core behaviour needs unit tests.
  - Changes to the move queue must keep `queue.property.test.ts` green.
- **Engine changes:** anything that touches gestures or layout geometry needs a check on a device, and on a release build when performance could be affected. Note the device and build in the pull request.
- **Public API:** changes go in `CHANGELOG.md`.
