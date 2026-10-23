import { describe, expect, it } from 'vitest';
import { wrapText } from '../src/lib/wrap';

// One unit per character keeps the expectations readable
const measure = (s: string) => s.length;

describe('wrapping value labels', () => {
  it('keeps short labels on one line', () => {
    expect(wrapText('Older Moms', 20, measure, 3)).toEqual({ lines: ['Older Moms'], complete: true, brokenWord: false, shown: 1 });
  });

  it('wraps at word boundaries', () => {
    expect(wrapText("Shopped offline and didn't purchase", 16, measure, 3).lines).toEqual(['Shopped offline', "and didn't", 'purchase']);
  });

  it('reports text that needs more than the allowed lines', () => {
    const wrapped = wrapText('one two three four five six', 8, measure, 3);
    expect(wrapped.lines).toEqual(['one two', 'three', 'four']);
    expect(wrapped.complete).toBe(false);
    expect(wrapped.shown).toBeCloseTo(18 / 27);
  });

  it('flags a single word wider than the line', () => {
    expect(wrapText('Grandmothers', 8, measure, 3).brokenWord).toBe(true);
  });
});
