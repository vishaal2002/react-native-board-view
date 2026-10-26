# Research for 1.1 to 1.6, October 2026

The evidence behind the [draft roadmap](roadmap.md#after-10-draft). It covers competing libraries, what board apps do on phones, and what React Native and the operating systems added in 2025 and 2026. Download counts are from the npm API for 16–22 October 2026, and versions are from the npm registry on 2026-10-26. Reddit could not be read, so complaints come from app stores, vendor forums and issue trackers.

## Other libraries

| Library                         | Downloads a week | Stars | Last release      | Board?                                                                       |
| ------------------------------- | ---------------- | ----- | ----------------- | ---------------------------------------------------------------------------- |
| react-native-draggable-flatlist | 324,182          | 2,197 | 4.0.3, 2025-05-06 | No. 232 open issues; New Architecture drop flicker is the top bug.           |
| react-native-sortables          | 110,012          | 981   | 1.10.1, 2026-09   | No. Moving between lists is open ([#297][s297]). Runs on the web.            |
| react-native-reorderable-list   | 68,411           | 325   | 0.18.2, 2026-10   | No. One list.                                                                |
| react-native-reanimated-dnd     | 18,657           | 1,075 | 2.0.0, 2026-03    | `SortableBoard` on the unreleased `v2.1` branch.                             |
| react-native-drax               | 15,820           | 716   | 1.1.0, 2026-03    | Experimental `useSortableBoard`. Runs on the web; FlashList and Legend List. |
| react-native-ui-lib (Wix)       | 16,875           | 7,156 | 9.1.3, 2026-09    | No. Sortable list and grid.                                                  |
| react-native-board-view         | 427              | 25    | 1.0.0, 2026-10-20 |                                                                              |

New in October 2026 with almost no downloads: react-native-kanban-dnd and kanbify.

What developers ask for most across these repos, by reactions and repeated threads:

1. Moving items between lists. This package has it.
2. No flicker on drop under the New Architecture (draggable-flatlist #434, #602, #609, #572).
3. Lists inside a pager, sheet or `ScrollView` without gesture fights (draggable-flatlist #184 and #15, sortables #545, drax #279). **1.1.**
4. Web (draggable-flatlist #133, drax #61). **2.0 candidate.**
5. Locked items and drop rules. This package has `canDrag` and `canDrop`.
6. Dropping one item onto another (draggable-flatlist #608, reorderable-list #64). **1.2.**
7. A native context menu that turns into a drag (sortables #417). Not planned: the Move sheet covers it.

Commercial web boards (Syncfusion, Bryntum, DHTMLX) offer two things worth bringing to a phone: dragging in from outside the board, and a check or form before a drop. **Both in 1.2.**

## Board apps on phones

Complaints, most common first:

1. **One column at a time.** Trello's only answer is zooming out, which makes text tiny. **1.3 column rail.**
2. **Drag fights scroll; cards land in the wrong place.** Teams removed phone drag or added a hold; edge scroll carried cards to Done. The dock, sheet and S5 gate already target this.
3. **Offline and sync lag.** Linear has no offline mode; Trello users reopen the app to see moves. **1.4.**
4. **Slow on large boards.** **1.1 lane virtualization.**

Patterns in apps that the board lacks:

- A form before a drop completes: HubSpot required stage properties; Jira's drag skipped its transition screen ([JRACLOUD-86137][jira]). **1.2 drop gates.**
- Regrouping by another field: Planner, ClickUp mobile, Jira 2026. **1.3.**
- Rotting per stage (Pipedrive) and ageing by percentile bands (flow tools). **1.3.**
- Blocked cards with a reason and blocked time (Businessmap, Kanban Zone). **1.3.**
- A status bar for the whole board (monday's Battery View on mobile). **1.3 rail.**
- A "+" dragged to the exact spot (Todoist). **1.2.**
- Merge by dropping a card on a card (Trello, July 2026). **1.2.**
- AI suggestions to accept or decline, with a reason (Linear Triage Intelligence). **1.5.**

Accessibility: WCAG 2.5.7 needs a single-pointer way to do what drag does. Atlassian's guidance says a move that needs input should open a form from the move menu, which is what a drop gate does from the Move sheet. One design write-up and ClickUp's closed request both argue against sideways swipes on cards in boards that page sideways, which is why flick to move is dropped.

## Platform

Versions on 2026-10-26: React Native 0.88.0, Expo SDK 58, Reanimated 4.7.1, Gesture Handler 3.4.0, FlashList 2.3.3, Legend List 3.7.0.

| What                                                         | State                                                                                 | Use                     |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------- | ----------------------- |
| `<Activity>` in React Native (React 19.2)                    | Stable since 0.83                                                                     | 1.1 lanes off screen    |
| FlashList horizontal content position                        | 2.3.1                                                                                 | 1.1 columns in a lane   |
| Android 17 ignores resize locks at ≥ 600 dp                  | Shipped June 2026                                                                     | 1.1 windows that resize |
| `onKeyDown` on Android views                                 | Experimental, `enableKeyEvents` flag                                                  | 1.6                     |
| `react-native-external-keyboard` 2.x                         | Released, React Native 0.87+, New Architecture                                        | 1.6 on iOS              |
| Cross-app drag and drop                                      | No maintained React Native wrapper; `expo-drag-drop-content-view` takes drops in only | 1.6, own native module  |
| `expo-glass-effect`                                          | Released, iOS 26+                                                                     | 1.3 P2                  |
| `expo-app-intents`                                           | Alpha in SDK 58                                                                       | 1.6 recipe              |
| Zero 1.0, PowerSync, LiveStore 0.4                           | Run on React Native                                                                   | 1.4 recipes             |
| Fractional indexing with jitter                              | Known technique (Evan Wallace, vlcn)                                                  | 1.4 core                |
| Gesture Handler 3                                            | Stable since 2026-05-28                                                               | 2.0 candidate           |
| Legend List v3 on the web                                    | Released                                                                              | 2.0 web candidate       |
| React Native `ViewTransition`, Reanimated shared transitions | Not shipped, or experimental                                                          | Not planned yet         |
| Skills and `llms.txt` in library repos                       | Gesture Handler and Expo ship them                                                    | 1.1, 1.5                |

Not checked: whether the board runs in Expo Go today. 1.1 starts by finding out.

[s297]: https://github.com/MatiPl01/react-native-sortables/issues/297
[jira]: https://jira.atlassian.com/browse/JRACLOUD-86137
