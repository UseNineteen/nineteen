import { describe, expect, it } from 'vitest';
import { buildDataset } from '../src/lib/data';
import { dedupeEntries, followTagRenames, formatTagList, mergeTagList, parseTagList, withDescription } from '../src/lib/tag-list';
import { Viz } from '../src/lib/viz.svelte';

const rows = [
  { tag: 'gift', description: 'Bought for someone else', count: 3 },
  { tag: 'Price', description: '', count: 1 },
];

describe('tag list files', () => {
  it('writes CSV, JSON and text', () => {
    expect(formatTagList(rows, 'csv')).toBe('﻿tag,description,count\r\ngift,Bought for someone else,3\r\nPrice,,1');
    expect(JSON.parse(formatTagList(rows, 'json'))).toEqual({ nineteen: 'tag list', tags: rows });
    expect(formatTagList(rows, 'text')).toBe('gift\tBought for someone else\nPrice\n');
  });

  it('reads back what it writes', () => {
    const entries = rows.map(({ tag, description }) => ({ tag, description }));
    expect(parseTagList('tags.csv', formatTagList(rows, 'csv'))).toEqual(entries);
    expect(parseTagList('tags.json', formatTagList(rows, 'json'))).toEqual(entries);
    expect(parseTagList('tags.txt', formatTagList(rows, 'text'))).toEqual(entries);
  });

  it('reads other people’s files: header names, no header, plain lists, JSON arrays', () => {
    expect(parseTagList('codes.csv', 'Code,Definition\nprice,"Cost, value for money"\n')).toEqual([
      { tag: 'price', description: 'Cost, value for money' },
    ]);
    expect(parseTagList('x.csv', 'gift,for someone\nprice\n')).toEqual([
      { tag: 'gift', description: 'for someone' },
      { tag: 'price', description: '' },
    ]);
    expect(parseTagList('x.txt', 'gift\n\n  price  \n')).toEqual([
      { tag: 'gift', description: '' },
      { tag: 'price', description: '' },
    ]);
    expect(parseTagList('x.json', '["gift", {"name": "price", "notes": "cost"}]')).toEqual([
      { tag: 'gift', description: '' },
      { tag: 'price', description: 'cost' },
    ]);
    expect(parseTagList('x', '{"tags": ["a"]}')).toEqual([{ tag: 'a', description: '' }]);
  });

  it('refuses what is not a list', () => {
    expect(() => parseTagList('x.json', '{"nope": 1}')).toThrow(/no list/);
    expect(() => parseTagList('x.json', '{')).toThrow(/valid JSON/);
  });

  it('keeps one spelling per tag, ignoring case', () => {
    expect(
      dedupeEntries([
        { tag: 'Gift', description: '' },
        { tag: 'gift', description: 'present' },
      ]),
    ).toEqual([{ tag: 'Gift', description: 'present' }]);
  });
});

describe('tag list changes', () => {
  const list = [
    { tag: 'gift', description: 'Bought for someone else' },
    { tag: 'price', description: '' },
  ];

  it('merges an import: new tags added, known tags keep their spelling and gain descriptions', () => {
    const result = mergeTagList(list, [
      { tag: 'PRICE', description: 'About cost' },
      { tag: 'Gift', description: 'ignored: gift is described already' },
      { tag: 'quality', description: '' },
    ]);
    expect(result.list).toEqual([
      { tag: 'gift', description: 'Bought for someone else' },
      { tag: 'price', description: 'About cost' },
      { tag: 'quality', description: '' },
    ]);
    expect([result.added, result.described]).toEqual([1, 1]);
  });

  it('sets a description, adding the tag when it is new', () => {
    expect(withDescription(list, 'Price', 'cost')[1]).toEqual({ tag: 'price', description: 'cost' });
    expect(withDescription(list, 'new', 'x')).toHaveLength(3);
  });

  it('follows renames, combines and deletes', () => {
    expect(followTagRenames(list, new Map([['price', 'Cost']]))[1]).toEqual({ tag: 'Cost', description: '' });
    // Combined into gift: gift keeps its description
    expect(followTagRenames(list, new Map([['price', 'gift']]))).toEqual([list[0]]);
    // Combined the other way: price takes gift's description
    expect(followTagRenames(list, new Map([['gift', 'price']]))).toEqual([{ tag: 'price', description: 'Bought for someone else' }]);
    expect(followTagRenames(list, new Map([['gift', null]]))).toEqual([list[1]]);
  });
});

describe('the view’s tag list', () => {
  const data = () =>
    buildDataset('t.csv', [
      { Note: 'a', Tags: 'price' },
      { Note: 'b', Tags: 'Price, gift' },
    ]);

  it('lists used and unused tags with descriptions, and keeps spelling from the data', () => {
    const viz = new Viz(data(), undefined);
    viz.importTagList([
      { tag: 'PRICE', description: 'cost' },
      { tag: 'quality', description: 'how well made' },
    ]);
    expect(viz.tagEntries.map((t) => [t.label, t.count, t.description])).toEqual([
      ['price', 2, 'cost'],
      ['gift', 1, ''],
      ['quality', 0, 'how well made'],
    ]);
    viz.undoTags();
    expect(viz.tagEntries).toHaveLength(2);
  });

  it('renames and deletes unused tags in the list alone, with undo', () => {
    const viz = new Viz(data(), undefined);
    viz.importTagList([{ tag: 'quality', description: 'how well made' }]);
    expect(viz.renameTag('quality', 'Quality')).toBe(0);
    expect(viz.tagList.map((e) => e.tag)).toEqual(['Quality']);
    expect(viz.deleteTag('quality')).toBe(0);
    expect(viz.tagList).toEqual([]);
    viz.undoTags();
    expect(viz.tagList.map((e) => e.tag)).toEqual(['Quality']);
  });

  it('describes tags and keeps the list in the view state', () => {
    const viz = new Viz(data(), undefined);
    viz.describeTag('gift', 'for someone else');
    expect(viz.tagEntries.find((t) => t.key === 'gift')?.description).toBe('for someone else');
    const again = new Viz(data(), viz.toViewState());
    expect(again.tagList).toEqual([{ tag: 'gift', description: 'for someone else' }]);
  });
});
