import { describe, expect, test } from 'vitest';
import {
  resolveLegacyDynamicMarkerInset,
  resolveLegacyDynamicTrailStrokeWidth,
  resolveLegacyEndpointMarkerRenderMetrics,
  resolveLegacyMenuPathRenderFrame,
  resolveLegacyMenuPathRenderFrames,
  resolveLegacyMenuPathRenderSegments,
  resolveLegacyPlayerLocatorRenderMetrics,
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
      topInset: 3,
      width: 20,
      height: 14
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
      leftInset: 3,
      topInset: 3,
      width: 14,
      height: 17
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
        topInset: 3,
        width: 20,
        height: 14
      },
      core: {
        leftInset: 0,
        topInset: 4,
        width: 20,
        height: 12
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
      { leftInset: 3, topInset: 3, width: 14, height: 14 },
      { leftInset: 0, topInset: 3, width: 17, height: 14 },
      { leftInset: 3, topInset: 3, width: 17, height: 14 },
      { leftInset: 3, topInset: 0, width: 14, height: 17 },
      { leftInset: 3, topInset: 3, width: 14, height: 17 }
    ]);
    expect(segments.core).toEqual([
      { leftInset: 4, topInset: 4, width: 12, height: 12 },
      { leftInset: 0, topInset: 4, width: 16, height: 12 },
      { leftInset: 4, topInset: 4, width: 16, height: 12 },
      { leftInset: 4, topInset: 0, width: 12, height: 16 },
      { leftInset: 4, topInset: 4, width: 12, height: 16 }
    ]);
  });

  test('keeps phone-sized tiles separated instead of merging adjacent cells into blocks', () => {
    const maze = {
      size: 3,
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

  test('keeps the menu board in the clean 2d maze-material lane', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');
    const legacyMenuRenderSource = readFileSync(resolve(process.cwd(), 'src/legacy-runtime/legacyMenuRender.ts'), 'utf8');

    expect(menuSceneSource).toContain('const LEGACY_BOARD_GRID_ALPHA = 0;');
    expect(menuSceneSource).toContain('const LEGACY_MENU_PANEL_SHADOW_ALPHA = 0;');
    expect(menuSceneSource).toContain('const LEGACY_MENU_PATH_CORE = 0xe6f2eb;');
    expect(menuSceneSource).toContain('const LEGACY_MENU_PATH_EDGE = 0x304158;');
    expect(menuSceneSource).toContain('const LEGACY_MENU_PATH_EDGE_ALPHA = 0.9;');
    expect(menuSceneSource).not.toContain('LEGACY_MENU_PATH_RELIEF_SHADOW');
    expect(menuSceneSource).not.toContain('LEGACY_MENU_PATH_RELIEF_OFFSET_RATIO');
    expect(menuSceneSource).toContain('const LEGACY_MENU_WALL_FILL = 0x0d1724;');
    expect(menuSceneSource).toContain('const LEGACY_MENU_WALL_GLASS_ALPHA = 0.58;');
    expect(menuSceneSource).toContain('const LEGACY_MENU_BOARD_GLASS_ALPHA = 0.18;');
    expect(menuSceneSource).toContain('const LEGACY_BOARD_SIGIL_BORDER_PRIMARY = 0x72e0bf;');
    expect(menuSceneSource).toContain('const LEGACY_BOARD_SIGIL_BORDER_SECONDARY = 0xb7f2ff;');
    expect(menuSceneSource).toContain('const LEGACY_BOARD_SIGIL_BACKGROUND_ALPHA = 0.12;');
    expect(menuSceneSource).toContain('if (isMenuMode && LEGACY_BOARD_GRID_ALPHA > 0) {');
    expect(menuSceneSource).toContain('Keep the board top-down: no pseudo bevel/highlight pass over the maze.');
    expect(menuSceneSource).toContain('? 0x0d1520');
    expect(legacyMenuRenderSource).toContain('const LEGACY_MENU_TRENCH_EDGE_INSET_RATIO = 0.18;');
    expect(legacyMenuRenderSource).toContain('const LEGACY_MENU_TRENCH_CORE_INSET_RATIO = 0.08;');
    expect(legacyMenuRenderSource).toContain('const resolveLegacyMenuTrenchInset = (tileSize: number, ratio: number): number => {');
    expect(menuSceneSource).toContain('resolveLegacyMenuPathRenderSegments(this.maze, { x, y }, tileSize);');
    expect(menuSceneSource).toContain('resolveLegacyMenuPathRenderFrames(this.maze, { x, y }, tileSize);');
    expect(menuSceneSource).toContain('isMenuMode ? pathGlow : LEGACY_PLAY_PATH_EDGE');
    expect(menuSceneSource).toContain('tileX + frames.core.leftInset');
    expect(menuSceneSource).toContain('isMenuMode ? LEGACY_MENU_BOARD_GLASS_ALPHA : LEGACY_PLAY_BOARD_GLASS_ALPHA');
    expect(menuSceneSource).toContain('isMenuMode ? LEGACY_MENU_WALL_GLASS_ALPHA : LEGACY_PLAY_WALL_GLASS_ALPHA');
    expect(menuSceneSource).toContain('this.drawLegacyBoardSigilBorder(boardLeft, boardTop, boardSize);');
    expect(menuSceneSource).toContain('private drawLegacyBoardSigilBorder(boardLeft: number, boardTop: number, boardSize: number): void');
    expect(menuSceneSource).toContain('private drawLegacyBackdropSigils(width: number, height: number, time: number): void');
    expect(legacyMenuRenderSource).toContain('resolveLegacyMenuPathStrokeSegments');
    expect(menuSceneSource).toContain('Keep wall cells flat and glassy so the backdrop shows through without fake bevel/depth.');
  });

  test('reflects the gothic cyber border motif into the backdrop layer', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');
    const backdropSource = readFileSync(resolve(process.cwd(), 'src/legacy-runtime/legacyMenuBackdrop.ts'), 'utf8');

    expect(backdropSource).toContain('fieldColor: 0x090d19');
    expect(backdropSource).toContain('fieldColor: 0x10172c');
    expect(menuSceneSource).toContain('this.drawLegacyBackdropSigils(width, height, this.time.now);');
    expect(menuSceneSource).toContain('0.7 + (Math.sin(time / 1800) * 0.3)');
    expect(menuSceneSource).toContain('sigils: 4');
  });

  test('keeps active play maze rendering on connected corridors instead of square debug cells', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');

    expect(menuSceneSource).toContain('const LEGACY_PLAY_PATH_CORE = 0xe7fff4;');
    expect(menuSceneSource).toContain('const LEGACY_PLAY_PATH_EDGE = 0x0d3c4f;');
    expect(menuSceneSource).toContain('const LEGACY_PLAY_PATH_EDGE_ALPHA = 0.9;');
    expect(menuSceneSource).toContain('const LEGACY_PLAY_WALL_FILL = 0x07111d;');
    expect(menuSceneSource).toContain('const LEGACY_PLAY_WALL_GLASS_ALPHA = 0.58;');
    expect(menuSceneSource).toContain('const LEGACY_PLAY_BOARD_GLASS_ALPHA = 0.18;');
    expect(menuSceneSource).toContain('const LEGACY_PLAY_BOARD_FILL = 0x08111d;');
    expect(menuSceneSource).toContain('const LEGACY_PLAY_BOARD_EDGE = 0x031022;');
    expect(menuSceneSource).not.toContain('LEGACY_PLAY_PATH_RELIEF_SHADOW');
    expect(menuSceneSource).toContain('isMenuMode ? pathGlow : LEGACY_PLAY_PATH_EDGE');
    expect(menuSceneSource).toContain('this.boardStaticGraphics.fillStyle(pathColor, isMenuMode ? 0.92 : 0.96);');
    expect(menuSceneSource).toContain(': LEGACY_PLAY_PATH_CORE;');
    expect(menuSceneSource).toContain(': LEGACY_PLAY_WALL_FILL;');
    expect(menuSceneSource).toContain(': LEGACY_PLAY_BOARD_FILL;');
    expect(menuSceneSource).toContain('const boardEdge = isMenuMode ? 0x050a10 : LEGACY_PLAY_BOARD_EDGE;');
    expect(menuSceneSource).not.toContain('this.boardStaticGraphics.fillStyle(walkable ? pathGlow : wallColor');
  });

  test('keeps active play HUD in a source-shaped timer and arrow widget lane', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');

    expect(menuSceneSource).toContain('const LEGACY_PLAY_HUD_TIMER_PANE_ALPHA = 0.68;');
    expect(menuSceneSource).toContain('const LEGACY_PLAY_HUD_TIMER_TEXT =');
    expect(menuSceneSource).toContain('const LEGACY_PLAY_HUD_TIMER_SHADOW =');
    expect(menuSceneSource).toContain('const LEGACY_CYBER_PANEL_STROKE = 0x72e0bf;');
    expect(menuSceneSource).toContain('const LEGACY_PLAY_HUD_ARROW = 0xff263f;');
    expect(menuSceneSource).toContain('const LEGACY_PLAY_HUD_ARROW_TAIL = 0xecfff5;');
    expect(menuSceneSource).toContain('const LEGACY_PLAY_HUD_ARROW_SHADOW = 0x06080a;');
    expect(menuSceneSource).toContain('this.drawLegacyCyberPanel(this.hudGraphics, {');
    expect(menuSceneSource).toContain("fontSize: '23px',");
    expect(menuSceneSource).toContain('timerShadow.setAlpha(0.7);');
    expect(menuSceneSource).toContain('this.drawLegacyPlayCompass(hudFrame, {');
    expect(menuSceneSource).toContain("showPane: touchControlLayout.controlMode !== 'stick'");
    expect(menuSceneSource).toContain('if (options.showPane) {');
    expect(menuSceneSource).toContain('this.hudGraphics.fillTriangle(');
    expect(menuSceneSource).toContain('this.drawLegacyPlayTouchButton(controls.pause, true, false);');
    expect(menuSceneSource).toContain('this.drawLegacyPlayTouchButton(controls.restart_attempt, true, false);');
    expect(menuSceneSource).not.toContain('this.hudGraphics.strokeRect(');
  });

  test('keeps menu dynamic trail overlays in the legacy corridor frame instead of full square cells', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');

    expect(menuSceneSource).toContain('const LEGACY_MENU_DYNAMIC_TRAIL_EDGE = 0x0a6f82;');
    expect(menuSceneSource).toContain('const LEGACY_MENU_DYNAMIC_MARKER_INSET_RATIO = 0.22;');
    expect(menuSceneSource).toContain('const LEGACY_MENU_DYNAMIC_TRAIL_CORE_RATIO = 0.3;');
    expect(menuSceneSource).toContain('const LEGACY_MENU_DYNAMIC_TRAIL_EDGE_RATIO = 0.54;');
    expect(menuSceneSource).toContain('const LEGACY_PLAYER_MARKER_HALO = 0x00b84a;');
    expect(menuSceneSource).toContain('const LEGACY_PLAYER_MARKER_CORE = 0x36ff7d;');
    expect(menuSceneSource).toContain('const dynamicTrailKeys = new Set(trail.map((point) => `${point.x},${point.y}`));');
    expect(menuSceneSource).toContain('this.fillLegacyMenuDynamicPathTile(');
    expect(menuSceneSource).toContain('const connectedLeft = trailKeys.has(`${point.x - 1},${point.y}`);');
    expect(menuSceneSource).toContain('this.fillLegacyPlayerMarkerTile(this.player');
    expect(menuSceneSource).toContain('const centerX = originX + ((point.x + 0.5) * tileSize);');
    expect(menuSceneSource).toContain('resolveLegacyPlayerMarkerRenderMetrics(');
    expect(menuSceneSource).toContain('this.boardDynamicGraphics.lineTo(centerX + playerMetrics.coreRadius, centerY);');
    expect(menuSceneSource).toContain('this.boardDynamicGraphics.fillPath();');
    expect(menuSceneSource).toContain('this.fillLegacyPlayerMarkerTile(this.player, boardLeft + boardOffset.x, boardTop + boardOffset.y, tileSize, 0.94, false);');
  });

  test('keeps active play dynamic overlays in the corridor frame instead of square cells', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');

    expect(menuSceneSource).toContain('const LEGACY_PLAY_DYNAMIC_TRAIL_EDGE = 0x107d74;');
    expect(menuSceneSource).toContain('const LEGACY_PLAY_DYNAMIC_TRAIL_CORE_RATIO = 0.64;');
    expect(menuSceneSource).toContain('const LEGACY_PLAY_DYNAMIC_TRAIL_EDGE_RATIO = 0.9;');
    expect(menuSceneSource).toContain('const LEGACY_PLAY_DYNAMIC_TRAIL_PULSE_COLOR = 0x36ff7d;');
    expect(menuSceneSource).toContain('const LEGACY_PLAY_DYNAMIC_TRAIL_PULSE_EDGE = 0xecfff5;');
    expect(menuSceneSource).toContain('const LEGACY_PLAY_DYNAMIC_TRAIL_PULSE_PERIOD_MS = 2600;');
    expect(menuSceneSource).toContain('const LEGACY_PLAY_DYNAMIC_TRAIL_PULSE_WINDOW = 3.6;');
    expect(menuSceneSource).toContain('this.fillLegacyPlayDynamicPathTile(');
    expect(menuSceneSource).toContain('this.hasLegacyPlayTrailPulsePendingFrame(time)');
    expect(menuSceneSource).toContain('const LEGACY_PLAY_TRAIL_PULSE_FRAME_INTERVAL_MS = 50;');
    expect(menuSceneSource).toContain('private legacyPlayTrailPulseNextFrameAtMs = 0;');
    expect(menuSceneSource).toContain("if (this.mode === 'play' && this.settings.toggleTrailPulse) {");
    expect(menuSceneSource).toContain('this.drawLegacyPlayDynamicTrailPulse(');
    expect(menuSceneSource).toContain("const active = this.settings.toggleTrailPulse && this.mode === 'play' && this.overlay === 'none' && this.trail.length > 1;");
    expect(menuSceneSource).toContain('this.legacyPlayTrailPulseNextFrameAtMs = time + LEGACY_PLAY_TRAIL_PULSE_FRAME_INTERVAL_MS;');
    expect(menuSceneSource).toContain('const pulseDistanceFromPlayer = phase * maxPulseIndex;');
    expect(menuSceneSource).toContain('const pulseCenterIndex = (trail.length - 1) - pulseDistanceFromPlayer;');
    expect(menuSceneSource).toContain("this.fillPlayDynamicMarkerTile(this.maze.start, 0xbca86f, boardLeft + boardOffset.x, boardTop + boardOffset.y, tileSize, 0.9, 'start');");
    expect(menuSceneSource).toContain("this.fillPlayDynamicMarkerTile(this.maze.goal, 0xd81b2a, boardLeft + boardOffset.x, boardTop + boardOffset.y, tileSize, 0.95, 'goal');");
    expect(menuSceneSource).toContain('const LEGACY_PLAY_GOAL_MARKER_CORE = 0xff263f;');
    expect(menuSceneSource).toContain('const LEGACY_PLAY_GOAL_MARKER_EDGE = 0xd81b2a;');
    expect(menuSceneSource).toContain('markerStyle: {');
    expect(menuSceneSource).toContain('playerCoreColor: LEGACY_PLAYER_MARKER_CORE');
    expect(menuSceneSource).toContain('playerHaloColor: LEGACY_PLAYER_MARKER_HALO');
    expect(menuSceneSource).toContain('trailPulseColor: LEGACY_PLAY_DYNAMIC_TRAIL_PULSE_COLOR');
    expect(menuSceneSource).toContain('trailPulseEdgeColor: LEGACY_PLAY_DYNAMIC_TRAIL_PULSE_EDGE');
    expect(menuSceneSource).toContain('trailPulsePeriodMs: LEGACY_PLAY_DYNAMIC_TRAIL_PULSE_PERIOD_MS');
    expect(menuSceneSource).toContain('trailPulseEnabled: this.settings.toggleTrailPulse');
    expect(menuSceneSource).toContain('playerCoreRadius: playerMarkerMetrics.coreRadius');
    expect(menuSceneSource).toContain('playerHaloRadius: playerMarkerMetrics.haloRadius');
    expect(menuSceneSource).toContain('resolveLegacyEndpointMarkerRenderMetrics(tileSize);');
    expect(menuSceneSource).toContain('this.boardDynamicGraphics.strokeCircle(centerX, centerY, markerMetrics.outerRadius);');
    expect(menuSceneSource).toContain('this.boardDynamicGraphics.lineTo(centerX + markerMetrics.outerRadius, centerY);');
    expect(menuSceneSource).toContain('this.fillLegacyPlayerMarkerTile(this.player');
    expect(menuSceneSource).toContain('this.fillLegacyPlayerMarkerTile(this.player, boardLeft + boardOffset.x, boardTop + boardOffset.y, tileSize, 1, true);');
    expect(menuSceneSource).toContain('const LEGACY_PLAY_PLAYER_MARKER_RADIUS_RATIO = 0.34;');
    expect(menuSceneSource).toContain('const LEGACY_PLAY_PLAYER_MARKER_HALO_RATIO = 0.46;');
    expect(menuSceneSource).toContain('resolveLegacyPlayerLocatorRenderMetrics(');
    expect(menuSceneSource).toContain('drawLocatorTick(centerX - locatorMetrics.outerRadius, centerY, centerX - locatorMetrics.innerRadius, centerY);');
    expect(menuSceneSource).toContain('const playerScreenX = this.layout.boardLeft + boardOffset.x + ((this.player.x + 0.5) * this.layout.tileSize);');
    expect(menuSceneSource).toContain('const goalScreenX = this.layout.boardLeft + boardOffset.x + ((this.maze.goal.x + 0.5) * this.layout.tileSize);');
    expect(menuSceneSource).not.toContain('this.fillTile(this.boardDynamicGraphics, point, trailColor, boardLeft + boardOffset.x, boardTop + boardOffset.y, tileSize, trailAlpha, 1);');
    expect(menuSceneSource).not.toContain('this.fillTile(this.boardDynamicGraphics, this.player, 0xf2f4f8, boardLeft + boardOffset.x, boardTop + boardOffset.y, tileSize, 1, 0);');
  });

  test('keeps dynamic overlays readable for ultra-narrow mobile tiles', () => {
    expect(resolveLegacyDynamicTrailStrokeWidth(3.265, 0.62, 3)).toBe(3);
    expect(resolveLegacyDynamicTrailStrokeWidth(3.265, 0.34, 2)).toBe(2);
    expect(resolveLegacyDynamicMarkerInset(3.265, 0.22)).toBe(0);
    const tinyPlayer = resolveLegacyPlayerMarkerRenderMetrics(3.265, 0.34, 0.54);
    expect(tinyPlayer.coreRadius).toBeCloseTo(1.11, 3);
    expect(tinyPlayer.haloRadius).toBeCloseTo(1.502, 3);
    expect(tinyPlayer.strokeWidth).toBe(1);
    const phonePlayer = resolveLegacyPlayerMarkerRenderMetrics(7, 0.34, 0.46);
    expect(phonePlayer.coreRadius).toBeCloseTo(2.38, 3);
    expect(phonePlayer.haloRadius).toBeCloseTo(3.22, 3);
    expect(phonePlayer.strokeWidth).toBe(1);
    const tinyLocator = resolveLegacyPlayerLocatorRenderMetrics(3.265, tinyPlayer.haloRadius, tinyPlayer.strokeWidth);
    expect(tinyLocator.innerRadius).toBeCloseTo(0.752, 3);
    expect(tinyLocator.outerRadius).toBeCloseTo(1.567, 3);
    expect(tinyLocator.strokeWidth).toBe(1);
    const tinyEndpoint = resolveLegacyEndpointMarkerRenderMetrics(3.265);
    expect(tinyEndpoint.coreRadius).toBeCloseTo(1, 3);
    expect(tinyEndpoint.outerRadius).toBeCloseTo(1.567, 3);
    expect(tinyEndpoint.strokeWidth).toBe(1);
  });

  test('keeps larger desktop tiles visibly weighted after responsive overlay sizing', () => {
    expect(resolveLegacyDynamicTrailStrokeWidth(18, 0.62, 3)).toBe(11);
    expect(resolveLegacyDynamicTrailStrokeWidth(18, 0.34, 2)).toBe(6);
    expect(resolveLegacyDynamicMarkerInset(18, 0.22)).toBe(3);
    const desktopPlayer = resolveLegacyPlayerMarkerRenderMetrics(18, 0.34, 0.54);
    expect(desktopPlayer.coreRadius).toBeCloseTo(6.12, 3);
    expect(desktopPlayer.haloRadius).toBeCloseTo(8.28, 3);
    expect(desktopPlayer.strokeWidth).toBe(2);
    const desktopLocator = resolveLegacyPlayerLocatorRenderMetrics(18, desktopPlayer.haloRadius, desktopPlayer.strokeWidth);
    expect(desktopLocator.innerRadius).toBeCloseTo(5.76, 3);
    expect(desktopLocator.outerRadius).toBeCloseTo(8.64, 3);
    expect(desktopLocator.strokeWidth).toBe(2);
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
    expect(menuSceneSource).toContain('private drawLegacyPlayTouchControls(');
    expect(menuSceneSource).toContain('private resolveLegacyPlayActiveTouchControls()');
    expect(menuSceneSource).toContain('activeControls: this.resolveLegacyPlayActiveTouchControls()');
    expect(menuSceneSource).toContain("this.drawLegacyPlayTouchButton(controls.move_up, false, activeControls.has('move_up'));");
    expect(menuSceneSource).toContain('private legacyPlayTouchControlPointerUpHandler: ((event: PointerEvent) => void) | null = null;');
    expect(menuSceneSource).toContain('target.addEventListener(\'pointerup\', this.legacyPlayTouchControlPointerUpHandler as EventListener');
    expect(menuSceneSource).toContain('target.addEventListener(\'pointercancel\', this.legacyPlayTouchControlPointerUpHandler as EventListener');
    expect(menuSceneSource).toContain('this.handleLegacyPlayTouchControlClientPoint(event.clientX, event.clientY, event.pointerId)');
    expect(menuSceneSource).toContain('this.handleLegacyPlayTouchControlClientMove(event.clientX, event.clientY, event.pointerId)');
    expect(menuSceneSource).toContain('this.releaseLegacyPlayTouchPointer(event.pointerId)');
    expect(menuSceneSource).toContain("controlMode: this.settings.controlMode");
    expect(menuSceneSource).toContain("touchControlLayout.controlMode === 'stick'");
    expect(menuSceneSource).toContain('this.setLegacyPlayHeldTouchMoveCandidates(this.playTouchStickPull.movementCandidates');
    expect(menuSceneSource).toContain('this.setLegacyPlayHeldTouchMoveCandidates(pullVector.movementCandidates');
    expect(menuSceneSource).toContain('movementCandidates: [...this.playTouchStickPull.movementCandidates]');
    expect(menuSceneSource).toContain('intentSegment: this.playTouchStickPull.intentSegment');
    expect(menuSceneSource).toContain('allowBeyondOuter: true');
    expect(menuSceneSource).toContain('keepWhenBlocked: true');
    expect(menuSceneSource).toContain('if (this.playTouchStickPointerId !== null) {');
    expect(menuSceneSource).toContain('private drawLegacyPlayTouchStick(');
    expect(menuSceneSource).toContain('private setLegacyPlayHeldTouchMoveCandidates(');
    expect(menuSceneSource).toContain('const wasHeld = this.playMoveFlags[direction];');
    expect(menuSceneSource).toContain('const sameControlIndex = this.playHeldTouchMoves.findIndex((move) => move.control === control);');
    expect(menuSceneSource).toContain('if (this.playHeldTouchMoves.length >= LEGACY_PLAY_HELD_TOUCH_MOVE_LIMIT) {');
    expect(menuSceneSource).toContain('const LEGACY_PLAY_TOUCH_REPEAT_INITIAL_DELAY_MS = 240;');
    expect(menuSceneSource).toContain('const LEGACY_PLAY_TOUCH_REPEAT_INTERVAL_MS = 100;');
    expect(menuSceneSource).toContain('repeatInitialDelayMs: LEGACY_PLAY_TOUCH_REPEAT_INITIAL_DELAY_MS');
    expect(menuSceneSource).toContain('repeatIntervalMs: LEGACY_PLAY_TOUCH_REPEAT_INTERVAL_MS');
    expect(menuSceneSource).toContain('this.hudTouchControlBounds = this.drawLegacyPlayTouchControls(touchControlLayout);');
    expect(menuSceneSource).toContain("showPane: touchControlLayout.controlMode !== 'stick'");
    expect(menuSceneSource).toContain('this.hudBounds = touchCompassBounds');
    expect(menuSceneSource).toContain(': mergeVisualRects(this.hudTimerBounds, this.hudArrowBounds);');
    expect(menuSceneSource).toContain('touchControls');
    expect(menuSceneSource).toContain('LEGACY_CYBER_PANEL_FILL');
    expect(menuSceneSource).toContain('this.drawLegacyCyberPanel(this.hudGraphics, {');
    expect(menuSceneSource).toContain("this.drawLegacyPlayTouchLabel(controls.pause, 'PAUSE');");
    expect(menuSceneSource).toContain("this.drawLegacyPlayTouchLabel(controls.restart_attempt, 'RESET');");
    expect(menuSceneSource).not.toContain("this.drawLegacyPlayTouchLabel(controls.toggle_thoughts, 'TRAIL');");
    expect(menuSceneSource).toContain("this.hudGraphics.moveTo(cx, cy + stem);");
    expect(menuSceneSource).toContain("this.hudGraphics.lineTo(cx, cy - size);");
    expect(menuSceneSource).toContain('installLegacyPlayTouchControlFallback');
    expect(menuSceneSource).toContain("event.pointerType === 'touch'");
    expect(menuSceneSource).toContain('event.target === this.game.canvas');
    expect(menuSceneSource).toContain('event.stopImmediatePropagation()');
    expect(menuSceneSource).toContain("case 'pause':");
    expect(menuSceneSource).toContain("this.applyLegacyPauseCommand('reset-player');");
    expect(menuSceneSource).toContain("case 'move_up':");
    expect(menuSceneSource).toContain('this.tryMovePlayer(0, -1);');
    expect(menuSceneSource).toContain('this.tryMovePlayer(1, 0);');
    expect(menuSceneSource).toContain('this.tryMovePlayer(0, 1);');
    expect(menuSceneSource).toContain('this.tryMovePlayer(-1, 0);');
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
    expect(tuningSource).toContain('full: 66,');
    expect(tuningSource).toContain('throttled: 220,');
  });

  test('keeps front-door buttons in the shared cyber chrome path', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');

    expect(menuSceneSource).toContain('const fillColor = LEGACY_CYBER_PANEL_FILL;');
    expect(menuSceneSource).toContain('this.add.rectangle(x, y, width, height, fillColor, baseAlpha);');
    expect(menuSceneSource).toContain('const strokeColor = LEGACY_PLAY_TOUCH_ACCENT;');
    expect(menuSceneSource).toContain('? 0x123a2d');
    expect(menuSceneSource).toContain('? Math.max(frontDoorChrome?.hoverAlpha ?? 0.68, 0.68)');
  });
});
