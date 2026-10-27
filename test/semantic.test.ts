import { describe, expect, it } from 'vitest';
import { buildDataset } from '../src/lib/data';
import { closestByPassage, distinctTexts, dot, meanVector, passagesOf, sentences, topScores } from '../src/lib/semantic/passages';
import { cachedDownloads, downloadSize, isModelId, MODELS, modelFileUrl } from '../src/lib/semantic/models';
import { mergeRanges } from '../src/lib/search';

describe('sentences', () => {
  it('splits on sentence ends and keeps abbreviations together', () => {
    expect(sentences('I went to the store because we needed milk. The prices were much higher than I expected them to be!')).toEqual([
      'I went to the store because we needed milk.',
      'The prices were much higher than I expected them to be!',
    ]);
    expect(sentences('We compared brands, e.g. the store brand, before deciding on the one we always buy anyway.')).toHaveLength(1);
  });

  it('joins short sentences onto a neighbour', () => {
    const [first, second] = sentences(
      'Great. The staff were friendly and helped me find the right size quickly. I left happy with the purchase I made today.',
    );
    expect(first).toBe('Great. The staff were friendly and helped me find the right size quickly.');
    expect(second).toBe('I left happy with the purchase I made today.');
    expect(sentences('Not bad. Ok.')).toEqual(['Not bad. Ok.']);
  });

  it('splits paragraphs and quoted sentence ends, and copes with other scripts', () => {
    expect(
      sentences('First paragraph is long enough to stand on its own here.\nSecond paragraph is also long enough to stand alone.'),
    ).toHaveLength(2);
    expect(
      sentences('She said "we are done here, finally, after all this time." Then the whole group left the store together.'),
    ).toHaveLength(2);
    expect(
      sentences(
        'この文章は十分に長いので、それ自体で一つの文として扱われるべきものだと考えています。二つ目の文も同じくらい長く、分割されたあとも単独で残るだけの長さを持っています。',
      ),
    ).toHaveLength(2);
    expect(sentences('   ')).toEqual([]);
  });
});

describe('passages', () => {
  const dataset = buildDataset('t.csv', [
    {
      Note: 'The price was far too high for what it actually was. I walked away without buying anything at all that day.',
      Store: 'Target',
      Date: '10/3/2026',
      Count: '3',
    },
    { Note: '', Store: 'Target', Date: '10/4/2026', Count: '' },
  ]);

  it('leaves out blanks, numbers and dates, and keeps the item and field', () => {
    const passages = passagesOf(dataset.items, dataset.columns);
    expect(passages.map((p) => [p.itemId, p.column, p.text])).toEqual([
      [1, 'Note', 'The price was far too high for what it actually was.'],
      [1, 'Note', 'I walked away without buying anything at all that day.'],
      [1, 'Store', 'Target'],
      [2, 'Store', 'Target'],
    ]);
    expect(distinctTexts(passages)).toHaveLength(3);
    expect(passagesOf(dataset.items, ['Date', 'Count'])).toEqual([]);
  });

  it('scores each item by its closest passage and ranks the closest items', () => {
    const vectors = new Map<string, Float32Array>([
      ['a', new Float32Array([1, 0])],
      ['b', new Float32Array([0, 1])],
      ['c', new Float32Array([0.6, 0.8])],
    ]);
    const passages = [
      { text: 'a', itemId: 1, column: 'N' },
      { text: 'b', itemId: 1, column: 'N' },
      { text: 'c', itemId: 2, column: 'N' },
      { text: 'missing', itemId: 3, column: 'N' },
    ];
    const closest = closestByPassage(passages, new Float32Array([0, 1]), (t) => vectors.get(t), { closest: 5 });
    expect(closest.map((s) => [s.itemId, s.passage])).toEqual([
      [1, 'b'],
      [2, 'c'],
    ]);
    expect(closest[0].score).toBeCloseTo(1);
    expect(closestByPassage(passages, new Float32Array([0, 1]), (t) => vectors.get(t), { closest: 1 })).toHaveLength(1);
    expect(topScores([], { closest: 3 })).toEqual([]);
  });

  it('can cut the list at a similarity score instead', () => {
    const scored = [
      { itemId: 1, score: 0.9, passage: 'a', column: 'N' },
      { itemId: 2, score: 0.65, passage: 'b', column: 'N' },
      { itemId: 3, score: 0.4, passage: 'c', column: 'N' },
    ];
    expect(topScores([...scored], { minScore: 0.65 }).map((s) => s.itemId)).toEqual([1, 2]);
    expect(topScores([...scored], { minScore: 0.95 })).toEqual([]);
    expect(topScores([...scored], { minScore: 0 })).toHaveLength(3);
  });

  it('averages unit vectors into a unit vector', () => {
    const mean = meanVector([new Float32Array([1, 0]), new Float32Array([0, 1])], 2);
    expect(dot(mean, mean)).toBeCloseTo(1);
    expect(mean[0]).toBeCloseTo(mean[1]);
  });
});

describe('models', () => {
  it('knows its models, their files and download sizes', () => {
    expect(isModelId('bge-small')).toBe(true);
    expect(isModelId('gpt')).toBe(false);
    expect(modelFileUrl(MODELS['bge-small'], 'fp16')).toBe(
      'https://huggingface.co/Xenova/bge-small-en-v1.5/resolve/main/onnx/model_fp16.onnx',
    );
    expect(modelFileUrl(MODELS['e5-multilingual'], 'q8')).toBe(
      'https://huggingface.co/Xenova/multilingual-e5-small/resolve/main/onnx/model_quantized.onnx',
    );
    expect(downloadSize(MODELS['bge-small'], 'fp16')).toBe(68);
  });

  it('lists nothing where there is no cache storage', async () => {
    expect(await cachedDownloads()).toEqual([]);
  });
});

describe('highlight ranges', () => {
  it('merges touching and overlapping ranges', () => {
    expect(
      mergeRanges([
        [5, 8],
        [0, 2],
        [2, 4],
        [6, 10],
      ]),
    ).toEqual([
      [0, 4],
      [5, 10],
    ]);
  });
});
