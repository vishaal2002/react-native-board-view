import { describe, expect, it } from 'vitest';
import { createCellHeights } from './cellHeights';

describe('createCellHeights', () => {
  it('keeps the height a cell last had', () => {
    const heights = createCellHeights();
    heights.record('a::todo', [80, 80, 100, 60]);
    expect(heights.estimate('a::todo', 4, 20, 80)).toBe(340);
  });

  it('adds or removes the average row for cards that came or went', () => {
    const heights = createCellHeights();
    heights.record('a::todo', [50, 50, 50, 50]);
    heights.record('b::todo', [100]);
    // 300 points over 5 rows: 60 a row.
    expect(heights.estimate('a::todo', 6, 20, 80)).toBe(340);
    expect(heights.estimate('a::todo', 3, 20, 80)).toBe(160);
  });

  it('guesses from the average row for a cell never drawn', () => {
    const heights = createCellHeights();
    heights.record('a::todo', [50, 50, 50, 50]);
    expect(heights.estimate('a::done', 2, 20, 80)).toBe(120);
  });

  it('never goes under the minimum, and has a guess before anything is measured', () => {
    const heights = createCellHeights();
    expect(heights.estimate('a::todo', 0, 20, 80)).toBe(80);
    expect(heights.estimate('a::todo', 2, 20, 80)).toBe(164);
  });

  it('replaces a cell measured again instead of counting it twice', () => {
    const heights = createCellHeights();
    heights.record('a::todo', [50, 50, 50, 50]);
    heights.record('a::todo', [70, 70]);
    expect(heights.estimate('a::done', 1, 20, 0)).toBe(90);
  });

  it('leaves empty cells out of the average', () => {
    const heights = createCellHeights();
    heights.record('a::todo', [50, 50, 50, 50]);
    heights.record('a::done', []);
    expect(heights.estimate('b::done', 2, 20, 0)).toBe(120);
    expect(heights.estimate('a::done', 0, 20, 80)).toBe(80);
  });
});
