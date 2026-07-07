import { describe, expect, test } from 'vitest';
import {
  LEGACY_DEFAULTS,
  copyLegacySettings,
  srgbByteToLinearChannel
} from '../../src/legacy-runtime/legacyDefaults';
import {
  applyLegacyOptionField,
  createLegacyOptionFieldDrafts
} from '../../src/legacy-runtime/legacyOptionFields';

describe('legacy option field helpers', () => {
  test('formats initial drafts from legacy defaults', () => {
    const drafts = createLegacyOptionFieldDrafts(LEGACY_DEFAULTS);

    expect(drafts.scale).toBe('50');
    expect(drafts.camScale).toBe('0');
    expect(drafts.pathR).toBe('121');
    expect(drafts.wallB).toBe('74');
  });

  test('applies valid scale and camera drafts inside legacy ranges', () => {
    const settings = copyLegacySettings(LEGACY_DEFAULTS);
    const drafts = createLegacyOptionFieldDrafts(settings);
    drafts.scale = '75';
    drafts.camScale = '-12';

    const scaleResult = applyLegacyOptionField(settings, drafts, 'scale');
    const camResult = applyLegacyOptionField(scaleResult.settings, scaleResult.drafts, 'camScale');

    expect(scaleResult.settings.scale).toBe(75);
    expect(scaleResult.affectsMaze).toBe(true);
    expect(camResult.settings.camScale).toBe(-12);
    expect(camResult.affectsCamera).toBe(true);
  });

  test('applies user-facing srgb byte drafts to internal linear colors', () => {
    const settings = copyLegacySettings(LEGACY_DEFAULTS);
    const drafts = createLegacyOptionFieldDrafts(settings);
    drafts.pathR = '128';

    const result = applyLegacyOptionField(settings, drafts, 'pathR');

    expect(result.settings.pathColor.r).toBeCloseTo(srgbByteToLinearChannel(128), 6);
    expect(result.affectsMaze).toBe(true);
    expect(result.drafts.pathR).toBe('128');
  });

  test('rejects invalid drafts and restores the current legacy values', () => {
    const settings = copyLegacySettings(LEGACY_DEFAULTS);
    const drafts = createLegacyOptionFieldDrafts(settings);
    drafts.scale = '999';
    drafts.pathG = '300';

    const scaleResult = applyLegacyOptionField(settings, drafts, 'scale');
    const pathResult = applyLegacyOptionField(scaleResult.settings, scaleResult.drafts, 'pathG');

    expect(pathResult.settings.scale).toBe(LEGACY_DEFAULTS.scale);
    expect(pathResult.drafts.scale).toBe('50');
    expect(pathResult.settings.pathColor.g).toBe(LEGACY_DEFAULTS.pathColor.g);
    expect(pathResult.drafts.pathG).toBe('121');
  });
});
