import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

describe('directional intent architecture contract', () => {
  test('keeps input, graph, turn, rendering, and proof ownership explicit', () => {
    const contract = readFileSync(resolve(process.cwd(), 'docs/architecture/MAZER-DIRECTIONAL-INTENT-CONTRACT.md'), 'utf8');
    const intentSource = readFileSync(resolve(process.cwd(), 'src/legacy-runtime/legacyDirectionalIntent.ts'), 'utf8');
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');

    expect(contract).toContain('`legacy-directional-intent-v2`');
    expect(contract).toContain('exactly one latest-wins queued direction');
    expect(contract).toContain('the resolver may move one tile on the perpendicular axis when either side immediately restores the held lane');
    expect(contract).toContain('A lane shift never changes the active held direction.');
    expect(contract).toContain('`resolveLegacyNavigationTarget(...)` owns direct and paired-wrap legality.');
    expect(contract).toContain('`WorldTurnSystem` remains the mutation boundary.');
    expect(contract).toContain('Render interpolation remains cosmetic.');
    expect(contract).toContain('They do not expose a solver path or future route.');
    expect(intentSource).toContain('export const LEGACY_DIRECTIONAL_INTENT_LANE_SHIFT_TILE_LIMIT = 1;');
    expect(intentSource).toContain("return this.createStopStep('stopped-at-assist-limit');");
    expect(intentSource).toContain("return this.createStopStep('stopped-assistance-disabled');");
    expect(intentSource).toContain("return this.createStopStep('stopped-awaiting-queued-direction');");
    expect(intentSource).toContain('resolveLegacyNavigationTarget(maze, player, delta.x, delta.y)');
    expect(menuSceneSource).toContain('private readonly playDirectionalIntent = new LegacyDirectionalIntentResolver();');
    expect(menuSceneSource).toContain('assistedLaneShiftEnabled: this.settings.smartSteering');
    expect(menuSceneSource).toContain('return this.tryMovePlayer(step.deltaX, step.deltaY);');
    expect(menuSceneSource).toContain('directionalIntent: this.playDirectionalIntent.getDiagnostics()');
  });
});
