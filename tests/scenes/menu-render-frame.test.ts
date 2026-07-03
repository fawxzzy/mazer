import { describe, expect, test } from 'vitest';
import {
  resolveLegacyDynamicMarkerInset,
  resolveLegacyDynamicTrailStrokeWidth,
  resolveLegacyMenuPathRenderFrame,
  resolveLegacyMenuPathRenderFrames,
  resolveLegacyMenuPathRenderSegments,
  resolveLegacyPlayerMarkerRenderMetrics
} from '../../src/legacy-runtime/legacyMenuRender';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('resolveLegacyMenuPathRenderFrame', () => {
  test('bridges connected neighbors to tile edges for legacy trench continuity', () => {
    const maze = {
      size: 3,
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
      size: 3,
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

  test('bridges the light core across connected neighbors for a less checkerboarded slab read', () => {
    const maze = {
      size: 3,
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
      size: 3,
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
      size: 3,
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

  test('keeps tiny live-browser tiles dense instead of hairline thin', () => {
    const maze = {
      size: 3,
      grid: [
        [false, true, false],
        [true, true, true],
        [false, true, false]
      ]
    };

    const segments = resolveLegacyMenuPathRenderSegments(maze, { x: 1, y: 1 }, 6);

    expect(segments.edge[0]).toEqual({ leftInset: 0, topInset: 0, width: 6, height: 6 });
    expect(segments.core[0]).toEqual({ leftInset: 0, topInset: 0, width: 6, height: 6 });
  });

  test('keeps the menu board in the clean 2d maze-material lane', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');
    const legacyMenuRenderSource = readFileSync(resolve(process.cwd(), 'src/legacy-runtime/legacyMenuRender.ts'), 'utf8');

    expect(menuSceneSource).toContain('const LEGACY_BOARD_GRID_ALPHA = 0;');
    expect(menuSceneSource).toContain('const LEGACY_MENU_PANEL_SHADOW_ALPHA = 0;');
    expect(menuSceneSource).toContain('const LEGACY_MENU_PATH_CORE = 0xd8e3dc;');
    expect(menuSceneSource).toContain('const LEGACY_MENU_PATH_EDGE = 0x253448;');
    expect(menuSceneSource).toContain('const LEGACY_MENU_PATH_EDGE_ALPHA = 0.86;');
    expect(menuSceneSource).not.toContain('LEGACY_MENU_PATH_RELIEF_SHADOW');
    expect(menuSceneSource).not.toContain('LEGACY_MENU_PATH_RELIEF_OFFSET_RATIO');
    expect(menuSceneSource).toContain('const LEGACY_MENU_WALL_FILL = 0x121c29;');
    expect(menuSceneSource).toContain('if (isMenuMode && LEGACY_BOARD_GRID_ALPHA > 0) {');
    expect(menuSceneSource).toContain('Keep the board top-down: no pseudo bevel/highlight pass over the maze.');
    expect(menuSceneSource).toContain('? 0x0d1520');
    expect(legacyMenuRenderSource).toContain('const LEGACY_MENU_TRENCH_EDGE_INSET_RATIO = 0.14;');
    expect(legacyMenuRenderSource).toContain('const LEGACY_MENU_TRENCH_CORE_INSET_RATIO = 0.04;');
    expect(legacyMenuRenderSource).toContain('const resolveLegacyMenuTrenchInset = (tileSize: number, ratio: number): number => {');
    expect(menuSceneSource).toContain('resolveLegacyMenuPathRenderSegments(this.maze, { x, y }, tileSize);');
    expect(menuSceneSource).toContain('resolveLegacyMenuPathRenderFrames(this.maze, { x, y }, tileSize);');
    expect(menuSceneSource).toContain('isMenuMode ? pathGlow : LEGACY_PLAY_PATH_EDGE');
    expect(menuSceneSource).toContain('tileX + frames.core.leftInset');
    expect(legacyMenuRenderSource).toContain('resolveLegacyMenuPathStrokeSegments');
    expect(menuSceneSource).toContain('Keep wall cells flat: the generated topology should read cleanly without fake bevel/depth.');
  });

  test('keeps active play maze rendering on connected corridors instead of square debug cells', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');

    expect(menuSceneSource).toContain('const LEGACY_PLAY_PATH_EDGE = 0x203244;');
    expect(menuSceneSource).toContain('const LEGACY_PLAY_PATH_EDGE_ALPHA = 0.64;');
    expect(menuSceneSource).not.toContain('LEGACY_PLAY_PATH_RELIEF_SHADOW');
    expect(menuSceneSource).toContain('isMenuMode ? pathGlow : LEGACY_PLAY_PATH_EDGE');
    expect(menuSceneSource).toContain('this.boardStaticGraphics.fillStyle(pathColor, isMenuMode ? 0.92 : 0.96);');
    expect(menuSceneSource).not.toContain('this.boardStaticGraphics.fillStyle(walkable ? pathGlow : wallColor');
  });

  test('keeps active play HUD in a source-shaped timer and arrow widget lane', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');

    expect(menuSceneSource).toContain('const LEGACY_PLAY_HUD_TIMER_PANE_ALPHA = 0.18;');
    expect(menuSceneSource).toContain('const LEGACY_PLAY_HUD_TIMER_TEXT =');
    expect(menuSceneSource).toContain('const LEGACY_PLAY_HUD_TIMER_SHADOW =');
    expect(menuSceneSource).toContain('const LEGACY_PLAY_HUD_ARROW = 0xe4efe6;');
    expect(menuSceneSource).toContain('const LEGACY_PLAY_HUD_ARROW_SHADOW = 0x06080a;');
    expect(menuSceneSource).toContain('const timerShadow = this.add.text(23, 17, hudFrame.timerText');
    expect(menuSceneSource).toContain('timerShadow.setAlpha(0.64);');
    expect(menuSceneSource).toContain('this.hudGraphics.fillTriangle(');
    expect(menuSceneSource).not.toContain('this.hudGraphics.strokeRect(');
  });

  test('keeps menu dynamic trail overlays in the legacy corridor frame instead of full square cells', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');

    expect(menuSceneSource).toContain('const LEGACY_MENU_DYNAMIC_TRAIL_EDGE = 0x0a6f82;');
    expect(menuSceneSource).toContain('const LEGACY_MENU_DYNAMIC_MARKER_INSET_RATIO = 0.22;');
    expect(menuSceneSource).toContain('const LEGACY_MENU_DYNAMIC_TRAIL_CORE_RATIO = 0.3;');
    expect(menuSceneSource).toContain('const LEGACY_MENU_DYNAMIC_TRAIL_EDGE_RATIO = 0.54;');
    expect(menuSceneSource).toContain('const LEGACY_PLAYER_MARKER_HALO = 0xffd45a;');
    expect(menuSceneSource).toContain('const LEGACY_PLAYER_MARKER_CORE = 0xf8fbff;');
    expect(menuSceneSource).toContain('const dynamicTrailKeys = new Set(trail.map((point) => `${point.x},${point.y}`));');
    expect(menuSceneSource).toContain('this.fillLegacyMenuDynamicPathTile(');
    expect(menuSceneSource).toContain('const connectedLeft = trailKeys.has(`${point.x - 1},${point.y}`);');
    expect(menuSceneSource).toContain('this.fillLegacyPlayerMarkerTile(this.player');
    expect(menuSceneSource).toContain('const centerX = originX + ((point.x + 0.5) * tileSize);');
    expect(menuSceneSource).toContain('resolveLegacyPlayerMarkerRenderMetrics(');
    expect(menuSceneSource).toContain('this.boardDynamicGraphics.fillCircle(centerX, centerY, playerMetrics.coreRadius);');
  });

  test('keeps active play dynamic overlays in the corridor frame instead of square cells', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');

    expect(menuSceneSource).toContain('const LEGACY_PLAY_DYNAMIC_TRAIL_EDGE = 0x0a2b3c;');
    expect(menuSceneSource).toContain('const LEGACY_PLAY_DYNAMIC_MARKER_INSET_RATIO = 0.22;');
    expect(menuSceneSource).toContain('const LEGACY_PLAY_DYNAMIC_TRAIL_CORE_RATIO = 0.34;');
    expect(menuSceneSource).toContain('const LEGACY_PLAY_DYNAMIC_TRAIL_EDGE_RATIO = 0.62;');
    expect(menuSceneSource).toContain('this.fillLegacyPlayDynamicPathTile(');
    expect(menuSceneSource).toContain('this.fillLegacyPlayerMarkerTile(this.player');
    expect(menuSceneSource).toContain('const playerScreenX = this.layout.boardLeft + boardOffset.x + ((this.player.x + 0.5) * this.layout.tileSize);');
    expect(menuSceneSource).toContain('const goalScreenX = this.layout.boardLeft + boardOffset.x + ((this.maze.goal.x + 0.5) * this.layout.tileSize);');
    expect(menuSceneSource).not.toContain('this.fillTile(this.boardDynamicGraphics, point, trailColor, boardLeft + boardOffset.x, boardTop + boardOffset.y, tileSize, trailAlpha, 1);');
    expect(menuSceneSource).not.toContain('this.fillTile(this.boardDynamicGraphics, this.player, 0xf2f4f8, boardLeft + boardOffset.x, boardTop + boardOffset.y, tileSize, 1, 0);');
  });

  test('clamps dynamic overlays for ultra-narrow mobile tiles without oversized player blobs', () => {
    expect(resolveLegacyDynamicTrailStrokeWidth(3.265, 0.62, 3)).toBe(2);
    expect(resolveLegacyDynamicTrailStrokeWidth(3.265, 0.34, 2)).toBe(1);
    expect(resolveLegacyDynamicMarkerInset(3.265, 0.22)).toBe(1);
    expect(resolveLegacyPlayerMarkerRenderMetrics(3.265, 0.34, 0.54)).toEqual({
      coreRadius: 1,
      haloRadius: 2,
      strokeWidth: 1
    });
  });

  test('keeps larger desktop tiles visibly weighted after responsive overlay sizing', () => {
    expect(resolveLegacyDynamicTrailStrokeWidth(18, 0.62, 3)).toBe(11);
    expect(resolveLegacyDynamicTrailStrokeWidth(18, 0.34, 2)).toBe(6);
    expect(resolveLegacyDynamicMarkerInset(18, 0.22)).toBe(3);
    expect(resolveLegacyPlayerMarkerRenderMetrics(18, 0.34, 0.54)).toEqual({
      coreRadius: 6,
      haloRadius: 10,
      strokeWidth: 2
    });
  });

  test('keeps mobile active-play swipes bound to one pointer identity', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');

    expect(menuSceneSource).toContain('type LegacyPlayPointerStart');
    expect(menuSceneSource).toContain('private playPointerStart: LegacyPlayPointerStart | null = null;');
    expect(menuSceneSource).toContain("this.input.on('pointerupoutside', (pointer: Phaser.Input.Pointer) => {");
    expect(menuSceneSource).toContain("this.input.on('gameout', () => {");
    expect(menuSceneSource).toContain('this.playPointerStart = createLegacyPlayPointerStart(pointer);');
    expect(menuSceneSource).toContain('this.playPointerStart !== null && !isSameLegacyPlayPointer(this.playPointerStart, pointer)');
    expect(menuSceneSource).toContain('if (!isSameLegacyPlayPointer(this.playPointerStart, pointer)) {');
  });

  test('routes shared mobile touch controls into play pause, reset, and trail toggles', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');

    expect(menuSceneSource).toContain('resolveTouchControlKindAtPoint');
    expect(menuSceneSource).toContain('resolveTouchControlLayout');
    expect(menuSceneSource).toContain('private resolveLegacyPlayTouchControlLayout()');
    expect(menuSceneSource).toContain('private handleLegacyPlayTouchControl');
    expect(menuSceneSource).toContain('private drawLegacyPlayTouchControls()');
    expect(menuSceneSource).toContain('this.hudTouchControlBounds = this.drawLegacyPlayTouchControls();');
    expect(menuSceneSource).toContain('this.hudBounds = mergeVisualRects(this.hudTimerBounds, this.hudArrowBounds);');
    expect(menuSceneSource).toContain('touchControls');
    expect(menuSceneSource).toContain('LEGACY_PLAY_TOUCH_FRAME_FILL');
    expect(menuSceneSource).toContain('installLegacyPlayTouchControlFallback');
    expect(menuSceneSource).toContain("event.pointerType === 'touch'");
    expect(menuSceneSource).toContain('event.stopImmediatePropagation()');
    expect(menuSceneSource).toContain("case 'pause':");
    expect(menuSceneSource).toContain("this.applyLegacyPauseCommand('reset-player');");
    expect(menuSceneSource).toContain("this.applyLegacyOverlayToggleField('toggleTrailFade');");
  });

  test('keeps camera-follow static and dynamic board layers on the same offset', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');
    const toggleFieldSource = readFileSync(resolve(process.cwd(), 'src/legacy-runtime/legacyOverlayToggleFields.ts'), 'utf8');

    expect(menuSceneSource).toContain('const { boardLeft: layoutBoardLeft, boardTop: layoutBoardTop, boardSize, tileSize } = this.layout;');
    expect(menuSceneSource).toContain('const boardOffset = this.resolveBoardOffset();');
    expect(menuSceneSource).toContain('const boardLeft = layoutBoardLeft + boardOffset.x;');
    expect(menuSceneSource).toContain('const boardTop = layoutBoardTop + boardOffset.y;');
    expect(menuSceneSource).toContain('this.layout.boardLeft + boardOffset.x');
    expect(menuSceneSource).toContain('this.layout.boardTop + boardOffset.y');
    expect(menuSceneSource).toContain('if (this.settings.toggleCameraFollow) {');
    expect(menuSceneSource).toContain('this.boardStaticDirty = true;');
    expect(toggleFieldSource).toContain('affectsBoardStatic: true');
  });

  test('publishes visual diagnostics to a maintained-browser DOM fallback', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');

    expect(menuSceneSource).toContain("export const MENU_SCENE_VISUAL_DIAGNOSTICS_ATTRIBUTE = 'data-mazer-visual-diagnostics' as const;");
    expect(menuSceneSource).toContain('const diagnostics: MenuSceneVisualDiagnostics = {');
    expect(menuSceneSource).toContain('window[MENU_SCENE_VISUAL_DIAGNOSTICS_KEY] = diagnostics;');
    expect(menuSceneSource).toContain('MENU_SCENE_VISUAL_DIAGNOSTICS_ATTRIBUTE,');
    expect(menuSceneSource).toContain('JSON.stringify(diagnostics)');
    expect(menuSceneSource).toContain('removeAttribute(MENU_SCENE_VISUAL_DIAGNOSTICS_ATTRIBUTE)');
  });

  test('keeps front-door buttons in the legacy dark-pane chrome path', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');

    expect(menuSceneSource).toContain('const fillColor = frontDoorChrome?.fillColor ?? 0xffffff;');
    expect(menuSceneSource).toContain('this.add.rectangle(x, y, width, height, fillColor, baseAlpha);');
    expect(menuSceneSource).toContain('? (frontDoorChrome?.hoverFillColor ?? 0xffffff)');
  });
});
