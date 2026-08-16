import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

describe('movement pace architecture contract', () => {
  test('keeps player preference, progression context, and shared input timing ownership explicit', () => {
    const contract = readFileSync(resolve(process.cwd(), 'docs/architecture/MAZER-MOVEMENT-PACE-CONTRACT.md'), 'utf8');
    const source = readFileSync(resolve(process.cwd(), 'src/legacy-runtime/legacyMovementSpeed.ts'), 'utf8');
    const menuScene = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');

    expect(contract).toContain('`legacy-movement-pace-v1`');
    expect(contract).toContain('The persisted Move Speed value is the player\'s base preference.');
    expect(contract).toContain('only after at least one completed player cycle');
    expect(contract).toContain('preserves explicit `0%` and `100%` selections as hard overrides');
    expect(contract).toContain('No input path may reimplement the pace formula.');
    expect(contract).toContain('does not write progression, telemetry, settings, account data, or remote state');
    expect(source).toContain("export const LEGACY_MOVEMENT_PACE_PROFILE_VERSION = 'legacy-movement-pace-v1';");
    expect(source).toContain('const contextApplied = completedCycles > 0;');
    expect(source).toContain('const preferenceEnvelope = 4 * baseSpeed * (1 - baseSpeed);');
    expect(menuScene).toContain('private resolveLegacyPlayMovementSpeedProfile()');
    expect(menuScene).toContain('moveRepeatMinIntervalMs: this.resolveLegacyPlayMovementSpeedProfile().repeatIntervalMs');
    expect(menuScene).toContain('const profile = this.resolveLegacyPlayMovementSpeedProfile();');
  });
});
