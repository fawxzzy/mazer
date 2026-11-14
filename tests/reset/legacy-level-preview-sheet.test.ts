import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  LEGACY_LEVEL_PREVIEW_CHECKPOINTS,
  LEGACY_LEVEL_PREVIEW_MAX_LEVEL
} from '../../src/legacy-runtime/legacyLevelPreview';
import {
  LEGACY_SETTINGS_PLAN_VIEWPORTS,
  buildLegacySettingsSheetModel,
  buildLegacySettingsSheetPlan,
  isLegacySettingsItemFullyVisible,
  type LegacySettingsLevelPreviewOptions
} from '../../src/legacy-runtime/legacySettingsSheetPlan';
import { LEGACY_UI_MIN_TOUCH_TARGET } from '../../src/legacy-runtime/legacyUiStandards';

const preview = (level: number): LegacySettingsLevelPreviewOptions => ({
  checkpoints: LEGACY_LEVEL_PREVIEW_CHECKPOINTS,
  level,
  maxLevel: LEGACY_LEVEL_PREVIEW_MAX_LEVEL,
  minLevel: 1
});

describe('settings sheet: Level Preview section (pause only, opt-in)', () => {
  test('the default pause and menu sheets are unchanged without the option', () => {
    const pause = buildLegacySettingsSheetPlan({ context: 'pause', height: 844, settingsExpanded: true, width: 390 });
    expect(pause.items.map((item) => item.model.id)).toEqual([
      'resume', 'settings-disclosure', 'how-to-play', 'reduce-motion', 'haptics', 'quit-to-menu'
    ]);
    const withIgnoredOption = buildLegacySettingsSheetPlan({
      context: 'menu', height: 844, levelPreview: preview(100), signedIn: true, width: 390
    });
    expect(withIgnoredOption.items.some((item) => String(item.model.id).startsWith('preview'))).toBe(false);
  });

  test('collapsed: Resume, preview heading, Next, Previous, Jump disclosure, Settings, Quit', () => {
    const plan = buildLegacySettingsSheetPlan({
      context: 'pause', height: 844, levelPreview: preview(100), width: 390
    });
    expect(plan.items.map((item) => item.model.id)).toEqual([
      'resume', 'account-heading', 'preview-next', 'preview-prev', 'preview-jump-disclosure',
      'settings-disclosure', 'quit-to-menu'
    ]);
    const labels = plan.items.map((item) => item.model.label);
    expect(labels).toContain('Level preview L100');
    expect(labels).toContain('Next level (L101)');
    expect(labels).toContain('Previous level (L99)');
    // Quit to Menu stays last and is the way out.
    expect(plan.items[plan.items.length - 1]?.model.id).toBe('quit-to-menu');
  });

  test('level 1 has no Previous; the maximum level has no further Next', () => {
    const first = buildLegacySettingsSheetModel('pause', { levelPreview: preview(1) });
    const ids = first.sections.flatMap((section) => section.rows.map((row) => row.id));
    expect(ids).not.toContain('preview-prev');
    const last = buildLegacySettingsSheetModel('pause', { levelPreview: preview(LEGACY_LEVEL_PREVIEW_MAX_LEVEL) });
    const next = last.sections.flatMap((section) => section.rows).find((row) => row.id === 'preview-next');
    expect(next?.command).toEqual({ level: LEGACY_LEVEL_PREVIEW_MAX_LEVEL, type: 'PREVIEW_JUMP' });
  });

  test('expanded jump list has one row per checkpoint, each jumping to its level', () => {
    const plan = buildLegacySettingsSheetPlan({
      context: 'pause', height: 844, levelPreview: preview(100), previewLevelsExpanded: true, width: 390
    });
    expect(plan.previewLevelsExpanded).toBe(true);
    const jumps = plan.items.filter((item) => String(item.model.id).startsWith('preview-jump-') && item.model.kind === 'action');
    expect(jumps.map((item) => item.model.command)).toEqual(
      LEGACY_LEVEL_PREVIEW_CHECKPOINTS.map((level) => ({ level, type: 'PREVIEW_JUMP' }))
    );
    expect(jumps.map((item) => item.model.label)).toEqual(LEGACY_LEVEL_PREVIEW_CHECKPOINTS.map((level) => `Level ${level}`));
  });

  test.each(LEGACY_SETTINGS_PLAN_VIEWPORTS.map((viewport) => [`${viewport.width}x${viewport.height}`, viewport] as const))(
    'every preview row is a 44px+ target and reachable (visible or scrollable) at %s',
    (_name, viewport) => {
      const plan = buildLegacySettingsSheetPlan({
        context: 'pause', height: viewport.height, levelPreview: preview(100), previewLevelsExpanded: true, width: viewport.width
      });
      for (const item of plan.items.filter((entry) => entry.interactive)) {
        expect(item.rect.height).toBeGreaterThanOrEqual(LEGACY_UI_MIN_TOUCH_TARGET);
        expect(item.rect.width).toBeGreaterThanOrEqual(LEGACY_UI_MIN_TOUCH_TARGET);
      }
      if (plan.scrollable) {
        for (const item of plan.items) {
          // Some offset in [0, maxScrollOffset] shows every row fully.
          const reachable = Array.from({ length: plan.maxScrollOffset + 1 }, (_, offset) => offset)
            .some((offset) => isLegacySettingsItemFullyVisible(plan, item, offset));
          expect(reachable, String(item.model.id)).toBe(true);
        }
      }
    }
  );
});

const scene = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8').replace(/\r\n/g, '\n');
const method = (signature: string): string => {
  const start = scene.indexOf(signature);
  expect(start, signature).toBeGreaterThanOrEqual(0);
  return scene.slice(start, scene.indexOf('\n  }\n', start));
};

describe('MenuScene wiring: Level Preview stays sandboxed', () => {
  test('the sandbox storage replaces window.localStorage before anything else', () => {
    const resolver = method('private resolveBrowserLocalStorage()');
    expect(resolver.indexOf('this.levelPreviewStorage')).toBeGreaterThan(-1);
    expect(resolver.indexOf('this.levelPreviewStorage')).toBeLessThan(resolver.indexOf('window.localStorage'));
    // The scene never reaches window.localStorage any other way.
    expect(scene.match(/window\.localStorage/g)).toHaveLength(1);
    expect(scene).not.toContain('window.sessionStorage');
  });

  test('preview progression is seeded in memory and never read from storage', () => {
    const load = method('private loadPersistedLegacyProgressionState(): void');
    expect(load.indexOf('createLegacyLevelPreviewProgressionState')).toBeGreaterThan(-1);
    expect(load.indexOf('createLegacyLevelPreviewProgressionState')).toBeLessThan(load.indexOf('readLegacyProgressionState'));
  });

  test('the session is the remote-ineligible preview identity and the auth client is never initialised', () => {
    const fixture = method('private resolveLegacyRuntimeAuthFixtureSnapshot()');
    expect(fixture.indexOf('createLegacyLevelPreviewAuthSnapshot')).toBeGreaterThan(-1);
    const init = method('private async initializeLegacyAuth(): Promise<void>');
    expect(init.indexOf('resolveLegacyRuntimeAuthFixtureSnapshot')).toBeLessThan(init.indexOf('subscribeLegacyAuthState'));
    expect(init.indexOf('return;')).toBeLessThan(init.indexOf('subscribeLegacyAuthState'));
  });

  test('every way back to the menu leaves preview instead of entering a sandbox menu', () => {
    const enter = method('private enterMenuMode(): void');
    expect(enter.startsWith('private enterMenuMode(): void {\n    if (this.levelPreviewLevel !== null) {')).toBe(true);
    expect(enter.slice(0, 400)).toContain('this.exitLegacyLevelPreview()');
  });

  test('jumping replaces the sandbox progression and restarts play; nothing is sent anywhere', () => {
    const jump = method('private jumpLegacyLevelPreview(level: number): void');
    expect(jump).toContain('createLegacyLevelPreviewProgressionState');
    expect(jump).toContain('this.resolveLegacyProgressionStorage()');
    expect(jump).toContain('this.startPlayMode()');
    expect(jump).not.toContain('writeLegacyRemote');
    const commands = method('private runLegacySettingsCommand(command: LegacySettingsCommand): void');
    expect(commands).toContain("case 'PREVIEW_JUMP':");
    expect(commands).toContain("case 'TOGGLE_PREVIEW_LEVELS':");
  });

  test('preview only changes the pause sheet when preview is active', () => {
    const builder = method('private buildLegacySettingsSheetOverlay(context: LegacySettingsContext): void');
    expect(builder).toContain("context === 'pause' && this.levelPreviewLevel !== null");
  });
});
