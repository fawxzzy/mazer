import {
  copyLegacySettings,
  type LegacySettings
} from './legacyDefaults';

export type LegacyOverlayToggleFieldId =
  | 'toggleCameraFollow'
  | 'toggleTrailFade'
  | 'toggleTrailPulse'
  | 'toggleAnimatedBackdrop'
  | 'darkMode'
  | 'controlMode';
export type LegacyOverlayToggleStateText = 'On' | 'Off' | 'Arrows' | 'Stick' | 'Animated' | 'Stagnant';

export interface LegacyOverlayToggleFieldApplyResult {
  settings: LegacySettings;
  affectsBackdrop: boolean;
  affectsBoardStatic: boolean;
  affectsBoardDynamic: boolean;
  legacyDirectionalLightIntensity: number | null;
  switchIsOn: boolean;
  stateText: LegacyOverlayToggleStateText | null;
}

export interface LegacyOverlayToggleDisplayState {
  switchIsOn: boolean;
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
    case 'darkMode':
      return value ? 'On' : 'Off';
    case 'toggleAnimatedBackdrop':
      return value ? 'Animated' : 'Stagnant';
    case 'controlMode':
      return value ? 'Stick' : 'Arrows';
    default:
      return fieldId satisfies never;
  }
};

export const resolveLegacyOverlayToggleSwitchIsOn = (
  fieldId: LegacyOverlayToggleFieldId,
  settings: LegacySettings
): boolean => {
  switch (fieldId) {
    case 'toggleCameraFollow':
      return settings.toggleCameraFollow;
    case 'toggleTrailFade':
      return settings.toggleTrailFade;
    case 'toggleTrailPulse':
      return settings.toggleTrailPulse;
    case 'toggleAnimatedBackdrop':
      return settings.toggleAnimatedBackdrop;
    case 'darkMode':
      return settings.darkMode;
    case 'controlMode':
      return settings.controlMode === 'stick';
    default:
      return fieldId satisfies never;
  }
};

export const resolveLegacyOverlayToggleDisplayState = (
  fieldId: LegacyOverlayToggleFieldId,
  settings: LegacySettings
): LegacyOverlayToggleDisplayState => {
  const switchIsOn = resolveLegacyOverlayToggleSwitchIsOn(fieldId, settings);

  return {
    switchIsOn,
    stateText: resolveLegacyOverlayToggleStateText(fieldId, switchIsOn)
  };
};

export const applyLegacyOverlayToggleField = (
  settings: LegacySettings,
  fieldId: LegacyOverlayToggleFieldId
): LegacyOverlayToggleFieldApplyResult => {
  const nextSettings = copyLegacySettings(settings);

  switch (fieldId) {
    case 'toggleCameraFollow':
      nextSettings.toggleCameraFollow = !nextSettings.toggleCameraFollow;
      const cameraFollowDisplayState = resolveLegacyOverlayToggleDisplayState(fieldId, nextSettings);
      return {
        settings: nextSettings,
        affectsBackdrop: false,
        affectsBoardStatic: true,
        affectsBoardDynamic: true,
        legacyDirectionalLightIntensity: null,
        switchIsOn: cameraFollowDisplayState.switchIsOn,
        stateText: cameraFollowDisplayState.stateText
      };
    case 'toggleTrailFade':
      nextSettings.toggleTrailFade = !nextSettings.toggleTrailFade;
      const trailFadeDisplayState = resolveLegacyOverlayToggleDisplayState(fieldId, nextSettings);
      return {
        settings: nextSettings,
        affectsBackdrop: false,
        affectsBoardStatic: false,
        affectsBoardDynamic: true,
        legacyDirectionalLightIntensity: null,
        switchIsOn: trailFadeDisplayState.switchIsOn,
        stateText: trailFadeDisplayState.stateText
      };
    case 'toggleTrailPulse':
      nextSettings.toggleTrailPulse = !nextSettings.toggleTrailPulse;
      const trailPulseDisplayState = resolveLegacyOverlayToggleDisplayState(fieldId, nextSettings);
      return {
        settings: nextSettings,
        affectsBackdrop: false,
        affectsBoardStatic: false,
        affectsBoardDynamic: true,
        legacyDirectionalLightIntensity: null,
        switchIsOn: trailPulseDisplayState.switchIsOn,
        stateText: trailPulseDisplayState.stateText
      };
    case 'toggleAnimatedBackdrop':
      nextSettings.toggleAnimatedBackdrop = !nextSettings.toggleAnimatedBackdrop;
      const animatedBackdropDisplayState = resolveLegacyOverlayToggleDisplayState(fieldId, nextSettings);
      return {
        settings: nextSettings,
        affectsBackdrop: true,
        affectsBoardStatic: false,
        affectsBoardDynamic: false,
        legacyDirectionalLightIntensity: null,
        switchIsOn: animatedBackdropDisplayState.switchIsOn,
        stateText: animatedBackdropDisplayState.stateText
      };
    case 'darkMode':
      nextSettings.darkMode = !nextSettings.darkMode;
      const darkModeDisplayState = resolveLegacyOverlayToggleDisplayState(fieldId, nextSettings);
      return {
        settings: nextSettings,
        affectsBackdrop: true,
        affectsBoardStatic: true,
        affectsBoardDynamic: true,
        legacyDirectionalLightIntensity: nextSettings.darkMode ? 0.3 : 2.0,
        switchIsOn: darkModeDisplayState.switchIsOn,
        stateText: darkModeDisplayState.stateText
      };
    case 'controlMode':
      nextSettings.controlMode = nextSettings.controlMode === 'stick' ? 'arrows' : 'stick';
      const controlModeDisplayState = resolveLegacyOverlayToggleDisplayState(fieldId, nextSettings);
      return {
        settings: nextSettings,
        affectsBackdrop: false,
        affectsBoardStatic: false,
        affectsBoardDynamic: true,
        legacyDirectionalLightIntensity: null,
        switchIsOn: controlModeDisplayState.switchIsOn,
        stateText: controlModeDisplayState.stateText
      };
    default:
      return fieldId satisfies never;
  }
};
