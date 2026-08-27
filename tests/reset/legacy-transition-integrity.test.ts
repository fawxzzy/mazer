import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

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
});
