import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { UI_COMMAND_TYPES } from '../../src/state/uiCommands';
import { resolveLegacyPauseCommand } from '../../src/legacy-runtime/legacyPauseLifecycle';
import {
  LEGACY_PAUSE_ACTIONS,
  LEGACY_PAUSE_ACTION_COMMANDS,
  LEGACY_PAUSE_OVERLAY_ID,
  LEGACY_PAUSE_TITLE,
  buildLegacyPauseMenuViewModel,
  resolveLegacyPauseActionCommand,
  resolveLegacyPauseMenuLayout
} from '../../src/legacy-runtime/legacyPauseMenuView';

const read = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8');
const START = { x: 3, y: 4 };

describe('legacy pause menu view: model', () => {
  const model = buildLegacyPauseMenuViewModel();

  test('title and action order', () => {
    expect(model.title).toBe('Paused');
    expect(LEGACY_PAUSE_TITLE).toBe('Paused');
    expect(model.actions.map((action) => action.id)).toEqual(['resume', 'settings', 'quit-to-menu']);
    expect(model.actions.map((action) => action.label)).toEqual(['Resume', 'Settings', 'Quit to Menu']);
  });

  test('keeps the overlay id literal that holdLegacyPlayMazeLifecycleDuringPause depends on', () => {
    expect(LEGACY_PAUSE_OVERLAY_ID).toBe('pause');
    expect(model.overlayId).toBe('pause');
    const scene = read('src/scenes/MenuScene.ts');
    expect(scene).toContain("this.overlay !== 'pause'");
    expect(read('src/legacy-runtime/legacyOverlayRouting.ts')).toContain("'pause'");
  });

  test('has no restart/reset/account/profile action', () => {
    const forbidden = /restart|reset|account|profile|log ?out/i;
    for (const action of model.actions) {
      expect(`${action.id} ${action.label}`).not.toMatch(forbidden);
      expect(action.command).not.toBe('reset-player');
      expect(action.command).not.toBe('reset-progression');
    }
    expect(model.excludes).toEqual(['restart', 'reset-player', 'reset-progression', 'account', 'profile']);
  });

  test('Settings only describes a collapsed-by-default toggle section', () => {
    const settings = model.actions.find((action) => action.id === 'settings');
    expect(settings?.togglesSection).toBe(true);
    expect(settings?.command).toBeNull();
    expect(settings?.bridgeCommand).toBeNull();
    expect(model.settingsSection).toEqual({
      collapsedByDefault: true,
      id: 'pause-settings',
      includeMovementSpeed: false,
      title: 'Settings',
      toggleRowSource: 'feature-control-rows'
    });
  });

  test('Quit to Menu needs no confirmation (open owner question recorded in the spec)', () => {
    expect(LEGACY_PAUSE_ACTIONS.every((action) => action.requiresConfirmation === false)).toBe(true);
  });
});

describe('legacy pause menu view: command mapping', () => {
  test('Resume -> RESUME_RUN / resume; Quit to Menu -> RETURN_HOME / return-menu', () => {
    const byId = Object.fromEntries(LEGACY_PAUSE_ACTIONS.map((action) => [action.id, action]));
    expect(byId.resume?.command).toBe('resume');
    expect(byId.resume?.bridgeCommand).toEqual({ type: 'RESUME_RUN' });
    expect(byId['quit-to-menu']?.command).toBe('return-menu');
    expect(byId['quit-to-menu']?.bridgeCommand).toEqual({ type: 'RETURN_HOME' });
  });

  test('every mapped command is accepted by the lifecycle resolver with the expected effect', () => {
    for (const action of LEGACY_PAUSE_ACTIONS) {
      if (action.command === null) {
        continue;
      }
      const result = resolveLegacyPauseCommand(action.command, START);
      if (action.id === 'resume') {
        expect(result).toEqual({ closesOverlay: true, enterMenu: false, nextPlayer: null, nextTrail: null });
      } else {
        expect(result).toEqual({ closesOverlay: false, enterMenu: true, nextPlayer: null, nextTrail: null });
      }
      expect(result.nextPlayer).toBeNull();
    }
    expect(LEGACY_PAUSE_ACTIONS.filter((action) => action.command !== null)).toHaveLength(2);
  });

  test('the action->command table matches the actions and the resolver helper', () => {
    expect(LEGACY_PAUSE_ACTION_COMMANDS).toEqual({ resume: 'resume', settings: null, 'quit-to-menu': 'return-menu' });
    for (const action of LEGACY_PAUSE_ACTIONS) {
      expect(resolveLegacyPauseActionCommand(action.id)).toBe(action.command);
    }
  });

  test('bridge commands exist in the shared UI command registry', () => {
    for (const action of LEGACY_PAUSE_ACTIONS) {
      if (action.bridgeCommand !== null) {
        expect(UI_COMMAND_TYPES).toContain(action.bridgeCommand.type);
      }
    }
  });

  test('the existing LegacyPauseCommand type is unchanged by this packet', () => {
    expect(read('src/legacy-runtime/legacyPauseLifecycle.ts')).toContain(
      "export type LegacyPauseCommand = 'reset-player' | 'return-menu' | 'resume' | 'reset-progression';"
    );
  });
});

describe('legacy pause menu view: layout', () => {
  test('collapsed card fits and is centered at 390x844', () => {
    const layout = resolveLegacyPauseMenuLayout(390, 844);
    expect(layout.compact).toBe(true);
    expect(layout.fits).toBe(true);
    expect(layout.scrollable).toBe(false);
    expect(layout.actionHeight).toBeGreaterThanOrEqual(44);
    expect(layout.cardWidth).toBeLessThanOrEqual(layout.panel.width);
    expect(layout.cardLeft + (layout.cardWidth / 2)).toBeCloseTo(layout.centerX, 0);
    expect(layout.cardTop).toBeGreaterThanOrEqual(layout.panel.top);
    expect(layout.cardTop + layout.cardHeight).toBeLessThanOrEqual(layout.panel.top + layout.panel.height);
  });

  test('collapsed card fits at 1280x720 within a bounded width', () => {
    const layout = resolveLegacyPauseMenuLayout(1280, 720);
    expect(layout.compact).toBe(false);
    expect(layout.fits).toBe(true);
    expect(layout.cardWidth).toBeLessThanOrEqual(400);
    expect(layout.cardTop + layout.cardHeight).toBeLessThanOrEqual(layout.panel.top + layout.panel.height);
  });

  test('expanded Settings grows the card and still fits at both reference viewports', () => {
    for (const [width, height] of [[390, 844], [1280, 720]] as const) {
      const collapsed = resolveLegacyPauseMenuLayout(width, height);
      const expanded = resolveLegacyPauseMenuLayout(width, height, {}, { settingsExpanded: true });
      expect(expanded.naturalCardHeight).toBeGreaterThan(collapsed.naturalCardHeight);
      expect(expanded.settingsSectionHeight).toBeGreaterThan(0);
      expect(expanded.fits).toBe(true);
      expect(expanded.scrollable).toBe(false);
    }
  });

  test('a tiny viewport with Settings open becomes scrollable instead of overflowing', () => {
    const layout = resolveLegacyPauseMenuLayout(320, 420, {}, { settingsExpanded: true });
    expect(layout.scrollable).toBe(true);
    expect(layout.fits).toBe(false);
    expect(layout.cardHeight).toBe(layout.availableHeight);
  });

  test('is deterministic', () => {
    expect(JSON.stringify(resolveLegacyPauseMenuLayout(390, 844, { bottom: 34, top: 47 }, { settingsExpanded: true })))
      .toBe(JSON.stringify(resolveLegacyPauseMenuLayout(390, 844, { bottom: 34, top: 47 }, { settingsExpanded: true })));
  });
});
