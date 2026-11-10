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
import {
  LEGACY_SETTINGS_SIZES,
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

describe('pause sheet row', () => {
  const quitRow = (armed: boolean) => buildLegacySettingsSheetModel('pause', { quitConfirmArmed: armed })
    .sections.flatMap((section) => section.rows).find((row) => row.id === 'quit-to-menu')!;

  test('default row is unchanged; armed row relabels in place with the same command', () => {
    expect(quitRow(false)).toMatchObject({ command: { type: 'RETURN_HOME' }, emphasis: 'tertiary', label: 'Quit to Menu' });
    expect(buildLegacySettingsSheetModel('pause').sections.flatMap((s) => s.rows).find((r) => r.id === 'quit-to-menu')!.label).toBe('Quit to Menu');
    expect(quitRow(true)).toMatchObject({ command: { type: 'RETURN_HOME' }, emphasis: 'danger-outline', label: LEGACY_QUIT_CONFIRM_ARMED_LABEL });
    expect(LEGACY_QUIT_CONFIRM_ARMED_LABEL).toBe('Tap again to quit');
  });

  test('the armed row keeps the 44 px touch target and the same position', () => {
    const items = (armed: boolean) => buildLegacySettingsSheetPlan({
      context: 'pause', height: 640, quitConfirmArmed: armed, width: 360
    }).items.find((item) => item.model.id === 'quit-to-menu')!;
    const idle = items(false);
    const armed = items(true);
    expect(armed.model.label).toBe('Tap again to quit');
    expect(armed.rect.height).toBeGreaterThanOrEqual(LEGACY_SETTINGS_SIZES.actionHeight);
    expect(armed.rect.height).toBeGreaterThanOrEqual(44);
    expect(armed.rect.top).toBe(idle.rect.top);
    expect(armed.rect.height).toBe(idle.rect.height);
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
