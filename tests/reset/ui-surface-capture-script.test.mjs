import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

describe('UI surface capture script contract', () => {
  test('captures menu, options, play, and pause from runtime diagnostics', () => {
    const source = readFileSync(resolve(process.cwd(), 'scripts/analysis/capture-ui-surfaces.mjs'), 'utf8');
    const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'));

    expect(packageJson.scripts['visual:ui-surfaces']).toBe('node ./scripts/analysis/capture-ui-surfaces.mjs');
    expect(source).toContain("const RUNTIME_DIAGNOSTICS_ATTRIBUTE = 'data-mazer-runtime-diagnostics';");
    expect(source).toContain("const VISUAL_DIAGNOSTICS_ATTRIBUTE = 'data-mazer-visual-diagnostics';");
    expect(source).toContain("id: '01-menu'");
    expect(source).toContain("id: '02-options'");
    expect(source).toContain("id: '03-play'");
    expect(source).toContain("id: '04-pause'");
    expect(source).toContain("mode: 'menu'");
    expect(source).toContain("mode: 'play'");
    expect(source).toContain("overlay: 'none'");
    expect(source).toContain("overlay: 'options'");
    expect(source).toContain("overlay: 'pause'");
    expect(source).toContain("expectedLabels: ['Exit', 'Start', 'Options']");
    expect(source).toContain("expectedLabels: ['Paused', 'Game Toggles', 'Move Speed', 'Back', 'Reset', 'Main Menu']");
    expect(source).toContain("url.searchParams.set('mazeSeed', mazeSeed);");
    expect(source).toContain("url.searchParams.set('pathStyle', pathStyle);");
    expect(source).toContain('const checks = buildSurfaceChecks({');
    expect(source).toContain("createCheck(\n      'play-player-green'");
    expect(source).toContain("createCheck(\n      'play-goal-red'");
    expect(source).toContain("createCheck(\n      'play-stick-controls'");
    expect(source).toContain("createCheck(\n      'menu-text-labels'");
    expect(source).toContain("hasLabels(surfaces.options, ['Options', 'Maze Scale', 'Camera Scale', 'Game Toggles', 'Move Speed', 'Back'])");
    expect(source).toContain("hasLabels(surfaces.pause, ['Paused', 'Game Toggles', 'Move Speed', 'Back', 'Reset', 'Main Menu'])");
    expect(source).toContain('const reportPath = resolve(outputDir, \'report.md\');');
    expect(source).toContain('![Menu](${summary.screenshots.menu})');
  });
});
