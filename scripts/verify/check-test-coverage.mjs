/**
 * Static test-coverage audit: every test file under tests/ must be run by CI, or sit on the committed exclusion
 * list (config/ci-test-exclusions.json) with a one-line reason.
 *
 * Method (no test is executed): read every workflow under .github/workflows, drop comment lines, split each step's
 * `run:` text into commands, and collect the `tests/...` operands of every `vitest run` / `node --test` command (a folder
 * operand covers every test file under it; `--exclude <file>` removes a file from that command only). The required-coverage
 * runners (`node ./scripts/verify/run-*-required-tests.mjs`) contribute their `*_RUN_ONLY_UNCOVERED` list: files
 * that no folder step reaches. A "test file" is any *.test.* / *.spec.* file under tests/.
 *
 * Usage:
 *   node scripts/verify/check-test-coverage.mjs            exit 1 when a test file is neither run nor excluded, an
 *                                                          exclusion is stale (file gone, or now run), or a file runs twice
 *   node scripts/verify/check-test-coverage.mjs --report   print the counts and every list (never fails)
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FOLDER_RUNS, runnerExtraFiles } from './required-tests-lib.mjs';

const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..', '..');
const WORKFLOWS = join(ROOT, '.github', 'workflows');
const EXCLUSIONS = join(ROOT, 'config', 'ci-test-exclusions.json');
const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
const posix = (p) => relative(ROOT, p).replaceAll('\\', '/');

export const listTestFiles = () => walk(join(ROOT, 'tests')).map(posix).filter((p) => TEST_FILE.test(p)).sort();

/** Every vitest / node --test command in the workflows, as { workflow, operands, excludes }. */
export const workflowCommands = () => {
  const commands = [];
  for (const name of readdirSync(WORKFLOWS).filter((n) => n.endsWith('.yml')).sort()) {
    const text = readFileSync(join(WORKFLOWS, name), 'utf8')
      .split(/\r?\n/)
      .filter((line) => !/^\s*#/.test(line))
      .join('\n');
    // One step per `- name:`; only the part from `run:` on is a command.
    for (const step of text.split(/\n\s*- name:/).slice(1)) {
      const runAt = step.search(/\n\s*run:/);
      if (runAt < 0) continue;
      const body = step
        .slice(runAt)
        .replace(/\\\r?\n/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/^ ?run: ?[>|][-+]? ?/, '')
        .replace(/^ ?run: ?/, '');
      for (const match of body.matchAll(/(?:vitest run|node --test)((?: (?!npx |node |npm |vitest )[^ ]+)*)/g)) {
        const tokens = match[1].trim().split(' ').filter(Boolean);
        const operands = [];
        const excludes = [];
        for (let i = 0; i < tokens.length; i += 1) {
          if (tokens[i] === '--exclude') {
            excludes.push(tokens[(i += 1)]);
          } else if (tokens[i].startsWith('tests/')) {
            operands.push(tokens[i].replace(/\/$/, ''));
          }
        }
        if (operands.length > 0) commands.push({ workflow: name, operands, excludes });
      }
      for (const runner of body.matchAll(/scripts\/verify\/(run-[a-z-]+-required-tests\.mjs)/g)) {
        const extra = runnerExtraFiles(runner[1]);
        if (extra.length > 0) commands.push({ workflow: name, operands: extra, excludes: [], runner: runner[1] });
      }
    }
    // `npm run <script>` steps: the script's own command line counts too.
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).scripts;
    for (const m of text.matchAll(/npm run ([\w:.-]+)/g)) {
      const script = pkg[m[1]] ?? '';
      const nodeTest = script.match(/node --test ([^&|]+)/);
      if (nodeTest) {
        commands.push({ workflow: name, operands: nodeTest[1].trim().split(/\s+/).filter((t) => t.startsWith('tests/')), excludes: [] });
      }
    }
  }
  return commands;
};

const matches = (file, operand) => file === operand || file.startsWith(`${operand}/`);

export const analyze = () => {
  const files = listTestFiles();
  const commands = workflowCommands();
  const runs = new Map(files.map((f) => [f, []]));
  commands.forEach((cmd, index) => {
    for (const file of files) {
      if (cmd.excludes.includes(file)) continue;
      if (cmd.operands.some((op) => matches(file, op))) runs.get(file).push(`${cmd.workflow}#${index}${cmd.runner ? `(${cmd.runner})` : ''}`);
    }
  });
  const exclusions = existsSync(EXCLUSIONS) ? JSON.parse(readFileSync(EXCLUSIONS, 'utf8')) : { files: {} };
  const excluded = exclusions.files ?? {};
  const workflowText = readFileSync(join(WORKFLOWS, 'verify.yml'), 'utf8');
  const notRun = files.filter((f) => runs.get(f).length === 0);
  return {
    files,
    notRun,
    unaccounted: notRun.filter((f) => !(f in excluded)),
    staleExclusions: Object.keys(excluded).filter((f) => !files.includes(f) || runs.get(f).length > 0),
    badReasons: Object.entries(excluded).filter(([, e]) => typeof e?.reason !== 'string' || e.reason.trim().length < 8 || /[\r\n]/.test(e.reason) || !e.category).map(([f]) => f),
    // Folders that required-tests-lib.mjs says run whole must be an operand of some workflow command.
    missingFolders: FOLDER_RUNS.filter((folder) => !commands.some((c) => c.operands.includes(folder))),
    // Test-level exclusions (-t filters) must still be named in the workflow, or the reason is stale.
    staleTestExclusions: Object.entries(exclusions.tests ?? {}).flatMap(([file, e]) => e.names.filter((n) => !workflowText.includes(n)).map((n) => `${file}: ${n}`)),
    // Two workflows with different triggers (board-sync.yml, ci.yml) may both run the board tests; the same workflow may not.
    duplicates: files.filter((f) => new Set(runs.get(f).map((r) => r.split('#')[0])).size < runs.get(f).length).map((f) => ({ file: f, runs: runs.get(f) })),
    excluded
  };
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = analyze();
  const report = process.argv.includes('--report');
  console.log(`[test-coverage] test files: ${a.files.length}; run by CI: ${a.files.length - a.notRun.length}; not run: ${a.notRun.length} (excluded with a reason: ${a.notRun.length - a.unaccounted.length}, unaccounted: ${a.unaccounted.length}); run more than once: ${a.duplicates.length}`);
  if (report) {
    console.log('NOT RUN:\n' + a.notRun.join('\n'));
    console.log('DUPLICATES:\n' + a.duplicates.map((d) => `${d.file}  ${d.runs.join(' ')}`).join('\n'));
  }
  const problems = [];
  for (const f of a.unaccounted) problems.push(`${f}: no CI step runs it and it is not in config/ci-test-exclusions.json (add it to a folder step, or exclude it with a one-line reason)`);
  for (const f of a.staleExclusions) problems.push(`${f}: on the exclusion list but the file is gone or CI now runs it (remove the entry)`);
  for (const f of a.badReasons) problems.push(`${f}: exclusion reason must be one line of at least 8 characters`);
  for (const f of a.missingFolders) problems.push(`${f}: listed in FOLDER_RUNS (scripts/verify/required-tests-lib.mjs) but no workflow command runs it whole`);
  for (const t of a.staleTestExclusions) problems.push(`${t}: test-level exclusion not found in verify.yml`);
  for (const d of a.duplicates) problems.push(`${d.file}: run ${d.runs.length} times (${d.runs.join(', ')}); make each test file run once`);
  if (!report && problems.length > 0) {
    console.error(problems.join('\n'));
    process.exitCode = 1;
  }
}
