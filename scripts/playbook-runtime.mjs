#!/usr/bin/env node
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Playbook runtime bridge (thin adapter only).
 *
 * Responsibilities:
 * - resolve the Playbook CLI deterministically
 * - forward repo command aliases to canonical upstream runtime
 * - keep runtime writes under `.playbook/` via env/config only
 * - avoid repo-specific workflow, artifact shaping, or fake runtime outputs
 */
const COMPAT_ALIASES = new Set([
  'ai-context',
  'ai-contract',
  'context',
  'index',
  'query',
  'explain',
  'ask',
  'ignore',
  'verify',
  'plan',
  'pilot'
]);
const OFFICIAL_FALLBACK_ROOT = path.join('.playbook', 'runtime');
export const DEFAULT_PLAYBOOK_VERSION = '0.54.1';
export const DEFAULT_PACKAGE_SPEC = `@fawxzzy/playbook-cli@${DEFAULT_PLAYBOOK_VERSION}`;
export const DEFAULT_OFFICIAL_FALLBACK_SPEC = `https://github.com/fawxzzy/playbook/releases/download/v${DEFAULT_PLAYBOOK_VERSION}/playbook-cli-${DEFAULT_PLAYBOOK_VERSION}.tgz`;
export const DEFAULT_OFFICIAL_FALLBACK_SHA256 = '6fb915baaa0837c70a942c60caaf110ba56abee6dd722de8a686b4757e768ba1';
const TRANSIENT_FALLBACK_FETCH_ATTEMPTS = 2;
const OFFICIAL_FALLBACK_SPEC = process.env.PLAYBOOK_OFFICIAL_FALLBACK_SPEC ?? DEFAULT_OFFICIAL_FALLBACK_SPEC;
const PACKAGE_INSTALL_SPEC = process.env.PLAYBOOK_PACKAGE_SPEC ?? DEFAULT_PACKAGE_SPEC;
const command = process.argv[2];

function normalizeSpec(spec) {
  return typeof spec === 'string' ? spec.trim() : '';
}

function normalizeSha256(value) {
  const digest = normalizeSpec(value).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(digest)) {
    throw new Error('Official fallback acquisition requires an expected SHA-256 digest.');
  }
  return digest;
}

export function resolveOfficialFallbackSha256(rawSpec, env = process.env) {
  const explicitDigest = normalizeSpec(env.PLAYBOOK_OFFICIAL_FALLBACK_SHA256);
  if (explicitDigest) return normalizeSha256(explicitDigest);
  return normalizeSpec(rawSpec) === DEFAULT_OFFICIAL_FALLBACK_SPEC
    ? DEFAULT_OFFICIAL_FALLBACK_SHA256
    : '';
}

function verifyArtifactSha256(buffer, expectedSha256) {
  const expected = normalizeSha256(expectedSha256);
  const actual = createHash('sha256').update(buffer).digest('hex');
  if (actual !== expected) {
    throw new Error('Official fallback artifact failed SHA-256 verification.');
  }
  return actual;
}

function isLikelyLocalPath(spec) {
  return spec.startsWith('./')
    || spec.startsWith('../')
    || spec.startsWith('/')
    || /^[A-Za-z]:[\\/]/.test(spec)
    || spec.endsWith('.tgz')
    || spec.endsWith('.tar.gz');
}

function readBooleanEnv(value) {
  const normalized = normalizeSpec(value).toLowerCase();
  if (!normalized) return false;
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

export function isPackageAcquisitionEnabled(env = process.env) {
  return readBooleanEnv(env.PLAYBOOK_ENABLE_PACKAGE_ACQUIRE) || normalizeSpec(env.PLAYBOOK_PACKAGE_SPEC).length > 0;
}

export function classifyFallbackSpec(rawSpec) {
  const spec = normalizeSpec(rawSpec);

  if (!spec) {
    return { valid: false, kind: 'missing', normalized: spec };
  }

  if (spec.startsWith('file:')) {
    return { valid: true, kind: 'file-url', normalized: spec };
  }

  if (spec.startsWith('https://') || spec.startsWith('http://')) {
    return { valid: true, kind: 'https-url', normalized: spec };
  }

  if (spec.startsWith('git+') || spec.startsWith('git://') || spec.startsWith('ssh://') || spec.startsWith('git@')) {
    return { valid: true, kind: 'git-url', normalized: spec };
  }

  if (isLikelyLocalPath(spec)) {
    return { valid: true, kind: 'local-path', normalized: spec };
  }

  return { valid: false, kind: 'registry-like', normalized: spec };
}

function toAbsolutePath(inputPath) {
  return path.isAbsolute(inputPath) ? inputPath : path.resolve(process.cwd(), inputPath);
}

function formatNpmInstallCommand(args) {
  return ['npm', ...args].join(' ');
}

export function resolveNpmCommand(platform = process.platform) {
  return platform === 'win32' ? 'npm.cmd' : 'npm';
}

function summarizeError(error, depth = 0) {
  if (!error || depth > 3) {
    return [];
  }

  const details = [];
  const name = typeof error.name === 'string' && error.name ? error.name : 'Error';
  const message = typeof error.message === 'string' && error.message ? error.message : String(error);
  details.push(`${name}: ${message}`);

  if (error.cause && error.cause !== error) {
    for (const nested of summarizeError(error.cause, depth + 1)) {
      details.push(`cause -> ${nested}`);
    }
  }

  return details;
}

function ensureNonEmptyFile(filePath) {
  if (!existsSync(filePath)) {
    throw new Error(`Downloaded fallback artifact missing on disk: ${filePath}`);
  }

  const stats = statSync(filePath);
  if (stats.size <= 0) {
    throw new Error(`Downloaded fallback artifact was empty: ${filePath}`);
  }

  return stats.size;
}

function isTransientFallbackFetchError(error) {
  return summarizeError(error).some((detail) => (
    /socketerror:\s*other side closed|socket[^\n]*closed|econnreset|etimedout|eai_again/i.test(detail)
  ));
}

function isTransientFallbackResponse(response) {
  return response?.status === 502 || response?.status === 503 || response?.status === 504;
}

async function fetchOfficialFallbackArtifactWithRetry({ fetchImpl, url, logger }) {
  let lastError;

  for (let attempt = 1; attempt <= TRANSIENT_FALLBACK_FETCH_ATTEMPTS; attempt += 1) {
    let response;

    try {
      response = await fetchImpl(url);
    } catch (error) {
      lastError = error;
      const canRetry = attempt < TRANSIENT_FALLBACK_FETCH_ATTEMPTS && isTransientFallbackFetchError(error);

      for (const detail of summarizeError(error)) {
        logger.error(`[playbook-runtime] Download failure detail: ${detail}`);
      }

      if (!canRetry) {
        break;
      }

      logger.error(`[playbook-runtime] Retrying official fallback download after transient transport failure (${attempt}/${TRANSIENT_FALLBACK_FETCH_ATTEMPTS}).`);
      continue;
    }

    if (!response.ok) {
      if (attempt < TRANSIENT_FALLBACK_FETCH_ATTEMPTS && isTransientFallbackResponse(response)) {
        logger.error(`[playbook-runtime] Download response: HTTP ${response.status} ${response.statusText}`.trim());
        logger.error(`[playbook-runtime] Retrying official fallback download after transient HTTP response (${attempt}/${TRANSIENT_FALLBACK_FETCH_ATTEMPTS}).`);
        continue;
      }

      return { response, buffer: null };
    }

    try {
      return { response, buffer: Buffer.from(await response.arrayBuffer()) };
    } catch (error) {
      lastError = error;
      const canRetry = attempt < TRANSIENT_FALLBACK_FETCH_ATTEMPTS && isTransientFallbackFetchError(error);

      for (const detail of summarizeError(error)) {
        logger.error(`[playbook-runtime] Download failure detail: ${detail}`);
      }

      if (!canRetry) {
        break;
      }

      logger.error(`[playbook-runtime] Retrying official fallback download after transient transport failure (${attempt}/${TRANSIENT_FALLBACK_FETCH_ATTEMPTS}).`);
    }
  }

  throw lastError;
}

export async function normalizeFallbackInstallTarget({
  rawSpec,
  expectedSha256,
  runtimeRoot = OFFICIAL_FALLBACK_ROOT,
  fetchImpl = globalThis.fetch,
  logger = console
}) {
  const fallbackSpec = classifyFallbackSpec(rawSpec);
  if (!fallbackSpec.valid) {
    return { fallbackSpec, installSpec: null, downloadedFrom: null, finalUrl: null, fileSize: null, sha256: null };
  }
  const verifiedExpectedSha256 = normalizeSha256(expectedSha256);

  if (fallbackSpec.kind !== 'https-url') {
    if (fallbackSpec.kind === 'git-url') {
      throw new Error('Official fallback git targets are not supported by the verified artifact contract.');
    }

    const localPath = fallbackSpec.kind === 'file-url'
      ? fileURLToPath(fallbackSpec.normalized)
      : toAbsolutePath(fallbackSpec.normalized);
    const fileSize = ensureNonEmptyFile(localPath);
    const sha256 = verifyArtifactSha256(readFileSync(localPath), verifiedExpectedSha256);
    return {
      fallbackSpec,
      installSpec: fallbackSpec.normalized,
      downloadedFrom: null,
      finalUrl: null,
      fileSize,
      sha256
    };
  }

  if (typeof fetchImpl !== 'function') {
    throw new Error('Global fetch is unavailable; unable to download https fallback spec.');
  }

  const absoluteRuntimeRoot = toAbsolutePath(runtimeRoot);
  const runtimeStateRoot = path.dirname(absoluteRuntimeRoot);
  const cacheRoot = path.join(runtimeStateRoot, 'cache');
  mkdirSync(cacheRoot, { recursive: true });
  const tempDir = mkdtempSync(path.join(cacheRoot, 'download-'));
  const downloadPath = path.join(tempDir, 'playbook-cli.tgz');

  logger.error(`[playbook-runtime] Downloading official fallback URL: ${fallbackSpec.normalized}`);
  logger.error(`[playbook-runtime] Temporary download path: ${downloadPath}`);

  let response;
  let buffer;
  try {
    ({ response, buffer } = await fetchOfficialFallbackArtifactWithRetry({
      fetchImpl,
      url: fallbackSpec.normalized,
      logger
    }));
  } catch (error) {
    throw new Error(`Failed to download fallback artifact from ${fallbackSpec.normalized}`);
  }

  const finalUrl = typeof response.url === 'string' && response.url ? response.url : fallbackSpec.normalized;
  logger.error(`[playbook-runtime] Download response: HTTP ${response.status} ${response.statusText}`.trim());
  logger.error(`[playbook-runtime] Final resolved URL: ${finalUrl}`);

  if (!response.ok) {
    throw new Error(`Failed to download fallback artifact: HTTP ${response.status} ${response.statusText}`.trim());
  }

  if (!buffer || buffer.length === 0) {
    throw new Error('Downloaded fallback artifact was empty.');
  }
  const sha256 = verifyArtifactSha256(buffer, verifiedExpectedSha256);
  writeFileSync(downloadPath, buffer);
  const fileSize = ensureNonEmptyFile(downloadPath);
  logger.error(`[playbook-runtime] Downloaded fallback artifact size: ${fileSize} bytes`);
  logger.error(`[playbook-runtime] Verified fallback artifact SHA-256: ${sha256}`);

  return {
    fallbackSpec,
    installSpec: downloadPath,
    downloadedFrom: fallbackSpec.normalized,
    finalUrl,
    fileSize,
    sha256
  };
}

export function buildOfficialFallbackEvidenceMessages(resolvedFallback) {
  const messages = [
    `[playbook-runtime] Official acquisition target (original): ${resolvedFallback.fallbackSpec.normalized}`,
    `[playbook-runtime] Official acquisition spec type: ${resolvedFallback.fallbackSpec.kind}`
  ];

  if (resolvedFallback.downloadedFrom) {
    messages.push(
      `[playbook-runtime] Official acquisition download source: ${resolvedFallback.downloadedFrom}`,
      `[playbook-runtime] Official acquisition final URL: ${resolvedFallback.finalUrl}`
    );
  }

  messages.push(
    `[playbook-runtime] Official acquisition local tarball: ${resolvedFallback.installSpec}`,
    `[playbook-runtime] Official acquisition tarball size: ${resolvedFallback.fileSize} bytes`,
    `[playbook-runtime] Official acquisition verified SHA-256: ${resolvedFallback.sha256}`
  );
  return messages;
}

function installViaNpm({ targetSpec, prefix }) {
  const args = ['install', '--no-save'];
  if (prefix) {
    args.push('--prefix', prefix);
  }

  args.push(targetSpec);

  const npmCommand = resolveNpmCommand();
  return {
    args,
    result: spawnSync(npmCommand, args, {
      stdio: 'inherit',
      env: process.env,
      shell: shouldUseShellForExecutable(npmCommand),
    })
  };
}

export function shouldUseShellForExecutable(executablePath, platform = process.platform) {
  return platform === 'win32' && /\.(cmd|bat)$/i.test(executablePath);
}

function handleInstallPackage() {
  if (!isPackageAcquisitionEnabled()) {
    console.error('[playbook-runtime] Package acquisition is disabled by default because the official GitHub release tarball is the canonical distribution path.');
    console.error('[playbook-runtime] To enable package acquisition explicitly, set PLAYBOOK_ENABLE_PACKAGE_ACQUIRE=1 and/or PLAYBOOK_PACKAGE_SPEC=<published-package-spec>.');
    console.error(`[playbook-runtime] Example: PLAYBOOK_ENABLE_PACKAGE_ACQUIRE=1 PLAYBOOK_PACKAGE_SPEC="${DEFAULT_PACKAGE_SPEC}" node scripts/playbook-runtime.mjs --install-package`);
    process.exit(1);
  }

  const targetSpec = normalizeSpec(PACKAGE_INSTALL_SPEC);
  console.log(`[playbook-runtime] Package acquisition target: ${targetSpec}`);
  const installPlan = installViaNpm({ targetSpec });
  console.log(`[playbook-runtime] Command shape: ${formatNpmInstallCommand(installPlan.args)}`);
  process.exit(installPlan.result.status ?? 1);
}

async function handleInstallOfficialFallback() {
  const status = await installOfficialFallback();
  process.exit(status);
}

async function installOfficialFallback() {
  let resolvedFallback;
  try {
    resolvedFallback = await normalizeFallbackInstallTarget({
      rawSpec: OFFICIAL_FALLBACK_SPEC,
      expectedSha256: resolveOfficialFallbackSha256(OFFICIAL_FALLBACK_SPEC),
      runtimeRoot: OFFICIAL_FALLBACK_ROOT,
      logger: console
    });
  } catch (error) {
    console.error(`[playbook-runtime] ${error.message}`);
    return 1;
  }

  const { fallbackSpec } = resolvedFallback;

  if (!fallbackSpec.valid) {
    if (fallbackSpec.kind === 'missing') {
      console.error('[playbook-runtime] PLAYBOOK_OFFICIAL_FALLBACK_SPEC resolved to an empty value.');
      console.error(`[playbook-runtime] Default official fallback URL: ${DEFAULT_OFFICIAL_FALLBACK_SPEC}`);
    } else {
      console.error(`[playbook-runtime] Invalid PLAYBOOK_OFFICIAL_FALLBACK_SPEC for official acquisition: ${fallbackSpec.normalized}`);
      console.error('[playbook-runtime] Official acquisition requires a direct install target (file:, local tarball path, https tarball URL, or git+ URL).');
      console.error('[playbook-runtime] Registry-style package specs are not part of the canonical fallback distribution contract.');
    }

    return 1;
  }

  for (const message of buildOfficialFallbackEvidenceMessages(resolvedFallback)) {
    console.log(message);
  }

  const installPlan = installViaNpm({
    targetSpec: resolvedFallback.installSpec,
    prefix: OFFICIAL_FALLBACK_ROOT
  });
  console.log(`[playbook-runtime] Command shape: ${formatNpmInstallCommand(installPlan.args)}`);

  return installPlan.result.status ?? 1;
}

async function main() {
  if (command === '--install-package') {
    handleInstallPackage();
  }

  if (command === '--install-official-fallback') {
    await handleInstallOfficialFallback();
  }

  if (!command || !COMPAT_ALIASES.has(command)) {
    console.log('Usage: node scripts/playbook-runtime.mjs <ai-context|ai-contract|context|index|query|explain|ask|ignore|verify|plan|pilot>');
    console.log('       node scripts/playbook-runtime.mjs <--install-package|--install-official-fallback>');
    process.exit(command ? 1 : 0);
  }

  function executableExtensions() {
    return process.platform === 'win32' ? ['.cmd', '.exe', '.bat', ''] : [''];
  }

  function findExecutable(basePath) {
    for (const ext of executableExtensions()) {
      const candidate = `${basePath}${ext}`;
      if (existsSync(candidate)) {
        return candidate;
      }
    }

    return null;
  }

  function resolveBinFromPackageRoot(packageRoot) {
    const packageJsonPath = path.join(packageRoot, 'package.json');
    if (!existsSync(packageJsonPath)) {
      return null;
    }

    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
    const binField = packageJson.bin;
    if (!binField) {
      return null;
    }

    const relativeBin = typeof binField === 'string'
      ? binField
      : binField.playbook ?? Object.values(binField)[0];

    if (typeof relativeBin !== 'string') {
      return null;
    }

    const absoluteBin = path.resolve(packageRoot, relativeBin);
    return existsSync(absoluteBin) ? absoluteBin : null;
  }

  function resolveInstalledPackageBin() {
    const repoRoot = process.cwd();

    const localBin = findExecutable(path.join(repoRoot, 'node_modules', '.bin', 'playbook'));
    if (localBin) {
      return { bin: localBin, source: `repo-local node_modules binary (${localBin})` };
    }

    const requireFromRepo = createRequire(path.join(repoRoot, 'package.json'));
    const packageJson = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
    const declaredPackages = [
      ...Object.keys(packageJson.dependencies ?? {}),
      ...Object.keys(packageJson.devDependencies ?? {}),
      ...Object.keys(packageJson.optionalDependencies ?? {})
    ].filter((pkgName) => pkgName.includes('playbook'));

    for (const pkgName of declaredPackages) {
      try {
        const resolvedPackageJson = requireFromRepo.resolve(`${pkgName}/package.json`);
        const packageRoot = path.dirname(resolvedPackageJson);
        const packageBin = resolveBinFromPackageRoot(packageRoot);
        if (packageBin) {
          return { bin: packageBin, source: `installed package entrypoint (${pkgName})` };
        }
      } catch {
        // Deliberately ignore unresolved packages and continue checking candidates.
      }
    }

    return null;
  }

  function resolveRuntimeBin() {
    const checks = [];

    const envOverride = process.env.PLAYBOOK_BIN;
    if (envOverride) {
      checks.push(`PLAYBOOK_BIN=${envOverride}`);
      return { bin: envOverride, source: 'PLAYBOOK_BIN environment override', checks };
    }

    checks.push('PLAYBOOK_BIN not set');

    const packageBin = resolveInstalledPackageBin();
    checks.push('repo-local package/bin resolution');
    if (packageBin) {
      return { ...packageBin, checks };
    }

    const officialFallbackBin = findExecutable(path.join(process.cwd(), OFFICIAL_FALLBACK_ROOT, 'node_modules', '.bin', 'playbook'));
    checks.push(`official fallback install (${OFFICIAL_FALLBACK_ROOT})`);
    if (officialFallbackBin) {
      return {
        bin: officialFallbackBin,
        source: `official fallback install (${OFFICIAL_FALLBACK_ROOT})`,
        checks
      };
    }

    return { bin: null, source: null, checks };
  }

  const passthroughArgs = process.argv.slice(3);
  let resolution = resolveRuntimeBin();

  if (!resolution.bin) {
    console.error(`[playbook-runtime] No Playbook binary resolved for ${command}. Attempting official fallback install.`);
    console.error(`[playbook-runtime] Checked: ${resolution.checks.join(' -> ')}`);
    const installStatus = await installOfficialFallback();
    if (installStatus === 0) {
      resolution = resolveRuntimeBin();
    }

    if (!resolution.bin) {
      console.error('[playbook-runtime] Unable to resolve a Playbook executable.');
      console.error(`[playbook-runtime] Checked: ${resolution.checks.join(' -> ')}`);
      console.error('[playbook-runtime] Fix one of the following:');
      console.error('  1) Set PLAYBOOK_BIN to an explicit Playbook executable path.');
      console.error(`  2) Install the official fallback distribution into ${OFFICIAL_FALLBACK_ROOT} (canonical path: node scripts/playbook-runtime.mjs --install-official-fallback).`);
      console.error('  3) If you explicitly need the package path, enable it with PLAYBOOK_ENABLE_PACKAGE_ACQUIRE=1 and run node scripts/playbook-runtime.mjs --install-package.');
      process.exit(1);
    }
  }

  const result = spawnSync(resolution.bin, [command, ...passthroughArgs], {
    stdio: 'inherit',
    shell: shouldUseShellForExecutable(resolution.bin),
    env: {
      ...process.env,
      PLAYBOOK_STATE_ROOT: process.env.PLAYBOOK_STATE_ROOT ?? '.playbook'
    }
  });

  if (result.error) {
    console.error(`[playbook-runtime] Failed to execute resolved Playbook binary from ${resolution.source}.`);
    console.error(`[playbook-runtime] Checked: ${resolution.checks.join(' -> ')}`);
    console.error(`[playbook-runtime] Underlying error: ${result.error.message}`);
    process.exit(1);
  }

  process.exit(result.status ?? 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`[playbook-runtime] Unexpected runtime bridge failure: ${error.message}`);
    process.exit(1);
  });
}
