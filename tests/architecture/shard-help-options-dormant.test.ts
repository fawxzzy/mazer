/**
 * The endless-shards options page (shard-options.html) and the Help-tab options page (help-options.html) are dev/proposal
 * pages: neither is a build input and nothing the game ships imports their code. Their stylesheets hold no colour literal
 * (colours come from the tokens and the board palette), so the off-theme ratchet stays at zero. The shard geometry helper
 * quotes the game's own schedule instead of retyping it.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, test } from 'vitest';
import { GOAL_STAR_INNER, GOAL_STAR_OUTER, pipModel, polygonCss, shardFactAt, sparkKitePoints, starPoints } from '../../src/ui/optionsPages/optionsGeometry';
import { HELP_ICON_IDS, HELP_ICON_SOURCES } from '../../src/ui/helpOptions/helpIcons';
import { BUTTON_ICON_IDS } from '../../src/render/buttonIcons';

const ROOT = join(__dirname, '..', '..');
const OWN_DIRS = ['optionsPages', 'shardOptions', 'helpOptions'].map((name) => join('src', 'ui', name) + sep);
const PAGES: ReadonlyArray<{ html: string; entry: string }> = [
  { html: 'shard-options.html', entry: '/src/ui/shardOptions/shardOptionsMain.ts' },
  { html: 'help-options.html', entry: '/src/ui/helpOptions/helpOptionsMain.ts' }
];

const walk = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? walk(path) : [path];
});

describe('shard and Help options pages stay out of the game', () => {
  test('neither page is a vite build input; each boots its own entry and is noindex', () => {
    const vite = readFileSync(join(ROOT, 'vite.config.ts'), 'utf8');
    for (const page of PAGES) {
      expect(vite).not.toMatch(new RegExp(page.html.replace('.', '\.')));
      const html = readFileSync(join(ROOT, page.html), 'utf8');
      expect(html).toContain(page.entry);
      expect(html).toContain('name="robots" content="noindex"');
    }
  });

  test('no game source imports the page code', () => {
    const offenders = walk(join(ROOT, 'src'))
      .filter((path) => /\.(ts|tsx|js|mjs)$/.test(path))
      .map((path) => relative(ROOT, path))
      .filter((rel) => !OWN_DIRS.some((dir) => rel.startsWith(dir)))
      .filter((rel) => /(optionsPages|shardOptions|helpOptions)\//.test(readFileSync(join(ROOT, rel), 'utf8')));
    expect(offenders).toEqual([]);
  });

  test('the stylesheets have no colour literal', () => {
    for (const file of [
      join('src', 'ui', 'optionsPages', 'optionsKit.css'),
      join('src', 'ui', 'shardOptions', 'shardOptions.css'),
      join('src', 'ui', 'helpOptions', 'helpOptions.css')
    ]) {
      const css = readFileSync(join(ROOT, file), 'utf8');
      expect(css, file).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(css, file).not.toMatch(/\brgba?\(|\bhsla?\(/);
    }
  });
});

describe('options geometry quotes the game', () => {
  test('shard schedule: none before L60, one at L60, strict route target from saturation', () => {
    expect(shardFactAt(59).shards).toBe(0);
    expect(shardFactAt(60).shards).toBe(1);
    expect(shardFactAt(288).target).toBe(160);
    expect(shardFactAt(338).target).toBe(160 + 2 * 50);
    expect(shardFactAt(338).shards).toBe(shardFactAt(288).shards + 1);
  });

  test('end star keeps the game proportions and the kite points right', () => {
    const star = starPoints(5, GOAL_STAR_OUTER, GOAL_STAR_INNER);
    expect(star).toHaveLength(10);
    expect(Math.hypot(star[0]!.x - 0.5, star[0]!.y - 0.5)).toBeCloseTo(GOAL_STAR_OUTER * 0.5, 6);
    expect(Math.hypot(star[1]!.x - 0.5, star[1]!.y - 0.5)).toBeCloseTo(GOAL_STAR_INNER * 0.5, 6);
    expect(sparkKitePoints()[0]!.x).toBeGreaterThan(0.5);
    expect(polygonCss([{ x: 0, y: 0 }, { x: 1, y: 0.5 }, { x: 0, y: 1 }])).toBe('polygon(0% 0%, 100% 50%, 0% 100%)');
  });

  test('pip model collapses to a count when there are too many pips', () => {
    expect(pipModel(3, 1, 8)).toEqual({ pips: ['collected', 'next', 'later'], label: '1 / 3' });
    expect(pipModel(35, 12, 8)).toEqual({ pips: null, label: '12 / 35' });
  });

  test('Help candidate icons do not shadow a shipped icon id and have a body and a spark', () => {
    for (const id of HELP_ICON_IDS) {
      expect(BUTTON_ICON_IDS as readonly string[]).not.toContain(id);
      expect(HELP_ICON_SOURCES[id].body.length).toBeGreaterThan(0);
      expect(HELP_ICON_SOURCES[id].sparks.length).toBeGreaterThan(0);
    }
  });
});
