import { describe, expect, test } from 'vitest';
import { LEGACY_DEFAULTS, copyLegacySettings } from '../../src/legacy-runtime/legacyDefaults';
import {
  applyLegacyOverlayToggleField,
  resolveLegacyOverlayToggleStateText
} from '../../src/legacy-runtime/legacyOverlayToggleFields';

describe('legacy overlay toggle fields', () => {
  test('keeps legacy inverted On/Off copy for feature toggles only', () => {
    expect(resolveLegacyOverlayToggleStateText('toggleCameraFollow', false)).toBe('On');
    expect(resolveLegacyOverlayToggleStateText('toggleCameraFollow', true)).toBe('Off');
    expect(resolveLegacyOverlayToggleStateText('toggleTrailFade', false)).toBe('On');
    expect(resolveLegacyOverlayToggleStateText('toggleTrailFade', true)).toBe('Off');
    expect(resolveLegacyOverlayToggleStateText('darkMode', false)).toBeNull();
    expect(resolveLegacyOverlayToggleStateText('darkMode', true)).toBeNull();
  });

  test('toggles feature fields without forcing backdrop or static-board work', () => {
    const settings = copyLegacySettings(LEGACY_DEFAULTS);

    const cameraFollow = applyLegacyOverlayToggleField(settings, 'toggleCameraFollow');
    const trailFade = applyLegacyOverlayToggleField(settings, 'toggleTrailFade');

    expect(cameraFollow.settings.toggleCameraFollow).toBe(true);
    expect(cameraFollow.stateText).toBe('Off');
    expect(cameraFollow.affectsBackdrop).toBe(false);
    expect(cameraFollow.affectsBoardStatic).toBe(false);
    expect(cameraFollow.affectsBoardDynamic).toBe(true);
    expect(cameraFollow.legacyDirectionalLightIntensity).toBeNull();

    expect(trailFade.settings.toggleTrailFade).toBe(true);
    expect(trailFade.stateText).toBe('Off');
    expect(trailFade.affectsBackdrop).toBe(false);
    expect(trailFade.affectsBoardStatic).toBe(false);
    expect(trailFade.affectsBoardDynamic).toBe(true);
    expect(trailFade.legacyDirectionalLightIntensity).toBeNull();
  });

  test('toggles dark mode through the legacy light-intensity role without companion state text', () => {
    const settings = copyLegacySettings(LEGACY_DEFAULTS);
    const darkModeOn = applyLegacyOverlayToggleField(settings, 'darkMode');
    const darkModeOff = applyLegacyOverlayToggleField(darkModeOn.settings, 'darkMode');

    expect(darkModeOn.settings.darkMode).toBe(true);
    expect(darkModeOn.stateText).toBeNull();
    expect(darkModeOn.affectsBackdrop).toBe(true);
    expect(darkModeOn.affectsBoardStatic).toBe(true);
    expect(darkModeOn.affectsBoardDynamic).toBe(true);
    expect(darkModeOn.legacyDirectionalLightIntensity).toBe(0.3);

    expect(darkModeOff.settings.darkMode).toBe(false);
    expect(darkModeOff.stateText).toBeNull();
    expect(darkModeOff.legacyDirectionalLightIntensity).toBe(2.0);
  });
});
