import { afterEach, describe, expect, it, vi } from 'vitest';
import { NO_LANE_ID, NO_VALUE_ID, cellId, createOpId, parseCellId } from './index';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('cellId', () => {
  it('joins the lane key and column key with "::"', () => {
    expect(cellId('alice', 'todo')).toBe('alice::todo');
    expect(cellId(NO_LANE_ID, NO_VALUE_ID)).toBe('_::__no_value__');
  });

  it.each([
    ['alice', 'todo'],
    [NO_LANE_ID, 'doing'],
    ['bob', NO_VALUE_ID],
    ['team:1', 'col:2'],
    ['lane with spaces', 'Done ✓'],
  ])('round trips lane %j and column %j through parseCellId', (laneKey, columnKey) => {
    expect(parseCellId(cellId(laneKey, columnKey))).toEqual({ laneKey, columnKey });
  });

  it('rejects a lane key containing "::"', () => {
    expect(() => cellId('a::b', 'todo')).toThrow(/cannot contain "::"/);
  });

  it('rejects a column key containing "::"', () => {
    expect(() => cellId('alice', 'to::do')).toThrow(/cannot contain "::"/);
  });

  it.each([
    ['team:', 'todo'],
    ['team', ':todo'],
    ['', 'todo'],
    ['team', ''],
  ])('rejects ids that cannot be split back: lane %j, column %j', (lane, column) => {
    expect(() => cellId(lane, column)).toThrow(/non-empty/);
  });
});

describe('parseCellId', () => {
  it.each(['todo', '', '::todo', 'a::b::c'])('rejects the malformed id %j', (value) => {
    expect(() => parseCellId(value)).toThrow(/Invalid cellId/);
  });
});

describe('createOpId', () => {
  it('returns a different id on every call', () => {
    const ids = new Set(Array.from({ length: 5000 }, () => createOpId()));
    expect(ids.size).toBe(5000);
  });

  it('stays unique when the clock and Math.random return the same values', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    vi.spyOn(Math, 'random').mockReturnValue(0.123456789);
    const ids = new Set(Array.from({ length: 100 }, () => createOpId()));
    expect(ids.size).toBe(100);
  });

  it('uses the "mv_" prefix and no cell separator', () => {
    const id = createOpId();
    expect(id).toMatch(/^mv_[0-9a-z]+_[0-9a-z]+_[0-9a-z]*$/);
    expect(id).not.toContain('::');
  });
});
