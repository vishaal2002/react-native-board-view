import { describe, expect, it } from 'vitest';
import { runS1Cases } from './s1';

describe('runS1Cases', () => {
  it('passes every checklist case', () => {
    const cases = runS1Cases();
    const failed = cases.filter((item) => !item.pass);
    expect(failed, failed.map((item) => `${item.id}: ${item.detail}`).join('\n')).toEqual([]);
  });

  it('runs each named case once', () => {
    expect(runS1Cases().map((item) => item.id)).toEqual([
      's1-down',
      's1-end',
      's1-start',
      's1-cross',
      's1-filtered',
      's1-toindex',
      's1-project',
    ]);
  });

  it('describes every case for the device checklist', () => {
    for (const item of runS1Cases()) {
      expect(item.name.length).toBeGreaterThan(0);
      expect(item.detail.length).toBeGreaterThan(0);
    }
  });
});
