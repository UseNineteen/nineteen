import type { DataItem } from '../data';

/**
 * What "Find by meaning" compares: each data item is split into passages (its sentences, with
 * very short ones joined onto a neighbour), and an item matches by its closest passage. Comparing
 * sentences rather than whole entries finds the specific thought ("worried about the price")
 * inside a long entry about something else, and gives the viewer a sentence to point at.
 */

/** Passages shorter than this are joined onto the one before (or the next one) */
const MIN_LENGTH = 40;

/**
 * A sentence end: . ! ? an optional closing quote or bracket, then white space, then something
 * that isn't a lower-case letter (so "e.g. this" stays together); or a full-width . ! ? which
 * needs no space after it
 */
const SENTENCE_END = /(?<=[.!?…]["”’)]?)\s+(?=["“‘(]*[^\p{Ll}\s])|(?<=[。！？])\s*/u;

/** Splits a text into passages: its sentences, with short ones joined onto their neighbour. */
export function sentences(text: string): string[] {
  const parts = text
    .split(/\n+/)
    .flatMap((paragraph) => paragraph.split(SENTENCE_END))
    .map((part) => part.trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const part of parts) {
    const last = out.length - 1;
    if (last >= 0 && (part.length < MIN_LENGTH || out[last].length < MIN_LENGTH)) out[last] += ' ' + part;
    else out.push(part);
  }
  return out.length ? out : [text.trim()].filter(Boolean);
}

export interface Passage {
  text: string;
  itemId: number;
  column: string;
}

/**
 * The passages of every item's text in the given fields. Blank cells and cells that read as a
 * number or date are left out: a date or a count has no meaning to search for. The same text
 * is embedded once however often it appears (a field of categories has a handful of values).
 */
export function passagesOf(items: DataItem[], columns: string[]): Passage[] {
  const passages: Passage[] = [];
  for (const item of items) {
    for (const column of columns) {
      const text = item.raw[column];
      if (!text || typeof item.parsed[column] === 'number') continue;
      for (const sentence of sentences(text)) passages.push({ text: sentence, itemId: item.id, column });
    }
  }
  return passages;
}

/** The distinct texts among passages, in first-seen order */
export function distinctTexts(passages: Passage[]): string[] {
  return [...new Set(passages.map((p) => p.text))];
}

export function dot(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

/** The normalized mean of unit vectors: one vector for a whole data item */
export function meanVector(vectors: Float32Array[], dims: number): Float32Array {
  const mean = new Float32Array(dims);
  for (const v of vectors) for (let i = 0; i < dims; i++) mean[i] += v[i];
  const length = Math.sqrt(dot(mean, mean)) || 1;
  for (let i = 0; i < dims; i++) mean[i] /= length;
  return mean;
}

export interface Scored {
  itemId: number;
  score: number;
  passage: string;
  column: string;
}

/**
 * Scores each item by its closest passage to the query vector, and returns the `limit` closest
 * items, best first. `vectorOf` gives a passage text's vector (passages without one are skipped).
 */
export function closestByPassage(
  passages: Passage[],
  query: Float32Array,
  vectorOf: (text: string) => Float32Array | undefined,
  limit: number,
): Scored[] {
  const best = new Map<number, Scored>();
  // Identical texts score the same; compute each once
  const scores = new Map<string, number>();
  for (const passage of passages) {
    let score = scores.get(passage.text);
    if (score === undefined) {
      const vector = vectorOf(passage.text);
      if (!vector) continue;
      score = dot(query, vector);
      scores.set(passage.text, score);
    }
    const current = best.get(passage.itemId);
    if (!current || current.score < score)
      best.set(passage.itemId, { itemId: passage.itemId, score, passage: passage.text, column: passage.column });
  }
  return topScores([...best.values()], limit);
}

export function topScores(scored: Scored[], limit: number): Scored[] {
  return scored.sort((a, b) => b.score - a.score || a.itemId - b.itemId).slice(0, Math.max(0, limit));
}
