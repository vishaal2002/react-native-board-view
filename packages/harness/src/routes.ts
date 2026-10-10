export type Route =
  | 'home'
  | 'kanban'
  | 'kanban-paged'
  | 'kanban-multi'
  | 'kanban-fit'
  | 'kanban-stacked'
  | 'swimlanes'
  | 'swimlanes-stacked'
  | 'rollback'
  | 'rules'
  | 'a11y'
  | 'theme'
  | 'custom'
  | 'scale'
  | 'autoscroll'
  | 'empty'
  | 'checklist';

export interface DemoEntry {
  route: Route;
  title: string;
  detail: string;
  badge: string;
}

export const SECTIONS: { title: string; entries: DemoEntry[] }[] = [
  {
    title: 'Layouts',
    entries: [
      {
        route: 'kanban-paged',
        title: 'Paged',
        detail: 'One column per page with snap, column tabs and a peek of the next column. The phone layout.',
        badge: '▤',
      },
      {
        route: 'kanban-multi',
        title: 'Multi-column',
        detail: 'Fixed-width columns side by side with sideways scrolling and swipe-to-move. The tablet layout.',
        badge: '▥',
      },
      {
        route: 'kanban-fit',
        title: 'Fit to screen',
        detail: 'Every column visible at once, no sideways scrolling. Collapse columns to make room.',
        badge: '▦',
      },
      {
        route: 'kanban-stacked',
        title: 'Stacked list',
        detail: 'One vertical list with a collapsible section per column. No sideways scrolling at all.',
        badge: '☰',
      },
      {
        route: 'swimlanes',
        title: 'Swimlanes',
        detail: 'Status × assignee. Virtualized lanes, collapsible, with "Show more" per cell.',
        badge: '▧',
      },
      {
        route: 'swimlanes-stacked',
        title: 'Swimlanes, stacked',
        detail: 'Lanes and columns as nested sections in one vertical list.',
        badge: '≣',
      },
    ],
  },
  {
    title: 'Behaviour',
    entries: [
      {
        route: 'kanban',
        title: 'Kanban playground',
        detail: 'Switch layout, density, pager, card style and auto-scroll live.',
        badge: '⚙︎',
      },
      {
        route: 'rollback',
        title: 'Optimistic moves & rollback',
        detail: 'Server delay and failure rate. Cards move instantly and come back on rejection.',
        badge: '↺',
      },
      {
        route: 'rules',
        title: 'Drag & drop rules',
        detail: 'canDrag and canDrop: locked cards and cells that refuse a card.',
        badge: '⛔︎',
      },
      {
        route: 'a11y',
        title: 'Move without dragging',
        detail: 'Drag off. The "Move to…" sheet and screen-reader actions.',
        badge: '♿︎',
      },
    ],
  },
  {
    title: 'Customization',
    entries: [
      {
        route: 'theme',
        title: 'Theming',
        detail: 'Palettes, radius, column width, card styles and drop indicators.',
        badge: '◐',
      },
      {
        route: 'custom',
        title: 'Custom renderers',
        detail: 'Your own card, header, empty state, footer and drop indicator.',
        badge: '✎',
      },
    ],
  },
  {
    title: 'Performance & gates',
    entries: [
      {
        route: 'scale',
        title: '4 × 500 cards',
        detail: 'S3: FlashList columns with uneven heights and an FPS meter.',
        badge: '⚡︎',
      },
      {
        route: 'autoscroll',
        title: 'Auto-scroll',
        detail: 'S4: 12 columns and a 60-card column. Edge scrolling on both axes.',
        badge: '⇆',
      },
      { route: 'empty', title: 'Empty cells', detail: 'S2: drops into empty cells land at index 0.', badge: '◻︎' },
      { route: 'checklist', title: 'Spike checklist', detail: 'S1 results and the device gates S2–S7.', badge: '✓' },
    ],
  },
];
