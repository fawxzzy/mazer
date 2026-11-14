import {
  copyLegacySettings,
  type LegacySettings
} from './legacyDefaults';

export type LegacyOverlayToggleFieldId =
  | 'hapticsEnabled'
  | 'toggleReducedMotion'
  | 'controlMode';
export type LegacyOverlayToggleStateText = 'On' | 'Off' | 'Arrows' | 'Stick' | 'System';

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
    case 'hapticsEnabled':
      return value ? 'On' : 'Off';
    case 'toggleReducedMotion':
      return value ? 'On' : 'System';
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
    case 'hapticsEnabled':
      return settings.hapticsEnabled;
    case 'toggleReducedMotion':
      return settings.toggleReducedMotion;
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
    case 'hapticsEnabled': {
      nextSettings.hapticsEnabled = !nextSettings.hapticsEnabled;
      const hapticsDisplayState = resolveLegacyOverlayToggleDisplayState(fieldId, nextSettings);
      return {
        settings: nextSettings,
        affectsBackdrop: false,
        affectsBoardStatic: false,
        affectsBoardDynamic: false,
        switchIsOn: hapticsDisplayState.switchIsOn,
        stateText: hapticsDisplayState.stateText
      };
    }
    case 'toggleReducedMotion': {
      nextSettings.toggleReducedMotion = !nextSettings.toggleReducedMotion;
      const reducedMotionDisplayState = resolveLegacyOverlayToggleDisplayState(fieldId, nextSettings);
      return {
        settings: nextSettings,
        affectsBackdrop: true,
        affectsBoardStatic: false,
        affectsBoardDynamic: true,
        switchIsOn: reducedMotionDisplayState.switchIsOn,
        stateText: reducedMotionDisplayState.stateText
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
