import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_OFFICIAL_FALLBACK_SPEC,
  DEFAULT_OFFICIAL_FALLBACK_SHA256,
  DEFAULT_PACKAGE_SPEC,
  DEFAULT_PLAYBOOK_VERSION,
  buildOfficialFallbackEvidenceMessages,
  classifyFallbackSpec,
  isPackageAcquisitionEnabled,
  normalizeFallbackInstallTarget,
  resolveOfficialFallbackSha256,
  shouldUseShellForExecutable
} from '../scripts/playbook-runtime.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bridgeScript = path.join(repoRoot, 'scripts', 'playbook-runtime.mjs');
// Spawned bridge processes run from a scratch cwd so a failed download never leaves .playbook/ state in the repo.
const scratchCwd = () => mkdtempSync(path.join(tmpdir(), 'playbook-runtime-cwd-'));
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

test('default Playbook acquisition uses the retained canonical release', () => {
  assert.equal(DEFAULT_PLAYBOOK_VERSION, '0.54.1');
  assert.equal(DEFAULT_PACKAGE_SPEC, '@fawxzzy/playbook-cli@0.54.1');
  assert.equal(
    DEFAULT_OFFICIAL_FALLBACK_SPEC,
    'https://github.com/fawxzzy/playbook/releases/download/v0.54.1/playbook-cli-0.54.1.tgz'
  );
  assert.equal(DEFAULT_OFFICIAL_FALLBACK_SHA256, '6fb915baaa0837c70a942c60caaf110ba56abee6dd722de8a686b4757e768ba1');
  assert.equal(resolveOfficialFallbackSha256(DEFAULT_OFFICIAL_FALLBACK_SPEC, {}), DEFAULT_OFFICIAL_FALLBACK_SHA256);
  assert.equal(resolveOfficialFallbackSha256('https://example.com/custom.tgz', {}), '');
  assert.equal(
    resolveOfficialFallbackSha256('https://example.com/custom.tgz', { PLAYBOOK_OFFICIAL_FALLBACK_SHA256: 'A'.repeat(64) }),
    'a'.repeat(64)
  );
});

test('package acquisition stays disabled unless explicitly enabled by env or spec override', () => {
  assert.equal(isPackageAcquisitionEnabled({}), false);
  assert.equal(isPackageAcquisitionEnabled({ PLAYBOOK_ENABLE_PACKAGE_ACQUIRE: '1' }), true);
  assert.equal(isPackageAcquisitionEnabled({ PLAYBOOK_PACKAGE_SPEC: '@scope/pkg@1.2.3' }), true);
});

test('classifyFallbackSpec accepts local tarball path as direct fallback target', () => {
  const result = classifyFallbackSpec('./artifacts/playbook-cli.tgz');
  assert.equal(result.valid, true);
  assert.equal(result.kind, 'local-path');
  assert.equal(result.normalized, './artifacts/playbook-cli.tgz');
});

test('classifyFallbackSpec normalizes and accepts https tarball URL', () => {
  const result = classifyFallbackSpec('  https://example.com/playbook-cli.tgz  ');
  assert.equal(result.valid, true);
  assert.equal(result.kind, 'https-url');
  assert.equal(result.normalized, 'https://example.com/playbook-cli.tgz');
});

test('shouldUseShellForExecutable only enables shell execution for Windows batch wrappers', () => {
  assert.equal(shouldUseShellForExecutable('C:\\repo\\.playbook\\runtime\\node_modules\\.bin\\playbook.cmd', 'win32'), true);
  assert.equal(shouldUseShellForExecutable('C:\\repo\\.playbook\\runtime\\node_modules\\.bin\\playbook.bat', 'win32'), true);
  assert.equal(shouldUseShellForExecutable('C:\\repo\\.playbook\\runtime\\node_modules\\@fawxzzy\\playbook-cli\\bin\\playbook.js', 'win32'), false);
  assert.equal(shouldUseShellForExecutable('/tmp/playbook.cmd', 'linux'), false);
});

test('normalizeFallbackInstallTarget keeps local file fallback spec unchanged and verifies file size', async () => {
  const runtimeRoot = mkdtempSync(path.join(tmpdir(), 'playbook-runtime-test-'));
  const tarballPath = path.join(runtimeRoot, 'artifact.tgz');
  await import('node:fs/promises').then((fs) => fs.writeFile(tarballPath, Buffer.from('fake tgz')));

  const result = await normalizeFallbackInstallTarget({ rawSpec: tarballPath, expectedSha256: sha256('fake tgz') });

  assert.equal(result.fallbackSpec.valid, true);
  assert.equal(result.fallbackSpec.kind, 'local-path');
  assert.equal(result.installSpec, tarballPath);
  assert.equal(result.downloadedFrom, null);
  assert.equal(result.fileSize, 8);
  assert.equal(result.sha256, sha256('fake tgz'));

  const evidence = buildOfficialFallbackEvidenceMessages(result).join('\n');
  assert.match(evidence, /Official acquisition local tarball:/);
  assert.match(evidence, /Official acquisition tarball size: 8 bytes/);
  assert.match(evidence, new RegExp(`Official acquisition verified SHA-256: ${sha256('fake tgz')}`));
  assert.doesNotMatch(evidence, /Official acquisition download source:/);
});

test('normalizeFallbackInstallTarget downloads https fallback to temp tgz path and logs final URL', async () => {
  const runtimeRoot = mkdtempSync(path.join(tmpdir(), 'playbook-runtime-test-'));
  const payload = Buffer.from('fake tgz');
  const messages = [];

  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    arrayBuffer: async () => payload,
    url: 'https://cdn.example.com/playbook-cli-0.1.8.tgz'
  });

  const spec = 'https://example.com/releases/playbook-cli-0.1.8.tgz';
  const result = await normalizeFallbackInstallTarget({
    rawSpec: spec,
    expectedSha256: sha256(payload),
    runtimeRoot,
    fetchImpl,
    logger: { error: (message) => messages.push(message) }
  });

  assert.equal(result.fallbackSpec.kind, 'https-url');
  assert.equal(result.downloadedFrom, spec);
  assert.equal(result.finalUrl, 'https://cdn.example.com/playbook-cli-0.1.8.tgz');
  assert.match(result.installSpec, /playbook-cli\.tgz$/);
  assert.equal(existsSync(result.installSpec), true);
  assert.deepEqual(readFileSync(result.installSpec), payload);
  assert.equal(result.fileSize, payload.length);
  assert.equal(result.sha256, sha256(payload));
  assert.match(messages.join('\n'), /Downloading official fallback URL/);
  assert.match(messages.join('\n'), /Final resolved URL/);
});

function socketCloseError() {
  const cause = new Error('other side closed');
  cause.name = 'SocketError';
  return new TypeError('fetch failed', { cause });
}

test('normalizeFallbackInstallTarget retries one transient socket-close failure and preserves artifact validation', async () => {
  const runtimeRoot = mkdtempSync(path.join(tmpdir(), 'playbook-runtime-test-'));
  const payload = Buffer.from('recovered tgz');
  const messages = [];
  let calls = 0;

  const result = await normalizeFallbackInstallTarget({
    rawSpec: 'https://example.com/releases/playbook-cli-0.1.8.tgz',
    expectedSha256: sha256(payload),
    runtimeRoot,
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) throw socketCloseError();
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        arrayBuffer: async () => payload,
        url: 'https://example.com/releases/playbook-cli-0.1.8.tgz'
      };
    },
    logger: { error: (message) => messages.push(message) }
  });

  assert.equal(calls, 2);
  assert.equal(result.fileSize, payload.length);
  assert.deepEqual(readFileSync(result.installSpec), payload);
  assert.match(messages.join('\n'), /Retrying official fallback download after transient transport failure/);
});

test('normalizeFallbackInstallTarget retries one transient socket-close during response body acquisition', async () => {
  const runtimeRoot = mkdtempSync(path.join(tmpdir(), 'playbook-runtime-test-'));
  const payload = Buffer.from('body-read recovery tgz');
  let calls = 0;

  const result = await normalizeFallbackInstallTarget({
    rawSpec: 'https://example.com/releases/playbook-cli-0.1.8.tgz',
    expectedSha256: sha256(payload),
    runtimeRoot,
    fetchImpl: async () => {
      calls += 1;
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        arrayBuffer: async () => {
          if (calls === 1) throw socketCloseError();
          return payload;
        },
        url: 'https://example.com/releases/playbook-cli-0.1.8.tgz'
      };
    },
    logger: { error() {} }
  });

  assert.equal(calls, 2);
  assert.equal(result.fileSize, payload.length);
  assert.deepEqual(readFileSync(result.installSpec), payload);
});

test('normalizeFallbackInstallTarget exhausts the single transient retry without masking the failure', async () => {
  const runtimeRoot = mkdtempSync(path.join(tmpdir(), 'playbook-runtime-test-'));
  const messages = [];
  let calls = 0;

  await assert.rejects(
    normalizeFallbackInstallTarget({
      rawSpec: 'https://example.com/releases/playbook-cli-0.1.8.tgz',
      expectedSha256: '0'.repeat(64),
      runtimeRoot,
      fetchImpl: async () => {
        calls += 1;
        throw socketCloseError();
      },
      logger: { error: (message) => messages.push(message) }
    }),
    /Failed to download fallback artifact from https:\/\/example\.com\/releases\/playbook-cli-0\.1\.8\.tgz/
  );

  assert.equal(calls, 2);
  assert.match(messages.join('\n'), /SocketError: other side closed/);
});

test('normalizeFallbackInstallTarget exhausts the single retry when response body acquisition closes', async () => {
  const runtimeRoot = mkdtempSync(path.join(tmpdir(), 'playbook-runtime-test-'));
  let calls = 0;

  await assert.rejects(
    normalizeFallbackInstallTarget({
      rawSpec: 'https://example.com/releases/playbook-cli-0.1.8.tgz',
      expectedSha256: '0'.repeat(64),
      runtimeRoot,
      fetchImpl: async () => {
        calls += 1;
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          arrayBuffer: async () => { throw socketCloseError(); },
          url: 'https://example.com/releases/playbook-cli-0.1.8.tgz'
        };
      },
      logger: { error() {} }
    }),
    /Failed to download fallback artifact from https:\/\/example\.com\/releases\/playbook-cli-0\.1\.8\.tgz/
  );

  assert.equal(calls, 2);
});

for (const [status, statusText] of [[502, 'Bad Gateway'], [503, 'Service Unavailable'], [504, 'Gateway Timeout']]) {
  test(`normalizeFallbackInstallTarget retries one transient HTTP ${status} response`, async () => {
    const runtimeRoot = mkdtempSync(path.join(tmpdir(), 'playbook-runtime-test-'));
    const payload = Buffer.from(`recovered after ${status}`);
    const messages = [];
    let calls = 0;

    const result = await normalizeFallbackInstallTarget({
      rawSpec: 'https://example.com/releases/playbook-cli-0.1.8.tgz',
      expectedSha256: sha256(payload),
      runtimeRoot,
      fetchImpl: async () => {
        calls += 1;
        if (calls === 1) return { ok: false, status, statusText, url: '' };
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          arrayBuffer: async () => payload,
          url: 'https://example.com/releases/playbook-cli-0.1.8.tgz'
        };
      },
      logger: { error: (message) => messages.push(message) }
    });

    assert.equal(calls, 2);
    assert.deepEqual(readFileSync(result.installSpec), payload);
    assert.match(messages.join('\n'), /Retrying official fallback download after transient HTTP response/);
  });

  test(`normalizeFallbackInstallTarget exhausts the single transient HTTP ${status} retry`, async () => {
    const runtimeRoot = mkdtempSync(path.join(tmpdir(), 'playbook-runtime-test-'));
    let calls = 0;

    await assert.rejects(
      normalizeFallbackInstallTarget({
        rawSpec: 'https://example.com/releases/playbook-cli-0.1.8.tgz',
        expectedSha256: '0'.repeat(64),
        runtimeRoot,
        fetchImpl: async () => {
          calls += 1;
          return { ok: false, status, statusText, url: '' };
        },
        logger: { error() {} }
      }),
      new RegExp(`HTTP ${status} ${statusText}`)
    );

    assert.equal(calls, 2);
  });
}

test('normalizeFallbackInstallTarget does not retry a deterministic HTTP failure response', async () => {
  const runtimeRoot = mkdtempSync(path.join(tmpdir(), 'playbook-runtime-test-'));
  let calls = 0;

  await assert.rejects(
    normalizeFallbackInstallTarget({
      rawSpec: 'https://example.com/releases/playbook-cli-0.1.8.tgz',
      expectedSha256: '0'.repeat(64),
      runtimeRoot,
      fetchImpl: async () => {
        calls += 1;
        return { ok: false, status: 404, statusText: 'Not Found', url: '' };
      },
      logger: { error() {} }
    }),
    /HTTP 404 Not Found/
  );

  assert.equal(calls, 1);
});

test('normalizeFallbackInstallTarget rejects a digest-mismatched artifact before writing or install', async () => {
  const runtimeRoot = mkdtempSync(path.join(tmpdir(), 'playbook-runtime-test-'));
  const payload = Buffer.from('unexpected artifact bytes');

  await assert.rejects(
    normalizeFallbackInstallTarget({
      rawSpec: 'https://example.com/releases/playbook-cli.tgz',
      expectedSha256: sha256('expected artifact bytes'),
      runtimeRoot,
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        statusText: 'OK',
        arrayBuffer: async () => payload,
        url: 'https://cdn.example.com/playbook-cli.tgz'
      }),
      logger: { error() {} }
    }),
    /failed SHA-256 verification/
  );
});

test('custom official fallback overrides require an explicit digest', () => {
  const run = spawnSync(process.execPath, [bridgeScript, '--install-official-fallback'], {
    encoding: 'utf8',
    cwd: scratchCwd(),
    env: {
      ...process.env,
      PLAYBOOK_OFFICIAL_FALLBACK_SPEC: 'https://example.com/custom.tgz',
      PLAYBOOK_OFFICIAL_FALLBACK_SHA256: ''
    }
  });

  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /requires an expected SHA-256 digest/);
});

test('install-package explains that package acquisition is disabled unless explicitly enabled', () => {
  const run = spawnSync(process.execPath, [bridgeScript, '--install-package'], {
    encoding: 'utf8',
    cwd: scratchCwd(),
    env: {
      ...process.env,
      PLAYBOOK_ENABLE_PACKAGE_ACQUIRE: '',
      PLAYBOOK_PACKAGE_SPEC: ''
    }
  });

  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /Package acquisition is disabled by default/);
  assert.match(run.stderr, /PLAYBOOK_ENABLE_PACKAGE_ACQUIRE=1/);
});

test('install-official-fallback rejects registry-like fallback specs', () => {
  const run = spawnSync(process.execPath, [bridgeScript, '--install-official-fallback'], {
    encoding: 'utf8',
    cwd: scratchCwd(),
    env: {
      ...process.env,
      PLAYBOOK_OFFICIAL_FALLBACK_SPEC: '@fawxzzy/playbook-cli@0.1.8'
    }
  });

  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /Invalid PLAYBOOK_OFFICIAL_FALLBACK_SPEC/);
  assert.match(run.stderr, /not part of the canonical fallback distribution contract/);
});

test('install-official-fallback reports detailed download failures for https fallback specs', () => {
  const run = spawnSync(process.execPath, [bridgeScript, '--install-official-fallback'], {
    encoding: 'utf8',
    cwd: scratchCwd(),
    env: {
      ...process.env,
      PLAYBOOK_OFFICIAL_FALLBACK_SPEC: 'https://127.0.0.1:9/never-there.tgz',
      PLAYBOOK_OFFICIAL_FALLBACK_SHA256: '0'.repeat(64)
    }
  });

  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /Downloading official fallback URL/);
  assert.match(run.stderr, /Download failure detail:/);
  assert.match(run.stderr, /Failed to download fallback artifact from https:\/\/127.0.0.1:9\/never-there.tgz/);
});

test('the Playbook verify CI job takes its pin from the bridge, not from a second copy', () => {
  const workflow = readFileSync(path.join(repoRoot, '.github/workflows/playbook-verify.yml'), 'utf8').replace(/\r\n/g, '\n');
  const jobStart = workflow.indexOf('name: Playbook verify');
  assert.notEqual(jobStart, -1, 'workflow must define a job named "Playbook verify"');
  const job = workflow.slice(jobStart);

  assert.match(job, /node scripts\/playbook-runtime\.mjs --install-official-fallback|npm run playbook:install/);
  assert.match(job, /npm run playbook:verify|node scripts\/playbook-runtime\.mjs verify/);
  // The version, URL and SHA-256 live only in scripts/playbook-runtime.mjs (DEFAULT_*), so a bump is a one-file change.
  assert.doesNotMatch(workflow, /PLAYBOOK_OFFICIAL_FALLBACK_SPEC/);
  assert.doesNotMatch(workflow, /PLAYBOOK_OFFICIAL_FALLBACK_SHA256/);
  assert.doesNotMatch(workflow, /PLAYBOOK_BIN\s*:/);
});
