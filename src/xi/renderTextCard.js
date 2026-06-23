// Render a short phrase into a cream "text card" data URL, matching the look of
// the Claude/dreams decks (cream ground, dark uppercase serif-ish sans, centered,
// auto-sized to fit). Used for AI-generated cards, which have no source art.

export function renderTextCard(phrase, size = 300) {
  const text = String(phrase || '').toUpperCase().trim();
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Cream ground (matches deckDaily/deckDreams sampling: ~253,251,247).
  ctx.fillStyle = '#fdfbf7';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#0f0f0f';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const margin = Math.round(size * 0.1);
  const maxW = size - margin * 2;
  const maxH = size - margin * 2;
  const font = (px) => `700 ${px}px "Helvetica Neue", Arial, sans-serif`;

  // Largest font size (and its wrapping) that fits within the margins.
  let best = null;
  for (let px = Math.round(size * 0.16); px >= 10; px -= 2) {
    ctx.font = font(px);
    const lines = wrap(ctx, text, maxW);
    const lineH = px * 1.18;
    const totalH = lineH * lines.length;
    const fits = totalH <= maxH && lines.every((l) => ctx.measureText(l).width <= maxW);
    if (fits) { best = { px, lines, lineH }; break; }
    best = { px, lines, lineH }; // keep smallest as fallback
  }

  const { px, lines, lineH } = best;
  ctx.font = font(px);
  const startY = size / 2 - ((lines.length - 1) * lineH) / 2;
  lines.forEach((line, i) => ctx.fillText(line, size / 2, startY + i * lineH));

  return canvas.toDataURL('image/webp', 0.85);
}

// Greedy word wrap against a measured max width.
function wrap(ctx, text, maxW) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(t).width <= maxW || !cur) cur = t;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}

export default renderTextCard;
