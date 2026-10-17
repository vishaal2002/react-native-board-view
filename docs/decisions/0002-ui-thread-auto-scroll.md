# 0002: Auto-scroll continuous axes on the UI thread

- Status: accepted
- Date: 2026-10-15

## Context

0.4.0 stepped auto-scroll from the JS `requestAnimationFrame` loop and called `scrollTo` from there. On a release build, holding a card at the edge of a 500-card column made the UI thread wait on that JS work. Frame rate during auto-scroll matched a plain finger scroll: FlashList was rendering cells, and each scroll command was issued from JS.

The hover card already follows the finger on the UI thread. Hit-testing still has to run in JS, because it reads FlashList layouts that live on that thread.

Paged boards are different. A dwell there must move exactly one page, and the flip is animated. That path is cheap and stays in JS.

## Decision

Continuous scrollers carry a UI target: an animated ref and a shared offset. Each JS frame picks the scroller under the finger and publishes its limits (`autoX`, `autoY`). A frame callback integrates `stepAutoScroll` and calls Reanimated `scrollTo`. It runs only while a target exists.

The targets are:

- each column FlashList, through `useFlashListUiScroll()`
- the swimlane lane list and the stacked list, the same way
- the horizontal board scroller in `multi` and `fit`

Paged horizontal scrolling does not set a target. One dwell still flips one page, from JS.

`stepAutoScroll`, `edgeZone` and `edgeDirection` are worklets. The JS path calls the same functions, so `autoScroll.test.ts` covers both.

## Consequences

- Scroll commands are no longer one per JS frame. Cell rendering can still limit the JS rate. The hover card and the scroll offset do not have to wait for that.
- Hit-testing stays on the JS loop. `uiScrollTick` tells that loop when the UI thread moved content.
- `ScrollerHandle` grows a `ui` field. That field stays internal, with the rest of the adapter contract ([adapter.md](../adapter.md)).
- Real-device gates are still open. The numbers in [benchmarks.md](../benchmarks.md) are from an emulator.
