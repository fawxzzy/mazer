// Regenerates public/share/mazer-share-preview.png (1200x630, the Open Graph /
// Twitter large-card size) from the REAL game: a headless capture of the
// sandboxed Level Preview route (?previewLevel=N, no account writes, never
// install-gated) at desktop size, cropped to a clean board, plus a wordmark.
// The image lives in public/share (NOT public/assets, which is pinned to the
// boot preload set, and NOT in vite includeAssets, so it adds no precache).
//
// NOTE: the maze is generated per page load (no seed query param exists), so each
// run yields a different, equally real board; the committed PNG is one such run.
//
// Usage: npm run dev -- --host 127.0.0.1 --port <port> --strictPort   (other shell)
//        node scripts/brand/generate-share-preview.mjs --base-url=http://127.0.0.1:<port> [--level=30]
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import sharp from 'sharp';

export const SHARE_PREVIEW_WIDTH = 1200;
export const SHARE_PREVIEW_HEIGHT = 630;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUTPUT = resolve(ROOT, 'public', 'share', 'mazer-share-preview.png');

const arg = (name, fallback) => {
  const hit = process.argv.slice(2).find((value) => value.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const baseUrl = arg('base-url', 'http://127.0.0.1:4173');
const level = Number.parseInt(arg('level', '30'), 10);
const settleMs = Number.parseInt(arg('settle-ms', '20000'), 10);

const wordmarkSvg = `<svg width="${SHARE_PREVIEW_WIDTH}" height="${SHARE_PREVIEW_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#02080f" stop-opacity="0"/>
      <stop offset="1" stop-color="#02080f" stop-opacity="0.92"/>
    </linearGradient>
  </defs>
  <rect x="0" y="390" width="${SHARE_PREVIEW_WIDTH}" height="240" fill="url(#fade)"/>
  <text x="64" y="560" font-family="Arial, Helvetica, sans-serif" font-size="120" font-weight="700" letter-spacing="30" fill="#3ddbd4">MAZER</text>
  <text x="68" y="600" font-family="Arial, Helvetica, sans-serif" font-size="30" fill="#d7fff8">A maze game for your phone</text>
</svg>`;

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(new URL(`/?previewLevel=${level}`, baseUrl).toString(), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(settleMs);
  const frame = await page.screenshot({ type: 'png' });
  const resized = await sharp(frame)
    // 1:1 crop (no scaling blur) that drops the corner settings gear at the top
    // and leaves the "preview" caption under the wordmark gradient.
    .extract({ left: 40, top: 30, width: SHARE_PREVIEW_WIDTH, height: SHARE_PREVIEW_HEIGHT })
    .composite([{ input: Buffer.from(wordmarkSvg), top: 0, left: 0 }])
    .png({ compressionLevel: 9, palette: true, quality: 90 })
    .toBuffer();
  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, resized);
  console.log(`wrote ${OUTPUT} (${resized.length} bytes, level ${level})`);
} finally {
  await browser.close();
}
