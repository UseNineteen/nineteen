import { describe, expect, it } from 'vitest';
import { buildDataset } from '../src/lib/data';
import { Viz } from '../src/lib/viz.svelte';

const dataset = () =>
  buildDataset('t.csv', [
    { Level: 'Satisfied' },
    { Level: 'Not satisfied' },
    { Level: 'Extremely satisfied' },
    { Level: 'Not at all satisfied' },
    { Level: 'Satisfied' },
  ]);

const rows = (viz: Viz) => viz.layout.groups.map((g) => g.label);

describe('custom row order', () => {
  it('moves a row and switches the A–Z button to the custom state', () => {
    const viz = new Viz(dataset());
    expect(rows(viz)).toEqual(['Extremely satisfied', 'Not at all satisfied', 'Not satisfied', 'Satisfied']);
    viz.moveRow(0, 3);
    expect(rows(viz)).toEqual(['Not at all satisfied', 'Not satisfied', 'Satisfied', 'Extremely satisfied']);
    expect(viz.valueSortShown).toBe('custom');
  });

  it('cycles A–Z → Z–A → custom → A–Z once a custom order exists', () => {
    const viz = new Viz(dataset());
    viz.sort('value');
    expect(viz.valueSortShown).toBe('descending');
    viz.sort('value');
    expect(viz.valueSortShown).toBe('ascending'); // no custom order yet
    viz.moveRow(0, 3);
    viz.sort('value');
    expect(viz.valueSortShown).toBe('ascending');
    expect(rows(viz)[0]).toBe('Extremely satisfied'); // A–Z is plain alphabetical again
    viz.sort('value');
    expect(viz.valueSortShown).toBe('descending');
    viz.sort('value');
    expect(viz.valueSortShown).toBe('custom');
    expect(rows(viz)).toEqual(['Not at all satisfied', 'Not satisfied', 'Satisfied', 'Extremely satisfied']);
  });

  it('keeps the custom order per field and restores it after sorting by count', () => {
    const viz = new Viz(buildDataset('t.csv', [{ A: 'x', B: '1' }, { A: 'y', B: '2' }, { A: 'z', B: '2' }]));
    viz.moveRow(2, 0);
    expect(rows(viz)).toEqual(['z', 'x', 'y']);
    viz.sort('count');
    viz.sort('value');
    expect(viz.valueSortShown).toBe('custom');
    viz.setGroupKey('B');
    expect(viz.hasRowOrder).toBe(false);
    expect(viz.valueSortShown).toBe('ascending');
    viz.setGroupKey('A');
    expect(rows(viz)).toEqual(['z', 'x', 'y']);
  });

  it('dragging the legend of the grouping field reorders the rows too', () => {
    const viz = new Viz(dataset());
    viz.moveLegendEntry(0, 3);
    expect(viz.valueSortShown).toBe('custom');
    expect(rows(viz)).toEqual(rows(viz).length ? viz.layout.legend.map((g) => g.label) : []);
  });
});
