import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as XLSX from 'xlsx';
import { buildDataset, rollup } from '../src/lib/data';
import { compareValues, parseValue } from '../src/lib/values';
import { addTerm, highlightRanges, search } from '../src/lib/search';
import { colorsFor, darker } from '../src/lib/colors';
import { boxScale, computeLayout, columnX, countSlot, GEOMETRY, gridWidth, percent, rowY, zoomBounds } from '../src/lib/layout';
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

  it('parses the bundled examples', () => {
    const bytes = new Uint8Array(readFileSync(resolve(__dirname, '../public/shopping_decision_diary.xlsx')));
    const dataset = parseBytes('shopping_decision_diary.xlsx', bytes);
    expect(dataset.items.length).toBe(117);
    expect(dataset.columns.length).toBe(10);
    expect(dataset.columns.slice(0, 2)).toEqual(['Participant', 'Segment']);
    // The extended copy, which "Try an example" opens
    const extended = new Uint8Array(readFileSync(resolve(__dirname, '../public/shopping_decision_diary_extended.xlsx')));
    expect(parseBytes('shopping_decision_diary_extended.xlsx', extended).items.length).toBe(293);
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

  // Items are numbered by their row in the file, as a spreadsheet shows it (header = row 1)
  it('numbers CSV rows as the file has them, counting blank lines', () => {
    const csv = new TextEncoder().encode('Name\na\n\n  \nb\n');
    expect(parseBytes('x.csv', csv).items.map((i) => [i.id, i.raw.Name])).toEqual([
      [2, 'a'],
      [5, 'b'],
    ]);
  });

  it('numbers sheet rows as the spreadsheet shows them', () => {
    const bytes = (sheet: XLSX.WorkSheet) => {
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, sheet, 'Data');
      return new Uint8Array(XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }));
    };
    const ids = (sheet: XLSX.WorkSheet) => parseBytes('x.xlsx', bytes(sheet)).items.map((i) => [i.id, i.raw.Name]);
    // Blank rows above the header and inside the data
    expect(ids(XLSX.utils.aoa_to_sheet([[], [], ['Name'], ['a'], [], ['b']]))).toEqual([
      [4, 'a'],
      [6, 'b'],
    ]);
    // A used range that starts below row 1
    const offset = XLSX.utils.sheet_add_aoa(XLSX.utils.aoa_to_sheet([]), [['Name'], ['a'], [], ['b']], { origin: 'A3' });
    offset['!ref'] = 'A3:A6'; // as Excel writes a sheet whose first used cell is A3
    expect(ids(offset)).toEqual([
      [4, 'a'],
      [6, 'b'],
    ]);
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
    // Spaces alone are not a term either, and an AND without a second term doesn't filter yet
    expect(search(dataset.items, '   ', all)).toBeNull();
    expect(count('kombucha AND ')).toBe(count('kombucha'));
  });

  it('merges overlapping highlights', () => {
    expect(highlightRanges('kombucha umami', 'kom kombucha AND umami')).toEqual([
      [0, 8],
      [9, 14],
    ]);
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
  const base = { rowKey: 'P', columnKey: null, colorKey: 'S', counts: 'none', sortBy: 'value', sortDirection: 'ascending' } as const;

  it('stacks items by group, sorted by color then file order', () => {
    const layout = computeLayout(dataset.items, base);
    expect(layout.groups.map((g) => g.label)).toEqual(['Ann', 'Bob']);
    expect(layout.items.map((i) => i.id)).toEqual([1, 4, 3, 2]);
    expect(layout.positions.get(3)).toEqual({ x: columnX(2), cx: 0, y: rowY(1) });
    expect(layout.positions.get(2)).toEqual({ x: columnX(0), cx: 0, y: rowY(2) });
    expect(layout.rowWidth).toBe(columnX(3) + 54);
    expect(layout.countWidth).toBe(0);
    expect(layout.headers).toEqual([]);
    expect(layout.rowCount).toBe(2);
  });

  it('splits into color bands', () => {
    const layout = computeLayout(dataset.items, { ...base, columnKey: 'S', counts: 'count' });
    const slot = countSlot(1);
    // band x: widest group has 2 + the 1.5-column gap → band y starts at column 3.5, after one count slot
    expect(layout.positions.get(3)).toEqual({ x: columnX(3.5), cx: slot, y: rowY(2) });
    expect(layout.counts.find((c) => c.key === 'x\u0000Ann')).toMatchObject({ text: '2', x: columnX(2), cx: 0 });
    expect(layout.countWidth).toBe(2 * slot);
  });

  it('adds a header row of values, with band totals when counts are on', () => {
    const layout = computeLayout(dataset.items, { ...base, columnKey: 'S', counts: 'count' });
    expect(layout.rowOffset).toBe(1);
    expect(layout.rowCount).toBe(3); // header, Ann, Bob
    expect(layout.headers.map((h) => [h.label, h.total, h.y])).toEqual([
      ['x', '2', rowY(1)],
      ['y', '2', rowY(1)],
    ]);
  });

  it('widens only the bands given extra label space, shifting later bands', () => {
    const plain = computeLayout(dataset.items, { ...base, columnKey: 'S', counts: 'count' });
    const widened = computeLayout(dataset.items, { ...base, columnKey: 'S', counts: 'count', bandPads: [30, 0] });
    expect(widened.headers.map((h) => [h.pad, h.cwidth - plain.headers[0].cwidth])).toEqual([
      [30, 30],
      [0, 0],
    ]);
    // The second band (and its boxes) moves right by exactly the first band's widening
    expect(widened.headers[1].cx - plain.headers[1].cx).toBe(30);
    expect(widened.positions.get(3)!.cx - plain.positions.get(3)!.cx).toBe(30);
    expect(widened.countWidth - plain.countWidth).toBe(30);
    expect(widened.padWidth).toBe(30);
  });

  it('shows header values without totals when split without counts', () => {
    const layout = computeLayout(dataset.items, { ...base, columnKey: 'S' });
    expect(layout.rowCount).toBe(3);
    expect(layout.headers.map((h) => h.total)).toEqual([null, null]);
    expect(layout.countWidth).toBe(0);
  });

  it('splits rows into columns by a third column, independent of the colors', () => {
    const items = buildDataset('t', [
      { P: 'Ann', D: 'Mon', S: 'x' },
      { P: 'Ann', D: 'Tue', S: 'y' },
      { P: 'Bob', D: 'Mon', S: 'y' },
    ]).items;
    const layout = computeLayout(items, { ...base, columnKey: 'D', counts: 'count' });
    expect(layout.bands.map((b) => b.label)).toEqual(['Mon', 'Tue']);
    expect(layout.legend.map((g) => g.label)).toEqual(['x', 'y']);
    expect(layout.headers.map((h) => [h.label, h.total])).toEqual([
      ['Mon', '2'],
      ['Tue', '1'],
    ]);
    // Bob's Monday box sits in the Mon band on Bob's row; Ann's Tuesday box in the Tue band (after Mon's 1 + the gap)
    expect(layout.positions.get(3)).toMatchObject({ x: columnX(0), y: rowY(3) });
    expect(layout.positions.get(2)).toMatchObject({ x: columnX(1 + GEOMETRY.bandGap), y: rowY(2) });
  });

  it('without rows, wraps each band into a grid as wide as the largest band allows', () => {
    const layout = computeLayout(dataset.items, { ...base, rowKey: null, columnKey: 'S' });
    expect(layout.groups).toEqual([]);
    expect(layout.bands.map((b) => b.label)).toEqual(['x', 'y']);
    // Two boxes per band, grid width ceil(√2) = 2: one row each, below the header row
    expect(layout.stripes).toBe(1);
    expect(layout.rowCount).toBe(2);
    expect(layout.positions.get(1)).toEqual({ x: columnX(0), cx: 0, y: rowY(2) });
    expect(layout.positions.get(4)).toEqual({ x: columnX(1), cx: 0, y: rowY(2) });
    expect(layout.positions.get(2)).toEqual({ x: columnX(2 + GEOMETRY.bandGap), cx: 0, y: rowY(2) });
    expect(layout.positions.get(3)).toEqual({ x: columnX(3 + GEOMETRY.bandGap), cx: 0, y: rowY(2) });
    expect(layout.counts).toEqual([]);
  });

  it('without rows, bigger bands wrap onto more rows and the sort buttons order the bands', () => {
    const items = buildDataset(
      't',
      ['a', 'a', 'a', 'a', 'a', 'b'].map((S, i) => ({ S, N: String(i) })),
    ).items;
    const layout = computeLayout(items, {
      ...base,
      rowKey: null,
      columnKey: 'S',
      counts: 'count',
      sortBy: 'count',
      sortDirection: 'ascending',
    });
    expect(layout.bands.map((b) => b.label)).toEqual(['b', 'a']);
    // Band a (5 boxes) wraps 3 wide onto 2 rows; band b is 1 wide
    expect(gridWidth(5)).toBe(3);
    expect(layout.stripes).toBe(2);
    expect(layout.positions.get(6)).toMatchObject({ x: columnX(0), y: rowY(2) });
    expect(layout.positions.get(1)).toMatchObject({ x: columnX(1 + GEOMETRY.bandGap), y: rowY(2) });
    expect(layout.positions.get(4)).toMatchObject({ x: columnX(1 + GEOMETRY.bandGap), y: rowY(3) });
    expect(layout.headers.map((h) => h.total)).toEqual(['1', '5']);
    expect(layout.countWidth).toBe(0);
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

  it('names files with malformed percent-encoding instead of throwing', () => {
    expect(resolveHostedUrl('https://example.com/files/caf%C3%A9.csv').name).toBe('café.csv');
    expect(resolveHostedUrl('https://example.com/files/a%zz.csv').name).toBe('a%zz.csv');
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
    expect(marked).toEqual([
      {
        kind: 'text',
        pieces: [
          { text: 'dog ', mark: false },
          { text: 'food', mark: true },
        ],
      },
    ]);
  });
});

describe('persistence', () => {
  it('keeps the fit mode in saved views', () => {
    const dataset = buildDataset('t.csv', [{ A: '1' }]);
    const view = {
      groupKey: 'A',
      colorKey: 'A',
      automatic: true,
      counts: false,
      split: false,
      zoom: 1,
      fit: 'stretch' as const,
      sortBy: 'value' as const,
      sortDirection: 'ascending' as const,
      viewerColumns: ['A'],
      searchTerm: '',
      searchScope: ['A'],
      legendCollapsed: false,
    };
    expect(deserialize(JSON.parse(scriptSafeJson(serialize(dataset, view)))).view?.fit).toBe('stretch');
  });

  it('round-trips a dataset', () => {
    const dataset = buildDataset('t.csv', [{ A: '1', B: '</script><b>' }]);
    const text = scriptSafeJson(serialize(dataset));
    expect(text).not.toContain('</script>');
    const restored = deserialize(JSON.parse(text)).dataset;
    expect(plain(restored.items[0].raw)).toEqual({ A: '1', B: '</script><b>' });
  });

  it('keeps file row numbers, and counts from 1 for files saved without them', () => {
    const dataset = buildDataset('t.csv', [{ A: 'x' }, { A: 'y' }], ['A'], [2, 7]);
    const saved = serialize(dataset);
    expect(saved.ids).toEqual([2, 7]);
    expect(deserialize(JSON.parse(JSON.stringify(saved))).dataset.items.map((i) => i.id)).toEqual([2, 7]);
    const { ids: _ids, ...legacy } = saved;
    expect(deserialize(legacy as typeof saved).dataset.items.map((i) => i.id)).toEqual([1, 2]);
  });
});

describe('box scaling', () => {
  const base = {
    fit: true,
    square: true,
    minWidth: 4,
    maxWidth: 40,
    minHeight: 4,
    maxHeight: 40,
    zoom: 1,
    viewWidth: 1000,
    viewHeight: 540,
    labelWidth: 100,
    rowWidth: 400,
    countWidth: 0,
    rows: 20,
  };

  it('uses the zoom, within the box limits, when not fitting', () => {
    expect(boxScale({ ...base, fit: false, zoom: 1.5 })).toEqual({ x: 1.5, y: 1.5 });
    expect(boxScale({ ...base, fit: false, zoom: 5 })).toEqual({ x: 2.222, y: 2.222 });
    expect(boxScale({ ...base, fit: false, zoom: 0.1 })).toEqual({ x: 0.222, y: 0.222 });
  });

  it('fits squares to the tighter direction', () => {
    // height: 540 / (20*26+20) = 1; width: 1000 / 500 = 2
    expect(boxScale(base)).toEqual({ x: 1, y: 1 });
  });

  it('stretches rectangles to use both directions', () => {
    // y = 1, x = (1000 - 100*1) / 400 = 2.25
    expect(boxScale({ ...base, square: false })).toEqual({ x: 2.222, y: 1 });
    expect(boxScale({ ...base, square: false, maxWidth: 60 })).toEqual({ x: 2.25, y: 1 });
  });

  it('keeps room for counts, which scale with text height, when stretching', () => {
    // x = (1000 - (100 + 200) * 1) / 400 = 1.75
    expect(boxScale({ ...base, square: false, countWidth: 200 })).toEqual({ x: 1.75, y: 1 });
  });

  it('shrinks the height when stretched boxes would get too narrow', () => {
    // Height alone allows y = 1, but then x = (1000 - 900) / 400 = 0.25 (4.5px) — below the 0.5 (9px) minimum.
    // So x = 0.5 and y = (1000 - 400 * 0.5) / 900 = 0.889
    expect(boxScale({ ...base, square: false, minWidth: 9, labelWidth: 100, countWidth: 800 })).toEqual({ x: 0.5, y: 0.889 });
  });

  it('never goes below the smallest box size', () => {
    expect(boxScale({ ...base, rows: 2000 })).toEqual({ x: 0.222, y: 0.222 });
  });

  it('turns box limits into a zoom range that respects both width and height', () => {
    expect(zoomBounds({ minWidth: 9, maxWidth: 36, minHeight: 9, maxHeight: 36 })).toEqual({ min: 0.5, max: 2 });
    // Square boxes: the larger minimum and the smaller maximum win
    expect(zoomBounds({ minWidth: 4, maxWidth: 36, minHeight: 9, maxHeight: 54 })).toEqual({ min: 0.5, max: 2 });
    const odd = zoomBounds({ minWidth: 30, maxWidth: 40, minHeight: 4, maxHeight: 10 });
    expect(odd.max).toBeGreaterThanOrEqual(odd.min);
  });

  it('applies width and height limits separately when stretching', () => {
    // Height limited to 9px (0.5) even though rows could be taller; width capped at 27px (1.5)
    expect(boxScale({ ...base, square: false, maxHeight: 9, maxWidth: 27 })).toEqual({ x: 1.5, y: 0.5 });
    // A larger minimum height keeps rows readable; width still fills what is left
    expect(boxScale({ ...base, square: false, rows: 2000, minHeight: 9 })).toEqual({ x: 2.222, y: 0.5 });
  });
});

describe('custom value order', () => {
  const rows = [
    { S: 'Satisfied' },
    { S: 'Extremely satisfied' },
    { S: 'Not satisfied' },
    { S: 'Not at all satisfied' },
    { S: 'Satisfied' },
  ];
  const dataset = buildDataset('s.csv', rows);
  const base = { rowKey: 'S', columnKey: null, colorKey: 'S', counts: 'none', sortBy: 'value', sortDirection: 'ascending' } as const;
  const scale = ['Not at all satisfied', 'Not satisfied', 'Satisfied', 'Extremely satisfied'];

  it('orders the legend (and so its colors) by a dragged order', () => {
    expect(computeLayout(dataset.items, base).legend.map((g) => g.label)).toEqual([
      'Extremely satisfied',
      'Not at all satisfied',
      'Not satisfied',
      'Satisfied',
    ]);
    expect(computeLayout(dataset.items, { ...base, legendOrder: scale }).legend.map((g) => g.label)).toEqual(scale);
  });

  it('puts values the order does not mention after it, in their natural order', () => {
    const layout = computeLayout(dataset.items, { ...base, legendOrder: ['Satisfied'] });
    expect(layout.legend.map((g) => g.label)).toEqual(['Satisfied', 'Extremely satisfied', 'Not at all satisfied', 'Not satisfied']);
  });

  it('sorts rows by the custom order only in the custom sort; A–Z, Z–A and count ignore it', () => {
    const rows = (options: Partial<Parameters<typeof computeLayout>[1]>) =>
      computeLayout(dataset.items, { ...base, ...options }).groups.map((g) => g.label);
    expect(rows({ rowOrder: scale, sortBy: 'custom' })).toEqual(scale);
    expect(rows({ rowOrder: scale })).toEqual([...scale].sort());
    expect(rows({ rowOrder: scale, sortDirection: 'descending' })).toEqual([...scale].sort().reverse());
    expect(computeLayout(dataset.items, { ...base, rowOrder: scale, sortBy: 'count', sortDirection: 'descending' }).groups[0].label).toBe(
      'Satisfied',
    );
  });
});

describe('percentages', () => {
  it('formats shares as whole percents', () => {
    expect([percent(1, 3), percent(1, 300), percent(0, 5), percent(4, 4)]).toEqual(['33%', '<1%', '0%', '100%']);
  });

  it('shows each cell as a share of its row or its column', () => {
    const items = buildDataset('t.csv', [
      { P: 'a', S: 'x' },
      { P: 'a', S: 'y' },
      { P: 'a', S: 'y' },
      { P: 'b', S: 'x' },
    ]).items;
    const base = { rowKey: 'P', columnKey: 'S', colorKey: 'S', sortBy: 'value', sortDirection: 'ascending' } as const;
    const text = (counts: 'row' | 'column' | 'count') =>
      Object.fromEntries(computeLayout(items, { ...base, counts }).counts.map((c) => [c.key.replace('\u0000', '/'), c.text]));
    expect(text('row')).toEqual({ 'x/a': '33%', 'y/a': '67%', 'x/b': '100%' });
    expect(text('column')).toEqual({ 'x/a': '50%', 'y/a': '100%', 'x/b': '50%' });
    expect(text('count')).toEqual({ 'x/a': '1', 'y/a': '2', 'x/b': '1' });
    // Column totals stay counts: the base of each column percentage
    expect(computeLayout(items, { ...base, counts: 'column' }).headers.map((h) => h.total)).toEqual(['2', '2']);
    // Without columns, column % falls back to counts and row % is the share of all data items
    expect(computeLayout(items, { ...base, columnKey: null, counts: 'column' }).counts.map((c) => c.text)).toEqual(['3', '1']);
    expect(computeLayout(items, { ...base, columnKey: null, counts: 'row' }).counts.map((c) => c.text)).toEqual(['75%', '25%']);
  });
});
