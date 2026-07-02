import { describe, expect, test } from 'vitest';
import { LEGACY_DEFAULTS, copyLegacySettings } from '../../src/legacy-runtime/legacyDefaults';
import { createLegacyOptionFieldDrafts } from '../../src/legacy-runtime/legacyOptionFields';
import { applyLegacyOverlayFieldCommit } from '../../src/legacy-runtime/legacyOverlayFieldCommit';

describe('legacy overlay field commit', () => {
  test('treats scale as a deferred reload-on-back field', () => {
    const settings = copyLegacySettings(LEGACY_DEFAULTS);
    const drafts = createLegacyOptionFieldDrafts(settings);
    drafts.scale = '75';

    const result = applyLegacyOverlayFieldCommit(settings, drafts, 'scale');

    expect(result.commitKind).toBe('scale-change');
    expect(result.settings.scale).toBe(75);
    expect(result.triggersReloadOnBack).toBe(true);
    expect(result.triggersCameraFlag).toBe(false);
    expect(result.refreshLayout).toBe(false);
  });

  test('treats material channels as deferred reload-on-back fields', () => {
    const settings = copyLegacySettings(LEGACY_DEFAULTS);
    const drafts = createLegacyOptionFieldDrafts(settings);
    drafts.pathR = '0.500000';

    const result = applyLegacyOverlayFieldCommit(settings, drafts, 'pathR');

    expect(result.commitKind).toBe('material-change');
    expect(result.settings.pathColor.r).toBe(0.5);
    expect(result.triggersReloadOnBack).toBe(true);
    expect(result.triggersCameraFlag).toBe(false);
    expect(result.refreshLayout).toBe(false);
  });

  test('treats camera scale as a camera-flag field even when the value is invalid', () => {
    const settings = copyLegacySettings(LEGACY_DEFAULTS);
    const drafts = createLegacyOptionFieldDrafts(settings);
    drafts.camScale = '999';

    const result = applyLegacyOverlayFieldCommit(settings, drafts, 'camScale');

    expect(result.commitKind).toBe('camera-flag');
    expect(result.settings.camScale).toBe(LEGACY_DEFAULTS.camScale);
    expect(result.triggersReloadOnBack).toBe(false);
    expect(result.triggersCameraFlag).toBe(true);
    expect(result.refreshLayout).toBe(false);
    expect(result.drafts.camScale).toBe('0');
  });
});
