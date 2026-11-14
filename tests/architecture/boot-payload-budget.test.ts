import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { HUD_ICON_ATLAS_PUBLIC_URL } from '../../src/render/hudIconAtlas';

// Boot payload budget (2026-11-06 PNG diet). Mazer is a PWA played on phones: everything BootScene
// preloads is on the first-load critical path, and everything the build copies out of public/ lands
// in dist (and, via vite.config.ts includeAssets, the service-worker precache). Before the diet the
// boot preloaded ~3.5 MB of PNGs that nothing drew (starfield tile, floor tile, bleed strip, player
// trail) and shipped 5 MB of goal-star reference frames that nothing loaded. This file pins the
// result so it cannot silently regrow: raise a budget only with a consumer and a reason.

const root = process.cwd();
const read = (path: string): string => readFileSync(resolve(root, path), 'utf8').replace(/\r\n/g, '\n');
const sizeOf = (path: string): number => statSync(resolve(root, path)).size;

const bootSource = read('src/scenes/BootScene.ts');
const menuSource = read('src/scenes/MenuScene.ts');

// Measured 2026-11-06 after the diet: 1,050,310 B across 5 preloaded files. Measured 2026-11-14 after MAZER-VIS-011 (the three
// 1254 px HUD bitmaps became one 5.8 KB outline-icon atlas): 36,646 B across 3 preloaded files. ~60% headroom.
const BOOT_PRELOAD_BUDGET_BYTES = 60_000;
const BOOT_PRELOAD_SINGLE_FILE_BUDGET_BYTES = 40_000;
// public/assets is exactly the boot preload set (see the "no unreferenced weight" test): now the one HUD icon atlas.
const PUBLIC_ASSETS_BUDGET_BYTES = 100_000;
// Measured 2026-11-13 after MAZER-VIS-039 (the site's pixel-art Mazer image became the one app icon): 1,740,528 B (was 2,257,957 B on
// 2026-11-11, 2,681,017 B on 2026-11-06) of icons/favicons/font listed in vite.config.ts includeAssets (precached, not on the boot
// network path). Regenerate with scripts/brand/generate-mazer-icons.mjs; the budget follows the measurement down.
const PRECACHE_INCLUDE_ASSETS_BUDGET_BYTES = 1_800_000;

const BOOT_CACHE_BUST = /const MAZER_VFX_ASSET_CACHE_BUST = '([^']+)';/.exec(bootSource)?.[1] ?? '';

interface BootPreload {
  kind: string;
  url: string;
  publicPath: string;
}

/** Every `this.load.<kind>(KEY, URL)` URL in BootScene.preload(), resolved to a public/ path. */
const resolveBootPreloads = (): BootPreload[] => {
  const constants = new Map<string, string>();
  for (const match of bootSource.matchAll(/const (MAZER_[A-Z_]+_URL) = '([^']+)';/g)) {
    constants.set(match[1], match[2]);
  }
  const preloads: BootPreload[] = [];
  for (const match of bootSource.matchAll(/this\.load\.(\w+)\(\s*[A-Z_]+\s*,\s*(`[^`]*`|[A-Z_]+|'[^']*')\s*\)/g)) {
    let url = match[2];
    if (url.startsWith('`')) {
      url = url.slice(1, -1).replace('${MAZER_VFX_ASSET_CACHE_BUST}', BOOT_CACHE_BUST)
      .replace('${HUD_ICON_ATLAS_PUBLIC_URL}', HUD_ICON_ATLAS_PUBLIC_URL);
    } else if (url.startsWith("'")) {
      url = url.slice(1, -1);
    } else {
      url = constants.get(url) ?? `UNRESOLVED:${url}`;
    }
    const path = url.split('?')[0].replace(/^\//, '');
    preloads.push({ kind: match[1], url, publicPath: `public/${path}` });
  }
  return preloads;
};

const walk = (dir: string): string[] => readdirSync(resolve(root, dir), { withFileTypes: true }).flatMap((entry) => (
  entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name).replace(/\\/g, '/')]
));

describe('boot preload list', () => {
  const preloads = resolveBootPreloads();

  test('is the tile-font atlas (+ JSON) and the one HUD icon atlas, and nothing unresolved', () => {
    expect(preloads.some((entry) => entry.url.startsWith('UNRESOLVED'))).toBe(false);
    expect(preloads.map((entry) => entry.publicPath).sort()).toEqual([
      'public/assets/hud/hud-icons.webp',
      'public/fonts/mazer-tile-font/mazer-font-atlas-mask.png',
      'public/fonts/mazer-tile-font/mazer-font-atlas.json'
    ]);
  });

  test('every preload exists on disk (no 404 at boot)', () => {
    for (const { publicPath } of preloads) {
      expect(existsSync(resolve(root, publicPath)), publicPath).toBe(true);
    }
  });

  test(`total preload bytes stay within ${BOOT_PRELOAD_BUDGET_BYTES} and no single file within ${BOOT_PRELOAD_SINGLE_FILE_BUDGET_BYTES}`, () => {
    const total = preloads.reduce((sum, { publicPath }) => sum + sizeOf(publicPath), 0);
    expect(total).toBeLessThanOrEqual(BOOT_PRELOAD_BUDGET_BYTES);
    for (const { publicPath } of preloads) {
      expect(sizeOf(publicPath), publicPath).toBeLessThanOrEqual(BOOT_PRELOAD_SINGLE_FILE_BUDGET_BYTES);
    }
  });

  test('raster preloads are WebP or a tiny PNG, never a bare multi-hundred-KB PNG', () => {
    for (const { kind, publicPath } of preloads) {
      if (kind === 'image' && publicPath.endsWith('.png')) {
        expect(sizeOf(publicPath), publicPath).toBeLessThanOrEqual(16_000);
      }
    }
  });
});

describe('public/assets carries no unreferenced weight', () => {
  const preloaded = new Set(resolveBootPreloads().map((entry) => entry.publicPath));

  test('every file under public/assets is preloaded by BootScene', () => {
    const unreferenced = walk('public/assets').filter((file) => !preloaded.has(file));
    // Delete it, or preload it with a consumer and a budget line.
    expect(unreferenced).toEqual([]);
  });

  test(`public/assets stays under ${PUBLIC_ASSETS_BUDGET_BYTES} bytes`, () => {
    const total = walk('public/assets').reduce((sum, file) => sum + sizeOf(file), 0);
    expect(total).toBeLessThanOrEqual(PUBLIC_ASSETS_BUDGET_BYTES);
  });

  test('the retired art stays gone (starfield, floor tile, bleed strip, trail, goal-star frames, diamonds, old HUD PNGs and their 1254 px WebP derivatives)', () => {
    for (const retired of [
      'public/assets/vfx',
      'public/assets/tiles',
      'public/assets/hud/hud-profile.png',
      'public/assets/hud/hud-leaderboard.png',
      'public/assets/hud/hud-settings.png',
      'public/assets/hud/hud-profile.webp',
      'public/assets/hud/hud-leaderboard.webp',
      'public/assets/hud/hud-settings.webp'
    ]) {
      expect(existsSync(resolve(root, retired)), retired).toBe(false);
    }
  });
});

describe('service-worker precache assets', () => {
  const viteConfig = read('vite.config.ts');
  const includeAssets = [...(/includeAssets:\s*\[([\s\S]*?)\]/.exec(viteConfig)?.[1] ?? '').matchAll(/'([^']+)'/g)].map((match) => match[1]);

  test('every includeAssets entry exists in public/', () => {
    expect(includeAssets.length).toBeGreaterThan(0);
    for (const asset of includeAssets) {
      expect(existsSync(resolve(root, 'public', asset)), asset).toBe(true);
    }
  });

  test(`explicit precache assets stay under ${PRECACHE_INCLUDE_ASSETS_BUDGET_BYTES} bytes`, () => {
    const total = includeAssets.reduce((sum, asset) => sum + sizeOf(`public/${asset}`), 0);
    expect(total).toBeLessThanOrEqual(PRECACHE_INCLUDE_ASSETS_BUDGET_BYTES);
  });

  test('no raster art from public/assets sneaks into the precache', () => {
    expect(includeAssets.filter((asset) => asset.startsWith('assets/'))).toEqual([]);
  });
});

describe('BootScene preloads only what the first frame draws', () => {
  test('keeps no texture key or generator for the retired art', () => {
    // Comments may name the retired art; code may not.
    const code = bootSource.replace(/^\s*\/\/.*$/gm, '');
    for (const needle of [
      'MAZER_STARFIELD_TEXTURE_KEY',
      'MAZER_FLOOR_TILE_TEXTURE_KEY',
      'MAZER_FLOOR_TILE_INTERIOR',
      'MAZER_BLEED_PATH_TEXTURE_KEY',
      'MAZER_PLAYER_TRAIL_TEXTURE_KEY',
      'generateMazerFloorTileInteriorTexture',
      'isMazerFloorTileInteriorTextureAvailable',
      'mazer-floor-tile',
      'mazer-bleed-path-strip',
      'mazer-player-trail',
      'mazer-starfield-tile',
      'goal-star',
      'assets/vfx',
      'assets/tiles'
    ]) {
      expect(code, needle).not.toContain(needle);
    }
  });

  test('MenuScene never requests the retired textures', () => {
    expect(menuSource).not.toContain('floorTileTextureKey');
    expect(menuSource).not.toContain('tileSprite(');
    for (const key of [
      'mazerStarfieldTile',
      'mazerFloorTile',
      'mazerBleedPathStrip',
      'mazerPlayerTrail',
      'MAZER_FLOOR_TILE_INTERIOR_TEXTURE_KEY',
      'MAZER_FLOOR_TILE_TEXTURE_KEY',
      'MAZER_BLEED_PATH_TEXTURE_KEY',
      'MAZER_PLAYER_TRAIL_TEXTURE_KEY',
      'MAZER_STARFIELD_TEXTURE_KEY'
    ]) {
      expect(menuSource, key).not.toContain(key);
    }
  });

  test('draws the board through the baked tile layer instead', () => {
    expect(menuSource).toContain('new BoardTileLayer(this, this.boardTileLayerTextureKey)');
  });
});
