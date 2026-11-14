import ts from 'typescript';
import { describe, expect, test, vi } from 'vitest';
import {
  resolveLegacyDynamicMarkerInset,
  resolveLegacyDynamicTrailStrokeWidth,
  resolveLegacyEndpointMarkerRenderMetrics,
  resolveLegacyBleedOffDockVisualEligibility,
  resolveLegacyBleedOffPaths,
  resolveLegacyMenuBorderDockDirections,
  resolveLegacyMenuBorderDockFacetRect,
  resolveLegacyMenuBorderDockRenderFrames,
  resolveLegacyMenuBorderDockRenderAreas,
  resolveLegacyMenuPathRenderFrame,
  resolveLegacyMenuPathRenderFrames,
  resolveLegacyMenuPathRenderSegments,
} from '../../src/legacy-runtime/legacyMenuRender';
import {
  resolveLegacyMenuPathTitleOrbitGeometry,
  resolveLegacyMenuPathTitleOrbitPoint
} from '../../src/legacy-runtime/legacyMenuTitle';
import { resolveLegacyNavigationTarget } from '../../src/legacy-runtime/legacyMaze';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const normalizeSourceLineEndings = (source: string): string => source.replace(/\r\n?/g, '\n');

const readPngDimensions = (path: string): { height: number; width: number } => {
  const bytes = readFileSync(resolve(process.cwd(), path));
  expect(bytes.subarray(1, 4).toString('ascii')).toBe('PNG');
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20)
  };
};

vi.mock('phaser', () => ({
  default: {
    CANVAS: 'CANVAS',
    Math: {
      Clamp: (value: number, min: number, max: number) => Math.max(min, Math.min(max, value)),
      Linear: (from: number, to: number, t: number) => from + ((to - from) * t)
    },
    Scale: {
      CENTER_BOTH: 'CENTER_BOTH',
      RESIZE: 'RESIZE'
    },
    Scene: class {}
  }
}));

describe('resolveLegacyMenuPathRenderFrame', () => {
  test('guards deferred completion callbacks against an intervening account switch', () => {
    const menuSceneSource = normalizeSourceLineEndings(
      readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8')
    );
    const completionFlow = menuSceneSource.slice(
      menuSceneSource.indexOf('const completionAuthSnapshot = { ...this.authSnapshot };'),
      menuSceneSource.indexOf("if (surface === 'menu-demo')")
    );

    expect(completionFlow).toContain('const completionAuthSequence = this.authAccountHydrationSequence;');
    expect(completionFlow).toContain('const completionProgressionStorage = this.resolveLegacyProgressionStorage();');
    expect(completionFlow.match(/isLegacyRemoteCompletionContextCurrent\(/g)).toHaveLength(2);
    expect(completionFlow).toContain('completionAuthSnapshot,\n            completionAuthSequence,\n            this.authSnapshot,');
    expect(completionFlow).toContain('this.authAccountHydrationSequence');
    expect(completionFlow).toContain('writeLegacyProgressionState(\n              completionProgressionStorage,');

    // Wiring lane (2026-11-06): Reset progress is SERVER-FIRST. The RPC (mazer_reset_progression via
    // writeLegacyRemoteProgressionState 'replace') is awaited before any local write, a failed or
    // conflicting call returns without touching local progression, and the local effects use the keys of
    // the account the reset was requested for, guarded by the same account-switch check as completions.
    const resetFlow = menuSceneSource.slice(
      menuSceneSource.indexOf('private async resetLegacyPlayerProgression(): Promise<boolean>'),
      menuSceneSource.indexOf('private applyOverlayToggleFieldChange(')
    );
    expect(resetFlow).toContain('const snapshot = { ...this.authSnapshot };');
    expect(resetFlow).toContain('const sequence = this.authAccountHydrationSequence;');
    expect(resetFlow.match(/isLegacyRemoteCompletionContextCurrent\(/g)).toHaveLength(1);
    const awaitRpc = resetFlow.indexOf("await writeLegacyRemoteProgressionState(snapshot, this.progressionState, undefined, 'replace')");
    const failureReturn = resetFlow.indexOf('if (result === null || !result.synced) {');
    const localEffects = resetFlow.indexOf('applyLegacyProgressionResetLocalEffects(');
    const progressionAssign = resetFlow.indexOf('this.progressionState = effects.state;');
    expect(awaitRpc).toBeGreaterThan(0);
    expect(failureReturn).toBeGreaterThan(awaitRpc);
    expect(localEffects).toBeGreaterThan(failureReturn);
    expect(progressionAssign).toBeGreaterThan(localEffects);
    // Nothing local is written between the RPC and its failure return.
    expect(resetFlow.slice(awaitRpc, resetFlow.indexOf('return false;', failureReturn))).not.toMatch(/writeLegacyProgressionState|applyLegacyProgressionResetLocalEffects|this\.progressionState =/);
    expect(resetFlow).toContain('failure: classifyLegacyProgressionResetFailure(result)');
    expect(menuSceneSource).not.toContain("private syncLegacyRemoteProgressionState(mode: 'replace'): void");
  });

  test('keeps semantic source assertions identical across LF and CRLF checkouts', () => {
    const semanticSource = 'first line\nsecond line\n';

    expect(normalizeSourceLineEndings(semanticSource)).toBe(semanticSource);
    expect(normalizeSourceLineEndings(semanticSource.replaceAll('\n', '\r\n'))).toBe(semanticSource);
    expect(normalizeSourceLineEndings('first line\r\nchanged line\r\n')).not.toBe(semanticSource);
  });

  test('caps active Phaser rendering to mobile-friendly 60 FPS', () => {
    const phaserConfigSource = readFileSync(resolve(process.cwd(), 'src/boot/phaserConfig.ts'), 'utf8');
    const canvasResolutionSource = readFileSync(resolve(process.cwd(), 'src/boot/canvasResolution.ts'), 'utf8');
    const baseCssSource = readFileSync(resolve(process.cwd(), 'src/styles/base.css'), 'utf8');

    expect(phaserConfigSource).toContain('type: Phaser.CANVAS');
    expect(canvasResolutionSource).toContain('export const MAZER_CANVAS_RESOLUTION_MAX = 3;');
    expect(canvasResolutionSource).toContain('export const resolveMazerCanvasResolution =');
    expect(canvasResolutionSource).toContain('export const resolveMazerCanvasBackingResolution =');
    expect(canvasResolutionSource).toContain('export const applyMazerCanvasBackingResolution =');
    expect(phaserConfigSource).not.toContain('resolution: resolveMazerCanvasResolution()');
    expect(phaserConfigSource).toContain('pixelArt: false');
    expect(phaserConfigSource).toContain('antialias: true');
    expect(phaserConfigSource).toContain('roundPixels: true');
    expect(phaserConfigSource).toContain('autoRound: true');
    expect(baseCssSource).toContain('image-rendering: auto;');
    expect(baseCssSource).not.toContain('image-rendering: pixelated;');
    expect(baseCssSource).not.toContain('image-rendering: crisp-edges;');
    expect(phaserConfigSource).toContain('fps: {');
    expect(phaserConfigSource).toContain('target: 60');
    expect(phaserConfigSource).toContain('min: 30');
    expect(phaserConfigSource).not.toContain('forceSetTimeOut: true');
  });

  test('keeps the Settings and Pause overlays compact, player-facing, and grouped by purpose', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8').replace(/\r\n/g, '\n');
    const entry = (signature: string): string => {
      const start = menuSceneSource.indexOf(signature);
      return menuSceneSource.slice(start, menuSceneSource.indexOf('\n  }\n', start));
    };
    const buildOptionsSource = entry('private buildOptionsOverlay(): void {');
    const buildPauseSource = entry('private buildPauseOverlay(): void {');
    const sheetSource = entry('private buildLegacySettingsSheetOverlay(context: LegacySettingsContext): void {');
    const guideSource = entry('private buildLegacyGuideSheetOverlay(context: LegacySettingsContext): void {');

    // Wiring lane (2026-11-06): ONE painter for both contexts. The Guide is a sheet opened from the
    // `How to play` row (not a GUIDE dropdown), painted from legacyGuideContent.ts.
    expect(buildOptionsSource).toContain("this.buildLegacySettingsSheetOverlay('menu')");
    expect(buildPauseSource).toContain("this.buildLegacySettingsSheetOverlay('pause')");
    expect(sheetSource).toContain('buildLegacySettingsSheetPlan({');
    expect(sheetSource).toContain('this.buildLegacyGuideSheetOverlay(context);');
    expect(sheetSource).toContain('settingsExpanded: this.pauseSettingsExpanded,');
    expect(menuSceneSource).not.toContain('createLegacyOptionsInfoSection');
    expect(menuSceneSource).not.toContain('createLegacyOptionsGuideHeaderButton');
    expect(menuSceneSource).not.toContain('createLegacyOptionsSessionActionBar');
    expect(menuSceneSource).not.toContain("'GUIDE',");
    expect(guideSource).toContain('buildLegacyGuideSheetModel(context,');
    expect(guideSource).toContain('buildLegacyGuideSheetPlan({');
    expect(guideSource).not.toContain('includeCompassRow');
    expect(guideSource).not.toContain("'begin at gold'");
    expect(guideSource).not.toContain("'Player • green trail'");
    expect(guideSource).not.toContain("'Score • run quality'");
    expect(guideSource).not.toContain('activeTargetComplexity');
    expect(guideSource).not.toContain('measuredMazeComplexity');
    expect(guideSource).not.toContain('drawChip(');
    expect(menuSceneSource).not.toContain('drawLegacyCompassGlyph');
    expect(menuSceneSource).toContain('private drawLegacyGuideIcon(');
    expect(menuSceneSource).toContain('private createLegacySheetHeading(');
    expect(menuSceneSource).not.toContain("label: 'High Contrast'");
  });

  test('aligns title orbit diamonds through the fixed top and bottom crown diamonds', () => {
    const geometry = resolveLegacyMenuPathTitleOrbitGeometry(120, 40, 260, 70, 10);
    const topCenter = resolveLegacyMenuPathTitleOrbitPoint(geometry, 0.125);
    const bottomCenter = resolveLegacyMenuPathTitleOrbitPoint(geometry, 0.625);

    expect(topCenter).toEqual({ x: geometry.centerX, y: geometry.crownTop });
    expect(bottomCenter).toEqual({ x: geometry.centerX, y: geometry.crownBottom });
    expect(geometry.top).toBe(geometry.crownTop);
    expect(geometry.bottom).toBe(geometry.crownBottom);
  });

  test('bridges connected neighbors to tile edges for legacy trench continuity', () => {
    const maze = {
      width: 3,
      height: 3,
      grid: [
        [false, false, false],
        [true, true, true],
        [false, false, false]
      ]
    };

    expect(resolveLegacyMenuPathRenderFrame(maze, { x: 1, y: 1 }, 20)).toEqual({
      leftInset: 0,
      topInset: 2,
      width: 20,
      height: 16
    });
  });

  test('keeps closed-edge insets where the path does not continue', () => {
    const maze = {
      width: 3,
      height: 3,
      grid: [
        [false, false, false],
        [false, true, false],
        [false, true, false]
      ]
    };

    expect(resolveLegacyMenuPathRenderFrame(maze, { x: 1, y: 1 }, 20)).toEqual({
      leftInset: 2,
      topInset: 2,
      width: 16,
      height: 18
    });
  });

  test('docks non-corner border paths into the board border instead of capping them', () => {
    const oneSidedMaze = {
      width: 3,
      height: 3,
      grid: [
        [false, false, false],
        [true, false, false],
        [false, false, false]
      ]
    };

    expect(resolveLegacyMenuBorderDockDirections(oneSidedMaze, { x: 0, y: 1 })).toEqual([]);

    const maze = {
      width: 3,
      height: 3,
      grid: [
        [false, false, false],
        [true, true, true],
        [false, false, false]
      ]
    };

    expect(resolveLegacyMenuBorderDockDirections(maze, { x: 0, y: 1 })).toEqual(['left']);
    expect(resolveLegacyMenuBorderDockDirections(maze, { x: 2, y: 1 })).toEqual(['right']);
    expect(resolveLegacyMenuPathRenderFrame(maze, { x: 0, y: 1 }, 20)).toEqual({
      leftInset: 0,
      topInset: 2,
      width: 20,
      height: 16
    });
    expect(resolveLegacyMenuPathRenderFrames(maze, { x: 0, y: 1 }, 20)).toEqual({
      edge: {
        leftInset: 0,
        topInset: 2,
        width: 20,
        height: 16
      },
      core: {
        leftInset: 0,
        topInset: 3,
        width: 20,
        height: 14
      }
    });
    expect(resolveLegacyMenuPathRenderSegments(maze, { x: 0, y: 1 }, 20).edge).toContainEqual({
      leftInset: 0,
      topInset: 2,
      width: 18,
      height: 16
    });
  });

  test('classifies only orthogonal legal opposite-edge paths as bleed-off continuations', () => {
    const maze = {
      width: 5,
      height: 5,
      grid: [
        [false, false, true, false, false],
        [false, false, true, false, false],
        [true, true, true, true, true],
        [false, false, true, false, false],
        [false, false, true, false, false]
      ]
    };

    expect(resolveLegacyBleedOffPaths(maze, { x: 0, y: 2 })).toEqual([
      { source: { x: 0, y: 2 }, destination: { x: 4, y: 2 }, direction: 'left' }
    ]);
    expect(resolveLegacyNavigationTarget(maze, { x: 0, y: 2 }, -1, 0)).toEqual({ x: 4, y: 2 });
    expect(resolveLegacyBleedOffPaths(maze, { x: 2, y: 0 })).toEqual([
      { source: { x: 2, y: 0 }, destination: { x: 2, y: 4 }, direction: 'top' }
    ]);
    expect(resolveLegacyNavigationTarget(maze, { x: 2, y: 0 }, 0, -1)).toEqual({ x: 2, y: 4 });
    expect(resolveLegacyBleedOffPaths(maze, { x: 0, y: 0 })).toEqual([]);
  });

  test('renders every legal bleed-off opening even when several share one side or sit adjacently', () => {
    const maze = {
      width: 7,
      height: 7,
      grid: Array.from({ length: 7 }, (_, y) => Array.from({ length: 7 }, (_, x) => (
        ((x === 0 || x === 6) && [1, 2, 4].includes(y))
        || ((y === 0 || y === 6) && [1, 3, 4].includes(x))
      )))
    };

    expect([...resolveLegacyBleedOffDockVisualEligibility(maze)].sort()).toEqual([
      '0,1', '0,2', '0,4',
      '1,0', '1,6',
      '3,0', '3,6',
      '4,0', '4,6',
      '6,1', '6,2', '6,4'
    ]);
  });

  test('keeps folded-corner border cells capped so the corner facets stay clean', () => {
    const maze = {
      width: 3,
      height: 3,
      grid: [
        [true, false, false],
        [false, false, false],
        [false, false, false]
      ]
    };

    expect(resolveLegacyMenuBorderDockDirections(maze, { x: 0, y: 0 })).toEqual([]);
    expect(resolveLegacyMenuPathRenderFrame(maze, { x: 0, y: 0 }, 20)).toEqual({
      leftInset: 2,
      topInset: 2,
      width: 16,
      height: 16
    });
  });

  test('splits top edge border docks around the top-center notch reserve', () => {
    const areas = resolveLegacyMenuBorderDockRenderAreas('top', {
      leftInset: 0,
      topInset: 0,
      width: 30,
      height: 30
    }, {
      boardLeft: 0,
      boardTop: 0,
      boardWidth: 100,
      boardHeight: 100,
      cornerGuardSize: 18,
      materialTileSize: 30,
      mazeLeft: 6,
      mazeTop: 6,
      mazeWidth: 88,
      mazeHeight: 88,
      tileRect: {
        left: 35,
        top: 6,
        width: 30,
        height: 30
      },
      topCenterNotch: {
        bottom: 12,
        left: 42,
        right: 58,
        top: -3
      }
    });

    expect(areas.length).toBe(2);
    expect(areas.every((area) => area.right <= 42 || area.left >= 58)).toBe(true);
  });

  test('keeps every border dock in one direction-owned corridor frame across tile sizes', () => {
    for (const tileSize of [1, 2, 3, 7, 20, 31]) {
      for (const direction of ['left', 'right', 'top', 'bottom'] as const) {
        const frames = resolveLegacyMenuBorderDockRenderFrames(direction, tileSize);
        const horizontalTravel = direction === 'left' || direction === 'right';
        const edgeCrossStart = horizontalTravel ? frames.edge.topInset : frames.edge.leftInset;
        const edgeCrossSpan = horizontalTravel ? frames.edge.height : frames.edge.width;
        const coreCrossStart = horizontalTravel ? frames.core.topInset : frames.core.leftInset;
        const coreCrossSpan = horizontalTravel ? frames.core.height : frames.core.width;

        expect(horizontalTravel ? frames.edge.leftInset : frames.edge.topInset).toBe(0);
        expect(horizontalTravel ? frames.core.leftInset : frames.core.topInset).toBe(0);
        expect(horizontalTravel ? frames.edge.width : frames.edge.height).toBe(tileSize);
        expect(horizontalTravel ? frames.core.width : frames.core.height).toBe(tileSize);
        expect(edgeCrossSpan).toBeGreaterThanOrEqual(1);
        expect(coreCrossSpan).toBeGreaterThanOrEqual(1);
        expect(coreCrossStart).toBeGreaterThanOrEqual(edgeCrossStart);
        expect(coreCrossStart + coreCrossSpan).toBeLessThanOrEqual(edgeCrossStart + edgeCrossSpan);
        expect(coreCrossStart * 2 + coreCrossSpan).toBe(tileSize);
      }
    }
  });

  test('projects base, facet, and glow onto the exact same one-corridor dock band at DPR 1, 2, and 3', () => {
    const direction = 'left' as const;
    const frame = resolveLegacyMenuBorderDockRenderFrames(direction, 20).edge;

    for (const dpr of [1, 2, 3]) {
      const tileRect = { left: 20 * dpr, top: 40 * dpr, width: 20 * dpr, height: 20 * dpr };
      const options = {
        boardLeft: 0,
        boardTop: 0,
        boardWidth: 200 * dpr,
        boardHeight: 200 * dpr,
        continuationLength: 20 * dpr,
        materialTileSize: 20,
        tileRect
      };
      const [outer] = resolveLegacyMenuBorderDockRenderAreas(direction, frame, {
        ...options,
        cornerGuardSize: 0,
        mazeLeft: tileRect.left,
        mazeTop: tileRect.top,
        mazeWidth: 160 * dpr,
        mazeHeight: 160 * dpr
      });
      const facet = resolveLegacyMenuBorderDockFacetRect(direction, frame, options);

      expect(outer).toBeDefined();
      expect(facet).not.toBeNull();
      expect([outer!.top, outer!.bottom]).toEqual([facet!.top, facet!.top + facet!.height]);
      expect(outer!.bottom - outer!.top).toBe(16 * dpr);
      expect(outer!.left).toBe(-20 * dpr);
      expect(outer!.right).toBe(tileRect.left);
    }
  });
  test('extends border docks into the board edge frame and rails near folded corners', () => {
    const commonOptions = {
      boardLeft: 0,
      boardTop: 0,
      boardWidth: 100,
      boardHeight: 100,
      cornerGuardSize: 18,
      materialTileSize: 6,
      mazeLeft: 5,
      mazeTop: 5,
      mazeWidth: 90,
      mazeHeight: 90
    };
    const leftFrame = {
      leftInset: 0,
      topInset: 1,
      width: 5,
      height: 4
    };

    expect(resolveLegacyMenuBorderDockRenderAreas('left', leftFrame, {
      ...commonOptions,
      tileRect: {
        left: 5,
        top: 40,
        width: 6,
        height: 6
      }
    })).toEqual([
      {
        left: -1,
        top: 41,
        right: 5,
        bottom: 45
      }
    ]);

    expect(resolveLegacyMenuBorderDockRenderAreas('left', leftFrame, {
      ...commonOptions,
      tileRect: {
        left: 5,
        top: 6,
        width: 6,
        height: 6
      }
    })).toEqual([
      {
        left: -1,
        top: 7,
        right: 5,
        bottom: 11
      }
    ]);

    expect(resolveLegacyMenuBorderDockRenderAreas('top', {
      leftInset: 1,
      topInset: 0,
      width: 4,
      height: 5
    }, {
      ...commonOptions,
      tileRect: {
        left: 6,
        top: 5,
        width: 6,
        height: 6
      }
    })).toEqual([
      {
        left: 7,
        top: -1,
        right: 11,
        bottom: 5
      }
    ]);
  });

  test('extends approved bleed-off continuations beyond the visible board frame', () => {
    const areas = resolveLegacyMenuBorderDockRenderAreas('right', {
      leftInset: 0,
      topInset: 0,
      width: 6,
      height: 6
    }, {
      boardLeft: 10,
      boardTop: 20,
      boardWidth: 100,
      boardHeight: 100,
      cornerGuardSize: 18,
      continuationLength: 4,
      materialTileSize: 6,
      mazeLeft: 15,
      mazeTop: 25,
      mazeWidth: 90,
      mazeHeight: 90,
      tileRect: { left: 99, top: 50, width: 6, height: 6 }
    });

    expect(areas).toEqual([{ left: 105, top: 50, right: 114, bottom: 56 }]);
  });

  test('anchors a bottom bleed-off continuation to the rendered tile edge at rounded board sizes', () => {
    const areas = resolveLegacyMenuBorderDockRenderAreas('bottom', {
      leftInset: 0,
      topInset: 0,
      width: 6,
      height: 6
    }, {
      boardLeft: 10,
      boardTop: 20,
      boardWidth: 100,
      boardHeight: 100,
      cornerGuardSize: 18,
      continuationLength: 4,
      materialTileSize: 6,
      // The aggregate maze bottom is 116, while the final pixel row for this
      // 5px bottom tile ends at 115. Starting from mazeBottom creates the
      // one-pixel gap reported in play mode.
      mazeLeft: 15,
      mazeTop: 25,
      mazeWidth: 90,
      mazeHeight: 91,
      tileRect: { left: 50, top: 110, width: 6, height: 5 }
    });

    expect(areas).toEqual([{ left: 50, top: 115, right: 56, bottom: 124 }]);
  });

  test('anchors every rendered dock facet to the exact rounded terminal-tile band', () => {
    const frame = { leftInset: 1, topInset: 1, width: 4, height: 4 };
    const options = {
      boardLeft: 10,
      boardTop: 20,
      boardWidth: 100,
      boardHeight: 100,
      continuationLength: 4,
      materialTileSize: 6,
      // Fractional source geometry reproduces the rounding split that let a
      // flat dock and its visible 3D facet begin on different pixel rows.
      tileRect: { left: 49.5, top: 109.5, width: 6.25, height: 5.25 }
    };

    expect(resolveLegacyMenuBorderDockFacetRect('left', frame, options)).toEqual({
      height: 3,
      left: 6,
      top: 110.5,
      width: 44.5
    });
    expect(resolveLegacyMenuBorderDockFacetRect('right', frame, options)).toEqual({
      height: 3,
      left: 54.5,
      top: 110.5,
      width: 59.5
    });
    expect(resolveLegacyMenuBorderDockFacetRect('top', frame, options)).toEqual({
      height: 94.5,
      left: 50.5,
      top: 16,
      width: 4
    });
    expect(resolveLegacyMenuBorderDockFacetRect('bottom', frame, options)).toEqual({
      height: 10.5,
      left: 50.5,
      top: 113.5,
      width: 4
    });
  });

  test('bridges the light core across connected neighbors for a less checkerboarded slab read', () => {
    const maze = {
      width: 3,
      height: 3,
      grid: [
        [false, false, false],
        [true, true, true],
        [false, false, false]
      ]
    };

    expect(resolveLegacyMenuPathRenderFrames(maze, { x: 1, y: 1 }, 20)).toEqual({
      edge: {
        leftInset: 0,
        topInset: 2,
        width: 20,
        height: 16
      },
      core: {
        leftInset: 0,
        topInset: 3,
        width: 20,
        height: 14
      }
    });
  });

  test('preserves four-way joins as solid connected intersections', () => {
    const maze = {
      width: 3,
      height: 3,
      grid: [
        [false, true, false],
        [true, true, true],
        [false, true, false]
      ]
    };

    expect(resolveLegacyMenuPathRenderFrames(maze, { x: 1, y: 1 }, 20)).toEqual({
      edge: {
        leftInset: 0,
        topInset: 0,
        width: 20,
        height: 20
      },
      core: {
        leftInset: 0,
        topInset: 0,
        width: 20,
        height: 20
      }
    });
  });

  test('renders four-way menu joins as corridor segments instead of one filled tile', () => {
    const maze = {
      width: 3,
      height: 3,
      grid: [
        [false, true, false],
        [true, true, true],
        [false, true, false]
      ]
    };

    const segments = resolveLegacyMenuPathRenderSegments(maze, { x: 1, y: 1 }, 20);

    expect(segments.edge).toEqual([
      { leftInset: 2, topInset: 2, width: 16, height: 16 },
      { leftInset: 0, topInset: 2, width: 18, height: 16 },
      { leftInset: 2, topInset: 2, width: 18, height: 16 },
      { leftInset: 2, topInset: 0, width: 16, height: 18 },
      { leftInset: 2, topInset: 2, width: 16, height: 18 }
    ]);
    expect(segments.core).toEqual([
      { leftInset: 3, topInset: 3, width: 14, height: 14 },
      { leftInset: 0, topInset: 3, width: 17, height: 14 },
      { leftInset: 3, topInset: 3, width: 17, height: 14 },
      { leftInset: 3, topInset: 0, width: 14, height: 17 },
      { leftInset: 3, topInset: 3, width: 14, height: 17 }
    ]);
  });

  test('keeps phone-sized tiles separated instead of merging adjacent cells into blocks', () => {
    const maze = {
      width: 3,
      height: 3,
      grid: [
        [false, true, false],
        [true, true, true],
        [false, true, false]
      ]
    };

    const segments = resolveLegacyMenuPathRenderSegments(maze, { x: 1, y: 1 }, 6);

    expect(segments.edge[0]).toEqual({ leftInset: 1, topInset: 1, width: 4, height: 4 });
    expect(segments.core[0]).toEqual({ leftInset: 2, topInset: 2, width: 2, height: 2 });
  });

  test('keeps rounded 4px mobile tiles corridor-shaped instead of full-block filled', () => {
    const maze = {
      width: 3,
      height: 3,
      grid: [
        [false, true, false],
        [true, true, true],
        [false, true, false]
      ]
    };

    const segments = resolveLegacyMenuPathRenderSegments(maze, { x: 1, y: 1 }, 4);

    expect(segments.edge[0]).toEqual({ leftInset: 1, topInset: 1, width: 2, height: 2 });
    expect(segments.core[0]).toEqual({ leftInset: 1, topInset: 1, width: 2, height: 2 });
    expect(segments.edge[0]?.width).toBeLessThan(4);
    expect(segments.edge[0]?.height).toBeLessThan(4);
  });

  test('keeps the menu board in the clean 2d maze-material lane', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');
    const legacyMenuRenderSource = readFileSync(resolve(process.cwd(), 'src/legacy-runtime/legacyMenuRender.ts'), 'utf8');

    expect(menuSceneSource).toContain('const LEGACY_BOARD_GRID_ALPHA = 0;');
    expect(menuSceneSource).toContain('const LEGACY_MENU_PANEL_SHADOW_ALPHA = 0;');
    expect(menuSceneSource).toContain('const LEGACY_MENU_PATH_CORE = mixLegacyIridescentColor(cyberArcadeMaterial.path.core, 0x000000, LEGACY_PATH_CORE_EYE_COMFORT_DIM_AMOUNT);');
    expect(menuSceneSource).toContain('const LEGACY_MENU_PATH_EDGE = cyberArcadeMaterial.path.edge;');
    expect(menuSceneSource).toContain('const LEGACY_MENU_PATH_EDGE_ALPHA = 0.58;');
    expect(menuSceneSource).not.toContain('LEGACY_MENU_PATH_RELIEF_SHADOW');
    expect(menuSceneSource).not.toContain('LEGACY_MENU_PATH_RELIEF_OFFSET_RATIO');
    expect(menuSceneSource).not.toContain('LEGACY_BOARD_SIGIL_CORNER_FACET_SIZE_RATIO');
    expect(menuSceneSource).not.toContain('LEGACY_BOARD_SIGIL_CORNER_FACET_SHIMMER_MS');
    expect(menuSceneSource).not.toContain('LEGACY_BOARD_SIGIL_CORNER_FACET_FRAME_MS');
    expect(menuSceneSource).toContain('const LEGACY_BOARD_MAZE_SAFE_INSET_RATIO = 0.018;');
    expect(menuSceneSource).toContain('const LEGACY_BOARD_MAZE_SAFE_INSET_MIN = 4;');
    expect(menuSceneSource).toContain('const LEGACY_BOARD_MAZE_SAFE_INSET_MAX = 7;');
    expect(menuSceneSource).toContain('if (isMenuMode && LEGACY_BOARD_GRID_ALPHA > 0) {');
    expect(menuSceneSource).toContain('Keep the board top-down: no pseudo bevel/highlight pass over the maze.');
    // Play mode no longer gets a slab backdrop/edge frame/glass tint either
    // -- that was the border-and-translucent-background box around the
    // whole maze that menu had already dropped; both surfaces now read as
    // tiles floating directly on the scene.
    expect(menuSceneSource).not.toContain('fillLegacyBoardEdgeFrame');
    expect(menuSceneSource).not.toContain('LEGACY_PLAY_BOARD_FILL');
    expect(menuSceneSource).not.toContain('LEGACY_PLAY_BOARD_EDGE');
    expect(menuSceneSource).not.toContain('LEGACY_PLAY_BOARD_GLASS_ALPHA');
    expect(menuSceneSource).toContain('private resolveLegacyMazeRenderFrame(');
    expect(menuSceneSource).toContain('const mazeRenderFrame = this.resolveLegacyMazeRenderFrame(boardLeft, boardTop, boardWidth, boardHeight);');
    expect(menuSceneSource).toContain('const mazeLeft = mazeRenderFrame.boardLeft;');
    expect(menuSceneSource).toContain('const mazeTop = mazeRenderFrame.boardTop;');
    expect(menuSceneSource).not.toContain('this.boardStaticGraphics.fillRect(boardLeft - 1, boardTop - 1, boardSize + 2, boardSize + 2);');
    expect(legacyMenuRenderSource).toContain('const LEGACY_MENU_TRENCH_EDGE_INSET_RATIO = 0.14;');
    expect(legacyMenuRenderSource).toContain('const LEGACY_MENU_TRENCH_CORE_INSET_RATIO = 0.08;');
    expect(legacyMenuRenderSource).toContain('const resolveLegacyMenuTrenchInset = (tileSize: number, ratio: number): number => {');
    // Chip wiring (2026-11-06): the per-tile drawPathPoint loop is gone; drawBoardPaths hands the board
    // to the baked tile layer and the build/deconstruct reveal is a rank mask (resolveBoardTileReveal).
    expect(menuSceneSource).not.toContain('const drawPathPoint = (point: LegacyPoint): void => {');
    expect(menuSceneSource).toContain('this.boardTileLayer.update({');
    expect(menuSceneSource).toContain('reveal: this.resolveBoardTileReveal(),');
    // drawLegacyPathMaterialTile survives for the menu AI-memory overlay tiles (fillLegacyDynamicPathTile).
    expect(menuSceneSource).toContain('private drawLegacyPathMaterialTile(');
    expect(menuSceneSource).toContain('private resolveLegacyPixelTileRect(');
    expect(menuSceneSource).toContain('const tileRect = this.resolveLegacyPixelTileRect(mazeLeft, mazeTop, tileSize, { x, y });');
    expect(menuSceneSource).toContain('const tileRect = this.resolveLegacyPixelTileRect(originX, originY, tileSize, point);');
    expect(menuSceneSource).toContain('graphics.fillStyle(options.coreColor, options.coreAlpha);');
    expect(menuSceneSource).toContain('graphics.fillRect(tileRect.left, tileRect.top, tileRect.width, tileRect.height);');
    expect(menuSceneSource).toContain('private drawLegacyPathTileFacet(');
    expect(menuSceneSource).not.toContain('resolveLegacyMenuBorderDockFacetRect');
    expect(menuSceneSource).not.toContain('const top = mazeBottom;');
    expect(menuSceneSource).not.toContain('this.fillLegacyPathConnectorSeams(');
    expect(menuSceneSource).not.toContain('private fillLegacyPathConnectorSeams(');
    expect(menuSceneSource).toContain('const LEGACY_PATH_CONNECTOR_SEAM_PAD_RATIO = 0.16;');
    expect(menuSceneSource).toContain('const LEGACY_PATH_CONNECTOR_SEAM_EDGE_ALPHA_RATIO = 0.72;');
    expect(menuSceneSource).toContain('const LEGACY_PATH_CONNECTOR_SEAM_CORE_ALPHA_RATIO = 0.94;');
    expect(menuSceneSource).toContain('Math.round(originX + (point.x * tileSize))');
    // Rank mask: a cell is shown while its rank in the reveal order is below the live tile limit.
    expect(menuSceneSource).toContain('isBoardCellRevealed(tileLimit, rowLimit, ranks === null ? -1 : ranks[index]!, y)');
    expect(menuSceneSource).toContain('renderBounds: mazeRenderBounds');
    expect(menuSceneSource).toContain('renderSafeInset: mazeRenderFrame.safeInset');
    expect(menuSceneSource).toContain('this.boardStaticGraphics.fillStyle(LEGACY_PLAY_WALL_FILL, LEGACY_PLAY_WALL_GLASS_ALPHA);');
    expect(menuSceneSource).not.toContain('drawLegacyBoardSigilBorder');
    expect(menuSceneSource).not.toContain('drawLegacyBoardCornerFacetShimmer');
    expect(menuSceneSource).not.toContain('hasLegacyBoardCornerShimmerPendingFrame');
    expect(menuSceneSource).not.toContain('resolveLegacyBoardCornerFacetAlpha');
    expect(menuSceneSource).toContain('cornerFacet: {');
    expect(menuSceneSource).toContain('animated: false');
    expect(menuSceneSource).toContain('shimmerPeriodMs: 0');
    expect(menuSceneSource).toContain('visible: false');
    // The eight-origin transfer volley (drawLegacyPlayerTransferEnergy) was
    // intentionally replaced by the one all-8-diamond laser system in both
    // directions (arrival: diamonds -> spawn; departure: player -> diamonds).
    expect(menuSceneSource).not.toContain('drawLegacyPlayerTransferEnergy');
    expect(menuSceneSource).toContain('private drawLegacyEdgeLasers(');
    expect(menuSceneSource).toContain('this.drawLegacyEdgeLasers(time, mazeLeft, mazeTop, mazeTileSize, renderedPlayerPoint, playerSpawnBurst);');
    expect(menuSceneSource).toContain("direction: 'outward'");
    expect(menuSceneSource).toContain("direction: 'inward'");
    expect(menuSceneSource).toContain('resolveLegacyPlayerTransferVisualState({');
    // Pinned to the same exact intro-clock instant as the spawn laser (the
    // edge paths appear atomically just before it), not to a frame-stepped
    // build-remaining estimate.
    expect(menuSceneSource).toContain('this.playerTransferEnergyDeliveryStartedAtMs ??= laserStartedAtMs;');
    expect(menuSceneSource).toContain('playerTransfer: LegacyPlayerTransferVisualState;');
    expect(menuSceneSource).toContain('playerTransfer,');
    expect(menuSceneSource).toContain('this.isLegacyMenuDeconstructHandoffActive(time)');
    expect(menuSceneSource).toContain('this.isLegacyMenuDeconstructVisualHandoffReady()');
    expect(menuSceneSource).toContain('handoffEndsAtMs: this.menuStaticDeconstructZeroHoldStartedAtMs === null');
    expect(menuSceneSource).toContain('zeroHoldStartedAtMs: this.menuStaticDeconstructZeroHoldStartedAtMs === null');
    expect(menuSceneSource).toContain('titleVisiblePieces');
    expect(menuSceneSource).toContain('titleFullyDeconstructed');
    // The outbound laser and the arrival laser are the ONE edgeMarkers laser
    // (replacing the eight-beam rainbow volley and its per-origin
    // resolveLegacyIridescentTrailColor stops): palette tokens only, drawn
    // from the shared edge stations.
    expect(menuSceneSource).toContain('drawEdgeBeams(this.spawnLaserGraphics, {');
    expect(menuSceneSource).not.toContain('const beamColor = resolveLegacyIridescentTrailColor(index, origins.length, time);');
    const edgeMarkersSource = readFileSync(resolve(process.cwd(), 'src/render/edgeMarkers.ts'), 'utf8');
    // colour contract: the border is the live trail colour and the inside / the beams are the player colour,
    // both from the single trail-palette module (no fixed mint / cyan any more)
    expect(edgeMarkersSource).toContain('PLAYER_COLOR');
    expect(edgeMarkersSource).toContain('resolveTrailPaletteBorderColor');
    expect(edgeMarkersSource).not.toContain('rail.mint');
    expect(edgeMarkersSource).not.toContain('rail.cyan');
    expect(edgeMarkersSource).not.toMatch(/0x[0-9a-fA-F]{6}/);
    // MAZER-VIS-017: the shard/rune/sigil drawing code is gone; the backdrop draws round stars only.
    for (const removed of ['drawLegacyBackdropSigils', 'drawLegacyBackdropShard', 'drawLegacyBackdropRune', 'rotateBackdropPoint']) {
      expect(menuSceneSource).not.toContain(removed);
    }
    expect(legacyMenuRenderSource).toContain('resolveLegacyMenuPathStrokeSegments');
    expect(menuSceneSource).toContain('skip it entirely in menu mode. Play mode\'s gameplay');
  });

  test('restores a restrained animated backdrop without a full-screen perimeter frame', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');
    const backdropSource = readFileSync(resolve(process.cwd(), 'src/legacy-runtime/legacyMenuBackdrop.ts'), 'utf8');

    expect(backdropSource).toContain('fieldColor: cyberArcadeMaterial.substrate.field');
    expect(backdropSource).toContain('fieldColor: cyberArcadeMaterial.substrate.fieldRaised');
    expect(menuSceneSource).not.toContain('legacyPrecisionArcadeDecorationsEnabled');
    expect(menuSceneSource).not.toContain('this.backdropGraphics.strokeRoundedRect(inset, inset, width - (inset * 2), height - (inset * 2), 12);');
    expect(menuSceneSource).toContain('this.stars = createLegacyMenuBackdropStars(createBackdropStarRandom()).slice(0, LEGACY_MENU_STAR_COUNT);');
    expect(menuSceneSource).toContain('const backdropMotionEnabled = this.settings.toggleAnimatedBackdrop && !this.prefersLegacyReducedMotion();');
    expect(backdropSource).toContain("LEGACY_MENU_BACKDROP_STAR_MOTION = 'radial-warp'");
    expect(backdropSource).toContain("LEGACY_MENU_BACKDROP_MOTION_PROFILE = 'visible-parallax-warp'");
    expect(backdropSource).toContain('resolveLegacyMenuBackdropWarpVector');
    expect(backdropSource).toContain('resetLegacyMenuBackdropStarNearWarpOrigin');
    expect(menuSceneSource).toContain('starMotion: LEGACY_MENU_BACKDROP_STAR_MOTION');
    expect(backdropSource).toContain('const roundBackdropNumber = (value: number): number => Math.round(value * 1000) / 1000;');
    // MAZER-VIS-027: the shard, glass shard and drift rune generators are deleted, not just unused.
    expect(backdropSource).not.toMatch(/SHARD|DRIFT_RUNE|RUNE_CYCLE|GLASS_DRIFT|DriftRune/);
    expect(backdropSource).toContain('const tailMagnitude = 0.68 + Math.min(0.28, distanceFromCenter * 0.42);');
  });

  test('keeps active play maze rendering on connected corridors instead of square debug cells', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');
    const normalizedMenuSceneSource = normalizeSourceLineEndings(menuSceneSource);
    const menuTitleDrawSource = normalizedMenuSceneSource.slice(
      normalizedMenuSceneSource.indexOf('private drawLegacyMenuPathTitle(time: number): void'),
      normalizedMenuSceneSource.indexOf('private resolveLegacyMazeRenderFrame(')
    );

    // The play-mode pale path constants went with the old tile (Chip draws one board in both modes).
    expect(menuSceneSource).not.toContain('LEGACY_PLAY_PATH_CORE');
    expect(menuSceneSource).not.toContain('LEGACY_PLAY_PATH_EDGE');
    expect(menuSceneSource).toContain('const LEGACY_PLAY_WALL_FILL = cyberArcadeMaterial.substrate.field;');
    expect(menuSceneSource).toContain('const LEGACY_PLAY_WALL_GLASS_ALPHA = 0.18;');
    expect(menuSceneSource).toContain("private pathVisualStyle: LegacyPathVisualStyle = 'corridor';");
    expect(menuSceneSource).toContain('this.pathVisualStyle = resolveLegacyPathVisualStyle(runtimeSearch);');
    expect(menuSceneSource).toContain('const dynamicTrailPathSource = this.maze;');
    expect(menuSceneSource).toContain('this.backdropDirty = true;');
    expect(menuSceneSource).toContain('pathVisualStyle: this.pathVisualStyle');
    expect(menuSceneSource).toContain('textLabels: this.resolveVisualTextLabels()');
    expect(menuSceneSource).toContain('buttons: this.uiButtons');
    expect(menuSceneSource).toContain('text: button.text');
    expect(menuSceneSource).not.toContain('LEGACY_PLAY_PATH_RELIEF_SHADOW');
    expect(menuSceneSource).toContain('private boardPathGraphics!: Phaser.GameObjects.Graphics;');
    expect(menuSceneSource).toContain('private boardPathDirty = true;');
    expect(menuSceneSource).toContain('this.boardPathGraphics = this.add.graphics();');
    expect(menuSceneSource).toContain('private drawLegacyPathMaterialTile(');
    expect(menuSceneSource).toContain('private titleGraphics!: Phaser.GameObjects.Graphics;');
    expect(menuSceneSource).toContain('this.titleGraphics = this.add.graphics();');
    expect(menuSceneSource).toContain('const LEGACY_MENU_PATH_TITLE_PRISM = cyberArcadeMaterial.rail.cyan;');
    expect(menuSceneSource).toContain('const LEGACY_MENU_PATH_TITLE_GEM = cyberArcadeMaterial.signal.playerAccent;');
    expect(menuSceneSource).toContain('const LEGACY_MENU_PATH_TITLE_FACET_WARM = cyberArcadeMaterial.signal.warning;');
    expect(menuSceneSource).toContain('const LEGACY_MENU_PATH_TITLE_SWEEP_MS = 2600;');
    expect(menuSceneSource).toContain('const LEGACY_MENU_PATH_TITLE_SWEEP_OVERSCAN_COLUMNS = 3;');
    expect(menuSceneSource).toContain('const LEGACY_MENU_PATH_TITLE_GEM_PULSE_MS = 3400;');
    // The orbit period/rotation constants are gone: the edge markers do not orbit.
    expect(menuSceneSource).not.toContain('LEGACY_MENU_PATH_TITLE_ORBIT_MS');
    expect(menuSceneSource).not.toContain('LEGACY_MENU_PATH_TITLE_ORBIT_ROTATIONS_PER_PHASE');
    expect(menuSceneSource).toContain('const LEGACY_MENU_PATH_TITLE_FRAME_MS = 33;');
    expect(menuSceneSource).not.toContain('LEGACY_MENU_PATH_TITLE_ORBIT_SIGILS');
    expect(menuSceneSource).toContain('private drawLegacyMenuPathTitle(time: number): void');
    expect(menuSceneSource).toContain('return resolveLegacyMenuTitleFontSize(this.layout.titleReserveHeight);');
    expect(menuTitleDrawSource).not.toMatch(/if \(visibleCells\.length <= 0\) \{\n\s*return;\n\s*\}/);
    expect(menuSceneSource).not.toContain('drawLegacyMenuPathTitleSigilRails');
    expect(menuSceneSource).toContain('this.drawLegacyEdgeMarkers(time);');
    expect(menuSceneSource).not.toContain('drawLegacyMenuPathTitleOrbitSigils');
    expect(menuSceneSource).toContain("type LegacyMenuPathTitleSweepMode = 'build' | 'deconstruct' | 'idle';");
    expect(menuSceneSource).toContain('interface LegacyMenuPathTitleSweepState');
    expect(menuSceneSource).toContain('private resolveLegacyMenuPathTitleSweepState(');
    expect(menuSceneSource).toContain('private resolveLegacyMenuPathTitleVisibleSweepEdge(');
    expect(menuSceneSource).toContain('private resolveLegacyMenuPathTitleVisibleSweepState(');
    expect(menuSceneSource).toContain('private resolveLegacyMenuPathTitleAnimationDirection(time: number):');
    expect(menuSceneSource).toContain('return phase <= 0.5 ? phase * 2 : (1 - phase) * 2;');
    expect(menuSceneSource).toContain('const rightmostVisibleColumn = visibleCells.reduce(');
    expect(menuSceneSource).not.toContain('drawLegacyMenuPathTitleSigilRails');
    expect(menuSceneSource).toContain("this.menuStaticDrawLifecyclePhase === 'building'");
    expect(menuSceneSource).toContain("this.menuStaticDrawLifecyclePhase === 'deconstructing'");
    expect(menuSceneSource).toContain('this.settleLegacyMenuStaticDrawStageIfComplete(time);');
    expect(menuSceneSource).toContain('rowsVisible: this.menuStaticDrawRowsVisible');
    expect(menuSceneSource).toContain('tilesVisible: this.menuStaticDrawTilesVisible');
    expect(menuSceneSource).toContain("const syncedToLifecycle = mode !== 'idle';");
    expect(menuSceneSource).toContain('private drawLegacyMenuPathTitlePrismSweep(');
    expect(menuSceneSource).toContain('private drawLegacyMenuPathTitleGemFacets(');
    // The spinning PNG sigils (orbit lifecycle, settle ease, twinkles) were
    // intentionally replaced by calm procedural edge markers.
    expect(menuSceneSource).toContain('private drawLegacyEdgeMarkers(time: number): void');
    for (const retired of [
      'resolveLegacyMenuPathTitleOrbitPhase',
      'resolveLegacyMenuPathTitleOrbitSettlePhase',
      'resolveLegacyMenuPathTitleOrbitLifecyclePhase',
      'drawLegacyMenuPathTitleOrbitSigilTwinkle',
      'suppressSpinForGameplayTransfer',
      'menuOrbitSettleStartedAtMs',
      'playerTransferBeamStripImages'
    ]) {
      expect(menuSceneSource).not.toContain(retired);
    }
    expect(menuSceneSource).not.toContain('phase * 0.62');
    expect(menuSceneSource).not.toContain('private drawLegacyMenuPathTitleDiamond(');
    expect(menuSceneSource).not.toContain('private drawLegacyMenuPathTitleSigilRails(');
    expect(menuSceneSource).toContain('private hasLegacyMenuTitleAnimationPendingFrame(time: number): boolean');
    expect(menuSceneSource).toContain('private resolveLegacyMenuPathTitleProgress(): number');
    expect(menuSceneSource).toContain('const smoothstep = (value: number): number => {');
    expect(menuSceneSource).toContain('const alpha = clamp(smoothstep(1 - (distance / 2.2)) * 0.72 * pulse * alphaScale, 0, 0.78);');
    expect(menuSceneSource).toContain('const shimmer = smoothstep(0.5 + (Math.sin((localPhase * Math.PI * 2) + (cell.order * 0.37)) * 0.5));');
    expect(menuSceneSource).not.toContain('const rotationStep = Math.floor(phase * 8);');
    expect(menuSceneSource).toContain('this.drawLegacyMenuPathTitle(time);');
    expect(menuSceneSource).toContain('resolveLegacyMenuPathTitleLayout(');
    expect(menuSceneSource).toContain('title: this.resolveLegacyMenuPathTitleDiagnostics()');
    expect(menuSceneSource).toContain('const visiblePieces = this.resolveLegacyMenuPathTitleVisiblePieces(pieceCount)');
    expect(menuSceneSource).toContain('facetCellCount: visiblePieces');
    expect(menuSceneSource).toContain('facetPulsePeriodMs: LEGACY_MENU_PATH_TITLE_GEM_PULSE_MS');
    expect(menuSceneSource).toContain('scannerMode: sweepState.mode');
    expect(menuSceneSource).toContain('scannerProgress: Number(sweepState.progress.toFixed(3))');
    expect(menuSceneSource).toContain('scannerSyncedToLifecycle: sweepState.syncedToLifecycle');
    expect(menuSceneSource).toContain('scannerAttachedToVisibleEdge: sweepState.syncedToLifecycle && visibleSweepEdge !== null');
    expect(menuSceneSource).toContain('scannerVisibleEdgeColumn: visibleSweepEdge === null');
    // Diagnostics field names are kept for consumers; the values now describe
    // the eight static edge markers (no orbit period or phase).
    expect(menuSceneSource).toContain('sigilOrbitCount: EDGE_STATION_COUNT');
    expect(menuSceneSource).toContain('sigilOrbitPeriodMs: 0');
    expect(menuSceneSource).toContain('sigilOrbitPhase: 0');
    expect(menuSceneSource).toContain('sweepPeriodMs: LEGACY_MENU_PATH_TITLE_SWEEP_MS');
    expect(menuSceneSource).toContain('animation: {');
    expect(menuSceneSource).toContain('if (this.boardPathDirty) {');
    expect(menuSceneSource).toContain('this.drawBoardPaths(time);');
    expect(menuSceneSource).toContain('else if (this.hasLegacyMenuTitleAnimationPendingFrame(time)) {');
    expect(menuSceneSource).toContain('if (this.isLegacyMenuHandoffAnimationActive(time)) {');
    expect(menuSceneSource).toContain('private isLegacyMenuHandoffAnimationActive(time: number): boolean');
    expect(menuSceneSource).toContain('private drawBoardPaths(time: number): void {');
    expect(menuSceneSource).toContain('this.drawLegacyPathMaterialTile(');
    expect(menuSceneSource).not.toContain('this.boardStaticGraphics.fillStyle(walkable ? pathGlow : wallColor');
  });

  test('keeps active play HUD minimal, with the level glyph staying separate', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');

    expect(menuSceneSource).toContain('const LEGACY_CYBER_PANEL_STROKE = cyberArcadeMaterial.rail.mint;');
    expect(menuSceneSource).not.toContain('timerShadow.setAlpha(0.7);');
    expect(menuSceneSource).not.toContain('hudFrame.timerBounds.centerX + 1');
    // The compass idea was removed from the app entirely.
    expect(menuSceneSource).not.toContain('drawLegacyCompassGlyph');
    expect(menuSceneSource).not.toContain('private drawLegacyPlayCompass(');
    expect(menuSceneSource).toContain('this.drawLegacySettingsCogControl(controls.pause, false, time);');
    expect(menuSceneSource).not.toContain('this.drawLegacyPlayTouchButton(');
    expect(menuSceneSource).not.toContain('this.hudGraphics.strokeRect(');
    // Player-facing toast/message cards were removed from the game entirely
    // -- no message box should ever appear on screen, in the play HUD or
    // in any overlay.
    expect(menuSceneSource).not.toContain('private drawLegacyPlayPlayerMessageStack(');
    expect(menuSceneSource).not.toContain('this.drawLegacyPlayPlayerMessageStack(hudFrame);');
  });

  test('keeps menu dynamic trail overlays in the legacy corridor frame instead of full square cells', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');

    expect(menuSceneSource).not.toContain('const LEGACY_MENU_DYNAMIC_TRAIL_EDGE =');
    expect(menuSceneSource).not.toContain('const LEGACY_MENU_DYNAMIC_TRAIL_CORE_RATIO =');
    expect(menuSceneSource).not.toContain('const LEGACY_MENU_DYNAMIC_TRAIL_EDGE_RATIO =');
    expect(menuSceneSource).toContain('const progressionPalette = this.resolveActiveLegacyProgressionPalette();');
    expect(menuSceneSource).toContain('this.drawLegacyProgressionBadge();');
    // The compass idea (title-screen board-notch AND play-mode HUD AND the
    // Guide legend icon) was removed from the app entirely.
    expect(menuSceneSource).not.toContain('private drawLegacyMenuCompass(');
    expect(menuSceneSource).not.toContain('this.drawLegacyMenuCompass(');
    expect(menuSceneSource).not.toContain('menuCompassBounds');
    expect(menuSceneSource).not.toContain('menuCompass: {');
    expect(menuSceneSource).not.toContain('drawLegacyCompassGlyph');
    expect(menuSceneSource).toContain('topCenterNotch: this.resolveLegacyBoardTopCenterNotchBounds(boardLeft, boardTop, boardWidth)');
    expect(menuSceneSource).not.toContain('this.boardDynamicGraphics.strokeCircle(centerX, centerY, radius);');
    expect(menuSceneSource).toContain('progressionBadge: {');
    expect(menuSceneSource).toContain('this.clearLegacyPlayerProgressionBadge();');
    expect(menuSceneSource).toContain("if (this.mode === 'menu') {");
    // The old persistent top-left level badge (drawLegacyProgressionGlyph)
    // is retired in favor of drawLegacyLevelAnnouncer's centered,
    // between-mazes announcement -- shared by both surfaces since both
    // drive the same menuStaticDrawLifecyclePhase transition.
    expect(menuSceneSource).not.toContain('private drawLegacyProgressionGlyph(');
    expect(menuSceneSource).toContain('private drawLegacyLevelAnnouncer(time: number): void');
    expect(menuSceneSource).toContain('private resolveLegacyLevelAnnouncerVisualState(time: number): { alpha: number; scale: number; revealProgress: number }');
    expect(menuSceneSource).toContain('this.drawLegacyLevelAnnouncer(time);');
    // The front door no longer shows the demo AI's own level badge (it read
    // as "your level" even though it tracks an independent, invisible AI
    // progression, not anything the player has done) -- the drawing method
    // is gone; the underlying bounds fields/diagnostics key remain (always
    // null now) since other diagnostics code still references them.
    expect(menuSceneSource).not.toContain('private drawLegacyMenuAiProgressionBadge(');
    expect(menuSceneSource).toContain("this.levelAnnouncerLabelText = this.applyLegacyUiTextCrispness(this.add.text(0, 0, 'LEVEL',");
    expect(menuSceneSource).toContain('menuAiProgressionBadge: {');
    expect(menuSceneSource).toContain("placement: 'leading'");
    expect(menuSceneSource).toContain("placement: 'trailing'");
    // No panel/border chrome function at all any more -- both the level
    // badge and the play settings cog are bare, matching the menu surface's
    // own settings cog exactly (zero chrome, not lighter chrome).
    expect(menuSceneSource).not.toContain('private drawLegacyHeaderControlChrome(');
    expect(menuSceneSource).toContain('private menuSettingsCogActive = false;');
    expect(menuSceneSource).toContain('this.menuSettingsCogActive = active;');
    expect(menuSceneSource).toContain('this.boardDynamicDirty = true;');
    expect(menuSceneSource).toContain('this.prefersLegacyReducedMotion()');
    expect(menuSceneSource).not.toContain('resolveLegacyRunStatusPanelLayout');
    expect(menuSceneSource).not.toContain('resolveLegacyProgressionBadgeText');
    expect(menuSceneSource).not.toContain('portraitMenuBadgeTextOffset');
    expect(menuSceneSource).toContain('const dynamicTrailPathSource = this.maze;');
    // Docks are part of the bake (resolveLegacyMenuBorderDockDirections feeds BoardTileDock[]); the old
    // per-tile dock fill and bleed-strip images are gone.
    expect(menuSceneSource).not.toContain('drawLegacyPathBorderDock');
    expect(menuSceneSource).toContain('docks.push({ x, y, side });');
    expect(menuSceneSource).toContain('this.trail = resolveLegacyMenuDemoTrail(');
    expect(menuSceneSource).toContain('const mazeRenderFrame = this.resolveLegacyMazeRenderFrame(');
    expect(menuSceneSource).toContain('const mazeTileSize = mazeRenderFrame.tileSize;');
    expect(menuSceneSource).toContain('pathSource: Pick<LegacyMazeSnapshot, \'grid\' | \'width\' | \'height\'>,');
    expect(menuSceneSource).toContain('LEGACY_MENU_PATH_EDGE,');
    expect(menuSceneSource).toContain('const renderedPlayerPoint = this.resolveLegacyRenderedPlayerPoint(time);');
    expect(menuSceneSource).toContain('this.fillLegacyPlayerMarkerTile(renderedPlayerPoint, mazeLeft, mazeTop, mazeTileSize');
    expect(menuSceneSource).toContain('private armLegacyPlayerVisualMotion(');
    expect(menuSceneSource).toContain('isLegacyWrappedStepTransition,');
    expect(menuSceneSource).toContain('private isLegacyPlayerVisualWrapMove(from: LegacyPoint, to: LegacyPoint): boolean');
    expect(menuSceneSource).toContain('if (this.isLegacyPlayerVisualWrapMove(from, to)) {');
    expect(menuSceneSource).toContain('return isLegacyWrappedStepTransition(from, to);');
    expect(menuSceneSource).toContain('private hasLegacyPlayerVisualMotionPendingFrame(time: number): boolean');
    // the marker is centred on the device-snapped tile centre (the baked tile's and the end glyphs'), not a raw fractional one
    expect(menuSceneSource).toContain('resolvePlayerMarkerCenter(');
    expect(menuSceneSource).toContain('this.boardTileLayer.snappedOrigin ?? { x: baseOriginX, y: baseOriginY }');
    // the diagnostics report the real drawn block and ring (playerMarker.ts), not diamond-era ratios
    expect(menuSceneSource).toContain('resolvePlayerMarkerDiagnosticRadii(');
    expect(menuSceneSource).not.toContain('resolveLegacyPlayerMarkerRenderMetrics');
    expect(menuSceneSource).not.toContain('LEGACY_PLAY_PLAYER_MARKER_RADIUS_RATIO');
    expect(menuSceneSource).not.toContain('LEGACY_PLAY_PLAYER_MARKER_HALO_RATIO');
    // The player is ONE rounded chip block for play and for the menu demo's AI (src/render/playerMarker.ts): the old
    // flat sharp-square branch with its 85 % fill ratio, catchlight and locator ticks is gone.
    expect(menuSceneSource).not.toContain('LEGACY_PLAYER_MARKER_SQUARE_FILL_RATIO');
    expect(menuSceneSource).not.toContain('LEGACY_PLAYER_MARKER_RADIUS_RATIO');
    expect(menuSceneSource).not.toContain('showLocatorTicks');
    expect(menuSceneSource).not.toContain('drawLocatorTick');
    expect(menuSceneSource).toContain('this.isLegacyMenuPointVisibleInStaticDraw(this.player)');
  });

  test('keeps active play dynamic overlays in the corridor frame instead of square cells', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');

    expect(menuSceneSource).not.toContain('const LEGACY_PLAY_DYNAMIC_TRAIL_EDGE =');
    expect(menuSceneSource).not.toContain('const LEGACY_PLAY_DYNAMIC_TRAIL_CORE_RATIO =');
    expect(menuSceneSource).not.toContain('const LEGACY_PLAY_DYNAMIC_TRAIL_EDGE_RATIO =');
    expect(menuSceneSource).toContain('resolveLegacyIridescentTrailColor(');
    expect(menuSceneSource).toContain('resolveLegacyIridescentPulseColor(');
    expect(menuSceneSource).toContain('resolveLegacyIridescentPlayerCoreColor(time)');
    expect(menuSceneSource).toContain('resolveLegacyIridescentPlayerHaloColor(time, palette.playerHaloColor)');
    expect(menuSceneSource).toContain('resolveLegacyIridescentPlayerAccentColor(time, playerCoreColor)');
    expect(menuSceneSource).toContain('palette.trailPulseColor');
    expect(menuSceneSource).toContain('palette.trailPulseEdgeColor');
    expect(menuSceneSource).toContain('const LEGACY_PLAY_DYNAMIC_TRAIL_PULSE_PERIOD_MS = LEGACY_TRAIL_SHINE_ONE_WAY_PERIOD_MS;');
    expect(menuSceneSource).toContain('trailShineDirection: trailShineMotion.direction');
    expect(menuSceneSource).toContain('trailShineCyclePeriodMs: trailShineMotion.cyclePeriodMs');
    expect(menuSceneSource).not.toContain('drawLegacyDynamicTrailShine');
    expect(menuSceneSource).not.toContain('LEGACY_PLAY_DYNAMIC_TRAIL_SHINE');
    // Navigation Core v1: the real play trail is now one continuous path
    // (drawLegacyContinuousPlayTrail), not the old per-cell
    // fillLegacyPlayDynamicPathTile -- that function is gone.
    expect(menuSceneSource).not.toContain('private fillLegacyPlayDynamicPathTile(');
    expect(menuSceneSource).toContain('private drawLegacyContinuousPlayTrail(');
    expect(menuSceneSource).toContain('this.drawLegacyContinuousPlayTrail(time, mazeLeft, mazeTop, mazeTileSize, this.resolveLegacyRenderedTrailHeadPoint(time), menuTrailAlphaMultiplier);');
    expect(menuSceneSource).toContain('this.hasLegacyPlayTrailPulsePendingFrame(time)');
    // MAZER-PERF-003: the colour-only redraw cadence lives in src/render/trailColourRedraw.ts (33 ms full motion, 45 ms reduced).
    expect(menuSceneSource).not.toContain('LEGACY_PLAY_TRAIL_PULSE_FRAME_INTERVAL_MS');
    expect(menuSceneSource).toContain('private legacyPlayTrailPulseNextFrameAtMs = 0;');
    // The old per-cell pulse window is menu-only now -- the real play
    // trail draws its own shared shine inside drawLegacyContinuousPlayTrail.
    expect(menuSceneSource).toContain('resolvedBoardLeft,');
    expect(menuSceneSource).toContain('mazeRenderFrame.boardWidth,');
    expect(menuSceneSource).toContain('mazeRenderFrame.boardHeight,');
    expect(menuSceneSource).toContain("const active = this.isLegacyTrailColourDrifting() && this.overlay === 'none' && this.trail.length > 1;");
    expect(menuSceneSource).toContain('stepTrailColourRedraw(time, this.legacyPlayTrailPulseNextFrameAtMs, this.prefersLegacyReducedMotion())');
    // The bleed-dock glow shares that one schedule at every motion setting (MAZER-PERF-003 reduced, MAZER-PERF-007 full motion).
    expect(menuSceneSource).toContain('this.hasLegacyBleedOffGlowPendingFrame() && this.isLegacyColourRedrawDue(time)');
    expect(menuSceneSource).toContain('this.resolveLegacyPlayPerfectPathTrail()');
    expect(menuSceneSource).not.toContain('private resolveLegacyPointPathSource(');
    expect(menuSceneSource).toContain("this.fillPlayDynamicMarkerTile(this.maze.start, mazeLeft, mazeTop, mazeTileSize, 0.9 * markerDeconstructAlpha, 'start', time);");
    expect(menuSceneSource).toContain("this.fillPlayDynamicMarkerTile(this.maze.goal, mazeLeft, mazeTop, mazeTileSize, 0.95 * markerDeconstructAlpha, 'goal', time);");
    expect(menuSceneSource).toContain('const LEGACY_PLAY_START_MARKER_CORE = cyberArcadeMaterial.signal.start;');
    expect(menuSceneSource).toContain('const LEGACY_PLAY_START_MARKER_EDGE = cyberArcadeMaterial.signal.startEdge;');
    expect(menuSceneSource).toContain('const LEGACY_PLAY_GOAL_MARKER_CORE = cyberArcadeMaterial.signal.goal;');
    expect(menuSceneSource).toContain('const LEGACY_PLAY_GOAL_MARKER_EDGE = cyberArcadeMaterial.signal.goalEdge;');
    expect(menuSceneSource).toContain('markerStyle: {');
    expect(menuSceneSource).toContain('playerCoreColor: resolveLegacyIridescentPlayerCoreColor(time)');
    expect(menuSceneSource).toContain('playerHaloColor: progressionPalette.playerHaloColor');
    expect(menuSceneSource).toContain('startCoreColor: LEGACY_PLAY_START_MARKER_CORE');
    expect(menuSceneSource).toContain('startEdgeColor: LEGACY_PLAY_START_MARKER_EDGE');
    expect(menuSceneSource).toContain('trailPulseColor: progressionPalette.trailPulseColor');
    expect(menuSceneSource).toContain('trailPulseEdgeColor: progressionPalette.trailPulseEdgeColor');
    expect(menuSceneSource).toContain('trailShineEnabled: this.isLegacyTrailShineVisible()');
    expect(menuSceneSource).toContain('trailShineColor: progressionPalette.trailPulseColor');
    expect(menuSceneSource).toContain('trailShineEdgeColor: progressionPalette.trailPulseEdgeColor');
    expect(menuSceneSource).toContain('iridescentMaterial: this.resolveLegacyIridescentMaterialDiagnostics(time, progressionPalette)');
    expect(menuSceneSource).toContain('private resolveLegacyIridescentMaterialDiagnostics(');
    expect(menuSceneSource).toContain('minPathColorDistance: LEGACY_IRIDESCENT_MIN_PATH_COLOR_DISTANCE');
    expect(menuSceneSource).toContain('playerHaloShiftColor: resolveLegacyIridescentPlayerHaloColor(time, palette.playerHaloColor)');
    expect(menuSceneSource).toContain('pulseHeadColor: resolveLegacyIridescentPulseColor(trailHeadIndex, trailLength, time, palette.trailPulseColor)');
    expect(menuSceneSource).toContain('shineHeadColor: resolveLegacyIridescentPulseColor(trailHeadIndex, trailLength, time, palette.trailPulseColor)');
    expect(menuSceneSource).toContain('trailHeadColor: resolveLegacyIridescentTrailColor(trailHeadIndex, trailLength, time, palette.trailColor)');
    expect(menuSceneSource).toContain('trailPulsePeriodMs: LEGACY_PLAY_DYNAMIC_TRAIL_PULSE_PERIOD_MS');
    expect(menuSceneSource).toContain('trailPulseEnabled: this.isLegacyTrailShineVisible()');
    expect(menuSceneSource).toContain('resolveReducedMotion(this.legacyReducedMotionEnabled, this.settings.toggleReducedMotion)');
    expect(menuSceneSource).toContain('private isLegacyTrailShineVisible(): boolean');
    expect(menuSceneSource).toContain('playerCoreRadius: playerMarkerMetrics.coreRadius');
    expect(menuSceneSource).toContain('playerBeaconColor: LEGACY_PLAY_PLAYER_BEACON_COLOR');
    expect(menuSceneSource).toContain('playerBeaconPeriodMs: LEGACY_PLAY_PLAYER_BEACON_PERIOD_MS');
    expect(menuSceneSource).toContain('playerHaloRadius: playerMarkerMetrics.haloRadius');
    // Start/goal are the Chip marker draw code through the Phaser graphics adapter (shared with the Guide).
    expect(menuSceneSource).not.toContain('drawLegacyEndpointGlow');
    expect(menuSceneSource).toContain('drawBoardMarkers(context, {');
    expect(menuSceneSource).toContain('this.fillLegacyPlayerMarkerTile(renderedPlayerPoint');
    // The cast appears when the beams land (the maze is still growing out of
    // the spawn tile), not at the end of the build.
    expect(menuSceneSource).toContain('const markersBuiltIn = this.menuStaticDrawLifecyclePhase !== \'building\'');
    expect(menuSceneSource).toContain('(this.resolveLegacyIntroState(time)?.laserProgress ?? 0) >= 1');
    // both surfaces call the one marker with the same arguments (no mode flag, no per-surface alpha)
    expect(menuSceneSource.split('this.fillLegacyPlayerMarkerTile(renderedPlayerPoint, mazeLeft, mazeTop, mazeTileSize, playerAlpha, time);').length - 1).toBe(2);
    expect(menuSceneSource).toContain('this.armLegacyPlayerVisualMotion(previousPlayer, nextStep.player, this.time.now, this.resolveLegacyPlayerVisualMoveDurationMs());');
    expect(menuSceneSource).toContain('renderScreenX: mazeRenderFrame.boardLeft + ((renderedPlayerPoint.x + 0.5) * mazeRenderFrame.tileSize)');
    expect(menuSceneSource).toContain('visualMotionActive: this.hasLegacyPlayerVisualMotionPendingFrame(time)');
    expect(menuSceneSource).toContain('const LEGACY_PLAY_PLAYER_BEACON_COLOR = cyberArcadeMaterial.signal.player;');
    expect(menuSceneSource).toContain('const LEGACY_PLAY_PLAYER_BEACON_ACCENT = cyberArcadeMaterial.signal.playerAccent;');
    expect(menuSceneSource).toContain('const LEGACY_PLAY_PLAYER_BEACON_PERIOD_MS = 1150;');
    // squash-and-stretch while gliding: the pose goes into the shared frame (playerMarker.ts holds the 0.1 stretch)
    expect(menuSceneSource).toContain('motionAmount: motionPose.amount,');
    expect(menuSceneSource).toContain('headingX: motionPose.headingX,');
    expect(menuSceneSource).not.toContain('this.boardDynamicGraphics.strokeCircle(centerX, centerY, beaconRadius);');
    expect(menuSceneSource).not.toContain('this.fillTile(this.boardDynamicGraphics, point, trailColor, boardLeft + boardOffset.x, boardTop + boardOffset.y, tileSize, trailAlpha, 1);');
    expect(menuSceneSource).not.toContain('this.fillTile(this.boardDynamicGraphics, this.player, 0xf2f4f8, boardLeft + boardOffset.x, boardTop + boardOffset.y, tileSize, 1, 0);');
  });

  test('keeps dynamic overlays readable for ultra-narrow mobile tiles', () => {
    expect(resolveLegacyDynamicTrailStrokeWidth(3.265, 0.62, 3)).toBe(3);
    expect(resolveLegacyDynamicTrailStrokeWidth(3.265, 0.34, 2)).toBe(2);
    expect(resolveLegacyDynamicMarkerInset(3.265, 0.22)).toBe(0);
    const tinyEndpoint = resolveLegacyEndpointMarkerRenderMetrics(3.265);
    expect(tinyEndpoint.coreRadius).toBeCloseTo(1, 3);
    expect(tinyEndpoint.outerRadius).toBeCloseTo(1.567, 3);
    expect(tinyEndpoint.strokeWidth).toBe(1);
  });

  test('keeps menu generation routed through the progression scale cap', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');

    expect(menuSceneSource).toContain('private resolveLegacyProgressionScaleForMode(mode: RuntimeMode): number');
    expect(menuSceneSource).toContain("surface: mode === 'play' ? 'play' : 'menu-demo'");
    expect(menuSceneSource).toContain("this.resolveLegacyProgressionScaleForMode('menu')");
    expect(menuSceneSource).toContain('this.resolveLegacyProgressionScaleForMode(mode)');
  });

  test('keeps larger desktop tiles visibly weighted after responsive overlay sizing', () => {
    expect(resolveLegacyDynamicTrailStrokeWidth(18, 0.62, 3)).toBe(11);
    expect(resolveLegacyDynamicTrailStrokeWidth(18, 0.34, 2)).toBe(6);
    expect(resolveLegacyDynamicMarkerInset(18, 0.22)).toBe(3);
    const desktopEndpoint = resolveLegacyEndpointMarkerRenderMetrics(18);
    expect(desktopEndpoint.coreRadius).toBeCloseTo(5.011, 3);
    expect(desktopEndpoint.outerRadius).toBeCloseTo(8.64, 3);
    expect(desktopEndpoint.strokeWidth).toBe(2);
  });

  test('disables board tap and swipe movement so mobile play moves only from explicit controls', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');

    expect(menuSceneSource).toContain('type LegacyPlayPointerStart');
    expect(menuSceneSource).toContain('private playPointerStart: LegacyPlayPointerStart | null = null;');
    expect(menuSceneSource).toContain("this.input.on('pointerupoutside', (pointer: Phaser.Input.Pointer) => {");
    expect(menuSceneSource).toContain("this.input.on('gameout', () => {");
    expect(menuSceneSource).toContain('this.playPointerStart = null;');
    expect(menuSceneSource).not.toContain('this.playPointerStart = createLegacyPlayPointerStart(pointer);');
    expect(menuSceneSource).toContain('if (!isSameLegacyPlayPointer(this.playPointerStart, pointer)) {');
  });

  test('routes shared mobile touch controls into explicit movement, pause, and reset only', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');

    expect(menuSceneSource).toContain('resolveTouchControlKindAtPoint');
    expect(menuSceneSource).toContain('resolveTouchControlLayout');
    expect(menuSceneSource).toContain('private resolveLegacyPlayTouchControlLayout()');
    expect(menuSceneSource).toContain('private handleLegacyPlayTouchControl');
    expect(menuSceneSource).toContain("|| this.overlay !== 'none'");
    expect(menuSceneSource).toContain("// The fixed play controls must not intercept an overlay action.");
    expect(menuSceneSource).toContain('private handleOverlayBackChevronPointerDown(pointer: Phaser.Input.Pointer): boolean');
    expect(menuSceneSource).toContain('this.overlayBackChevronAction();');
    expect(menuSceneSource).toContain('private drawLegacyPlayTouchControls(');
    expect(menuSceneSource).toContain('private resolveLegacyPlayActiveTouchControls()');
    expect(menuSceneSource).toContain('activeControls: this.resolveLegacyPlayActiveTouchControls()');
    // Play movement no longer has a fixed-position on-screen widget of any
    // kind (arrows or otherwise) -- every touch starts a floating stick
    // centered on wherever it landed instead, so the board can be
    // full-bleed. resolveTouchArrowMovementKindAtPoint, the fixed dpad
    // button drawing, and the controlMode arrows/stick branching are gone.
    expect(menuSceneSource).not.toContain('resolveTouchArrowMovementKindAtPoint');
    expect(menuSceneSource).not.toContain('this.drawLegacyPlayTouchButton(');
    expect(menuSceneSource).not.toContain("touchControlLayout.controlMode === 'arrows'");
    expect(menuSceneSource).toContain('private legacyPlayTouchControlPointerUpHandler: ((event: PointerEvent) => void) | null = null;');
    expect(menuSceneSource).toContain('target.addEventListener(\'pointerup\', this.legacyPlayTouchControlPointerUpHandler as EventListener');
    expect(menuSceneSource).toContain('target.addEventListener(\'pointercancel\', this.legacyPlayTouchControlPointerUpHandler as EventListener');
    expect(menuSceneSource).toContain('this.handleLegacyPlayTouchControlClientPoint(event.clientX, event.clientY, event.pointerId)');
    expect(menuSceneSource).toContain('this.handleLegacyPlayTouchControlClientMove(event.clientX, event.clientY, event.pointerId)');
    expect(menuSceneSource).toContain('this.releaseLegacyPlayTouchPointer(event.pointerId)');
    expect(menuSceneSource).toContain('this.playTouchArrowPointerId === normalizedPointerId');
    // Every touch starts a floating stick, centered on the touch point
    // itself -- see playFloatingStickOrigin and
    // resolveLegacyPlayFloatingStickGeometry -- instead of dispatching an
    // immediate pull vector against a fixed layout stick at touch-down.
    expect(menuSceneSource).toContain('this.playFloatingStickOrigin = { x, y };');
    expect(menuSceneSource).toContain('private resolveLegacyPlayFloatingStickGeometry(');
    expect(menuSceneSource).toContain('this.setLegacyPlayHeldTouchMoveCandidates(pullVector.movementCandidates');
    expect(menuSceneSource).toContain('movementCandidates: [...this.playTouchStickPull.movementCandidates]');
    expect(menuSceneSource).toContain('angleRadians: this.playTouchStickPull.angleRadians');
    expect(menuSceneSource).toContain('allowBeyondOuter: true');
    expect(menuSceneSource).toContain('this.playDirectionalIntent.requestAnalog(');
    expect(menuSceneSource).toContain('private resolveLegacyInputPointerPoint(pointer: Phaser.Input.Pointer)');
    expect(menuSceneSource).toContain('return this.resolveLegacyPlayTouchClientPoint(touch.clientX, touch.clientY);');
    expect(menuSceneSource).toContain('keepWhenBlocked: true');
    expect(menuSceneSource).not.toContain('allowBeyondFrame: true');
    expect(menuSceneSource).not.toContain('centerFallback: existingMovement');
    expect(menuSceneSource).toContain('const candidates = resolveHumanMovementPriorityCandidates(');
    expect(menuSceneSource).toContain('this.requestLegacyPlayDirectionalIntent(candidates);');
    expect(menuSceneSource).toContain('this.scheduleLegacyPlayHeldTouchRepeat(this.resolveLegacyPlayHeldTouchDelay(\'repeat\'));');
    expect(menuSceneSource).toContain('if (this.playTouchArrowPointerId !== null || this.playTouchStickPointerId !== null) {');
    expect(menuSceneSource).toContain('private drawLegacyPlayTouchStick(');
    expect(menuSceneSource).toContain('const knobRadius = stick.knobRadius;');
    expect(menuSceneSource).toContain('const travel = stick.travelRadius;');
    // Stripped down to just the knob -- no stationary outer ring, spokes,
    // hub, deadzone ring, or glow halo, per feedback that the "huge green
    // circle" wasn't wanted, only the small knob that tracks the touch.
    expect(menuSceneSource).not.toContain('private drawLegacyPlayFloatingStickGlow(');
    expect(menuSceneSource).not.toContain('this.hudGraphics.fillCircle(centerX, centerY, outerRadius);');
    expect(menuSceneSource).toContain('deadzoneRadius: touchControlLayout.stick.deadzoneRadius');
    expect(menuSceneSource).toContain('knobRadius: touchControlLayout.stick.knobRadius');
    expect(menuSceneSource).toContain('travelRadius: touchControlLayout.stick.travelRadius');
    expect(menuSceneSource).toContain('private setLegacyPlayHeldTouchMoveCandidates(');
    expect(menuSceneSource).toContain('const wasHeld = this.playMoveFlags[direction];');
    // beginLegacyPlayHeldTouchMove -- the discrete-button-press path only
    // the fixed arrows widget used -- is gone along with the widget itself;
    // setLegacyPlayHeldTouchMoveCandidates (the floating stick's own path)
    // still guards the same held-move limit, just via a slot-count subtraction.
    expect(menuSceneSource).not.toContain('private beginLegacyPlayHeldTouchMove(');
    expect(menuSceneSource).toContain('const availableCandidateSlots = Math.max(0, LEGACY_PLAY_HELD_TOUCH_MOVE_LIMIT - remainingMoves.length);');
    expect(menuSceneSource).toContain('private resolveLegacyPlayHeldTouchDelay(kind:');
    expect(menuSceneSource).toContain('private resolveLegacyPlayMovementSpeedProfile()');
    expect(menuSceneSource).toContain('return resolveLegacyMovementSpeedProfile(this.settings.movementSpeed);');
    expect(menuSceneSource).toContain('effectiveMovementSpeed: movementSpeedProfile.effectiveSpeed');
    expect(menuSceneSource).toContain('formulaVersion: movementSpeedProfile.formulaVersion');
    expect(menuSceneSource).toContain("this.resolveLegacyPlayHeldTouchDelay(hadActiveMove ? 'turn' : 'initial')");
    expect(menuSceneSource).toContain("this.resolveLegacyPlayHeldTouchDelay('repeat')");
    expect(menuSceneSource).toContain('repeatInitialDelayMs: movementSpeedProfile.initialDelayMs');
    expect(menuSceneSource).toContain('repeatIntervalMs: movementSpeedProfile.repeatIntervalMs');
    expect(menuSceneSource).toContain('stickRepeatIntervalMaxMs: LEGACY_PLAY_STICK_REPEAT_INTERVAL_MAX_MS');
    expect(menuSceneSource).toContain('turnDelayMs: movementSpeedProfile.turnDelayMs');
    expect(menuSceneSource).toContain('Math.min(profile.repeatIntervalMs, LEGACY_PLAY_STICK_REPEAT_INTERVAL_MAX_MS)');
    expect(menuSceneSource).toContain('this.hudTouchControlBounds = this.drawLegacyPlayTouchControls(time, touchControlLayout);');
    // The compass idea, and later the timer that took its old centered top
    // HUD slot, were both removed from the app entirely -- no HUD timer
    // exists at all now, computation included.
    expect(menuSceneSource).not.toContain('drawLegacyCompassGlyph');
    expect(menuSceneSource).not.toContain('hudBounds');
    expect(menuSceneSource).not.toContain('hudTimerBounds');
    expect(menuSceneSource).toContain('touchControls');
    expect(menuSceneSource).toContain('LEGACY_CYBER_PANEL_FILL');
    expect(menuSceneSource).not.toContain('drawLegacyPlayTouchLabel');
    expect(menuSceneSource).not.toContain("this.drawLegacyPlayTouchLabel(controls.restart_attempt, 'RESET');");
    expect(menuSceneSource).not.toContain("this.drawLegacyPlayTouchLabel(controls.toggle_thoughts, 'TRAIL');");
    // The fixed dpad's directional arrow glyphs (drawLegacyPlayTouchArrow)
    // are gone along with the rest of the fixed-widget drawing.
    expect(menuSceneSource).not.toContain('private drawLegacyPlayTouchArrow(');
    expect(menuSceneSource).toContain('installLegacyPlayTouchControlFallback');
    expect(menuSceneSource).toContain("event.pointerType === 'touch'");
    expect(menuSceneSource).toContain('event.target === this.game.canvas');
    expect(menuSceneSource).toContain('event.stopImmediatePropagation()');
    expect(menuSceneSource).toContain("case 'pause':");
    // Reset (reset-player) was removed from the game entirely; Pause is a
    // card with Resume / Settings / Quit to Menu (the old header home icon,
    // createLegacyOverlayHomeButton, is gone). Account is not an entry point
    // from Pause at all.
    expect(menuSceneSource).not.toContain("const resetAction = (): void => this.applyLegacyPauseCommand('reset-player');");
    // Now routes through the Wave 3A bridge first (bridge.dispatch(RETURN_HOME)),
    // falling back to the same real applyLegacyPauseCommand('return-menu')
    // call only if the bridge rejects or is unavailable.
    expect(menuSceneSource).not.toContain('private createLegacyOverlayHomeButton(');
    // Wiring lane: Quit to Menu is the pause-bottom row of the shared settings plan; its command runs here.
    expect(normalizeSourceLineEndings(menuSceneSource)).toContain(
      "      case 'RETURN_HOME':\n"
      + '        this.pressLegacyQuitToMenu();\n'
    );
    // Quit to Menu is a two-step confirm after the first move (legacyQuitConfirm.ts); the second press dispatches the bridge command.
    expect(menuSceneSource).toContain("this.dispatchUiBridgeCommand({ type: 'RETURN_HOME' }, () => this.applyLegacyPauseCommand('return-menu'));");
    expect(menuSceneSource).toContain('private readonly playDirectionalIntent = new LegacyDirectionalIntentResolver();');
    expect(menuSceneSource).toContain('private requestLegacyPlayDirectionalIntent(controls: readonly HumanMovementActionKind[]): void');
    expect(menuSceneSource).toContain('this.playDirectionalIntent.step(this.maze, this.player, {');
    expect(menuSceneSource).toContain('assistedLaneShiftEnabled: true');
    expect(menuSceneSource).toContain('private tryMovePlayerFromInput(');
    expect(menuSceneSource).toContain('const directions = resolveLegacyCardinalDirectionsFromVector(deltaX, deltaY);');
    expect(menuSceneSource).toContain('return this.performLegacyPlayDirectionalIntentStep();');
    expect(menuSceneSource).toContain('const accepted = this.tryMovePlayerFromInput(vector.deltaX, vector.deltaY, { releaseAfterStep: true });');
    expect(menuSceneSource).toContain('private legacyWorldTurnHost = this.createLegacyWorldTurnHost();');
    expect(menuSceneSource).toContain("'player-movement': (): WorldTurnPhaseResult => this.applyLegacyWorldTurnPlayerMovement()");
    expect(menuSceneSource).toContain('this.legacyWorldTurnHost.setState(this.resolveLegacyWorldTurnHostState());');
    expect(menuSceneSource).toContain('receipt = this.legacyWorldTurnHost.advance({');
    expect(menuSceneSource).toContain("return 'stopped';");
    expect(menuSceneSource).toContain("return 'paused';");
    expect(menuSceneSource).toContain('registeredPhases: [...worldTurnDiagnostics.registeredPhases]');
    expect(menuSceneSource).toContain('timedModeEnabled: worldTurnDiagnostics.timedModeEnabled');
    expect(menuSceneSource).toContain('worldTurn: {');
  });

  test('retains only player movement in the live play world and no dormant object seam', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');
    const diagnosticsSource = readFileSync(resolve(process.cwd(), 'src/scenes/menuRuntimeDiagnostics.ts'), 'utf8');
    const semanticSource = readFileSync(
      resolve(process.cwd(), 'src/scenes/diagnostics/menuWorldSemanticDiagnostics.ts'),
      'utf8'
    );
    const captureSource = readFileSync(
      resolve(process.cwd(), 'scripts/analysis/capture-play-object-retirement.mjs'),
      'utf8'
    );
    const worldTurnSource = menuSceneSource.slice(
      menuSceneSource.indexOf('private createLegacyWorldTurnHost(): WorldTurnHost'),
      menuSceneSource.indexOf('private resetLegacyWorldTurnHost(): void')
    );

    expect(existsSync(resolve(process.cwd(), 'src/legacy-runtime/legacyPatrolAgent.ts'))).toBe(false);
    expect(existsSync(resolve(process.cwd(), 'src/legacy-runtime/legacyStaticSlowTile.ts'))).toBe(false);
    expect(existsSync(resolve(process.cwd(), 'tests/reset/legacy-patrol-agent.test.ts'))).toBe(false);
    expect(existsSync(resolve(process.cwd(), 'tests/reset/legacy-static-slow-tile.test.ts'))).toBe(false);
    expect(menuSceneSource).not.toContain('legacyPatrolAgent');
    expect(menuSceneSource).not.toContain('legacyStaticSlowTile');
    expect(menuSceneSource).not.toContain('playPatrolAgent');
    expect(menuSceneSource).not.toContain('playStaticSlowTile');
    expect(menuSceneSource).not.toContain('static-slow-tile-entered');
    expect(worldTurnSource).toContain("'player-movement': (): WorldTurnPhaseResult => this.applyLegacyWorldTurnPlayerMovement()");
    expect(worldTurnSource).toContain('timedModeEnabled: false');
    expect(worldTurnSource).not.toContain("'enemy-movement'");
    expect(worldTurnSource).not.toContain('collisions:');
    expect(diagnosticsSource).not.toContain('patrol?:');
    expect(diagnosticsSource).not.toContain('pressure?:');
    expect(semanticSource).toContain('patrol: null');
    expect(semanticSource).toContain('pressure: null');
    expect(menuSceneSource).not.toContain("from '../ui/boardRenderer'");
    expect(menuSceneSource).not.toContain("from '../ui/menuIntentRuntime'");
    expect(captureSource).toContain("level: '9007199254740993'");
    expect(captureSource).toContain('targetComplexity: 400');
    expect(captureSource).toContain('requestedSeed: 3749');
    expect(captureSource).toContain("issues.push('raw-patrol-present')");
    expect(captureSource).toContain("issues.push('raw-pressure-present')");
    expect(captureSource).toContain("JSON.stringify(['player-movement'])");
    expect(captureSource).toContain("issues.push('timed-mode-enabled')");
  });

  test('keeps static and dynamic board layers on the same board offset', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');

    expect(menuSceneSource).toContain('const { boardLeft: layoutBoardLeft, boardTop: layoutBoardTop, boardWidth, boardHeight } = this.layout;');
    expect(menuSceneSource).toContain('const boardOffset = this.resolveBoardOffset();');
    expect(menuSceneSource).toContain('const boardLeft = layoutBoardLeft + boardOffset.x;');
    expect(menuSceneSource).toContain('const boardTop = layoutBoardTop + boardOffset.y;');
    expect(menuSceneSource).toContain('const mazeRenderFrame = this.resolveLegacyMazeRenderFrame(boardLeft, boardTop, boardWidth, boardHeight);');
    expect(menuSceneSource).toContain('this.layout.boardLeft + boardOffset.x');
    expect(menuSceneSource).toContain('this.layout.boardTop + boardOffset.y');
    expect(menuSceneSource).not.toContain('toggleCameraFollow');
  });

  test('uses rendered play board bounds for compact touch-control avoidance', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');

    expect(menuSceneSource).toContain('const boardBounds = this.resolveLegacyPlayBoardBounds();');
    expect(menuSceneSource).toContain('left: boardBounds.left');
    expect(menuSceneSource).toContain('top: boardBounds.top');
    expect(menuSceneSource).toContain('width: boardBounds.right - boardBounds.left');
    expect(menuSceneSource).toContain('height: boardBounds.bottom - boardBounds.top');
    expect(menuSceneSource).not.toContain('avoidRect: {\n        left: this.layout.boardLeft');
  });

  test('publishes visual diagnostics to a maintained-browser DOM fallback', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');

    expect(menuSceneSource).toContain("export const MENU_SCENE_VISUAL_DIAGNOSTICS_ATTRIBUTE = 'data-mazer-visual-diagnostics' as const;");
    expect(menuSceneSource).toContain('const diagnostics: MenuSceneVisualDiagnostics = {');
    expect(menuSceneSource).toContain('window[MENU_SCENE_VISUAL_DIAGNOSTICS_KEY] = diagnostics;');
    expect(menuSceneSource).toContain('MENU_SCENE_VISUAL_DIAGNOSTICS_ATTRIBUTE,');
    expect(menuSceneSource).toContain('JSON.stringify(diagnostics)');
    expect(menuSceneSource).toContain('removeAttribute(MENU_SCENE_VISUAL_DIAGNOSTICS_ATTRIBUTE)');
    expect(menuSceneSource).toContain('renderSurface: {');
    expect(menuSceneSource).toContain('canvasPixelWidth');
    expect(menuSceneSource).toContain('renderResolutionTargetRatio');
    expect(menuSceneSource).toContain('renderResolutionDeficit');
    expect(menuSceneSource).toContain('renderResolutionRatio');
    expect(menuSceneSource).toContain('undersampledForDevicePixelRatio');
    expect(menuSceneSource).toContain('status: MazerRenderResolutionStatus');
    expect(menuSceneSource).toContain('applyMazerCanvasBackingResolution,');
    expect(menuSceneSource).toContain('resolveMazerCanvasBackingResolution,');
    expect(menuSceneSource).toContain("summarizeMazerRenderResolution,");
    expect(menuSceneSource).toContain("type MazerRenderResolutionDiagnostics,");
    expect(menuSceneSource).toContain("type MazerRenderResolutionStatus");
    expect(menuSceneSource).toContain('const renderResolutionDiagnostics = summarizeMazerRenderResolution({');
    // refreshLayout() must force Phaser's own Scale Manager back in sync
    // with our authoritative width/height BEFORE mutating the canvas here --
    // otherwise a stale automatic resize from Phaser's own observer can
    // leave pointer transforms (which read Phaser's canvasBounds/displayScale,
    // never the backing-store pixel count this sets) offset from what's
    // actually drawn. See the back-chevron hit-box investigation.
    expect(menuSceneSource).toContain('if (this.scale.width !== width || this.scale.height !== height) {');
    expect(menuSceneSource).toContain('syncMazerGameToViewport(this.game, viewportGeometry);');
    expect(menuSceneSource).toContain('const backingResolution = resolveMazerCanvasBackingResolution({');
    expect(menuSceneSource).toContain('applyMazerCanvasBackingResolution({');
    expect(menuSceneSource).toContain('canvas: this.game.canvas');
    expect(menuSceneSource).toContain("context: canvasRenderer.gameContext ?? this.game.canvas.getContext('2d')");
    expect(menuSceneSource).toContain('renderResolution: renderResolutionDiagnostics');
    expect(menuSceneSource).toContain('renderSurface: {');
    expect(menuSceneSource).toContain('...renderResolutionDiagnostics');
    expect(menuSceneSource).toContain('pathMaterial: {');
    expect(menuSceneSource).toContain('connectorSeamsEnabled: true');
    expect(menuSceneSource).toContain('seamCoreAlphaRatio: LEGACY_PATH_CONNECTOR_SEAM_CORE_ALPHA_RATIO');
    expect(menuSceneSource).toContain('seamEdgeAlphaRatio: LEGACY_PATH_CONNECTOR_SEAM_EDGE_ALPHA_RATIO');
    expect(menuSceneSource).toContain('seamPadRatio: LEGACY_PATH_CONNECTOR_SEAM_PAD_RATIO');
  });

  test('draws game-toggle switch positions from the canonical toggle resolver', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');
    const toggleFieldSource = readFileSync(resolve(process.cwd(), 'src/legacy-runtime/legacyOverlayToggleFields.ts'), 'utf8');

    expect(toggleFieldSource).toContain('export const resolveLegacyOverlayToggleSwitchIsOn = (');
    expect(toggleFieldSource).toContain("case 'controlMode':");
    expect(toggleFieldSource).toContain("return settings.controlMode === 'stick';");
    // The three toggle rows now come from the shared plan (settingKey per row) and one painter resolves
    // each switch position through the canonical resolver.
    expect(menuSceneSource).toContain('const checked = resolveLegacyOverlayToggleSwitchIsOn(fieldId, this.settings);');
    const planSource = readFileSync(resolve(process.cwd(), 'src/legacy-runtime/legacySettingsSheetPlan.ts'), 'utf8');
    expect(planSource).toContain("settingKey: 'toggleTrailFade'");
    expect(planSource).toContain("settingKey: 'toggleTrailPulse'");
    expect(planSource).toContain("settingKey: 'toggleAnimatedBackdrop'");
    // Play touch movement only has one control scheme now (the floating
    // stick), so the settings list no longer surfaces a meaningless
    // arrows-vs-stick row for it -- the underlying resolver keeps the
    // 'controlMode' case (asserted above) for the settings field itself,
    // just unrendered.
    expect(menuSceneSource).not.toContain("label: 'Control Style'");
  });

  test('applies capped high-DPI text resolution to menu and overlay UI text', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');
    const textCrispnessSource = readFileSync(resolve(process.cwd(), 'src/render/textCrispness.ts'), 'utf8');

    expect(menuSceneSource).toContain("import { applyTextResolution, resolveHudTextResolution } from '../render/textCrispness';");
    expect(menuSceneSource).toContain('private resolveLegacyUiTextResolution(): number');
    expect(menuSceneSource).toContain('return resolveHudTextResolution({ width, height });');
    expect(menuSceneSource).toContain('private applyLegacyUiTextCrispness<T extends Phaser.GameObjects.Text>(text: T): T');
    expect(menuSceneSource).toContain('return applyTextResolution(text, this.resolveLegacyUiTextResolution());');
    expect(menuSceneSource).toContain('this.footerText = this.applyLegacyUiTextCrispness(this.add.text');
    // The level-announcer number is no longer a Text object (see the tile-
    // block glyph rewrite, drawLegacyLevelAnnouncerNumberGlyph) so it has no
    // text-crispness call of its own -- the label ('LEVEL') sitting right
    // beside it is still a real Text object and still goes through the same
    // crispness path, so it stands in for this spot check instead.
    expect(menuSceneSource).toContain('this.levelAnnouncerLabelText = this.applyLegacyUiTextCrispness(this.add.text');
    expect(menuSceneSource).toContain('this.applyLegacyUiTextCrispness(text);');
    expect(menuSceneSource).toContain('textTextureResolution: this.resolveLegacyUiTextResolution()');
    expect(menuSceneSource).toContain("textTransformOwner: 'game-canvas-only'");
    expect(textCrispnessSource).toContain("import { MAZER_CANVAS_RESOLUTION_MIN } from '../boot/canvasResolution';");
    expect(textCrispnessSource).toContain('return MAZER_CANVAS_RESOLUTION_MIN;');
    expect(textCrispnessSource).not.toContain('resolutionCap');
    expect(textCrispnessSource).not.toContain('navigator.webdriver');
    expect(textCrispnessSource).not.toContain('HeadlessChrome');
  });

  test('publishes a compact walkable maze snapshot for live play QA', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');
    const runtimeDiagnosticsSource = readFileSync(resolve(process.cwd(), 'src/scenes/menuRuntimeDiagnostics.ts'), 'utf8');

    expect(runtimeDiagnosticsSource).toContain("encoding: 'walkable-rows-v1';");
    expect(runtimeDiagnosticsSource).toContain('walkableRows: string[];');
    // MAZER-PROG-016: the player-track numbers live in the progression section now.
    const progressionSource = readFileSync(resolve(process.cwd(), 'src/legacy-runtime/legacyProgression.ts'), 'utf8');
    expect(progressionSource).toContain('playerEvidence: LegacyProgressionPlayerEvidence;');
    expect(progressionSource).toContain('completedCycles: LegacyProgressionOrdinal;');
    // ...and the scene no longer publishes them in the touch input diagnostics (they are not speed inputs).
    for (const field of ['progressionCompletedCycles', 'progressionContextApplied', 'progressionLevel', 'progressionPaceScore']) {
      expect(menuSceneSource).not.toContain(`${field}:`);
    }
    expect(menuSceneSource).toContain("encoding: 'walkable-rows-v1'");
    expect(menuSceneSource).toContain("walkableRows: this.maze.grid.map((row) => row.map((walkable) => (walkable ? '1' : '0')).join(''))");
  });

  test('keeps animated backdrop and visual diagnostics off the per-frame hot path', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');
    const tuningSource = readFileSync(resolve(process.cwd(), 'src/config/tuning.ts'), 'utf8');

    expect(menuSceneSource).toContain('this.updateStars(time, delta);');
    expect(menuSceneSource).toContain('private updateStars(time: number, delta: number): void');
    expect(menuSceneSource).toContain('private backdropAccumulatedDeltaMs = 0;');
    expect(menuSceneSource).toContain('this.backdropAccumulatedDeltaMs += Math.max(0, delta);');
    expect(menuSceneSource).toContain('legacyTuning.menu.runtime.ambientUpdateIntervalMs[this.runtimeDiagnosticsPerformanceMode]');
    expect(menuSceneSource).toContain('if (time < this.backdropNextUpdateAtMs) {');
    expect(menuSceneSource).toContain('advanceLegacyMenuBackdropStars(this.stars, elapsedMs, this.settings.darkMode);');
    expect(menuSceneSource).toContain('private publishVisualDiagnostics(time: number, force = false): void');
    expect(menuSceneSource).toContain('time - this.visualDiagnosticsLastPublishedAtMs < legacyTuning.menu.runtime.diagnosticsPublishIntervalMs');
    expect(menuSceneSource).toContain('this.publishVisualDiagnostics(this.time.now, true);');
    expect(menuSceneSource).toContain('private publishInteractionDiagnostics(force = true): void');
    expect(menuSceneSource).toContain('this.publishVisualDiagnostics(now, force);');
    expect(menuSceneSource).toContain('this.publishInteractionDiagnostics(false);');
    expect(menuSceneSource).toContain('private hudDirty = true;');
    expect(menuSceneSource).toContain('this.hudDirty = true;');
    expect(menuSceneSource).toContain('const uiRebuilt = this.uiDirty;');
    expect(menuSceneSource).toContain('this.publishVisualDiagnostics(time, uiRebuilt);');
    expect(tuningSource).toContain('diagnosticsPublishIntervalMs: 1500,');
    expect(tuningSource).toContain('full: 16,');
    expect(tuningSource).toContain('throttled: 100,');
  });

  test('caches OS reduced motion and settles only visual state when it changes', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');
    const preferenceSource = menuSceneSource.slice(
      menuSceneSource.indexOf('private installLegacyReducedMotionPreference(): void'),
      menuSceneSource.indexOf('private isLegacyTrailShineVisible(): boolean')
    );

    expect(menuSceneSource).toContain('private legacyReducedMotionEnabled = false;');
    expect(menuSceneSource).toContain('private legacyReducedMotionMediaQuery: MediaQueryList | null = null;');
    expect(menuSceneSource).toContain('this.installLegacyReducedMotionPreference();');
    expect(menuSceneSource).toContain('this.detachLegacyReducedMotionPreference();');
    expect(preferenceSource).toContain("window.matchMedia('(prefers-reduced-motion: reduce)')");
    expect(preferenceSource).toContain("mediaQuery.addEventListener('change', this.legacyReducedMotionMediaQueryListener)");
    expect(preferenceSource).toContain("mediaQuery.removeEventListener('change', listener)");
    expect(preferenceSource).toContain('this.syncLegacyPlayerVisualMotionTo(this.playerGlide.getTarget());');
    expect(preferenceSource).toContain('this.backdropDirty = true;');
    expect(preferenceSource).toContain('this.boardDynamicDirty = true;');
    expect(preferenceSource).toContain('this.hudDirty = true;');
    expect(preferenceSource).toContain('resolveReducedMotion(this.legacyReducedMotionEnabled, this.settings.toggleReducedMotion)');
    expect(preferenceSource).not.toContain('tryMovePlayerFromInput');
    expect(preferenceSource).not.toContain('legacyWorldTurnHost');
  });

  test('keeps front-door buttons and header controls on their shared chrome paths', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8').replace(/\r\n/g, '\n');

    expect(menuSceneSource).toContain('const panel = this.add.graphics();');
    expect(menuSceneSource).toContain('this.drawLegacyCyberPanel(panel, {');
    expect(menuSceneSource).toContain('frontDoorChrome?.hoverFillColor ?? cyberArcadeMaterial.substrate.panelActive');
    expect(menuSceneSource).toContain('frontDoorChrome?.fillColor ?? LEGACY_CYBER_PANEL_FILL');
    expect(menuSceneSource).toContain('stroke: frontDoorChrome?.strokeColor');
    expect(menuSceneSource).toContain('const buttonTextColor = isPrimaryFrontDoorButton');
    expect(menuSceneSource).toContain('? MENU_TEXT_COLOR');
    expect(menuSceneSource).toContain('private createLegacyMenuSettingsCogButton(onClick: () => void): UiButton');
    expect(menuSceneSource).toContain("semanticAction: 'Settings'");
    expect(menuSceneSource).toContain("text: 'Settings'");
    // Only the removed pause home icon's door cutout used this constant.
    expect(menuSceneSource).not.toContain('LEGACY_PLAY_TOUCH_COG_HUB');
    expect(menuSceneSource).not.toContain('fillStyle(0x05070a');
    expect(menuSceneSource).toContain('private drawLegacySettingsCogControl(');
    // No panel/border chrome behind the play cog at all, and now the same
    // real settings icon (not the old procedural gear) as the menu
    // surface's own settings icon too -- not just "no box" but the actual
    // same icon/texture.
    expect(menuSceneSource).toMatch(/drawLegacySettingsCogControl\([\s\S]*?this\.applyLegacyHudIconFrame\(\s*this\.touchSettingsCogIconImage,\s*MAZER_HUD_SETTINGS_ICON_METRICS,/);
    expect(menuSceneSource).toContain('private drawLegacyMenuSettingsCog(time: number): void');
    expect(menuSceneSource).toContain('this.drawLegacyMenuSettingsCog(time);');
    // The menu cog's blink is drawn inside drawBoardPaths, gated by
    // boardPathDirty -- update() must re-arm that flag every menu-mode
    // frame the same way it already does for play mode's cog (hudDirty)
    // and LVL badge (boardDynamicDirty), or the blink freezes between
    // whatever else happens to touch boardPathDirty and jumps on the next
    // unrelated redraw instead of pulsing smoothly.
    expect(menuSceneSource).toContain("if (this.mode === 'menu' && this.overlay === 'none') {\n      this.boardPathDirty = true;\n    }");
    // Both the menu header settings icon and this touch-control settings
    // icon share the exact same source metrics (real icon, not a
    // procedural gear duplicated per surface).
    expect(menuSceneSource.match(/MAZER_HUD_SETTINGS_ICON_METRICS/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(menuSceneSource).toContain('this.drawLegacySettingsCogControl(controls.pause, false, time);');
    expect(menuSceneSource).toContain("placement: 'trailing'");
    expect(menuSceneSource).not.toContain('drawLegacyPlayTouchPauseIcon');
    expect(menuSceneSource).toContain('const background = this.add.rectangle(\n      hit.centerX,');
    // 44px touch-target floor: the zone is grown by resolveLegacyMinHitRect (legacy-hit-targets.test.ts).
    expect(menuSceneSource).toContain('const hit = resolveLegacyMinHitRect(pauseRect, this.layout);');
    expect(menuSceneSource).toContain('bounds: hitBounds');
    expect(menuSceneSource).toContain('text,');
    expect(menuSceneSource).toContain('? Math.max(frontDoorChrome?.hoverAlpha ?? 0.68, 0.68)');
  });

  test('uses meaningful-alpha bounds for the shared HUD icon assets', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');

    expect(menuSceneSource).toContain('visibility threshold of alpha > 1');
    expect(menuSceneSource).toContain('const MAZER_HUD_PROFILE_ICON_METRICS: LegacyHudIconSourceMetrics = { bboxHeight: 729, bboxWidth: 615, bboxX: 320, bboxY: 268 };');
    expect(menuSceneSource).toContain('const MAZER_HUD_LEADERBOARD_ICON_METRICS: LegacyHudIconSourceMetrics = { bboxHeight: 524, bboxWidth: 692, bboxX: 281, bboxY: 359 };');
    expect(menuSceneSource).toContain('const MAZER_HUD_SETTINGS_ICON_METRICS: LegacyHudIconSourceMetrics = { bboxHeight: 828, bboxWidth: 807, bboxX: 221, bboxY: 204 };');
    expect(menuSceneSource).not.toContain('bboxHeight: 1193, bboxWidth: 1119, bboxX: 91, bboxY: 21');
    expect(menuSceneSource).not.toContain('bboxHeight: 1129, bboxWidth: 1111, bboxX: 97, bboxY: 53');
    expect(menuSceneSource).not.toContain('bboxHeight: 1183, bboxWidth: 1228, bboxX: 0, bboxY: 38');
  });

  test('hides the persistent play settings texture whenever the play HUD clears', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8').replace(/\r\n/g, '\n');
    const drawHudSource = menuSceneSource.slice(
      menuSceneSource.indexOf('private drawHud(time: number): void'),
      menuSceneSource.indexOf('private hasLegacyPlayTrailPulsePendingFrame')
    );
    const clearHudSource = menuSceneSource.slice(
      menuSceneSource.indexOf('private clearPlayHudImmediately(): void'),
      menuSceneSource.indexOf('private rebuildUi(): void')
    );
    const enterMenuSource = menuSceneSource.slice(
      menuSceneSource.indexOf('private enterMenuMode(): void'),
      menuSceneSource.indexOf('private startPlayMode(): void')
    );

    expect(drawHudSource).toContain("if (this.mode !== 'play' || this.overlay !== 'none') {\n      this.touchSettingsCogIconImage.setVisible(false);");
    expect(clearHudSource).toContain('this.touchSettingsCogIconImage.setVisible(false);');
    expect(enterMenuSource).toContain('this.clearPlayHudImmediately();');
  });

  test('tears down the persistent play HUD before forced auth and recovery overlays', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8').replace(/\r\n/g, '\n');
    const updateSource = menuSceneSource.slice(
      menuSceneSource.indexOf('public update(time: number, delta: number): void'),
      menuSceneSource.indexOf('private recordRuntimeFrame(')
    );
    const forcedAuthSource = menuSceneSource.slice(
      menuSceneSource.indexOf('private enterForcedLegacyAuthOverlay(): void'),
      menuSceneSource.indexOf('private rebuildUi(): void')
    );
    const recoverySource = menuSceneSource.slice(
      menuSceneSource.indexOf('private applyLegacyPasswordRecoveryEntry('),
      menuSceneSource.indexOf('private resolveLegacyRuntimeAuthFixtureSnapshot()')
    );

    expect(updateSource.match(/this\.enterForcedLegacyAuthOverlay\(\);/g)).toHaveLength(1);
    expect(updateSource).not.toContain("this.overlay = 'auth';");
    expect(recoverySource).toContain('this.enterForcedLegacyAuthOverlay();');
    expect(forcedAuthSource).toContain("if (this.mode === 'play') {\n      this.clearPlayHudImmediately();\n    }");
    expect(forcedAuthSource.indexOf('this.clearPlayHudImmediately();')).toBeLessThan(
      forcedAuthSource.indexOf("this.overlay = 'auth';")
    );
  });

  test('converts each seeded backdrop twinkle cycle to radians', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');

    expect(menuSceneSource).toContain('Math.sin(((animationTime / twinklePeriodMs) + starSeed) * Math.PI * 2)');
    expect(menuSceneSource).not.toContain('Math.sin((animationTime / twinklePeriodMs) + (starSeed * Math.PI * 2))');
  });

  test('keeps settings semantic while the compact active-track level baseline stays free of board decorations', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');

    expect(menuSceneSource).not.toContain("this.createOverlayTitle('Settings'");
    expect(menuSceneSource).not.toContain("this.createOverlayTitle('Paused'");
    expect(menuSceneSource).toContain("semanticAction: 'Settings'");
    expect(menuSceneSource).toContain("text: 'Settings'");
    expect(menuSceneSource).not.toContain('legacyPrecisionArcadeDecorationsEnabled');
    expect(menuSceneSource).toContain('const trackId = this.resolveActiveLegacyProgressionTrackId();');
    expect(menuSceneSource).toContain('this.progressionState.tracks[trackId]');
  });

  test('replaces the menu username with the inner-only animated green profile control', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8').replace(/\r\n/g, '\n');
    const profileButtonSource = menuSceneSource.slice(
      menuSceneSource.indexOf('private createLegacyMenuProfileButton('),
      menuSceneSource.indexOf('private drawLegacyProfileIcon(')
    );

    // Route through the Wave 3A bridge first, then the shared account flow.
    expect(menuSceneSource).toContain(
      'this.uiButtons.push(this.createLegacyMenuProfileButton(\n'
      + '          () => this.dispatchUiBridgeCommand({ type: \'NAVIGATE\', surface: \'account\' }, () => this.openSharedAccountSurface())\n'
      + '        ));'
    );
    expect(menuSceneSource).not.toContain('createLegacyMenuUsernameButton');
    expect(menuSceneSource).not.toContain('drawLegacyMenuUsernameLabel');
    // MAZER-UI-024: the profile icon now sits beside the settings cog (trailing slot 1); the leaderboard icon leads.
    expect(profileButtonSource).toContain("placement: 'trailing'");
    expect(profileButtonSource).toContain('slot: 1');
    expect(profileButtonSource).toContain('sizeScale: this.layout.headerIconScale');
    expect(profileButtonSource).toContain('const hit = resolveLegacyMinHitRect(frame, this.layout);');
    expect(profileButtonSource).toContain('bounds: hitBounds');
    expect(profileButtonSource).toContain('const blinkAlpha = clamp(0.22 + (phase * 0.78) + (this.menuProfileActive ? 0.08 : 0), 0.14, 1);');
    expect(profileButtonSource).toContain('const blinkScale = 0.92 + (phase * 0.08) + (this.menuProfileActive ? 0.02 : 0);');
    expect(profileButtonSource).toMatch(/this\.drawLegacyProfileIcon\([\s\S]*?blinkScale,\s*false\s*\);/);
    expect(menuSceneSource).toContain('if (showOuterRing) {');
    // Integration 3: this used to pin `const color = cyberArcadeMaterial.signal.player;`,
    // which only ever matched the pause home icon (deleted by the header/pause
    // lane) and the leaderboard title glyph (deleted by the leaderboard lane).
    // Each lane removed a different one, so the merged tree has neither. The
    // profile control's own contract is the profile texture it draws.
    expect(menuSceneSource).toContain('MAZER_HUD_PROFILE_TEXTURE_KEY');
    expect(profileButtonSource).toContain('MAZER_HUD_PROFILE_TEXTURE_KEY');
  });

  test('routes signed-out account entry directly through shared OAuth without a local login surface', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8').replace(/\r\n/g, '\n');
    const authSource = readFileSync(resolve(process.cwd(), 'src/legacy-runtime/legacyAuth.ts'), 'utf8');
    const bootSource = readFileSync(resolve(process.cwd(), 'src/boot/main.ts'), 'utf8');
    const playerMessageSource = readFileSync(resolve(process.cwd(), 'src/legacy-runtime/legacyPlayerMessage.ts'), 'utf8');
    const overlayRoutingSource = readFileSync(resolve(process.cwd(), 'src/legacy-runtime/legacyOverlayRouting.ts'), 'utf8');

    expect(overlayRoutingSource).toContain("export type LegacyOverlayKind = 'none' | 'options' | 'pause' | 'auth' | 'confirm-progression-reset' | 'leaderboard';");
    expect(authSource).toContain('createClient(config.url, config.anonKey');
    expect(authSource).toContain('autoRefreshToken: true');
    expect(authSource).toContain('lock: runLegacyAuthJsLock');
    expect(authSource).not.toContain('lock: async (_name, _acquireTimeout, fn) => fn()');
    expect(authSource).toContain('persistSession: true');
    expect(authSource).toContain('detectSessionInUrl: isLegacyPasswordRecoveryRuntimeLocation()');
    expect(authSource).not.toContain('detectSessionInUrl: true');
    expect(authSource).toContain('createLegacyAuthScopedStorage');
    expect(menuSceneSource).toContain('LEGACY_GAME_TOGGLE_STORAGE_KEY');
    expect(menuSceneSource).toContain('this.loadPersistedLegacyGameToggleSettings();');
    expect(menuSceneSource).toContain('this.authSnapshot');
    expect(menuSceneSource).toContain('private resolveLegacyRuntimeAuthFixtureSnapshot(): LegacyAuthSessionSnapshot | null');
    expect(menuSceneSource).toContain('isLegacyRuntimeDiagnosticsAuthFixtureRoute(window.location.search)');
    // Bounded by runBoundedAccountBootstrap (4000 ms) since the boot-continuity packet; the route-aware bootstrap is still the one run.
    expect(bootSource).toContain('bootstrap: () => bootstrapLegacyRemoteAccountStateForRoute(window.location.search),');
    expect(bootSource).not.toContain('await bootstrapLegacyRemoteAccountState();');
    expect(menuSceneSource).toContain('userId: LEGACY_RUNTIME_DIAGNOSTICS_AUTH_FIXTURE_USER_ID');
    expect(menuSceneSource).toContain('isLegacyRemoteAccountProviderEligible(snapshot)');
    expect(menuSceneSource).toContain('const runtimeAuthFixtureSnapshot = this.resolveLegacyRuntimeAuthFixtureSnapshot();');
    expect(menuSceneSource).toContain('if (runtimeAuthFixtureSnapshot) {');
    expect(menuSceneSource).not.toContain("this.openOverlay('auth')");
    expect(menuSceneSource).toContain('private buildAuthOverlay(): void');
    expect(menuSceneSource).toContain('private buildSharedAccountEntrySection(');
    // The forced screen is drawn from the shared auth-screen view-model: one
    // full-width dock, a secondary rail and a legal row (labels live in
    // legacyAuthScreenView.ts, not as MenuScene literals).
    expect(menuSceneSource).toContain('buildLegacyAuthScreenViewModel({');
    expect(menuSceneSource).toContain('resolveLegacyAuthScreenLayout(');
    expect(menuSceneSource).toContain('drawLinkRow(layout.rail, model.secondaryRail');
    expect(menuSceneSource).toContain('drawLinkRow(layout.legal, model.legalRow');
    expect(menuSceneSource).toContain('dock.label,');
    expect(menuSceneSource).not.toContain("'Reset password'");
    expect(menuSceneSource).not.toContain("text: 'Create account'");
    expect(menuSceneSource).toContain('this.createLegacyAuthActionButton(');
    expect(menuSceneSource).not.toContain("text: 'Play as guest',");
    expect(menuSceneSource).not.toContain('onClick: () => this.handleLegacyGuestPlay()');
    expect(menuSceneSource).toContain('private async handleSharedAccountAuthorization(): Promise<void>');
    expect(menuSceneSource).toContain('const result = await beginMazerOAuthAuthorization();');
    expect(menuSceneSource).toContain('void this.handleSharedAccountAuthorization();');
    expect(menuSceneSource).toContain('private createLegacySignedOutOAuthFailure(): void');
    expect(menuSceneSource).toContain('!isLegacyOAuthFailureCopy(this.authSnapshot.error)');
    expect(menuSceneSource).toContain('this.createLegacySignedOutOAuthFailure();');
    expect(menuSceneSource).toContain('this.oauthPageShowCleanup = installMazerOAuthPageShowRecovery(window, () => {');
    expect(menuSceneSource).toContain('this.oauthPageShowCleanup?.();');
    expect(menuSceneSource).toContain("if (this.overlay === 'auth') {");
    expect(menuSceneSource.indexOf("if (this.overlay === 'auth') {")).toBeLessThan(menuSceneSource.indexOf('this.updateStars(time, delta);'));
    expect(menuSceneSource).toContain('private createAuthFooterLink(');
    expect(menuSceneSource).toContain('private navigateToSharedAccountRoute(');
    expect(menuSceneSource).toContain('private async handleLegacyAuthSignOut(): Promise<void>');
    // Sign out is a row of the shared settings plan (menu context, signed in only), not a docked bar.
    expect(menuSceneSource).not.toContain('createLegacyOptionsSessionActionBar');
    expect(menuSceneSource).toContain("case 'SIGN_OUT':\n        void this.handleLegacyAuthSignOut();");
    expect(menuSceneSource).toContain("if (this.authSnapshot.status !== 'authenticated') {");
    // The Options overlay's own bottom bar is intentionally Sign-out-only
    // (above). The real, normal way an authenticated player reaches their
    // account is the profile/username icon (present in both the main menu
    // and the Options header): its onClick calls openSharedAccountSurface(),
    // which -- when already authenticated -- navigates straight to the real
    // account portal via navigateToSharedAccountRoute('account'), with no
    // intermediate internal overlay. Confirmed both here (source) and by a
    // real click-through with the external navigation intercepted:
    // scripts/analysis/verify-options-account-reachability.mjs.
    expect(menuSceneSource).toContain('private openSharedAccountSurface(): void {');
    expect(menuSceneSource).toContain(
      "if (this.authSnapshot.status === 'authenticated') {\n      this.navigateToSharedAccountRoute('account');\n      return;\n    }"
    );
    expect(menuSceneSource).toContain('private navigateToSharedAccountRoute(route: \'account\' | \'reset-password\'): void {');
    expect(menuSceneSource).toContain('navigateToMazerAccountPortal(route, window.location);');
    // buildAuthenticatedAccountSection's own Account/Sign-out bar exists for
    // a narrower path (completing sign-in while the auth overlay is already
    // open) -- pinned as source wiring only, not claimed reachable via the
    // profile icon while already authenticated (that click never reaches
    // this function -- see openSharedAccountSurface above).
    expect(menuSceneSource).toContain('private buildAuthenticatedAccountSection(');
    expect(menuSceneSource).toContain(
      "{ onClick: () => this.navigateToSharedAccountRoute('account'), text: 'Account', tone: 'primary' },\n      { onClick: () => { void this.handleLegacyAuthSignOut(); }, text: 'Sign out', tone: 'danger' }"
    );
    expect(menuSceneSource).toContain('interface LegacyAuthActionDiagnostics');
    expect(menuSceneSource).toContain('private latestAuthActionDiagnostics: LegacyAuthActionDiagnostics | null = null;');
    expect(menuSceneSource).toContain('private recordLegacyAuthActionDiagnostics(');
    expect(menuSceneSource).toContain("stage: 'started'");
    expect(menuSceneSource).toContain("stage: 'blocked'");
    expect(menuSceneSource).toContain("stage: 'submitting'");
    expect(menuSceneSource).toContain("stage: 'result'");
    expect(menuSceneSource).toContain("stage: 'exception'");
    expect(menuSceneSource).toContain('authAction: this.latestAuthActionDiagnostics');
    expect(menuSceneSource).toContain('const shouldReturnToMainMenuAfterLogin = this.authForm.mode === \'login\'');
    expect(menuSceneSource).toContain('private closeLegacyAuthOverlayToMainMenu(): void');
    expect(menuSceneSource).toContain('const playAccessAllowed = this.hasLegacyPlayAccess();');
    expect(menuSceneSource).toContain('if (!playAccessAllowed) {');
    // Now routes through the Wave 3A bridge first (bridge.dispatch(START_RUN)),
    // falling back to the same real startPlayMode() call only if the bridge
    // rejects or is unavailable.
    expect(menuSceneSource).toContain(
      'startLabel,\n              () => this.dispatchUiBridgeCommand({ type: \'START_RUN\' }, () => this.startPlayMode()),'
    );
    expect(menuSceneSource).toContain("menuActionMode: this.authSnapshot.status === 'authenticated' ? 'authenticated' : 'guest'");
    expect(menuSceneSource).toContain("const previousMenuActionMode = this.authSnapshot.status === 'authenticated' ? 'authenticated' : 'guest';");
    expect(menuSceneSource).toContain("const menuActionMode = snapshot.status === 'authenticated' ? 'authenticated' : 'guest';");
    expect(menuSceneSource).toContain('previousMenuActionMode !== menuActionMode');
    expect(menuSceneSource).toContain('this.refreshLayout();');
    // Route through the shared bridge, then the canonical account surface.
    expect(menuSceneSource).toContain(
      "'Login',\n              () => this.dispatchUiBridgeCommand({ type: 'NAVIGATE', surface: 'account' }, () => this.openSharedAccountSurface()),"
    );
    expect(menuSceneSource).toContain('this.layout.centerButtonX,');
    expect(menuSceneSource).toContain('this.layout.centerButtonY,');
    expect(menuSceneSource).not.toContain('const accountActionLabel =');
    // The Options overlay no longer carries a profile/account icon in its
    // header (owner request, 2026-11-05); the account entry is the main
    // menu's top-left profile icon only, which uses the same shared surface.
    expect(menuSceneSource).not.toContain('private createLegacyOptionsAccountActionRow(');
    expect(menuSceneSource).not.toContain('createLegacyOverlayUsernameButton');
    expect(normalizeSourceLineEndings(menuSceneSource)).toContain(
      'this.uiButtons.push(this.createLegacyMenuProfileButton(\n'
      + '          () => this.dispatchUiBridgeCommand({ type: \'NAVIGATE\', surface: \'account\' }, () => this.openSharedAccountSurface())\n'
      + '        ));'
    );
    expect(authSource).toContain('LEGACY_AUTH_MESSAGE_COPY.authUnavailable');
    expect(playerMessageSource).toContain('Account access is unavailable right now. Try again shortly.');
    expect(playerMessageSource).toContain('export interface LegacyQueuedPlayerMessage');
    expect(playerMessageSource).toContain('export const enqueueLegacyPlayerMessage =');
    expect(playerMessageSource).toContain('export const expireLegacyPlayerMessageQueue =');
    expect(menuSceneSource).toContain('private latestAuthMessage: LegacyPlayerMessage | null = null;');
    expect(menuSceneSource).toContain('private resolveLegacyCurrentAuthMessage(): LegacyPlayerMessage | null');
    expect(menuSceneSource).toContain('latestAuthMessage: this.latestAuthMessage');
    expect(menuSceneSource).toContain('resolveLegacyAuthFeedbackMessage');
    expect(menuSceneSource).toContain('resolveLegacyAuthValidationMessage');
    // The on-screen message/toast system was removed entirely -- no message
    // box of any kind is ever drawn to the player, in an overlay or the play
    // HUD. The queue/diagnostics plumbing underneath stays internal-only
    // (still exercised by QA diagnostics), but nothing renders it.
    expect(menuSceneSource).toContain('private playerMessageQueue: LegacyQueuedPlayerMessage[] = [];');
    expect(menuSceneSource).toContain('private pushLegacyPlayerMessage(message: LegacyPlayerMessage | null): void');
    expect(menuSceneSource).toContain('private markLegacyPlayerMessagesDirty(): void');
    expect(menuSceneSource).toContain('enqueueLegacyPlayerMessage(');
    expect(menuSceneSource).toContain('expireLegacyPlayerMessageQueue(this.playerMessageQueue, time)');
    expect(menuSceneSource).not.toContain('private createOverlayPlayerMessageStack(');
    expect(menuSceneSource).not.toContain('this.createOverlayPlayerMessageStack(visibleMessages');
    expect(menuSceneSource).not.toContain('private createOverlayPlayerMessageCard(');
    expect(menuSceneSource).not.toContain('private drawLegacyPlayPlayerMessageStack(hudFrame: LegacyPlayHudFrame): void');
    expect(menuSceneSource).not.toContain('this.drawLegacyPlayPlayerMessageStack(hudFrame);');
    expect(menuSceneSource).toContain('private latestAuthFeedbackMessageExpiresAtMs = Number.NEGATIVE_INFINITY;');
    expect(menuSceneSource).toContain('private latestOverlayMessageExpiresAtMs = Number.NEGATIVE_INFINITY;');
    expect(menuSceneSource).toContain('private expireLegacyPlayerMessages(time: number): void');
    expect(menuSceneSource).toContain('this.expireLegacyPlayerMessages(time);');
    expect(menuSceneSource).not.toContain('resolveLegacyOverlayFieldCommitMessage');
    expect(menuSceneSource).not.toContain('resolveLegacyOverlayToggleMessage');
    expect(menuSceneSource).not.toContain('resolveLegacyOverlayMovementSpeedMessage');
    expect(menuSceneSource).toContain('this.armLegacyAuthFeedbackMessage();');
    expect(menuSceneSource).toContain('this.latestRemoteSyncResult = result;');
    expect(menuSceneSource).not.toContain('this.pushLegacyPlayerMessage(result.playerMessage);');
    expect(menuSceneSource).toContain('visibleMessages: this.resolveVisibleLegacyPlayerMessages()');
    expect(menuSceneSource).not.toContain('private createOverlayPlayerMessageText');
    expect(menuSceneSource).not.toContain('private createAuthFeedbackText');
    expect(menuSceneSource).not.toContain('private createAuthMessageText');
    expect(menuSceneSource).not.toContain('Guest mode is active. Account login needs Supabase env vars.');
    expect(menuSceneSource).toContain('void this.hydrateLegacyAccountDataAfterAuth(snapshot, hydrationSequence);');
    expect(menuSceneSource).toContain('private async hydrateLegacyAccountDataAfterAuth(');
    expect(menuSceneSource).not.toContain('seedSignedInProgressionFromGuest');
    expect(menuSceneSource).toContain('this.resolveLegacyProgressionStorageKey()');
  });

  test('MAZER-UI-024: the header username label is gone (the online counter took its spot); no bottom Welcome block either', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');

    // The old bottom-of-menu Welcome + username pair is gone entirely, and so is the header label that replaced it.
    expect(menuSceneSource).not.toContain('createLegacyAuthenticatedWelcomeIdentity');
    expect(menuSceneSource).not.toContain("'Welcome', {");
    expect(menuSceneSource).not.toContain('createLegacyHeaderIdentityLabel');
    expect(menuSceneSource).not.toContain('LEGACY_HEADER_IDENTITY_LABEL_NAME');
    expect(menuSceneSource).not.toContain('resolveLegacyHeaderIdentityPlacement');
    // The username is still read for the leaderboard and account surfaces, never for the main-menu header.
    expect(menuSceneSource).toContain('canonicalUsername');
  });

  test('records the Fitness account-surface reuse contract without coupling Phaser to Fitness React components', () => {
    const authReuseContract = readFileSync(
      resolve(process.cwd(), 'docs/ops/MAZER-FITNESS-AUTH-SURFACE-REUSE-2026-08-16.md'),
      'utf8'
    );

    expect(authReuseContract).toContain('fawxzzy-fitness/src/components/ui/LabeledEditorField.tsx');
    expect(authReuseContract).toContain('fawxzzy-fitness/src/components/ui/PasswordInput.tsx');
    expect(authReuseContract).toContain('The auth overlay is fully opaque');
    expect(authReuseContract).toContain('Native password input width reserves a touch target');
    expect(authReuseContract).toContain('Settings always opens the Account surface for both guest and signed-in players.');
    expect(authReuseContract).toContain('It does not update, insert, upsert, or otherwise mutate the provider.');
    expect(authReuseContract).toContain('The main menu renders the independent menu-AI level only.');
    expect(authReuseContract).toContain('No shared React component import into Phaser.');
  });

  test('keeps the opaque auth visual family while routing account entry through the shared portal', () => {
    const menuSceneSource = normalizeSourceLineEndings(
      readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8')
    );
    const authSource = readFileSync(resolve(process.cwd(), 'src/legacy-runtime/legacyAuth.ts'), 'utf8');

    expect(normalizeSourceLineEndings(menuSceneSource)).toBe(menuSceneSource);
    expect(normalizeSourceLineEndings(menuSceneSource.replaceAll('\n', '\r\n'))).toBe(menuSceneSource);

    expect(menuSceneSource).toContain('const LEGACY_AUTH_UI_FONT_FAMILY');
    expect(menuSceneSource).toContain("this.overlay === 'auth' ? cyberArcadeMaterial.substrate.field : 0x02040a");
    expect(menuSceneSource).toContain("&& this.overlay === 'none';");
    expect(menuSceneSource).toContain('border.lineStyle(1, borderColor, borderAlpha);');
    expect(menuSceneSource).toContain('new Phaser.Curves.CubicBezier(');
    expect(menuSceneSource).toContain("fontFamily: unifiedAuthDockButton ? LEGACY_AUTH_UI_FONT_FAMILY : LEGACY_UI_FONT_FAMILY");
    expect(menuSceneSource).toContain("const barHeight = this.overlay === 'auth' ? 56");
    expect(menuSceneSource).not.toContain('EMAIL OR USERNAME');
    expect(menuSceneSource).toContain('this.levelAnnouncerNumberGraphics.setVisible(false);');
    expect(menuSceneSource).toContain("this.authSnapshot.status !== 'authenticated'");
    expect(menuSceneSource).toContain('private buildSharedAccountEntrySection(');
    // No subtitle paragraph on the forced screen (auth-surface family contract).
    expect(menuSceneSource).not.toContain('Use your shared Fawxzzy account to keep progression, settings, and leaderboard identity connected.');
    expect(menuSceneSource).toContain('const result = await beginMazerOAuthAuthorization();');
    expect(menuSceneSource).toContain("this.navigateToSharedAccountRoute('reset-password')");
    expect(menuSceneSource).not.toContain('this.createAuthAccountSummaryCard(`Signed in as ${accountLabel}`');
    const clearUiSource = menuSceneSource.slice(
      menuSceneSource.indexOf('private clearUi(): void'),
      menuSceneSource.indexOf('private async loadLeaderboard(')
    );
    expect(clearUiSource).toContain('for (const graphic of this.uiGraphics) {');
    expect(clearUiSource).toContain('graphic.destroy();');
    expect(clearUiSource).toContain('this.uiGraphics = [];');
    expect(menuSceneSource).toContain("panel.top + panel.height - 104,\n      'Reset progress'");
    expect(menuSceneSource).toContain("text: 'Sign out', tone: 'danger'");
    expect(menuSceneSource).toContain("const unifiedAuthDockButton = this.overlay === 'auth' && (tone === 'primary' || tone === 'danger');");
    expect(menuSceneSource).toContain("const unifiedAuthDanger = unifiedAuthDockButton && tone === 'danger';");
    expect(menuSceneSource).toContain('if (unifiedAuthDockButton) {');
    expect(menuSceneSource).toContain('const accentColor = unifiedAuthDanger ? cyberArcadeMaterial.signal.goal : LEGACY_PLAY_TOUCH_ACCENT;');
    expect(menuSceneSource).not.toContain("text: 'Log out'");
    expect(menuSceneSource).not.toContain("return 'Username saved.';");
    expect(authSource).toContain('detectSessionInUrl: isLegacyPasswordRecoveryRuntimeLocation()');
    expect(authSource).not.toContain('detectSessionInUrl: true');
    expect(authSource).toContain('const result = await runMazerExclusiveAuthMutation(async () => {');
    expect(authSource).toContain('if (advanceMazerSharedAuthMutationEpoch() === null)');
    expect(authSource).toContain('if (advanceMazerAuthMutationEpoch() === null)');
    expect(authSource).not.toContain('runLegacyAuthJsSessionMutation');
    expect(authSource.match(/return runLegacyAuthDirectSessionMutation\([^,]+, async \(\) => \{/g)).toHaveLength(2);
    expect(authSource).not.toContain('runLegacyAuthInternallyLockedMutation');
    expect(authSource).toContain("const directSignOut = client.auth as unknown as Partial<LegacyAuthDirectSignOutClient>;");
    expect(authSource).toContain('if (key === auth.storageKey && originalStorage.getItem(key) !== null) {');
    expect(authSource).toContain('const authStorageKey = directSignOut.storageKey;');
    expect(authSource).toContain('auth.storage = verifyingStorage;');
    expect(authSource).toContain('auth.storage = originalStorage;');
    expect(authSource).toContain('await invokeLegacyLocalSignOutWithTimeout(directSignOut)');
    expect(authSource).toContain('isLegacyRuntimeDiagnosticsAuthFixtureSnapshot(authenticatedFallback)');
    expect(menuSceneSource).toContain('fetchLegacyLeaderboardPage(request.offset, request.limit, this.authSnapshot)');
    expect(menuSceneSource).toContain('const request = resolveLegacyLeaderboardRequest();');
    expect(menuSceneSource).toContain('fetchLegacyLeaderboardSelfRank(this.authSnapshot)');
    expect(authSource).toContain('const authenticatedPreimage = readLegacyPersistedAuthSessionSnapshot(');
    expect(authSource).toContain('const preserveAuthenticatedPreimage = (message?: string | null): LegacyAuthActionResult => ({');
    expect(authSource).toContain('if (!isLegacyPersistedAuthSessionRemoved(authStorage, authStorageKey)) {');
    expect(menuSceneSource).toContain('await signOutLegacyAuth(this.authSnapshot)');
    expect(authSource).not.toContain("await client.auth.signOut({ scope: 'local' })");
    expect(authSource.match(/runLegacyAbortableCredentialRequest\(/g)).toHaveLength(2);
    expect(authSource).toContain('LEGACY_AUTH_CREDENTIAL_TIMEOUT_MS = 10_000');
    expect(authSource).toContain('sessionResult = await client.auth.getSession();');
    expect(authSource).not.toContain("reason: 'Enter a valid username.'");
  });

  test('keeps both the player level and the independent menu-demo AI level off the front door as persistent chrome', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');

    expect(menuSceneSource).toContain("return resolveLegacyProgressionTrackIdForSurface(this.mode === 'play' ? 'play' : 'menu-demo');");
    expect(menuSceneSource).toContain("if (this.overlay !== 'none') {");
    expect(menuSceneSource).toContain('private clearLegacyPlayerProgressionBadge(): void');
    // Neither the player's own level nor the menu-demo AI's independent
    // level (which used to read as "your level" even though it tracked
    // something the player never did) sits as permanent corner chrome any
    // more -- both surfaces instead get the same centered, between-mazes
    // announcement (drawLegacyLevelAnnouncer), gated on the shared
    // menuStaticDrawLifecyclePhase transition, not on mode.
    expect(menuSceneSource).toContain("if (this.mode === 'menu') {");
    expect(menuSceneSource).not.toContain('this.drawLegacyMenuAiProgressionBadge();');
    expect(menuSceneSource).toContain('this.clearLegacyMenuAiProgressionBadge();');
    expect(menuSceneSource).toContain('private drawLegacyLevelAnnouncer(time: number): void');
    expect(menuSceneSource).toContain('const levelDigits = String(track.level);');
    expect(menuSceneSource).not.toContain('const levelDigits = String(aiTrack.level);');
    expect(menuSceneSource).not.toContain('publishLegacyPlayerProgressionCompletion');
    expect(menuSceneSource).not.toContain('resolveLegacyPlayerProgressionOutcomeReason');
    expect(menuSceneSource).not.toContain('progression.player.cycle.');
    expect(menuSceneSource).not.toContain('No unlock.');
  });

  test('centers the level announcer and keeps board content at neutral visual scale and there is no Board Zoom setting', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');

    expect(menuSceneSource).toContain('const centerX = this.layout.width / 2;');
    expect(menuSceneSource).toContain('const centerY = this.layout.height / 2;');
    expect(menuSceneSource).toContain('private boardZoomContainer!: Phaser.GameObjects.Container;');
    expect(menuSceneSource).toContain('this.boardZoomContainer.add([');
    expect(menuSceneSource).not.toContain('resolveLegacyBoardZoomTargetScale');
    expect(menuSceneSource).not.toContain('updateLegacyBoardZoom');
    expect(menuSceneSource).not.toContain('this.boardZoomContainer.setScale(');
    expect(menuSceneSource).not.toContain('this.boardZoomContainer.setPosition(');
    expect(menuSceneSource).not.toContain('camScale');
    expect(menuSceneSource).not.toContain('userBoardZoom');
    expect(menuSceneSource).not.toContain('createBoardZoomSliderRow');
    expect(menuSceneSource).not.toContain('applyLegacyCameraZoom');
    expect(menuSceneSource).toContain('implicitZoomApplied: false');
    expect(menuSceneSource).toContain('x: this.boardZoomContainer.scaleX');
    expect(menuSceneSource).toContain('y: this.boardZoomContainer.scaleY');
  });

  test('threads the level announcer\'s own computed revealProgress into the shared tile-block glyph renderer instead of discarding it', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');

    // Real, reported defect: resolveLegacyLevelAnnouncerVisualState already
    // computes a real revealProgress for this banner's own fade-in/out
    // timing, but drawLegacyLevelAnnouncerNumberGlyph hardcoded a full,
    // instant reveal instead of using it -- the number always popped in as
    // one flat block instead of building tile-by-tile the way the title/
    // Start/Login words next to it do ("is the level tiles not building out
    // the number like it does for title text tiles"). The caller must
    // destructure the real value and pass it all the way through to the
    // shared renderer, the same way the title's own call site already
    // threads resolveLegacyMenuPathTitleProgress() into the identical
    // parameter -- not recompute or approximate it.
    expect(menuSceneSource).toContain(
      'const { alpha, scale, revealProgress } = this.resolveLegacyLevelAnnouncerVisualState(time);'
    );
    expect(menuSceneSource).toContain(
      'this.drawLegacyLevelAnnouncerNumberGlyph(this.levelAnnouncerNumberGraphics, glyphLayout, time, revealProgress);'
    );
    expect(menuSceneSource).toContain(
      'this.drawLegacyGlyphWordTileBlock(graphics, layout, time, 1, revealProgress);'
    );
    // The exact rejected form: a bare destructure that drops revealProgress,
    // and the hardcoded-reveal call it fed into.
    expect(menuSceneSource).not.toContain(
      'const { alpha, scale } = this.resolveLegacyLevelAnnouncerVisualState(time);'
    );
    expect(menuSceneSource).not.toContain(
      'this.drawLegacyLevelAnnouncerNumberGlyph(this.levelAnnouncerNumberGraphics, glyphLayout, time);'
    );
    expect(menuSceneSource).not.toContain('this.drawLegacyGlyphWordTileBlock(graphics, layout, time, 1);');

    // Boundary behavior: drawLegacyGlyphWordTileBlock's own reveal math
    // (shared with the title, already proven there) must still default to a
    // full reveal when no revealProgress is supplied at all -- callers that
    // legitimately want an instant reveal (there are none for the level
    // announcer any more, but the shared renderer itself must stay
    // backward-compatible) are not broken by this fix.
    expect(menuSceneSource).toContain('revealProgress: number = 1');
    expect(menuSceneSource).toContain(
      'const visibleCellCount = clamp(Math.ceil(layout.cells.length * clamp(revealProgress, 0, 1)), 0, layout.cells.length);'
    );
  });

  test('hydrates the scene from the already-fetched account bootstrap instead of leaving the local Level-1 placeholder active', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');

    expect(menuSceneSource).toContain('readLegacyBootstrappedAccountState,');
    expect(menuSceneSource).toContain('this.applyBootstrappedLegacyAccountState();');
    expect(menuSceneSource).toContain('private applyBootstrappedLegacyAccountState(): void');
    expect(menuSceneSource).toContain('bootstrapped.snapshot.userId !== this.authSnapshot.userId');
    expect(menuSceneSource).toContain('bootstrapped.progressionState');
    expect(menuSceneSource).toContain('bootstrapped.settings');
  });

  test('loads the leaderboard top N in one request (no pager) and binds transfer beams to the same moving diamond frame', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');

    // 2026-11-06 redesign: the sheet loads the top N (LEGACY_LEADERBOARD_TOP_N, in the view-model) in one
    // request and scrolls; there is no ten-per-page pager, no offset state and no private page-size copy.
    expect(menuSceneSource).not.toContain('LEADERBOARD_VISIBLE_ROWS');
    expect(menuSceneSource).not.toContain('leaderboardOffset');
    expect(menuSceneSource).not.toContain('loadLeaderboardPage');
    expect(menuSceneSource).not.toContain('resolveLegacyLeaderboardPageRequest');
    expect(menuSceneSource).toContain('resolveLegacyLeaderboardRequest()');
    // Transfer lasers bind to the SAME edge stations the markers are drawn at.
    expect(menuSceneSource).toContain('private resolveLegacyEdgeStations(): ReadonlyArray<EdgeStation>');
    expect(menuSceneSource).not.toContain('resolveLegacyPlayerTransferOrbitPoses');
    expect(menuSceneSource).not.toContain('resolveLegacyMenuPathTitleOrbitFrame');
    // Outbound now arms on the same clock as the bleed-dock corridor's own
    // retraction (menuStaticDeconstructStartedAtMs, set in
    // armLegacyMenuStaticDeconstructStage) instead of waiting for the
    // tile-count-based grid clear to nearly finish -- that mismatch was the
    // visible "corridor retracts, pauses, then the laser finally fires" bug.
    expect(menuSceneSource).toContain("this.menuStaticDrawLifecyclePhase = 'deconstructing';");
    expect(menuSceneSource).toContain('if (this.playerTransferEnergyArmed && this.playerTransferEnergyOutboundStartedAtMs === null) {');
    expect(menuSceneSource).not.toContain('resolveLegacyStaticDrawBuildRemainingMs({');
    expect(menuSceneSource).toContain('this.playerSpawnBurstStartedAtMs ??= laserStartedAtMs;');
  });

  test('hydrates the signed-in username before deciding whether leaderboard access is gated', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');
    // The gate is resolved into the view-state first; the pure view-model owns
    // the copy (profile loading / unavailable, 'Retry', 'Edit name') and
    // tests/reset/legacy-leaderboard-view.test.ts pins it.
    const gateSource = menuSceneSource.slice(
      menuSceneSource.indexOf('private resolveLegacyLeaderboardViewState(): LegacyLeaderboardViewState'),
      menuSceneSource.indexOf('private runLegacyLeaderboardAction(')
    );

    expect(gateSource).toContain("if (this.authSnapshot.status === 'authenticated') {");
    expect(gateSource).toContain('this.loadAccountUsernameIfNeeded();');
    expect(gateSource).toContain("usernameGate = 'loading';");
    expect(gateSource).toContain("usernameGate = 'unavailable';");
    expect(gateSource).toContain("usernameGate = 'needs-username';");
    expect(gateSource.indexOf('this.loadAccountUsernameIfNeeded();')).toBeLessThan(
      gateSource.indexOf('this.accountUsernameSavedValue.length <= 0')
    );
    const overlaySource = menuSceneSource.slice(
      menuSceneSource.indexOf('private buildLeaderboardOverlay(): void'),
      menuSceneSource.indexOf('private buildProgressionResetConfirmationOverlay(): void')
    );
    expect(overlaySource).toContain('buildLegacyLeaderboardViewModel(this.resolveLegacyLeaderboardViewState())');
    expect(overlaySource).toContain('buildLegacyLeaderboardOverlayPlan(');
    expect(overlaySource).not.toContain('drawLegacyLeaderboardTitleGlyph');
    // Same exit language as Settings: no chevron / X; the primary Back to Menu row, Escape (handleBackAction)
    // and the scrim tap close the sheet. Rows scroll under the shared mask and rail; the You row is painted outside it.
    expect(overlaySource).not.toContain('createOverlayBackChevronButton');
    expect(overlaySource).toContain('plan.exitLabel,');
    expect(overlaySource).toContain('() => this.handleBackAction(),');
    expect(overlaySource).toContain('this.overlayScrimCloseBounds = createVisualRect(plan.card.left');
    expect(overlaySource).toContain('this.applyLegacySheetScroll(');
    expect(overlaySource).toContain('this.paintLegacyLeaderboardSelfRow(plan.selfRow)');
    expect(menuSceneSource).toContain("(this.overlay !== 'options' && this.overlay !== 'leaderboard')");
    expect(menuSceneSource).not.toContain('resolveLegacyLeaderboardRowAccent');
  });

  test('consumes shared UI standards for buttons, titles, guides, and toggles', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');

    expect(menuSceneSource).toContain("from '../legacy-runtime/legacyUiStandards';");
    expect(menuSceneSource).toContain("resolveLegacyUiLabelCenterY(y, buttonFontSize, options.labelRole ?? 'button')");
    expect(menuSceneSource).toContain("resolveLegacyUiLabelCenterY(y, fontSize, 'overlay-title')");
    // Toggle rows take their geometry from the shared plan, not from panel width.
    expect(menuSceneSource).toContain('const parts = item.parts;');
  });

  test('keeps the options and pause player guide readable while explaining visible badge fields', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');

    // Wiring lane (2026-11-06): the Guide is a sheet (legacyGuideSheetPlan.ts + legacyGuideContent.ts) with
    // wrapped 14 px copy and an icon per row; the old dropdown's 8-11 px legend and its start/exit rows are gone.
    expect(menuSceneSource).toContain('const model = buildLegacyGuideSheetModel(context, { hasKeyboard: this.resolveLegacyGuideHasKeyboard() });');
    expect(menuSceneSource).toContain('let plan = buildLegacyGuideSheetPlan({ ...planInput, itemHeights: measure(Number.MAX_SAFE_INTEGER) });');
    expect(menuSceneSource).toContain('model.closeLabel,');
    expect(menuSceneSource).toContain('private closeLegacyGuideSheet(): void {');
    expect(menuSceneSource).not.toContain("drawLegendRow(legendRowIndex, 'start', 'Start'");
    expect(menuSceneSource).not.toContain("'begin at gold'");
    expect(menuSceneSource).not.toContain('const guideLayout = resolveLegacyOptionsGuideLayout(panel.width, 5);');
    expect(menuSceneSource).not.toContain("'Player • green trail'");
    expect(menuSceneSource).not.toContain("'AI marker + trail'");
    expect(menuSceneSource).not.toContain("`${this.mode === 'play' ? 'Rank' : 'AI Rank'} • public tier`");
    expect(menuSceneSource).not.toContain("'Score • run quality'");
    expect(menuSceneSource).not.toContain("'Maze • difficulty'");
    expect(menuSceneSource).not.toContain('the current procedural challenge tier');
  });

  test('exposes wrapped edge player snaps in runtime diagnostics', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');
    const diagnosticsSource = readFileSync(resolve(process.cwd(), 'src/scenes/menuRuntimeDiagnostics.ts'), 'utf8');

    expect(menuSceneSource).toContain("type LegacyPlayerVisualMotionSnapReason = 'wrapped-step' | null;");
    expect(menuSceneSource).toContain('private lastPlayerVisualMotionSnapReason: LegacyPlayerVisualMotionSnapReason = null;');
    expect(menuSceneSource).toContain("this.syncLegacyPlayerVisualMotionTo(to, 'wrapped-step');");
    expect(menuSceneSource).toContain('visualMotionSnapReason: this.lastPlayerVisualMotionSnapReason');
    expect(diagnosticsSource).toContain("visualMotionSnapReason?: 'wrapped-step' | null;");
  });

  test('publishes explicit play lifecycle diagnostics for runtime and visual proof', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');
    const diagnosticsSource = readFileSync(resolve(process.cwd(), 'src/scenes/menuRuntimeDiagnostics.ts'), 'utf8');
    const lifecycleSource = readFileSync(resolve(process.cwd(), 'src/legacy-runtime/legacyPlayLifecycle.ts'), 'utf8');
    const qaScriptSource = readFileSync(resolve(process.cwd(), 'scripts/analysis/live-play-qa.mjs'), 'utf8');

    expect(lifecycleSource).toContain("export type LegacyPlayLifecyclePhase =");
    expect(lifecycleSource).toContain("'goal-hold'");
    expect(lifecycleSource).toContain("export const resolveLegacyPlayLifecycleSnapshot =");
    expect(menuSceneSource).toContain('private resolveLegacyPlayLifecycleDiagnostics(time: number): LegacyPlayLifecycleSnapshot');
    expect(menuSceneSource).toContain('private runtimeDiagnosticsPlayLifecycleSignature: string | null = null;');
    expect(menuSceneSource).toContain('private visualDiagnosticsPlayLifecycleSignature: string | null = null;');
    expect(menuSceneSource).toContain('private resolveLegacyPlayLifecycleDiagnosticsSignature(time: number): string');
    expect(menuSceneSource).toContain('const lifecycleChanged = playLifecycleSignature !== this.runtimeDiagnosticsPlayLifecycleSignature;');
    expect(menuSceneSource).toContain('const lifecycleChanged = playLifecycleSignature !== this.visualDiagnosticsPlayLifecycleSignature;');
    expect(menuSceneSource).toContain('&& !lifecycleChanged');
    expect(menuSceneSource).toContain('this.armLegacyMenuStaticDeconstructStage(time);');
    expect(menuSceneSource).toContain('this.publishVisualDiagnostics(time, true);');
    expect(menuSceneSource).toContain('this.publishRuntimeDiagnostics(time, true);');
    expect(menuSceneSource).toContain('const playLifecycle = this.resolveLegacyPlayLifecycleDiagnostics(time);');
    expect(menuSceneSource).toContain('lifecycle: playLifecycle');
    expect(menuSceneSource).toContain('playLifecycle,');
    expect(diagnosticsSource).toContain('lifecycle?: {');
    expect(diagnosticsSource).toContain("phase: 'idle' | 'building' | 'ready' | 'playing' | 'goal-hold' | 'deconstructing' | 'handoff';");
    expect(qaScriptSource).toContain('const runtimeLifecycle = runtime?.play?.lifecycle ?? null;');
    expect(qaScriptSource).toContain('explicitLifecyclePhase: lifecycle?.phase ?? null');
  });

  test('keeps live-play QA movement on a runtime-diagnostics-only bridge', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');
    const qaScriptSource = readFileSync(resolve(process.cwd(), 'scripts/analysis/live-play-qa.mjs'), 'utf8');

    expect(menuSceneSource).toContain('interface LegacyQaDiagnosticsApi');
    expect(menuSceneSource).toContain('private installLegacyQaDiagnosticsSurface(): void');
    expect(menuSceneSource).toContain('if (!this.runtimeDiagnosticsConfig.enabled || typeof window === \'undefined\')');
    expect(menuSceneSource).toContain('window.__MAZER_QA__ = {');
    expect(menuSceneSource).toContain('movePlayPlayer: (move: string): LegacyQaMoveResult => this.handleLegacyQaPlayMove(move)');
    expect(menuSceneSource).toContain('openSettingsOverlay: (): LegacyQaOverlayResult => this.handleLegacyQaOpenSettingsOverlay()');
    expect(menuSceneSource).toContain('openPauseOverlay: (): LegacyQaOverlayResult => this.handleLegacyQaOpenPauseOverlay()');
    expect(menuSceneSource).toContain('startPlayMode: (): LegacyQaOverlayResult => this.handleLegacyQaStartPlayMode()');
    expect(menuSceneSource).toContain('private handleLegacyQaOpenSettingsOverlay(): LegacyQaOverlayResult');
    expect(menuSceneSource).toContain('private handleLegacyQaOpenPauseOverlay(): LegacyQaOverlayResult');
    expect(menuSceneSource).toContain('private handleLegacyQaStartPlayMode(): LegacyQaOverlayResult');
    expect(menuSceneSource).toContain("this.openOverlay('options');");
    expect(menuSceneSource).toContain('this.rebuildUi();');
    expect(menuSceneSource).toContain('this.publishVisualDiagnostics(this.time.now, true);');
    expect(menuSceneSource).toContain('this.publishRuntimeDiagnostics(this.time.now, true);');
    expect(menuSceneSource).toContain('private detachLegacyQaDiagnosticsSurface(): void');
    expect(menuSceneSource).toContain('delete window.__MAZER_QA__;');
    expect(menuSceneSource).toContain('const accepted = this.tryMovePlayerFromInput(vector.deltaX, vector.deltaY, { releaseAfterStep: true });');
    expect(qaScriptSource).toContain("const DEFAULT_INPUT_METHOD = 'qa';");
    expect(qaScriptSource).toContain('const api = window.__MAZER_QA__;');
    expect(qaScriptSource).toContain('api.movePlayPlayer(actionKind)');
  });

  test('keeps player play mazes fresh and progression-scaled across start and goal reset', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');
    const generationLifecycleSource = readFileSync(resolve(process.cwd(), 'src/legacy-runtime/legacyGenerationLifecycle.ts'), 'utf8');

    expect(menuSceneSource).toContain('private createFreshLegacyPlayGenerationSeed(): number');
    expect(menuSceneSource).toContain('const playerTrack = this.progressionState.tracks.player;');
    expect(menuSceneSource).toContain('playerTrack.targetComplexity * 1009');
    expect(menuSceneSource).toContain('resolveLegacyProgressionOrdinalSeedComponent(playerTrack.completedCycles, 1_000_003)');
    expect(menuSceneSource).toContain('resolveLegacyProgressionOrdinalSeedComponent(playerTrack.level, 1_000_033)');
    expect(menuSceneSource).toContain('playerTrack.paceScore * 37');
    expect(menuSceneSource).toContain("const seedOverride = mode === 'play'");
    expect(menuSceneSource).toContain('seedOverride');
    expect(menuSceneSource).toContain('seedOverride: this.createFreshLegacyPlayGenerationSeed()');
    // MAZER-FLOW-007: every generation resolver picks its track by mode
    // (play -> player, menu -> ai-runner) through resolveLegacyGenerationTrack.
    expect(menuSceneSource).toContain('private resolveLegacyTargetComplexityForMode(mode: RuntimeMode): number');
    expect(menuSceneSource).toContain('resolveLegacyGenerationTrack(this.progressionState, mode).targetComplexity');
    expect(menuSceneSource).toContain("const menuTrack = resolveLegacyGenerationTrack(this.progressionState, 'menu');");
    expect(menuSceneSource).toContain('targetComplexity: this.resolveLegacyTargetComplexityForMode(mode)');
    expect(menuSceneSource).toContain("targetComplexity: this.resolveLegacyTargetComplexityForMode('play')");
    expect(menuSceneSource).toContain("targetComplexity: this.resolveLegacyTargetComplexityForMode('menu')");
    expect(menuSceneSource).toContain("this.resolveLegacyProgressionScaleForMode('play')");
    expect(menuSceneSource).toContain("seedSource: this.mode === 'play' || !this.explicitRuntimeMazeSeed ? 'runtime-random' : 'query'");
    expect(generationLifecycleSource).toContain('seedOverride?: number;');
    expect(generationLifecycleSource).toContain('targetComplexity?: number;');
    expect(generationLifecycleSource).toContain('selectLegacyRuntimeMazeForMode');
    expect(generationLifecycleSource).toContain('selection: review');
    expect(generationLifecycleSource).toContain('normalizeLegacyRuntimeSeed(seedOverride, currentSeed)');
  });

  test('renders menu AI memory options and retarget destinations as visible thinking overlays', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');
    const diagnosticsSource = readFileSync(resolve(process.cwd(), 'src/scenes/menuRuntimeDiagnostics.ts'), 'utf8');
    const aiSource = readFileSync(resolve(process.cwd(), 'src/domain/ai/demoWalker.ts'), 'utf8');

    expect(aiSource).toContain('export interface DemoWalkerMemoryFrame');
    expect(aiSource).toContain('thoughtState: DemoWalkerThoughtState;');
    expect(aiSource).toContain('choiceClass: DemoWalkerChoiceClass | null;');
    expect(aiSource).toContain('confidence: number;');
    expect(aiSource).toContain('aiMemory: DemoWalkerMemoryFrame;');
    expect(aiSource).toContain('memoryFrames: readonly DemoWalkerMemoryFrame[];');
    expect(aiSource).toContain('optionIndices: resolveMemoryOptionIndices()');
    expect(menuSceneSource).toContain('const LEGACY_MENU_AI_MEMORY_OPTION_CORE = cyberArcadeMaterial.signal.memory;');
    // The red target-tile outline was retired (owner request 2026-11-05); the
    // option tiles remain the only thinking overlay drawn on the board.
    expect(menuSceneSource).not.toContain('LEGACY_MENU_AI_MEMORY_TARGET_EDGE');
    expect(menuSceneSource).not.toContain('drawLegacyTileEdgeOutline');
    expect(menuSceneSource).toContain('LEGACY_MENU_AI_MEMORY_OPTION_EDGE,');
    expect(menuSceneSource).toContain('private resolveLegacyMenuAiMemoryPoints()');
    expect(menuSceneSource).toContain('const endIndex = this.menuDemoEpisode.raster.endIndex;');
    expect(menuSceneSource).toContain('targetIndex === null || targetIndex === endIndex');
    expect(menuSceneSource).toContain('private drawLegacyMenuAiMemoryOverlay(');
    expect(menuSceneSource).toContain('this.drawLegacyMenuAiMemoryOverlay(');
    expect(menuSceneSource).toContain('aiMemory: {');
    expect(menuSceneSource).toContain('choiceClass: menuAiMemory.choiceClass');
    expect(menuSceneSource).toContain('confidence: menuAiMemory.confidence');
    expect(menuSceneSource).toContain('optionCount: menuAiMemory.optionPoints.length');
    expect(menuSceneSource).toContain('targetPoint: menuAiMemory.targetPoint ? copyPoint(menuAiMemory.targetPoint) : null');
    expect(menuSceneSource).toContain('thoughtState: menuAiMemory.thoughtState');
    expect(diagnosticsSource).toContain('aiMemory?: {');
    expect(diagnosticsSource).toContain('choiceClass: string | null;');
    expect(diagnosticsSource).toContain('confidence: number;');
    expect(diagnosticsSource).toContain('optionPoints: Array<{ x: number; y: number }>;');
    expect(diagnosticsSource).toContain('targetPoint: { x: number; y: number } | null;');
    expect(diagnosticsSource).toContain('thoughtState: string;');
  });

  test('never draws a red or danger-colored marker for the menu demo walker next step', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');
    const overlayStart = menuSceneSource.indexOf('private drawLegacyMenuAiMemoryOverlay(');
    expect(overlayStart).toBeGreaterThan(-1);
    const overlayEnd = menuSceneSource.slice(overlayStart).search(/\r?\n {2}\}\r?\n/);
    expect(overlayEnd).toBeGreaterThan(0);
    const overlayBody = menuSceneSource.slice(overlayStart, overlayStart + overlayEnd);

    // The overlay may only fill option tiles; it must not outline/stroke the
    // walker's committed target (the old red square one step ahead).
    expect(overlayBody).not.toContain('targetPoint');
    expect(overlayBody).not.toMatch(/stroke|Outline|warning|danger|signal\.goal/);
    expect(overlayBody).toContain('LEGACY_MENU_AI_MEMORY_OPTION_CORE');

    // No AI-memory color constant may alias the danger/goal/warning red.
    const memoryColorLines = menuSceneSource
      .split('\n')
      .filter((line) => line.startsWith('const LEGACY_MENU_AI_MEMORY_') && line.includes(' = '));
    expect(memoryColorLines.length).toBeGreaterThan(0);
    for (const line of memoryColorLines) {
      expect(line).not.toMatch(/warning|danger|signal\.goal|ff405d/i);
    }
  });

  test('keeps only password-recovery entry backed by native browser inputs for mobile and automation', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');

    expect(menuSceneSource).toContain('private authNativeInput: HTMLInputElement | null = null;');
    expect(menuSceneSource).toContain('input.setAttribute(\'data-mazer-auth-input\', fieldId);');
    expect(menuSceneSource).toContain('document.body.appendChild(input);');
    expect(menuSceneSource).toContain('window.setTimeout(() => input.focus({ preventScroll: true }), 0);');
    expect(menuSceneSource).toContain('input.addEventListener(\'input\', this.authNativeInputHandler);');
    expect(menuSceneSource).toContain('input.addEventListener(\'keydown\', this.authNativeKeyDownHandler);');
    expect(menuSceneSource).toContain('this.add.rectangle(');
    expect(menuSceneSource).toContain('const contentRightInset = hasPasswordToggle ? 54 : 16;');
    expect(menuSceneSource).toContain('this.createLegacyAuthPasswordVisibilityButton(');
    expect(menuSceneSource).toContain('const passwordToggleReserve = fieldId === \'password\'');
    expect(menuSceneSource).toContain("this.authPasswordVisible ? 'text' : 'password'");
    expect(menuSceneSource).toContain('ease: MOTION_PHASER_EASE_SINE_IN_OUT');
    expect(menuSceneSource).toContain('this.syncLegacyAuthNativeInputValue();');
    expect(menuSceneSource).toContain('this.destroyLegacyAuthNativeInput();');
    expect(menuSceneSource).toContain('private buildPasswordRecoveryOverlay(');
    expect(menuSceneSource).toContain("'confirmPassword'");
    expect(menuSceneSource).not.toContain('Guest mode is active. Sign in to keep account progress separate.');
  });

  test('owns password recovery as an opaque game-pausing auth state without changing login', () => {
    const authSource = readFileSync(resolve(process.cwd(), 'src/legacy-runtime/legacyAuth.ts'), 'utf8');
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');
    const vercelConfig = JSON.parse(readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8')) as {
      rewrites?: Array<{ destination: string; source: string }>;
    };

    expect(authSource).toContain("export const LEGACY_PASSWORD_RECOVERY_PATH = '/update-password';");
    expect(authSource).toContain('resolveLegacyPasswordRecoveryRedirectUrl(window.location.origin)');
    expect(authSource).toContain('client.auth.updateUser({ password })');
    expect(menuSceneSource).toContain("if (event === 'PASSWORD_RECOVERY') {");
    expect(menuSceneSource).toContain("this.applyLegacyPasswordRecoveryEntry(snapshot, 'BOOTSTRAP_PATH', true);");
    expect(menuSceneSource).toContain("'confirmPassword'");
    expect(menuSceneSource).toContain("input.autocomplete = isPasswordField");
    expect(menuSceneSource).toContain("? (this.isLegacyPasswordRecoveryActive() ? 'new-password' : 'current-password')");
    expect(menuSceneSource).toContain('resolveLegacyPasswordUpdateSubmitState(');
    expect(menuSceneSource).toContain('const recoveryEnterAction = resolveLegacyPasswordRecoveryEnterAction(');
    expect(menuSceneSource).toContain('this.passwordRecoveryUrlState.requested');
    expect(menuSceneSource).toContain("if (recoveryEnterAction === 'focus-confirmation') {");
    expect(menuSceneSource).toContain("this.selectLegacyAuthField('confirmPassword');");
    expect(menuSceneSource).toContain("} else if (recoveryEnterAction === 'submit') {");
    expect(menuSceneSource).toContain('clearLegacyPasswordRecoveryUrl(\'continue\');');
    expect(menuSceneSource).toContain("this.passwordRecoveryState = { error: null, phase: 'success' };");
    expect(vercelConfig.rewrites).toContainEqual({
      destination: '/index.html',
      source: '/update-password'
    });

    const updateStart = menuSceneSource.indexOf('  public update(time: number, delta: number): void {');
    const updateEnd = menuSceneSource.indexOf('  private recordRuntimeFrame(', updateStart);
    const updateSource = menuSceneSource.slice(updateStart, updateEnd);
    expect(updateSource).toContain("if (this.overlay === 'auth') {");
    expect(updateSource.indexOf("if (this.overlay === 'auth') {")).toBeLessThan(
      updateSource.indexOf('this.updateStars(time, delta);')
    );
    expect(menuSceneSource).toContain(
      "this.overlayGraphics.fillStyle(this.overlay === 'auth' ? cyberArcadeMaterial.substrate.field : 0x02040a, this.overlay === 'auth' ? 1 : 0.82);"
    );
    expect(menuSceneSource).not.toContain("this.authForm.mode === 'signup'");
    expect(menuSceneSource).not.toContain('signUpLegacyAuth');
    expect(menuSceneSource).toContain('signInLegacyAuth(this.authForm.email, this.authForm.password)');
  });

  test('keeps full-height overlay content behind one mobile scroll facade and icon-only back control', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');
    const overlayPanelStart = menuSceneSource.indexOf('  private drawOverlayPanel(): void {');
    const overlayPanelEnd = menuSceneSource.indexOf('  private resolveOverlayPanelFrame(', overlayPanelStart);
    const overlayPanelSource = menuSceneSource.slice(overlayPanelStart, overlayPanelEnd);

    expect(overlayPanelStart).toBeGreaterThanOrEqual(0);
    expect(overlayPanelEnd).toBeGreaterThan(overlayPanelStart);
    expect(overlayPanelSource).toContain("this.overlayGraphics.fillStyle(this.overlay === 'auth' ? cyberArcadeMaterial.substrate.field : 0x02040a, this.overlay === 'auth' ? 1 : 0.82);");
    expect(overlayPanelSource).toContain('this.overlayGraphics.fillRect(0, 0, this.layout.width, this.layout.height);');
    expect(overlayPanelSource).not.toContain('drawLegacyCyberPanel');
    expect(menuSceneSource).toContain('resolveLegacyOverlayScrollMetrics');
    expect(menuSceneSource).toContain('private drawLegacyOverlayScrollFacade(metrics: LegacyOverlayScrollMetrics, forceVisible = false): void');
    expect(menuSceneSource).toContain('private createOverlayBackChevronButton(panel: OverlayPanelFrame, onClick: () => void): UiButton');
    // The settings/guide sheets have NO close control at all (Zac, 2026-11-06: no Close pill, X or back arrow):
    // the primary Resume row (pause) / Back to Menu row (menu) is the exit and the Guide keeps its Got it footer.
    // Resume still routes through the Wave 3A bridge first (bridge.dispatch(RESUME_RUN)) and falls back to the same
    // real applyLegacyPauseCommand('resume'); Back to Menu is CLOSE_OVERLAY -> handleBackAction. The chevron stays
    // for the account overlay only (the leaderboard joined the Settings language on 2026-11-06).
    expect(menuSceneSource).not.toContain('createOverlayClosePill');
    expect(menuSceneSource).not.toContain('plan.close');
    expect(normalizeSourceLineEndings(menuSceneSource)).toContain(
      "      case 'RESUME_RUN':\n"
      + '        this.dispatchUiBridgeCommand({ type: \'RESUME_RUN\' }, () => this.applyLegacyPauseCommand(\'resume\'));\n'
    );
    // The leaderboard dropped its chevron on 2026-11-06 (primary Back to Menu row); the account overlay keeps it.
    expect(menuSceneSource).toContain('this.uiButtons.push(this.createOverlayBackChevronButton(panel, () => this.handleBackAction()));');
    expect(menuSceneSource).not.toContain('this.uiButtons.push(this.createOverlayBackChevronButton(panel, () => this.closeOverlay()));');
    expect(normalizeSourceLineEndings(menuSceneSource)).toContain('return resolveLegacyOverlayPanelLayout(\n      this.layout.width,\n      this.layout.height,\n      readMazerViewportGeometry().safeArea\n    );');
    expect(menuSceneSource).not.toContain("if (kind === 'pause' && this.mode === 'play')");
    // Sheets keep full-width rows; the rail sits in the card padding (plan.scrollRailViewport) and only rows
    // that are fully inside the body viewport are painted.
    expect(menuSceneSource).toContain('this.applyLegacySheetScroll(plan.scrollRailViewport, plan.contentHeight, plan.scrollable);');
    expect(menuSceneSource).toContain('isLegacySettingsItemFullyVisible(plan, item, scrollOffset)');
    expect(menuSceneSource).toContain('const parts = item.parts;');
    expect(menuSceneSource).toContain('text.setWordWrapWidth(Math.max(1, width - 16), true);');
    expect(menuSceneSource).toContain('this.drawLegacyOverlayScrollFacade(scrollMetrics);');
    // Pause scrolls only its Settings rows (the card's three actions stay put).
    expect(menuSceneSource).not.toContain('this.drawLegacyOverlayScrollFacade(scrollMetrics, true);');
    expect(menuSceneSource).toContain('this.overlayScrollTrackBounds = metrics.enabled');
    expect(menuSceneSource).toContain('this.overlayScrollThumbBounds = metrics.enabled');
    expect(menuSceneSource).toContain('const thumbAlpha = metrics.enabled ? 0.92 : 0.58;');
    expect(menuSceneSource).toContain('const drawScrollEdgeCue = (y: number, alpha: number): void => {');
    expect(menuSceneSource).toContain('drawScrollEdgeCue(viewport.top + viewport.height - 2, metrics.bottomFadeAlpha);');
    expect(menuSceneSource).not.toContain('graphics.fillRect(viewport.left, viewport.top, viewport.width, fadeHeight);');
    expect(menuSceneSource).not.toContain('viewport.top + viewport.height - fadeHeight');
    expect(menuSceneSource).toContain('this.input.on(\'wheel\'');
    expect(menuSceneSource).toContain('private handleOverlayScrollPointerDown(pointer: Phaser.Input.Pointer): boolean');
    expect(menuSceneSource).toContain('private handleOverlayScrollPointerMove(pointer: Phaser.Input.Pointer): boolean');
    expect(menuSceneSource).toContain('private overlayScrollGestureLockPointerId: number | null = null;');
    expect(menuSceneSource).toContain('private overlayMovementSpeedSliderBounds: VisualRect | null = null;');
    expect(menuSceneSource).toContain('this.overlayScrollGestureLockPointerId = pointerId;');
    expect(menuSceneSource).toContain('|| this.overlayScrollGestureLockPointerId !== null');
    expect(menuSceneSource).toContain('private resolveLegacyRoundedRectRadius(width: number, height: number, requestedRadius?: number): number');
    expect(menuSceneSource).toContain('fillScrollPill(track.left - 3, track.top - 2, track.width + 6, track.height + 4');
    expect(menuSceneSource).toContain('private fitLegacyUiTextToWidth<T extends Phaser.GameObjects.Text>');
    expect(menuSceneSource).toContain('const buttonHorizontalInset = Math.max(10, Math.min(18, Math.round(width * 0.08)));');
    expect(menuSceneSource).not.toContain('drawLegacyPlayTouchLabel');
    expect(menuSceneSource).toContain('labelFontSize: Number.isFinite(Number.parseFloat(String(button.label.style.fontSize)))');
    expect(menuSceneSource).not.toContain('topActionHeight:');
    expect(menuSceneSource).not.toContain("const tightWidth = input.width < 260;");
    expect(menuSceneSource).not.toContain("tightWidth && input.label !== 'Controls'");
    expect(menuSceneSource).not.toMatch(/fillRoundedRect\([^;]*,\s*999\)/);
    expect(menuSceneSource).toContain('overlayUi: {');
    expect(menuSceneSource).not.toContain('createButton(panel.centerX - 78, firstActionY, 132, 54, \'Back\'');
    expect(menuSceneSource).not.toContain('createButton(panel.centerX, panel.top + panel.height - 58, Math.min(180, panel.width - 96), 54, \'Back\'');
  });

  test('AI demo (menu) and human (play) draw the trail through the SAME continuous renderer', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8').replace(/\r\n/g, '\n');
    const start = menuSceneSource.indexOf('  private drawDynamicBoard(time: number): void {');
    const end = menuSceneSource.indexOf('  private resolveLegacyPlayerSpawnBurstState(time: number)');
    const dynamicBoard = menuSceneSource.slice(start, end);
    // Exactly one trail draw call in the dynamic board pass, and it is not gated on the scene mode.
    const calls = dynamicBoard.match(/this\.drawLegacyContinuousPlayTrail\(/g) ?? [];
    expect(calls).toHaveLength(1);
    const callIndex = dynamicBoard.indexOf('this.drawLegacyContinuousPlayTrail(');
    const lineStart = dynamicBoard.lastIndexOf('\n', callIndex) + 1;
    expect(dynamicBoard.slice(lineStart, callIndex).trim()).toBe('');
    const before = dynamicBoard.slice(0, callIndex);
    // The statement sits at the pass's top level: the last block opener before it is already closed.
    expect(before.split('{').length - 1).toBe(before.split('}').length - 1 + 1);
    // No menu-only per-tile trail, tile overlay, border dock or pulse path remains anywhere.
    for (const retired of [
      'drawLegacyPlayerTrailTileOverlay',
      'fillLegacyMenuDynamicPathTile',
      'drawLegacyDynamicTrailBorderDock',
      'drawLegacyPlayDynamicTrailPulse',
      'playerTrailImages'
    ]) {
      expect(menuSceneSource, retired).not.toContain(retired);
    }
    // The AI memory overlay stays a separate layer on top of the shared trail.
    expect(dynamicBoard.indexOf('this.drawLegacyMenuAiMemoryOverlay(')).toBeGreaterThan(callIndex);
  });

  test('keeps menu maze visuals aligned with the cleaned play maze language', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');

    expect(menuSceneSource).toContain('const LEGACY_MENU_PATH_CORE = mixLegacyIridescentColor(cyberArcadeMaterial.path.core, 0x000000, LEGACY_PATH_CORE_EYE_COMFORT_DIM_AMOUNT);');
    expect(menuSceneSource).toContain('const LEGACY_MENU_PATH_EDGE = cyberArcadeMaterial.path.edge;');
    expect(menuSceneSource).toContain('LEGACY_MENU_PATH_EDGE,');
    expect(menuSceneSource).toContain('this.drawLegacyPathMaterialTile(');
    expect(menuSceneSource).not.toContain('this.fillMenuDynamicMarkerTile(this.maze.start');
    expect(menuSceneSource).not.toContain('this.fillMenuDynamicMarkerTile(this.maze.goal');
    expect(menuSceneSource).toContain('const trailColor = resolveLegacyIridescentTrailColor(');
    expect(menuSceneSource).not.toContain('? progressionPalette.trailPulseEdgeColor');
  });

  test('wires the generated Mazer app icon into browser and PWA surfaces', () => {
    const indexSource = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
    const manifest = JSON.parse(readFileSync(resolve(process.cwd(), 'public/manifest.webmanifest'), 'utf8')) as {
      icons: Array<{ src: string; sizes: string; purpose?: string; type: string }>;
    };

    expect(indexSource).toContain('<link rel="icon" href="/favicon.ico?v=mazer-site-icon-v1" sizes="any" />');
    expect(indexSource).toContain('<link rel="icon" href="/icons/icon-192.png?v=mazer-site-icon-v1" sizes="192x192" type="image/png" />');
    expect(indexSource).toContain('<link rel="icon" href="/icons/icon-512.png?v=mazer-site-icon-v1" sizes="512x512" type="image/png" />');
    expect(indexSource).toContain('<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png?v=mazer-site-icon-v1" />');
    expect(indexSource).not.toContain('href="/icons/mazer-emblem.svg"');
    expect(readFileSync(resolve(process.cwd(), 'scripts/windows/Prepare-MazerShortcut.ps1'), 'utf8')).toContain(
      "public\\icons\\mazer-app-icon.ico"
    );
    expect(readFileSync(resolve(process.cwd(), 'docs/mobile-plan.md'), 'utf8')).toContain(
      'src/brand/source-art/mazer-app-icon-master.png'
    );
    expect(readPngDimensions('public/icons/mazer-app-icon.png')).toEqual({ width: 1024, height: 1024 });
    expect(readPngDimensions('public/icons/icon-512.png')).toEqual({ width: 512, height: 512 });
    expect(readPngDimensions('public/icons/icon-512-maskable.png')).toEqual({ width: 512, height: 512 });
    expect(readPngDimensions('public/icons/icon-192.png')).toEqual({ width: 192, height: 192 });
    expect(readPngDimensions('public/icons/icon-192-maskable.png')).toEqual({ width: 192, height: 192 });
    expect(readPngDimensions('public/icons/apple-touch-icon.png')).toEqual({ width: 180, height: 180 });
    expect(readFileSync(resolve(process.cwd(), 'public/icons/mazer-app-icon.ico')).byteLength).toBeGreaterThan(5_000);
    expect(manifest.icons.map((icon) => icon.src)).toEqual([
      '/icons/icon-192.png?v=mazer-site-icon-v1',
      '/icons/icon-512.png?v=mazer-site-icon-v1',
      '/icons/icon-192-maskable.png?v=mazer-site-icon-v1',
      '/icons/icon-512-maskable.png?v=mazer-site-icon-v1',
      '/icons/mazer-app-icon.png?v=mazer-site-icon-v1'
    ]);
    expect(manifest.icons.filter((icon) => icon.purpose === 'maskable')).toHaveLength(2);
  });
});

// Chip wiring (Navigation Core v2 amendment, owner pick B "Chip", 2026-11-06). The v1 end-star describes
// that used to live here pinned the rainbow-ring star (drawLegacyGoalStarMarker) and the radial-gradient goal
// halo canvas (drawGoalHaloCanvas). Both draw functions and the halo canvas were removed: start and goal are
// the Chip marker draw code (drawBoardMarkers in src/render/boardTileBake.ts) painted into the scene's
// dynamic graphics through the Phaser adapter. These pin the new wiring at the source level, the file's
// convention for Scene internals; marker geometry, contrast and one-cell footprint are unit-tested in
// tests/render/boardTileBake.test.ts and tests/render/boardTileStyle.test.ts.
describe('Chip wiring: start/goal markers, trail underlay, board layer', () => {
  const menuSceneSource = normalizeSourceLineEndings(
    readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8')
  );

  test('the old end-star, endpoint glow and goal-halo canvas are gone', () => {
    for (const removed of [
      'drawLegacyGoalStarMarker',
      'drawLegacyEndpointGlow',
      'drawGoalHaloCanvas',
      'goalHaloCanvas',
      'LEGACY_PLAY_GOAL_MARKER_HALO',
      'LEGACY_PLAY_START_MARKER_PRE_SPAWN',
      'orbitAngle'
    ]) {
      expect(menuSceneSource, removed).not.toContain(removed);
    }
  });

  test('start and goal are drawn by drawBoardMarkers through the Phaser adapter, with the layer-snapped origin and the reduced-motion gate', () => {
    const fnStart = menuSceneSource.indexOf('private fillPlayDynamicMarkerTile(');
    expect(fnStart).toBeGreaterThan(-1);
    const body = menuSceneSource.slice(fnStart, menuSceneSource.indexOf('\n  }\n', fnStart));
    expect(body).toContain('new PhaserGraphicsTileContext(this.boardDynamicGraphics)');
    expect(body).toContain('drawBoardMarkers(context, markerInput);');
    expect(body).toContain('this.boardTileLayer.snappedOrigin');
    expect(body).toContain('reducedMotion: this.prefersLegacyReducedMotion()');
    expect(body).toContain("start: kind === 'start' ? point : undefined");
    expect(body).toContain("goal: kind === 'goal' ? point : undefined");
    // the start marker yields to the player standing on it
    expect(body).toContain('shouldDrawEndpointMarker(kind, this.player.x === point.x && this.player.y === point.y)');
  });

  test('the board style flag defaults to Chip and reads ?tileStyle= through the shared resolver', () => {
    expect(menuSceneSource).toContain("private boardTileStyle: BoardTileStyleId = 'chip';");
    expect(menuSceneSource).toContain('this.boardTileStyle = resolveBoardTileStyleFromSearch(');
  });

  test('the baked layer sits right after the path-graphics z-order anchor and its texture is removed on shutdown', () => {
    expect(menuSceneSource).toContain('      this.boardPathGraphics,\n      this.boardTileLayer.image,\n');
    expect(menuSceneSource).toContain('`legacy-board-tile-layer-${nextMenuSceneInstanceId()}`');
    expect(menuSceneSource).toContain('this.textures.remove(this.boardTileLayerTextureKey);');
    // the floor texture sprite, its mask and the pooled bleed images are retired
    expect(menuSceneSource).not.toContain('boardFloorTileSprite');
    expect(menuSceneSource).not.toContain('boardFloorMaskGraphics');
    expect(menuSceneSource).not.toContain('boardBleedPathImages');
  });

  test('the trail sits on a dark underlay on the Chip floor (amendment open item A8), drawn by the same trail compositor', () => {
    expect(menuSceneSource).toContain("if (this.boardTileStyle === 'chip') {");
    expect(menuSceneSource).toContain('drawTrailLayersToCanvasContext(this.trailCanvasTexture.context, segments, {');
    expect(menuSceneSource).toContain('underlayAlpha: LEGACY_TRAIL_UNDERLAY_ALPHA');
    expect(menuSceneSource).toContain('underlayWidth,');
  });

  test('wordmark cells (title, Start/Login, level numeral) are chip cells from the board geometry, with no black border stroke', () => {
    const fnStart = menuSceneSource.indexOf('private drawLegacyGlyphWordTileBlock(');
    const body = menuSceneSource.slice(fnStart, menuSceneSource.indexOf('\n  }\n', fnStart));
    expect(body).toContain('resolveChipGridGeometry({');
    expect(body).toContain('drawChipCell(');
    expect(body).not.toContain('drawLegacyPathMaterialTile');
    expect(body).not.toContain('strokeRect');
  });
});

// Exercise the actual update body without a renderer, Auth client or database.
// Parsing the method keeps this regression sensitive to control-flow changes,
// rather than asserting a copy of the new guard or a source-text substring.
const sceneSource = ts.createSourceFile(
  'MenuScene.ts',
  readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8'),
  ts.ScriptTarget.Latest,
  true
);
const sceneClass = sceneSource.statements.find(
  (node): node is ts.ClassDeclaration => ts.isClassDeclaration(node) && node.name?.text === 'MenuScene'
);
const updateMethod = sceneClass?.members.find(
  (node): node is ts.MethodDeclaration => ts.isMethodDeclaration(node)
    && ts.isIdentifier(node.name)
    && node.name.text === 'update'
);
if (!updateMethod?.body) {
  throw new Error('MenuScene.update must exist for the startup regression.');
}
const compiledUpdate = ts.transpileModule(
  `function update(time: number, delta: number): void ${updateMethod.body.getText(sceneSource)}`,
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } }
).outputText;
const runUpdate = new Function(`${compiledUpdate}; return update;`)() as (
  this: Record<string, unknown>, time: number, delta: number
) => void;

const createFrameHarness = (overrides: Record<string, unknown> = {}) => {
  const scene: Record<string, unknown> = {
    mode: 'menu', overlay: 'none', pendingAuthGateTransition: false,
    authGateAwaitingResolution: false, authGateLocked: false,
    pendingBootPlayStart: false, pendingGenerationRequest: null,
    pendingResetRequest: null, uiButtons: [],
    menuStaticDrawLifecyclePhase: 'settled', levelAnnouncerWasVisible: false,
    playerSpawnBurstWasActiveForRedraw: false, backdropDirty: false,
    boardStaticDirty: false, boardPathDirty: false, boardDynamicDirty: false,
    hudDirty: false, uiDirty: false,
    levelAnnouncerLabelText: { setVisible: vi.fn() },
    levelAnnouncerNumberGraphics: { setVisible: vi.fn() },
    levelAnnouncerNumberGlyphPool: [],
    prefersLegacyReducedMotion: () => true,
    resolveLegacyLevelAnnouncerVisualState: () => ({ alpha: 0 }),
    resolveLegacyPlayerSpawnBurstState: () => ({ active: false }),
    resolveLegacyPlayerTransferState: () => ({ active: false }),
    playerLocatorState: { needsRedraw: () => false },
    ...overrides
  };
  const noops = [
    'syncLegacyAuthGateLoadingScreen', 'syncLegacyAuthOpeningTimeout', 'recordRuntimeFrame',
    'expireLegacyPlayerMessages', 'drawLegacyPlayerMessageToast', 'updateStars', 'advanceLegacyOverlayScrollMomentum',
    'holdLegacyPlayMazeLifecycleDuringPause', 'updateLegacyFlowFeedback', 'advanceLegacyMenuStaticDrawStage',
    'isLegacyMenuBuildPrerollActive', 'hasLegacyPlayTrailPulsePendingFrame',
    'hasLegacyBleedOffGlowPendingFrame', 'hasGoalStarSpinPendingFrame', 'hasLegacyPlayerVisualMotionPendingFrame', 'updateLegacyPlayerLocator',
    'settleLegacyPlayerTransferEnergy', 'isLegacyMenuHandoffAnimationActive',
    'hasLegacyMenuTitleAnimationPendingFrame', 'drawBackdrop', 'drawStaticBoard',
    'drawBoardPaths', 'drawDynamicBoard', 'drawHud', 'rebuildUi',
    'publishVisualDiagnostics', 'publishRuntimeDiagnostics', 'tickLegacyPresence'
  ];
  for (const name of noops) scene[name] = vi.fn();
  const demo = vi.fn();
  const startPlay = vi.fn(() => { scene.mode = 'play'; });
  scene.updateMenuDemo = demo;
  scene.startPlayMode = startPlay;
  return { scene, demo, startPlay, tick: (time = 1000) => runUpdate.call(scene, time, 16) };
};

describe('menu demo authentication boundary', () => {
  test.each([
    ['ordinary startup', { authGateAwaitingResolution: true }],
    ['direct-to-play startup', { authGateAwaitingResolution: true, pendingBootPlayStart: true }],
    ['locked account before overlay transition', { authGateLocked: true }],
    ['locked direct-to-play', { authGateLocked: true, pendingBootPlayStart: true }]
  ])('does not advance the demo during %s', (_label, overrides) => {
    const frame = createFrameHarness(overrides);
    frame.tick();
    expect(frame.demo).not.toHaveBeenCalled();
    expect(frame.startPlay).not.toHaveBeenCalled();
  });

  test.each(['none', 'options'])('preserves ambient demo after access resolves with overlay %s', (overlay) => {
    const frame = createFrameHarness({ overlay });
    frame.tick();
    expect(frame.demo).toHaveBeenCalledExactlyOnceWith(1000);
  });

  test('starts pending play on the resolution frame before any demo advancement', () => {
    const frame = createFrameHarness({ pendingBootPlayStart: true });
    frame.tick();
    expect(frame.startPlay).toHaveBeenCalledTimes(1);
    expect(frame.scene.pendingBootPlayStart).toBe(false);
    expect(frame.scene.mode).toBe('play');
    expect(frame.demo).not.toHaveBeenCalled();
  });

  test('keeps a slow real-auth startup inert across frames, then enters play once', () => {
    const frame = createFrameHarness({ authGateAwaitingResolution: true, pendingBootPlayStart: true });
    for (let second = 0; second < 120; second += 1) frame.tick(second * 1000);
    expect(frame.demo).not.toHaveBeenCalled();
    expect(frame.startPlay).not.toHaveBeenCalled();
    frame.scene.authGateAwaitingResolution = false;
    frame.tick(120000);
    frame.tick(121000);
    expect(frame.startPlay).toHaveBeenCalledTimes(1);
    expect(frame.demo).not.toHaveBeenCalled();
  });

  test('does not start an ambient demo during idle play or the auth overlay', () => {
    for (const overrides of [{ mode: 'play' }, { overlay: 'auth', authGateLocked: true }]) {
      const frame = createFrameHarness(overrides);
      frame.tick();
      expect(frame.demo).not.toHaveBeenCalled();
    }
  });
});
