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
 *   node scripts/verify/check-test-coverage.mjs            exit 1 when: a test file is neither run nor excluded; an exclusion is
 *                                                          stale (file gone, now run, or a "run after browser install" file no
 *                                                          step runs); a file runs twice in one workflow; a whole-folder run or a
 *                                                          required-coverage file is outside job "verify" (the required check);
 *                                                          a counted test step in that job has if: or continue-on-error (step or
 *                                                          job level); a "run after browser install" file runs anywhere but after
 *                                                          the playwright install step in that job; FOLDER_RUNS and verify.yml
 *                                                          disagree about the folders run whole (a path under a listed folder
 *                                                          is listed); a -t test-level exclusion is no longer in verify.yml
 *   node scripts/verify/check-test-coverage.mjs --report   print the counts and every list (never fails)
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FOLDER_RUNS, REQUIRED_CHECK_JOB, REQUIRED_CHECK_WORKFLOW, RUNNER_FILES, insideFolderRun, runnerExtraFiles } from './required-tests-lib.mjs';

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

// A small line-based reader for the one workflow shape this repo uses (it is not a YAML parser): jobs are the 2-space keys under
// `jobs:`, steps are the list items under a job's `steps:`, and a step's own keys sit at the dash indent + 2. Supported: bare
// `- run:` / `- uses:` steps, quoted keys, block-scalar run bodies (a `- ` line deeper than the step keys is body text, not a
// step), trailing comments on values. NOT supported: flow-style steps (`- { run: ... }`) and anchors/aliases; a flow-style step
// that carries a counted test command is reported as a failure instead of being guessed at.
const KEY = /^( *)(- +)?["']?([A-Za-z0-9_-]+)["']?:[ \t]*(.*)$/;
const keyOf = (line) => {
  const m = KEY.exec(line);
  return m ? { keyIndent: m[1].length + (m[2]?.length ?? 0), dash: Boolean(m[2]), key: m[3], value: m[4] } : null;
};
const valueOf = (v) => v.replace(/\s+#.*$/, '').trim().replace(/^["']|["']$/g, '');
const isConditionKey = ({ key, value }) => key === 'if' || (key === 'continue-on-error' && valueOf(value).toLowerCase() !== 'false');
const indentOf = (line) => line.length - line.trimStart().length;
const COMMAND = /(?:vitest run|node --test)((?: (?!npx |node |npm |vitest )[^ ]+)*)/g;

/** Commands of one workflow file text, as { workflow, job, operands, excludes, afterChromium, conditional, flow? }. */
export const parseWorkflow = (name, raw) => {
  const lines = raw.split(/\r?\n/).filter((line) => !/^\s*#/.test(line) && line.trim() !== '');
  const start = lines.findIndex((line) => /^jobs:[ \t]*$/.test(line));
  if (start < 0) return [];
  const body = lines.slice(start + 1);
  const jobKey = (line) => /^ {2}["']?([A-Za-z0-9_-]+)["']?:[ \t]*$/.exec(line)?.[1];

  // Pass 1: a job-level if: / continue-on-error (a 4-space key of the job, never a step key).
  const jobConditional = new Map();
  let current = null;
  for (const line of body) {
    const id = jobKey(line);
    if (id) current = id;
    const k = current && keyOf(line);
    if (k && !k.dash && k.keyIndent === 4 && isConditionKey(k)) jobConditional.set(current, true);
  }

  // Pass 2: split each job's steps at list items of the first step's indent, then read each step.
  const commands = [];
  let job = null;
  let inSteps = false;
  let stepIndent = -1;
  let chromiumInstalled = false;
  let step = null;
  const emit = () => {
    if (!step) return;
    const first = step[0];
    const flow = /^ *- *\{/.test(first);
    let conditional = jobConditional.get(job) === true || flow;
    let runBody = '';
    const keyIndent = stepIndent + 2;
    for (let n = 0; n < step.length; n += 1) {
      const k = keyOf(step[n]);
      if (!k || k.keyIndent !== keyIndent || (k.dash && n !== 0) || (!k.dash && n === 0)) continue;
      if (isConditionKey(k)) conditional = true;
      if (k.key === 'run') {
        const inline = /^[>|][-+]?$/.test(valueOf(k.value)) ? '' : k.value;
        const block = [];
        for (let m = n + 1; m < step.length && indentOf(step[m]) > keyIndent; m += 1) block.push(step[m]);
        runBody = [inline, ...block].join(' ');
      }
    }
    if (flow) runBody = step.join(' ');
    const afterChromium = chromiumInstalled;
    if (/playwright install/.test(runBody)) chromiumInstalled = true;
    const collapsed = runBody.replace(/\\\s*$/gm, ' ').replace(/\s+/g, ' ');
    for (const match of collapsed.matchAll(COMMAND)) {
      const tokens = match[1].trim().split(' ').filter(Boolean);
      const operands = [];
      const excludes = [];
      for (let k = 0; k < tokens.length; k += 1) {
        if (tokens[k] === '--exclude') {
          excludes.push(tokens[(k += 1)]);
        } else if (tokens[k].startsWith('tests/')) {
          operands.push(tokens[k].replace(/\/$/, ''));
        }
      }
      if (operands.length > 0) commands.push({ workflow: name, job, operands, excludes, afterChromium, conditional, ...(flow ? { flow } : {}) });
    }
    for (const runner of collapsed.matchAll(/scripts\/verify\/(run-[a-z-]+-required-tests\.mjs)/g)) {
      const extra = runnerExtraFiles(runner[1]);
      if (extra.length > 0) commands.push({ workflow: name, job, operands: extra, excludes: [], runner: runner[1], conditional, ...(flow ? { flow } : {}) });
    }
    step = null;
  };
  for (const line of body) {
    const id = jobKey(line);
    if (id) {
      emit();
      job = id;
      inSteps = false;
      stepIndent = -1;
      chromiumInstalled = false;
      continue;
    }
    if (!job) continue;
    if (!inSteps) {
      if (/^ {4}steps:[ \t]*$/.test(line)) inSteps = true;
      continue;
    }
    const dashItem = /^ *- /.test(line);
    if (stepIndent < 0 && dashItem) stepIndent = indentOf(line);
    if (dashItem && indentOf(line) === stepIndent) {
      emit();
      step = [line];
    } else if (indentOf(line) <= 4 && !dashItem) {
      emit();
      inSteps = false;
    } else if (step) {
      step.push(line);
    }
  }
  emit();
  return commands;
};

/** Counted test steps in the required job that can be skipped, or can fail without failing the job. */
export const conditionalRequiredSteps = (commands) =>
  commands
    .filter((c) => c.workflow === REQUIRED_CHECK_WORKFLOW && c.job === REQUIRED_CHECK_JOB && c.conditional)
    .map((c) => `${c.operands.join(' ')}${c.flow ? ' [flow-style step: unsupported form]' : ''}`);

/** Folder operands the required workflow runs whole that FOLDER_RUNS does not list (a path under a listed folder is listed). */
export const unlistedFolderOperands = (commands) =>
  [...new Set(commands.filter((c) => c.workflow === REQUIRED_CHECK_WORKFLOW && !c.runner).flatMap((c) => c.operands))].filter(
    (op) => !TEST_FILE.test(op) && !FOLDER_RUNS.includes(op) && !insideFolderRun(op)
  );

/** Every vitest / node --test command in the workflows. */
export const workflowCommands = () => {
  const commands = [];
  for (const name of readdirSync(WORKFLOWS).filter((n) => n.endsWith('.yml')).sort()) {
    const raw = readFileSync(join(WORKFLOWS, name), 'utf8');
    const text = raw
      .split(/\r?\n/)
      .filter((line) => !/^\s*#/.test(line))
      .join('\n');
    commands.push(...parseWorkflow(name, raw));
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

/** Exclusion category for files that launch Playwright Chromium: excluded from the folder runs, run once after the install step. */
export const BROWSER_CATEGORY = 'run after browser install';

export const analyze = () => {
  const files = listTestFiles();
  const commands = workflowCommands();
  const runs = new Map(files.map((f) => [f, []]));
  // Runs that are NOT inside the required job after the Chromium install step (only matter for browser-category files).
  const misplacedRuns = new Map(files.map((f) => [f, []]));
  commands.forEach((cmd, index) => {
    for (const file of files) {
      if (cmd.excludes.includes(file)) continue;
      if (cmd.operands.some((op) => matches(file, op))) {
        runs.get(file).push(`${cmd.workflow}#${index}${cmd.runner ? `(${cmd.runner})` : ''}`);
        if (!(cmd.workflow === REQUIRED_CHECK_WORKFLOW && cmd.job === REQUIRED_CHECK_JOB && cmd.afterChromium)) misplacedRuns.get(file).push(`${cmd.workflow}#${index}`);
      }
    }
  });
  const exclusions = existsSync(EXCLUSIONS) ? JSON.parse(readFileSync(EXCLUSIONS, 'utf8')) : { files: {} };
  const excluded = exclusions.files ?? {};
  const workflowText = readFileSync(join(WORKFLOWS, 'verify.yml'), 'utf8');
  const notRun = files.filter((f) => runs.get(f).length === 0);
  const requiredCommands = commands.filter((c) => c.workflow === REQUIRED_CHECK_WORKFLOW && c.job === REQUIRED_CHECK_JOB && !c.conditional);
  return {
    files,
    notRun,
    unaccounted: notRun.filter((f) => !(f in excluded)),
    // A browser-category entry is stale when the file is gone or NOTHING runs it; every other entry is stale when CI runs it.
    staleExclusions: Object.keys(excluded).filter((f) => !files.includes(f) || (excluded[f]?.category === BROWSER_CATEGORY ? runs.get(f).length === 0 : runs.get(f).length > 0)),
    // A browser-category file must run only inside job verify, in a step after the Playwright install step.
    browserMisplaced: Object.entries(excluded).filter(([f, e]) => e?.category === BROWSER_CATEGORY && files.includes(f) && misplacedRuns.get(f).length > 0).map(([f]) => f),
    badReasons: Object.entries(excluded).filter(([, e]) => typeof e?.reason !== 'string' || e.reason.trim().length < 8 || /[\r\n]/.test(e.reason) || !e.category).map(([f]) => f),
    // Folders that required-tests-lib.mjs says run whole must be an operand of some workflow command.
    missingFolders: FOLDER_RUNS.filter((folder) => !commands.some((c) => c.operands.includes(folder))),
    // The other direction: a folder the required workflow runs whole must be in FOLDER_RUNS, or `npm test` drifts from CI.
    unlistedFolders: unlistedFolderOperands(commands),
    // Counted test steps in the required job with if: or continue-on-error (step or job level) are not protection.
    conditionalSteps: conditionalRequiredSteps(commands),
    // A whole-folder run and every required-coverage file must run inside the job that is a required check. A step in any
    // other job can go red and the pull request still merges, so it does not count as protection.
    outsideRequiredCheck: [
      ...FOLDER_RUNS.filter((folder) => !requiredCommands.some((c) => c.operands.includes(folder))).map((folder) => `${folder} (whole folder)`),
      ...[...new Set(Object.values(RUNNER_FILES).flatMap(([, listed]) => listed))].filter(
        (file) => files.includes(file) && !requiredCommands.some((c) => !c.excludes.includes(file) && c.operands.some((op) => matches(file, op)))
      )
    ],
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
  for (const f of a.staleExclusions) problems.push(`${f}: on the exclusion list but the file is gone, or CI runs it (remove the entry), or it is a "run after browser install" entry that no CI step runs`);
  for (const f of a.conditionalSteps) problems.push(`${f}: test step in job "${REQUIRED_CHECK_JOB}" has if: or continue-on-error (step or job level), or is a flow-style step (unsupported form), so a red run can still merge; remove it or rewrite it as a block step`);
  for (const f of a.browserMisplaced) problems.push(`${f}: category "${BROWSER_CATEGORY}" but a run is not inside job "${REQUIRED_CHECK_JOB}" after the "playwright install" step`);
  for (const f of a.badReasons) problems.push(`${f}: exclusion reason must be one line of at least 8 characters`);
  for (const f of a.missingFolders) problems.push(`${f}: listed in FOLDER_RUNS (scripts/verify/required-tests-lib.mjs) but no workflow command runs it whole`);
  for (const f of a.unlistedFolders) problems.push(`${f}: ${REQUIRED_CHECK_WORKFLOW} runs this folder whole but it is not in FOLDER_RUNS (scripts/verify/required-tests-lib.mjs), so npm test would skip it`);
  for (const f of a.outsideRequiredCheck) problems.push(`${f}: not run inside the required check (job "${REQUIRED_CHECK_JOB}" in ${REQUIRED_CHECK_WORKFLOW}); a red run in another job does not block a merge`);
  for (const t of a.staleTestExclusions) problems.push(`${t}: test-level exclusion not found in verify.yml`);
  for (const d of a.duplicates) problems.push(`${d.file}: run ${d.runs.length} times (${d.runs.join(', ')}); make each test file run once`);
  if (!report && problems.length > 0) {
    console.error(problems.join('\n'));
    process.exitCode = 1;
  }
}
