import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { LEGACY_BUTTON_MAP } from '../../src/legacy-runtime/legacyButtonKit';
import { buildLegacySettingsSheetPlan } from '../../src/legacy-runtime/legacySettingsSheetPlan';

// MAZER-UI-099: the secondary screens (Settings, Guide, Leaderboard, gate, level preview, reset confirm) share one
// button hierarchy: one solid-mint primary per surface, outlined secondary beside it, box-less ghost for quiet rows.

const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8').replace(/\r\n/g, '\n');

describe('screens consistency (MAZER-UI-099)', () => {
  test('every kit-drawn sheet button is mapped to a variant', () => {
    const ids = LEGACY_BUTTON_MAP.map((entry) => entry.id);
    for (const id of ['sheet-exit', 'guide-got-it', 'leaderboard-retry', 'leaderboard-back', 'preview-jump-row', 'auth-submit']) {
      expect(ids).toContain(id);
    }
    const bySurface = (surface: string): string[] => LEGACY_BUTTON_MAP.filter((entry) => entry.surface === surface && entry.variant === 'primary').map((entry) => entry.id);
    expect(bySurface('guide')).toEqual(['guide-got-it']);
  });

  test('the gate Sign in is the shared kit primary, not a separate pale pill', () => {
    expect(menuSceneSource).toContain("const unifiedAuthPrimary = this.overlay === 'auth' && tone === 'primary';");
    expect(menuSceneSource).toContain("const unifiedAuthDockButton = this.overlay === 'auth' && tone === 'danger';");
  });

  test('a Leaderboard state action (Retry, Sign in) takes the primary slot and Back to Menu steps down to secondary', () => {
    expect(menuSceneSource).toContain("plan.stateBlock?.action != null ? 'secondary' : 'primary'");
  });

  test('reset confirmation: Cancel is secondary beside the danger confirm', () => {
    expect(menuSceneSource).toContain("addButton(cancelButton.label, 'secondary', () => this.handleBackAction(), state.phase === 'working');");
  });

  test('tertiary settings rows draw as the box-less ghost tone', () => {
    expect(menuSceneSource).toContain("model.emphasis === 'tertiary'");
    expect(menuSceneSource).toContain("? 'ghost'");
  });

  test('sheet titles use the brand mint, not a stray green', () => {
    expect(menuSceneSource).not.toContain("'#6bc96f'");
    expect(menuSceneSource).toContain("toCyberArcadeCssHex(cyberArcadeMaterial.rail.mint)");
  });

  test('the level preview sheet has one primary row (Resume); the current checkpoint is the outlined secondary', () => {
    const plan = buildLegacySettingsSheetPlan({
      context: 'pause', height: 844, levelPreview: { checkpoints: [1, 12, 20], level: 12, maxLevel: 999, minLevel: 1 }, previewLevelsExpanded: true, width: 390
    });
    const emphases = plan.items.filter((item) => item.model.kind === 'action').map((item) => `${String(item.model.id)}:${String(item.model.emphasis)}`);
    expect(emphases.filter((entry) => entry.endsWith(':primary'))).toEqual(['resume:primary']);
    expect(emphases).toContain('preview-jump-12:secondary');
    expect(emphases).toContain('preview-jump-1:tertiary');
  });
});
