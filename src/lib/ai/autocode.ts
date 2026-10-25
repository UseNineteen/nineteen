import type { DataItem } from '../data';
import { renderRows } from './context';

/**
 * AI auto-coding: the model assigns each row one category from a scheme
 * (written by the researcher or suggested by the model). The result becomes
 * a new column, which Nineteen can group and color by like any other.
 */

export interface Category {
  name: string;
  description: string;
}

export interface Coding {
  row: number;
  category: string;
  reason: string;
}

export const UNCODED = 'Other / unclear';

export const CODING_SYSTEM =
  'You are a careful qualitative research assistant coding data for a researcher. ' +
  'Apply the coding scheme exactly as defined. Judge each row only on its own content. ' +
  `When no category fits, or the row is too vague to code, use "${UNCODED}".`;

export const categoriesSchema = {
  type: 'object',
  properties: {
    categories: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Short category name (1-4 words)' },
          description: { type: 'string', description: 'One-sentence definition of the category' },
        },
        required: ['name', 'description'],
        additionalProperties: false,
      },
    },
  },
  required: ['categories'],
  additionalProperties: false,
} as const;

export function codingSchema(categories: string[]) {
  return {
    type: 'object',
    properties: {
      results: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            row: { type: 'integer', description: 'The row number from the data' },
            category: { type: 'string', enum: [...categories, UNCODED] },
            reason: { type: 'string', description: 'One short sentence explaining the choice' },
          },
          required: ['row', 'category', 'reason'],
          additionalProperties: false,
        },
      },
    },
    required: ['results'],
    additionalProperties: false,
  };
}

export function suggestPrompt(goal: string): string {
  return (
    'Read the data and propose a coding scheme of 4 to 10 mutually exclusive categories that together cover most rows.' +
    (goal.trim() ? ` The researcher wants to code the data for: ${goal.trim()}.` : '') +
    ' Give each category a short name and a one-sentence definition.'
  );
}

export function codingPrompt(categories: Category[], goal: string, rows: string): string {
  const scheme = categories.map((c) => `- ${c.name}${c.description ? `: ${c.description}` : ''}`).join('\n');
  return (
    (goal.trim() ? `Coding goal: ${goal.trim()}\n\n` : '') +
    `Coding scheme:\n${scheme}\n- ${UNCODED}: none of the above fits, or the row is too vague\n\n` +
    `Assign exactly one category to every row below and return one result per row, using its row number.\n\n<data>\n${rows}\n</data>`
  );
}

/** Parses "Name: definition" lines (or bare names) typed by the researcher. */
export function parseCategories(text: string): Category[] {
  const seen = new Set<string>();
  const categories: Category[] = [];
  for (const line of text.split('\n')) {
    const cleaned = line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim();
    if (!cleaned) continue;
    const split = cleaned.search(/\s[-–—]\s|:\s/);
    const name = (split === -1 ? cleaned : cleaned.slice(0, split)).trim();
    const description =
      split === -1
        ? ''
        : cleaned
            .slice(split)
            .replace(/^\s*[-–—:]\s*/, '')
            .trim();
    if (!name || name === UNCODED || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    categories.push({ name, description });
  }
  return categories;
}

export function formatCategories(categories: Category[]): string {
  return categories.map((c) => (c.description ? `${c.name}: ${c.description}` : c.name)).join('\n');
}

/** Splits rows into requests that keep each response comfortably small. */
export function batches(items: DataItem[], columns: string[], maxRows = 40, maxChars = 40_000): string[][] {
  const result: string[][] = [];
  let current: string[] = [];
  let size = 0;
  for (const item of items) {
    const text = renderRows([item], columns);
    if (current.length && (current.length >= maxRows || size + text.length > maxChars)) {
      result.push(current);
      current = [];
      size = 0;
    }
    current.push(text);
    size += text.length;
  }
  if (current.length) result.push(current);
  return result;
}

/** Keeps only valid codes for rows that were actually sent. */
export function acceptCodings(results: Coding[], sent: Set<number>, categories: string[]): Coding[] {
  const allowed = new Set([...categories, UNCODED]);
  const seen = new Set<number>();
  return results.filter((r) => {
    if (!sent.has(r.row) || seen.has(r.row) || !allowed.has(r.category)) return false;
    seen.add(r.row);
    return true;
  });
}
