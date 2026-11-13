// Regenerates public/share/mazer-share-preview.png (1200x630, the Open Graph / Twitter large-card size)
// from the ONE Mazer app image (src/brand/source-art/mazer-app-icon-master.png, the FawxzzyWeb site's
// Mazer icon; docs/ops/MAZER-APP-IMAGE-SOURCE-2026-11-13.md). Deterministic: sharp only, no browser, no
// network, no text (so no system-font drift): the app image centred on the brand background with a soft
// teal glow. `--check` compares against the checked-in file instead of writing.
//
// The image lives in public/share (NOT public/assets, which is pinned to the boot preload set, and NOT in
// vite includeAssets, so it adds no precache).
//
// Usage: node scripts/brand/generate-share-preview.mjs [--check]
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

export const SHARE_PREVIEW_WIDTH = 1200;
export const SHARE_PREVIEW_HEIGHT = 630;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MASTER_PATH = resolve(ROOT, 'src', 'brand', 'source-art', 'mazer-app-icon-master.png');
const OUTPUT_RELATIVE = 'public/share/mazer-share-preview.png';
const OUTPUT = resolve(ROOT, OUTPUT_RELATIVE);

const BACKGROUND = '#02080f';
const ICON_SIZE = 470;
// The master is a rounded art frame on a black surround; crop the surround (measured: 41 px on each side of
// the 1024 master) and round the corners so the card shows the art, not a black square.
const MASTER_ART_MARGIN = 41;
const MASTER_SIZE = 1024;
const ICON_CORNER_RATIO = 0.2;

const backdropSvg = `<svg width="${SHARE_PREVIEW_WIDTH}" height="${SHARE_PREVIEW_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="glow" cx="50%" cy="50%" r="55%">
      <stop offset="0" stop-color="#3ddbd4" stop-opacity="0.34"/>
      <stop offset="0.45" stop-color="#3ddbd4" stop-opacity="0.1"/>
      <stop offset="1" stop-color="#3ddbd4" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="100%" height="100%" fill="${BACKGROUND}"/>
  <rect width="100%" height="100%" fill="url(#glow)"/>
</svg>`;

const roundedMask = (size) => Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${Math.round(size * ICON_CORNER_RATIO)}" fill="#fff"/></svg>`
);

export const renderSharePreview = async (master) => {
  const crop = MASTER_SIZE - (MASTER_ART_MARGIN * 2);
  const icon = await sharp(master)
    .extract({ height: crop, left: MASTER_ART_MARGIN, top: MASTER_ART_MARGIN, width: crop })
    .resize({ fit: 'fill', height: ICON_SIZE, kernel: sharp.kernel.lanczos3, width: ICON_SIZE })
    .ensureAlpha()
    .composite([{ blend: 'dest-in', input: roundedMask(ICON_SIZE) }])
    .png()
    .toBuffer();
  return sharp(Buffer.from(backdropSvg))
    .composite([{
      input: icon,
      left: Math.round((SHARE_PREVIEW_WIDTH - ICON_SIZE) / 2),
      top: Math.round((SHARE_PREVIEW_HEIGHT - ICON_SIZE) / 2)
    }])
    .removeAlpha()
    .png({ colours: 128, compressionLevel: 9, effort: 10, palette: true, quality: 92 })
    .toBuffer();
};

const main = async () => {
  const payload = await renderSharePreview(await readFile(MASTER_PATH));
  if (process.argv.includes('--check')) {
    const actual = await readFile(OUTPUT).catch(() => null);
    if (!actual || !actual.equals(payload)) throw new Error(`${OUTPUT_RELATIVE} is stale or missing; run node scripts/brand/generate-share-preview.mjs`);
    console.log(`${OUTPUT_RELATIVE} is current (${payload.length} bytes)`);
    return;
  }
  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, payload);
  console.log(`wrote ${OUTPUT_RELATIVE} (${payload.length} bytes)`);
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
