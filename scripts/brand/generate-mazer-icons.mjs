import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MASTER_RELATIVE_PATH = 'src/brand/source-art/mazer-app-icon-master.png';
const MASTER_PATH = resolve(REPO_ROOT, MASTER_RELATIVE_PATH);
// The master is the FawxzzyWeb site's Mazer app image, copied byte-for-byte (see
// docs/ops/MAZER-APP-IMAGE-SOURCE-2026-11-13.md: source path, sha256, and how to re-sync).
const MASTER_SHA256 = '91764e546b8c1488b3d48baeda927ae18600b088178e190244fb9d8ce35e2440';
const MASTER_BYTES = 934_398;
const MASTER_SIZE = 1024;
const MASKABLE_SAFE_DIAMETER_RATIO = 0.8;
// The master is an opaque square: a rounded art frame on a black surround. Pixels dimmer than this channel
// value belong to the surround, so the VISIBLE art is what the maskable safe circle must contain.
const VISIBLE_ART_MIN_CHANNEL = 20;
// iOS ignores transparency in apple-touch-icon (it paints black), so it is flattened on the brand background.
const BRAND_BACKGROUND = Object.freeze({ b: 0x0f, g: 0x08, r: 0x02 });
const FAVICON_CORNER_RATIO = 0.22;
const ICO_SIZES = Object.freeze([16, 32, 48]);

const sha256 = (payload) => createHash('sha256').update(payload).digest('hex');

const parseArguments = (arguments_) => {
  const options = {
    check: false,
    outputRoot: REPO_ROOT,
    proofDir: null
  };

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === '--check') {
      options.check = true;
      continue;
    }
    if (argument === '--output-root' || argument === '--proof-dir') {
      const value = arguments_[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`${argument} requires a path.`);
      const resolvedValue = isAbsolute(value) ? resolve(value) : resolve(process.cwd(), value);
      if (argument === '--output-root') options.outputRoot = resolvedValue;
      else options.proofDir = resolvedValue;
      index += 1;
      continue;
    }
    throw new Error(`Unsupported argument: ${argument}`);
  }

  if (options.check && options.outputRoot !== REPO_ROOT) {
    throw new Error('--check compares against repository outputs and cannot be combined with --output-root.');
  }

  return options;
};

const pngOptions = Object.freeze({
  adaptiveFiltering: false,
  compressionLevel: 9,
  force: true,
  palette: false,
  progressive: false
});

const renderStandardPng = (master, size) => (
  sharp(master, { failOn: 'error' })
    .resize({
      fit: 'fill',
      height: size,
      kernel: sharp.kernel.lanczos3,
      width: size,
      withoutEnlargement: true
    })
    .png(pngOptions)
    .toBuffer()
);

/** Visible art extent: farthest distance from the centre, and the left/top margin of the art, in master pixels. */
const measureVisibleArt = async (master) => {
  const { data, info } = await sharp(master, { failOn: 'error' }).raw().toBuffer({ resolveWithObject: true });
  const centre = (info.width - 1) / 2;
  let radius = 0;
  let margin = info.width;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const offset = (y * info.width + x) * info.channels;
      if (Math.max(data[offset], data[offset + 1], data[offset + 2]) >= VISIBLE_ART_MIN_CHANNEL) {
        radius = Math.max(radius, Math.hypot(x - centre, y - centre));
        margin = Math.min(margin, x, y);
      }
    }
  }
  return { margin, radius: Math.ceil(radius) };
};

const renderMaskablePng = async (master, size, visibleRadius) => {
  // A maskable icon's guaranteed safe zone is the centered circle whose diameter is 80% of the canvas.
  // Scale the master so its VISIBLE art (frame, maze, wordmark) fits inside that circle, so every
  // platform mask (circle, squircle, rounded square) leaves all of it showing.
  const innerSize = Math.floor((size * MASKABLE_SAFE_DIAMETER_RATIO * MASTER_SIZE) / (2 * visibleRadius));
  const inset = Math.floor((size - innerSize) / 2);
  const resized = await renderStandardPng(master, innerSize);

  return sharp({
    create: {
      background: { b: 0, g: 0, r: 0 },
      channels: 3,
      height: size,
      width: size
    }
  })
    .composite([{ input: resized, left: inset, top: inset }])
    .png(pngOptions)
    .toBuffer();
};

const renderAppleTouchPng = (master, size) => (
  sharp(master, { failOn: 'error' })
    .flatten({ background: BRAND_BACKGROUND })
    .resize({ fit: 'fill', height: size, kernel: sharp.kernel.lanczos3, width: size })
    .removeAlpha()
    .png(pngOptions)
    .toBuffer()
);

/** Favicon: crop the black surround, round the corners (transparent), so a tab shows the art, not a black square. */
const renderFaviconPng = async (master, size, margin) => {
  const crop = MASTER_SIZE - (margin * 2);
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${Math.round(size * FAVICON_CORNER_RATIO)}" fill="#fff"/></svg>`
  );
  return sharp(master, { failOn: 'error' })
    .extract({ height: crop, left: margin, top: margin, width: crop })
    .resize({ fit: 'fill', height: size, kernel: sharp.kernel.lanczos3, width: size })
    .ensureAlpha()
    .composite([{ blend: 'dest-in', input: mask }])
    .png(pngOptions)
    .toBuffer();
};

const createPngIco = (entries) => {
  const directorySize = 6 + (entries.length * 16);
  const header = Buffer.alloc(directorySize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);

  let payloadOffset = directorySize;
  for (const [index, entry] of entries.entries()) {
    const directoryOffset = 6 + (index * 16);
    header.writeUInt8(entry.size === 256 ? 0 : entry.size, directoryOffset);
    header.writeUInt8(entry.size === 256 ? 0 : entry.size, directoryOffset + 1);
    header.writeUInt8(0, directoryOffset + 2);
    header.writeUInt8(0, directoryOffset + 3);
    header.writeUInt16LE(1, directoryOffset + 4);
    header.writeUInt16LE(32, directoryOffset + 6);
    header.writeUInt32LE(entry.payload.length, directoryOffset + 8);
    header.writeUInt32LE(payloadOffset, directoryOffset + 12);
    payloadOffset += entry.payload.length;
  }

  return Buffer.concat([header, ...entries.map((entry) => entry.payload)]);
};

const readAndVerifyMaster = async () => {
  const payload = await readFile(MASTER_PATH);
  const metadata = await sharp(payload, { failOn: 'error' }).metadata();
  const identity = {
    bytes: payload.length,
    format: metadata.format,
    height: metadata.height,
    path: MASTER_RELATIVE_PATH,
    sha256: sha256(payload),
    width: metadata.width
  };

  if (
    identity.sha256 !== MASTER_SHA256
    || identity.bytes !== MASTER_BYTES
    || identity.width !== MASTER_SIZE
    || identity.height !== MASTER_SIZE
    || identity.format !== 'png'
  ) {
    throw new Error(`Canonical icon master identity mismatch: ${JSON.stringify(identity)}`);
  }

  return { identity, payload };
};

const buildOutputs = async (master) => {
  const art = await measureVisibleArt(master);
  const [appleTouch, standard192, standard512, maskable192, maskable512] = await Promise.all([
    renderAppleTouchPng(master, 180),
    renderStandardPng(master, 192),
    renderStandardPng(master, 512),
    renderMaskablePng(master, 192, art.radius),
    renderMaskablePng(master, 512, art.radius)
  ]);
  const icoEntries = await Promise.all(ICO_SIZES.map(async (size) => ({
    payload: await renderFaviconPng(master, size, art.margin),
    size
  })));
  const ico = createPngIco(icoEntries);

  return {
    art,
    icoEntries,
    outputs: new Map([
      ['public/favicon.ico', ico],
      ['public/icons/mazer-app-icon.ico', ico],
      ['public/icons/mazer-app-icon.png', master],
      ['public/icons/apple-touch-icon.png', appleTouch],
      ['public/icons/icon-192.png', standard192],
      ['public/icons/icon-512.png', standard512],
      ['public/icons/icon-192-maskable.png', maskable192],
      ['public/icons/icon-512-maskable.png', maskable512]
    ])
  };
};

const writeOutputs = async (outputRoot, outputs) => {
  for (const [relativePath, payload] of outputs) {
    const outputPath = resolve(outputRoot, relativePath);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, payload);
  }
};

const checkOutputs = async (outputs) => {
  const mismatches = [];
  for (const [relativePath, expected] of outputs) {
    let actual = null;
    try {
      actual = await readFile(resolve(REPO_ROOT, relativePath));
    } catch {
      // Missing output is reported through the same deterministic mismatch.
    }
    if (!actual || !actual.equals(expected)) mismatches.push(relativePath);
  }
  if (mismatches.length > 0) {
    throw new Error(`Generated icon outputs are stale or missing: ${mismatches.join(', ')}`);
  }
};

const writeProofPreviews = async (proofDir, icoEntries, outputs) => {
  await mkdir(proofDir, { recursive: true });
  for (const entry of icoEntries) {
    await writeFile(resolve(proofDir, `standard-${entry.size}.png`), entry.payload);
  }
  await writeFile(resolve(proofDir, 'apple-touch-180.png'), outputs.get('public/icons/apple-touch-icon.png'));
  await writeFile(resolve(proofDir, 'standard-192.png'), outputs.get('public/icons/icon-192.png'));
  await writeFile(resolve(proofDir, 'maskable-192.png'), outputs.get('public/icons/icon-192-maskable.png'));
  await writeFile(resolve(proofDir, 'standard-512.png'), outputs.get('public/icons/icon-512.png'));
  await writeFile(resolve(proofDir, 'maskable-512.png'), outputs.get('public/icons/icon-512-maskable.png'));
  await writeFile(resolve(proofDir, 'standard-1024.png'), outputs.get('public/icons/mazer-app-icon.png'));
};

const options = parseArguments(process.argv.slice(2));
const { identity, payload: master } = await readAndVerifyMaster();
const { art, icoEntries, outputs } = await buildOutputs(master);

if (options.check) await checkOutputs(outputs);
else await writeOutputs(options.outputRoot, outputs);
if (options.proofDir) await writeProofPreviews(options.proofDir, icoEntries, outputs);

const summary = {
  check: options.check,
  generator: 'sharp-lanczos3-site-icon-png-and-png-ico-v2',
  master: identity,
  maskable: {
    background: '#000000',
    completeVisibleArtFitsGuaranteedSafeCircle: true,
    safeDiameterRatio: MASKABLE_SAFE_DIAMETER_RATIO,
    visibleArtRadiusPx: art.radius
  },
  outputRoot: options.outputRoot,
  outputs: Object.fromEntries([...outputs].map(([relativePath, payload]) => [relativePath, {
    bytes: payload.length,
    sha256: sha256(payload)
  }]))
};

console.log(JSON.stringify(summary, null, 2));
