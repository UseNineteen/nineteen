import { describe, expect, it } from 'vitest';
import { buildDataset, joinTags, splitTags, withCell } from '../src/lib/data';
import { combination, groupingItems, tagCatalog } from '../src/lib/tags';
import { computeLayout } from '../src/lib/layout';
import { search } from '../src/lib/search';

const dataset = buildDataset('t.csv', [
  { Note: 'a', Tags: 'Price, gift' },
  { Note: 'b', Tags: 'gift , price' },
  { Note: 'c', Tags: 'price' },
  { Note: 'd', Tags: 'pricey; follow-up' },
  { Note: 'e', Tags: '' },
  { Note: 'f', Tags: 'follow-up' },
]);

describe('tag cells', () => {
  it('splits on commas and semicolons, trims, and drops duplicates ignoring case', () => {
    expect(splitTags(' gift ,Price;  price ,, ')).toEqual(['gift', 'Price']);
    expect(splitTags(undefined)).toEqual([]);
  });

  it('stores tags sorted alphabetically', () => {
    expect(joinTags(['price', 'Gift', 'price', 'apple pie'])).toBe('apple pie, Gift, price');
  });

  it('changes one cell, adding the column when needed', () => {
    const plain = buildDataset('p.csv', [{ A: '1' }, { A: '2' }]);
    const tagged = withCell(plain, 2, 'Tags', 'x');
    expect(tagged.columns).toEqual(['A', 'Tags']);
    expect(tagged.items.map((i) => i.raw.Tags)).toEqual(['', 'x']);
    expect(plain.columns).toEqual(['A']); // original untouched
    const again = withCell(tagged, 1, 'Tags', 'y');
    expect(again.items[1]).toBe(tagged.items[1]); // unchanged rows are reused
    expect(again.items.map((i) => i.raw.Tags)).toEqual(['y', 'x']);
  });
});

describe('grouping by tags', () => {
  const catalog = tagCatalog(dataset.items, 'Tags');
  const labels = new Map(catalog.map((t) => [t.key, t.label]));

  it('catalogs tags with a canonical spelling and row counts', () => {
    expect(catalog.map((t) => [t.label, t.count])).toEqual([
      ['Price', 3],
      ['follow-up', 2],
      ['gift', 2],
      ['pricey', 1],
    ]);
  });

  it('groups by combination regardless of order, spacing and case', () => {
    const combos = dataset.items.map((i) => combination(i.raw.Tags, labels, new Set()));
    expect(combos).toEqual(['gift + Price', 'gift + Price', 'Price', 'follow-up + pricey', '', 'follow-up']);
  });

  it('leaves ignored tags out of the combination', () => {
    const combos = dataset.items.map((i) => combination(i.raw.Tags, labels, new Set(['follow-up'])));
    expect(combos).toEqual(['gift + Price', 'gift + Price', 'Price', 'pricey', '', '']);
  });

  it('keeps exactly one box per row in the layout', () => {
    const items = groupingItems(dataset.items, [{ column: 'Tags', catalog, ignored: new Set(['follow-up']) }]);
    const layout = computeLayout(items, { groupKey: 'Tags', colorKey: 'Tags', split: false, counts: false, sortBy: 'value', sortDirection: 'ascending' });
    expect(layout.positions.size).toBe(dataset.items.length);
    expect(layout.groups.map((g) => [g.label, g.count])).toEqual([
      ['gift + Price', 2],
      ['Price', 1],
      ['pricey', 1],
      ['', 2],
    ]);
    // The real data is unchanged
    expect(dataset.items[3].raw.Tags).toBe('pricey; follow-up');
  });
});

describe('searching tag columns', () => {
  const all = dataset.columns;
  it('matches whole tags only in tag columns', () => {
    expect([...search(dataset.items, 'price', all, new Set(['Tags']))!]).toEqual([1, 2, 3]);
    // Without treating Tags as a tag column, "price" also finds "pricey"
    expect([...search(dataset.items, 'price', all)!]).toEqual([1, 2, 3, 4]);
    expect([...search(dataset.items, 'price*', all, new Set(['Tags']))!]).toEqual([4]);
  });
});
