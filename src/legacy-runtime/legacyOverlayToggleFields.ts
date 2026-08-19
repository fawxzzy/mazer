import {
  copyLegacySettings,
  type LegacySettings
} from './legacyDefaults';

export type LegacyOverlayToggleFieldId =
  | 'toggleTrailFade'
  | 'toggleTrailPulse'
  | 'toggleAnimatedBackdrop'
  | 'controlMode';
export type LegacyOverlayToggleStateText = 'On' | 'Off' | 'Arrows' | 'Stick' | 'Animated' | 'Stagnant';

export interface LegacyOverlayToggleFieldApplyResult {
  settings: LegacySettings;
  affectsBackdrop: boolean;
  affectsBoardStatic: boolean;
  affectsBoardDynamic: boolean;
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
    case 'toggleTrailFade':
    case 'toggleTrailPulse':
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
    case 'toggleTrailFade':
      return settings.toggleTrailFade;
    case 'toggleTrailPulse':
      return settings.toggleTrailPulse;
    case 'toggleAnimatedBackdrop':
      return settings.toggleAnimatedBackdrop;
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
    case 'toggleTrailFade': {
      nextSettings.toggleTrailFade = !nextSettings.toggleTrailFade;
      const trailFadeDisplayState = resolveLegacyOverlayToggleDisplayState(fieldId, nextSettings);
      return {
        settings: nextSettings,
        affectsBackdrop: false,
        affectsBoardStatic: false,
        affectsBoardDynamic: true,
        switchIsOn: trailFadeDisplayState.switchIsOn,
        stateText: trailFadeDisplayState.stateText
      };
    }
    case 'toggleTrailPulse': {
      nextSettings.toggleTrailPulse = !nextSettings.toggleTrailPulse;
      const trailPulseDisplayState = resolveLegacyOverlayToggleDisplayState(fieldId, nextSettings);
      return {
        settings: nextSettings,
        affectsBackdrop: false,
        affectsBoardStatic: false,
        affectsBoardDynamic: true,
        switchIsOn: trailPulseDisplayState.switchIsOn,
        stateText: trailPulseDisplayState.stateText
      };
    }
    case 'toggleAnimatedBackdrop': {
      nextSettings.toggleAnimatedBackdrop = !nextSettings.toggleAnimatedBackdrop;
      const animatedBackdropDisplayState = resolveLegacyOverlayToggleDisplayState(fieldId, nextSettings);
      return {
        settings: nextSettings,
        affectsBackdrop: true,
        affectsBoardStatic: false,
        affectsBoardDynamic: false,
        switchIsOn: animatedBackdropDisplayState.switchIsOn,
        stateText: animatedBackdropDisplayState.stateText
      };
    }
    case 'controlMode': {
      nextSettings.controlMode = nextSettings.controlMode === 'stick' ? 'arrows' : 'stick';
      const controlModeDisplayState = resolveLegacyOverlayToggleDisplayState(fieldId, nextSettings);
      return {
        settings: nextSettings,
        affectsBackdrop: false,
        affectsBoardStatic: false,
        affectsBoardDynamic: true,
        switchIsOn: controlModeDisplayState.switchIsOn,
        stateText: controlModeDisplayState.stateText
      };
    }
    default:
      return fieldId satisfies never;
  }
};
