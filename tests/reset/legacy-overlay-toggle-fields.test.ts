import { describe, expect, test } from 'vitest';
import { LEGACY_DEFAULTS, copyLegacySettings } from '../../src/legacy-runtime/legacyDefaults';
import {
  applyLegacyOverlayToggleField,
  resolveLegacyOverlayToggleSwitchIsOn,
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
    expect(resolveLegacyOverlayToggleStateText('toggleAnimatedBackdrop', false)).toBe('Stagnant');
    expect(resolveLegacyOverlayToggleStateText('toggleAnimatedBackdrop', true)).toBe('Animated');
    expect(resolveLegacyOverlayToggleStateText('controlMode', false)).toBe('Arrows');
    expect(resolveLegacyOverlayToggleStateText('controlMode', true)).toBe('Stick');
    expect(resolveLegacyOverlayToggleStateText('darkMode', false)).toBe('Off');
    expect(resolveLegacyOverlayToggleStateText('darkMode', true)).toBe('On');
  });

  test('toggles feature fields through their exact board refresh lanes', () => {
    const settings = copyLegacySettings(LEGACY_DEFAULTS);

    expect(settings.controlMode).toBe('stick');

    const cameraFollow = applyLegacyOverlayToggleField(settings, 'toggleCameraFollow');
    const trailFade = applyLegacyOverlayToggleField(settings, 'toggleTrailFade');
    const trailPulse = applyLegacyOverlayToggleField(settings, 'toggleTrailPulse');
    const animatedBackdrop = applyLegacyOverlayToggleField(settings, 'toggleAnimatedBackdrop');
    const controlMode = applyLegacyOverlayToggleField(settings, 'controlMode');

    expect(cameraFollow.settings.toggleCameraFollow).toBe(true);
    expect(cameraFollow.switchIsOn).toBe(true);
    expect(cameraFollow.stateText).toBe('On');
    expect(cameraFollow.affectsBackdrop).toBe(false);
    expect(cameraFollow.affectsBoardStatic).toBe(true);
    expect(cameraFollow.affectsBoardDynamic).toBe(true);
    expect(cameraFollow.legacyDirectionalLightIntensity).toBeNull();

    expect(trailFade.settings.toggleTrailFade).toBe(true);
    expect(trailFade.switchIsOn).toBe(true);
    expect(trailFade.stateText).toBe('On');
    expect(trailFade.affectsBackdrop).toBe(false);
    expect(trailFade.affectsBoardStatic).toBe(false);
    expect(trailFade.affectsBoardDynamic).toBe(true);
    expect(trailFade.legacyDirectionalLightIntensity).toBeNull();

    expect(trailPulse.settings.toggleTrailPulse).toBe(false);
    expect(trailPulse.switchIsOn).toBe(false);
    expect(trailPulse.stateText).toBe('Off');
    expect(trailPulse.affectsBackdrop).toBe(false);
    expect(trailPulse.affectsBoardStatic).toBe(false);
    expect(trailPulse.affectsBoardDynamic).toBe(true);
    expect(trailPulse.legacyDirectionalLightIntensity).toBeNull();

    expect(animatedBackdrop.settings.toggleAnimatedBackdrop).toBe(false);
    expect(animatedBackdrop.switchIsOn).toBe(false);
    expect(animatedBackdrop.stateText).toBe('Stagnant');
    expect(animatedBackdrop.affectsBackdrop).toBe(true);
    expect(animatedBackdrop.affectsBoardStatic).toBe(false);
    expect(animatedBackdrop.affectsBoardDynamic).toBe(false);
    expect(animatedBackdrop.legacyDirectionalLightIntensity).toBeNull();

    expect(controlMode.settings.controlMode).toBe('arrows');
    expect(controlMode.switchIsOn).toBe(false);
    expect(controlMode.stateText).toBe('Arrows');
    expect(controlMode.affectsBackdrop).toBe(false);
    expect(controlMode.affectsBoardStatic).toBe(false);
    expect(controlMode.affectsBoardDynamic).toBe(true);
    expect(controlMode.legacyDirectionalLightIntensity).toBeNull();
  });

  test('toggles dark mode through the legacy light-intensity role with exact state text', () => {
    const settings = copyLegacySettings(LEGACY_DEFAULTS);
    const darkModeOff = applyLegacyOverlayToggleField(settings, 'darkMode');
    const darkModeOn = applyLegacyOverlayToggleField(darkModeOff.settings, 'darkMode');

    expect(darkModeOn.settings.darkMode).toBe(true);
    expect(darkModeOn.switchIsOn).toBe(true);
    expect(darkModeOn.stateText).toBe('On');
    expect(darkModeOn.affectsBackdrop).toBe(true);
    expect(darkModeOn.affectsBoardStatic).toBe(true);
    expect(darkModeOn.affectsBoardDynamic).toBe(true);
    expect(darkModeOn.legacyDirectionalLightIntensity).toBe(0.3);

    expect(darkModeOff.settings.darkMode).toBe(false);
    expect(darkModeOff.switchIsOn).toBe(false);
    expect(darkModeOff.stateText).toBe('Off');
    expect(darkModeOff.legacyDirectionalLightIntensity).toBe(2.0);
  });

  test('uses the same canonical boolean for every switch position both ways', () => {
    const fields = [
      'toggleCameraFollow',
      'toggleTrailFade',
      'toggleTrailPulse',
      'toggleAnimatedBackdrop',
      'darkMode',
      'controlMode'
    ] as const;
    const settings = copyLegacySettings(LEGACY_DEFAULTS);

    expect(resolveLegacyOverlayToggleSwitchIsOn('toggleCameraFollow', settings)).toBe(false);
    expect(resolveLegacyOverlayToggleSwitchIsOn('toggleTrailFade', settings)).toBe(false);
    expect(resolveLegacyOverlayToggleSwitchIsOn('toggleTrailPulse', settings)).toBe(true);
    expect(resolveLegacyOverlayToggleSwitchIsOn('toggleAnimatedBackdrop', settings)).toBe(true);
    expect(resolveLegacyOverlayToggleSwitchIsOn('darkMode', settings)).toBe(true);
    expect(resolveLegacyOverlayToggleSwitchIsOn('controlMode', settings)).toBe(true);

    fields.forEach((fieldId) => {
      const firstToggle = applyLegacyOverlayToggleField(settings, fieldId);
      expect(firstToggle.switchIsOn).toBe(
        resolveLegacyOverlayToggleSwitchIsOn(fieldId, firstToggle.settings)
      );
      expect(firstToggle.stateText).toBe(
        resolveLegacyOverlayToggleStateText(fieldId, firstToggle.switchIsOn)
      );

      const secondToggle = applyLegacyOverlayToggleField(firstToggle.settings, fieldId);
      expect(secondToggle.switchIsOn).toBe(
        resolveLegacyOverlayToggleSwitchIsOn(fieldId, secondToggle.settings)
      );
      expect(secondToggle.stateText).toBe(
        resolveLegacyOverlayToggleStateText(fieldId, secondToggle.switchIsOn)
      );
      expect(secondToggle.switchIsOn).toBe(resolveLegacyOverlayToggleSwitchIsOn(fieldId, settings));
    });
  });
});
