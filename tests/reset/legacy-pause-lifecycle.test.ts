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

  test('preserves active trail history when pause reset returns the player to start', () => {
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
      nextTrail: [
        { x: 3, y: 4 },
        { x: 4, y: 4 },
        { x: 5, y: 4 },
        { x: 3, y: 4 }
      ]
    });

    expect(resolveLegacyPauseCommand('reset-player', start, [{ x: 3, y: 4 }]).nextTrail).toEqual([
      { x: 3, y: 4 }
    ]);
  });
});
