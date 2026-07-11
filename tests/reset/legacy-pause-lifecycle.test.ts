import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { resolveLegacyPauseCommand } from '../../src/legacy-runtime/legacyPauseLifecycle';

describe('legacy pause lifecycle', () => {
  test('keeps pause commands explicit for resume, reset-player, and return-menu', () => {
    const start = { x: 3, y: 4 };

    expect(resolveLegacyPauseCommand('resume', start)).toEqual({
      closesOverlay: true,
      enterMenu: false,
      nextPlayer: null,
      nextTrail: null
    });

    expect(resolveLegacyPauseCommand('reset-player', start)).toEqual({
      closesOverlay: true,
      enterMenu: false,
      nextPlayer: { x: 3, y: 4 },
      nextTrail: [{ x: 3, y: 4 }]
    });

    expect(resolveLegacyPauseCommand('return-menu', start)).toEqual({
      closesOverlay: false,
      enterMenu: true,
      nextPlayer: null,
      nextTrail: null
    });
  });

  test('exposes reset-player through the pause overlay and marks the analytics path as reset-used', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');
    const pauseOverlayStart = menuSceneSource.indexOf('private buildPauseOverlay(): void {');
    const authOverlayStart = menuSceneSource.indexOf('private buildAuthOverlay(): void {');
    const pauseOverlaySource = menuSceneSource.slice(pauseOverlayStart, authOverlayStart);

    expect(menuSceneSource).toContain("const resetAction = (): void => this.applyLegacyPauseCommand('reset-player');");
    expect(menuSceneSource).toContain("'Reset', resetAction");
    expect(pauseOverlaySource).not.toContain("'Log out'");
    expect(pauseOverlaySource).not.toContain("'Account'");
    expect(pauseOverlaySource).toContain("'Menu', mainMenuAction");
    expect(pauseOverlaySource).not.toContain("'Resume'");
    expect(pauseOverlaySource).not.toContain('resumeAction');
    expect(menuSceneSource).toContain('this.playCyclePath = [copyPoint(result.nextPlayer)];');
    expect(menuSceneSource).toContain('this.playCycleResetUsed = true;');
    expect(menuSceneSource).toContain('this.playStartedAtMs = this.time.now;');
    expect(menuSceneSource).not.toContain("this.drawLegacyPlayTouchLabel(controls.restart_attempt, 'RESET');");
  });

  test('clears active trail history when pause reset returns the player to start', () => {
    const start = { x: 3, y: 4 };
    const currentTrail = [
      { x: 3, y: 4 },
      { x: 4, y: 4 },
      { x: 5, y: 4 }
    ];

    expect(resolveLegacyPauseCommand('reset-player', start, currentTrail)).toEqual({
      closesOverlay: true,
      enterMenu: false,
      nextPlayer: { x: 3, y: 4 },
      nextTrail: [{ x: 3, y: 4 }]
    });

    expect(resolveLegacyPauseCommand('reset-player', start, [{ x: 3, y: 4 }]).nextTrail).toEqual([
      { x: 3, y: 4 }
    ]);
  });
});
