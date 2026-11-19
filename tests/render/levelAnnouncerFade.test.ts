import { describe, expect, test } from 'vitest';
import {
  LEVEL_ANNOUNCER_FADE_IN_MS,
  LEVEL_ANNOUNCER_FADE_OUT_MS,
  easeLevelAnnouncer,
  resolveLevelAnnouncerFadeIn,
  resolveLevelAnnouncerFadeOut
} from '../../src/render/levelAnnouncerFade';
import {
  INTRO_DIGIT_OUT_MS,
  INTRO_REVEAL_MIN_MS,
  OUTRO_REMOVE_MIN_MS,
  resolveIntro,
  resolveIntroDeconstruct,
  resolveIntroRevealEndMs
} from '../../src/render/introTimeline';

describe('level announcer fade', () => {
  test('is gentler than the old 300 ms in / 500 ms out', () => {
    expect(LEVEL_ANNOUNCER_FADE_IN_MS).toBeGreaterThanOrEqual(800);
    expect(LEVEL_ANNOUNCER_FADE_OUT_MS).toBeGreaterThanOrEqual(1000);
    expect(INTRO_DIGIT_OUT_MS).toBe(LEVEL_ANNOUNCER_FADE_OUT_MS);
  });

  test('the fade out fits inside the shortest intro reveal, after the cold-start fade in', () => {
    expect(LEVEL_ANNOUNCER_FADE_OUT_MS).toBeLessThan(INTRO_REVEAL_MIN_MS);
    expect(LEVEL_ANNOUNCER_FADE_IN_MS + LEVEL_ANNOUNCER_FADE_OUT_MS).toBeLessThanOrEqual(INTRO_REVEAL_MIN_MS + 100);
    expect(LEVEL_ANNOUNCER_FADE_IN_MS).toBeLessThanOrEqual(OUTRO_REMOVE_MIN_MS);
  });

  test('endpoints are exact and the curve is monotonic', () => {
    expect(resolveLevelAnnouncerFadeIn(0)).toBe(0);
    expect(resolveLevelAnnouncerFadeIn(LEVEL_ANNOUNCER_FADE_IN_MS)).toBe(1);
    expect(resolveLevelAnnouncerFadeOut(0)).toBe(1);
    expect(resolveLevelAnnouncerFadeOut(LEVEL_ANNOUNCER_FADE_OUT_MS)).toBe(0);
    let previous = 0;
    for (let ms = 0; ms <= LEVEL_ANNOUNCER_FADE_IN_MS; ms += 10) {
      const value = resolveLevelAnnouncerFadeIn(ms);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });

  test('eased: no kick at either end (first and last 5 percent move under 0.2 percent of the range)', () => {
    expect(easeLevelAnnouncer(0.05)).toBeLessThan(0.002);
    expect(1 - easeLevelAnnouncer(0.95)).toBeLessThan(0.002);
    expect(easeLevelAnnouncer(0.5)).toBeCloseTo(0.5, 9);
  });

  test('bad input is safe', () => {
    expect(resolveLevelAnnouncerFadeIn(Number.NaN)).toBe(0);
    expect(resolveLevelAnnouncerFadeIn(-50)).toBe(0);
    expect(resolveLevelAnnouncerFadeOut(1e9)).toBe(0);
  });

  test('timelines use it in full motion and keep the short crossfade for reduced motion', () => {
    const full = { reducedMotion: false, tileCount: 120 };
    const reduced = { reducedMotion: true, tileCount: 120 };
    expect(resolveIntroDeconstruct(LEVEL_ANNOUNCER_FADE_IN_MS / 2, full).digitAlpha).toBeCloseTo(0.5, 9);
    expect(resolveIntroDeconstruct(LEVEL_ANNOUNCER_FADE_IN_MS, full).digitAlpha).toBe(1);
    const revealEnd = resolveIntroRevealEndMs(120);
    expect(resolveIntro(revealEnd - (LEVEL_ANNOUNCER_FADE_OUT_MS / 2), full).digitAlpha).toBeCloseTo(0.5, 9);
    expect(resolveIntro(revealEnd, full).digitAlpha).toBe(0);
    expect(resolveIntroDeconstruct(1, reduced).digitAlpha).toBe(1);
    expect(resolveIntro(200, reduced).digitAlpha).toBe(0);
  });
});
