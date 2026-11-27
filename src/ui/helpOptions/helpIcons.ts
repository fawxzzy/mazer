/**
 * Candidate Help-row icons for the options page, drawn in the Star Dust C vocabulary with the game's own geometry helpers
 * (flattenSvgPath, resolveSparkPoints, the 24-unit box, the ink and spark colours). They are NOT in the shipped set: if a
 * Help row is picked, the chosen one is added to BUTTON_ICON_SOURCES in src/render/buttonIcons.ts (and its tests).
 */
import {
  BUTTON_ICON_SPARK_STROKE_UNITS,
  BUTTON_ICON_STROKE_UNITS,
  BUTTON_ICON_VIEWBOX,
  flattenSvgPath,
  resolveButtonIconColours,
  resolveSparkPoints,
  type ButtonIconSource
} from '../../render/buttonIcons';

export type HelpIconId = 'lifebuoy' | 'headset' | 'mail' | 'heart' | 'plus';

export const HELP_ICON_SOURCES: Readonly<Record<HelpIconId, ButtonIconSource>> = Object.freeze({
  lifebuoy: { body: ['M12 4a8 8 0 1 0 .01 0z', 'M12 8.6a3.4 3.4 0 1 0 .01 0z', 'M6.3 6.3l2.9 2.9M17.7 6.3l-2.9 2.9M6.3 17.7l2.9-2.9M17.7 17.7l-2.9-2.9'], dots: [], sparks: [[19.6, 4.4, 2]] },
  headset: { body: ['M5 14v-2a7 7 0 0 1 14 0v2', 'M5 13h2.5v5H5zM16.5 13H19v5h-2.5z', 'M17.5 18c0 1.8-1.7 2.5-4 2.5'], dots: [], sparks: [[12, 9.5, 1.9]] },
  mail: { body: ['M4 6.5h16v11H4z', 'M4.5 7l7.5 6 7.5-6'], dots: [], sparks: [[19.6, 5, 2]] },
  heart: { body: ['M12 20s-7.5-4.6-7.5-10a4.2 4.2 0 0 1 7.5-2.6A4.2 4.2 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z'], dots: [], sparks: [[12, 11.5, 2.2]] },
  plus: { body: ['M12 5v14M5 12h14'], dots: [[19.5, 5, 1.2], [4.5, 19, 1]], sparks: [[12, 12, 3]] }
});

export const HELP_ICON_IDS = Object.keys(HELP_ICON_SOURCES) as HelpIconId[];

/** Paints a candidate into a canvas the same way paintButtonIcon paints a shipped glyph. */
export const paintHelpIcon = (canvas: HTMLCanvasElement, id: HelpIconId, sizePx: number): void => {
  const dpr = Math.max(1, Math.round(window.devicePixelRatio || 1));
  canvas.width = sizePx * dpr;
  canvas.height = sizePx * dpr;
  canvas.style.setProperty('--oo-icon-size', `${sizePx}px`);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const source = HELP_ICON_SOURCES[id];
  const colours = resolveButtonIconColours('idle');
  const s = (sizePx * dpr) / BUTTON_ICON_VIEWBOX;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = colours.ink;
  ctx.lineWidth = BUTTON_ICON_STROKE_UNITS * s;
  for (const part of source.body) {
    for (const line of flattenSvgPath(typeof part === 'string' ? part : part.d)) {
      ctx.beginPath();
      line.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x * s, p.y * s) : ctx.lineTo(p.x * s, p.y * s)));
      if (line.closed) ctx.closePath();
      ctx.stroke();
    }
  }
  ctx.fillStyle = colours.spark;
  ctx.strokeStyle = colours.spark;
  ctx.lineWidth = BUTTON_ICON_SPARK_STROKE_UNITS * s;
  for (const [cx, cy, r] of source.sparks) {
    const pts = resolveSparkPoints(cx, cy, r);
    ctx.beginPath();
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x * s, p.y * s) : ctx.lineTo(p.x * s, p.y * s)));
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  for (const [cx, cy, r] of source.dots) {
    ctx.beginPath();
    ctx.arc(cx * s, cy * s, r * s, 0, Math.PI * 2);
    ctx.fill();
  }
};
