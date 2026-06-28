import {
  copyLegacySettings,
  type LegacySettings
} from './legacyDefaults';

export type LegacyOptionFieldId =
  | 'scale'
  | 'camScale'
  | 'pathR'
  | 'pathG'
  | 'pathB'
  | 'wallR'
  | 'wallG'
  | 'wallB';

export type LegacyOptionFieldDrafts = Record<LegacyOptionFieldId, string>;

export interface LegacyOptionFieldApplyResult {
  affectsCamera: boolean;
  affectsMaze: boolean;
  drafts: LegacyOptionFieldDrafts;
  settings: LegacySettings;
}

const formatFloat = (value: number): string => value.toFixed(6);

export const createLegacyOptionFieldDrafts = (
  settings: LegacySettings
): LegacyOptionFieldDrafts => ({
  scale: String(settings.scale),
  camScale: String(settings.camScale),
  pathR: formatFloat(settings.pathColor.r),
  pathG: formatFloat(settings.pathColor.g),
  pathB: formatFloat(settings.pathColor.b),
  wallR: formatFloat(settings.wallColor.r),
  wallG: formatFloat(settings.wallColor.g),
  wallB: formatFloat(settings.wallColor.b)
});

const normalizeIntegerDraft = (raw: string): number | null => {
  if (!/^-?\d+$/.test(raw.trim())) {
    return null;
  }

  return Number.parseInt(raw.trim(), 10);
};

const normalizeFloatDraft = (raw: string): number | null => {
  if (!/^-?(?:\d+|\d*\.\d+)$/.test(raw.trim())) {
    return null;
  }

  return Number.parseFloat(raw.trim());
};

export const applyLegacyOptionField = (
  settings: LegacySettings,
  drafts: LegacyOptionFieldDrafts,
  fieldId: LegacyOptionFieldId
): LegacyOptionFieldApplyResult => {
  const nextSettings = copyLegacySettings(settings);
  const nextDrafts = { ...drafts };
  let affectsMaze = false;
  let affectsCamera = false;

  switch (fieldId) {
    case 'scale': {
      const parsed = normalizeIntegerDraft(drafts.scale);
      if (parsed !== null && parsed >= 25 && parsed <= 150) {
        nextSettings.scale = parsed;
        affectsMaze = parsed !== settings.scale;
      }
      nextDrafts.scale = String(nextSettings.scale);
      break;
    }
    case 'camScale': {
      const parsed = normalizeIntegerDraft(drafts.camScale);
      if (parsed !== null && parsed >= -50 && parsed <= 50) {
        nextSettings.camScale = parsed;
        affectsCamera = parsed !== settings.camScale;
      }
      nextDrafts.camScale = String(nextSettings.camScale);
      break;
    }
    case 'pathR':
    case 'pathG':
    case 'pathB':
    case 'wallR':
    case 'wallG':
    case 'wallB': {
      const parsed = normalizeFloatDraft(drafts[fieldId]);
      const colorKey = fieldId.startsWith('path') ? 'pathColor' : 'wallColor';
      const channelKey = fieldId.endsWith('R')
        ? 'r'
        : fieldId.endsWith('G')
          ? 'g'
          : 'b';

      if (parsed !== null && parsed >= 0 && parsed <= 1) {
        nextSettings[colorKey][channelKey] = parsed;
        affectsMaze = parsed !== settings[colorKey][channelKey];
      }

      nextDrafts[fieldId] = formatFloat(nextSettings[colorKey][channelKey]);
      break;
    }
  }

  return {
    affectsCamera,
    affectsMaze,
    drafts: nextDrafts,
    settings: nextSettings
  };
};
