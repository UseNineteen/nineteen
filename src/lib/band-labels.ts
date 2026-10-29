import { type BandHeader } from './layout';
import { minWrapWidth, wrapText } from './wrap';

/**
 * Split view: how the value labels above the bands are laid out. On one line when every label
 * fits its band; otherwise wrapped onto a few lines; and when many bands are too narrow even
 * for that, turned 90°. When only a few bands are too narrow to wrap, those get extra width
 * instead (`pads`). Decided from measured text, so the viewer can size the label row before
 * drawing it; the snapshot draws the same decision.
 */

export type LabelMode = 'line' | 'wrap' | 'turn';

export interface BandLabels {
  mode: LabelMode;
  /** Lines per label (1 unless wrapped) */
  lines: number;
  /** Extra height of the label row beyond a normal row, at scale 1 */
  extra: number;
  /** Turned: the length of the label box, at scale 1 */
  length: number;
  /** Extra label width per band (by legend position), at scale 1; empty when none is widened */
  pads: number[];
}

/** Text width at scale 1 for the label font at the given weight (labels are 500, totals 400) */
export type MeasureLabel = (text: string, weight: 400 | 500) => number;

export const LABEL_FONT = 'Colfax, sans-serif';
/** Wrap onto at most this many lines before turning */
export const MAX_LINES = 3;
/** Line height of wrapped labels (scale-1 px) */
export const LINE_HEIGHT = 16;
/** Turn when even wrapped, any label would show less than this share of its text */
const TURN_BELOW = 0.6;
/** Longest turned label (scale-1 px, about 20 characters) before it is trimmed */
export const TURNED_MAX = 140;
/**
 * Sizes shared with the stylesheet (scale-1 px): the viewer sets them as CSS custom properties
 * (--band-*), so the rules that draw the labels and the code that measures them agree.
 */
export const BAND = {
  /** Space between the swatch, the text and the total (.band-label gap) */
  gap: 5,
  /** The color swatch before the text (.band-swatch) */
  swatch: 11,
  /** Extra space before the total (.band-total margin) */
  totalMargin: 4,
  /** Line height of wrapped labels (.band-text) */
  lineHeight: LINE_HEIGHT,
} as const;
/** The swatch with its gap: where the text starts */
export const SWATCH = BAND.swatch + BAND.gap;
/** The total sits after the gap plus its margin */
export const TOTAL_GAP = BAND.gap + BAND.totalMargin;
/** Height of a normal row's label area, which the label row grows beyond */
export const HEADER_ROW = 20;
/** Band labels follow the row font size, but stop growing here (px) so big boxes don't come with huge headers */
export const HEADER_FONT_MAX = 18;
/** Widen at most this share of the bands; with more narrow bands than that, turn the labels instead */
const WIDEN_AT_MOST = 1 / 3;

export const ONE_LINE: BandLabels = { mode: 'line', lines: 1, extra: 0, length: 0, pads: [] };

/**
 * Decided in label-text units at the on-screen box aspect (box width over height, 1 unless
 * stretched), from band widths without any widening.
 */
export function decideBandLabels(
  headers: BandHeader[],
  labelOf: (header: BandHeader) => string,
  boxAspect: number,
  measure: MeasureLabel,
  /** Labels start with a color swatch (when the bands are the color column's values) */
  swatch = true,
): BandLabels {
  if (!headers.length) return ONE_LINE;
  const measureLabel = (text: string) => measure(text, 500);
  const swatchWidth = swatch ? SWATCH : 0;
  let longest = 0;
  const bands = headers.map((header) => {
    const text = labelOf(header);
    const total = header.total ? measure(header.total, 400) + TOTAL_GAP : 0;
    longest = Math.max(longest, swatchWidth + measureLabel(text) + total);
    // The total is the label's last word, so it wraps with the text and sits at the end of its last line
    const label = header.total ? `${text} ${header.total}` : text;
    const room = header.width * boxAspect + (header.cwidth - header.pad) - swatchWidth - (header.total ? BAND.totalMargin : 0) - 4;
    const wrapped = wrapText(label, room, measureLabel, MAX_LINES);
    const tooNarrow = room <= 0 || wrapped.brokenWord || (!wrapped.complete && wrapped.shown < TURN_BELOW);
    // Extra width that would let it wrap in full (+2px for rounding)
    const deficit = tooNarrow ? Math.ceil(minWrapWidth(label, measureLabel, MAX_LINES) - room + 2) : 0;
    return { text: label, room, deficit, lines: wrapped.lines.length };
  });

  const narrow = bands.filter((b) => b.deficit > 0).length;
  if (narrow > 0 && narrow > Math.max(1, Math.floor(bands.length * WIDEN_AT_MOST))) {
    // +3px: canvas measurement and on-screen text can differ by a pixel or two
    const length = Math.ceil(Math.min(longest + 3, TURNED_MAX));
    return { mode: 'turn', lines: 1, extra: Math.max(0, length + 6 - HEADER_ROW), length, pads: [] };
  }
  const pads = bands.map((b) => b.deficit);
  const lines = Math.max(
    1,
    ...bands.map((b) => (b.deficit ? wrapText(b.text, b.room + b.deficit, measureLabel, MAX_LINES).lines.length : b.lines)),
  );
  const widened = narrow > 0 ? pads : [];
  if (lines > 1) return { mode: 'wrap', lines, extra: (lines - 1) * LINE_HEIGHT, length: 0, pads: widened };
  return { ...ONE_LINE, pads: widened };
}
