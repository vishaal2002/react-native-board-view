import { describe, expect, it } from 'vitest';
import { compactMetrics, darkTheme, lightTheme, resolveTheme } from './theme';

describe('resolveTheme', () => {
  it('keeps lift tokens when compact density is applied to the dark theme', () => {
    const theme = resolveTheme(true, 'compact');

    expect(theme.liftScale).toBe(darkTheme.liftScale);
    expect(theme.liftTilt).toBe(darkTheme.liftTilt);
    expect(theme.liftShadowOpacity).toBe(0.55);
    expect(theme.dropDuration).toBe(darkTheme.dropDuration);
    expect(theme.columnWidth).toBe(compactMetrics.columnWidth);
    expect(theme.cardGap).toBe(compactMetrics.cardGap);
    expect(theme.background).toBe(darkTheme.background);
  });

  it('keeps the lighter lift shadow in compact light mode', () => {
    const theme = resolveTheme(false, 'compact');

    expect(theme.liftShadowOpacity).toBe(0.25);
    expect(theme.liftScale).toBe(lightTheme.liftScale);
    expect(theme.columnWidth).toBe(compactMetrics.columnWidth);
  });

  it('lets a partial override replace lift tokens after density', () => {
    const theme = resolveTheme(true, 'compact', { liftTilt: 3, liftScale: 1.06, dropDuration: 300 });

    expect(theme.liftTilt).toBe(3);
    expect(theme.liftScale).toBe(1.06);
    expect(theme.dropDuration).toBe(300);
    expect(theme.liftShadowOpacity).toBe(0.55);
    expect(theme.columnWidth).toBe(compactMetrics.columnWidth);
  });

  it('leaves comfortable spacing alone', () => {
    expect(resolveTheme(false, 'comfortable').columnWidth).toBe(lightTheme.columnWidth);
    expect(resolveTheme(true, undefined).cardGap).toBe(darkTheme.cardGap);
  });
});
