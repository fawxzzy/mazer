import {
  applyLegacyOptionField,
  type LegacyOptionFieldApplyResult,
  type LegacyOptionFieldDrafts,
  type LegacyOptionFieldId
} from './legacyOptionFields';
import type { LegacySettings } from './legacyDefaults';

export type LegacyOverlayFieldCommitKind = 'material-change' | 'scale-change';

export interface LegacyOverlayFieldCommitResult extends LegacyOptionFieldApplyResult {
  commitKind: LegacyOverlayFieldCommitKind;
  triggersReloadOnBack: boolean;
}

const resolveLegacyOverlayFieldCommitKind = (
  fieldId: LegacyOptionFieldId
): LegacyOverlayFieldCommitKind => {
  switch (fieldId) {
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
    triggersReloadOnBack: result.affectsMaze
  };
};
