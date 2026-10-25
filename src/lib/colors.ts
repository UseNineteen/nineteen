/**
 * Nineteen's categorical palette, ported unchanged from the original
 * app/mixins/color.js: 39 core colors plus darker variants. `order` decides
 * which colors are used when there are only N categories; the selected
 * colors are then applied in palette (id) order.
 */

export interface Swatch {
  fill: string;
  stroke: string;
}

interface PaletteColor extends Swatch {
  order: number;
}

const core: [order: number, fill: string][] = [
  [1, '#0A3BB1'],
  [11, '#DC6ECB'],
  [6, '#6F6CDC'],
  [12, '#F4B7D3'],
  [2, '#3396E4'],
  [13, '#7499BD'],
  [7, '#91CCE2'],
  [14, '#54DDF4'],
  [3, '#02DE99'],
  [15, '#059370'],
  [8, '#89D280'],
  [16, '#D3D22F'],
  [4, '#FFD100'],
  [17, '#E5D582'],
  [9, '#EA9333'],
  [18, '#FCBC7C'],
  [5, '#D05318'],
  [19, '#BCAA93'],
  [10, '#9B1B49'],
  [20, '#FF48C3'],
  [21, '#D20F8C'],
  [22, '#3BD42E'],
  [23, '#FF8E6B'],
  [24, '#4C746C'],
  [25, '#00A0D5'],
  [26, '#8D5B33'],
  [27, '#EACAA7'],
  [28, '#608A28'],
  [29, '#E0C300'],
  [30, '#A8D9C3'],
  [31, '#F9E8ED'],
  [32, '#CDE5BD'],
  [33, '#0069A3'],
  [34, '#FFF100'],
  [35, '#B7B0E9'],
  [36, '#00A8BD'],
  [37, '#A69D29'],
  [38, '#D12229'],
  [39, '#792A90'],
];

// The original compared these case-sensitively against upper-case fills,
// so only the first two were actually excluded. Kept as-is for identical output.
const exclusions = ['#0A3BB1', '#9B1B49', '#8d5b33', '#0069a3', '#792a90'];

/** d3 v3 `rgb.darker(k)`: multiply channels by 0.7^k and truncate. */
export function darker(hex: string, k: number): string {
  const factor = Math.pow(0.7, k);
  const n = parseInt(hex.slice(1), 16);
  const channels = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.trunc(c * factor));
  return '#' + channels.map((c) => c.toString(16).padStart(2, '0')).join('');
}

const palette: PaletteColor[] = core.map(([order, fill]) => ({ order, fill, stroke: fill }));
for (const [, fill] of core) {
  if (!exclusions.includes(fill)) {
    palette.push({ order: palette.length + 1, fill: darker(fill, 0.7), stroke: fill });
  }
}

/** The colors used for `count` categories, in the order they are assigned. */
export function colorsFor(count: number): Swatch[] {
  return palette.filter((color) => color.order <= count).map(({ fill, stroke }) => ({ fill, stroke }));
}

/** Ordinal scale: the i-th category gets the i-th color, cycling if there are more categories than colors. */
export function colorScale(labels: string[]): Map<string, Swatch> {
  const colors = colorsFor(labels.length);
  return new Map(labels.map((label, i) => [label, colors[i % colors.length]]));
}
