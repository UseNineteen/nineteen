import { describe, expect, it } from 'vitest';
import { buildDataset } from '../src/lib/data';
import { estimateTokens, renderData, renderRows, selectItems, withColumns } from '../src/lib/ai/context';
import { citedRows, parseAnswer } from '../src/lib/ai/answer';
import { acceptCodings, batches, codingSchema, parseCategories, UNCODED } from '../src/lib/ai/autocode';
import { clipboardPrompt, TEMPLATES } from '../src/lib/ai/prompts';
import { preferredOpenAIModel } from '../src/lib/ai/providers';

const dataset = buildDataset('diary.xlsx', [
  { Name: 'Ada', Segment: 'Moms', Note: 'Bought shoes\nonline' },
  { Name: 'Bo', Segment: 'Kids', Note: '' },
  { Name: 'Cy', Segment: 'Moms', Note: 'Skipped it' },
]);
const view = { fileName: 'diary.xlsx', groupKey: 'Name', colorKey: 'Segment', searchTerm: 'shoes' };

describe('data packaging', () => {
  it('renders rows with their row numbers and skips blanks', () => {
    expect(renderRows(dataset.items.slice(0, 2), ['Name', 'Note'])).toBe(
      '### Row 1\nName: Ada\nNote: Bought shoes / online\n\n### Row 2\nName: Bo',
    );
  });

  it('limits rows to search matches', () => {
    expect(selectItems(dataset, 'matches', new Set([3])).map((i) => i.id)).toEqual([3]);
    expect(selectItems(dataset, 'matches', null).length).toBe(3);
  });

  it('describes the view and wraps the data', () => {
    const text = renderData(dataset.items, ['Name'], view, 'matches');
    expect(text).toContain('matching the search "shoes"');
    expect(text).toContain('grouping rows by "Name"');
    expect(text).toMatch(/<data>[\s\S]*Row 3[\s\S]*<\/data>$/);
    expect(estimateTokens('12345678')).toBe(2);
  });

  it('builds clipboard prompts for every template', () => {
    for (const t of TEMPLATES) {
      const prompt = clipboardPrompt(t.build(view), 'DATA');
      expect(prompt).toContain('[Row 12]');
      expect(prompt.endsWith('DATA')).toBe(true);
    }
  });

  it('adds AI columns without disturbing existing data', () => {
    const next = withColumns(dataset, { Theme: new Map([[1, 'Shopping'], [3, 'Skipping']]) });
    expect(next.columns).toEqual(['Name', 'Segment', 'Note', 'Theme']);
    expect(next.items.map((i) => [i.id, i.raw.Theme])).toEqual([[1, 'Shopping'], [2, ''], [3, 'Skipping']]);
    const again = withColumns(next, { Theme: new Map([[2, 'X']]) });
    expect(again.columns).toEqual(['Name', 'Segment', 'Note', 'Theme']);
    expect(again.items[1].raw.Theme).toBe('X');
  });
});

describe('answers', () => {
  it('finds cited rows in several formats', () => {
    expect(citedRows('See [Row 12] and [Rows 3, 7] or [Row 40, Row 41] and [Rows 5-7].')).toEqual([3, 5, 6, 7, 12, 40, 41]);
    expect(citedRows('no citations [here]')).toEqual([]);
  });

  it('parses light markdown into blocks with citations', () => {
    const blocks = parseAnswer('## Themes\n\n**Price** matters [Row 2].\n\n- one [Row 1]\n- *two*\n\n1. first\n2. second');
    expect(blocks.map((b) => b.kind)).toEqual(['heading', 'paragraph', 'list', 'list']);
    const para = blocks[1];
    expect(para.kind === 'paragraph' && para.parts).toEqual([
      { kind: 'text', text: 'Price', bold: true },
      { kind: 'text', text: ' matters ' },
      { kind: 'cite', rows: [2], label: 'Row 2' },
      { kind: 'text', text: '.' },
    ]);
    const ordered = blocks[3];
    expect(ordered.kind === 'list' && ordered.ordered).toBe(true);
  });
});

describe('auto-coding', () => {
  it('parses typed categories', () => {
    expect(parseCategories('- Price: cost matters\nQuality - lasts long\n\nprice\nConvenience')).toEqual([
      { name: 'Price', description: 'cost matters' },
      { name: 'Quality', description: 'lasts long' },
      { name: 'Convenience', description: '' },
    ]);
  });

  it('batches rows by count', () => {
    expect(batches(dataset.items, ['Name'], 2).map((b) => b.length)).toEqual([2, 1]);
  });

  it('builds a strict schema that includes the fallback category', () => {
    const schema = codingSchema(['A', 'B']);
    expect(schema.properties.results.items.properties.category.enum).toEqual(['A', 'B', UNCODED]);
    expect(schema.additionalProperties).toBe(false);
  });

  it('accepts only valid, sent, de-duplicated codes', () => {
    const results = [
      { row: 1, category: 'A', reason: '' },
      { row: 1, category: 'B', reason: '' },
      { row: 2, category: 'Z', reason: '' },
      { row: 9, category: 'A', reason: '' },
      { row: 3, category: UNCODED, reason: '' },
    ];
    expect(acceptCodings(results, new Set([1, 2, 3]), ['A', 'B']).map((r) => r.row)).toEqual([1, 3]);
  });
});

describe('providers', () => {
  it('prefers the newest general GPT model', () => {
    expect(preferredOpenAIModel(['gpt-4o', 'gpt-4.1', 'gpt-5', 'gpt-5-mini', 'o3'])).toBe('gpt-5');
    expect(preferredOpenAIModel(['o3'])).toBe('o3');
  });
});

describe('data export', () => {
  it('round-trips through .xlsx and .csv, keeping added columns', async () => {
    const { parseBytes } = await import('../src/lib/parse');
    const { toCsv, toXlsx, tableOf, sheetName } = await import('../src/lib/export-data');
    const coded = withColumns(dataset, { 'AI theme': new Map([[1, 'Shopping'], [3, 'Skipping']]) });
    for (const bytes of [toXlsx(coded), new TextEncoder().encode(toCsv(coded))]) {
      const back = parseBytes('x', bytes);
      expect(back.columns).toEqual(['Name', 'Segment', 'Note', 'AI theme']);
      expect(back.items.map((i) => [i.raw.Name, i.raw.Note, i.raw['AI theme']])).toEqual([
        ['Ada', 'Bought shoes\nonline', 'Shopping'],
        ['Bo', '', ''],
        ['Cy', 'Skipped it', 'Skipping'],
      ]);
    }
    // Plain numbers are written as numbers; zip codes and other leading-zero values stay text
    const numbers = buildDataset('n.csv', [{ A: '42', B: '007', C: '3.5', D: '1,000' }]);
    expect(tableOf(numbers)[1]).toEqual([42, '007', 3.5, '1,000']);
    expect(sheetName('Q3 [draft]: notes?.xlsx')).toBe('Q3  draft   notes');
  });
});
