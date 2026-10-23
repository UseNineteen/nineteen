/**
 * Word wrapping for split-view value labels, measured (not rendered), so the
 * viewer can decide how tall the label row must be before drawing it.
 */

export interface Wrapped {
  lines: string[];
  /** Every word made it into the lines */
  complete: boolean;
  /** Some single word is wider than the line, so it would be cut mid-word */
  brokenWord: boolean;
  /** Share of the text's characters that fit within the line limit */
  shown: number;
}

export function wrapText(text: string, width: number, measure: (s: string) => number, maxLines: number): Wrapped {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let brokenWord = false;
  let current = '';
  for (const word of words) {
    if (measure(word) > width) brokenWord = true;
    const candidate = current ? `${current} ${word}` : word;
    if (current && measure(candidate) > width) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);

  const kept = lines.slice(0, maxLines);
  const total = words.join(' ').length;
  const shownChars = kept.join(' ').length;
  return {
    lines: kept,
    complete: lines.length <= maxLines,
    brokenWord,
    shown: total ? Math.min(1, shownChars / total) : 1,
  };
}

/**
 * The narrowest line width at which `text` wraps into at most `maxLines`
 * lines without cutting a word (found by bisection between its longest word
 * and its full width).
 */
export function minWrapWidth(text: string, measure: (s: string) => number, maxLines: number): number {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return 0;
  let lo = Math.max(...words.map(measure));
  let hi = Math.max(lo, measure(words.join(' ')));
  const fits = (w: number) => {
    const wrapped = wrapText(text, w, measure, maxLines);
    return wrapped.complete && !wrapped.brokenWord;
  };
  if (fits(lo)) return lo;
  for (let i = 0; i < 20 && hi - lo > 0.5; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}
