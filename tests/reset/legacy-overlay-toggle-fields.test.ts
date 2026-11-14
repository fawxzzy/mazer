import { describe, expect, test } from 'vitest';
import { LEGACY_DEFAULTS, copyLegacySettings } from '../../src/legacy-runtime/legacyDefaults';
import {
  applyLegacyOverlayToggleField,
  resolveLegacyOverlayToggleSwitchIsOn,
  resolveLegacyOverlayToggleStateText
} from '../../src/legacy-runtime/legacyOverlayToggleFields';

describe('legacy overlay toggle fields', () => {
  test('reports toggle labels from the actual setting value', () => {
    expect(resolveLegacyOverlayToggleStateText('hapticsEnabled', false)).toBe('Off');
    expect(resolveLegacyOverlayToggleStateText('hapticsEnabled', true)).toBe('On');
    expect(resolveLegacyOverlayToggleStateText('toggleReducedMotion', false)).toBe('System');
    expect(resolveLegacyOverlayToggleStateText('toggleReducedMotion', true)).toBe('On');
    expect(resolveLegacyOverlayToggleStateText('controlMode', false)).toBe('Arrows');
    expect(resolveLegacyOverlayToggleStateText('controlMode', true)).toBe('Stick');
  });

  test('toggles feature fields through their exact board refresh lanes', () => {
    const settings = copyLegacySettings(LEGACY_DEFAULTS);

    expect(settings.controlMode).toBe('stick');

    const haptics = applyLegacyOverlayToggleField(settings, 'hapticsEnabled');
    const reducedMotion = applyLegacyOverlayToggleField(settings, 'toggleReducedMotion');
    const controlMode = applyLegacyOverlayToggleField(settings, 'controlMode');

    expect(haptics.settings.hapticsEnabled).toBe(false);
    expect(haptics.switchIsOn).toBe(false);
    expect(haptics.stateText).toBe('Off');
    expect(haptics.affectsBackdrop).toBe(false);
    expect(haptics.affectsBoardStatic).toBe(false);
    expect(haptics.affectsBoardDynamic).toBe(false);

    // Reduce Motion now decides the trail shine and the backdrop motion, so it refreshes both layers.
    expect(reducedMotion.settings.toggleReducedMotion).toBe(true);
    expect(reducedMotion.switchIsOn).toBe(true);
    expect(reducedMotion.stateText).toBe('On');
    expect(reducedMotion.affectsBackdrop).toBe(true);
    expect(reducedMotion.affectsBoardStatic).toBe(false);
    expect(reducedMotion.affectsBoardDynamic).toBe(true);

    expect(controlMode.settings.controlMode).toBe('arrows');
    expect(controlMode.switchIsOn).toBe(false);
    expect(controlMode.stateText).toBe('Arrows');
    expect(controlMode.affectsBackdrop).toBe(false);
    expect(controlMode.affectsBoardStatic).toBe(false);
    expect(controlMode.affectsBoardDynamic).toBe(true);
  });

  test('uses the same canonical boolean for every switch position both ways', () => {
    const fields = ['hapticsEnabled', 'toggleReducedMotion', 'controlMode'] as const;
    const settings = copyLegacySettings(LEGACY_DEFAULTS);

    expect(resolveLegacyOverlayToggleSwitchIsOn('hapticsEnabled', settings)).toBe(true);
    expect(resolveLegacyOverlayToggleSwitchIsOn('toggleReducedMotion', settings)).toBe(false);
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
