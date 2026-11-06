import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Validates a Mazer handcrafted-asset manifest (docs/contracts/mazer-asset-manifest.v1.schema.json).
// Pure + deterministic: no network, no clock, no randomness; violations are sorted before output.
// Constants below mirror src/domain/assets/assetManifest.ts (a test asserts they stay in sync).

export const ASSET_MANIFEST_SCHEMA_VERSION = 1;
export const ASSET_KINDS = Object.freeze(['icon', 'image', 'material', 'animation', 'audio', 'font']);
export const ASSET_FORMATS = Object.freeze(['svg', 'png', 'webp', 'jpg', 'gif', 'webm', 'ogg', 'mp3', 'm4a', 'woff2', 'woff']);
export const ASSET_STATUSES = Object.freeze(['draft', 'review', 'approved', 'deprecated']);
export const ASSET_ORIGINS = Object.freeze(['handcrafted', 'ai-assisted', 'third-party']);

// Per-kind allowed formats and byte ceilings. Raising a ceiling is a reviewed change to this table.
export const ASSET_KIND_RULES = Object.freeze({
  icon: Object.freeze({ formats: ['svg', 'png', 'webp'], maxBytes: 262_144, dimensions: 'raster-required' }),
  image: Object.freeze({ formats: ['png', 'webp', 'jpg'], maxBytes: 2_097_152, dimensions: 'raster-required' }),
  material: Object.freeze({ formats: ['png', 'webp', 'jpg'], maxBytes: 4_194_304, dimensions: 'raster-required' }),
  animation: Object.freeze({ formats: ['webp', 'gif', 'png', 'webm'], maxBytes: 4_194_304, dimensions: 'raster-required' }),
  audio: Object.freeze({ formats: ['ogg', 'mp3', 'm4a'], maxBytes: 1_048_576, dimensions: 'forbidden' }),
  font: Object.freeze({ formats: ['woff2', 'woff'], maxBytes: 524_288, dimensions: 'forbidden' })
});
export const MAX_DIMENSION = 4096;

const ID_PATTERN = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const EXTENSIONS = Object.freeze({
  svg: ['.svg'], png: ['.png'], webp: ['.webp'], jpg: ['.jpg', '.jpeg'], gif: ['.gif'], webm: ['.webm'],
  ogg: ['.ogg', '.oga'], mp3: ['.mp3'], m4a: ['.m4a'], woff2: ['.woff2'], woff: ['.woff']
});
const RASTER_WITH_DIMENSIONS = new Set(['png', 'webp', 'jpg', 'gif', 'webm']);
const TOP_LEVEL_KEYS = new Set(['schemaVersion', 'manifestId', 'assets']);
const ASSET_KEYS = new Set(['id', 'kind', 'path', 'format', 'bytes', 'sha256', 'dimensions', 'source', 'license', 'author', 'status']);

const violation = (rule, path, message) => ({ rule, path, message });
const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;
const sha256Hex = (buffer) => createHash('sha256').update(buffer).digest('hex');

const startsWith = (buffer, bytes, offset = 0) => bytes.every((byte, index) => buffer[offset + index] === byte);
const ascii = (buffer, start, end) => buffer.subarray(start, end).toString('latin1');

// Cheap magic-byte sniffing so a renamed or truncated file is caught as malformed.
const SIGNATURE_CHECKS = Object.freeze({
  png: (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  jpg: (b) => startsWith(b, [0xff, 0xd8, 0xff]),
  gif: (b) => ascii(b, 0, 6) === 'GIF87a' || ascii(b, 0, 6) === 'GIF89a',
  webp: (b) => ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP',
  webm: (b) => startsWith(b, [0x1a, 0x45, 0xdf, 0xa3]),
  ogg: (b) => ascii(b, 0, 4) === 'OggS',
  mp3: (b) => ascii(b, 0, 3) === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0),
  m4a: (b) => ascii(b, 4, 8) === 'ftyp',
  woff2: (b) => ascii(b, 0, 4) === 'wOF2',
  woff: (b) => ascii(b, 0, 4) === 'wOFF',
  svg: (b) => /<svg[\s>]/.test(ascii(b, 0, Math.min(b.length, 2048)))
});

const readPngDimensions = (buffer) => {
  if (buffer.length < 24 || ascii(buffer, 12, 16) !== 'IHDR') return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
};

const isSafeRelativePath = (value) => (
  isNonEmptyString(value)
  && !isAbsolute(value)
  && !/^[A-Za-z]:/.test(value)
  && !value.includes('\\')
  && !value.startsWith('/')
  && value.split('/').every((segment) => segment.length > 0 && segment !== '.' && segment !== '..')
);

const extensionOf = (value) => {
  const index = value.lastIndexOf('.');
  return index < 0 ? '' : value.slice(index).toLowerCase();
};

const collectStructuralViolations = (asset, at) => {
  const violations = [];
  for (const key of Object.keys(asset)) {
    if (!ASSET_KEYS.has(key)) violations.push(violation('unknown-asset-field', at, `unknown field "${key}".`));
  }
  if (!isNonEmptyString(asset.id) || !ID_PATTERN.test(asset.id)) {
    violations.push(violation('invalid-id', at, 'id must be lowercase dot/dash separated alphanumerics starting with a letter.'));
  }
  if (!ASSET_KINDS.includes(asset.kind)) {
    violations.push(violation('invalid-kind', at, `kind must be one of ${ASSET_KINDS.join(', ')}.`));
  }
  if (!ASSET_FORMATS.includes(asset.format)) {
    violations.push(violation('invalid-format', at, `format must be one of ${ASSET_FORMATS.join(', ')}.`));
  }
  if (!ASSET_STATUSES.includes(asset.status)) {
    violations.push(violation('invalid-status', at, `status must be one of ${ASSET_STATUSES.join(', ')}.`));
  }
  if (!Number.isInteger(asset.bytes) || asset.bytes < 1) {
    violations.push(violation('invalid-bytes', at, 'bytes must be a positive integer.'));
  }
  if (typeof asset.sha256 !== 'string' || !SHA256_PATTERN.test(asset.sha256)) {
    violations.push(violation('invalid-sha256', at, 'sha256 must be 64 lowercase hex characters.'));
  }
  if (!isSafeRelativePath(asset.path)) {
    violations.push(violation('unsafe-path', at, 'path must be a non-empty POSIX relative path with no "..", ".", backslashes, or absolute prefix.'));
  }
  if (!isNonEmptyString(asset.author)) {
    violations.push(violation('missing-author', at, 'author is required.'));
  }
  if (!isPlainObject(asset.license) || !isNonEmptyString(asset.license.id)) {
    violations.push(violation('missing-license', at, 'license.id is required.'));
  } else if (asset.license.holder !== undefined && !isNonEmptyString(asset.license.holder)) {
    violations.push(violation('invalid-license', at, 'license.holder, when present, must be a non-empty string.'));
  }
  if (!isPlainObject(asset.source)) {
    violations.push(violation('missing-source', at, 'source {origin, reference, createdOn} is required.'));
  } else {
    if (!ASSET_ORIGINS.includes(asset.source.origin)) {
      violations.push(violation('invalid-source', at, `source.origin must be one of ${ASSET_ORIGINS.join(', ')}.`));
    }
    if (!isNonEmptyString(asset.source.reference)) {
      violations.push(violation('invalid-source', at, 'source.reference is required.'));
    }
    if (typeof asset.source.createdOn !== 'string' || !DATE_PATTERN.test(asset.source.createdOn)) {
      violations.push(violation('invalid-source', at, 'source.createdOn must be YYYY-MM-DD.'));
    }
  }
  return violations;
};

const collectKindViolations = (asset, at) => {
  const violations = [];
  const rules = ASSET_KIND_RULES[asset.kind];
  if (!rules || !ASSET_FORMATS.includes(asset.format)) return violations;

  if (!rules.formats.includes(asset.format)) {
    violations.push(violation('format-not-allowed', at, `kind "${asset.kind}" allows only ${rules.formats.join(', ')}; found "${asset.format}".`));
  }
  if (Number.isInteger(asset.bytes) && asset.bytes > rules.maxBytes) {
    violations.push(violation('oversized-asset', at, `declared ${asset.bytes} bytes exceeds the ${rules.maxBytes}-byte limit for kind "${asset.kind}".`));
  }
  if (isSafeRelativePath(asset.path) && !EXTENSIONS[asset.format].includes(extensionOf(asset.path))) {
    violations.push(violation('extension-mismatch', at, `path extension does not match format "${asset.format}" (${EXTENSIONS[asset.format].join(' or ')}).`));
  }

  const dimensions = asset.dimensions;
  const needsDimensions = rules.dimensions === 'raster-required' && RASTER_WITH_DIMENSIONS.has(asset.format);
  if (rules.dimensions === 'forbidden' && dimensions !== undefined) {
    violations.push(violation('dimensions-not-allowed', at, `kind "${asset.kind}" must not declare dimensions.`));
  } else if (dimensions === undefined) {
    if (needsDimensions) violations.push(violation('missing-dimensions', at, `dimensions are required for ${asset.format} ${asset.kind} assets.`));
  } else if (
    !isPlainObject(dimensions)
    || !Number.isInteger(dimensions.width) || !Number.isInteger(dimensions.height)
    || dimensions.width < 1 || dimensions.height < 1
  ) {
    violations.push(violation('invalid-dimensions', at, 'dimensions must be {width, height} positive integers.'));
  } else if (dimensions.width > MAX_DIMENSION || dimensions.height > MAX_DIMENSION) {
    violations.push(violation('oversized-dimensions', at, `dimensions ${dimensions.width}x${dimensions.height} exceed the ${MAX_DIMENSION}px limit.`));
  }
  return violations;
};

const collectFileViolations = (asset, at, root) => {
  const violations = [];
  if (!isSafeRelativePath(asset.path)) return violations;
  const absolutePath = resolve(root, asset.path);

  let stats;
  try {
    stats = statSync(absolutePath);
  } catch {
    violations.push(violation('missing-file', at, `file not found: ${asset.path}.`));
    return violations;
  }
  if (!stats.isFile()) {
    violations.push(violation('missing-file', at, `path is not a regular file: ${asset.path}.`));
    return violations;
  }

  const buffer = readFileSync(absolutePath);
  if (Number.isInteger(asset.bytes) && buffer.length !== asset.bytes) {
    violations.push(violation('size-mismatch', at, `manifest declares ${asset.bytes} bytes but file is ${buffer.length} bytes.`));
  }
  const rules = ASSET_KIND_RULES[asset.kind];
  // Only report the on-disk overage when the declared size did not already trip the same limit.
  if (rules && buffer.length > rules.maxBytes && !(Number.isInteger(asset.bytes) && asset.bytes > rules.maxBytes)) {
    violations.push(violation('oversized-asset', at, `file is ${buffer.length} bytes, over the ${rules.maxBytes}-byte limit for kind "${asset.kind}".`));
  }
  if (typeof asset.sha256 === 'string' && SHA256_PATTERN.test(asset.sha256)) {
    const actual = sha256Hex(buffer);
    if (actual !== asset.sha256) {
      violations.push(violation('hash-mismatch', at, `sha256 mismatch: manifest ${asset.sha256}, file ${actual}.`));
    }
  }
  const sniff = SIGNATURE_CHECKS[asset.format];
  if (sniff && !sniff(buffer)) {
    violations.push(violation('malformed-asset', at, `file content does not look like a ${asset.format} file.`));
  } else if (asset.format === 'png' && isPlainObject(asset.dimensions)) {
    const actual = readPngDimensions(buffer);
    if (!actual) {
      violations.push(violation('malformed-asset', at, 'PNG is missing a readable IHDR chunk.'));
    } else if (actual.width !== asset.dimensions.width || actual.height !== asset.dimensions.height) {
      violations.push(violation('dimensions-mismatch', at, `manifest declares ${asset.dimensions.width}x${asset.dimensions.height} but PNG is ${actual.width}x${actual.height}.`));
    }
  }
  return violations;
};

const compareViolations = (a, b) => (
  a.path < b.path ? -1 : a.path > b.path ? 1
    : a.rule < b.rule ? -1 : a.rule > b.rule ? 1
      : a.message < b.message ? -1 : a.message > b.message ? 1 : 0
);

/**
 * Pure manifest validation. `root` is the directory asset paths resolve against
 * (the manifest's own directory). Pass `checkFiles: false` for a structure-only pass.
 */
export const collectAssetManifestViolations = (manifest, { root, checkFiles = true } = {}) => {
  const violations = [];
  if (!isPlainObject(manifest)) {
    return [violation('invalid-manifest', '$', 'manifest must be a JSON object.')];
  }
  for (const key of Object.keys(manifest)) {
    if (!TOP_LEVEL_KEYS.has(key)) violations.push(violation('unknown-manifest-field', '$', `unknown field "${key}".`));
  }
  if (manifest.schemaVersion !== ASSET_MANIFEST_SCHEMA_VERSION) {
    violations.push(violation('unsupported-schema-version', 'schemaVersion', `schemaVersion must be ${ASSET_MANIFEST_SCHEMA_VERSION}.`));
  }
  if (manifest.manifestId !== undefined && !isNonEmptyString(manifest.manifestId)) {
    violations.push(violation('invalid-manifest-id', 'manifestId', 'manifestId, when present, must be a non-empty string.'));
  }
  if (!Array.isArray(manifest.assets)) {
    violations.push(violation('invalid-assets', 'assets', 'assets must be an array.'));
    return violations.sort(compareViolations);
  }
  if (checkFiles && !isNonEmptyString(root)) {
    throw new Error('collectAssetManifestViolations requires a root directory unless checkFiles is false.');
  }

  const idCounts = new Map();
  const pathCounts = new Map();
  manifest.assets.forEach((asset, index) => {
    if (!isPlainObject(asset)) {
      violations.push(violation('invalid-asset', `assets[${index}]`, 'asset must be an object.'));
      return;
    }
    if (isNonEmptyString(asset.id)) idCounts.set(asset.id, (idCounts.get(asset.id) ?? 0) + 1);
    if (isNonEmptyString(asset.path)) pathCounts.set(asset.path, (pathCounts.get(asset.path) ?? 0) + 1);
  });

  manifest.assets.forEach((asset, index) => {
    if (!isPlainObject(asset)) return;
    const at = `assets[${isNonEmptyString(asset.id) ? asset.id : index}]`;
    violations.push(...collectStructuralViolations(asset, at));
    violations.push(...collectKindViolations(asset, at));
    if (isNonEmptyString(asset.id) && idCounts.get(asset.id) > 1) {
      violations.push(violation('duplicate-id', at, `id "${asset.id}" is declared ${idCounts.get(asset.id)} times.`));
    }
    if (isNonEmptyString(asset.path) && pathCounts.get(asset.path) > 1) {
      violations.push(violation('duplicate-path', at, `path "${asset.path}" is declared ${pathCounts.get(asset.path)} times.`));
    }
    if (checkFiles) violations.push(...collectFileViolations(asset, at, root));
  });

  // Entries that share an id report identical violations under the same path; collapse exact repeats.
  const seen = new Set();
  return violations
    .sort(compareViolations)
    .filter((entry) => {
      const key = `${entry.path}\u0000${entry.rule}\u0000${entry.message}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

export const readAssetManifest = (manifestPath) => JSON.parse(readFileSync(manifestPath, 'utf8'));

export const validateAssetManifestFile = (manifestPath) => {
  const absolute = resolve(manifestPath);
  let manifest;
  try {
    manifest = readAssetManifest(absolute);
  } catch (error) {
    return { manifestPath: absolute, violations: [violation('unreadable-manifest', '$', `cannot read manifest JSON: ${error.message}`)] };
  }
  return { manifestPath: absolute, violations: collectAssetManifestViolations(manifest, { root: dirname(absolute) }) };
};

export const formatViolations = (violations) => violations
  .map((entry) => `[${entry.rule}] ${entry.path}: ${entry.message}`)
  .join('\n');

const main = (argv) => {
  const args = argv.slice(2);
  let manifestPath = null;
  let json = false;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--manifest') {
      manifestPath = args[index + 1];
      index += 1;
    } else if (args[index] === '--json') {
      json = true;
    } else {
      console.error(`Unsupported argument: ${args[index]}`);
      return 2;
    }
  }
  if (!manifestPath) {
    console.error('Usage: node scripts/assets/validate-asset-manifest.mjs --manifest <path/to/manifest.json> [--json]');
    return 2;
  }
  const { violations } = validateAssetManifestFile(manifestPath);
  if (json) console.log(JSON.stringify({ ok: violations.length === 0, violations }, null, 2));
  else if (violations.length === 0) console.log('asset manifest valid');
  else console.error(`asset manifest invalid (${violations.length}):\n${formatViolations(violations)}`);
  return violations.length === 0 ? 0 : 1;
};

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = main(process.argv);
}
