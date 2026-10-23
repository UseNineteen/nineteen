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
