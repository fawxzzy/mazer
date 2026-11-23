import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { LEGACY_DEFAULTS, copyLegacySettings } from '../../src/legacy-runtime/legacyDefaults';
import {
  LEGACY_GAME_TOGGLE_STORAGE_KEY,
  readLegacyGameToggleSettings,
  writeLegacyGameToggleSettings
} from '../../src/legacy-runtime/legacyGameTogglePreferences';
import {
  INITIAL_LEGACY_PAGE_VISIBILITY_STATE,
  resolveLegacyLifecycleHoldMs,
  shiftLegacyLifecycleAnchor
} from '../../src/legacy-runtime/legacyLifecycleHold';
import {
  CLOSED_LEGACY_MENU_DROPDOWN_STATE,
  LEGACY_MENU_DROPDOWN_ITEMS,
  LEGACY_MENU_DROPDOWN_PANEL_WIDTH_PX,
  LEGACY_MENU_DROPDOWN_ROW_HEIGHT_PX,
  LEGACY_MENU_DROPDOWN_STATE_RIGHT_INSET_PX,
  resolveLegacyMenuDropdownLayout,
  resolveLegacyMenuDropdownLinearProgress,
  resolveLegacyMenuDropdownTap,
  setLegacyMenuDropdownOpen
} from '../../src/legacy-runtime/legacyMenuDropdown';
import {
  LEGACY_MAIN_MENU_ROW_IDS,
  LEGACY_MENU_ROW_PANEL_WIDTH_PX,
  LEGACY_SHARED_MENU_ROW_IDS,
  buildLegacyMenuRows,
  isLegacyMenuRowToggle,
  resolveLegacyGuideCloseTarget,
  resolveLegacyMenuRowIds
} from '../../src/legacy-runtime/legacyMenuRows';
import { applyLegacyOverlayToggleField } from '../../src/legacy-runtime/legacyOverlayToggleFields';
import { resolveLegacyPauseCommand } from '../../src/legacy-runtime/legacyPauseLifecycle';
import {
  IDLE_LEGACY_PLAY_RESET_CONFIRM_STATE,
  LEGACY_PLAY_MENU_LABELS,
  LEGACY_PLAY_MENU_PANEL_WIDTH_PX,
  LEGACY_PLAY_MENU_RESET_ARMED_LABEL,
  LEGACY_PLAY_MENU_RESUME_ACTION,
  LEGACY_PLAY_MENU_RESUME_LABEL,
  LEGACY_PLAY_MENU_ROW_IDS,
  LEGACY_PLAY_MENU_TOGGLE_ACTION,
  buildLegacyPlayMenuRows,
  resolveLegacyPlayMenuBack,
  resolveLegacyPlayMenuOpenView,
  resolveLegacyPlayResetAvailability,
  shouldLegacyPlayMenuStayOpen,
  wouldLegacyPlayMenuPressArm
} from '../../src/legacy-runtime/legacyPlayMenu';
import {
  LEGACY_QUIT_CONFIRM_ARMED_LABEL,
  LEGACY_QUIT_CONFIRM_TIMEOUT_MS,
  pressLegacyQuitConfirm
} from '../../src/legacy-runtime/legacyQuitConfirm';
import { LEGACY_SETTINGS_MOVED_TO_MENU_ROW_IDS, buildLegacySettingsSheetModel } from '../../src/legacy-runtime/legacySettingsSheetPlan';

const read = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8').replace(/\r\n?/g, '\n');
const SCENE = read('src/scenes/MenuScene.ts');
const sceneMethod = (signature: string): string => {
  const start = SCENE.indexOf(signature);
  expect(start, signature).toBeGreaterThanOrEqual(0);
  return SCENE.slice(start, SCENE.indexOf('\n  }\n', start));
};

const rows = (overrides: Partial<Parameters<typeof buildLegacyPlayMenuRows>[0]> = {}) => buildLegacyPlayMenuRows({
  quitArmed: false,
  resetArmed: false,
  resetAvailable: true,
  soundEnabled: true,
  ...overrides
});

const memoryStorage = () => {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => { map.set(key, value); }
  };
};

describe('MAZER-UI-095 / MAZER-UI-096 one row model for both Menu dropdowns (legacyMenuRows.ts)', () => {
  test('both screens open on Settings, Guide, Sound; the main menu adds Profile, Leaderboard; a game adds Reset level, Main menu', () => {
    expect(LEGACY_SHARED_MENU_ROW_IDS).toEqual(['settings', 'guide', 'sound']);
    expect(LEGACY_MAIN_MENU_ROW_IDS).toEqual(['settings', 'guide', 'sound', 'profile', 'leaderboard']);
    expect(LEGACY_PLAY_MENU_ROW_IDS).toEqual(['settings', 'guide', 'sound', 'reset-level', 'main-menu']);
    const main = buildLegacyMenuRows('main', { soundEnabled: true });
    expect(main.map((row) => row.label)).toEqual(['Settings', 'Guide', 'Sound', 'Profile', 'Leaderboard']);
    // Profile keeps the retired corner button's published name so QA harnesses keep finding it.
    expect(main.map((row) => row.semanticAction)).toEqual(['Settings', 'Guide', 'Sound', 'Account', 'Leaderboard']);
    expect(main.some((row) => row.id === ('reset-level' as string) || row.id === ('main-menu' as string))).toBe(false);
    const play = buildLegacyMenuRows('play', { soundEnabled: true });
    expect(play.some((row) => row.id === ('profile' as string) || row.id === ('leaderboard' as string))).toBe(false);
    // The shared rows are identical objects-by-value on both screens.
    expect(main.slice(0, 3)).toEqual(play.slice(0, 3));
  });

  test('main menu: Sound shows On / Off the same way; Profile drops out while the account service is unavailable', () => {
    expect(buildLegacyMenuRows('main', { soundEnabled: false }).find((row) => row.id === 'sound')!.stateText).toBe('Off');
    expect(buildLegacyMenuRows('main', { soundEnabled: true }).find((row) => row.id === 'sound')!.stateText).toBe('On');
    expect(resolveLegacyMenuRowIds('main', { profileAvailable: false })).toEqual(['settings', 'guide', 'sound', 'leaderboard']);
    expect(resolveLegacyMenuRowIds('main', { profileAvailable: true })).toEqual([...LEGACY_MAIN_MENU_ROW_IDS]);
    expect(resolveLegacyMenuRowIds('play', { profileAvailable: false })).toEqual([...LEGACY_PLAY_MENU_ROW_IDS]);
    expect(buildLegacyMenuRows('main', { soundEnabled: true }).every((row) => row.disabled === false)).toBe(true);
    // The default item list the dropdown geometry falls back to is the main menu's list.
    expect(LEGACY_MENU_DROPDOWN_ITEMS.map((item) => item.id)).toEqual([...LEGACY_MAIN_MENU_ROW_IDS]);
  });

  test('Sound is the only toggle row on either screen (the panel stays open on it)', () => {
    expect([...LEGACY_MAIN_MENU_ROW_IDS, ...LEGACY_PLAY_MENU_ROW_IDS].filter(isLegacyMenuRowToggle)).toEqual(['sound', 'sound']);
  });

  test('Guide close: back to the Menu it came from (paused dropdown in a game, plain main menu), else back to Settings', () => {
    expect(resolveLegacyGuideCloseTarget({ openedFromMenu: true, screen: 'play' })).toBe('menu-dropdown');
    expect(resolveLegacyGuideCloseTarget({ openedFromMenu: true, screen: 'main' })).toBe('main-menu');
    expect(resolveLegacyGuideCloseTarget({ openedFromMenu: false, screen: 'main' })).toBe('settings-sheet');
  });

  test('both Settings sheets lost Guide and Sound and show the same three settings (main adds its Account section)', () => {
    expect(LEGACY_SETTINGS_MOVED_TO_MENU_ROW_IDS).toEqual(['how-to-play', 'sound']);
    const menu = buildLegacySettingsSheetModel('menu', { signedIn: true });
    const pause = buildLegacySettingsSheetModel('pause');
    const groupIds = (model: typeof menu) => model.sections.find((section) => section.id === 'settings')!.rows.map((row) => row.id);
    expect(groupIds(menu)).toEqual(['reduce-motion', 'haptics', 'floating-anchor', 'dark-mode']);
    expect(groupIds(pause)).toEqual(['reduce-motion', 'haptics', 'floating-anchor', 'dark-mode']);
    const allMenuIds = menu.sections.flatMap((section) => section.rows.map((row) => row.id));
    for (const moved of LEGACY_SETTINGS_MOVED_TO_MENU_ROW_IDS) {
      expect(allMenuIds, moved).not.toContain(moved);
    }
  });
});

describe('MAZER-UI-095 in-game Menu rows (legacyPlayMenu.ts)', () => {
  test('rows are Settings, Guide, Sound, Reset level, Main menu, in that order, with those words', () => {
    expect(LEGACY_PLAY_MENU_ROW_IDS).toEqual(['settings', 'guide', 'sound', 'reset-level', 'main-menu']);
    expect(rows().map((row) => row.id)).toEqual([...LEGACY_PLAY_MENU_ROW_IDS]);
    expect(rows().map((row) => row.label)).toEqual(['Settings', 'Guide', 'Sound', 'Reset level', 'Main menu']);
    expect(rows().map((row) => row.semanticAction)).toEqual(['Settings', 'Guide', 'Sound', 'Reset level', 'Main menu']);
    expect(Object.isFrozen(rows()[0])).toBe(true);
  });

  test('the closed button is Menu (same word as the main menu toggle); the open X is Resume, in words', () => {
    expect(LEGACY_PLAY_MENU_TOGGLE_ACTION).toBe('Menu');
    expect(LEGACY_PLAY_MENU_RESUME_ACTION).toBe('Resume');
    expect(LEGACY_PLAY_MENU_RESUME_LABEL).toBe('Resume');
  });

  test('Sound shows its state as On / Off on the row; the label never changes', () => {
    const on = rows({ soundEnabled: true }).find((row) => row.id === 'sound')!;
    const off = rows({ soundEnabled: false }).find((row) => row.id === 'sound')!;
    expect([on.label, on.stateText]).toEqual(['Sound', 'On']);
    expect([off.label, off.stateText]).toEqual(['Sound', 'Off']);
    for (const row of rows().filter((entry) => entry.id !== 'sound')) {
      expect(row.stateText, row.id).toBeNull();
    }
  });

  test('Reset level is disabled with no live maze to reset; armed rows read "Tap again to ..."', () => {
    expect(resolveLegacyPlayResetAvailability({ levelGenerating: false, resetPending: false, runCompleted: false })).toBe(true);
    expect(resolveLegacyPlayResetAvailability({ levelGenerating: false, resetPending: false, runCompleted: true })).toBe(false);
    expect(resolveLegacyPlayResetAvailability({ levelGenerating: false, resetPending: true, runCompleted: false })).toBe(false);
    expect(resolveLegacyPlayResetAvailability({ levelGenerating: true, resetPending: false, runCompleted: false })).toBe(false);
    expect(rows({ resetAvailable: false }).find((row) => row.id === 'reset-level')!.disabled).toBe(true);
    expect(rows().every((row) => row.disabled === false)).toBe(true);
    expect(rows({ resetArmed: true }).find((row) => row.id === 'reset-level')!.label).toBe(LEGACY_PLAY_MENU_RESET_ARMED_LABEL);
    expect(LEGACY_PLAY_MENU_RESET_ARMED_LABEL).toBe('Tap again to reset');
    // a disabled row never shows an armed label
    expect(rows({ resetArmed: true, resetAvailable: false }).find((row) => row.id === 'reset-level')!.label).toBe('Reset level');
    expect(rows({ quitArmed: true }).find((row) => row.id === 'main-menu')!.label).toBe(LEGACY_QUIT_CONFIRM_ARMED_LABEL);
    // the published name stays the row's own while it is armed
    expect(rows({ quitArmed: true, resetArmed: true }).map((row) => row.semanticAction)).toEqual(Object.values({
      settings: 'Settings', guide: 'Guide', sound: 'Sound', reset: 'Reset level', main: 'Main menu'
    }));
  });

  test('Reset confirmation: no move = one tap; after a move the first tap arms for 3 s and the second resets', () => {
    const fresh = pressLegacyQuitConfirm(IDLE_LEGACY_PLAY_RESET_CONFIRM_STATE, { movesMade: false, nowMs: 1000 });
    expect(fresh.outcome).toBe('quit');
    const first = pressLegacyQuitConfirm(IDLE_LEGACY_PLAY_RESET_CONFIRM_STATE, { movesMade: true, nowMs: 1000 });
    expect(first.outcome).toBe('armed');
    const second = pressLegacyQuitConfirm(first.state, { movesMade: true, nowMs: 1000 + LEGACY_QUIT_CONFIRM_TIMEOUT_MS - 1 });
    expect(second.outcome).toBe('quit');
    const late = pressLegacyQuitConfirm(first.state, { movesMade: true, nowMs: 1000 + LEGACY_QUIT_CONFIRM_TIMEOUT_MS + 1 });
    expect(late.outcome).toBe('armed');
    expect(wouldLegacyPlayMenuPressArm(IDLE_LEGACY_PLAY_RESET_CONFIRM_STATE, { movesMade: true, nowMs: 0 })).toBe(true);
    expect(wouldLegacyPlayMenuPressArm(first.state, { movesMade: true, nowMs: 1000 })).toBe(false);
    expect(wouldLegacyPlayMenuPressArm(IDLE_LEGACY_PLAY_RESET_CONFIRM_STATE, { movesMade: false, nowMs: 0 })).toBe(false);
  });

  test('which picks leave the panel open: Sound always; Reset level / Main menu only on the arming tap', () => {
    const idle = IDLE_LEGACY_PLAY_RESET_CONFIRM_STATE;
    const armed = pressLegacyQuitConfirm(idle, { movesMade: true, nowMs: 50 }).state;
    const at = (input: Partial<Parameters<typeof shouldLegacyPlayMenuStayOpen>[1]>) => ({
      movesMade: true, nowMs: 100, quitState: idle, resetState: idle, ...input
    });
    expect(shouldLegacyPlayMenuStayOpen('sound', at({}))).toBe(true);
    expect(shouldLegacyPlayMenuStayOpen('sound', at({ movesMade: false }))).toBe(true);
    expect(shouldLegacyPlayMenuStayOpen('settings', at({}))).toBe(false);
    expect(shouldLegacyPlayMenuStayOpen('guide', at({}))).toBe(false);
    expect(shouldLegacyPlayMenuStayOpen('reset-level', at({}))).toBe(true);
    expect(shouldLegacyPlayMenuStayOpen('reset-level', at({ resetState: armed }))).toBe(false);
    expect(shouldLegacyPlayMenuStayOpen('reset-level', at({ movesMade: false }))).toBe(false);
    expect(shouldLegacyPlayMenuStayOpen('main-menu', at({}))).toBe(true);
    expect(shouldLegacyPlayMenuStayOpen('main-menu', at({ quitState: armed }))).toBe(false);
  });

  test('back steps Guide -> Settings sheet -> dropdown -> resume; only a rotate opens straight on the sheet', () => {
    expect(resolveLegacyPlayMenuBack({ guideOpen: true, view: 'menu' })).toBe('close-guide');
    expect(resolveLegacyPlayMenuBack({ guideOpen: true, view: 'settings' })).toBe('close-guide');
    expect(resolveLegacyPlayMenuBack({ guideOpen: false, view: 'settings' })).toBe('show-menu');
    expect(resolveLegacyPlayMenuBack({ guideOpen: false, view: 'menu' })).toBe('resume');
    expect(resolveLegacyPlayMenuOpenView('menu')).toBe('menu');
    expect(resolveLegacyPlayMenuOpenView('page-leave')).toBe('menu');
    expect(resolveLegacyPlayMenuOpenView('rotate')).toBe('settings');
  });

  test('the Settings sheet the Settings row opens no longer has Guide, Sound or Main menu', () => {
    const ids = buildLegacySettingsSheetModel('pause').sections.flatMap((section) => section.rows.map((row) => row.id));
    expect(ids).toEqual(['resume', 'reduce-motion', 'haptics', 'floating-anchor', 'dark-mode']);
    expect(LEGACY_PLAY_MENU_LABELS.guide).toBe('Guide');
  });
});

describe('MAZER-UI-095 pause, reset and sound semantics', () => {
  test('pause is exact: while the dropdown (overlay "pause") is up the run clock anchor moves by exactly the paused time', () => {
    let nowMs = 10_000;
    let playStartedAtMs: number | null = 4_000;
    const elapsed = () => nowMs - playStartedAtMs!;
    const frame = (deltaMs: number, overlay: string) => {
      nowMs += deltaMs;
      const holdMs = resolveLegacyLifecycleHoldMs({
        frameDeltaMs: deltaMs,
        mode: 'play',
        overlay,
        pageVisibility: INITIAL_LEGACY_PAGE_VISIBILITY_STATE
      });
      playStartedAtMs = shiftLegacyLifecycleAnchor(playStartedAtMs, holdMs);
    };
    frame(16, 'none');
    const beforeOpen = elapsed();
    // open the Menu and leave it up for a ragged 7.3 s of frames
    for (const delta of [17, 33, 8, 250, 17, 7000, 16]) {
      frame(delta, 'pause');
      expect(elapsed()).toBe(beforeOpen);
    }
    // Resume: the very next frame advances by just that frame, no jump
    frame(16, 'none');
    expect(elapsed()).toBe(beforeOpen + 16);
    expect(shiftLegacyLifecycleAnchor(null, 500)).toBeNull();
  });

  test('Reset level is the existing reset-player command: back to this maze start, trail is just the start, overlay closes, same level', () => {
    const start = { x: 1, y: 7 };
    const result = resolveLegacyPauseCommand('reset-player', start, [start, { x: 2, y: 7 }, { x: 3, y: 7 }]);
    expect(result).toEqual({ closesOverlay: true, enterMenu: false, nextPlayer: start, nextTrail: [start] });
    expect(result.nextPlayer).not.toBe(start);
    // Resume changes nothing but the overlay.
    expect(resolveLegacyPauseCommand('resume', start)).toEqual({ closesOverlay: true, enterMenu: false, nextPlayer: null, nextTrail: null });
  });

  test('Sound toggles through the same settings field and persists to the same game-toggle storage', () => {
    const storage = memoryStorage();
    const startOn = { ...copyLegacySettings(LEGACY_DEFAULTS), soundEnabled: true };
    const offResult = applyLegacyOverlayToggleField(startOn, 'soundEnabled');
    expect(offResult.settings.soundEnabled).toBe(false);
    expect([offResult.affectsBackdrop, offResult.affectsBoardStatic, offResult.affectsBoardDynamic]).toEqual([false, false, false]);
    writeLegacyGameToggleSettings(storage, offResult.settings);
    expect(storage.getItem(LEGACY_GAME_TOGGLE_STORAGE_KEY)).not.toBeNull();
    expect(readLegacyGameToggleSettings(storage).soundEnabled).toBe(false);
    expect(rows({ soundEnabled: readLegacyGameToggleSettings(storage).soundEnabled }).find((row) => row.id === 'sound')!.stateText).toBe('Off');
    const onResult = applyLegacyOverlayToggleField(offResult.settings, 'soundEnabled');
    writeLegacyGameToggleSettings(storage, onResult.settings);
    expect(readLegacyGameToggleSettings(storage).soundEnabled).toBe(true);
  });
});

describe('MAZER-UI-095 shared dropdown geometry (legacyMenuDropdown.ts generics)', () => {
  const viewport = { height: 844, width: 390 };
  const toggleHit = { height: 56, left: 326, top: 60, width: 56 };
  const toggleFrame = { height: 36, left: 336, top: 70, width: 36 };
  const layout = resolveLegacyMenuDropdownLayout({
    items: rows({ resetAvailable: false }),
    panelWidth: LEGACY_PLAY_MENU_PANEL_WIDTH_PX,
    safeArea: { left: 0, right: 0 },
    toggleFrame,
    toggleHit,
    viewport
  });

  test('the in-game panel has the shared width, inside the viewport, and every row is a 44 px touch target with a right state column', () => {
    expect(layout.panel.width).toBe(LEGACY_PLAY_MENU_PANEL_WIDTH_PX);
    expect(LEGACY_PLAY_MENU_PANEL_WIDTH_PX).toBe(LEGACY_MENU_DROPDOWN_PANEL_WIDTH_PX);
    expect(LEGACY_MENU_DROPDOWN_PANEL_WIDTH_PX).toBe(LEGACY_MENU_ROW_PANEL_WIDTH_PX);
    expect(layout.panel.left).toBeGreaterThanOrEqual(0);
    expect(layout.panel.left + layout.panel.width).toBeLessThanOrEqual(viewport.width);
    expect(layout.panel.top).toBeGreaterThan(toggleFrame.top + toggleFrame.height - 1);
    expect(layout.rows.map((row) => row.item.id)).toEqual([...LEGACY_PLAY_MENU_ROW_IDS]);
    for (const row of layout.rows) {
      expect(row.rect.height).toBeGreaterThanOrEqual(44);
      expect(row.rect.height).toBe(LEGACY_MENU_DROPDOWN_ROW_HEIGHT_PX);
      expect(row.stateRight).toBe(row.rect.left + row.rect.width - LEGACY_MENU_DROPDOWN_STATE_RIGHT_INSET_PX);
    }
    expect(layout.toggle.width).toBeGreaterThanOrEqual(44);
    expect(layout.toggle.height).toBeGreaterThanOrEqual(44);
  });

  test('taps: the X is the toggle (Resume), a disabled row is swallowed as the panel, outside is outside', () => {
    expect(resolveLegacyMenuDropdownTap(layout, { x: toggleHit.left + 5, y: toggleHit.top + 5 })).toEqual({ kind: 'toggle' });
    const reset = layout.rows.find((row) => row.item.id === 'reset-level')!;
    expect(resolveLegacyMenuDropdownTap(layout, { x: reset.rect.left + 20, y: reset.rect.top + 20 })).toEqual({ kind: 'panel' });
    const sound = layout.rows.find((row) => row.item.id === 'sound')!;
    expect(resolveLegacyMenuDropdownTap(layout, { x: sound.rect.left + 20, y: sound.rect.top + 20 })).toEqual({ id: 'sound', kind: 'row' });
    expect(resolveLegacyMenuDropdownTap(layout, { x: 5, y: viewport.height - 5 })).toEqual({ kind: 'outside' });
  });

  test('the main menu panel has the same width, row height and state column (MAZER-UI-096)', () => {
    const main = resolveLegacyMenuDropdownLayout({ items: buildLegacyMenuRows('main', { soundEnabled: false }), toggleFrame, toggleHit, viewport });
    expect(main.panel.width).toBe(layout.panel.width);
    expect(main.rows.map((row) => row.item.id)).toEqual([...LEGACY_MAIN_MENU_ROW_IDS]);
    for (const [index, row] of main.rows.entries()) {
      expect(row.rect.height).toBe(LEGACY_MENU_DROPDOWN_ROW_HEIGHT_PX);
      if (index < 3) {
        expect(row.rect).toEqual(layout.rows[index]!.rect);
        expect(row.stateRight).toBe(layout.rows[index]!.stateRight);
      }
    }
    expect(main.toggle).toEqual(layout.toggle);
  });

  test('reduced motion: the panel is fully open (and fully closed) on the same frame, no slide', () => {
    const opened = setLegacyMenuDropdownOpen(CLOSED_LEGACY_MENU_DROPDOWN_STATE, true, 1000, true);
    expect(resolveLegacyMenuDropdownLinearProgress(opened, 1000, true)).toBe(1);
    const closed = setLegacyMenuDropdownOpen(opened, false, 1001, true);
    expect(resolveLegacyMenuDropdownLinearProgress(closed, 1001, true)).toBe(0);
    // with motion it animates
    const animated = setLegacyMenuDropdownOpen(CLOSED_LEGACY_MENU_DROPDOWN_STATE, true, 1000, false);
    expect(resolveLegacyMenuDropdownLinearProgress(animated, 1050, false)).toBeLessThan(1);
  });
});

describe('MAZER-UI-095 MenuScene wiring (source)', () => {
  test('the corner cog is replaced by the Menu button on the same pause touch route (no drag can start from it)', () => {
    expect(SCENE).not.toContain('drawLegacySettingsCogControl');
    expect(SCENE).toContain('this.drawLegacyPlayMenuControl(controls.pause, time);');
    // the touch route that opens it is the existing pause control (src/input-human/touch.ts is untouched)
    expect(SCENE).toContain("if (control === 'pause') {\n      this.openOverlay('pause');");
    expect(sceneMethod('private drawLegacyPlayMenuControl(')).toContain('this.prefersLegacyReducedMotion()');
  });

  test('the dropdown is the pause overlay: X / tap-outside resume through RESUME_RUN, Reset through RESET_RUN', () => {
    const create = sceneMethod('private createLegacyPlayMenu(');
    expect(create).toContain("this.dispatchUiBridgeCommand({ type: 'RESUME_RUN' }, () => this.applyLegacyPauseCommand('resume'));");
    expect(sceneMethod('private resolveLegacyMenuDropdownSharedHost<')).toContain('reducedMotion: () => this.prefersLegacyReducedMotion(),');
    expect(sceneMethod('private isLegacyPlayMenuDropdownView(')).toContain("this.overlay === 'pause'");
    expect(sceneMethod('private pressLegacyPlayResetLevel(')).toContain(
      "this.dispatchUiBridgeCommand({ type: 'RESET_RUN' }, () => this.applyLegacyPauseCommand('reset-player'));"
    );
    expect(sceneMethod('private selectLegacyPlayMenuRow(')).toContain("this.applyOverlayToggleFieldChange('soundEnabled');");
    expect(sceneMethod('private selectLegacyPlayMenuRow(')).toContain('this.pressLegacyQuitToMenu();');
  });

  test('the Resume X sits under the closed Menu button: the press that resumed is swallowed by the play-control handler (no instant reopen)', () => {
    expect(sceneMethod('private createLegacyPlayMenu(')).toContain('this.playMenuDismissedAtMs = this.time.now;');
    expect(sceneMethod('private handleLegacyPlayTouchControl(')).toMatch(
      /this\.time\.now === this\.playMenuDismissedAtMs\) \{\s+return true;\s+\}[\s\S]*?if \(control === 'pause'\)/
    );
  });

  test('MAZER-UI-096 main menu: rows from the shared model; Guide opens on the Settings overlay and returns; Sound flips in place; no pause', () => {
    expect(sceneMethod('private buildLegacyMenuDropdownButtons(')).toContain("buildLegacyMenuRows('main', {");
    const create = sceneMethod('private createLegacyMenuDropdown(');
    expect(create).toContain('keepOpenOnSelect: (id) => isLegacyMenuRowToggle(id),');
    expect(create).not.toContain('dismissed:');
    const select = sceneMethod('private selectLegacyMainMenuRow(');
    expect(select).toMatch(/case 'guide':[\s\S]*?this\.settingsGuideOpen = true;\n\s+this\.guideOpenedFromMenu = true;/);
    expect(select).toContain("this.applyOverlayToggleFieldChange('soundEnabled');");
    expect(select).not.toContain('reset-player');
    expect(select).not.toContain('pressLegacyQuitToMenu');
    const close = sceneMethod('private closeLegacyGuideSheet(');
    expect(close).toContain('resolveLegacyGuideCloseTarget({');
    expect(close).toContain("if (target === 'main-menu' && this.overlay === 'options') {\n      this.handleBackAction();");
  });

  test('both dropdowns are built from one shared host; every row icon comes from the one registry (menuRowIcons.ts)', () => {
    const shared = sceneMethod('private resolveLegacyMenuDropdownSharedHost<');
    expect(shared).toContain('drawMenuRowVectorIcon(');
    expect(shared).toContain('this.resolveLegacyMenuRowIconTexture(id)');
    expect(sceneMethod('private resolveLegacyMenuRowIconTexture(')).toContain('MENU_ROW_ICON_SOURCES[id]');
    expect(sceneMethod('private createLegacyPlayMenu(')).toContain('...this.resolveLegacyMenuDropdownSharedHost<LegacyPlayMenuRowId>(),');
    expect(sceneMethod('private createLegacyMenuDropdown(')).toContain('...this.resolveLegacyMenuDropdownSharedHost<LegacyMainMenuRowId>(),');
    expect(SCENE).not.toContain('textures: Record<LegacyMenuDropdownItemId');
    const icons = read('src/render/menuRowIcons.ts');
    for (const id of [...LEGACY_MAIN_MENU_ROW_IDS, ...LEGACY_PLAY_MENU_ROW_IDS]) {
      expect(icons).toMatch(new RegExp(`'?${id}'?: \\{`));
    }
  });
});
