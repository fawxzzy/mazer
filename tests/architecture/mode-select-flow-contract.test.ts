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
    expect(menuScene.match(/this\.requestLegacyPlayStart\(\)/g)).toHaveLength(2);
    // The only remaining direct START_RUN dispatch in the sheet region is the hook's in-run fallback and the item start.
    const direct = menuScene.match(/dispatchUiBridgeCommand\(\{ type: 'START_RUN' \}, \(\) => this\.startPlayMode\(\)\)/g) ?? [];
    expect(direct).toHaveLength(2);
    expect(sheetRegion()).toContain("if (this.mode === 'menu') {\n      this.openOverlay('mode-select');");
  });

  test('choosing Endless closes the sheet and starts the run through the existing START_RUN path', () => {
    const region = sheetRegion();
    const start = region.indexOf('private startModeSelectItem(item: LegacyModeSelectItem): void {');
    const body = region.slice(start, region.indexOf('private createModeSelectHitZone('));
    expect(body).toContain('if (!item.playable) {');
    expect(body.indexOf('this.closeOverlay();')).toBeGreaterThan(0);
    expect(body.indexOf("{ type: 'START_RUN' }")).toBeGreaterThan(body.indexOf('this.closeOverlay();'));
  });

  test('Back to Menu uses the standard back action (the sheet routes through the overlay router, not its own state)', () => {
    expect(sheetRegion()).toContain('() => this.handleBackAction(),');
    expect(read('src/legacy-runtime/legacyOverlayRouting.ts')).toContain("'mode-select'");
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
