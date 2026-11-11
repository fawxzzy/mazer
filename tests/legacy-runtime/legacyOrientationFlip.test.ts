import { describe, expect, test } from 'vitest';
import { resolveMazerViewportGeometryFromRuntime } from '../../src/boot/viewportGeometry';
import { resolveLegacyMenuLayout } from '../../src/legacy-runtime/legacyMenuLayout';
import {
  LEGACY_ROTATE_PROMPT_MIN_CORRIDOR_PX,
  isLegacyLandscapeViewport,
  isLegacyOrientationFlip,
  resolveLegacyOrientationFlip,
  shouldShowLegacyRotateNotice,
  shouldShowLegacyRotatePrompt
} from '../../src/legacy-runtime/legacyOrientationFlip';
import { buildLegacySettingsSheetPlan } from '../../src/legacy-runtime/legacySettingsSheetPlan';

// A phone-sized (portrait) corridor maze: 25 wide x 51 tall tiles.
const PHONE_MAZE = { height: 51, width: 25 };
const layoutFor = (width: number, height: number) => resolveLegacyMenuLayout(
  width,
  height,
  50,
  PHONE_MAZE.width,
  PHONE_MAZE.height,
  'play',
  { menuActionMode: 'authenticated', useFloatingTouchControls: true }
);

const runtimeFor = (width: number, height: number) => ({
  addEventListener: (): void => {},
  devicePixelRatio: 2,
  innerHeight: height,
  innerWidth: width,
  matchMedia: () => ({ matches: true }),
  navigator: { maxTouchPoints: 5 },
  removeEventListener: (): void => {},
  visualViewport: null
}) as unknown as Parameters<typeof resolveMazerViewportGeometryFromRuntime>[0];

describe('orientation flip decision', () => {
  test('landscape means strictly wider than tall', () => {
    expect(isLegacyLandscapeViewport(390, 844)).toBe(false);
    expect(isLegacyLandscapeViewport(844, 390)).toBe(true);
    expect(isLegacyLandscapeViewport(600, 600)).toBe(false);
  });

  test('a flip needs a known previous aspect and a change', () => {
    expect(isLegacyOrientationFlip(null, true)).toBe(false);
    expect(isLegacyOrientationFlip(false, false)).toBe(false);
    expect(isLegacyOrientationFlip(false, true)).toBe(true);
    expect(isLegacyOrientationFlip(true, false)).toBe(true);
  });

  test('a flip auto-pauses only a live run with no overlay open', () => {
    const flip = { nextLandscape: true, previousLandscape: false };
    expect(resolveLegacyOrientationFlip({ ...flip, mode: 'play', overlay: 'none' })).toEqual({ autoPause: true, flipped: true });
    for (const overlay of ['pause', 'options', 'auth', 'confirm-progression-reset']) {
      expect(resolveLegacyOrientationFlip({ ...flip, mode: 'play', overlay }), overlay).toEqual({ autoPause: false, flipped: true });
    }
    expect(resolveLegacyOrientationFlip({ ...flip, mode: 'menu', overlay: 'none' })).toEqual({ autoPause: false, flipped: true });
  });

  test('a plain resize without a flip never pauses', () => {
    expect(resolveLegacyOrientationFlip({ mode: 'play', nextLandscape: false, overlay: 'none', previousLandscape: false }))
      .toEqual({ autoPause: false, flipped: false });
  });
});

describe('rotate-back prompt threshold', () => {
  test('shows only below the corridor width threshold', () => {
    expect(LEGACY_ROTATE_PROMPT_MIN_CORRIDOR_PX).toBe(24);
    expect(shouldShowLegacyRotatePrompt(8)).toBe(true);
    expect(shouldShowLegacyRotatePrompt(23.9)).toBe(true);
    expect(shouldShowLegacyRotatePrompt(24)).toBe(false);
    expect(shouldShowLegacyRotatePrompt(40)).toBe(false);
    expect(shouldShowLegacyRotatePrompt(Number.NaN)).toBe(false);
  });
});

describe('rotate notice lifetime', () => {
  test('shows while still flipped and thin; clears when rotated back or when not flip-paused', () => {
    expect(shouldShowLegacyRotateNotice({ corridorPx: 8, currentLandscape: true, originLandscape: false })).toBe(true);
    expect(shouldShowLegacyRotateNotice({ corridorPx: 8, currentLandscape: false, originLandscape: false })).toBe(false);
    expect(shouldShowLegacyRotateNotice({ corridorPx: 8, currentLandscape: true, originLandscape: null })).toBe(false);
    expect(shouldShowLegacyRotateNotice({ corridorPx: 30, currentLandscape: true, originLandscape: false })).toBe(false);
  });
});

describe('viewport geometry across a flip', () => {
  test('runtime geometry reports the flip and the same maze refits to a thinner corridor', () => {
    const portrait = resolveMazerViewportGeometryFromRuntime(runtimeFor(390, 844));
    const landscape = resolveMazerViewportGeometryFromRuntime(runtimeFor(844, 390));
    expect(portrait.isLandscape).toBe(false);
    expect(landscape.isLandscape).toBe(true);
    expect(isLegacyOrientationFlip(portrait.isLandscape, landscape.isLandscape)).toBe(true);

    const portraitLayout = layoutFor(portrait.fullBleed.width, portrait.fullBleed.height);
    const landscapeLayout = layoutFor(landscape.fullBleed.width, landscape.fullBleed.height);
    // Same maze, so the corridor is one tile wide either way: it must shrink on the flip.
    expect(landscapeLayout.tileSize).toBeLessThan(portraitLayout.tileSize);
    // The refit board still fits inside the landscape canvas (no overflow).
    expect(landscapeLayout.boardWidth).toBeLessThanOrEqual(landscapeLayout.width);
    expect(landscapeLayout.boardHeight).toBeLessThanOrEqual(landscapeLayout.height);
    // The prompt fires for the thin landscape corridor.
    expect(shouldShowLegacyRotatePrompt(landscapeLayout.tileSize)).toBe(true);
  });

  test('flipping back restores the original refit exactly', () => {
    const before = layoutFor(390, 844);
    layoutFor(844, 390);
    expect(layoutFor(390, 844)).toEqual(before);
  });

  test('a roomy landscape (large tablet) stays above the threshold and shows no prompt', () => {
    const roomy = resolveLegacyMenuLayout(1280, 1400, 50, 25, 25, 'play', { menuActionMode: 'authenticated' });
    expect(shouldShowLegacyRotatePrompt(roomy.tileSize)).toBe(false);
  });
});

describe('pause sheet notice', () => {
  const base = { context: 'pause' as const, height: 390, width: 844 };
  test('leads the pause sheet with a non-interactive notice only when asked', () => {
    const withPrompt = buildLegacySettingsSheetPlan({ ...base, rotatePrompt: true });
    const without = buildLegacySettingsSheetPlan(base);
    expect(withPrompt.items[0]?.model.id).toBe('rotate-notice');
    expect(withPrompt.items[0]?.model.kind).toBe('heading');
    expect(withPrompt.items[0]?.interactive).toBe(false);
    expect(withPrompt.items[0]?.model.label).toBe('Rotate back to keep playing');
    expect(withPrompt.items[1]?.model.id).toBe('resume');
    expect(without.items.map((item) => item.model.id)).not.toContain('rotate-notice');
    expect(withPrompt.items.slice(1).map((item) => item.model.id)).toEqual(without.items.map((item) => item.model.id));
  });

  test('the menu sheet ignores the notice', () => {
    const menu = buildLegacySettingsSheetPlan({ context: 'menu', height: 390, rotatePrompt: true, signedIn: true, width: 844 });
    expect(menu.items.map((item) => item.model.id)).not.toContain('rotate-notice');
  });
});
