import { describe, expect, it } from 'vitest';
import { decideBandLabels, LINE_HEIGHT } from '../src/lib/band-labels';
import type { BandHeader } from '../src/lib/layout';

// A fixed-width "font": 6px per character for labels, 5px for totals
const measure = (text: string, weight: 400 | 500) => text.length * (weight === 500 ? 6 : 5);
const header = (label: string, width: number, total: string | null = null): BandHeader => ({
  key: label,
  label,
  total,
  x: 0,
  cx: 0,
  y: 0,
  width,
  cwidth: 0,
  pad: 0,
});
const decide = (headers: BandHeader[], aspect = 1) => decideBandLabels(headers, (h) => h.label, aspect, measure);

describe('band labels', () => {
  it('stay on one line when every label fits its band', () => {
    expect(decide([header('Moms', 200), header('Kids', 200)])).toMatchObject({ mode: 'line', lines: 1, extra: 0, pads: [] });
  });

  it('wrap when a label needs more than one line', () => {
    const labels = decide([header('Younger women with kids', 90), header('Kids', 200)]);
    expect(labels.mode).toBe('wrap');
    expect(labels.lines).toBeGreaterThan(1);
    expect(labels.extra).toBe((labels.lines - 1) * LINE_HEIGHT);
  });

  it('widen just the few bands that are too narrow even to wrap', () => {
    const labels = decide([header('Extraordinary', 30), header('Kids', 200), header('Moms', 200), header('Teens', 200)]);
    expect(labels.mode).not.toBe('turn');
    expect(labels.pads.length).toBe(4);
    expect(labels.pads[0]).toBeGreaterThan(0);
    expect(labels.pads.slice(1)).toEqual([0, 0, 0]);
  });

  it('turn every label when many bands are too narrow', () => {
    const labels = decide([header('Extraordinary', 30), header('Unbelievable', 30), header('Kids', 200)]);
    expect(labels.mode).toBe('turn');
    expect(labels.pads).toEqual([]);
    expect(labels.length).toBeGreaterThan(0);
  });

  it('account for stretched boxes and band totals', () => {
    // Twice as wide boxes double the room; a total takes some of it back
    expect(decide([header('Younger women with kids', 90)], 2).mode).toBe('line');
    expect(decide([header('Younger women with kids', 90, '123')], 2).mode).toBe('wrap');
  });
});
