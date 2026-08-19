import { describe, expect, test } from 'vitest';
import { LEGACY_DEFAULTS, copyLegacySettings } from '../../src/legacy-runtime/legacyDefaults';
import {
  applyLegacyOverlayToggleField,
  resolveLegacyOverlayToggleSwitchIsOn,
  resolveLegacyOverlayToggleStateText
} from '../../src/legacy-runtime/legacyOverlayToggleFields';

describe('legacy overlay toggle fields', () => {
  test('reports toggle labels from the actual setting value', () => {
    expect(resolveLegacyOverlayToggleStateText('toggleTrailFade', false)).toBe('Off');
    expect(resolveLegacyOverlayToggleStateText('toggleTrailFade', true)).toBe('On');
    expect(resolveLegacyOverlayToggleStateText('toggleTrailPulse', false)).toBe('Off');
    expect(resolveLegacyOverlayToggleStateText('toggleTrailPulse', true)).toBe('On');
    expect(resolveLegacyOverlayToggleStateText('toggleAnimatedBackdrop', false)).toBe('Stagnant');
    expect(resolveLegacyOverlayToggleStateText('toggleAnimatedBackdrop', true)).toBe('Animated');
    expect(resolveLegacyOverlayToggleStateText('controlMode', false)).toBe('Arrows');
    expect(resolveLegacyOverlayToggleStateText('controlMode', true)).toBe('Stick');
  });

  test('toggles feature fields through their exact board refresh lanes', () => {
    const settings = copyLegacySettings(LEGACY_DEFAULTS);

    expect(settings.controlMode).toBe('stick');

    const trailFade = applyLegacyOverlayToggleField(settings, 'toggleTrailFade');
    const trailPulse = applyLegacyOverlayToggleField(settings, 'toggleTrailPulse');
    const animatedBackdrop = applyLegacyOverlayToggleField(settings, 'toggleAnimatedBackdrop');
    const controlMode = applyLegacyOverlayToggleField(settings, 'controlMode');

    expect(trailFade.settings.toggleTrailFade).toBe(true);
    expect(trailFade.switchIsOn).toBe(true);
    expect(trailFade.stateText).toBe('On');
    expect(trailFade.affectsBackdrop).toBe(false);
    expect(trailFade.affectsBoardStatic).toBe(false);
    expect(trailFade.affectsBoardDynamic).toBe(true);

    expect(trailPulse.settings.toggleTrailPulse).toBe(false);
    expect(trailPulse.switchIsOn).toBe(false);
    expect(trailPulse.stateText).toBe('Off');
    expect(trailPulse.affectsBackdrop).toBe(false);
    expect(trailPulse.affectsBoardStatic).toBe(false);
    expect(trailPulse.affectsBoardDynamic).toBe(true);

    expect(animatedBackdrop.settings.toggleAnimatedBackdrop).toBe(false);
    expect(animatedBackdrop.switchIsOn).toBe(false);
    expect(animatedBackdrop.stateText).toBe('Stagnant');
    expect(animatedBackdrop.affectsBackdrop).toBe(true);
    expect(animatedBackdrop.affectsBoardStatic).toBe(false);
    expect(animatedBackdrop.affectsBoardDynamic).toBe(false);

    expect(controlMode.settings.controlMode).toBe('arrows');
    expect(controlMode.switchIsOn).toBe(false);
    expect(controlMode.stateText).toBe('Arrows');
    expect(controlMode.affectsBackdrop).toBe(false);
    expect(controlMode.affectsBoardStatic).toBe(false);
    expect(controlMode.affectsBoardDynamic).toBe(true);
  });

  test('uses the same canonical boolean for every switch position both ways', () => {
    const fields = [
      'toggleTrailFade',
      'toggleTrailPulse',
      'toggleAnimatedBackdrop',
      'controlMode'
    ] as const;
    const settings = copyLegacySettings(LEGACY_DEFAULTS);

    expect(resolveLegacyOverlayToggleSwitchIsOn('toggleTrailFade', settings)).toBe(false);
    expect(resolveLegacyOverlayToggleSwitchIsOn('toggleTrailPulse', settings)).toBe(true);
    expect(resolveLegacyOverlayToggleSwitchIsOn('toggleAnimatedBackdrop', settings)).toBe(true);
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
