import { describe, expect, test } from 'vitest';
import {
  LEGACY_DEFAULTS,
  copyLegacySettings,
  srgbByteToLinearChannel
} from '../../src/legacy-runtime/legacyDefaults';
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
  });

  test('treats material channels as deferred reload-on-back fields', () => {
    const settings = copyLegacySettings(LEGACY_DEFAULTS);
    const drafts = createLegacyOptionFieldDrafts(settings);
    drafts.pathR = '128';

    const result = applyLegacyOverlayFieldCommit(settings, drafts, 'pathR');

    expect(result.commitKind).toBe('material-change');
    expect(result.settings.pathColor.r).toBeCloseTo(srgbByteToLinearChannel(128), 6);
    expect(result.triggersReloadOnBack).toBe(true);
  });
});
