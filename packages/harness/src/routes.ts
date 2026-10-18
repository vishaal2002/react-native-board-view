import {
  Accessibility,
  Ban,
  Columns3,
  Grid2x2,
  Grid3x3,
  LayoutGrid,
  List,
  ListChecks,
  ListTree,
  MoveHorizontal,
  Palette,
  PanelBottom,
  PenLine,
  RefreshCw,
  Rows3,
  SlidersHorizontal,
  Square,
  Star,
  Undo2,
  Zap,
  type LucideIcon,
} from 'lucide-react-native';

export type Route =
  | 'home'
  | 'kanban'
  | 'kanban-paged'
  | 'kanban-multi'
  | 'kanban-fit'
  | 'kanban-stacked'
  | 'swimlanes'
  | 'swimlanes-stacked'
  | 'matrix'
  | 'phone-moves'
  | 'live'
  | 'showcase'
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
  badge: LucideIcon;
}

export const SECTIONS: { title: string; entries: DemoEntry[] }[] = [
  {
    title: 'Layouts',
    entries: [
      {
        route: 'kanban-paged',
        title: 'Paged',
        detail: 'One column per page with snap, column tabs and a peek of the next column. The phone layout.',
        badge: Rows3,
      },
      {
        route: 'kanban-multi',
        title: 'Multi-column',
        detail: 'Fixed-width columns side by side with sideways scrolling and swipe-to-move. The tablet layout.',
        badge: Columns3,
      },
      {
        route: 'kanban-fit',
        title: 'Fit to screen',
        detail: 'Every column visible at once, no sideways scrolling. Collapse columns to make room.',
        badge: LayoutGrid,
      },
      {
        route: 'kanban-stacked',
        title: 'Stacked list',
        detail: 'One vertical list with a collapsible section per column. No sideways scrolling at all.',
        badge: List,
      },
      {
        route: 'swimlanes',
        title: 'Swimlanes',
        detail: 'Status × assignee. Virtualized lanes, collapsible, with "Show more" per cell.',
        badge: Grid3x3,
      },
      {
        route: 'swimlanes-stacked',
        title: 'Swimlanes, stacked',
        detail: 'Lanes and columns as nested sections in one vertical list.',
        badge: ListTree,
      },
      {
        route: 'matrix',
        title: 'Priority matrix',
        detail: 'layout="matrix": a 2 × 2 of urgency and importance, every cell on screen.',
        badge: Grid2x2,
      },
    ],
  },
  {
    title: 'Behaviour',
    entries: [
      {
        route: 'showcase',
        title: 'Showcase',
        detail: 'A plain board as an app would ship it. Most README captures come from here.',
        badge: Star,
      },
      {
        route: 'phone-moves',
        title: 'Phone moves',
        detail: 'The drop dock, app actions, undo, the pinch-in overview and hidden empty columns.',
        badge: PanelBottom,
      },
      {
        route: 'kanban',
        title: 'Kanban playground',
        detail: 'Switch layout, density, pager, card style and auto-scroll live.',
        badge: SlidersHorizontal,
      },
      {
        route: 'live',
        title: 'Live data',
        detail: 'Paged columns with server totals, a loading spinner, pull to refresh, and moves from code.',
        badge: RefreshCw,
      },
      {
        route: 'rollback',
        title: 'Optimistic moves & rollback',
        detail: 'Server delay and failure rate. Cards move instantly and come back on rejection.',
        badge: Undo2,
      },
      {
        route: 'rules',
        title: 'Drag & drop rules',
        detail: 'canDrag and canDrop: locked cards and cells that refuse a card.',
        badge: Ban,
      },
      {
        route: 'a11y',
        title: 'Move without dragging',
        detail: 'Drag off. The "Move to…" sheet and screen-reader actions.',
        badge: Accessibility,
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
        badge: Palette,
      },
      {
        route: 'custom',
        title: 'Custom renderers',
        detail: 'Your own card, header, empty state, footer and drop indicator.',
        badge: PenLine,
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
        badge: Zap,
      },
      {
        route: 'autoscroll',
        title: 'Auto-scroll',
        detail: 'S4: 12 columns and a 60-card column. Edge scrolling on both axes.',
        badge: MoveHorizontal,
      },
      { route: 'empty', title: 'Empty cells', detail: 'S2: drops into empty cells land at index 0.', badge: Square },
      {
        route: 'checklist',
        title: 'Spike checklist',
        detail: 'S1 results and the device gates S2–S7.',
        badge: ListChecks,
      },
    ],
  },
];
