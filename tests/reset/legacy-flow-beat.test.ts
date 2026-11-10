import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  LEGACY_FLOW_BEAT_LEVEL_MS,
  LEGACY_FLOW_BEAT_RANK_MS,
  LEGACY_FLOW_BEAT_RANK_ORDER,
  LEGACY_FLOW_BEAT_REDUCED_MS,
  didLegacyRankAdvance,
  formatLegacyFlowBeatColor,
  resolveLegacyFlowBeat,
  resolveLegacyFlowBeatFrame
} from '../../src/legacy-runtime/legacyFlowBeat';
import {
  LEGACY_PROGRESSION_MIN_COMPLEXITY,
  resolveLegacyProgressionPalette,
  resolveLegacyProgressionRank,
  createEmptyLegacyProgressionState,
  type LegacyProgressionRank
} from '../../src/legacy-runtime/legacyProgression';
import { designTokens } from '../../src/theme/tokens';

// A normal clear adds LEGACY_PROGRESSION_COMPLETION_DIFFICULTY_STEP (4) to the target and one to the level.
const rankForLevel = (level: number): LegacyProgressionRank => (
  resolveLegacyProgressionRank(LEGACY_PROGRESSION_MIN_COMPLEXITY + ((level - 1) * 4))
);

describe('rank thresholds fixture (levels where the rank letter changes)', () => {
  test('rank changes at levels 6, 11, 17, 23 and 31 and nowhere else up to level 120', () => {
    const changes: Array<[number, LegacyProgressionRank]> = [];
    for (let level = 2; level <= 120; level += 1) {
      if (rankForLevel(level) !== rankForLevel(level - 1)) {
        changes.push([level, rankForLevel(level)]);
      }
    }
    expect(changes).toEqual([[6, 'D'], [11, 'C'], [17, 'B'], [23, 'A'], [31, 'S']]);
    expect(rankForLevel(1)).toBe('E');
  });

  test('the rank order is E, D, C, B, A, S and covers exactly the ranks the model can return', () => {
    expect(LEGACY_FLOW_BEAT_RANK_ORDER).toEqual(['E', 'D', 'C', 'B', 'A', 'S']);
    const seen = new Set<string>();
    for (let level = 1; level <= 120; level += 1) {
      seen.add(rankForLevel(level));
    }
    expect([...seen].sort()).toEqual([...LEGACY_FLOW_BEAT_RANK_ORDER].sort());
  });
});

describe('beat selection', () => {
  const track = (level: string, rank: LegacyProgressionRank) => ({ level, rank });

  test('a normal clear is the level beat with the new level ordinal', () => {
    const beat = resolveLegacyFlowBeat({ nextTrack: track('7', 'D'), previousTrack: { rank: 'D' }, reducedMotion: false });
    expect(beat).toMatchObject({ durationMs: LEGACY_FLOW_BEAT_LEVEL_MS, kind: 'level', rank: null, text: 'Level 7' });
  });

  test('crossing into a new rank replaces the level caption with Rank <letter> for longer', () => {
    for (const [level, rank] of [[6, 'D'], [11, 'C'], [17, 'B'], [23, 'A'], [31, 'S']] as const) {
      const previous = rankForLevel(level - 1);
      const beat = resolveLegacyFlowBeat({
        nextTrack: track(String(level), rankForLevel(level)),
        previousTrack: { rank: previous },
        reducedMotion: false
      });
      expect(beat, `level ${level}`).toMatchObject({ durationMs: LEGACY_FLOW_BEAT_RANK_MS, kind: 'rank', rank, text: `Rank ${rank}` });
    }
  });

  test('a rank that stays the same or drops never fires a rank beat', () => {
    expect(didLegacyRankAdvance('C', 'C')).toBe(false);
    expect(didLegacyRankAdvance('C', 'D')).toBe(false);
    expect(didLegacyRankAdvance('S', 'E')).toBe(false);
    expect(didLegacyRankAdvance('E', 'D')).toBe(true);
    const beat = resolveLegacyFlowBeat({ nextTrack: track('12', 'D'), previousTrack: { rank: 'C' }, reducedMotion: false });
    expect(beat.kind).toBe('level');
  });

  test('large ordinals use the shared ordinal formatting', () => {
    const beat = resolveLegacyFlowBeat({
      nextTrack: track('12345678901234567890', 'S'),
      previousTrack: { rank: 'S' },
      reducedMotion: false
    });
    expect(beat.text).toBe('Level 12,345,678,901,234,567,890');
  });
});

describe('timing comes from existing motion tokens (no new durations)', () => {
  const motion = designTokens.motion.durationMs;

  test('level 700 ms = reveal, rank 1100 ms = reveal + long, reduced motion 400 ms = long', () => {
    expect(LEGACY_FLOW_BEAT_LEVEL_MS).toBe(motion.reveal);
    expect(LEGACY_FLOW_BEAT_LEVEL_MS).toBe(700);
    expect(LEGACY_FLOW_BEAT_RANK_MS).toBe(motion.reveal + motion.long);
    expect(LEGACY_FLOW_BEAT_RANK_MS).toBe(1100);
    expect(LEGACY_FLOW_BEAT_REDUCED_MS).toBe(motion.long);
    expect(LEGACY_FLOW_BEAT_REDUCED_MS).toBe(400);
  });
});

describe('frame', () => {
  const level = resolveLegacyFlowBeat({ nextTrack: { level: '3', rank: 'E' }, previousTrack: { rank: 'E' }, reducedMotion: false });
  const rank = resolveLegacyFlowBeat({ nextTrack: { level: '6', rank: 'D' }, previousTrack: { rank: 'E' }, reducedMotion: false });
  const still = resolveLegacyFlowBeat({ nextTrack: { level: '3', rank: 'E' }, previousTrack: { rank: 'E' }, reducedMotion: true });

  test('fades in, holds, fades out and is gone exactly at the duration', () => {
    expect(resolveLegacyFlowBeatFrame(level, 0)).toMatchObject({ alpha: 0, done: false });
    const mid = resolveLegacyFlowBeatFrame(level, 300);
    expect(mid).toMatchObject({ alpha: 1, done: false, scale: 1, visible: true });
    const fading = resolveLegacyFlowBeatFrame(level, 550);
    expect(fading.alpha).toBeGreaterThan(0);
    expect(fading.alpha).toBeLessThan(1);
    expect(resolveLegacyFlowBeatFrame(level, level.durationMs)).toMatchObject({ alpha: 0, done: true, visible: false });
    expect(resolveLegacyFlowBeatFrame(rank, rank.durationMs - 1).visible).toBe(true);
    expect(resolveLegacyFlowBeatFrame(rank, rank.durationMs)).toMatchObject({ done: true, visible: false });
  });

  test('alpha never leaves 0..1 and the caption never grows past full size', () => {
    for (let ms = -50; ms <= 1300; ms += 7) {
      for (const beat of [level, rank, still]) {
        const frame = resolveLegacyFlowBeatFrame(beat, ms);
        expect(frame.alpha).toBeGreaterThanOrEqual(0);
        expect(frame.alpha).toBeLessThanOrEqual(1);
        expect(frame.scale).toBeLessThanOrEqual(1);
      }
    }
    expect(resolveLegacyFlowBeatFrame(level, Number.NaN).done).toBe(false);
  });

  test('reduced motion is static: full opacity, full size, no fade, gone at 400 ms', () => {
    expect(still.durationMs).toBe(400);
    for (const ms of [0, 1, 100, 250, 399]) {
      expect(resolveLegacyFlowBeatFrame(still, ms)).toEqual({ alpha: 1, done: false, scale: 1, visible: true });
    }
    expect(resolveLegacyFlowBeatFrame(still, 400).done).toBe(true);
  });

  test('a reduced-motion rank beat is also 400 ms and keeps the Rank text', () => {
    const reducedRank = resolveLegacyFlowBeat({ nextTrack: { level: '6', rank: 'D' }, previousTrack: { rank: 'E' }, reducedMotion: true });
    expect(reducedRank).toMatchObject({ durationMs: 400, kind: 'rank', text: 'Rank D' });
  });
});

describe('rank colour', () => {
  test('the rank caption colour is the track palette rankColor, formatted as a CSS hex', () => {
    const state = createEmptyLegacyProgressionState();
    const palette = resolveLegacyProgressionPalette({ ...state.tracks.player, colorTier: 1, rank: 'D' }, 'player');
    expect(formatLegacyFlowBeatColor(palette.rankColor)).toBe('#59fff0');
    expect(formatLegacyFlowBeatColor(0x36ff7d)).toBe('#36ff7d');
    expect(formatLegacyFlowBeatColor(0x0000ff)).toBe('#0000ff');
  });
});

describe('scene wiring (source contract)', () => {
  const scene = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8').split(String.fromCharCode(13, 10)).join(String.fromCharCode(10));

  test('only a PLAY clear starts a beat (the menu demo never shows a caption) and the beat never gates input or the loop', () => {
    expect(scene).toMatch(/if \(surface === 'play'\) \{\s*this\.startLegacyFlowBeat\(/);
    expect(scene.match(/this\.startLegacyFlowBeat\(/g)?.length).toBe(1);
    const update = scene.slice(scene.indexOf('private updateLegacyFlowBeatCaption('), scene.indexOf('private applyLegacyUiTextCrispness'));
    expect(update).toContain("if (this.mode !== 'play') {");
    // The beat reads time and paints a Text object only: no lifecycle, input-lock or generation state is touched.
    expect(update).not.toMatch(/pendingResetRequest|pendingGenerationRequest|menuStaticDraw|inputUnlock|playCompletedAtMs/);
  });

  test('the caption holds while a sheet is open instead of being eaten, and reduced motion comes from the scene preference', () => {
    expect(scene).toContain('active.startedAtMs += Math.max(0, time - previousFrameMs);');
    expect(scene).toContain('reducedMotion: this.prefersLegacyReducedMotion()');
  });
});
