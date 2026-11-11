// Generates public/splash/ios-*.png from the canonical icon master and the brand background (#02080f,
// the same colour as the boot splash and manifest background_color). Deterministic; `--check` compares
// against the checked-in files. `--tags` prints the <link> block pasted into index.html.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import {
  IOS_LAUNCH_ART_DEVICES,
  IOS_LAUNCH_ART_DIR,
  launchArtFileName,
  launchArtLinkTag,
  launchArtPixels
} from './ios-launch-art-devices.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MASTER_PATH = resolve(REPO_ROOT, 'src/brand/source-art/mazer-app-icon-master.png');
const BACKGROUND = { r: 0x02, g: 0x08, b: 0x0f };
const ICON_WIDTH_RATIO = 0.3;
const ICON_CORNER_RATIO = 0.2237;

const roundedMask = (size) => Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${Math.round(size * ICON_CORNER_RATIO)}" fill="#fff"/></svg>`
);

const render = async (master, device) => {
  const { width, height } = launchArtPixels(device);
  const iconSize = Math.round(width * ICON_WIDTH_RATIO);
  const icon = await sharp(master)
    .resize({ width: iconSize, height: iconSize, fit: 'fill', kernel: sharp.kernel.lanczos3 })
    .ensureAlpha()
    .composite([{ input: roundedMask(iconSize), blend: 'dest-in' }])
    .png()
    .toBuffer();
  return sharp({ create: { width, height, channels: 3, background: BACKGROUND } })
    .composite([{ input: icon, left: Math.round((width - iconSize) / 2), top: Math.round((height - iconSize) / 2) }])
    .png({ palette: true, quality: 90, colours: 64, effort: 10, compressionLevel: 9, adaptiveFiltering: false })
    .toBuffer();
};

const main = async () => {
  const args = new Set(process.argv.slice(2));
  if (args.has('--tags')) {
    console.log(IOS_LAUNCH_ART_DEVICES.map(launchArtLinkTag).join('\n'));
    return;
  }
  const master = await readFile(MASTER_PATH);
  const stale = [];
  for (const device of IOS_LAUNCH_ART_DEVICES) {
    const relative = `${IOS_LAUNCH_ART_DIR}/${launchArtFileName(device)}`;
    const payload = await render(master, device);
    const target = resolve(REPO_ROOT, relative);
    if (args.has('--check')) {
      const actual = await readFile(target).catch(() => null);
      if (!actual || !actual.equals(payload)) stale.push(relative);
    } else {
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, payload);
      console.log(`${relative} ${payload.length} bytes`);
    }
  }
  if (stale.length > 0) throw new Error(`Launch art is stale or missing: ${stale.join(', ')}`);
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
