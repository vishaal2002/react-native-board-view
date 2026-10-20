import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeProps } from './deprecations';
import type { BoardProps } from './types';

const base = {
  items: [],
  getItemId: (item: { id: string }) => item.id,
  groupBy: { columns: { key: 'status', values: [] } },
  onMove: () => undefined,
  renderCard: () => null,
} satisfies BoardProps<{ id: string }>;

afterEach(() => {
  vi.restoreAllMocks();
});

describe('normalizeProps', () => {
  it('passes props without old names through untouched', () => {
    expect(normalizeProps(base)).toBe(base);
  });

  it('maps old names to new ones and warns once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const onEndReached = () => undefined;
    const next = normalizeProps({ ...base, onEndReached, cellLimit: 5 });
    expect(next.onColumnEndReached).toBe(onEndReached);
    expect(next.laneCellLimit).toBe(5);
    normalizeProps({ ...base, onEndReached });
    expect(warn.mock.calls.filter(([message]) => String(message).includes('`onEndReached`'))).toHaveLength(1);
  });

  it('lets the new name win when both are passed', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const next = normalizeProps({ ...base, cellLimit: 5, laneCellLimit: 9 });
    expect(next.laneCellLimit).toBe(9);
  });
});
