import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { resolveLegacyOverlayBackAction } from '../../src/legacy-runtime/legacyOverlayRouting';
import {
  LEGACY_PAUSE_OVERLAY_ID,
  buildLegacyPauseMenuViewModel,
  resolveLegacyPauseMenuLayout
} from '../../src/legacy-runtime/legacyPauseMenuView';

const scene = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8').replace(/\r\n/g, '\n');
const methodSource = (signature: string): string => {
  const start = scene.indexOf(signature);
  expect(start, signature).toBeGreaterThanOrEqual(0);
  return scene.slice(start, scene.indexOf('\n  }\n', start));
};

describe('MenuScene wiring: header identity replaces the bottom Welcome block', () => {
  test('no "Welcome" text object is created anywhere in the menu front door', () => {
    expect(scene).not.toContain("'Welcome'");
    expect(scene).not.toContain('"Welcome"');
    expect(scene).not.toContain('createLegacyAuthenticatedWelcomeIdentity');
  });

  test('the identity label is anchored at the profile icon, not at the Start button', () => {
    const identity = methodSource('private createLegacyHeaderIdentityLabel(): void');
    expect(identity).not.toContain('centerButtonX');
    expect(identity).not.toContain('centerButtonY');
    expect(identity).not.toContain('buttonHeight');
    expect(identity).toContain('placement.anchor.x, placement.anchor.y');
    // signed out / guest -> no label
    expect(identity).toContain("this.authSnapshot.status === 'authenticated'");
    expect(identity).toContain('if (username.length === 0) {\n      return;');
  });

  test('is created in the menu front door right after the profile icon (menu mode, no overlay only)', () => {
    const profileCall = scene.indexOf('this.createLegacyMenuProfileButton(');
    const identityCall = scene.indexOf('this.createLegacyHeaderIdentityLabel();');
    expect(profileCall).toBeGreaterThan(0);
    expect(identityCall).toBeGreaterThan(profileCall);
    expect(identityCall - profileCall).toBeLessThan(400);
  });
});

describe('MenuScene wiring: pause card', () => {
  const pause = methodSource('private buildPauseOverlay(): void');

  test('keeps the overlay id "pause" and the QA/lifecycle hooks that depend on it', () => {
    expect(LEGACY_PAUSE_OVERLAY_ID).toBe('pause');
    expect(buildLegacyPauseMenuViewModel().overlayId).toBe('pause');
    expect(scene).toContain("case 'pause':\n        this.buildPauseOverlay();");
    expect(scene).toContain("this.overlay !== 'pause'");
    expect(scene).toContain("kind === 'pause'");
    expect(resolveLegacyOverlayBackAction({ mode: 'play', overlay: 'pause', overlayReturn: 'none' }).kind).toBe('close-overlay');
  });

  test('has exactly Resume / Settings / Quit to Menu action buttons (plus the standard back chevron)', () => {
    expect(buildLegacyPauseMenuViewModel().actions.map((action) => action.label)).toEqual(['Resume', 'Settings', 'Quit to Menu']);
    expect(pause.match(/createLegacyAuthActionButton\(/g)).toHaveLength(3);
    expect(pause).toContain("actionLabel('resume')");
    expect(pause).toContain("actionLabel('settings')");
    expect(pause).toContain("actionLabel('quit-to-menu')");
    expect(pause.match(/createOverlayBackChevronButton\(/g)).toHaveLength(1);
    // nothing else is a button: no restart/reset/progress/log out/guide.
    expect(pause).not.toMatch(/Restart|Reset|Log out|Guide|createLegacyBottomActionBar|createLegacyOptionsInfoSection/);
  });

  test('has no profile / account icon', () => {
    expect(pause).not.toContain('createLegacyMenuProfileButton');
    expect(pause).not.toContain('createLegacyOverlayUsernameButton');
    expect(pause).not.toContain('createLegacyOverlayHomeButton');
    expect(pause).not.toContain('drawLegacyProfileIcon');
    expect(pause).not.toContain("surface: 'account'");
    expect(pause).not.toContain('openSharedAccountSurface');
    expect(scene).not.toContain('private createLegacyOverlayUsernameButton(');
  });

  test('Resume and Quit use the existing bridge-then-lifecycle paths; Settings starts collapsed', () => {
    expect(pause).toContain("{ type: 'RESUME_RUN' }, () => this.applyLegacyPauseCommand('resume')");
    expect(pause).toContain("{ type: 'RETURN_HOME' }, () => this.applyLegacyPauseCommand('return-menu')");
    expect(scene).toContain('private pauseSettingsExpanded = false;');
    expect(scene).toContain("if (kind === 'pause') {\n      this.pauseSettingsExpanded = false;");
    // Settings toggles are the same feature-control rows Options uses (no movement speed).
    expect(pause).toContain('this.createFeatureControlRows(cursorY, rowsPanel, {');
    expect(pause).toContain('includeMovementSpeed: false');
  });

  test('uses existing tokens only (no new free hex colours) and 44 px minimum actions', () => {
    expect(pause).not.toMatch(/0x[0-9a-fA-F]{6}/);
    expect(pause).not.toMatch(/'#[0-9a-fA-F]{3,8}'/);
    expect(pause).toContain('cyberArcadeMaterial.substrate.field');
    expect(pause).toContain('LEGACY_CYBER_PANEL_STROKE');
    for (const [width, height, safeArea] of [
      [390, 844, {}],
      [320, 568, {}],
      [1280, 720, {}],
      [390, 844, { bottom: 34, top: 47 }]
    ] as const) {
      expect(resolveLegacyPauseMenuLayout(width, height, safeArea).actionHeight).toBeGreaterThanOrEqual(44);
    }
  });

  test('the Options header no longer carries a profile icon', () => {
    const options = methodSource('private buildOptionsOverlay(): void');
    expect(options).not.toContain('createLegacyOverlayUsernameButton');
    expect(options).not.toContain('semanticAction');
    expect(options).toContain('this.createOverlayBackChevronButton(panel, () => this.handleBackAction())');
  });
});

describe('pause layout: exact settings content height', () => {
  test('an explicit settingsContentHeight sizes the expanded card; collapsed ignores it', () => {
    const base = resolveLegacyPauseMenuLayout(390, 844, {});
    const collapsed = resolveLegacyPauseMenuLayout(390, 844, {}, { settingsContentHeight: 266 });
    expect(collapsed.naturalCardHeight).toBe(base.naturalCardHeight);
    const expanded = resolveLegacyPauseMenuLayout(390, 844, {}, { settingsContentHeight: 266, settingsExpanded: true });
    expect(expanded.settingsSectionHeight).toBe(expanded.actionGap + 266);
    expect(expanded.naturalCardHeight).toBe(base.naturalCardHeight + expanded.actionGap + 266);
    expect(expanded.fits).toBe(true);
    const tiny = resolveLegacyPauseMenuLayout(320, 568, {}, { settingsContentHeight: 266, settingsExpanded: true });
    expect(tiny.scrollable).toBe(true);
  });
});
