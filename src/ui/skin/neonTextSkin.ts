/**
 * Neon edge text skin (Zac's pick B, 2026-11-27, design options page MAZER-RICH-TEXT-OPTIONS-2026-11-27): the ONE look
 * every short text surface wears, so the in-flow notice, the first-time cards, the coach mark pill, the level-1
 * control hint, the sign-in return notice and the online counter read as one family.
 *
 *  - an OPAQUE void panel (bg.canvas), never see-through over the board;
 *  - a thin accent rim with a soft outer glow and a faint inner wash (the "neon edge");
 *  - hierarchy: a small Oxanium kicker (the "New" marker), an Oxanium heading in the accent, then the body sentence;
 *  - the accent is the colour of the thing the card is about (the mechanic icon registry's accent) or the tone.
 *
 * The DOM half is CSS in the kit stylesheet (`.mazer-status-banner` and its `--rich` / `--live` modifiers); the canvas
 * half (Phaser pills, inline-styled overlays) reads the numbers below. tests/render/neon-text-skin.test.ts pins the CSS to
 * these constants so the two halves cannot drift. Pure: no DOM, no Phaser.
 */
import { designTokens } from '../../theme/tokens';

export type NeonTextTone = 'info' | 'success' | 'warning' | 'error';

export const NEON_TEXT_SKIN = Object.freeze({
  /** Panel fill: the void, fully opaque. */
  fillToken: 'bg.canvas' as const,
  fillAlpha: 1,
  /** The rim. */
  rimPx: 1.5,
  /** Card corner radius (pills use half their height). */
  radiusPx: 14,
  /** Outer glow: blur radius and accent strength. */
  glowBlurPx: 22,
  glowAlpha: 0.3,
  /** Inner wash: blur radius and accent strength. */
  washBlurPx: 16,
  washAlpha: 0.12,
  /** Drop shadow under the card (separates it from the board). */
  dropShadow: '0 10px 24px',
  dropAlpha: 0.6,
  /** Kicker (the "New" marker): Oxanium caption, tracked out, accent mixed toward muted text. */
  kicker: Object.freeze({ sizePx: 12, weight: 600, trackingEm: 0.18, accentMix: 0.7 }),
  /** Heading: Oxanium in the accent with a glow. */
  heading: Object.freeze({ sizePx: 16, weight: 700, trackingEm: 0.08, glowPx: 10, glowAlpha: 0.75 }),
  /** Body sentence: the UI face. */
  body: Object.freeze({ sizePx: 14, weight: 400, lineHeight: 1.36 }),
  /** Icon well: a round ring in the accent holding a registry icon. */
  glyph: Object.freeze({ sizePx: 44, iconPx: 34, ringPx: 1.5, glowPx: 14, glowAlpha: 0.55, washAlpha: 0.1 }),
  /** Short-lived cards: the rim light runs round once every this many ms (still under reduced motion). */
  rimSpinMs: 3600,
  /** Entry flicker on short-lived cards (none under reduced motion). */
  flickerMs: 320
});

/** The accent for a tone when the card is not about one board thing. */
export const NEON_TEXT_TONE_ACCENT: Readonly<Record<NeonTextTone, string>> = Object.freeze({
  info: designTokens.color['semantic.info'],
  success: designTokens.color['semantic.energy'],
  // Warnings stay danger red, as before the skin (no design pick moved them).
  warning: designTokens.color['semantic.danger'],
  error: designTokens.color['semantic.danger']
});

const hexToRgb = (hex: string): [number, number, number] => {
  const value = Number.parseInt(hex.replace('#', ''), 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
};

/** `rgba(...)` for a token hex at an alpha (inline styles; no colour literal in the callers). */
export const neonRgba = (hex: string, alpha: number): string => {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
};

/** Mixes two token hexes (`amount` of `b`), as `#RRGGBB`. */
export const neonMixHex = (a: string, b: string, amount: number): string => {
  const t = Math.max(0, Math.min(1, amount));
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  return `#${ca.map((v, i) => Math.round(v + ((cb[i]! - v) * t)).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
};

/** The neon panel as inline CSS (for overlays that are not kit components): opaque fill, rim, glow, wash, drop. */
export const resolveNeonPanelStyle = (accentHex: string, options: { radiusPx?: number } = {}): Record<string, string> => {
  const s = NEON_TEXT_SKIN;
  const canvas = designTokens.color[s.fillToken];
  return {
    background: canvas,
    border: '0',
    borderRadius: `${options.radiusPx ?? s.radiusPx}px`,
    boxShadow: [
      `0 0 0 ${s.rimPx}px ${accentHex}`,
      `0 0 ${s.glowBlurPx}px ${neonRgba(accentHex, s.glowAlpha)}`,
      `inset 0 0 ${s.washBlurPx}px ${neonRgba(accentHex, s.washAlpha)}`,
      `${s.dropShadow} ${neonRgba(canvas, s.dropAlpha)}`
    ].join(', '),
    color: designTokens.color['text.primary']
  };
};

/**
 * The outer glow on canvas surfaces (coach mark pill, online counter, sign-in notice): Phaser Graphics has no blur, so
 * the glow is two wide, faint accent strokes under the rim, outermost first.
 */
export const NEON_PILL_GLOW_STEPS: readonly { widthPx: number; alpha: number }[] = Object.freeze([
  Object.freeze({ widthPx: 6, alpha: 0.12 }),
  Object.freeze({ widthPx: 3.5, alpha: 0.22 })
]);
