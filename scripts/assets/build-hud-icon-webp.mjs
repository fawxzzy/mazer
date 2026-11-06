// Regenerates public/assets/hud/hud-*.webp (the shipped HUD icons) from the
// original 1254x1254 PNG sources catalogued in docs/assets/mazer-vfx-source-provenance.md.
//
// Usage: node scripts/assets/build-hud-icon-webp.mjs --source-dir <dir with hud-*.png> [--check]
//
// The sources are no longer in the working tree (boot payload diet, 2026-11-06); recover them with
//   git show a58395ee:public/assets/hud/hud-<name>.png > <dir>/hud-<name>.png
// Each source is verified against its pinned SHA-256 before anything is written.
//
// The transform is render-identical, not merely "visually close":
//   1. MenuScene.applyLegacyHudIconFrame only ever draws the crop (bboxX, bboxY, bboxWidth, bboxHeight)
//      (the alpha > 1 bounds), so every pixel outside that crop is cleared;
//   2. RGB under alpha == 0 is never visible, so it is cleared (this is what makes the file compress);
//   3. the result is encoded as LOSSLESS WebP. Canvas/Phaser draw straight from the decoded bitmap.
// The canvas stays 1254x1254 because the crop constants in MenuScene.ts are in source pixels.
// tests/architecture/boot-payload-budget.test.ts re-derives the bounds from the shipped files and
// compares them to the constants in MenuScene.ts.
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export const HUD_ICON_SOURCES = Object.freeze({
  'hud-profile': {
    sha256: 'f3b6ecb436711083b62ac3d3b0706e884da6432c5dd2887a9c94e0c519fd1e37',
    crop: { x: 320, y: 268, width: 615, height: 729 }
  },
  'hud-leaderboard': {
    sha256: '5e1f6ab3707c0fb7429b46b6e32eb06fc44bd384c3d3a864a6429140efc0096a',
    crop: { x: 281, y: 359, width: 692, height: 524 }
  },
  'hud-settings': {
    sha256: '7912689b5935acbc9617222fe301cfd27830fdb658dbe59f342988271b5b4acc',
    crop: { x: 221, y: 204, width: 807, height: 828 }
  }
});

export const buildHudIconWebp = async (sourcePng, crop) => {
  const { data, info } = await sharp(sourcePng, { failOn: 'error' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.channels !== 4) {
    throw new Error(`expected RGBA, got ${info.channels} channels`);
  }
  const { width, height } = info;
  const out = Buffer.from(data);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const inside = x >= crop.x && x < crop.x + crop.width && y >= crop.y && y < crop.y + crop.height;
      if (!inside || out[offset + 3] === 0) {
        out[offset] = 0;
        out[offset + 1] = 0;
        out[offset + 2] = 0;
        out[offset + 3] = 0;
      }
    }
  }
  return sharp(out, { raw: { width, height, channels: 4 } })
    .webp({ lossless: true, effort: 6, exact: true })
    .toBuffer();
};

const main = async () => {
  const args = process.argv.slice(2);
  const sourceIndex = args.indexOf('--source-dir');
  if (sourceIndex < 0 || !args[sourceIndex + 1]) {
    throw new Error('--source-dir <dir containing hud-profile.png, hud-leaderboard.png, hud-settings.png> is required');
  }
  const sourceDir = resolve(args[sourceIndex + 1]);
  const check = args.includes('--check');
  let failed = false;
  for (const [name, { sha256, crop }] of Object.entries(HUD_ICON_SOURCES)) {
    const source = await readFile(resolve(sourceDir, `${name}.png`));
    const digest = createHash('sha256').update(source).digest('hex');
    if (digest !== sha256) {
      throw new Error(`${name}.png source SHA-256 ${digest} does not match the pinned ${sha256}`);
    }
    const webp = await buildHudIconWebp(source, crop);
    const target = resolve(REPO_ROOT, 'public/assets/hud', `${name}.webp`);
    if (check) {
      const current = await readFile(target).catch(() => null);
      const same = current !== null && Buffer.compare(current, webp) === 0;
      console.log(`${same ? 'ok' : 'DIFFERS'} ${name}.webp (${webp.length} bytes)`);
      failed ||= !same;
    } else {
      await writeFile(target, webp);
      console.log(`wrote ${name}.webp (${webp.length} bytes, source ${source.length})`);
    }
  }
  if (failed) {
    process.exitCode = 1;
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
