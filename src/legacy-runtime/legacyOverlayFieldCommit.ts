import {
  applyLegacyOptionField,
  type LegacyOptionFieldApplyResult,
  type LegacyOptionFieldDrafts,
  type LegacyOptionFieldId
} from './legacyOptionFields';
import type { LegacySettings } from './legacyDefaults';

export type LegacyOverlayFieldCommitKind = 'camera-flag' | 'material-change' | 'scale-change';

export interface LegacyOverlayFieldCommitResult extends LegacyOptionFieldApplyResult {
  commitKind: LegacyOverlayFieldCommitKind;
  refreshLayout: boolean;
  triggersReloadOnBack: boolean;
  triggersCameraFlag: boolean;
}

const resolveLegacyOverlayFieldCommitKind = (
  fieldId: LegacyOptionFieldId
): LegacyOverlayFieldCommitKind => {
  switch (fieldId) {
    case 'camScale':
      return 'camera-flag';
    case 'scale':
      return 'scale-change';
    case 'pathR':
    case 'pathG':
    case 'pathB':
    case 'wallR':
    case 'wallG':
    case 'wallB':
      return 'material-change';
    default:
      return fieldId satisfies never;
  }
};

export const applyLegacyOverlayFieldCommit = (
  settings: LegacySettings,
  drafts: LegacyOptionFieldDrafts,
  fieldId: LegacyOptionFieldId
): LegacyOverlayFieldCommitResult => {
  const result = applyLegacyOptionField(settings, drafts, fieldId);
  const commitKind = resolveLegacyOverlayFieldCommitKind(fieldId);

  return {
    ...result,
    commitKind,
    refreshLayout: result.affectsCamera,
    triggersReloadOnBack: commitKind !== 'camera-flag' && result.affectsMaze,
    triggersCameraFlag: commitKind === 'camera-flag'
  };
};
