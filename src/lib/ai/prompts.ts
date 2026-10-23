import type { ViewContext } from './context';

/**
 * Ready-made analysis prompts. Every prompt asks the model to cite rows as
 * [Row N] so answers can be traced back to the data (and, inside Nineteen,
 * highlighted in the visualization).
 */

export interface Template {
  id: string;
  label: string;
  /** Short description shown under the picker */
  hint: string;
  build: (view: ViewContext) => string;
}

export const CITATION_RULE =
  'Ground every claim in the data. Cite the rows you rely on in square brackets, like [Row 12] or [Row 12, Row 40]. ' +
  'Quote participants verbatim when you quote them. If the data does not support an answer, say so.';

export const SYSTEM_PROMPT =
  'You are helping a qualitative researcher make sense of their data (for example interview notes, diary entries or ' +
  'survey responses) in a tool called Nineteen. Each record in the data is a row from their spreadsheet, numbered ' +
  'with the row number the researcher sees in Nineteen. Be specific, concise, and faithful to the data; do not invent ' +
  `details. ${CITATION_RULE}`;

export const TEMPLATES: Template[] = [
  {
    id: 'themes',
    label: 'Summarize key themes',
    hint: 'The main themes, how common they are, and quotes for each',
    build: (v) =>
      `Identify the main themes in this data. For each theme give a short name, a one-sentence description, roughly how many rows express it, ` +
      `which "${v.groupKey}" values it appears in, and one or two representative quotes. Finish with any notable outliers or tensions.`,
  },
  {
    id: 'compare',
    label: 'Compare groups',
    hint: 'How the current groups differ from each other',
    build: (v) =>
      `Compare the rows across the different values of "${v.groupKey}". What is distinctive about each group? ` +
      `What do the groups have in common? Where relevant, relate differences to "${v.colorKey}". Support each point with quotes.`,
  },
  {
    id: 'quotes',
    label: 'Find representative quotes',
    hint: 'The most telling quotes for each group',
    build: (v) =>
      `For each value of "${v.groupKey}", choose two or three quotes that best represent what those rows say, ` +
      `and explain in one line why each quote is representative.`,
  },
  {
    id: 'coding',
    label: 'Suggest a coding scheme',
    hint: 'Categories you could use to code this data',
    build: () =>
      'Propose a coding scheme for this data: 5 to 10 mutually exclusive categories, each with a name, a definition, ' +
      'an example quote, and an estimate of how many rows fall into it. Note any rows that would be hard to code.',
  },
  {
    id: 'summary',
    label: 'Executive summary',
    hint: 'A short summary for stakeholders',
    build: () =>
      'Write a short executive summary of this data for stakeholders who have not seen it: the five most important ' +
      'findings as bullet points (each with supporting quotes), followed by open questions worth investigating further.',
  },
  {
    id: 'custom',
    label: 'Your own question',
    hint: 'Ask anything about the data',
    build: () => '',
  },
];

/** The full prompt for pasting into any AI assistant. */
export function clipboardPrompt(instructions: string, data: string): string {
  return `${SYSTEM_PROMPT}\n\n## Task\n${instructions.trim()}\n\n## Data\n${data}`;
}
