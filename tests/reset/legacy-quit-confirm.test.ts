import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  IDLE_LEGACY_QUIT_CONFIRM_STATE,
  LEGACY_QUIT_CONFIRM_ARMED_LABEL,
  LEGACY_QUIT_CONFIRM_TIMEOUT_MS,
  hasLegacyQuitConfirmExpired,
  isLegacyQuitConfirmArmed,
  pressLegacyQuitConfirm
} from '../../src/legacy-runtime/legacyQuitConfirm';
import { buildLegacyMenuRows } from '../../src/legacy-runtime/legacyMenuRows';
import {
  LEGACY_MENU_DROPDOWN_ROW_HEIGHT_PX,
  resolveLegacyMenuDropdownLayout
} from '../../src/legacy-runtime/legacyMenuDropdown';
import { LEGACY_MIN_HIT_TARGET_PX } from '../../src/legacy-runtime/legacyHitTarget';
import {
  buildLegacySettingsSheetModel,
  buildLegacySettingsSheetPlan
} from '../../src/legacy-runtime/legacySettingsSheetPlan';

const read = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8').replace(/\r\n?/g, '\n');

describe('quit confirm state machine', () => {
  test('no move made: the first press quits at once and nothing is armed', () => {
    const press = pressLegacyQuitConfirm(IDLE_LEGACY_QUIT_CONFIRM_STATE, { movesMade: false, nowMs: 1000 });
    expect(press.outcome).toBe('quit');
    expect(press.state).toEqual(IDLE_LEGACY_QUIT_CONFIRM_STATE);
  });

  test('after a move: first press arms, second press inside the window quits', () => {
    const first = pressLegacyQuitConfirm(IDLE_LEGACY_QUIT_CONFIRM_STATE, { movesMade: true, nowMs: 1000 });
    expect(first.outcome).toBe('armed');
    expect(isLegacyQuitConfirmArmed(first.state, 1000)).toBe(true);
    const second = pressLegacyQuitConfirm(first.state, { movesMade: true, nowMs: 1000 + LEGACY_QUIT_CONFIRM_TIMEOUT_MS - 1 });
    expect(second.outcome).toBe('quit');
    expect(second.state).toEqual(IDLE_LEGACY_QUIT_CONFIRM_STATE);
  });

  test('the armed window is 3 s: at 3 s it has reverted and the next press arms again instead of quitting', () => {
    expect(LEGACY_QUIT_CONFIRM_TIMEOUT_MS).toBe(3000);
    const armed = pressLegacyQuitConfirm(IDLE_LEGACY_QUIT_CONFIRM_STATE, { movesMade: true, nowMs: 5000 }).state;
    expect(isLegacyQuitConfirmArmed(armed, 7999)).toBe(true);
    expect(hasLegacyQuitConfirmExpired(armed, 7999)).toBe(false);
    expect(isLegacyQuitConfirmArmed(armed, 8000)).toBe(false);
    expect(hasLegacyQuitConfirmExpired(armed, 8000)).toBe(true);
    expect(pressLegacyQuitConfirm(armed, { movesMade: true, nowMs: 8000 }).outcome).toBe('armed');
    expect(hasLegacyQuitConfirmExpired(IDLE_LEGACY_QUIT_CONFIRM_STATE, 8000)).toBe(false);
  });
});

// MAZER-UI-095: the quit confirm moved from the pause sheet's "Quit to Menu" row to the in-game Menu dropdown's
// "Main menu" row. Same state machine, same armed copy, same 44 px target; the sheet itself has no quit row now.
describe('in-game Menu: Main menu row (was the pause sheet row)', () => {
  const mainMenuRow = (armed: boolean) => buildLegacyMenuRows('play', { quitArmed: armed, soundEnabled: true })
    .find((row) => row.id === 'main-menu')!;

  test('default row says Main menu; armed row relabels in place', () => {
    expect(mainMenuRow(false).label).toBe('Main menu');
    expect(mainMenuRow(true).label).toBe(LEGACY_QUIT_CONFIRM_ARMED_LABEL);
    expect(LEGACY_QUIT_CONFIRM_ARMED_LABEL).toBe('Tap again to quit');
  });

  test('the armed row keeps the 44 px touch target and the same position', () => {
    const viewport = { height: 640, width: 360 };
    const toggleFrame = { height: 36, left: 312, top: 20, width: 36 };
    const toggleHit = { height: 44, left: 308, top: 16, width: 44 };
    const row = (armed: boolean) => resolveLegacyMenuDropdownLayout({
      items: buildLegacyMenuRows('play', { quitArmed: armed, soundEnabled: true }), toggleFrame, toggleHit, viewport
    }).rows.find((entry) => entry.item.id === 'main-menu')!;
    const idle = row(false);
    const armed = row(true);
    expect(armed.item.label).toBe('Tap again to quit');
    expect(armed.rect.height).toBe(LEGACY_MENU_DROPDOWN_ROW_HEIGHT_PX);
    expect(armed.rect.height).toBeGreaterThanOrEqual(LEGACY_MIN_HIT_TARGET_PX);
    expect(armed.rect).toEqual(idle.rect);
  });

  test('the pause sheet has no quit row any more, armed or not', () => {
    for (const armed of [false, true]) {
      const ids = buildLegacySettingsSheetPlan({ context: 'pause', height: 640, quitConfirmArmed: armed, width: 360 })
        .items.map((item) => item.model.id);
      expect(ids).not.toContain('quit-to-menu');
    }
  });

  test('the menu sheet never shows the quit row, armed or not', () => {
    const ids = buildLegacySettingsSheetModel('menu', { quitConfirmArmed: true }).sections.flatMap((s) => s.rows.map((r) => r.id));
    expect(ids).not.toContain('quit-to-menu');
  });
});

describe('scene wiring (source contract)', () => {
  const scene = read('src/scenes/MenuScene.ts');

  test('tap/click and the Q key share one handler; moves are read from the play path; no browser dialog', () => {
    expect(scene).toContain('private pressLegacyQuitToMenu(): void {');
    expect(scene).toContain('movesMade: this.playCyclePath.length > 1,');
    expect(scene).toMatch(/lowerKey === 'q' && this\.mode === 'play' && this\.overlay === 'pause' && !this\.settingsGuideOpen/);
    expect(scene).not.toMatch(/window\.confirm|\bconfirm\(/);
  });

  test('the armed state resets on every overlay open and close and expires per frame', () => {
    expect(scene).toMatch(/private openOverlay\(kind: OverlayKind\): void \{[\s\S]{0,900}this\.quitConfirmState = IDLE_LEGACY_QUIT_CONFIRM_STATE;/);
    expect(scene).toMatch(/private closeOverlay\(\): void \{\s*this\.quitConfirmState = IDLE_LEGACY_QUIT_CONFIRM_STATE;/);
    expect(scene).toContain('hasLegacyQuitConfirmExpired(this.quitConfirmState, time)');
  });
});
