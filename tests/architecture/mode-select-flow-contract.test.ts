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
const layerSource = read('src/legacy-runtime/legacyModeSelectLayer.ts');

/** The scene code the sheet adds: from requestLegacyPlayStart up to (not including) buildLeaderboardOverlay. */
const sheetRegion = (): string => {
  const start = menuScene.indexOf('private requestLegacyPlayStart(): void {');
  const end = menuScene.indexOf('private buildLeaderboardOverlay(): void {');
  expect(start).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(start);
  return menuScene.slice(start, end);
};

describe('mode-select flow contract (MAZER-MODE-002, look D)', () => {
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
    const body = region.slice(start, region.indexOf('private startModeSelectFallback('));
    expect(body).toContain('if (!item.playable || this.isModeSelectInputGuarded()) {');
    expect(body.indexOf('this.closeOverlay();')).toBeGreaterThan(0);
    expect(body.indexOf("{ type: 'START_RUN' }")).toBeGreaterThan(body.indexOf('this.closeOverlay();'));
  });

  test('Back to menu uses the standard back action (the sheet routes through the overlay router, not its own state)', () => {
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

  test('input guard: opening and closing the selector start a window in which Play, the rail and Back are ignored', () => {
    const region = sheetRegion();
    expect(menuScene).toContain('private modeSelectInputGuardStartedAt: number | null = null;');
    // open: the hook ignores Play inside the window and stamps the window when it opens
    expect(region).toContain('if (this.isModeSelectInputGuarded()) {\n        return;\n      }\n      this.modeSelectInputGuardStartedAt = this.time.now;');
    // the rail's Play (button, centred-card tap, Enter on the rail), startModeSelectItem, scene Enter and Back all check it
    // measured from the press (pressAgeMs from the rail): a DOM tap lands on release, the old canvas path on pointerdown
    expect(region).toContain('onPlay: (index, pressAgeMs) => {\n        if (this.isModeSelectInputGuarded(pressAgeMs)) {\n          return;\n        }\n        this.modeSelectIndex = index;\n        this.startModeSelectItem(items[index]!);');
    expect(region).toContain('onBack: (pressAgeMs) => {\n        if (!this.isModeSelectInputGuarded(pressAgeMs)) {\n          this.handleBackAction();');
    expect(region).toContain('return isLegacyModeSelectInputGuarded(this.time.now, this.modeSelectInputGuardStartedAt, pressAgeMs);');
    // close: closeOverlay stamps the window before the sheet state is cleared
    const close = menuScene.slice(menuScene.indexOf('private closeOverlay(): void {'));
    expect(close.slice(0, 700)).toContain("if (this.overlay === 'mode-select') {\n      this.modeSelectInputGuardStartedAt = this.time.now;");
  });

  test('a held Enter / Space never plays: the rail drops key auto-repeat before any play or native button meaning', () => {
    const rail = read('src/ui/modeSelect/modeSelectRail.ts');
    const handleKey = rail.slice(rail.indexOf('const handleKey = (event: KeyboardEvent): boolean => {'));
    const held = handleKey.indexOf('if (isModeSelectHeldActivationKey(event.key, event.repeat)) {\n      event.preventDefault();\n      return false;');
    expect(held).toBeGreaterThan(0);
    expect(held).toBeLessThan(handleKey.indexOf("(target === play || target === back)) return false;"));
    expect(held).toBeLessThan(handleKey.indexOf("case 'play':"));
    // the scene's own key handler already drops repeats before its Enter branches
    const sceneRepeat = menuScene.indexOf('    if (event.repeat) {\n      return false;\n    }');
    expect(sceneRepeat).toBeGreaterThan(0);
    expect(sceneRepeat).toBeLessThan(menuScene.indexOf("if (event.key === 'Enter' && this.mode === 'menu' && this.overlay === 'mode-select') {"));
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
    const imports = planSource.match(/^import [\s\S]*? from '.*';$/gm) ?? [];
    expect(imports).toEqual([
      "import { LEGACY_DEFAULT_GAME_MODE_ID, LEGACY_GAME_MODES, type LegacyGameModeId } from './legacyGameModes';"
    ]);
    expect(planSource).not.toMatch(/localStorage|sessionStorage|window\.|document\.|fetch\(/);
  });

  test('the selector DOM is one lazily loaded layer: the scene wires the controller, never the DOM module', () => {
    // MenuScene imports the controller only; the controller reaches the DOM mount through a dynamic import.
    expect(menuScene).toContain("import { createLegacyModeSelectLayer } from '../legacy-runtime/legacyModeSelectLayer';");
    expect(menuScene).not.toContain('ui/modeSelect/');
    expect(layerSource).toContain("import('../ui/modeSelect/modeSelectMount')");
    expect(layerSource).not.toMatch(/^import (?!type )[^;]*? from '\.\.\/ui\//m);
    expect(layerSource).not.toMatch(/from 'phaser'|localStorage|sessionStorage|\bfetch\(/);
    // rebuilds keep it in step with the overlay (exactly one), close takes it down, shutdown destroys it
    expect(menuScene).toContain("this.modeSelectLayer.syncVisibility(this.overlay === 'mode-select' && this.mode === 'menu');");
    expect(menuScene).toContain('this.modeSelectLayer.hide();');
    expect(menuScene).toContain('this.modeSelectLayer.destroy()');
    // the canvas no longer paints mode cards or owns hit zones for them
    expect(menuScene).not.toContain('createModeSelectHitZone');
    expect(menuScene).not.toContain('paintModeSelect');
  });

  test('Endless keeps its legacy storage keys: the sheet adds no key and renames none', () => {
    expect(LEGACY_PROGRESSION_STORAGE_KEY).toBe('mazer.progression.v1');
    expect(LEGACY_ENDLESS_CHECKPOINT_STORAGE_KEY).toBe('mazer.endless-checkpoint.v1');
    expect(LEGACY_REMOTE_COMPLETION_OUTBOX_STORAGE_KEY).toBe('mazer.remote-completion-outbox.v1');
    expect(LEGACY_REMOTE_ACCOUNT_SYNC_STORAGE_KEY).toBe('mazer.remote-account-sync.v1');
    expect(planSource).not.toMatch(/mazer\.[a-z-]+\.v\d/);
  });

  test('the registry is unchanged: Endless is the only mode; Hazards is shown locked but never registered or startable', () => {
    expect(LEGACY_GAME_MODES.map((mode) => mode.id)).toEqual(['endless']);
    expect(LEGACY_RESERVED_GAME_MODE_SLOTS.map((slot) => slot.slot)).toEqual(['hazards']);
    expect(isLegacyGameModeId('hazards')).toBe(false);
    // Look D shows Hazards, Sprint and Daily as locked "Coming soon" names (owner pick 2026-11-25). The plan names it
    // only in the locked list; the scene never names it, and the ?lab=hazards flag is not read here.
    expect(planSource).toMatch(/id: 'hazards',[^}]*playable: false/);
    expect(planSource).not.toMatch(/URLSearchParams|location\.|isLegacyHazard|legacyHazardLab/);
    expect(sheetRegion().toLowerCase()).not.toContain('hazards');
  });
});
