import { describe, expect, test, vi } from 'vitest';

// The scene classes in these modules need a canvas; the pure functions tested here do not.
vi.mock('phaser', () => ({ default: { Renderer: { Canvas: { SetTransform: () => true } } } }));

import { COACH_MARK, resolveCoachMarkPill, resolveCoachMarkPulse } from '../../src/render/coachMarkView';
import {
  resolveShardBreathScale,
  resolveShardCageRotation,
  resolveShardCollectPop,
  resolveShardGatherEndMs,
  resolveShardGatherFlight,
  resolveShardGemGeometry,
  resolveShardGemOutlineDots,
  resolveShardGoalVisual,
  resolveShardHudModel,
  resolveShardInwardPing,
  SHARD_HUD_MAX_PIPS,
  SHARD_LOCKED_GOAL_BEACON_VISIBLE,
  SHARD_LOOK
} from '../../src/render/shardLook';
import { resolveShardHudAlpha, SHARD_HUD } from '../../src/render/shardSceneLayer';
import { resolveShardHudFrame } from '../../src/render/shardPlayPresenter';
import { designTokens } from '../../src/theme/tokens';

/*
 * H8 shards UI v1: the pure timeline and layout functions behind the gem, the caged star, the HUD chip,
 * the coach mark and the notice placement. Pixels are checked in the PR's captures; these pin the meaning.
 */

describe('shard gem (sharper A Gem)', () => {
  test('geometry is a tall, pointed diamond around its centre', () => {
    const g = resolveShardGemGeometry(10, 20, 8, 4);
    expect(g.top.y).toBeLessThan(20);
    expect(g.bottom.y).toBeGreaterThan(20);
    expect(g.bottom.y - g.top.y).toBeGreaterThan(g.right.x - g.left.x);
  });

  test('the dotted outline puts the asked number of dots on each edge', () => {
    const dots = resolveShardGemOutlineDots(resolveShardGemGeometry(0, 0, 8, 4), 3);
    expect(dots.length).toBeGreaterThanOrEqual(4 * 3);
    expect(dots.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
  });

  test('breath and collect pop stand still under reduced motion', () => {
    expect(resolveShardBreathScale(1234, true)).toBe(1);
    const breaths = [0, 400, 800, 1200].map((t) => resolveShardBreathScale(t, false));
    expect(new Set(breaths).size).toBeGreaterThan(1);
    const pop = resolveShardCollectPop(0, false);
    expect(pop).not.toBeNull();
    expect(resolveShardCollectPop(60_000, false)).toBeNull();
  });
});

describe('caged star timeline', () => {
  test('locked: caged, no burst, no spin clock, no notice; the beacon toggle hides it', () => {
    expect(SHARD_LOCKED_GOAL_BEACON_VISIBLE).toBe(false);
    expect(resolveShardGoalVisual(null, 5000, 1, false)).toEqual({
      phase: 'locked', cageAlpha: 1, caged: true, burst: null, spinFromMs: null, noticeDue: false
    });
  });

  test('the dotted ring turns while locked and holds still under reduced motion', () => {
    expect(resolveShardCageRotation(0, false)).toBe(0);
    expect(resolveShardCageRotation(SHARD_LOOK.cage.periodMs / 4, false)).toBeCloseTo(Math.PI / 2, 5);
    expect(resolveShardCageRotation(SHARD_LOOK.cage.periodMs / 4, true)).toBe(0);
  });

  test('the ping comes inward: its radius shrinks across its run and it is gone between pings', () => {
    const k = SHARD_LOOK.inwardPing;
    const radii = [0.1, 0.3, 0.5, 0.7, 0.9].map((share) => resolveShardInwardPing(share * k.durationMs, 32, false)!.radius);
    for (let i = 1; i < radii.length; i += 1) {
      expect(radii[i]!).toBeLessThan(radii[i - 1]!);
    }
    expect(resolveShardInwardPing(k.durationMs + 1, 32, false)).toBeNull();
    expect(resolveShardInwardPing(k.periodMs + (k.durationMs / 2), 32, false)).not.toBeNull();
    expect(resolveShardInwardPing(k.durationMs / 2, 32, true)).toBeNull();
  });

  test('full motion unlock: gather, then burst, then open with the notice due and the spin clock at the burst', () => {
    const unlockAt = 10_000;
    const count = 3;
    const gatherEnd = resolveShardGatherEndMs(count);
    expect(gatherEnd).toBeGreaterThan(0);
    const gather = resolveShardGoalVisual(unlockAt, unlockAt + (gatherEnd / 2), count, false);
    expect(gather).toMatchObject({ phase: 'gather', caged: true, noticeDue: false });
    const burst = resolveShardGoalVisual(unlockAt, unlockAt + gatherEnd + (SHARD_LOOK.burst.ms / 2), count, false);
    expect(burst.phase).toBe('burst');
    expect(burst.caged).toBe(false);
    expect(burst.burst).toBeCloseTo(0.5, 5);
    expect(burst.noticeDue).toBe(false);
    expect(burst.spinFromMs).toBe(unlockAt + gatherEnd);
    const open = resolveShardGoalVisual(unlockAt, unlockAt + gatherEnd + SHARD_LOOK.burst.ms + 1, count, false);
    expect(open).toMatchObject({ phase: 'open', caged: false, cageAlpha: 0, noticeDue: true, spinFromMs: unlockAt + gatherEnd });
  });

  test('reduced motion: no gather, a crossfade to open, the notice due at once', () => {
    const v = resolveShardGoalVisual(1000, 1000, 3, true);
    expect(v.caged).toBe(false);
    expect(v.noticeDue).toBe(true);
    expect(v.burst).toBeNull();
    expect(resolveShardGoalVisual(1000, 1000 + SHARD_LOOK.reducedCrossfadeMs, 3, true).phase).toBe('open');
  });

  test('gather flights launch in turn and land on the star', () => {
    const from = { x: 0, y: 0 };
    const to = { x: 100, y: 50 };
    expect(resolveShardGatherFlight(0, 2, -1, from, to)).toBeNull();
    const mid = resolveShardGatherFlight(0, 2, SHARD_LOOK.gather.flightMs / 2, from, to);
    expect(mid).not.toBeNull();
    expect(mid!.x).toBeGreaterThan(0);
    expect(mid!.x).toBeLessThan(100);
    expect(resolveShardGatherFlight(0, 2, resolveShardGatherEndMs(2) + 1, from, to)).toBeNull();
  });
});

describe('HUD chip', () => {
  test('one pip per shard up to the cap, filled as collected, with an n / N label', () => {
    expect(resolveShardHudModel(3, 1)).toEqual({ pips: [true, false, false], label: '1 / 3' });
    expect(resolveShardHudModel(3, 9).label).toBe('3 / 3');
    expect(resolveShardHudModel(SHARD_HUD_MAX_PIPS + 1, 2)).toEqual({ pips: null, label: `2 / ${SHARD_HUD_MAX_PIPS + 1}` });
  });

  test('steps back when the end star or the player is under it', () => {
    const rect = { left: 16, top: 40, width: 80, height: 32 };
    expect(resolveShardHudAlpha(rect, [])).toBe(1);
    expect(resolveShardHudAlpha(rect, [{ x: 300, y: 300 }])).toBe(1);
    expect(resolveShardHudAlpha(rect, [{ x: 50, y: 50 }])).toBe(SHARD_HUD.occludedAlpha);
    expect(resolveShardHudAlpha(rect, [{ x: 16 - SHARD_HUD.clearMarginPx, y: 40 }])).toBe(SHARD_HUD.occludedAlpha);
    expect(SHARD_HUD.occludedAlpha).toBeGreaterThan(0);
    expect(SHARD_HUD.occludedAlpha).toBeLessThan(1);
  });
});

describe('HUD chip frame', () => {
  test('takes the leading header slot, left of centre, inside the header lane', () => {
    expect(resolveShardHudFrame(null)).toBeNull();
    const frame = resolveShardHudFrame({ width: 390, height: 844, hudHeight: 64, hudTop: 0 })!;
    expect(frame.left).toBeGreaterThanOrEqual(0);
    expect(frame.left + frame.size).toBeLessThan(390 / 2);
    expect(frame.top).toBeGreaterThanOrEqual(0);
    expect(frame.top + frame.size).toBeLessThanOrEqual(64);
  });
});

// Notice placement moved to the shared text card rule (src/render/textCardPlacement.ts), pinned by
// tests/render/text-card-placement.test.ts (rich-text skin, 2026-11-27).

describe('coach mark (reusable)', () => {
  test('pulse is still under reduced motion and breathes otherwise', () => {
    expect(resolveCoachMarkPulse(500, true)).toEqual({ scale: 1, alpha: 0.9 });
    expect(resolveCoachMarkPulse(0, false).scale).toBe(1);
    expect(resolveCoachMarkPulse(COACH_MARK.pulsePeriodMs / 2, false).scale).toBeCloseTo(1 + COACH_MARK.pulseScale, 5);
  });

  test('pill sits above the ring when there is room, else below, clamped inside the view', () => {
    const base = { ringBelow: 20, width: 100, height: 24, minTop: 80, viewWidth: 390 };
    const above = resolveCoachMarkPill({ ...base, centre: { x: 200, y: 300 } });
    expect(above.side).toBe('above');
    expect(above.top + 24).toBeLessThanOrEqual(300 - 20);
    const below = resolveCoachMarkPill({ ...base, centre: { x: 200, y: 100 } });
    expect(below.side).toBe('below');
    expect(below.top).toBeGreaterThanOrEqual(100 + 20);
    const clamped = resolveCoachMarkPill({ ...base, centre: { x: 5, y: 300 } });
    expect(clamped.left).toBe(COACH_MARK.edge);
  });

  test('sizes come from the token scale', () => {
    const scale = designTokens.spacingPx as readonly number[];
    for (const value of [COACH_MARK.padX, COACH_MARK.padY, COACH_MARK.gap, COACH_MARK.edge, SHARD_HUD.clearMarginPx]) {
      expect(scale).toContain(value);
    }
  });
});
