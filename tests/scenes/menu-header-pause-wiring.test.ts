import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { resolveLegacyOverlayBackAction } from '../../src/legacy-runtime/legacyOverlayRouting';
import { buildLegacySettingsSheetModel, buildLegacySettingsSheetPlan } from '../../src/legacy-runtime/legacySettingsSheetPlan';
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

// Wiring lane (2026-11-06): Pause and the main-menu Settings are ONE sheet. buildPauseOverlay and
// buildOptionsOverlay are thin entries into buildLegacySettingsSheetOverlay, which paints
// buildLegacySettingsSheetPlan (legacySettingsSheetPlan.ts). The pause-specific expectations below
// therefore pin the shared painter plus the plan's pause model.
describe('MenuScene wiring: pause card', () => {
  const pause = methodSource('private buildPauseOverlay(): void');
  const sheet = methodSource('private buildLegacySettingsSheetOverlay(context: LegacySettingsContext): void');
  const commands = methodSource('private runLegacySettingsCommand(command: LegacySettingsCommand): void');
  const items = methodSource('private paintLegacySettingsItem(');
  const card = methodSource('private drawLegacySheetCard(card: LegacySettingsRect): void');

  test('keeps the overlay id "pause" and the QA/lifecycle hooks that depend on it', () => {
    expect(LEGACY_PAUSE_OVERLAY_ID).toBe('pause');
    expect(buildLegacyPauseMenuViewModel().overlayId).toBe('pause');
    expect(buildLegacySettingsSheetModel('pause').overlayId).toBe('pause');
    expect(scene).toContain("case 'pause':\n        this.buildPauseOverlay();");
    expect(pause).toContain("this.buildLegacySettingsSheetOverlay('pause')");
    expect(scene).toContain("this.overlay !== 'pause'");
    expect(scene).toContain("kind === 'pause'");
    expect(resolveLegacyOverlayBackAction({ mode: 'play', overlay: 'pause', overlayReturn: 'none' }).kind).toBe('close-overlay');
  });

  test('pause has exactly Resume / Settings / Quit to Menu and no Close pill; no account, reset or sign-out rows', () => {
    const model = buildLegacySettingsSheetModel('pause', { signedIn: true });
    const ids = model.sections.flatMap((section) => (
      section.collapsible ? [section.title as string] : section.rows.map((row) => row.label)
    ));
    expect(ids).toEqual(['Resume', 'Settings', 'Quit to Menu']);
    // Close pill removed (Zac, 2026-11-06): Resume is the exit, so the painter draws no separate close control.
    expect('close' in model).toBe(false);
    expect(items.match(/createLegacyAuthActionButton\(/g)).toHaveLength(1);
    expect(scene).not.toContain('createOverlayClosePill');
    expect(sheet).not.toContain('createOverlayBackChevronButton');
    // nothing else is a button: no restart/log out/bottom bar/old Guide dropdown.
    expect(`${sheet}${items}`).not.toMatch(/Restart|Log out|createLegacyBottomActionBar|createLegacyOptionsInfoSection/);
    const allRows = model.sections.flatMap((section) => section.rows.map((row) => row.id));
    expect(allRows).not.toContain('reset-progress');
    expect(allRows).not.toContain('sign-out');
  });

  test('has no profile / account icon', () => {
    for (const source of [pause, sheet, items, commands]) {
      expect(source).not.toContain('createLegacyMenuProfileButton');
      expect(source).not.toContain('createLegacyOverlayUsernameButton');
      expect(source).not.toContain('createLegacyOverlayHomeButton');
      expect(source).not.toContain('drawLegacyProfileIcon');
      expect(source).not.toContain("surface: 'account'");
      expect(source).not.toContain('openSharedAccountSurface');
    }
    expect(scene).not.toContain('private createLegacyOverlayUsernameButton(');
  });

  test('Resume and Quit use the existing bridge-then-lifecycle paths; Settings starts collapsed', () => {
    expect(commands).toContain("{ type: 'RESUME_RUN' }, () => this.applyLegacyPauseCommand('resume')");
    // The Quit dispatch moved into the two-step quit confirm (legacyQuitConfirm.ts, PR #409), so it is no longer inside
    // runLegacySettingsCommand: it must still use the bridge-then-lifecycle path somewhere in the scene.
    expect(scene).toContain("{ type: 'RETURN_HOME' }, () => this.applyLegacyPauseCommand('return-menu')");
    expect(scene).toContain('private pauseSettingsExpanded = false;');
    expect(scene).toContain("if (kind === 'pause') {\n      this.pauseSettingsExpanded = false;");
    // The Settings group is the same plan rows the main-menu sheet paints (no movement speed).
    expect(sheet).toContain('settingsExpanded: this.pauseSettingsExpanded,');
    expect(buildLegacySettingsSheetPlan({ context: 'pause', height: 844, width: 390 }).items.map((item) => item.model.id))
      .toEqual(['resume', 'settings-disclosure', 'quit-to-menu']);
  });

  test('uses existing tokens only (no new free hex colours) and 44 px minimum actions', () => {
    expect(`${sheet}${card}`).not.toMatch(/0x[0-9a-fA-F]{6}/);
    expect(`${sheet}${card}`).not.toMatch(/'#[0-9a-fA-F]{3,8}'/);
    expect(card).toContain('cyberArcadeMaterial.substrate.field');
    expect(card).toContain('LEGACY_CYBER_PANEL_STROKE');
    for (const [width, height, safeArea] of [
      [390, 844, {}],
      [320, 568, {}],
      [1280, 720, {}],
      [390, 844, { bottom: 34, top: 47 }]
    ] as const) {
      expect(resolveLegacyPauseMenuLayout(width, height, safeArea).actionHeight).toBeGreaterThanOrEqual(44);
      for (const context of ['menu', 'pause'] as const) {
        const plan = buildLegacySettingsSheetPlan({ context, height, safeArea, settingsExpanded: true, signedIn: true, width });
        for (const item of plan.items.filter((entry) => entry.interactive)) {
          expect(item.rect.height).toBeGreaterThanOrEqual(44);
        }
      }
    }
  });

  test('the Options sheet is the same painter, with no Close pill, a Back to Menu exit row, a scrim-tap close and no profile icon', () => {
    const options = methodSource('private buildOptionsOverlay(): void');
    expect(options).not.toContain('createLegacyOverlayUsernameButton');
    expect(options).not.toContain('semanticAction');
    expect(options).toContain("this.buildLegacySettingsSheetOverlay('menu')");
    expect(sheet).not.toContain('plan.close');
    // Back to Menu is painted by paintLegacySettingsItem like every other action row (its CLOSE_OVERLAY command runs
    // through the same handleBackAction as Escape); the scrim-close rect is the menu card only.
    expect(sheet).toContain("this.overlayScrimCloseBounds = context === 'menu'");
    const scrim = methodSource('private handleOverlayScrimPointerDown(pointer: Phaser.Input.Pointer, objectsUnderPointer: number): boolean');
    expect(scrim).toContain("this.overlay !== 'options'");
    expect(scrim).toContain('this.settingsGuideOpen');
    expect(scrim).toContain('objectsUnderPointer > 0');
    expect(scrim).toContain('this.handleBackAction();');
    expect(scene).toContain('this.handleOverlayScrimPointerDown(pointer, currentlyOver.length)');
    expect(buildLegacySettingsSheetPlan({ context: 'menu', height: 844, signedIn: true, width: 390 }).items[0]?.model)
      .toMatchObject({ command: { type: 'CLOSE_OVERLAY' }, emphasis: 'primary', id: 'back-to-menu', label: 'Back to Menu' });
    expect(commands).toContain("case 'CLOSE_OVERLAY':\n        this.handleBackAction();");
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
