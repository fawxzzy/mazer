import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MASTER_RELATIVE_PATH = 'src/brand/source-art/mazer-app-icon-master.png';
const MASTER_PATH = resolve(REPO_ROOT, MASTER_RELATIVE_PATH);
const MASTER_SHA256 = 'ede90e596682795d10f97bed615071ca1f60e08e290eacf1ea143006df914d78';
const MASTER_BYTES = 1_173_366;
const MASTER_SIZE = 1024;
const MASKABLE_SAFE_DIAMETER_RATIO = 0.8;
const ICO_SIZES = Object.freeze([16, 32, 48, 64, 128, 256]);

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

const renderMaskablePng = async (master, size) => {
  // A maskable icon's guaranteed safe zone is the centered circle whose
  // diameter is 80% of the canvas. Fit the complete square master inside that
  // circle so both the rainbow perimeter and central maze survive every mask.
  const innerSize = Math.floor((size * MASKABLE_SAFE_DIAMETER_RATIO) / Math.SQRT2);
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
  const [appleTouch, standard192, standard512, maskable192, maskable512] = await Promise.all([
    renderStandardPng(master, 180),
    renderStandardPng(master, 192),
    renderStandardPng(master, 512),
    renderMaskablePng(master, 192),
    renderMaskablePng(master, 512)
  ]);
  const icoEntries = await Promise.all(ICO_SIZES.map(async (size) => ({
    payload: await renderStandardPng(master, size),
    size
  })));
  const ico = createPngIco(icoEntries);

  return {
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
const { icoEntries, outputs } = await buildOutputs(master);

if (options.check) await checkOutputs(outputs);
else await writeOutputs(options.outputRoot, outputs);
if (options.proofDir) await writeProofPreviews(options.proofDir, icoEntries, outputs);

const summary = {
  check: options.check,
  generator: 'sharp-lanczos3-fixed-png-and-png-ico-v1',
  master: identity,
  maskable: {
    background: '#000000',
    completeMasterFitsGuaranteedSafeCircle: true,
    safeDiameterRatio: MASKABLE_SAFE_DIAMETER_RATIO
  },
  outputRoot: options.outputRoot,
  outputs: Object.fromEntries([...outputs].map(([relativePath, payload]) => [relativePath, {
    bytes: payload.length,
    sha256: sha256(payload)
  }]))
};

console.log(JSON.stringify(summary, null, 2));
