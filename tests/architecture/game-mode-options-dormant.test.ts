/**
 * The game-mode selector options page (game-mode-options.html) is a dev/proposal page: it is not a build input and
 * nothing the game ships imports its code. Its stylesheet holds no colour literal (colours come from the tokens and the
 * board palette), so the off-theme ratchet stays at zero.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, test } from 'vitest';
import { GAME_MODE_SAMPLES } from '../../src/ui/gameModeOptions/gameModeData';
import { LEGACY_GAME_MODES } from '../../src/legacy-runtime/legacyGameModes';

const ROOT = join(__dirname, '..', '..');
const OWN = join('src', 'ui', 'gameModeOptions') + sep;

const walk = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? walk(path) : [path];
});

describe('game-mode selector options page stays out of the game', () => {
  test('the page is not a vite build input and boots its own entry', () => {
    expect(readFileSync(join(ROOT, 'vite.config.ts'), 'utf8')).not.toMatch(/game-mode-options/);
    const html = readFileSync(join(ROOT, 'game-mode-options.html'), 'utf8');
    expect(html).toContain('/src/ui/gameModeOptions/gameModeOptionsMain.ts');
    expect(html).toContain('name="robots" content="noindex"');
  });

  test('no game source imports the page code', () => {
    const offenders = walk(join(ROOT, 'src'))
      .filter((path) => /\.(ts|tsx|js|mjs)$/.test(path))
      .map((path) => relative(ROOT, path))
      .filter((rel) => !rel.startsWith(OWN))
      .filter((rel) => /gameModeOptions\//.test(readFileSync(join(ROOT, rel), 'utf8')));
    expect(offenders).toEqual([]);
  });

  test('the stylesheet has no colour literal', () => {
    const css = readFileSync(join(ROOT, 'src', 'ui', 'gameModeOptions', 'gameModeOptions.css'), 'utf8');
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).not.toMatch(/\brgba?\(|\bhsla?\(/);
  });

  test('samples: Endless is the real registered mode, the rest are locked, every art row has the same width', () => {
    expect(GAME_MODE_SAMPLES[0]!.id).toBe(LEGACY_GAME_MODES[0]!.id);
    expect(GAME_MODE_SAMPLES.filter((m) => m.playable).map((m) => m.id)).toEqual(['endless']);
    expect(GAME_MODE_SAMPLES.length).toBeGreaterThanOrEqual(4);
    for (const mode of GAME_MODE_SAMPLES) {
      expect(new Set(mode.art.map((row) => row.length)).size).toBe(1);
      expect(mode.art.join('')).toMatch(/S/);
      expect(mode.art.join('')).toMatch(/E/);
    }
  });
});
