import {
  copyLegacySettings,
  type LegacySettings
} from './legacyDefaults';

export type LegacyOverlayToggleFieldId = 'toggleCameraFollow' | 'toggleTrailFade' | 'toggleTrailPulse' | 'darkMode' | 'controlMode';
export type LegacyOverlayToggleStateText = 'On' | 'Off' | 'Arrows' | 'Stick';

export interface LegacyOverlayToggleFieldApplyResult {
  settings: LegacySettings;
  affectsBackdrop: boolean;
  affectsBoardStatic: boolean;
  affectsBoardDynamic: boolean;
  legacyDirectionalLightIntensity: number | null;
  stateText: LegacyOverlayToggleStateText | null;
}

export const resolveLegacyOverlayToggleStateText = (
  fieldId: LegacyOverlayToggleFieldId,
  value: boolean
): LegacyOverlayToggleStateText | null => {
  switch (fieldId) {
    case 'toggleCameraFollow':
    case 'toggleTrailFade':
    case 'toggleTrailPulse':
      return value ? 'On' : 'Off';
    case 'darkMode':
      return null;
    case 'controlMode':
      return value ? 'Stick' : 'Arrows';
    default:
      return fieldId satisfies never;
  }
};

export const applyLegacyOverlayToggleField = (
  settings: LegacySettings,
  fieldId: LegacyOverlayToggleFieldId
): LegacyOverlayToggleFieldApplyResult => {
  const nextSettings = copyLegacySettings(settings);

  switch (fieldId) {
    case 'toggleCameraFollow':
      nextSettings.toggleCameraFollow = !nextSettings.toggleCameraFollow;
      return {
        settings: nextSettings,
        affectsBackdrop: false,
        affectsBoardStatic: true,
        affectsBoardDynamic: true,
        legacyDirectionalLightIntensity: null,
        stateText: resolveLegacyOverlayToggleStateText(fieldId, nextSettings.toggleCameraFollow)
      };
    case 'toggleTrailFade':
      nextSettings.toggleTrailFade = !nextSettings.toggleTrailFade;
      return {
        settings: nextSettings,
        affectsBackdrop: false,
        affectsBoardStatic: false,
        affectsBoardDynamic: true,
        legacyDirectionalLightIntensity: null,
        stateText: resolveLegacyOverlayToggleStateText(fieldId, nextSettings.toggleTrailFade)
      };
    case 'toggleTrailPulse':
      nextSettings.toggleTrailPulse = !nextSettings.toggleTrailPulse;
      return {
        settings: nextSettings,
        affectsBackdrop: false,
        affectsBoardStatic: false,
        affectsBoardDynamic: true,
        legacyDirectionalLightIntensity: null,
        stateText: resolveLegacyOverlayToggleStateText(fieldId, nextSettings.toggleTrailPulse)
      };
    case 'darkMode':
      nextSettings.darkMode = !nextSettings.darkMode;
      return {
        settings: nextSettings,
        affectsBackdrop: true,
        affectsBoardStatic: true,
        affectsBoardDynamic: true,
        legacyDirectionalLightIntensity: nextSettings.darkMode ? 0.3 : 2.0,
        stateText: null
      };
    case 'controlMode':
      nextSettings.controlMode = nextSettings.controlMode === 'stick' ? 'arrows' : 'stick';
      return {
        settings: nextSettings,
        affectsBackdrop: false,
        affectsBoardStatic: false,
        affectsBoardDynamic: true,
        legacyDirectionalLightIntensity: null,
        stateText: resolveLegacyOverlayToggleStateText(fieldId, nextSettings.controlMode === 'stick')
      };
    default:
      return fieldId satisfies never;
  }
};
