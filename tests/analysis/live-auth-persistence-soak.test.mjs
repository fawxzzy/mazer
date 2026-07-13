import { describe, expect, test } from 'vitest';
import { summarizeAuthPersistenceSoak } from '../../scripts/analysis/live-auth-persistence-soak.mjs';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const passingSteps = [
  'guest-entry',
  'authenticated-entry',
  'authenticated-setting-change',
  'authenticated-reload',
  'logout-to-guest',
  'fixture-reentry'
].map((id) => ({ id, pass: true }));

describe('live auth persistence soak summary', () => {
  test('builds before opening a preview unless an existing build is explicitly requested', () => {
    const source = readFileSync(resolve(process.cwd(), 'scripts/analysis/live-auth-persistence-soak.mjs'), 'utf8');
    expect(source).toContain("if (options.skipBuild !== true) {");
    expect(source).toContain('runBuild();');
  });

  test('requires the complete visible mobile account-state sequence', () => {
    expect(summarizeAuthPersistenceSoak(passingSteps, [], [])).toMatchObject({
      pass: true,
      missingSteps: []
    });
    expect(summarizeAuthPersistenceSoak(passingSteps.filter((step) => step.id !== 'authenticated-setting-change'), [], [])).toMatchObject({
      pass: false,
      missingSteps: ['authenticated-setting-change']
    });
  });

  test('ignores only the known WebGL teardown diagnostic', () => {
    expect(summarizeAuthPersistenceSoak(passingSteps, ['WebGL: CONTEXT_LOST_WEBGL: loseContext: context lost'], [])).toMatchObject({
      pass: true,
      actionableConsoleMessages: []
    });
    expect(summarizeAuthPersistenceSoak(passingSteps, ['unexpected runtime warning'], [])).toMatchObject({
      pass: false,
      actionableConsoleMessages: ['unexpected runtime warning']
    });
  });
});
