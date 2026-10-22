import type { DataItem } from './data';

// Common English stop words, excluded from the high-frequency word list.
const STOPWORDS = new Set(
  `a about above after again against all am an and any are aren't as at be because been before being below
  between both but by can can't cannot could couldn't did didn't do does doesn't doing don't down during each
  few for from further had hadn't has hasn't have haven't having he he'd he'll he's her here here's hers herself
  him himself his how how's i i'd i'll i'm i've if in into is isn't it it's its itself let's me more most mustn't
  my myself no nor not of off on once only or other ought our ours ourselves out over own same shan't she she'd
  she'll she's should shouldn't so some such than that that's the their theirs them themselves then there there's
  these they they'd they'll they're they've this those through to too under until up very was wasn't we we'd
  we'll we're we've were weren't what what's when when's where where's which while who who's whom why why's with
  won't would wouldn't you you'd you'll you're you've your yours yourself yourselves also just will get got one
  really like would much many us im ive dont didnt doesnt cant wont isnt wasnt thats theres`
    .split(/\s+/)
    .filter(Boolean),
);

export interface TermCount {
  term: string;
  frequency: number;
}

/** The most frequent wholly-alphanumeric words across the given columns. */
export function topTerms(items: DataItem[], scope: string[], limit = 10): TermCount[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    for (const column of scope) {
      const text = item.raw[column];
      if (!text) continue;
      for (const word of text.toLowerCase().split(/[^a-z0-9']+/)) {
        const term = word.replace(/^'+|'+$/g, '');
        if (term.length < 2 || STOPWORDS.has(term) || !/^[a-z0-9]+$/.test(term)) continue;
        counts.set(term, (counts.get(term) ?? 0) + 1);
      }
    }
  }
  return [...counts]
    .map(([term, frequency]) => ({ term, frequency }))
    .sort((a, b) => b.frequency - a.frequency || a.term.localeCompare(b.term))
    .slice(0, limit);
}
