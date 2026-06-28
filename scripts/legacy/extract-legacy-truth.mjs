import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(SCRIPT_PATH), '..', '..');
const ATLAS_ROOT = resolve(REPO_ROOT, '..', '..');
const DEFAULT_OUTPUT_ROOT = resolve(ATLAS_ROOT, 'tmp', 'mazer-legacy-unreal-restore');
const ARCHIVE_PATH = resolve(REPO_ROOT, 'legacy', 'old-project.zip');

const parseArgs = (argv) => {
  const result = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      result[key] = true;
      continue;
    }

    result[key] = next;
    index += 1;
  }

  return result;
};

const ensureWindows = () => {
  if (process.platform !== 'win32') {
    throw new Error('legacy extraction currently requires Windows PowerShell/.NET zip support');
  }
};

const computeSha256 = (filePath) => {
  const hash = createHash('sha256');
  hash.update(readFileSync(filePath));
  return hash.digest('hex');
};

const toWindowsPathLiteral = (value) => value.replace(/\\/g, '\\\\').replace(/'/g, "''");

const runPowerShell = (script) => {
  execFileSync(
    'powershell',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script],
    {
      cwd: REPO_ROOT,
      stdio: 'inherit'
    }
  );
};

const main = () => {
  ensureWindows();
  const args = parseArgs(process.argv.slice(2));
  const outputRoot = resolve(typeof args['output-root'] === 'string' ? args['output-root'] : DEFAULT_OUTPUT_ROOT);
  const clean = args.clean !== false;

  mkdirSync(dirname(outputRoot), { recursive: true });
  if (clean) {
    rmSync(outputRoot, { recursive: true, force: true });
  }
  mkdirSync(outputRoot, { recursive: true });

  const archiveDigest = computeSha256(ARCHIVE_PATH);
  const psScript = `
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zipPath='${toWindowsPathLiteral(ARCHIVE_PATH)}'
$outputRoot='${toWindowsPathLiteral(outputRoot)}'
[System.IO.Compression.ZipFile]::ExtractToDirectory($zipPath, $outputRoot)
`;
  runPowerShell(psScript);

  const manifest = {
    generatedAt: new Date().toISOString(),
    archivePath: ARCHIVE_PATH,
    archiveSha256: archiveDigest,
    outputRoot,
    extractedBy: 'scripts/legacy/extract-legacy-truth.mjs',
    engineExpectation: 'Unreal Engine 5.2',
    notes: [
      'This restore is for legacy truth inspection and web-port verification.',
      'Treat the extracted workspace as read-only source truth while porting into the web app.',
      'Do not treat this restore as a second canonical app identity.'
    ]
  };

  writeFileSync(resolve(outputRoot, 'codex-legacy-restore-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(`legacy restore extracted to ${outputRoot}`);
  console.log(`archive sha256: ${archiveDigest}`);
};

main();
