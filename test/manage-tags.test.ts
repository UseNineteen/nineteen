import { describe, expect, it } from 'vitest';
import { buildDataset, joinTags, splitTags } from '../src/lib/data';
import { search } from '../src/lib/search';
import { Viz } from '../src/lib/viz.svelte';

const rows = () => [
  { Note: 'cheap shoes', Segment: 'Younger Women, No Kids', Tags: 'price' },
  { Note: 'a gift', Segment: 'Older Moms', Tags: 'gift, Price' },
  { Note: 'cost was high', Segment: 'Older Moms', Tags: '' },
  { Note: 'birthday present', Segment: 'Grandmothers', Tags: 'Gift' },
];

const tagsOf = (viz: Viz) => viz.dataset.items.map((i) => i.raw.Tags);

describe('list separators', () => {
  it('splits on the chosen separator only', () => {
    expect(splitTags('Younger Women, No Kids; Older Moms', 'semicolon')).toEqual(['Younger Women, No Kids', 'Older Moms']);
    expect(splitTags('a, b\nc', 'newline')).toEqual(['a, b', 'c']);
    expect(splitTags('a, b; c')).toEqual(['a', 'b', 'c']);
  });

  it('joins with the matching separator', () => {
    expect(joinTags(['b', 'a'], 'semicolon')).toBe('a; b');
    expect(joinTags(['b', 'a'], 'newline')).toBe('a\nb');
  });

  it('search matches whole values using each column’s separator', () => {
    const dataset = buildDataset('t.csv', rows());
    const columns = dataset.columns;
    const bySemicolon = new Map([['Segment', 'semicolon' as const]]);
    expect(search(dataset.items, '"Younger Women, No Kids"', columns, bySemicolon)?.size).toBe(1);
    expect(search(dataset.items, '"No Kids"', ['Segment'], bySemicolon)?.size).toBe(0);
  });
});

describe('tags column', () => {
  it('defaults to a column named Tags and can be switched to another list column', () => {
    const viz = new Viz(buildDataset('t.csv', rows()));
    expect(viz.tagEditColumn).toBe('Tags');
    viz.setTagsColumn('Segment');
    expect(viz.tagEditColumn).toBe('Segment');
    expect(viz.isTagColumn('Segment')).toBe(true);
    viz.setTagColumn('Segment', false);
    expect(viz.tagEditColumn).toBe('Tags');
  });
});

describe('bulk tag changes', () => {
  it('tags search matches, keeping existing spelling and other tags', () => {
    const viz = new Viz(buildDataset('t.csv', rows()));
    viz.searchTerm = 'cheap cost';
    const changed = viz.tagItems(viz.matches!, 'PRICE');
    expect(changed).toBe(1); // row 1 already had it
    expect(tagsOf(viz)).toEqual(['price', 'gift, Price', 'price', 'Gift']);
  });

  it('undoes the last bulk change', () => {
    const viz = new Viz(buildDataset('t.csv', rows()));
    viz.tagItems(new Set([3]), 'price');
    expect(viz.tagUndo?.label).toContain('price');
    viz.undoTags();
    expect(tagsOf(viz)).toEqual(['price', 'gift, Price', '', 'Gift']);
    expect(viz.tagUndo).toBeNull();
  });

  it('renames, and renaming onto an existing tag combines them', () => {
    const viz = new Viz(buildDataset('t.csv', rows()));
    viz.renameTag('gift', 'present');
    expect(tagsOf(viz)).toEqual(['price', 'present, Price', '', 'present']);
    viz.combineTags('present', 'price');
    expect(tagsOf(viz)).toEqual(['price', 'price', '', 'price']);
  });

  it('keeps legend order and hidden tags in step with a rename', () => {
    const viz = new Viz(buildDataset('t.csv', rows()), {
      groupKey: 'Tags',
      colorKey: 'Tags',
      automatic: false,
      counts: false,
      split: false,
      zoom: 1,
      sortBy: 'value',
      sortDirection: 'ascending',
      viewerColumns: [],
      searchTerm: '',
      searchScope: [],
      legendCollapsed: false,
      tagColumns: ['Tags'],
      tagIgnored: { Tags: ['gift'] },
      valueOrders: { Tags: ['price', 'gift + price', 'gift', ''] },
    });
    viz.renameTag('gift', 'present');
    expect(viz.valueOrders.Tags).toEqual(['price', 'present + price', 'present', '']);
    expect(viz.tagIgnored.Tags).toEqual(['present']);
  });

  it('deletes a tag from every item', () => {
    const viz = new Viz(buildDataset('t.csv', rows()));
    expect(viz.deleteTag('GIFT')).toBe(2);
    expect(tagsOf(viz)).toEqual(['price', 'Price', '', '']);
  });

  it('converts a tag into a True/False data field, removing the tag, with a unique name', () => {
    const viz = new Viz(buildDataset('t.csv', rows()));
    const column = viz.tagToColumn('price', 'Note');
    expect(column).toBe('Note (2)');
    expect(viz.dataset.items.map((i) => i.raw[column])).toEqual(['True', 'True', 'False', 'False']);
    expect(tagsOf(viz)).toEqual(['', 'gift', '', 'Gift']);
    viz.undoTags();
    expect(viz.dataset.columns).not.toContain(column);
    expect(tagsOf(viz)).toEqual(['price', 'gift, Price', '', 'Gift']);
  });

  it('can keep the tag when converting', () => {
    const viz = new Viz(buildDataset('t.csv', rows()));
    const column = viz.tagToColumn('price', 'Price', true);
    expect(viz.dataset.items.map((i) => i.raw[column])).toEqual(['True', 'True', 'False', 'False']);
    expect(tagsOf(viz)).toEqual(['price', 'gift, Price', '', 'Gift']);
  });

  it('creates the Tags column on first use', () => {
    const viz = new Viz(buildDataset('t.csv', [{ Note: 'a' }, { Note: 'b' }]));
    expect(viz.hasTags).toBe(false);
    viz.tagItems(new Set([2]), 'gift');
    expect(viz.dataset.columns).toEqual(['Note', 'Tags']);
    expect(viz.dataset.items.map((i) => i.raw.Tags)).toEqual(['', 'gift']);
    expect(viz.isTagColumn('Tags')).toBe(true);
  });
});
