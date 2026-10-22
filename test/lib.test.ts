import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildDataset, rollup } from '../src/lib/data';
import { compareValues, parseValue } from '../src/lib/values';
import { addTerm, highlightRanges, search } from '../src/lib/search';
import { colorsFor, darker } from '../src/lib/colors';
import { computeLayout, columnX, rowY } from '../src/lib/layout';
import { detectFormat, parseBytes } from '../src/lib/parse';
import { resolveHostedUrl } from '../src/lib/hosted';
import { segments } from '../src/lib/linkify';
import { deserialize, scriptSafeJson, serialize } from '../src/lib/persist';
import { topTerms } from '../src/lib/terms';

const fixture = (name: string) => new Uint8Array(readFileSync(resolve(__dirname, 'fixtures', name)));
const json = (name: string) => JSON.parse(readFileSync(resolve(__dirname, 'fixtures', name), 'utf8'));
const plain = (row: Record<string, string>) => ({ ...row });

describe('parsers', () => {
  for (const file of ['data.csv', 'data.xlsx', 'data.xls']) {
    it(`parses ${file}`, () => {
      const dataset = parseBytes(file, fixture(file));
      expect(dataset.columns).toEqual(['Name', 'Age']);
      expect(dataset.items.map((i) => plain(i.raw))).toEqual([json('data.json')]);
    });
  }

  it('detects formats by content', () => {
    expect(detectFormat(fixture('data.xlsx'))).toBe('xlsx');
    expect(detectFormat(fixture('data.xls'))).toBe('xls');
    expect(detectFormat(fixture('data.csv'))).toBe('csv');
  });

  it('parses the bundled example', () => {
    const bytes = new Uint8Array(readFileSync(resolve(__dirname, '../public/shopping_decision_diary.xlsx')));
    const dataset = parseBytes('shopping_decision_diary.xlsx', bytes);
    expect(dataset.items.length).toBe(234);
    expect(dataset.columns.length).toBe(10);
    expect(dataset.columns.slice(0, 2)).toEqual(['Participant', 'Segment']);
  });

  it('names blank and duplicate headers', () => {
    const csv = new TextEncoder().encode('Name,,Name\na,b,c\n');
    expect(parseBytes('x.csv', csv).columns).toEqual(['Name', 'Column 2', 'Name (2)']);
  });

  it('keeps hostile column names inert', () => {
    const csv = new TextEncoder().encode('__proto__,constructor\nx,y\n');
    const dataset = parseBytes('x.csv', csv);
    expect(dataset.items[0].raw['__proto__']).toBe('x');
    expect(({} as Record<string, unknown>).x).toBeUndefined();
  });

  it('falls back to windows-1252 for non-UTF-8 CSVs', () => {
    const bytes = new Uint8Array([...new TextEncoder().encode('Name\nCaf'), 0xe9, 0x0a]);
    expect(parseBytes('x.csv', bytes).items[0].raw.Name).toBe('Café');
  });
});

describe('value parsing', () => {
  it('reads dates, numbers, and numbered strings', () => {
    expect(parseValue('2/1/10')).toBe(new Date(2010, 1, 1).getTime());
    expect(parseValue('2015-03-04')).toBe(new Date(2015, 2, 4).getTime());
    expect(parseValue('1,234.5')).toBe(1234.5);
    expect(parseValue('1. Hockey')).toBe(1);
    expect(parseValue('Hockey')).toBe('Hockey');
    expect(parseValue('2/31/10')).toBe('2/31/10');
    expect(parseValue('We')).toBe('We');
    expect(compareValues(parseValue('Tuesday'), parseValue('Monday'))).toBeGreaterThan(0);
  });

  it('sorts numbers before text, naturally and case-insensitively', () => {
    const values = ['b', 'Item 10', 10, 'Item 2', 2, 'A', ''];
    expect([...values].sort(compareValues)).toEqual([2, 10, 'A', 'b', 'Item 2', 'Item 10', '']);
  });
});

describe('search (ported from the original test suite)', () => {
  const dataset = buildDataset('search', json('search.json'));
  const all = dataset.columns;
  const count = (term: string, scope = all) => search(dataset.items, term, scope)?.size;

  it('performs keyword search', () => {
    for (const item of dataset.items) {
      expect([...search(dataset.items, item.raw.Name, all)!]).toEqual([item.id]);
    }
  });

  it('performs phrase search', () => {
    expect(count('umami')).toBe(2);
    expect(count('kombucha umami')).toBe(2);
    expect(count('"kombucha umami"')).toBe(1);
    expect(count('satisfied')).toBe(2);
    expect(count('Extremely satisfied')).toBe(2);
    expect(count('"Extremely satisfied"')).toBe(1);
  });

  it('accepts AND', () => {
    expect(count('kombucha Ashley')).toBe(2);
    expect(count('kombucha AND Ashley')).toBe(1);
  });

  it('accepts * wildcard', () => {
    expect(count('re*d')).toBe(2);
    expect(count('re*k')).toBe(0);
  });

  it('restricts to columns', () => {
    expect(count('Cody')).toBe(1);
    expect(count('Cody', ['Age'])).toBe(0);
  });

  it('returns null with no term', () => {
    expect(search(dataset.items, '', all)).toBeNull();
  });

  it('merges overlapping highlights', () => {
    expect(highlightRanges('kombucha umami', 'kom kombucha AND umami')).toEqual([[0, 8], [9, 14]]);
  });

  it('adds terms with AND on shift', () => {
    expect(addTerm('', 'dog', true)).toBe('dog');
    expect(addTerm('dog', 'food', false)).toBe('dog food');
    expect(addTerm('dog', 'food', true)).toBe('dog AND food');
  });

  it('lists frequent words without stop words', () => {
    const terms = topTerms(dataset.items, all);
    expect(terms[0]).toEqual({ term: 'kombucha', frequency: 2 });
    expect(terms.some((t) => t.term === 'and')).toBe(false);
  });
});

describe('colors', () => {
  it('assigns the original first four colors', () => {
    expect(colorsFor(4).map((c) => c.fill)).toEqual(['#0A3BB1', '#3396E4', '#02DE99', '#FFD100']);
  });

  it('darkens like d3 v3', () => {
    expect(darker('#FFFFFF', 0.7)).toBe('#c6c6c6');
  });

  it('has 39 core colors plus 37 darker variants', () => {
    expect(colorsFor(1000).length).toBe(76);
  });
});

describe('layout', () => {
  const rows = [
    { P: 'Ann', S: 'x' },
    { P: 'Bob', S: 'y' },
    { P: 'Ann', S: 'y' },
    { P: 'Ann', S: 'x' },
  ];
  const dataset = buildDataset('t', rows);
  const base = { groupKey: 'P', colorKey: 'S', split: false, counts: false, sortBy: 'value', sortDirection: 'ascending' } as const;

  it('stacks items by group, sorted by color then file order', () => {
    const layout = computeLayout(dataset.items, base);
    expect(layout.groups.map((g) => g.label)).toEqual(['Ann', 'Bob']);
    expect(layout.items.map((i) => i.id)).toEqual([1, 4, 3, 2]);
    expect(layout.positions.get(3)).toEqual({ x: columnX(2), y: rowY(1) });
    expect(layout.positions.get(2)).toEqual({ x: columnX(0), y: rowY(2) });
    expect(layout.rowWidth).toBe(columnX(3) + 54);
  });

  it('splits into color bands', () => {
    const layout = computeLayout(dataset.items, { ...base, split: true, counts: true });
    // band x: widest group has 2 (+1 count slot) → band y starts at 3 + 1 gap
    expect(layout.positions.get(3)!.x).toBe(columnX(4));
    expect(layout.counts.find((c) => c.key === 'x\u0000Ann')).toMatchObject({ text: '2', x: columnX(2) });
  });

  it('sorts rows by count', () => {
    const layout = computeLayout(dataset.items, { ...base, sortBy: 'count', sortDirection: 'ascending' });
    expect(layout.groups.map((g) => g.label)).toEqual(['Bob', 'Ann']);
  });

  it('rolls up with a sub-key', () => {
    expect(rollup(dataset.items, 'S', 'P').map((g) => [g.label, g.count])).toEqual([
      ['x', 2],
      ['y', 1],
      ['y', 1],
    ]);
  });
});

describe('hosted links', () => {
  it('rewrites common share links', () => {
    expect(resolveHostedUrl('https://www.dropbox.com/s/abc/data.xlsx?dl=0').url).toBe('https://dl.dropboxusercontent.com/s/abc/data.xlsx');
    expect(resolveHostedUrl('https://docs.google.com/spreadsheets/d/KEY/edit#gid=42').url).toBe(
      'https://docs.google.com/spreadsheets/d/KEY/export?format=csv&gid=42',
    );
    expect(resolveHostedUrl('https://drive.google.com/file/d/ID/view?usp=sharing').url).toContain('id=ID');
    expect(resolveHostedUrl('https://github.com/u/r/blob/main/a.csv').url).toBe('https://raw.githubusercontent.com/u/r/main/a.csv');
    expect(resolveHostedUrl('http://example.com/a.csv')).toEqual({ url: 'https://example.com/a.csv', name: 'a.csv' });
  });

  it('rejects non-web URLs', () => {
    expect(() => resolveHostedUrl('javascript:alert(1)')).toThrow();
    expect(() => resolveHostedUrl('file:///etc/passwd')).toThrow();
  });
});

describe('linkify', () => {
  it('splits links, images, and highlights', () => {
    const text = 'see https://x.com/a.png and www.y.org, or me@z.io';
    const kinds = segments(text).map((s) => s.kind);
    expect(kinds).toEqual(['text', 'image', 'text', 'link', 'text', 'link']);
    const link = segments(text).find((s) => s.kind === 'link');
    expect(link).toMatchObject({ href: 'https://www.y.org' });
    const marked = segments('dog food', [[4, 8]]);
    expect(marked).toEqual([{ kind: 'text', pieces: [{ text: 'dog ', mark: false }, { text: 'food', mark: true }] }]);
  });
});

describe('persistence', () => {
  it('round-trips a dataset', () => {
    const dataset = buildDataset('t.csv', [{ A: '1', B: '</script><b>' }]);
    const text = scriptSafeJson(serialize(dataset));
    expect(text).not.toContain('</script>');
    const restored = deserialize(JSON.parse(text)).dataset;
    expect(plain(restored.items[0].raw)).toEqual({ A: '1', B: '</script><b>' });
  });
});
