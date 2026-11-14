import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  ENDPOINT_MARKER_DRAW_ORDER,
  GOAL_OVERLAP_CORE_ALPHA,
  resolvePlayerCoreAlphaScale,
  shouldDrawEndpointMarker
} from '../../src/render/endpointMarkerLayering';

const read = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('end marker layering (MAZER-VIS-041): the goal star never disappears under the player', () => {
  test('the goal star is drawn whether or not the player stands on it; the start arrow yields to the player (the player is the start)', () => {
    expect(shouldDrawEndpointMarker('goal', false)).toBe(true);
    expect(shouldDrawEndpointMarker('goal', true)).toBe(true);
    expect(shouldDrawEndpointMarker('start', false)).toBe(true);
    expect(shouldDrawEndpointMarker('start', true)).toBe(false);
  });

  test('draw order is start, goal star, player: the player marker is painted over the star', () => {
    expect([...ENDPOINT_MARKER_DRAW_ORDER]).toEqual(['start', 'goal', 'player']);
  });

  test('the player core turns translucent over the goal (the star shows through), eases in while gliding on, and is untouched elsewhere', () => {
    expect(resolvePlayerCoreAlphaScale(0)).toBe(1);
    expect(resolvePlayerCoreAlphaScale(1)).toBeCloseTo(GOAL_OVERLAP_CORE_ALPHA, 12);
    expect(resolvePlayerCoreAlphaScale(0.5)).toBeGreaterThan(GOAL_OVERLAP_CORE_ALPHA);
    expect(resolvePlayerCoreAlphaScale(0.5)).toBeLessThan(1);
    expect(resolvePlayerCoreAlphaScale(Number.NaN)).toBe(1);
    expect(resolvePlayerCoreAlphaScale(7)).toBeCloseTo(GOAL_OVERLAP_CORE_ALPHA, 12);
    // the player stays the dominant thing on the tile: the core keeps well over a third of its opacity
    expect(GOAL_OVERLAP_CORE_ALPHA).toBeGreaterThanOrEqual(0.35);
    expect(GOAL_OVERLAP_CORE_ALPHA).toBeLessThan(1);
  });

  describe('the scene wiring (source pins)', () => {
    const scene = read('src/scenes/MenuScene.ts');
    const fillStart = scene.indexOf('private fillPlayDynamicMarkerTile(');
    const markerFn = scene.slice(fillStart, scene.indexOf('// Retired: drawLegacyMarkerGemCatchlight', fillStart));

    test('fillPlayDynamicMarkerTile has no early return for the goal; only the start yields, through the shared rule', () => {
      expect(markerFn).toContain('shouldDrawEndpointMarker(kind, this.player.x === point.x && this.player.y === point.y)');
      expect(markerFn).not.toContain("kind === 'goal' && this.player.x === point.x");
      // the star's alpha stays a separate multiplier (the lifecycle / reveal lane scales it); the spin is its own field
      expect(markerFn).toContain('context.opacity = Math.min(1, alpha);');
      expect(markerFn).toContain('goalStarRotation:');
    });

    test('the goal star is painted before the player marker in drawDynamicBoard, into the same Graphics, so the player is on top', () => {
      const goalAt = scene.indexOf('this.fillPlayDynamicMarkerTile(this.maze.goal,');
      const playerAt = scene.indexOf('this.fillLegacyPlayerMarkerTile(renderedPlayerPoint');
      expect(goalAt).toBeGreaterThan(-1);
      expect(playerAt).toBeGreaterThan(goalAt);
      expect(goalAt).toBeGreaterThan(scene.indexOf('private drawDynamicBoard('));
      // both are painted into boardDynamicGraphics (one Graphics: call order is z order)
      expect(markerFn).toContain('new PhaserGraphicsTileContext(this.boardDynamicGraphics)');
      expect(scene).toContain('drawPlayerMarker(this.boardDynamicGraphics, frame, {');
    });

    test('nothing gates the goal draw on a goal-reached state', () => {
      const at = scene.indexOf('this.fillPlayDynamicMarkerTile(this.maze.goal,');
      const call = scene.slice(at - 260, at + 160);
      expect(call).not.toMatch(/player\.x === this\.maze\.goal|goalReached|winTriggered|completed/);
    });

    test('the spin has its own redraw trigger on the shared colour cadence and stops under Reduce Motion', () => {
      expect(scene).toContain('private hasGoalStarSpinPendingFrame(time: number): boolean {');
      expect(scene).toContain('if (this.hasGoalStarSpinPendingFrame(time)) {');
      const fn = scene.slice(scene.indexOf('private hasGoalStarSpinPendingFrame('));
      const body = fn.slice(0, fn.indexOf('\n  }\n'));
      expect(body).toContain('isGoalStarSpinning(this.prefersLegacyReducedMotion())');
      expect(body).toContain('this.isLegacyColourRedrawDue(time)');
    });

    test('the Guide icon draws the star static (no rotation, reduced motion)', () => {
      const g = scene.slice(scene.indexOf('private drawLegacyGuideBoardMarker('));
      const body = g.slice(0, g.indexOf('\n  }\n'));
      expect(body).toContain('reducedMotion: true');
      expect(body).not.toContain('goalStarRotation');
    });
  });
});
