import { FlashList, type FlashListRef } from '@shopify/flash-list';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
  type RefObject,
} from 'react';
import {
  ScrollView,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {
  DraxProvider,
  SortableBoardContainer,
  SortableContainer,
  SortableItem,
  useDraxContext,
  useSortableBoard,
  useSortableList,
} from 'react-native-drax';
import { resolveDropIndex } from 'react-native-board-view-core';
import { edgeZoneForWidth, stepAutoScroll, type AutoScrollMode } from './autoScroll';
import type { CellScrollMetrics, DraxCellBoardProps, DraxCellProps, DragCapabilities } from './types';

/**
 * Drax 1.1 can move cards across lists, including FlashList, but its board
 * helper does not scroll an outer horizontal scroller. Its own list
 * auto-scroll jumps 20% of the viewport every 250ms. This adapter turns
 * that off and drives both axes from dragAbsolutePositionSV.
 */
export const draxAdapterCapabilities: DragCapabilities = {
  crossContainer: true,
  autoScrollOuter: false,
  supportsFlashList: true,
};

interface BoardContextValue {
  canDrag?: (itemId: string) => boolean;
  canDrop?: (itemId: string, toCellId: string) => boolean;
  longPressDelay: number;
  reducedMotion: boolean;
  onReorder: DraxCellBoardProps['onReorder'];
  onDragStart?: DraxCellBoardProps['onDragStart'];
  onDragEnd?: DraxCellBoardProps['onDragEnd'];
  onDropRejected?: DraxCellBoardProps['onDropRejected'];
  registerCell: (cell: CellScrollMetrics) => void;
  unregisterCell: (cellId: string) => void;
}

const BoardContext = createContext<BoardContextValue | null>(null);

interface DropResolver {
  resolve: (itemId: string, fromCellId: string, toCellId: string, rawToIndex: number) => number;
}

export function BoardDragProvider({ children }: { children: ReactNode }) {
  return <DraxProvider style={{ flex: 1 }}>{children}</DraxProvider>;
}

export function DraxCellBoard({
  children,
  horizontal = false,
  mode = 'continuous',
  pageSize = 0,
  reducedMotion = false,
  active = true,
  canDrag,
  canDrop,
  onTransfer,
  onReorder,
  onDragStart,
  onDragEnd,
  onDropRejected,
  onHorizontalOffset,
}: DraxCellBoardProps) {
  const { dragAbsolutePositionSV, draggedIdSV } = useDraxContext();
  const cells = useRef(new Map<string, CellScrollMetrics>());
  const frame = useRef({ x: 0, y: 0, width: 0, height: 0 });
  const scrollRef = useRef<ScrollView>(null);
  const horizontalOffset = useRef(0);
  const horizontalMax = useRef(0);
  const contentWidth = useRef(0);
  const dropResolver = useRef<DropResolver>({
    resolve: (_itemId, _from, _to, raw) => raw,
  });

  const readPointer = useCallback(() => dragAbsolutePositionSV.value, [dragAbsolutePositionSV]);

  dropResolver.current.resolve = (itemId, _from, toCellId, rawToIndex) => {
    const cell = cells.current.get(toCellId);
    const pointer = readPointer();
    if (!cell) return Math.max(0, rawToIndex);
    const sameCell = cell.itemIds.includes(itemId);
    const pointerContent = pointer.y - cell.y + cell.offset;
    return resolveDropIndex({
      sameCell,
      reportedIndex: rawToIndex,
      itemCount: cell.itemIds.length,
      pointerContent,
      contentEnd: cell.contentEnd,
    });
  };

  const board = useSortableBoard<{ id: string }>({
    keyExtractor: (item) => item.id,
    onTransfer: ({ item, fromContainerId, toContainerId, toIndex }) => {
      if (canDrop && !canDrop(item.id, toContainerId)) {
        onDropRejected?.({ itemId: item.id, toCellId: toContainerId });
        onDragEnd?.({ itemId: item.id, cancelled: true });
        return;
      }
      const resolved = dropResolver.current.resolve(item.id, fromContainerId, toContainerId, toIndex);
      onTransfer({
        itemId: item.id,
        fromCellId: fromContainerId,
        toCellId: toContainerId,
        toIndex: resolved,
        rawToIndex: toIndex,
      });
    },
  });

  const registerCell = useCallback((cell: CellScrollMetrics) => {
    cells.current.set(cell.cellId, cell);
  }, []);
  const unregisterCell = useCallback((cellId: string) => {
    cells.current.delete(cellId);
  }, []);

  const context = useMemo<BoardContextValue>(
    () => ({
      canDrag,
      canDrop,
      longPressDelay: 200,
      reducedMotion,
      onReorder,
      onDragStart,
      onDragEnd,
      onDropRejected,
      registerCell,
      unregisterCell,
    }),
    [canDrag, canDrop, onDragEnd, onDragStart, onDropRejected, onReorder, reducedMotion, registerCell, unregisterCell],
  );

  useEffect(() => {
    if (!active) return undefined;
    let frameId = 0;
    let last = Date.now();
    let dwellX = 0;
    let dwellY = 0;
    const tick = () => {
      const now = Date.now();
      const dt = Math.min(64, now - last);
      last = now;
      const dragging = draggedIdSV.value !== '';
      if (!dragging) {
        dwellX = 0;
        dwellY = 0;
      } else {
        const pointer = dragAbsolutePositionSV.value;
        for (const cell of cells.current.values()) cell.remeasure();
        if (horizontal && frame.current.width > 0) {
          const step = stepAutoScroll({
            pointer: pointer.x,
            frameStart: frame.current.x,
            frameSize: frame.current.width,
            edgeZone: edgeZoneForWidth(frame.current.width),
            offset: horizontalOffset.current,
            maxOffset: horizontalMax.current,
            dwellMs: dwellX,
            dtMs: dt,
            mode: mode as AutoScrollMode,
            pageSize: pageSize || frame.current.width,
            reducedMotion,
          });
          dwellX = step.dwellMs;
          if (step.offset !== horizontalOffset.current) {
            horizontalOffset.current = step.offset;
            scrollRef.current?.scrollTo({ x: step.offset, animated: false });
            onHorizontalOffset?.(step.offset, horizontalMax.current);
          }
        }
        const target = cellUnderPointer(cells.current, pointer.x, pointer.y);
        if (target && target.maxOffset > 0) {
          const step = stepAutoScroll({
            pointer: pointer.y,
            frameStart: target.y,
            frameSize: target.height,
            edgeZone: edgeZoneForWidth(target.height),
            offset: target.offset,
            maxOffset: target.maxOffset,
            dwellMs: dwellY,
            dtMs: dt,
            mode: 'continuous',
            pageSize: target.height,
            reducedMotion,
          });
          dwellY = step.dwellMs;
          if (Math.abs(step.offset - target.offset) > 0.5) target.scrollTo(step.offset);
        } else {
          dwellY = 0;
        }
      }
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [active, dragAbsolutePositionSV, draggedIdSV, horizontal, mode, onHorizontalOffset, pageSize, reducedMotion]);

  const boardHost = useRef<View>(null);
  const onBoardLayout = () => {
    boardHost.current?.measureInWindow((x, y, width, height) => {
      frame.current = { x, y, width, height };
    });
  };

  const onHorizontalScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    horizontalOffset.current = event.nativeEvent.contentOffset.x;
    const max = Math.max(0, contentWidth.current - frame.current.width);
    horizontalMax.current = max;
    onHorizontalOffset?.(horizontalOffset.current, max);
  };

  const body = horizontal ? (
    <ScrollView
      ref={scrollRef}
      horizontal
      style={{ flex: 1 }}
      pagingEnabled={mode === 'paged'}
      snapToInterval={mode === 'paged' && pageSize > 0 ? pageSize : undefined}
      decelerationRate={mode === 'paged' ? 'fast' : 'normal'}
      showsHorizontalScrollIndicator
      onScroll={onHorizontalScroll}
      scrollEventThrottle={16}
      onContentSizeChange={(width) => {
        contentWidth.current = width;
        horizontalMax.current = Math.max(0, width - frame.current.width);
      }}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={{ flex: 1 }}>{children}</View>
  );

  return (
    <BoardContext.Provider value={context}>
      <SortableBoardContainer board={board} style={{ flex: 1 }}>
        <View ref={boardHost} style={{ flex: 1 }} onLayout={onBoardLayout}>
          {body}
        </View>
      </SortableBoardContainer>
    </BoardContext.Provider>
  );
}

function cellUnderPointer(
  cells: Map<string, CellScrollMetrics>,
  x: number,
  y: number,
): CellScrollMetrics | null {
  for (const cell of cells.values()) {
    if (x >= cell.x && x <= cell.x + cell.width && y >= cell.y && y <= cell.y + cell.height) return cell;
  }
  return null;
}

export function DraxCell({
  cellId,
  itemIds,
  renderCard,
  minHeight = 120,
  longPressDelay = 200,
  dragActivationFailOffset,
  onVerticalOffset,
}: DraxCellProps) {
  const board = useContext(BoardContext);
  if (!board) throw new Error('DraxCell must render inside DraxCellBoard.');
  const listRef = useRef<FlashListRef<{ id: string }> | null>(null);
  const hostRef = useRef<View>(null);
  const metrics = useRef<CellScrollMetrics>({
    cellId,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    offset: 0,
    maxOffset: 0,
    contentEnd: 0,
    itemIds,
    scrollTo: (offset) => {
      metrics.current.offset = offset;
      listRef.current?.scrollToOffset({ offset, animated: false });
      onVerticalOffset?.(offset, metrics.current.maxOffset);
    },
    remeasure: () => {
      hostRef.current?.measureInWindow((x, y, width, height) => {
        metrics.current.x = x;
        metrics.current.y = y;
        metrics.current.width = width;
        metrics.current.height = height;
      });
    },
  });
  metrics.current.itemIds = itemIds;
  metrics.current.cellId = cellId;

  const data = useMemo(() => itemIds.map((id) => ({ id })), [itemIds]);
  const sortable = useSortableList({
    id: cellId,
    data,
    keyExtractor: (item) => item.id,
    longPressDelay,
    animationConfig: board.reducedMotion ? 'none' : 'default',
    // Drax's built-in scroller steps 20% every 250ms. Keep it idle.
    autoScrollBackThreshold: -1,
    autoScrollForwardThreshold: 2,
    onReorder: (event) => {
      const itemId = event.fromItem.id;
      if (board.canDrop && !board.canDrop(itemId, cellId)) {
        board.onDropRejected?.({ itemId, toCellId: cellId });
        board.onDragEnd?.({ itemId, cancelled: true });
        return;
      }
      const toIndex = resolveDropIndex({
        sameCell: true,
        reportedIndex: event.toIndex,
        itemCount: itemIds.length,
        pointerContent: null,
        contentEnd: null,
      });
      board.onReorder({ itemId, cellId, fromIndex: event.fromIndex, toIndex });
    },
    onDragStart: (event) => {
      board.onDragStart?.({ itemId: event.item.id, cellId });
    },
    onDragEnd: (event) => {
      board.onDragEnd?.({ itemId: event.item.id, cancelled: event.cancelled });
    },
  });

  board.registerCell(metrics.current);
  useEffect(() => () => board.unregisterCell(cellId), [board, cellId]);

  const onContentSizeChange = (width: number, height: number) => {
    sortable.onContentSizeChange(width, height);
    metrics.current.contentEnd = height;
    metrics.current.maxOffset = Math.max(0, height - metrics.current.height);
  };

  return (
    <View
      ref={hostRef}
      style={{ flex: 1, minHeight }}
      onLayout={() => metrics.current.remeasure()}
    >
      <SortableContainer
        sortable={sortable}
        scrollRef={listRef as RefObject<FlashListRef<{ id: string }>>}
        style={cellStyle}
      >
        <FlashList
          ref={listRef}
          data={sortable.data}
          keyExtractor={sortable.stableKeyExtractor}
          onScroll={(event) => {
            sortable.onScroll(event);
            metrics.current.offset = event.nativeEvent.contentOffset.y;
            const viewport = event.nativeEvent.layoutMeasurement.height;
            const content = event.nativeEvent.contentSize.height;
            metrics.current.height = viewport;
            metrics.current.contentEnd = content;
            metrics.current.maxOffset = Math.max(0, content - viewport);
            onVerticalOffset?.(metrics.current.offset, metrics.current.maxOffset);
          }}
          scrollEventThrottle={16}
          onContentSizeChange={onContentSizeChange}
          renderItem={({ item, index }) => (
            <SortableItem
              sortable={sortable}
              index={index}
              fixed={board.canDrag ? !board.canDrag(item.id) : false}
              dragActivationFailOffset={dragActivationFailOffset}
            >
              {renderCard(item.id, index)}
            </SortableItem>
          )}
          ListEmptyComponent={<View style={{ minHeight }} />}
        />
      </SortableContainer>
    </View>
  );
}

const cellStyle: StyleProp<ViewStyle> = { flex: 1, minHeight: 80 };
