import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { LEGACY_ENDLESS_CHECKPOINT_STORAGE_KEY } from '../../src/legacy-runtime/legacyEndlessCheckpointStore';
import { LEGACY_GAME_MODES, LEGACY_RESERVED_GAME_MODE_SLOTS, isLegacyGameModeId } from '../../src/legacy-runtime/legacyGameModes';
import { LEGACY_PROGRESSION_STORAGE_KEY } from '../../src/legacy-runtime/legacyProgression';
import {
  LEGACY_REMOTE_ACCOUNT_SYNC_STORAGE_KEY,
  LEGACY_REMOTE_COMPLETION_OUTBOX_STORAGE_KEY
} from '../../src/legacy-runtime/legacyRemoteProgression';

const read = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8').replace(/\r\n/g, '\n');
const menuScene = read('src/scenes/MenuScene.ts');
const planSource = read('src/legacy-runtime/legacyModeSelectPlan.ts');

/** The scene code the sheet adds: from requestLegacyPlayStart up to (not including) buildLeaderboardOverlay. */
const sheetRegion = (): string => {
  const start = menuScene.indexOf('private requestLegacyPlayStart(): void {');
  const end = menuScene.indexOf('private buildLeaderboardOverlay(): void {');
  expect(start).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(start);
  return menuScene.slice(start, end);
};

describe('mode-select flow contract (MAZER-MODE-002)', () => {
  test('both Play entry points (tap anywhere and the Play button) go through the one mode-select hook', () => {
    // tap anywhere, the Play button and keyboard Enter on the menu.
    expect(menuScene.match(/this\.requestLegacyPlayStart\(\)/g)).toHaveLength(3);
    // The only remaining direct START_RUN dispatch in the sheet region is the hook's in-run fallback and the item start.
    const direct = menuScene.match(/dispatchUiBridgeCommand\(\{ type: 'START_RUN' \}, \(\) => this\.startPlayMode\(\)\)/g) ?? [];
    expect(direct).toHaveLength(2);
    expect(sheetRegion()).toContain("this.modeSelectInputGuardStartedAt = this.time.now;\n      this.openOverlay('mode-select');");
  });

  test('choosing Endless closes the sheet and starts the run through the existing START_RUN path', () => {
    const region = sheetRegion();
    const start = region.indexOf('private startModeSelectItem(item: LegacyModeSelectItem): void {');
    const body = region.slice(start, region.indexOf('private createModeSelectHitZone('));
    expect(body).toContain('if (!item.playable || this.isModeSelectInputGuarded()) {');
    expect(body.indexOf('this.closeOverlay();')).toBeGreaterThan(0);
    expect(body.indexOf("{ type: 'START_RUN' }")).toBeGreaterThan(body.indexOf('this.closeOverlay();'));
  });

  test('Back to Menu uses the standard back action (the sheet routes through the overlay router, not its own state)', () => {
    expect(sheetRegion()).toContain('this.handleBackAction();');
    expect(read('src/legacy-runtime/legacyOverlayRouting.ts')).toContain("'mode-select'");
  });

  test('keyboard: Enter on the menu opens the sheet; Enter in the sheet picks the playable entry; Escape closes it', () => {
    // Enter on the menu is the keyboard Play button (no direct startPlayMode call in that branch).
    const enterMenu = menuScene.indexOf("if (event.key === 'Enter' && this.mode === 'menu' && this.overlay === 'none') {");
    expect(enterMenu).toBeGreaterThan(0);
    const enterMenuBody = menuScene.slice(enterMenu, menuScene.indexOf("if (event.key === 'Enter' && this.mode === 'menu' && this.overlay === 'mode-select') {"));
    expect(enterMenuBody).toContain('this.requestLegacyPlayStart();');
    expect(enterMenuBody).not.toContain('this.startPlayMode()');
    // Enter in the sheet goes through the pure keyboard choice, then the same item start as a tap.
    const press = menuScene.slice(menuScene.indexOf('private pressModeSelectEnter(): void {'));
    expect(press.slice(0, press.indexOf('private startModeSelectItem(')))
      .toContain('resolveLegacyModeSelectKeyboardChoice(items, this.modeSelectIndex)');
    expect(menuScene).toContain("if (event.key === 'Enter' && this.mode === 'menu' && this.overlay === 'mode-select') {\n      event.preventDefault();\n      this.pressModeSelectEnter();");
    // Escape reaches handleBackAction for every overlay, including the sheet.
    expect(menuScene).toContain("if (event.key === 'Escape') {\n      event.preventDefault();\n      // The open menu dropdown is the topmost surface: Esc closes it before anything else.\n      if (!this.menuDropdown.close()) {\n        this.handleBackAction();");
  });

  test('input guard: opening and closing the sheet start a window in which Play, cards and Back are ignored', () => {
    const region = sheetRegion();
    expect(menuScene).toContain('private modeSelectInputGuardStartedAt: number | null = null;');
    // open: the hook ignores Play inside the window and stamps the window when it opens
    expect(region).toContain('if (this.isModeSelectInputGuarded()) {\n        return;\n      }\n      this.modeSelectInputGuardStartedAt = this.time.now;');
    // cards, the Play button path (startModeSelectItem), Enter, and Back all check the guard
    expect(region).toContain('if (this.isModeSelectInputGuarded()) {\n          return;\n        }\n        this.modeSelectIndex = entry.index;');
    expect(region).toContain('if (!this.isModeSelectInputGuarded()) {\n          this.handleBackAction();');
    // close: closeOverlay stamps the window before the sheet state is cleared
    const close = menuScene.slice(menuScene.indexOf('private closeOverlay(): void {'));
    expect(close.slice(0, 700)).toContain("if (this.overlay === 'mode-select') {\n      this.modeSelectInputGuardStartedAt = this.time.now;");
  });

  test('the sheet code reads progression but never writes storage, progression, the outbox, the network or a leaderboard', () => {
    const region = sheetRegion();
    for (const forbidden of [
      'localStorage',
      'sessionStorage',
      'fetch(',
      'supabase',
      'saveProgression',
      'persistProgression',
      'recordLevel',
      'outbox',
      'Outbox',
      'checkpoint',
      'Checkpoint',
      'leaderboard'
    ]) {
      // addLegacyLeaderboardText is the shared text helper, not a leaderboard call.
      const scrubbed = region.replace(/addLegacyLeaderboardText/g, 'addText');
      expect(scrubbed, `sheet region must not contain ${forbidden}`).not.toContain(forbidden);
    }
    expect(region).toContain('this.progressionState.tracks.player');
  });

  test('the plan module is pure: no Phaser, DOM, storage, network or progression imports', () => {
    const imports = planSource.match(/^import .* from '.*';$/gm) ?? [];
    expect(imports.sort()).toEqual([
      "import { LEGACY_GAME_MODES, type LegacyGameModeId } from './legacyGameModes';",
      "import { LEGACY_SETTINGS_SIZES, type LegacySettingsRect } from './legacySettingsSheetPlan';",
      "import { LEGACY_UI_COMPACT_BREAKPOINT, resolveLegacyOverlayPanelLayout } from './legacyUiStandards';"
    ].sort());
    expect(planSource).not.toMatch(/localStorage|sessionStorage|window\.|document\.|fetch\(/);
  });

  test('Endless keeps its legacy storage keys: the sheet adds no key and renames none', () => {
    expect(LEGACY_PROGRESSION_STORAGE_KEY).toBe('mazer.progression.v1');
    expect(LEGACY_ENDLESS_CHECKPOINT_STORAGE_KEY).toBe('mazer.endless-checkpoint.v1');
    expect(LEGACY_REMOTE_COMPLETION_OUTBOX_STORAGE_KEY).toBe('mazer.remote-completion-outbox.v1');
    expect(LEGACY_REMOTE_ACCOUNT_SYNC_STORAGE_KEY).toBe('mazer.remote-account-sync.v1');
    expect(planSource).not.toMatch(/mazer\.[a-z-]+\.v\d/);
  });

  test('the registry is unchanged: Endless is the only mode, Hazards is reserved and unreachable', () => {
    expect(LEGACY_GAME_MODES.map((mode) => mode.id)).toEqual(['endless']);
    expect(LEGACY_RESERVED_GAME_MODE_SLOTS.map((slot) => slot.slot)).toEqual(['hazards']);
    expect(isLegacyGameModeId('hazards')).toBe(false);
    expect(planSource.toLowerCase()).not.toContain('hazards');
    expect(sheetRegion().toLowerCase()).not.toContain('hazards');
  });
});
