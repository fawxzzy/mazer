import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { resolveLegacyOverlayBackAction } from '../../src/legacy-runtime/legacyOverlayRouting';

const scene = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8').replace(/\r\n/g, '\n');
const method = (signature: string): string => {
  const start = scene.indexOf(signature);
  expect(start, signature).toBeGreaterThanOrEqual(0);
  return scene.slice(start, scene.indexOf('\n  }\n', start));
};

// Wiring lane (2026-11-06): menu Settings and in-game Pause Settings are ONE painter; the Guide is a
// sub-view of that overlay; Reset progress is server-first and returns to the sheet it was opened from.
describe('MenuScene wiring: one shared Settings sheet', () => {
  test('menu and pause call the same builder with a context flag, and no second layout exists', () => {
    expect(method('private buildOptionsOverlay(): void')).toContain("this.buildLegacySettingsSheetOverlay('menu')");
    expect(method('private buildPauseOverlay(): void')).toContain("this.buildLegacySettingsSheetOverlay('pause')");
    expect(scene).not.toContain('createFeatureControlRows');
    expect(scene).not.toContain('resolveFeatureControlRowsContentHeight');
    expect(scene).not.toContain('resolveLegacyPauseMenuLayout');
    expect(scene).not.toContain('resolveLegacyOverlayContentFlowLayout');
    expect(scene.match(/private createToggleSwitchRow\(/g)).toHaveLength(1);
    expect(scene.match(/buildLegacySettingsSheetPlan\(/g)).toHaveLength(1);
  });

  test('every plan row kind is painted, and every command maps to a handler', () => {
    const items = method('private paintLegacySettingsItem(');
    for (const kind of ['heading', 'action', 'disclosure', 'nav', 'slider', 'toggle']) {
      expect(items).toContain(`case '${kind}':`);
    }
    const commands = method('private runLegacySettingsCommand(command: LegacySettingsCommand): void');
    for (const command of ['RESUME_RUN', 'RETURN_HOME', 'CLOSE_OVERLAY', 'TOGGLE_SETTINGS_GROUP', 'OPEN_GUIDE', 'BEGIN_RESET_PROGRESS', 'SIGN_OUT']) {
      expect(commands).toContain(`case '${command}':`);
    }
    expect(commands).toContain("this.openOverlay('confirm-progression-reset');");
  });

  test('the Guide is a sub-view: it never changes this.overlay, so Pause keeps holding the run', () => {
    const open = method('private runLegacySettingsCommand(command: LegacySettingsCommand): void');
    expect(open).toContain('this.settingsGuideOpen = true;');
    const guide = method('private buildLegacyGuideSheetOverlay(context: LegacySettingsContext): void');
    expect(guide).not.toContain('this.overlay =');
    expect(guide).not.toContain('openOverlay(');
    // back / Escape return to Settings first; any other overlay change clears the flag.
    const back = method('private handleBackAction(): void');
    expect(back).toContain("if (this.settingsGuideOpen && (this.overlay === 'options' || this.overlay === 'pause')) {");
    expect(method('private openOverlay(kind: OverlayKind): void')).toContain('this.settingsGuideOpen = false;');
    expect(method('private closeOverlay(): void')).toContain('this.settingsGuideOpen = false;');
    expect(scene).not.toMatch(/overlay: 'guide'|openOverlay\('guide'\)/);
  });

  test('the guide is built from the content module, and the Got it footer closes it', () => {
    const guide = method('private buildLegacyGuideSheetOverlay(context: LegacySettingsContext): void');
    expect(guide).toContain('buildLegacyGuideSheetModel(context,');
    expect(guide).toContain('model.rows.forEach(');
    expect(guide).toContain('model.closeLabel,');
    expect(guide).toContain('() => this.closeLegacyGuideSheet(),\n      \'primary\'');
    // no guide copy is hard-coded in the scene: it lives in legacyGuideContent.ts only.
    expect(guide).not.toMatch(/Reach the star|green block|Touch and hold|glowing line|Some mazes wrap|Each cleared maze/);
  });
});

describe('MenuScene wiring: Reset progress', () => {
  test('confirm returns to the Settings sheet it was opened from (options), not to pause or auth', () => {
    const open = method('private openOverlay(kind: OverlayKind): void');
    expect(open).toContain("previousOverlay === 'pause' || previousOverlay === 'auth' || previousOverlay === 'options'");
    expect(open).toContain("if (kind === 'confirm-progression-reset') {\n      this.requestLegacyProgressionReset();");
    const close = method('private closeOverlay(): void');
    expect(close).toContain("(this.overlay === 'auth' || this.overlay === 'confirm-progression-reset')");
    expect(resolveLegacyOverlayBackAction({ mode: 'menu', overlay: 'confirm-progression-reset', overlayReturn: 'options' }).kind).toBe('close-overlay');
  });

  test('Cancel, Back and Escape share one route; an in-flight server reset cannot be cancelled', () => {
    const back = method('private handleBackAction(): void');
    expect(back).toContain("if (this.progressionResetState.phase === 'working') {\n        return;");
    const confirm = method('private buildProgressionResetConfirmationOverlay(): void');
    expect(confirm).toContain("addButton(cancelButton.label, 'primary', () => this.handleBackAction(), state.phase === 'working');");
    expect(confirm).toContain('() => this.confirmLegacyProgressionReset(),');
  });

  test('the destructive button is gated by the reducer arm delay, and entry points share the request path', () => {
    const confirm = method('private confirmLegacyProgressionReset(): void');
    expect(confirm).toContain("reduceLegacyProgressionReset(this.progressionResetState, { nowMs: this.time.now, type: 'confirm' })");
    expect(confirm).toContain("if (next.phase !== 'working') {");
    const request = method('private requestLegacyProgressionReset(): void');
    expect(request).toContain("runActive: this.mode === 'play',");
    expect(request).toContain('LEGACY_PROGRESSION_RESET_ARM_DELAY_MS');
  });

  test('the bridge RESET_PROGRESS adapter and the local fallback both run the async server-first reset', () => {
    expect(scene).toContain("resetProgress: (): boolean => { void this.resetLegacyPlayerProgression(); return true; },");
    expect(method('private confirmLegacyProgressionReset(): void')).toContain('void this.resetLegacyPlayerProgression();');
  });

  test('reset clears the in-memory telemetry history and keeps device settings, auth and account untouched', () => {
    const flow = scene.slice(
      scene.indexOf('private async resetLegacyPlayerProgression(): Promise<boolean>'),
      scene.indexOf('private applyOverlayToggleFieldChange(')
    );
    expect(flow).toContain('this.loadPersistedMazeCycleTelemetryHistory();');
    expect(flow).not.toMatch(/mazer\.game-toggles|mazer\.auth|writeLegacyGameToggleSettings|signOut|localStorage\.clear/);
  });
});
