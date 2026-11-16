import { describe, expect, it } from 'vitest';
import { createEmptyLegacyProgressionState } from '../../src/legacy-runtime/legacyProgression';
import { seedLegacyMenuDemoTrackFromPlayer } from '../../src/legacy-runtime/legacyMenuDemoTrack';
import { isFrontDoorTapAnywhereStart } from '../../src/legacy-runtime/legacyFrontDoorHitZone';

describe('seedLegacyMenuDemoTrackFromPlayer', () => {
  it('lifts a lower ai-runner track to the player level', () => {
    const base = createEmptyLegacyProgressionState();
    const player = { ...base.tracks.player, level: '40', targetComplexity: base.tracks['ai-runner'].targetComplexity + 40 };
    const seeded = seedLegacyMenuDemoTrackFromPlayer({ ...base, tracks: { ...base.tracks, player } });
    expect(seeded.tracks['ai-runner'].level).toBe('40');
    expect(seeded.tracks['ai-runner'].targetComplexity).toBe(player.targetComplexity);
    expect(seeded.tracks.player).toBe(player);
  });

  it('leaves an ai-runner at or above the player untouched', () => {
    const base = createEmptyLegacyProgressionState();
    const ai = { ...base.tracks['ai-runner'], targetComplexity: base.tracks.player.targetComplexity + 5 };
    const state = { ...base, tracks: { ...base.tracks, 'ai-runner': ai } };
    expect(seedLegacyMenuDemoTrackFromPlayer(state)).toBe(state);
  });
});

describe('isFrontDoorTapAnywhereStart', () => {
  const viewport = { width: 390, height: 844 };
  const cog = { left: 330, top: 10, width: 44, height: 44 };
  it('accepts taps far from other buttons', () => {
    expect(isFrontDoorTapAnywhereStart({ x: 100, y: 600 }, [cog], viewport)).toBe(true);
  });
  it('rejects taps inside the margin around other buttons', () => {
    expect(isFrontDoorTapAnywhereStart({ x: 310, y: 60 }, [cog], viewport)).toBe(false);
    expect(isFrontDoorTapAnywhereStart({ x: 340, y: 30 }, [cog], viewport)).toBe(false);
  });
  it('rejects taps outside the viewport', () => {
    expect(isFrontDoorTapAnywhereStart({ x: -1, y: 5 }, [], viewport)).toBe(false);
  });
});

import { shouldFrontDoorTapAnywhereStartRun, type FrontDoorTapAnywhereContext } from '../../src/legacy-runtime/legacyFrontDoorHitZone';

describe('shouldFrontDoorTapAnywhereStartRun gating', () => {
  const ok: FrontDoorTapAnywhereContext = {
    hasStartButton: true,
    levelPreviewActive: false,
    mode: 'menu',
    objectsUnderPointer: 0,
    otherButtonBounds: [{ left: 330, top: 10, width: 44, height: 44 }],
    overlay: 'none',
    playAccess: true,
    point: { x: 100, y: 600 },
    viewport: { width: 390, height: 844 }
  };
  it('starts on an empty-space tap', () => {
    expect(shouldFrontDoorTapAnywhereStartRun(ok)).toBe(true);
  });
  it.each([
    ['overlay open', { overlay: 'options' }],
    ['level preview', { levelPreviewActive: true }],
    ['no play access', { playAccess: false }],
    ['play mode', { mode: 'play' }],
    ['object under pointer', { objectsUnderPointer: 1 }],
    ['no start button', { hasStartButton: false }],
    ['inside another button margin', { point: { x: 320, y: 70 } }]
  ])('does not start: %s', (_name, override) => {
    expect(shouldFrontDoorTapAnywhereStartRun({ ...ok, ...override })).toBe(false);
  });
});
