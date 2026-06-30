import { describe, expect, test } from 'vitest';
import { LEGACY_DEFAULTS, MAIN_MENU_BUTTONS, linearColorToHex } from '../../src/legacy-runtime/legacyDefaults';
import { createLegacyMaze, createLegacyMenuMaze } from '../../src/legacy-runtime/legacyMaze';
import {
  createLegacyDemoWalkerEpisode,
  createLegacyMenuDemoWalkerConfig,
  LEGACY_MENU_SNAPSHOT_CADENCE,
  createLegacyMenuSnapshotDemoWalkerConfig,
  LEGACY_MENU_SNAPSHOT_PREROLL_STEPS,
  resolveLegacyPointFromDemoIndex,
  resolveLegacyTrailFromDemoSteps
} from '../../src/legacy-runtime/legacyDemoWalker';
import { collectDemoWalkerTelemetry, createDemoWalkerState } from '../../src/domain/ai';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('legacy reset lane', () => {
  test('restores the legacy front-door button set', () => {
    expect(MAIN_MENU_BUTTONS).toEqual(['Exit', 'Start', 'Options']);
  });

  test('routes the front-door Exit button through a browser-safe quit equivalence', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');
    const legacyExitSource = readFileSync(resolve(process.cwd(), 'src/legacy-runtime/legacyExit.ts'), 'utf8');
    const legacyOverlayRoutingSource = readFileSync(resolve(process.cwd(), 'src/legacy-runtime/legacyOverlayRouting.ts'), 'utf8');
    const legacyMainMenuSource = readFileSync(
      resolve(process.cwd(), '..', '..', 'tmp', 'mazer-legacy-unreal-restore', 'Source', 'Mazer', 'Private', 'UI', 'MainMenuWidget.cpp'),
      'utf8'
    );

    expect(menuSceneSource).toContain("() => this.performLegacyExit()");
    expect(menuSceneSource).toContain('private performLegacyExit(): void {');
    expect(menuSceneSource).not.toContain("case 'message':");
    expect(legacyExitSource).toContain("kind: 'replace-about-blank'");
    expect(legacyExitSource).toContain("runtime?.location?.replace?.(action.targetUrl ?? 'about:blank');");
    expect(legacyOverlayRoutingSource).not.toContain("'message'");
    expect(legacyMainMenuSource).toContain('PlayerController->ConsoleCommand("quit");');
  });

  test('preserves legacy default settings', () => {
    expect(LEGACY_DEFAULTS.scale).toBe(50);
    expect(LEGACY_DEFAULTS.camScale).toBe(0);
    expect(linearColorToHex(LEGACY_DEFAULTS.pathColor)).toBe('#797978');
    expect(linearColorToHex(LEGACY_DEFAULTS.wallColor)).toBe('#4a4a4a');
  });

  test('builds a solvable legacy maze snapshot', () => {
    const maze = createLegacyMaze(50, 0x5a17f00d);

    expect(maze.size).toBeGreaterThanOrEqual(25);
    expect(maze.solutionPath.length).toBeGreaterThan(2);
    expect(maze.start).not.toEqual(maze.goal);

    const firstStep = maze.solutionPath[0];
    const lastStep = maze.solutionPath.at(-1);

    expect(firstStep).toEqual(maze.start);
    expect(lastStep).toEqual(maze.goal);
  });

  test('uses a fixed legacy-shaped menu maze snapshot for the front door', () => {
    const menuMaze = createLegacyMenuMaze(3749);

    expect(menuMaze.size).toBe(25);
    expect(menuMaze.start).toEqual({ x: 3, y: 4 });
    expect(menuMaze.goal).toEqual({ x: 22, y: 22 });
    expect(menuMaze.solutionPath[0]).toEqual(menuMaze.start);
    expect(menuMaze.solutionPath.at(-1)).toEqual(menuMaze.goal);
    expect(menuMaze.grid[13]?.[22]).toBe(true);
    expect(menuMaze.grid[21]?.[20]).toBe(true);
    expect(menuMaze.grid[11]?.[12]).toBe(true);
    expect(menuMaze.grid[19]?.[13]).toBe(true);
    expect(menuMaze.grid[20]?.[23]).toBe(true);
    expect(menuMaze.grid[3]?.[19]).toBe(true);
    expect(menuMaze.grid[9]?.[4]).toBe(true);
    expect(menuMaze.grid[14]?.[17]).toBe(true);
    expect(menuMaze.grid[20]?.[12]).toBe(true);
    expect(menuMaze.grid[19]?.[22]).toBe(true);
    expect(menuMaze.grid[4]?.[18]).toBe(true);
    expect(menuMaze.grid[16]?.[6]).toBe(true);
    expect(menuMaze.grid[22]?.[18]).toBe(true);
    expect(menuMaze.grid[11]?.[21]).toBe(true);
    expect(menuMaze.grid[11]?.[23]).toBe(true);
    expect(menuMaze.grid[4]?.[7]).toBe(true);
    expect(menuMaze.grid[8]?.[5]).toBe(true);
    expect(menuMaze.grid[7]?.[19]).toBe(true);
    expect(menuMaze.grid[11]?.[17]).toBe(true);
    expect(menuMaze.grid[11]?.[14]).toBe(true);
    expect(menuMaze.grid[12]?.[11]).toBe(true);
    expect(menuMaze.grid[13]?.[18]).toBe(true);
    expect(menuMaze.grid[8]?.[13]).toBe(true);
    expect(menuMaze.grid[8]?.[15]).toBe(true);
    expect(menuMaze.grid[13]?.[4]).toBe(true);
    expect(menuMaze.grid[15]?.[8]).toBe(true);
    expect(menuMaze.grid[12]?.[13]).toBe(true);
    expect(menuMaze.grid[21]?.[15]).toBe(true);
    expect(menuMaze.grid[15]?.[23]).toBe(true);
    expect(menuMaze.grid[8]?.[10]).toBe(true);
    expect(menuMaze.grid[10]?.[8]).toBe(true);
    expect(menuMaze.grid[5]?.[8]).toBe(true);
    expect(menuMaze.grid[6]?.[9]).toBe(true);
    expect(menuMaze.grid[6]?.[10]).toBe(true);
    expect(menuMaze.grid[6]?.[17]).toBe(true);
    expect(menuMaze.grid[7]?.[9]).toBe(true);
    expect(menuMaze.grid[11]?.[13]).toBe(true);
    expect(menuMaze.grid[3]?.[2]).toBe(true);
    expect(menuMaze.grid[6]?.[24]).toBe(true);
    expect(menuMaze.grid[12]?.[24]).toBe(true);
    expect(menuMaze.grid[18]?.[20]).toBe(true);
    expect(menuMaze.grid[20]?.[19]).toBe(true);
    expect(menuMaze.grid[16]?.[23]).toBe(true);
    expect(menuMaze.grid[11]?.[22]).toBe(true);
    expect(menuMaze.grid[16]?.[3]).toBe(true);
    expect(menuMaze.grid[18]?.[5]).toBe(true);
    expect(menuMaze.grid[18]?.[8]).toBe(true);
    expect(menuMaze.grid[20]?.[4]).toBe(true);
    expect(menuMaze.grid[20]?.[8]).toBe(true);
  });

  test('adapts legacy maze snapshots into the recovered menu demo walker lane', () => {
    const maze = createLegacyMaze(50, 3749);
    const episode = createLegacyDemoWalkerEpisode(maze);
    const config = createLegacyMenuDemoWalkerConfig(maze.seed);
    const state = createDemoWalkerState(episode, config);
    const telemetry = collectDemoWalkerTelemetry(episode, config);

    expect(episode.raster.startIndex).toBe((maze.start.y * maze.size) + maze.start.x);
    expect(episode.raster.endIndex).toBe((maze.goal.y * maze.size) + maze.goal.x);
    expect(Array.from(episode.raster.pathIndices).at(0)).toBe(episode.raster.startIndex);
    expect(Array.from(episode.raster.pathIndices).at(-1)).toBe(episode.raster.endIndex);
    expect(config.behavior.enableRunnerMistakes).toBe(true);
    expect(telemetry.backtrackCount).toBeGreaterThan(0);
    expect(resolveLegacyPointFromDemoIndex(state.currentIndex, episode.raster.width)).toEqual(maze.start);
    expect(resolveLegacyTrailFromDemoSteps(state.trailSteps, episode.raster.width)).toEqual([maze.start]);
  });

  test('uses a deterministic deep-preroll config for the fixed legacy menu snapshot', () => {
    const snapshotConfig = createLegacyMenuSnapshotDemoWalkerConfig(3749);
    const genericConfig = createLegacyMenuDemoWalkerConfig(3749);

    expect(snapshotConfig.behavior.enableRunnerMistakes).toBe(true);
    expect(snapshotConfig.behavior.prerollSteps).toBeGreaterThanOrEqual(LEGACY_MENU_SNAPSHOT_PREROLL_STEPS);
    expect(snapshotConfig.cadence.exploreStepMs).toBe(LEGACY_MENU_SNAPSHOT_CADENCE.exploreStepMs);
    expect(snapshotConfig.cadence.backtrackStepMs).toBe(LEGACY_MENU_SNAPSHOT_CADENCE.backtrackStepMs);
    expect(snapshotConfig.cadence.goalHoldMs).toBe(LEGACY_MENU_SNAPSHOT_CADENCE.goalHoldMs);
    expect(snapshotConfig.cadence.resetHoldMs).toBe(LEGACY_MENU_SNAPSHOT_CADENCE.resetHoldMs);
    expect(genericConfig.behavior.enableRunnerMistakes).toBe(true);
    expect(genericConfig.cadence.exploreStepMs).not.toBe(snapshotConfig.cadence.exploreStepMs);
  });

  test('keeps the active-play HUD minimal and legacy-shaped', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');
    const demoLifecycleSource = readFileSync(resolve(process.cwd(), 'src/legacy-runtime/legacyMenuDemoLifecycle.ts'), 'utf8');

    expect(menuSceneSource).toContain('const timerText = `Time ${elapsed}`;');
    expect(menuSceneSource).toContain('Phaser.Math.Angle.Between');
    expect(menuSceneSource).not.toContain('WASD or arrows to move   P to pause');
    expect(menuSceneSource).toContain('const arrowOriginX = this.layout.width - 30;');
    expect(menuSceneSource).toContain('const arrowOriginY = 22;');
    expect(menuSceneSource).toContain('const length = 18;');
    expect(menuSceneSource).toContain('const timerLeft = 14;');
    expect(menuSceneSource).toContain('const timerTop = 14;');
    expect(menuSceneSource).toContain('const timerWidth = 118;');
    expect(menuSceneSource).toContain('const timerHeight = 22;');
    expect(menuSceneSource).toContain('this.hudGraphics.fillRect(timerLeft, timerTop, timerWidth, timerHeight);');
    expect(menuSceneSource).toContain("fontSize: '14px',");
    expect(menuSceneSource).toContain('this.hudBounds = mergeVisualRects(this.hudTimerBounds, this.hudArrowBounds);');
    expect(menuSceneSource).not.toContain('fillRoundedRect(20, 18, 184, 44, 8)');
    expect(menuSceneSource).toContain('this.schedulePlayResetReturn();');
    expect(menuSceneSource).toContain('createLegacyMenuDemoBootstrap(this.maze, this.settings.toggleTrailFade, TRAIL_FADE_TAIL)');
    expect(menuSceneSource).toContain('advanceLegacyMenuDemoFrame(');
    expect(demoLifecycleSource).toContain('createLegacyMenuSnapshotDemoWalkerConfig(maze.seed)');
    expect(demoLifecycleSource).toContain('createLegacyMenuDemoWalkerConfig(maze.seed)');
    expect(demoLifecycleSource).toContain('advanceDemoWalker(episode, state, config)');
  });

  test('routes legacy process-8 reset branches through explicit reset requests', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');
    const playLifecycleSource = readFileSync(resolve(process.cwd(), 'src/legacy-runtime/legacyPlayLifecycle.ts'), 'utf8');

    expect(playLifecycleSource).toContain('type LegacyResetAction =');
    expect(playLifecycleSource).toContain('createLegacyResetRequest');
    expect(playLifecycleSource).toContain('shouldConsumeLegacyResetRequest');
    expect(menuSceneSource).toContain('private pendingResetRequest: LegacyResetRequest | null = null;');
    expect(menuSceneSource).toContain('if (pendingReset !== null && shouldConsumeLegacyResetRequest(pendingReset, time)) {');
    expect(menuSceneSource).toContain("this.pendingResetRequest = createLegacyResetRequest({");
    expect(menuSceneSource).toContain("mode: 'play',");
    expect(menuSceneSource).toContain("mode: 'menu',");
    expect(menuSceneSource).toContain("if (request.action === 'return-menu') {");
    expect(menuSceneSource).toContain('pendingAction: this.pendingResetRequest?.action ?? null,');
    expect(menuSceneSource).toContain('bypassesLevelBuildingDelay: this.pendingResetRequest?.entry.bypassesLevelBuildingDelay ?? null,');
  });

  test('keeps the menu backdrop in the denser screenshot-directed field lane', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');

    expect(menuSceneSource).toContain('LEGACY_MENU_STAR_COUNT');
    expect(menuSceneSource).toContain('createLegacyMenuBackdropStars');
    expect(menuSceneSource).toContain('advanceLegacyMenuBackdropStars');
    expect(menuSceneSource).toContain('resolveLegacyMenuBackdropPalette');
    expect(menuSceneSource).toContain('resolveLegacyMenuBackdropOrbs');
  });

  test('cleans up localhost service workers before booting Phaser', () => {
    const bootSource = readFileSync(resolve(process.cwd(), 'src/boot/main.ts'), 'utf8');

    expect(bootSource).toContain("const LOCALHOST_SW_RESET_KEY = 'mazer:localhost-sw-reset:v1';");
    expect(bootSource).toContain("['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)");
    expect(bootSource).toContain('navigator.serviceWorker.getRegistrations()');
    expect(bootSource).toContain("cacheKey.includes('mazer')");
    expect(bootSource).toContain('window.location.reload();');
    expect(bootSource).toContain("markMazerBootStatus('boot-start');");
    expect(bootSource).toContain("markMazerBootStatus('game-created');");
  });

  test('routes generation and reset through explicit queued request contracts', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');
    const generationLifecycleSource = readFileSync(resolve(process.cwd(), 'src/legacy-runtime/legacyGenerationLifecycle.ts'), 'utf8');

    expect(generationLifecycleSource).toContain("type LegacyGenerationRequestReason =");
    expect(generationLifecycleSource).toContain('createLegacyGenerationRequest');
    expect(generationLifecycleSource).toContain('createLegacyMenuResetGenerationRequest');
    expect(generationLifecycleSource).toContain('shouldConsumeLegacyGenerationRequest');
    expect(generationLifecycleSource).toContain('consumeLegacyGenerationRequest');
    expect(generationLifecycleSource).toContain('consumeLegacyGenerationRequestState');
    expect(generationLifecycleSource).toContain('resolveLegacyGenerationExecutionPlan');
    expect(generationLifecycleSource).toContain('resolveLegacyGenerationBudgetContract');
    expect(generationLifecycleSource).toContain('resolveLegacyGenerationStageCursor');
    expect(generationLifecycleSource).toContain('resolveLegacyGenerationTickGateContract');
    expect(generationLifecycleSource).toContain("completionSignal: 'grid-spawn-complete'");
    expect(generationLifecycleSource).toContain("completionSignal: 'checkpoint-budget-exhausted'");
    expect(generationLifecycleSource).toContain("completionSignal: 'shortcut-budget-exhausted'");
    expect(generationLifecycleSource).toContain('skipToStageIdWhenDisabled: stageId === 5 ? 6 : null');
    expect(generationLifecycleSource).toContain("executionKind: 'row-slice'");
    expect(generationLifecycleSource).toContain("executionKind: 'checkpoint-pass'");
    expect(generationLifecycleSource).toContain("executionKind: 'path-batch'");
    expect(generationLifecycleSource).toContain("executionKind: 'shortcut-attempt'");
    expect(generationLifecycleSource).toContain('checkpointCount: Math.trunc(normalizedScale + (normalizedScale * checkpointModifier))');
    expect(generationLifecycleSource).toContain('shortcutCount: Math.trunc(normalizedScale * shortcutCountModifier)');
    expect(generationLifecycleSource).toContain('entryStageId: LEGACY_GENERATION_ENTRY_STAGE_ID');
    expect(generationLifecycleSource).toContain('waitsForLevelBuildingDelay: true');
    expect(generationLifecycleSource).toContain('consumesWhileUninitialized: true');
    expect(generationLifecycleSource).toContain('requiresLevelBuildingStartTime: true');
    expect(generationLifecycleSource).toContain('requiresLevelBuildingDelayStartedFlag: true');
    expect(generationLifecycleSource).toContain("levelBuildingDelayDurationSource: LEGACY_LEVEL_BUILDING_DELAY_DURATION_SOURCE");
    expect(generationLifecycleSource).toContain('initializedResetBypassesDelayGate: true');
    expect(menuSceneSource).toContain("this.pendingGenerationRequest: LegacyGenerationRequest | null = null;".replace('this.', 'private '));
    expect(menuSceneSource).toContain('const nextRequest = this.pendingGenerationRequest;');
    expect(menuSceneSource).toContain('if (nextRequest !== null && shouldConsumeLegacyGenerationRequest(nextRequest, time))');
    expect(menuSceneSource).toContain('const generationState = consumeLegacyGenerationRequestState(request, this.settings.scale);');
    expect(menuSceneSource).toContain('if (generationState.startsPlayTimer) {');
    expect(menuSceneSource).toContain("this.queueGenerationRequest('menu-demo-missing-episode', 0, { stepSeed: true });");
    expect(menuSceneSource).toContain("this.queueGenerationRequest('overlay-rebuild', 0, { stepSeed: true });");
    expect(menuSceneSource).toContain('this.pendingGenerationRequest = createLegacyMenuResetGenerationRequest({');
    expect(menuSceneSource).toContain('nowMs: time,');
    expect(menuSceneSource).toContain('pendingRequest: {');
    expect(menuSceneSource).toContain('budget: {');
    expect(menuSceneSource).toContain('checkpointCount: this.maze.generation?.budget.checkpointCount ?? null');
    expect(menuSceneSource).toContain('shortcutCountModifier: this.maze.generation?.budget.shortcutCountModifier ?? null');
    expect(menuSceneSource).toContain('entryStageId: this.maze.generation?.gate.entryStageId ?? null');
    expect(menuSceneSource).toContain('buildKind: this.pendingGenerationRequest?.buildKind ?? null');
    expect(menuSceneSource).toContain('checkpointCount: this.pendingGenerationRequest?.budget.checkpointCount ?? null');
    expect(menuSceneSource).toContain('entryStageId: this.pendingGenerationRequest?.gate.entryStageId ?? null');
    expect(menuSceneSource).toContain('queuedAtMs: this.pendingGenerationRequest?.queuedAtMs ?? null');
    expect(menuSceneSource).toContain('levelBuildingDelayDurationSource: this.pendingGenerationRequest?.gate.levelBuildingDelayDurationSource ?? null');
    expect(menuSceneSource).toContain('requiresLevelBuildingStartTime: this.pendingGenerationRequest?.gate.requiresLevelBuildingStartTime ?? null');
    expect(menuSceneSource).toContain('completionSignal: stage.completionSignal,');
    expect(menuSceneSource).toContain('advancesToStageId: stage.advancesToStageId,');
    expect(menuSceneSource).toContain('processStageIds: [...(this.pendingGenerationRequest?.processStageIds ?? [])]');
    expect(menuSceneSource).toContain('stageCursor: {');
    expect(menuSceneSource).toContain('currentStageId: this.maze.generation?.stageCursor.currentStageId ?? null');
    expect(menuSceneSource).toContain('currentStageId: this.pendingGenerationRequest?.stageCursor.currentStageId ?? null');
    expect(menuSceneSource).toContain('executionPlan: (this.maze.generation?.executionPlan ?? []).map((stage) => ({');
    expect(menuSceneSource).toContain('resolveMenuSceneRuntimeConfig(runtimeSearch, {');
    expect(menuSceneSource).toContain('publishMenuSceneRuntimeDiagnostics({');
    expect(menuSceneSource).toContain('clearMenuSceneRuntimeDiagnostics();');
  });

  test('defers overlay rebuild travel until closing the options surface', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');
    const legacyPauseMenuSource = readFileSync(
      resolve(process.cwd(), '..', '..', 'tmp', 'mazer-legacy-unreal-restore', 'Source', 'Mazer', 'Private', 'UI', 'PauseMenuWidget.cpp'),
      'utf8'
    );

    expect(menuSceneSource).toContain('private pendingOverlayMazeRebuild = false;');
    expect(menuSceneSource).toContain('this.pendingOverlayMazeRebuild = true;');
    expect(menuSceneSource).toContain('if (this.pendingOverlayMazeRebuild) {');
    expect(menuSceneSource).toContain("this.queueGenerationRequest('overlay-rebuild', 0, { stepSeed: true });");
    expect(menuSceneSource).toContain('this.pendingOverlayMazeRebuild = false;');
    expect(legacyPauseMenuSource).toContain('if (ScaleNumChanged || MaterialChanged)');
    expect(legacyPauseMenuSource).toContain('GetWorld()->ServerTravel("Game/Level/Template");');
  });

  test('routes pause commands through an explicit legacy pause lifecycle contract', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');
    const pauseLifecycleSource = readFileSync(resolve(process.cwd(), 'src/legacy-runtime/legacyPauseLifecycle.ts'), 'utf8');
    const playLifecycleSource = readFileSync(resolve(process.cwd(), 'src/legacy-runtime/legacyPlayLifecycle.ts'), 'utf8');
    const legacyGamePauseSource = readFileSync(
      resolve(process.cwd(), '..', '..', 'tmp', 'mazer-legacy-unreal-restore', 'Source', 'Mazer', 'Private', 'UI', 'GamePauseMenu.cpp'),
      'utf8'
    );

    expect(pauseLifecycleSource).toContain("type LegacyPauseCommand = 'reset-player' | 'return-menu' | 'resume';");
    expect(pauseLifecycleSource).toContain('resolveLegacyPauseCommand');
    expect(menuSceneSource).toContain("this.applyLegacyPauseCommand('resume')");
    expect(menuSceneSource).toContain("this.applyLegacyPauseCommand('reset-player')");
    expect(menuSceneSource).toContain("this.applyLegacyPauseCommand('return-menu')");
    expect(menuSceneSource).toContain('private applyLegacyPauseCommand(command: LegacyPauseCommand): void {');
    expect(playLifecycleSource).toContain('resolveLegacyResetEntryContract');
    expect(playLifecycleSource).toContain('entryStageId: LEGACY_RESET_ENTRY_STAGE_ID');
    expect(playLifecycleSource).toContain('bypassesLevelBuildingDelay: true');
    expect(playLifecycleSource).toContain('rearmsDelayStart: mode === \'menu\'');
    expect(legacyGamePauseSource).toContain('MazerGameInstance->_ResetPlayerPosition = true;');
    expect(legacyGamePauseSource).toContain('Back_Clicked();');
    expect(legacyGamePauseSource).toContain('MazerGameInstance->_Playing = false;');
  });

  test('routes features and game-modes toggle responsibilities through an explicit legacy overlay toggle contract', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');
    const toggleFieldSource = readFileSync(resolve(process.cwd(), 'src/legacy-runtime/legacyOverlayToggleFields.ts'), 'utf8');
    const legacyFeaturesSource = readFileSync(
      resolve(process.cwd(), '..', '..', 'tmp', 'mazer-legacy-unreal-restore', 'Source', 'Mazer', 'Private', 'UI', 'FeaturesWidget.cpp'),
      'utf8'
    );
    const legacyGameModesSource = readFileSync(
      resolve(process.cwd(), '..', '..', 'tmp', 'mazer-legacy-unreal-restore', 'Source', 'Mazer', 'Private', 'UI', 'GameModesWidget.cpp'),
      'utf8'
    );

    expect(toggleFieldSource).toContain("type LegacyOverlayToggleFieldId = 'toggleCameraFollow' | 'toggleTrailFade' | 'darkMode';");
    expect(toggleFieldSource).toContain('resolveLegacyOverlayToggleStateText');
    expect(toggleFieldSource).toContain('legacyDirectionalLightIntensity');
    expect(menuSceneSource).toContain("stateText: resolveLegacyOverlayToggleStateText('toggleCameraFollow', this.settings.toggleCameraFollow)");
    expect(menuSceneSource).toContain("stateText: resolveLegacyOverlayToggleStateText('toggleTrailFade', this.settings.toggleTrailFade)");
    expect(menuSceneSource).toContain('stateText: null');
    expect(menuSceneSource).toContain("this.applyLegacyOverlayToggleField('toggleCameraFollow')");
    expect(menuSceneSource).toContain("this.applyLegacyOverlayToggleField('toggleTrailFade')");
    expect(menuSceneSource).toContain("this.applyLegacyOverlayToggleField('darkMode')");
    expect(menuSceneSource).toContain('private applyLegacyOverlayToggleField(fieldId: LegacyOverlayToggleFieldId): void {');
    expect(legacyFeaturesSource).toContain('ToggleCameraFollowText');
    expect(legacyFeaturesSource).toContain('ToggleTrailFadeText');
    expect(legacyFeaturesSource).toContain('SetToggleCameraFollowText("Off")');
    expect(legacyFeaturesSource).toContain('SetToggleTrailFadeText("Off")');
    expect(legacyGameModesSource).not.toContain('DarkModeText');
    expect(legacyGameModesSource).toContain('SetIntensity(2.f);');
    expect(legacyGameModesSource).toContain('SetIntensity(0.3f);');
  });

  test('routes menu-time overlay field commits through an explicit legacy flag contract', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');
    const overlayFieldCommitSource = readFileSync(resolve(process.cwd(), 'src/legacy-runtime/legacyOverlayFieldCommit.ts'), 'utf8');
    const legacyPauseMenuSource = readFileSync(
      resolve(process.cwd(), '..', '..', 'tmp', 'mazer-legacy-unreal-restore', 'Source', 'Mazer', 'Private', 'UI', 'PauseMenuWidget.cpp'),
      'utf8'
    );

    expect(overlayFieldCommitSource).toContain("type LegacyOverlayFieldCommitKind = 'camera-flag' | 'material-change' | 'scale-change';");
    expect(overlayFieldCommitSource).toContain('applyLegacyOverlayFieldCommit');
    expect(overlayFieldCommitSource).toContain('triggersReloadOnBack');
    expect(overlayFieldCommitSource).toContain('triggersCameraFlag');
    expect(menuSceneSource).toContain("const result = applyLegacyOverlayFieldCommit(this.settings, this.optionFieldDrafts, fieldId);");
    expect(menuSceneSource).toContain('if (result.triggersReloadOnBack) {');
    expect(menuSceneSource).toContain('if (result.refreshLayout) {');
    expect(legacyPauseMenuSource).toContain('ScaleNumChanged = true;');
    expect(legacyPauseMenuSource).toContain('MazerGameInstance->_PathMaterialChanged = MaterialChanged = true;');
    expect(legacyPauseMenuSource).toContain('MazerGameInstance->_WallMaterialChanged = MaterialChanged = true;');
    expect(legacyPauseMenuSource).toContain('MazerGameInstance->_CamScaleFlag = true;');
  });

  test('routes nested overlay back navigation through an explicit legacy overlay routing contract', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');
    const overlayRoutingSource = readFileSync(resolve(process.cwd(), 'src/legacy-runtime/legacyOverlayRouting.ts'), 'utf8');
    const legacyFeaturesSource = readFileSync(
      resolve(process.cwd(), '..', '..', 'tmp', 'mazer-legacy-unreal-restore', 'Source', 'Mazer', 'Private', 'UI', 'FeaturesWidget.cpp'),
      'utf8'
    );
    const legacyGameModesSource = readFileSync(
      resolve(process.cwd(), '..', '..', 'tmp', 'mazer-legacy-unreal-restore', 'Source', 'Mazer', 'Private', 'UI', 'GameModesWidget.cpp'),
      'utf8'
    );

    expect(overlayRoutingSource).toContain('resolveLegacyNestedOverlayOpen');
    expect(overlayRoutingSource).toContain('resolveLegacyOverlayBackAction');
    expect(menuSceneSource).toContain('const nextOverlayState = resolveLegacyNestedOverlayOpen(');
    expect(menuSceneSource).toContain('const action = resolveLegacyOverlayBackAction({');
    expect(menuSceneSource).toContain("case 'return-parent':");
    expect(menuSceneSource).toContain("case 'close-overlay':");
    expect(legacyFeaturesSource).toContain('RemoveFromParent();');
    expect(legacyGameModesSource).toContain('RemoveFromParent();');
  });
});
