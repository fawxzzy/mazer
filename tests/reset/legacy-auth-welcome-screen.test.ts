import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  LEGACY_AUTH_SCREEN_COPY,
  LEGACY_AUTH_SCREEN_OPENING_TIMEOUT_MS,
  buildLegacyAuthScreenViewModel,
  resolveLegacyAuthScreenLayout
} from '../../src/legacy-runtime/legacyAuthScreenView';
import { LEGACY_UI_MIN_TOUCH_TARGET } from '../../src/legacy-runtime/legacyUiStandards';

const scene = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8').replace(/\r\n/g, '\n');
const sliceOf = (startMarker: string, endMarker: string): string => {
  const start = scene.indexOf(startMarker);
  expect(start, startMarker).toBeGreaterThanOrEqual(0);
  return scene.slice(start, scene.indexOf(endMarker, start));
};

const entryModel = () => buildLegacyAuthScreenViewModel({
  awaitingResolution: false,
  compact: true,
  errorMessage: null,
  hasCallbackInProgress: false,
  status: 'guest',
  submitting: false
});

describe('Welcome screen anatomy (view-model the scene draws)', () => {
  test('product marker, Welcome title, no subtitle, secondary rail, legal row, one dock', () => {
    const model = entryModel();
    expect(model.marker?.label).toBe('MAZER');
    expect(model.title).toBe('Welcome');
    expect(model.subtitle).toBeNull();
    expect(model.anatomy).toEqual(['marker', 'title', 'secondary-rail', 'legal-row', 'primary-dock']);
    expect(model.secondaryRail.map((link) => link.label)).toEqual(['Create Account', 'Reset Password']);
    expect(model.legalRow.map((link) => link.label)).toEqual(['Privacy Policy', 'Terms of Service']);
    expect(model.primaryDock).toEqual({ action: 'sign-in', disabled: false, label: 'Sign in', pending: false });
  });

  test('no guest, skip, close or back action exists on the forced screen', () => {
    const model = entryModel();
    const labels = [
      ...model.secondaryRail.map((link) => link.label),
      ...model.legalRow.map((link) => link.label),
      model.primaryDock?.label ?? ''
    ].join('|').toLowerCase();
    for (const forbidden of ['guest', 'skip', 'close', 'back', 'later', 'play']) {
      expect(labels).not.toContain(forbidden);
    }
  });

  test('the dock is one full-width bottom control at least 44px tall; rail and legal rows sit above it', () => {
    for (const [width, height] of [[390, 844], [320, 568], [1280, 720]] as const) {
      const layout = resolveLegacyAuthScreenLayout(width, height);
      expect(layout.dock.height).toBeGreaterThanOrEqual(LEGACY_UI_MIN_TOUCH_TARGET);
      expect(layout.dock.width).toBe(layout.columnWidth);
      expect(layout.legal.row.top + layout.legal.row.height).toBeLessThan(layout.dock.top);
      expect(layout.rail.row.top + layout.rail.row.height).toBeLessThanOrEqual(layout.legal.row.top);
      expect(layout.rail.items[0].height).toBeGreaterThanOrEqual(LEGACY_UI_MIN_TOUCH_TARGET);
      expect(layout.overflow).toBe(false);
    }
  });

  test('Opening… is bounded at 10 s, then Sign in is enabled again with a visible notice', () => {
    expect(LEGACY_AUTH_SCREEN_OPENING_TIMEOUT_MS).toBe(10_000);
    expect(LEGACY_AUTH_SCREEN_COPY.openingDockLabel).toBe('Opening…');
    const base = {
      awaitingResolution: false, compact: false, errorMessage: null, hasCallbackInProgress: false, status: 'guest' as const, submitting: true
    };
    const inFlight = buildLegacyAuthScreenViewModel({ ...base, submittingElapsedMs: 0 });
    expect(inFlight.primaryDock?.label).toBe('Opening…');
    expect(inFlight.primaryDock?.disabled).toBe(true);
    const stalled = buildLegacyAuthScreenViewModel({ ...base, submittingElapsedMs: LEGACY_AUTH_SCREEN_OPENING_TIMEOUT_MS });
    expect(stalled.primaryDock).toEqual({ action: 'sign-in', disabled: false, label: 'Sign in', pending: false });
    expect(stalled.banner?.copy).toBe(LEGACY_AUTH_SCREEN_COPY.continueInBrowserNotice);
  });
});

describe('Welcome screen: MenuScene wiring', () => {
  const entry = sliceOf('  private buildSharedAccountEntrySection(', '  private isLegacyPasswordRecoveryActive(');

  test('draws exactly one dock button and no subtitle, bottom bar, guest or secondary-tone button', () => {
    expect(entry.match(/createLegacyAuthActionButton\(/g)).toHaveLength(1);
    expect(entry).not.toContain('createLegacyBottomActionBar');
    expect(entry).not.toContain("'secondary'");
    expect(entry).not.toContain('createAuthInfoText(\n      feedback');
    expect(entry).not.toMatch(/guest|skip/i);
    expect(scene).not.toContain('Use your shared Fawxzzy account');
  });

  test('title is Welcome (from the view-model) on the signed-out screen; Account stays only for the signed-in section', () => {
    const overlay = sliceOf('  private buildAuthOverlay(): void {', '  private buildLegacyAuthScreenModel()');
    expect(overlay).toContain("this.buildLegacyAuthScreenModel().title ?? 'Account'");
    expect(overlay).not.toContain("createOverlayTitle('Account'");
    expect(overlay).toContain('if (!(this.authGateLocked && this.overlay === \'auth\')) {');
  });

  test('every rail/legal route goes through one handler; Create Account shares the OAuth hand-off', () => {
    const routes = sliceOf('  private runLegacyAuthScreenRoute(', '  // A text link with a full-rect');
    expect(routes).toContain("case 'oauth-authorize':\n        void this.handleSharedAccountAuthorization();");
    expect(routes).toContain("this.navigateToSharedAccountRoute('reset-password')");
    expect(routes).toContain("navigateToMazerLegalPortal('privacy')");
    expect(routes).toContain("navigateToMazerLegalPortal('terms')");
  });

  test('auth fill is the near-black token, not the old teal-green', () => {
    expect(scene).toContain("this.overlay === 'auth' ? cyberArcadeMaterial.substrate.field : 0x02040a");
    expect(scene).not.toContain('0x031f20');
  });

  test('the Opening label is released after the timeout so the retry is not inert', () => {
    const timeout = sliceOf('  private syncLegacyAuthOpeningTimeout(time: number): void {', '  private syncLegacyAuthGateLoadingScreen(');
    expect(timeout).toContain('time - this.authOpeningStartedAtMs >= LEGACY_AUTH_SCREEN_OPENING_TIMEOUT_MS');
    expect(timeout).toContain('this.authSubmitting = false;');
    expect(timeout).toContain('this.authOpeningTimedOut = true;');
    const handler = sliceOf('  private async handleSharedAccountAuthorization(): Promise<void> {', '  private openOverlay(');
    expect(handler).toContain('this.authOpeningStartedAtMs = -1;');
    expect(handler).toContain('this.authOpeningTimedOut = false;');
    expect(scene).toContain('this.syncLegacyAuthOpeningTimeout(time);');
  });
});
