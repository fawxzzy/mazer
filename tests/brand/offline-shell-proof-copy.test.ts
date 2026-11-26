import { describe, expect, test } from 'vitest';
import { PROVIDER_UNREACHABLE_MESSAGE } from '../../scripts/analysis/lib/offline-shell-proof.mjs';
import { AUTH_SURFACE_MESSAGES } from '../../src/brand/authSurfaceCopy';

// The nightly offline shell proof (scripts/analysis/verify-offline-shell.mjs) matches the signed-out offline
// failure line word for word. It failed every night from 2026-11-16 because Auth Surface v2 reworded the line
// and this constant kept the old words. The nightly is not a PR check, so this test is the PR-time guard.
describe('offline shell proof copy', () => {
  test('the provider-unreachable line the proof expects is the copy matrix row the player sees', () => {
    expect(PROVIDER_UNREACHABLE_MESSAGE).toBe(AUTH_SURFACE_MESSAGES['signin.unavailable']);
  });
});
