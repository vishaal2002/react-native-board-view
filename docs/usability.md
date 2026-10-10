# Usability notes, 2026-10-10

One session on the Pixel 9 Pro emulator, debug build of `apps/bare`. This is not the five-developer study. Nobody new to the package has been timed yet.

| Task         | What happened                                                                                                                  |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Open a board | The demo home lists layouts, then behaviour. Paged opens a phone kanban.                                                       |
| Show more    | With 2 cards per cell, Backlog showed two cards and **Show 2 more**. The tap revealed the other two, and the button went away. |
| Read only    | The chip is in the horizontal toolbar, after Collapsible, Auto-scroll, and Swipe. Turning it on removes the card move menu.    |
| Drag         | A long-press inside a column reordered the card.                                                                               |
| Page         | A sideways swipe moved to the next status column.                                                                              |
| Themes       | Ocean and Sunset restyle the same board.                                                                                       |

Friction in this session:

- **Show more on the peeked column** sits on the sliver of the next column, so most of that button is off screen until you page.
- **Read only is off the first toolbar screen.** You have to scroll the chip row to find it.
- **System back on the home screen leaves the app.** The in-app chevron is the control that returns to the demo list.

Still to do with other developers: install from npm, render their own card, reject a move, and explain the benchmark table. Record completion and time. Do not treat this page as that result.
