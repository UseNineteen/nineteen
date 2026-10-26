import { datasetDetails } from './data';
import { HEADER_ROW, LINE_HEIGHT, SWATCH, TOTAL_GAP, TURNED_MAX } from './band-labels';
import { GEOMETRY, LEGEND, LEGEND_PITCH, legendWidth, rowTop } from './layout';
import { wrapText } from './wrap';
import type { Viz } from './viz.svelte';

/**
 * "Download PNG image": draws the whole visualization (not just the visible
 * part) straight onto a canvas, so it no longer depends on screen-scraping
 * the page (the original html2canvas export was broken).
 */

const FONT = 'Colfax, sans-serif';
const HEADER = 92;
const PAD = 20;
const MAX_SIDE = 16384;
const MAX_AREA = 16_000_000; // stay under Safari's canvas limit

async function loadFonts(): Promise<void> {
  try {
    await Promise.all([300, 400, 500, 700].map((w) => document.fonts.load(`${w} 16px Colfax`)));
  } catch {
    // Fall back to the system font
  }
}

function ellipsize(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ctx.measureText(text.slice(0, mid) + '…').width <= max) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo) + '…';
}

export async function renderSnapshot(viz: Viz): Promise<Blob> {
  await loadFonts();
  const { layout } = viz;
  const { size, font } = GEOMETRY;

  const measure = document.createElement('canvas').getContext('2d')!;
  measure.font = `400 ${font}px ${FONT}`;
  const rowLabels = layout.groups.map((g) => viz.label(g.label, viz.groupKey));
  const maxLabel = Math.min(325, Math.max(0, ...rowLabels.map((label) => measure.measureText(label).width + 20)));
  const rowWidth = layout.rowWidth + layout.countWidth;

  const showCounts = viz.counts && !viz.split;
  const legendLabels = layout.legend.map((entry) => viz.label(entry.label, viz.colorKey));
  // As on screen, the legend is as wide as its longest entry, plus the export's wider margins
  const widestEntry = Math.max(
    0,
    ...layout.legend.map((entry, i) => {
      const count = showCounts ? LEGEND.countGap + measure.measureText(String(entry.count)).width : 0;
      return LEGEND.swatch + LEGEND.swatchGap + measure.measureText(legendLabels[i]).width + count;
    }),
  );
  const legendBox = viz.legendCollapsed ? 0 : legendWidth(widestEntry) + (PAD - LEGEND.padding) + (PAD - LEGEND.paddingRight);
  const plotTop = HEADER + PAD;
  const plotLeft = legendBox + PAD;
  const extra = layout.headerExtra;
  const mode = viz.headerMode;
  const plotHeight = layout.rowCount * GEOMETRY.row + extra;
  // The legend starts level with the first data row (below any split label row)
  const legendTop = rowTop(1 + layout.rowOffset) + extra;
  const legendHeight = viz.legendCollapsed ? 0 : legendTop + layout.legend.length * LEGEND_PITCH + 10;
  const width = Math.ceil(plotLeft + maxLabel + rowWidth + PAD);
  const height = Math.ceil(plotTop + Math.max(plotHeight, legendHeight) + PAD);

  const scale = Math.min(2, MAX_SIDE / width, MAX_SIDE / height, Math.sqrt(MAX_AREA / (width * height)));
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(width * scale);
  canvas.height = Math.floor(height * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);
  ctx.textBaseline = 'middle';

  // Background and title bar
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#47535e';
  ctx.fillRect(0, 0, width, HEADER);

  ctx.font = `400 13px ${FONT}`;
  ctx.fillStyle = '#a3a8ae';
  ctx.fillText(`${viz.dataset.name} — ${datasetDetails(viz.dataset)}`, 40, 30);

  let x = 40;
  const y = 62;
  const words: [string, boolean][] = [['Grouped by ', false]];
  if (viz.rowKey !== null) words.push([viz.rowKey, true]);
  if (viz.rowKey !== null && viz.columnKey !== null) words.push([' and ', false]);
  if (viz.columnKey !== null) words.push([viz.columnKey, true]);
  words.push(['  color-coded by ', false], [viz.colorKey, true]);
  for (const [text, key] of words) {
    ctx.font = `${key ? 500 : 400} 24px ${FONT}`;
    ctx.fillStyle = key ? '#ffffff' : 'rgba(255,255,255,0.5)';
    ctx.fillText(text, x, y);
    const w = ctx.measureText(text).width;
    if (key) ctx.fillRect(x, y + 14, w, 2);
    x += w;
  }
  ctx.font = `500 19px ${FONT}`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'right';
  ctx.fillText('nineteen', width - 40, 64);
  ctx.textAlign = 'left';

  // Legend
  if (!viz.legendCollapsed) {
    const textLeft = PAD + LEGEND.swatch + LEGEND.swatchGap;
    layout.legend.forEach((entry, i) => {
      const top = plotTop + legendTop + i * LEGEND_PITCH;
      const swatch = viz.colors.get(entry.label)!;
      ctx.fillStyle = swatch.stroke;
      ctx.beginPath();
      ctx.roundRect(PAD, top, LEGEND.swatch, LEGEND.swatch, 2);
      ctx.fill();
      ctx.fillStyle = swatch.fill;
      ctx.fillRect(PAD + 4, top + 4, 6, 6);
      ctx.font = `400 13px ${FONT}`;
      ctx.fillStyle = '#222222';
      const countWidth = showCounts ? LEGEND.countGap + ctx.measureText(String(entry.count)).width : 0;
      const label = ellipsize(ctx, legendLabels[i], legendBox - textLeft - countWidth - PAD);
      ctx.fillText(label, textLeft, top + 8);
      if (showCounts) {
        const w = ctx.measureText(label).width;
        ctx.fillStyle = '#a1a7ad';
        ctx.fillText(String(entry.count), textLeft + w + LEGEND.countGap, top + 8);
      }
    });
  }

  // Rows and labels
  const blocksLeft = plotLeft + maxLabel;
  const drawRowLabel = (text: string, top: number, bold: boolean) => {
    ctx.font = `${bold ? 700 : 400} ${font}px ${FONT}`;
    ctx.fillStyle = bold ? '#47535e' : '#222222';
    ctx.textAlign = 'right';
    ctx.fillText(ellipsize(ctx, text, maxLabel - 20), blocksLeft - 10, top + 10);
    ctx.textAlign = 'left';
  };
  // One stripe per row, with its label; without rows, each band gets the stripe instead
  ctx.fillStyle = '#f5f5f5';
  if (viz.rowKey !== null) {
    layout.groups.forEach((group, i) => {
      const top = plotTop + rowTop(i + 1 + layout.rowOffset) + extra;
      ctx.fillStyle = '#f5f5f5';
      ctx.fillRect(plotLeft, top, maxLabel + rowWidth, 20);
      drawRowLabel(viz.label(group.label, viz.groupKey), top, false);
    });
  } else {
    const top = plotTop + GEOMETRY.row + extra;
    const { size: box, gutter } = GEOMETRY;
    for (const header of layout.headers) {
      ctx.fillRect(
        blocksLeft + header.x + header.cx - gutter,
        top,
        header.boxes * (box + gutter) + gutter,
        layout.stripes * GEOMETRY.row - 6,
      );
    }
  }

  // Value labels above each band (on one line, wrapped, or turned, like the screen), with a
  // swatch when the bands are the color column's values
  const bandSwatches = viz.columnKey === viz.colorKey;
  const swatchWidth = bandSwatches ? SWATCH : 0;
  for (const header of layout.headers) {
    const left = blocksLeft + header.x + header.cx;
    const swatch = bandSwatches ? viz.colors.get(header.key) : undefined;
    const text = viz.label(header.label, viz.columnKey ?? viz.colorKey);
    ctx.font = `400 ${font}px ${FONT}`;
    const totalWidth = header.total ? ctx.measureText(header.total).width + TOTAL_GAP : 0;
    ctx.font = `500 ${font}px ${FONT}`;
    const room = header.width + header.cwidth - swatchWidth - totalWidth;
    // Lines of text, bottom line last; the row's bottom edge is where the boxes begin
    let lines: string[];
    if (mode === 'turn') lines = [ellipsize(ctx, text, TURNED_MAX - swatchWidth - totalWidth)];
    else if (mode === 'wrap') {
      const wrapped = wrapText(text, room, (t) => ctx.measureText(t).width, viz.headerLines);
      lines = wrapped.lines;
      if (!wrapped.complete) lines[lines.length - 1] = ellipsize(ctx, lines[lines.length - 1] + '…', room);
    } else lines = [ellipsize(ctx, text, room)];

    ctx.save();
    const bottom = plotTop + 20 + extra;
    if (mode === 'turn') {
      ctx.translate(left + size, bottom);
      ctx.rotate(-Math.PI / 2);
      ctx.translate(0, -size);
    } else {
      ctx.translate(left, bottom - size - (lines.length - 1) * LINE_HEIGHT - (mode === 'line' ? HEADER_ROW - size - 1.67 : 0));
    }
    const lastY = (lines.length - 1) * LINE_HEIGHT;
    if (swatch) {
      ctx.fillStyle = swatch.stroke;
      ctx.fillRect(0, lastY + 4, 11, 11);
      ctx.fillStyle = swatch.fill;
      ctx.fillRect(3, lastY + 7, 5, 5);
    }
    ctx.fillStyle = '#47535e';
    lines.forEach((line, n) => ctx.fillText(line, swatchWidth, n * LINE_HEIGHT + size / 2));
    if (header.total) {
      const lastWidth = ctx.measureText(lines[lines.length - 1]).width;
      ctx.font = `400 ${font}px ${FONT}`;
      ctx.fillStyle = '#a3a8ae';
      ctx.fillText(
        header.total,
        swatchWidth + (mode === 'wrap' ? Math.max(...lines.map((l) => ctx.measureText(l).width)) : lastWidth) + TOTAL_GAP,
        lastY + size / 2,
      );
    }
    ctx.restore();
  }

  // Blocks
  for (const item of layout.items) {
    const p = layout.positions.get(item.id)!;
    const filtered = viz.isFiltered(item);
    const swatch = viz.colorOf(item);
    const bx = blocksLeft + p.x + p.cx;
    const by = plotTop + p.y;
    ctx.fillStyle = filtered ? '#cccccc' : swatch.stroke;
    ctx.beginPath();
    ctx.roundRect(bx, by, size, size, 2);
    ctx.fill();
    if (!filtered) {
      ctx.fillStyle = swatch.fill;
      ctx.fillRect(bx + 5, by + 5, size - 10, size - 10);
    }
  }

  // Counts
  ctx.font = `400 ${font}px ${FONT}`;
  ctx.fillStyle = '#a3a8ae';
  for (const count of layout.counts) {
    ctx.fillText(count.text, blocksLeft + count.x + count.cx + 5, plotTop + count.y + size / 2);
  }

  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Image could not be created'))), 'image/png'),
  );
}
