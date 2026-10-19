import { describe, expect, it } from 'vitest';
import { compactMetrics, darkTheme, lightTheme, motionPresets, resolveTheme, themePresets } from './theme';

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

function luminance(hex: string): number {
  const value = Number.parseInt(hex.slice(1), 16);
  const channel = (shift: number) => {
    const c = ((value >> shift) & 255) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe('theme presets', () => {
  const palettes = [
    ['standard light', lightTheme],
    ['standard dark', darkTheme],
    ...Object.entries(themePresets).flatMap(([name, preset]) => [
      [`${name} light`, preset.light],
      [`${name} dark`, preset.dark],
    ]),
  ] as const;

  it.each(palettes)('%s passes AA for text and muted text on cards and columns', (_name, palette) => {
    for (const surface of [palette.cardBackground, palette.columnBackground, palette.background]) {
      expect(contrast(palette.text, surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(palette.mutedText, surface)).toBeGreaterThanOrEqual(4.5);
    }
    // Accent, warning and reject mark outlines, meters and counts: 3:1 for graphics and bold text.
    for (const mark of [palette.accent, palette.warning, palette.reject]) {
      expect(contrast(mark, palette.columnBackground)).toBeGreaterThanOrEqual(3);
    }
  });

  it('applies a preset under density and lift overrides', () => {
    const theme = resolveTheme(true, 'compact', { accent: '#123456' }, 'aurora', 'playful');
    expect(theme.background).toBe(themePresets.aurora.dark.background);
    expect(theme.accent).toBe('#123456');
    expect(theme.columnWidth).toBe(compactMetrics.columnWidth);
    expect(theme.liftTilt).toBe(motionPresets.playful.lift.liftTilt);
  });
});
