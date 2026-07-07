import { describe, expect, test } from 'vitest';
import { LEGACY_DEFAULTS, copyLegacySettings } from '../../src/legacy-runtime/legacyDefaults';
import {
  applyLegacyOverlayToggleField,
  resolveLegacyOverlayToggleStateText
} from '../../src/legacy-runtime/legacyOverlayToggleFields';

describe('legacy overlay toggle fields', () => {
  test('reports toggle labels from the actual setting value', () => {
    expect(resolveLegacyOverlayToggleStateText('toggleCameraFollow', false)).toBe('Off');
    expect(resolveLegacyOverlayToggleStateText('toggleCameraFollow', true)).toBe('On');
    expect(resolveLegacyOverlayToggleStateText('toggleTrailFade', false)).toBe('Off');
    expect(resolveLegacyOverlayToggleStateText('toggleTrailFade', true)).toBe('On');
    expect(resolveLegacyOverlayToggleStateText('toggleTrailPulse', false)).toBe('Off');
    expect(resolveLegacyOverlayToggleStateText('toggleTrailPulse', true)).toBe('On');
    expect(resolveLegacyOverlayToggleStateText('toggleAnimatedBackdrop', false)).toBe('Off');
    expect(resolveLegacyOverlayToggleStateText('toggleAnimatedBackdrop', true)).toBe('On');
    expect(resolveLegacyOverlayToggleStateText('controlMode', false)).toBe('Arrows');
    expect(resolveLegacyOverlayToggleStateText('controlMode', true)).toBe('Stick');
    expect(resolveLegacyOverlayToggleStateText('darkMode', false)).toBeNull();
    expect(resolveLegacyOverlayToggleStateText('darkMode', true)).toBeNull();
  });

  test('toggles feature fields through their exact board refresh lanes', () => {
    const settings = copyLegacySettings(LEGACY_DEFAULTS);

    const cameraFollow = applyLegacyOverlayToggleField(settings, 'toggleCameraFollow');
    const trailFade = applyLegacyOverlayToggleField(settings, 'toggleTrailFade');
    const trailPulse = applyLegacyOverlayToggleField(settings, 'toggleTrailPulse');
    const animatedBackdrop = applyLegacyOverlayToggleField(settings, 'toggleAnimatedBackdrop');
    const controlMode = applyLegacyOverlayToggleField(settings, 'controlMode');

    expect(cameraFollow.settings.toggleCameraFollow).toBe(true);
    expect(cameraFollow.stateText).toBe('On');
    expect(cameraFollow.affectsBackdrop).toBe(false);
    expect(cameraFollow.affectsBoardStatic).toBe(true);
    expect(cameraFollow.affectsBoardDynamic).toBe(true);
    expect(cameraFollow.legacyDirectionalLightIntensity).toBeNull();

    expect(trailFade.settings.toggleTrailFade).toBe(true);
    expect(trailFade.stateText).toBe('On');
    expect(trailFade.affectsBackdrop).toBe(false);
    expect(trailFade.affectsBoardStatic).toBe(false);
    expect(trailFade.affectsBoardDynamic).toBe(true);
    expect(trailFade.legacyDirectionalLightIntensity).toBeNull();

    expect(trailPulse.settings.toggleTrailPulse).toBe(false);
    expect(trailPulse.stateText).toBe('Off');
    expect(trailPulse.affectsBackdrop).toBe(false);
    expect(trailPulse.affectsBoardStatic).toBe(false);
    expect(trailPulse.affectsBoardDynamic).toBe(true);
    expect(trailPulse.legacyDirectionalLightIntensity).toBeNull();

    expect(animatedBackdrop.settings.toggleAnimatedBackdrop).toBe(true);
    expect(animatedBackdrop.stateText).toBe('On');
    expect(animatedBackdrop.affectsBackdrop).toBe(true);
    expect(animatedBackdrop.affectsBoardStatic).toBe(false);
    expect(animatedBackdrop.affectsBoardDynamic).toBe(false);
    expect(animatedBackdrop.legacyDirectionalLightIntensity).toBeNull();

    expect(controlMode.settings.controlMode).toBe('stick');
    expect(controlMode.stateText).toBe('Stick');
    expect(controlMode.affectsBackdrop).toBe(false);
    expect(controlMode.affectsBoardStatic).toBe(false);
    expect(controlMode.affectsBoardDynamic).toBe(true);
    expect(controlMode.legacyDirectionalLightIntensity).toBeNull();
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
