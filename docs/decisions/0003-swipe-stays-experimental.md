# 0003: Swipe-to-move stays experimental until 0.7

- Status: accepted
- Date: 2026-10-15

## Context

`moveModes.swipe: 'auto'` moves a card to the neighbouring column. It is off by default, and it only runs in the `multi` and `fit` layouts. On a paged phone a sideways swipe turns the page.

It competes with sideways scrolling. A mis-swipe moves a card. That is a different kind of risk from long-press drag, the Move sheet, and screen-reader actions, which all ask for a deliberate gesture.

0.5.0 is the drag-engine release: handles, lift tokens, and UI-thread auto-scroll. Nothing in that work answers whether swipe is something people use on purpose.

## Decision

Swipe-to-move does not graduate in 0.5.0. It stays experimental and off by default.

Revisit it at 0.7, after the five-developer usability study. That study is the gate for turning it on by default, or for removing it. Until then the API stays as it is: opt in with `swipe: 'auto'`.

## Consequences

- Docs and the changelog say it is experimental and name the 0.7 study.
- No default change, and no new swipe behaviour, in 0.5.0.
- The study is still open. See the status section of the README.
