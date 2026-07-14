import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

describe('edge-wrap topology architecture contract', () => {
  test('keeps graph, generation, renderer, and telemetry ownership explicit', () => {
    const contract = readFileSync(resolve(process.cwd(), 'docs/architecture/MAZER-EDGE-WRAP-TOPOLOGY-CONTRACT.md'), 'utf8');
    const mazeSource = readFileSync(resolve(process.cwd(), 'src/legacy-runtime/legacyMaze.ts'), 'utf8');
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');
    const runtimeDiagnosticsSource = readFileSync(resolve(process.cwd(), 'src/scenes/menuRuntimeDiagnostics.ts'), 'utf8');
    const renderSource = readFileSync(resolve(process.cwd(), 'src/legacy-runtime/legacyMenuRender.ts'), 'utf8');

    expect(contract).toContain('`legacy-wrap-topology-v1`');
    expect(contract).toContain('The direct generator `solutionPath` remains a `direct-floor` route.');
    expect(contract).toContain('`playable-wrap-aware` graph owns legal neighbors');
    expect(contract).toContain('`decorativeCutoutPolicy` stays `renderer-mask-owned`');
    expect(contract).toContain('does not rewrite historical receipts');
    expect(contract).toContain('Later maze-feature progression may change when axes become required');
    expect(mazeSource).toContain('wrapTopologyDiagnostics?: LegacyWrapTopologyDiagnostics;');
    expect(mazeSource).toContain('auditLegacyCompletedRouteAgainstPlayableShortestPath');
    expect(mazeSource).toContain("contractVersion: 'legacy-wrap-topology-v1'");
    expect(menuSceneSource).toContain('wrapTopologyDiagnostics: this.maze.wrapTopologyDiagnostics ? {');
    expect(runtimeDiagnosticsSource).toContain("contractVersion: 'legacy-wrap-topology-v1';");
    expect(renderSource).toContain('resolveLegacyNavigationTarget(maze, point, direction.deltaX, direction.deltaY)');
    expect(renderSource).toContain('const notch = options.topCenterNotch;');
  });
});
