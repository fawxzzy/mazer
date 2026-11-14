// Regenerates public/assets/hud/hud-icons.webp: ONE small atlas of one outline icon family
// (MAZER-VIS-011), drawn from the scripted vector geometry below. It replaces the three 1254 px
// AI-style bitmaps (hud-profile / hud-leaderboard / hud-settings, 1,019,276 B lossless WebP, three
// different styles and glow treatments, shown at under 25 px). The glyphs are white on transparent;
// BootScene tints them to a design token when it derives the textures MenuScene draws.
//
// Usage: node scripts/assets/build-hud-icon-atlas.mjs [--check]
//   --check   re-render and compare decoded pixels with the shipped file (exit 1 on a difference)
//
// Layout contract (mirrored by src/render/hudIconAtlas.ts; tests/architecture/hud-icon-atlas.test.ts
// keeps the two in sync): a grid of HUD_ICON_ATLAS_COLUMNS columns of HUD_ICON_CELL_PX square cells,
// filled in HUD_ICON_GLYPHS order. Every glyph is drawn inside the same HUD_ICON_GLYPH_BOX (the cell
// minus a 16 px margin) with the same stroke width, caps and joins, so they share one optical size.
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const HUD_ICON_ATLAS_PUBLIC_PATH = 'public/assets/hud/hud-icons.webp';

export const HUD_ICON_CELL_PX = 128;
export const HUD_ICON_ATLAS_COLUMNS = 4;
export const HUD_ICON_STROKE_PX = 8;
export const HUD_ICON_GLYPH_BOX = Object.freeze({ x: 16, y: 16, width: 96, height: 96 });

const round = (value) => Math.round(value * 100) / 100;

/** Gear outline: `teeth` trapezoid teeth between rootRadius and tipRadius, centred on (64, 64). */
const gearPath = (teeth, tipRadius, rootRadius) => {
  const points = [];
  const step = (Math.PI * 2) / teeth;
  for (let index = 0; index < teeth; index += 1) {
    const centre = (index * step) - (Math.PI / 2);
    // root, tip, tip, root across one tooth: the tip spans 48% of the pitch (offsets are fractions of it).
    for (const [offset, radius] of [[-0.5, rootRadius], [-0.24, tipRadius], [0.24, tipRadius], [0.5, rootRadius]]) {
      const angle = centre + (offset * step);
      points.push(`${round(64 + (Math.cos(angle) * radius))} ${round(64 + (Math.sin(angle) * radius))}`);
    }
  }
  return `M${points[0]} L${points.slice(1).join(' L')} Z`;
};

// Each entry is SVG body in a 128 x 128 cell, stroked white (fill none).
export const HUD_ICON_GLYPHS = Object.freeze([
  ['profile', '<circle cx="64" cy="44" r="20"/><path d="M24 108 C24 84 42 72 64 72 C86 72 104 84 104 108"/>'],
  ['leaderboard', '<rect x="20" y="64" width="16" height="44" rx="3"/><rect x="56" y="20" width="16" height="88" rx="3"/><rect x="92" y="80" width="16" height="28" rx="3"/>'],
  ['settings', `<path d="${gearPath(8, 44, 34)}"/><circle cx="64" cy="64" r="14"/>`],
  ['close', '<path d="M30 30 L98 98 M98 30 L30 98"/>'],
  ['check', '<path d="M22 66 L50 94 L106 34"/>'],
  ['info', '<circle cx="64" cy="64" r="44"/><path d="M64 58 L64 90"/><path d="M64 39 L64 39"/>'],
  ['share', '<circle cx="32" cy="64" r="12"/><circle cx="96" cy="32" r="12"/><circle cx="96" cy="96" r="12"/><path d="M44 58 L84 38 M44 70 L84 90"/>'],
  ['install', '<path d="M64 20 L64 78 M40 56 L64 80 L88 56"/><path d="M24 92 L24 108 L104 108 L104 92"/>']
]);

export const hudIconAtlasSize = () => ({
  width: HUD_ICON_ATLAS_COLUMNS * HUD_ICON_CELL_PX,
  height: Math.ceil(HUD_ICON_GLYPHS.length / HUD_ICON_ATLAS_COLUMNS) * HUD_ICON_CELL_PX
});

export const hudIconAtlasSvg = () => {
  const { width, height } = hudIconAtlasSize();
  const cells = HUD_ICON_GLYPHS.map(([, body], index) => {
    const x = (index % HUD_ICON_ATLAS_COLUMNS) * HUD_ICON_CELL_PX;
    const y = Math.floor(index / HUD_ICON_ATLAS_COLUMNS) * HUD_ICON_CELL_PX;
    return `<g transform="translate(${x} ${y})">${body}</g>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><g fill="none" stroke="#ffffff" stroke-width="${HUD_ICON_STROKE_PX}" stroke-linecap="round" stroke-linejoin="round">${cells}</g></svg>`;
};

export const buildHudIconAtlasWebp = async () => sharp(Buffer.from(hudIconAtlasSvg()), { density: 72 })
  .ensureAlpha()
  .webp({ lossless: true, effort: 6 })
  .toBuffer();

const main = async () => {
  const webp = await buildHudIconAtlasWebp();
  const target = resolve(REPO_ROOT, HUD_ICON_ATLAS_PUBLIC_PATH);
  if (process.argv.includes('--check')) {
    const current = await readFile(target).catch(() => null);
    if (current === null) {
      console.log(`MISSING ${HUD_ICON_ATLAS_PUBLIC_PATH}`);
      process.exitCode = 1;
      return;
    }
    const [a, b] = await Promise.all([
      sharp(current).ensureAlpha().raw().toBuffer(),
      sharp(webp).ensureAlpha().raw().toBuffer()
    ]);
    const same = Buffer.compare(a, b) === 0;
    console.log(`${same ? 'ok' : 'DIFFERS'} ${HUD_ICON_ATLAS_PUBLIC_PATH} (${current.length} bytes)`);
    process.exitCode = same ? 0 : 1;
    return;
  }
  await writeFile(target, webp);
  console.log(`wrote ${HUD_ICON_ATLAS_PUBLIC_PATH} (${webp.length} bytes, ${HUD_ICON_GLYPHS.length} glyphs)`);
};

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
