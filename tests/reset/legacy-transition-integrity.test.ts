import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test, vi } from 'vitest';
import { MenuScene } from '../../src/scenes/MenuScene';

// MenuScene extends Phaser.Scene; importing the real phaser package needs a
// DOM (window) this suite's node environment doesn't provide. This suite
// only needs the class's prototype (a plain method lookup, no instance),
// so mock just enough of the namespace for the module to load -- same
// minimal mock tests/reset/legacy-player-progression-flow.test.ts already
// uses for the identical reason. vi.mock calls are hoisted above imports,
// so this applies before the MenuScene import above actually runs.
vi.mock('phaser', () => ({
  default: {
    AUTO: 'AUTO',
    Math: {
      Clamp: (value: number, min: number, max: number) => Math.max(min, Math.min(max, value)),
      Linear: (from: number, to: number, t: number) => from + ((to - from) * t)
    },
    Scale: {
      RESIZE: 'RESIZE',
      CENTER_BOTH: 'CENTER_BOTH'
    },
    Scene: class {}
  }
}));

const menuSceneSource = readFileSync(
  resolve(process.cwd(), 'src/scenes/MenuScene.ts'),
  'utf8'
).replace(/\r\n/g, '\n');

const methodSource = (startMarker: string, endMarker: string): string => {
  const start = menuSceneSource.indexOf(startMarker);
  const end = menuSceneSource.indexOf(endMarker, start + startMarker.length);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return menuSceneSource.slice(start, end);
};

describe('legacy scene transition integrity', () => {
  test('cancels stale queued generation work before either mode transition installs its new maze', () => {
    const enterMenu = methodSource(
      '  private enterMenuMode(): void {',
      '  private startPlayMode(): void {'
    );
    const startPlay = methodSource(
      '  private startPlayMode(): void {',
      '  private updateMenuDemo(time: number): void {'
    );

    expect(enterMenu.indexOf('this.pendingGenerationRequest = null;')).toBeLessThan(
      enterMenu.indexOf('this.applyGenerationRequest(')
    );
    expect(startPlay.indexOf('this.pendingGenerationRequest = null;')).toBeLessThan(
      startPlay.indexOf("this.mode = 'play';")
    );
    expect(startPlay.indexOf('this.pendingGenerationRequest = null;')).toBeLessThan(
      startPlay.indexOf('this.rebuildMaze();')
    );
  });

  test('lands every inbound volley on the complete build settlement boundary', () => {
    const armBuild = methodSource(
      '  private armLegacyMenuStaticDrawStage(): void {',
      '  private armLegacyMenuStaticDeconstructStage(time: number): void {'
    );
    const settleBuild = methodSource(
      '  private settleLegacyMenuStaticDrawStageIfComplete(time: number): void {',
      '  private advanceLegacyMenuStaticDrawStage(time: number): void {'
    );
    const advanceBuild = methodSource(
      '  private advanceLegacyMenuStaticDrawStage(time: number): void {',
      '  private armLegacyPlayerArrivalForFinalBuildStep('
    );
    const arrival = methodSource(
      '  private armLegacyPlayerArrivalForFinalBuildStep(',
      '  private enterMenuMode(): void {'
    );

    expect(armBuild).toContain('this.playerSpawnBurstStartedAtMs = null;');
    expect(settleBuild).toContain("const settlingFromBuild = this.menuStaticDrawLifecyclePhase === 'building';");
    expect(settleBuild).toContain('this.armLegacyPlayerArrivalForFinalBuildStep(time, 0);');
    expect(advanceBuild).toContain('resolveLegacyStaticDrawBuildRemainingMs({');
    // Widened from the beam's own travel time to the bleed-dock corridor's
    // full growth window (LEGACY_BLEED_DOCK_GROWTH_MS is longer) so this
    // reliably arms before the corridor's outward growth actually reaches
    // the screen edge -- arming early only gives the future-pinned delivery
    // timestamp below more lead time, it does not fire the beam early.
    expect(advanceBuild).toContain('buildRemainingMs <= LEGACY_BLEED_DOCK_GROWTH_MS');
    expect(arrival).toContain('this.playerSpawnBurstStartedAtMs ??= alignedStartedAtMs;');
    // Pinned to the future instant buildRemainingMs reaches 0 (when the
    // corridor's own growth genuinely touches the edge) rather than
    // back-dated to make the beam's travel time finish at build end --
    // deliveryElapsedMs stays clamped at 0 (no visible progress) until that
    // instant, matching "once the bleed paths touch the screen's edge,
    // that's when the lasers shoot the player back in".
    expect(arrival).toContain('this.playerTransferEnergyDeliveryStartedAtMs ??= time + Math.max(0, buildRemainingMs);');
  });

  test('pins proof-route seeds and shares exact orbit geometry between diamonds and transferred energy', () => {
    const rebuild = methodSource(
      '  private rebuildMaze(nextDemoMoveAtMs = 0): void {',
      '  private refreshRuntimeMazeSeedIfUnpinned(): void {'
    );
    const orbitGeometry = methodSource(
      '  private resolveLegacyMenuPathTitleOrbitGeometry(',
      '  private drawLegacyMenuPathTitleOrbitSigils('
    );
    const transferPoses = methodSource(
      '  private resolveLegacyPlayerTransferOrbitPoses(time: number):',
      '  private drawLegacyPlayerTransferEnergy('
    );

    expect(rebuild).toContain('this.explicitRuntimeMazeSeed');
    expect(rebuild).toContain('? this.mazeSeed');
    expect(orbitGeometry).toContain('crownHalf: titleLayout.cellSize * 0.56');
    expect(transferPoses).toContain('this.resolveLegacyMenuPathTitleOrbitGeometry()');
    expect(transferPoses).not.toContain('crownHalf: 0');
  });

  test('keeps the player visible until outbound energy has actually left the tile', () => {
    const dynamicBoard = methodSource(
      '  private drawDynamicBoard(time: number): void {',
      '  private resolveLegacyPlayerSpawnBurstState(time: number):'
    );

    expect(dynamicBoard).toContain("playerTransferEnergy.phase === 'pending'");
    expect(dynamicBoard).toContain("playerTransferEnergy.phase === 'outbound'");
    expect(dynamicBoard).toContain('1 - playerTransferEnergy.outboundProgress');
  });

  test('cannot leak a pending menu-demo deconstruct arm across a mode switch', () => {
    // Regression: a menu-demo goal-arrival precompute schedules
    // pendingMenuDemoDeconstructArmAtMs (and a 'menu'-mode
    // pendingLegacyDeconstructResetMaze) LEGACY_MENU_DEMO_GOAL_RESET_HOLD_MS
    // in the future. If the player presses Start inside that window and
    // later returns to the menu, neither field self-invalidated on its
    // own -- a stale pending arm would fire against the brand-new menu
    // maze enterMenuMode just built, unprompted by any real goal arrival.
    // Both mode-transition entry points must clear it before doing
    // anything else that could be superseded by it.
    const enterMenu = methodSource(
      '  private enterMenuMode(): void {',
      '  private startPlayMode(): void {'
    );
    const startPlay = methodSource(
      '  private startPlayMode(): void {',
      '  private updateMenuDemo(time: number): void {'
    );

    expect(enterMenu.indexOf('this.clearPendingLegacyMenuDemoResetTransition();')).toBeGreaterThanOrEqual(0);
    expect(enterMenu.indexOf('this.clearPendingLegacyMenuDemoResetTransition();')).toBeLessThan(
      enterMenu.indexOf('this.applyGenerationRequest(')
    );
    expect(startPlay.indexOf('this.clearPendingLegacyMenuDemoResetTransition();')).toBeGreaterThanOrEqual(0);
    expect(startPlay.indexOf('this.clearPendingLegacyMenuDemoResetTransition();')).toBeLessThan(
      startPlay.indexOf('this.rebuildMaze();')
    );

    // The clearing method itself, exercised directly against a bare stub --
    // a real behavioral check, not just a source-text guard that it's
    // wired in. Mode-scoped: a 'play'-mode precompute (the existing,
    // unrelated play-mode mechanism from PR #307) must survive; only a
    // 'menu'-mode one is this method's concern.
    const clearPendingLegacyMenuDemoResetTransition = (
      MenuScene.prototype as unknown as { clearPendingLegacyMenuDemoResetTransition: (this: unknown) => void }
    ).clearPendingLegacyMenuDemoResetTransition;

    const menuStub = {
      pendingMenuDemoDeconstructArmAtMs: 12345,
      pendingLegacyDeconstructResetMaze: { mode: 'menu', seed: 1, maze: {} }
    };
    clearPendingLegacyMenuDemoResetTransition.call(menuStub);
    expect(menuStub.pendingMenuDemoDeconstructArmAtMs).toBeNull();
    expect(menuStub.pendingLegacyDeconstructResetMaze).toBeNull();

    const playStub = {
      pendingMenuDemoDeconstructArmAtMs: null,
      pendingLegacyDeconstructResetMaze: { mode: 'play', seed: 2, maze: {} }
    };
    const originalPlayPrecompute = playStub.pendingLegacyDeconstructResetMaze;
    clearPendingLegacyMenuDemoResetTransition.call(playStub);
    expect(playStub.pendingMenuDemoDeconstructArmAtMs).toBeNull();
    expect(playStub.pendingLegacyDeconstructResetMaze).toBe(originalPlayPrecompute);
  });
});
