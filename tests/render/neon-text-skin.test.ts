import { readFileSync } from 'node:fs';
import { describe, expect, test, vi } from 'vitest';

// The canvas views import Phaser; the pure painters tested here do not need it.
vi.mock('phaser', () => ({ default: { Renderer: { Canvas: { SetTransform: () => true } } } }));

import { LEGACY_ACCOUNT_STATUS_COLORS } from '../../src/legacy-runtime/legacyAccountStatusState';
import { drawCoachMarkNeonPill } from '../../src/render/coachMarkView';
import {
  LEGACY_CONTROL_HINT_HUD_GAP_PX,
  LEGACY_CONTROL_HINT_ICON_PX,
  LEGACY_CONTROL_HINT_WELL_PX,
  resolveLegacyControlHintPlacement,
  resolveLegacyControlHintStyle,
  resolveLegacyControlHintWellStyle
} from '../../src/render/legacyControlHintOverlay';
import { resolveMechanicIconAccentCss } from '../../src/render/mechanicIcons';
import { PRESENCE_PILL_PAD, resolvePresencePillRect } from '../../src/render/presenceCounterView';
import { designTokens, phaserMaterialAliases } from '../../src/theme/tokens';
import {
  NEON_PILL_GLOW_STEPS,
  NEON_TEXT_SKIN,
  NEON_TEXT_TONE_ACCENT,
  neonMixHex,
  neonRgba,
  resolveNeonPanelStyle
} from '../../src/ui/skin/neonTextSkin';

/*
 * Neon edge text skin (Zac's pick B, 2026-11-27): one look for every short text surface. The kit CSS (DOM half) and
 * the canvas painters both read NEON_TEXT_SKIN; these tests pin the two halves together so they cannot drift.
 */

const css = readFileSync('src/ui/dom/primitives.css', 'utf8').replace(/\r\n/g, '\n');
const noticeCss = readFileSync('src/ui/notice/inFlowNotice.css', 'utf8').replace(/\r\n/g, '\n');
const rule = (selector: string): string => {
  const at = css.indexOf(`\n${selector} {`);
  expect(at, `${selector} rule missing from primitives.css`).toBeGreaterThan(-1);
  return css.slice(at, css.indexOf('\n}', at));
};
const pct = (share: number): number => Math.round(share * 100);
const rem = (px: number): string => `${px / 16}rem`.replace(/^0\./, '.').replace(/^\./, '0.');

describe('kit StatusBanner wears the skin (DOM half)', () => {
  const s = NEON_TEXT_SKIN;

  test('opaque void panel, accent rim, outer glow, inner wash, drop shadow, card radius', () => {
    const banner = rule('.mazer-status-banner');
    expect(banner).toContain('background: var(--mazer-token-color-bg-canvas);');
    expect(banner).toContain('border: 0;');
    expect(banner).toContain(`border-radius: ${s.radiusPx}px;`);
    expect(banner).toContain(`0 0 0 ${s.rimPx}px var(--mazer-neon-accent)`);
    expect(banner).toContain(`0 0 ${s.glowBlurPx}px color-mix(in srgb, var(--mazer-neon-accent) ${pct(s.glowAlpha)}%, transparent)`);
    expect(banner).toContain(`inset 0 0 ${s.washBlurPx}px color-mix(in srgb, var(--mazer-neon-accent) ${pct(s.washAlpha)}%, transparent)`);
    expect(banner).toContain(`${s.dropShadow} color-mix(in srgb, var(--mazer-token-color-bg-canvas) ${pct(s.dropAlpha)}%, transparent)`);
    expect(banner).not.toMatch(/rgba\(|#[0-9a-f]{3,8}\b/i);
  });

  test('each tone sets the accent from the token the skin names', () => {
    const tokenVar = (hex: string): string => {
      const key = Object.entries(designTokens.color).find(([name, value]) => value === hex && name.startsWith('semantic.'))![0];
      return `var(--mazer-token-color-${key.replace('.', '-')})`;
    };
    expect(rule('.mazer-status-banner')).toContain(`--mazer-neon-accent: ${tokenVar(NEON_TEXT_TONE_ACCENT.info)};`);
    expect(rule('.mazer-status-banner--success')).toContain(`--mazer-neon-accent: ${tokenVar(NEON_TEXT_TONE_ACCENT.success)};`);
    // Warning shares the error rule (one selector list), so both read danger red.
    expect(rule('.mazer-status-banner--warning,\n.mazer-status-banner--error')).toContain(`--mazer-neon-accent: ${tokenVar(NEON_TEXT_TONE_ACCENT.warning)};`);
    expect(rule('.mazer-status-banner--error')).toContain(`--mazer-neon-accent: ${tokenVar(NEON_TEXT_TONE_ACCENT.error)};`);
    // Warnings stay danger red, as before the skin (no design pick moved them to gold).
    expect(NEON_TEXT_TONE_ACCENT.warning).toBe(designTokens.color['semantic.danger']);
  });

  test('hierarchy: Oxanium kicker, Oxanium heading in the accent with a glow, body on the UI face', () => {
    const kicker = rule('.mazer-status-banner__marker');
    expect(kicker).toContain(`font: ${s.kicker.weight} ${rem(s.kicker.sizePx)}/1.1 "Oxanium"`);
    expect(kicker).toContain(`letter-spacing: ${s.kicker.trackingEm}em;`);
    expect(kicker).toContain(`var(--mazer-neon-accent) ${pct(s.kicker.accentMix)}%`);
    const heading = rule('.mazer-status-banner__heading');
    expect(heading).toContain(`font: ${s.heading.weight} ${rem(s.heading.sizePx)}/1.1 "Oxanium"`);
    expect(heading).toContain('color: var(--mazer-neon-accent);');
    expect(heading).toContain(`letter-spacing: ${s.heading.trackingEm}em;`);
    expect(heading).toContain(`text-shadow: 0 0 ${s.heading.glowPx}px color-mix(in srgb, var(--mazer-neon-accent) ${pct(s.heading.glowAlpha)}%, transparent);`);
    expect(rule('.mazer-status-banner__message')).toContain(`font: ${s.body.weight} ${rem(s.body.sizePx)}/${s.body.lineHeight} var(--mazer-token-font-ui);`);
  });

  test('icon well: a ring in the accent at the skin size', () => {
    const well = rule('.mazer-status-banner__glyph');
    expect(well).toContain(`height: ${s.glyph.sizePx}px;`);
    expect(well).toContain(`width: ${s.glyph.sizePx}px;`);
    expect(well).toContain(`0 0 0 ${s.glyph.ringPx}px var(--mazer-neon-accent)`);
    expect(well).toContain(`0 0 ${s.glyph.glowPx}px color-mix(in srgb, var(--mazer-neon-accent) ${pct(s.glyph.glowAlpha)}%, transparent)`);
    expect(well).toContain(`var(--mazer-neon-accent) ${pct(s.glyph.washAlpha)}%`);
  });

  test('motion: the live rim spins at the skin period, the entry flickers, both stop under reduced motion', () => {
    expect(rule('.mazer-status-banner--live::before')).toContain(`animation: mazer-neon-rim-spin ${s.rimSpinMs}ms linear infinite;`);
    expect(noticeCss).toContain(`animation: mazer-neon-flicker ${s.flickerMs}ms steps(1, end);`);
    expect(noticeCss).toContain('.mazer-inflow-notice--open:not(.mazer-inflow-notice--reduced)');
    const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(reduced).toMatch(/\.mazer-status-banner--live::before \{\s*animation: none;/);
  });
});

describe('canvas half', () => {
  test('inline panel style: opaque canvas fill, rim, glow, wash, drop, primary text', () => {
    const accent = designTokens.color['semantic.info'];
    const style = resolveNeonPanelStyle(accent);
    expect(style.background).toBe(designTokens.color['bg.canvas']);
    expect(style.borderRadius).toBe(`${NEON_TEXT_SKIN.radiusPx}px`);
    expect(style.boxShadow).toBe([
      `0 0 0 1.5px ${accent}`,
      `0 0 22px ${neonRgba(accent, 0.3)}`,
      `inset 0 0 16px ${neonRgba(accent, 0.12)}`,
      `0 10px 24px ${neonRgba(designTokens.color['bg.canvas'], 0.6)}`
    ].join(', '));
    expect(style.color).toBe(designTokens.color['text.primary']);
    expect(resolveNeonPanelStyle(accent, { radiusPx: 999 }).borderRadius).toBe('999px');
  });

  test('colour helpers', () => {
    expect(neonRgba('#FF4FD8', 0.5)).toBe('rgba(255, 79, 216, 0.5)');
    expect(neonRgba('#000000', 2)).toBe('rgba(0, 0, 0, 1)');
    expect(neonMixHex('#000000', '#FFFFFF', 0.5)).toBe('#808080');
    expect(neonMixHex('#102030', '#FFFFFF', 0)).toBe('#102030');
  });

  test('neon pill painter: glow strokes outermost first, then the opaque void fill, then the rim', () => {
    const calls: unknown[][] = [];
    const g = new Proxy({}, { get: (_t, name) => (...args: unknown[]) => { calls.push([name, ...args]); } });
    drawCoachMarkNeonPill(g as never, 10, 20, 100, 24, 0xff00aa, 1);
    const fill = calls.findIndex((c) => c[0] === 'fillStyle');
    expect(calls.slice(0, fill)).toEqual(NEON_PILL_GLOW_STEPS.flatMap((step) => [
      ['lineStyle', step.widthPx, 0xff00aa, step.alpha],
      ['strokeRoundedRect', 10, 20, 100, 24, 12]
    ]));
    expect(calls[fill]).toEqual(['fillStyle', phaserMaterialAliases['bg.canvas'], 1]);
    expect(calls[fill + 1]).toEqual(['fillRoundedRect', 10, 20, 100, 24, 12]);
    expect(calls[fill + 2]).toEqual(['lineStyle', NEON_TEXT_SKIN.rimPx, 0xff00aa, 1]);
    expect(calls[fill + 3]).toEqual(['strokeRoundedRect', 10.75, 20.75, 98.5, 22.5, 11.25]);
  });

  test('online counter pill wraps the dot and the text by its pad', () => {
    const rect = resolvePresencePillRect({ centerX: 20, centerY: 30, radius: 4 }, { left: 30, centerY: 30 }, 50, 18);
    expect(rect.left).toBe(20 - 4 - PRESENCE_PILL_PAD.x);
    expect(rect.left + rect.width).toBe(30 + 50 + PRESENCE_PILL_PAD.x);
    expect(rect.height).toBe(18 + (PRESENCE_PILL_PAD.y * 2));
    expect(rect.top + (rect.height / 2)).toBe(30);
  });

  test('level-1 control hint: neon pill in the player colour with the registry player icon', () => {
    const accent = resolveMechanicIconAccentCss('player');
    const style = resolveLegacyControlHintStyle();
    expect(style.background).toBe(designTokens.color['bg.canvas']);
    expect(style.boxShadow.startsWith(`0 0 0 ${NEON_TEXT_SKIN.rimPx}px ${accent}`)).toBe(true);
    expect(style.pointerEvents).toBe('none');
    expect(style.font).toContain(`${NEON_TEXT_SKIN.body.sizePx}px`);
    const well = resolveLegacyControlHintWellStyle();
    expect(well.width).toBe(`${LEGACY_CONTROL_HINT_WELL_PX}px`);
    expect(well.boxShadow.startsWith(`0 0 0 ${NEON_TEXT_SKIN.glyph.ringPx}px ${accent}`)).toBe(true);
    expect(LEGACY_CONTROL_HINT_ICON_PX).toBeLessThan(LEGACY_CONTROL_HINT_WELL_PX);
  });

  test('level-1 control hint placement: stays on its anchor when clear, steps above the end star when not, never above the HUD', () => {
    const page = { width: 390, height: 844 };
    const box = { width: 300, height: 48 };
    const star = { x: 183, y: 782, width: 24, height: 24 };
    const clear = resolveLegacyControlHintPlacement({ keepClear: [null], hudBottom: 64 }, box, 8, page);
    expect(clear.edge).toBe('bottom');
    const lifted = resolveLegacyControlHintPlacement({ keepClear: [null, star], hudBottom: 64 }, box, 8, page);
    expect(lifted.covers).toBe(-1);
    expect(lifted.rect.y + lifted.rect.height).toBeLessThanOrEqual(star.y);
    const crowded = resolveLegacyControlHintPlacement(
      { keepClear: Array.from({ length: 80 }, (_, i) => ({ x: 190, y: i * 11, width: 10, height: 10 })), hudBottom: 64 }, box, 8, page
    );
    expect(crowded.rect.y).toBeGreaterThanOrEqual(64 + LEGACY_CONTROL_HINT_HUD_GAP_PX);
  });

  test('sign-in return notice: opaque fill with the skin wash baked in, full-strength rim', () => {
    expect(LEGACY_ACCOUNT_STATUS_COLORS.noticeFillAlpha).toBe(1);
    expect(LEGACY_ACCOUNT_STATUS_COLORS.noticeBorderAlpha).toBe(1);
    expect(LEGACY_ACCOUNT_STATUS_COLORS.noticeFill).toBe(
      neonMixHex(designTokens.color['bg.canvas'], designTokens.color['tone.error'], NEON_TEXT_SKIN.washAlpha)
    );
  });
});
