import { datasetDetails, displayLabel } from './data';
import { GEOMETRY, rowTop } from './layout';
import type { Viz } from './viz.svelte';

/**
 * "Download PNG image": draws the whole visualization (not just the visible
 * part) straight onto a canvas, so it no longer depends on screen-scraping
 * the page (the original html2canvas export was broken).
 */

const FONT = 'Colfax, sans-serif';
const HEADER = 92;
const LEGEND = 240;
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
  // Row labels, plus the split view's header ("Date Shopped") and "Total" labels
  const rowLabels = [
    ...(layout.rowOffset ? [viz.colorKey] : []),
    ...layout.groups.map((g) => displayLabel(g.label)),
  ];
  const maxLabel = Math.min(325, Math.max(0, ...rowLabels.map((label) => measure.measureText(label).width + 20)));
  const rowWidth = layout.rowWidth + layout.countWidth;

  const legendWidth = viz.legendCollapsed ? 0 : LEGEND;
  const plotTop = HEADER + PAD;
  const plotLeft = legendWidth + PAD;
  const plotHeight = layout.rowCount * GEOMETRY.row;
  const legendHeight = viz.legendCollapsed ? 0 : layout.legend.length * 28 + 10;
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
  const words: [string, boolean][] = [
    ['Grouped by ', false],
    [viz.groupKey, true],
    ['  color-coded by ', false],
    [viz.colorKey, true],
  ];
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
    const showCounts = viz.counts && !viz.split;
    layout.legend.forEach((entry, i) => {
      const top = plotTop + i * 28;
      const swatch = viz.colors.get(entry.label)!;
      ctx.fillStyle = swatch.stroke;
      ctx.beginPath();
      ctx.roundRect(PAD, top, 14, 14, 2);
      ctx.fill();
      ctx.fillStyle = swatch.fill;
      ctx.fillRect(PAD + 4, top + 4, 6, 6);
      ctx.font = `400 13px ${FONT}`;
      ctx.fillStyle = '#222222';
      const label = ellipsize(ctx, displayLabel(entry.label), LEGEND - PAD - 24 - (showCounts ? 40 : 10));
      ctx.fillText(label, PAD + 24, top + 8);
      if (showCounts) {
        const w = ctx.measureText(label).width;
        ctx.fillStyle = '#a1a7ad';
        ctx.fillText(String(entry.count), PAD + 24 + w + 5, top + 8);
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
  if (layout.rowOffset) drawRowLabel(viz.colorKey, plotTop + rowTop(1), true);
  layout.groups.forEach((group, i) => {
    const top = plotTop + rowTop(i + 1 + layout.rowOffset);
    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(plotLeft, top, maxLabel + rowWidth, 20);
    drawRowLabel(displayLabel(group.label), top, false);
  });

  // Split view: value labels above each band
  for (const header of layout.headers) {
    const left = blocksLeft + header.x + header.cx;
    const top = plotTop + header.y;
    const swatch = viz.colors.get(header.key);
    if (swatch) {
      ctx.fillStyle = swatch.stroke;
      ctx.fillRect(left, top + 4, 11, 11);
      ctx.fillStyle = swatch.fill;
      ctx.fillRect(left + 3, top + 7, 5, 5);
    }
    // The total (if any) is never trimmed; the value text gives way instead
    ctx.font = `400 ${font}px ${FONT}`;
    const totalWidth = header.total ? ctx.measureText(header.total).width + 5 : 0;
    ctx.font = `500 ${font}px ${FONT}`;
    ctx.fillStyle = '#47535e';
    const label = ellipsize(ctx, displayLabel(header.label), header.width + header.cwidth - 16 - totalWidth);
    ctx.fillText(label, left + 16, top + size / 2);
    if (header.total) {
      const after = left + 16 + ctx.measureText(label).width + 5;
      ctx.font = `400 ${font}px ${FONT}`;
      ctx.fillStyle = '#a3a8ae';
      ctx.fillText(header.total, after, top + size / 2);
    }
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
