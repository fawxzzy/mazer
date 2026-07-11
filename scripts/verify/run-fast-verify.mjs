import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(SCRIPT_PATH, '..', '..', '..');

const args = process.argv.slice(2);
const hasFlag = (name) => args.includes(name);
const readFlagValue = (name) => {
  const prefix = `${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  if (inline) {
    return inline.slice(prefix.length);
  }

  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

const normalizePath = (value) => value.replaceAll('\\', '/').replace(/^\.\//, '');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const runCommand = (label, command, commandArgs) => {
  const start = performance.now();
  console.log(`\n[fast-verify] ${label}`);
  execFileSync(command, commandArgs, {
    cwd: REPO_ROOT,
    shell: process.platform === 'win32' && command.endsWith('.cmd'),
    stdio: 'inherit'
  });
  const durationMs = Math.round(performance.now() - start);
  console.log(`[fast-verify] completed ${label} in ${durationMs}ms`);
  return { durationMs, label };
};

const runNpm = (label, npmArgs) => runCommand(label, npmCommand, npmArgs);

const runGit = (gitArgs) => {
  try {
    return execFileSync('git', gitArgs, {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    })
      .split(/\r?\n/)
      .map((line) => normalizePath(line.trim()))
      .filter(Boolean);
  } catch {
    return [];
  }
};

const unique = (values) => [...new Set(values.filter(Boolean))];

const changedFiles = unique([
  ...runGit(['diff', '--name-only', '--relative', 'HEAD']),
  ...runGit(['ls-files', '--others', '--exclude-standard'])
]);

const onlyValue = readFlagValue('--only');
const onlyTests = onlyValue
  ? unique(onlyValue.split(',').map((value) => normalizePath(value.trim())).filter(Boolean))
  : [];

const matchesAny = (file, patterns) => patterns.some((pattern) => pattern.test(file));

const selectionRules = [
  {
    reason: 'marker/docs/package command contract',
    tests: ['tests/reset/legacy-marker.test.ts'],
    patterns: [
      /^AGENTS\.md$/,
      /^docs\//,
      /^package\.json$/,
      /^scripts\/verify\//,
      /^tests\/reset\/legacy-marker\.test\.ts$/
    ]
  },
  {
    reason: 'AI runner/controller behavior',
    tests: ['tests/ai/demo-walker.test.ts'],
    patterns: [
      /^src\/domain\/ai\//,
      /^scripts\/analysis\/ai-runner-calibration\.ts$/,
      /^scripts\/analysis\/live-menu-ai-qa\.mjs$/,
      /^tests\/ai\//,
      /^tests\/reset\/live-menu-ai-qa-script\.test\.mjs$/
    ]
  },
  {
    reason: 'progression/scoring/remote receipt contracts',
    tests: [
      'tests/reset/maze-cycle-ai-scorer.test.ts',
      'tests/reset/legacy-progression.test.ts',
      'tests/reset/legacy-cycle-telemetry.test.ts',
      'tests/reset/legacy-remote-progression.test.ts',
      'tests/analysis/maze-cycle-telemetry-report.test.mjs',
      'tests/analysis/ai-run-corpus-audit.test.mjs'
    ],
    patterns: [
      /^src\/legacy-runtime\/legacyProgression\.ts$/,
      /^src\/legacy-runtime\/legacyRemoteProgression\.ts$/,
      /^src\/legacy-runtime\/mazeCycleAiScorer\.(mjs|d\.mts)$/,
      /^src\/legacy-runtime\/mazeCycleTelemetry\.ts$/,
      /^scripts\/analysis\/ai-run-corpus-audit\.mjs$/,
      /^scripts\/analysis\/maze-cycle-telemetry-report\.mjs$/,
      /^tests\/analysis\/ai-run-corpus-audit\.test\.mjs$/,
      /^tests\/analysis\/maze-cycle-telemetry-report\.test\.mjs$/,
      /^tests\/reset\/legacy-(progression|cycle-telemetry|remote-progression)\.test\.ts$/,
      /^tests\/reset\/maze-cycle-ai-scorer\.test\.ts$/
    ]
  },
  {
    reason: 'maze generation/topology lifecycle',
    tests: [
      'tests/reset/legacy-generation-lifecycle.test.ts',
      'tests/reset/legacy-menu-demo-lifecycle.test.ts',
      'tests/reset/legacy-reset.test.ts'
    ],
    patterns: [
      /^src\/legacy-runtime\/legacyGenerationLifecycle\.ts$/,
      /^src\/legacy-runtime\/legacyMaze\.ts$/,
      /^tests\/reset\/legacy-(generation-lifecycle|menu-demo-lifecycle|reset|topology-scale-audit)\.test\.ts$/
    ]
  },
  {
    reason: 'menu scene/layout/runtime diagnostics',
    tests: [
      'tests/scenes/menu-render-frame.test.ts',
      'tests/scenes/menu-runtime-diagnostics.test.ts',
      'tests/reset/legacy-menu-layout.test.ts'
    ],
    patterns: [
      /^src\/scenes\//,
      /^src\/legacy-runtime\/legacy(MenuLayout|PlayHud|PlayerMessage)\.ts$/,
      /^scripts\/analysis\/capture-ui-surfaces\.mjs$/,
      /^tests\/scenes\//,
      /^tests\/reset\/legacy-menu-layout\.test\.ts$/,
      /^tests\/reset\/ui-surface-capture-script\.test\.mjs$/
    ]
  },
  {
    reason: 'input/touch/movement controls',
    tests: ['tests/input-human/touch.test.ts', 'tests/reset/legacy-movement-speed.test.ts'],
    patterns: [
      /^src\/input-human\//,
      /^src\/legacy-runtime\/legacyMovementSpeed\.ts$/,
      /^tests\/input-human\//,
      /^tests\/reset\/legacy-movement-speed\.test\.ts$/
    ]
  },
  {
    reason: 'settings/auth scoped defaults',
    tests: ['tests/reset/legacy-game-toggle-preferences.test.ts'],
    patterns: [
      /^src\/legacy-runtime\/legacyDefaults\.ts$/,
      /^src\/legacy-runtime\/legacyGameTogglePreferences\.ts$/,
      /^tests\/reset\/legacy-game-toggle-preferences\.test\.ts$/
    ]
  },
  {
    reason: 'play lifecycle/browser QA bridge',
    tests: ['tests/reset/legacy-play-lifecycle.test.ts', 'tests/reset/live-play-qa-script.test.mjs'],
    patterns: [
      /^src\/legacy-runtime\/legacyPlayLifecycle\.ts$/,
      /^scripts\/analysis\/live-play-qa\.mjs$/,
      /^tests\/reset\/legacy-play-lifecycle\.test\.ts$/,
      /^tests\/reset\/live-play-qa-script\.test\.mjs$/
    ]
  }
];

const selected = new Map();
const reasons = [];
for (const rule of selectionRules) {
  const matchedFiles = changedFiles.filter((file) => matchesAny(file, rule.patterns));
  if (matchedFiles.length === 0) {
    continue;
  }

  reasons.push({
    files: matchedFiles,
    reason: rule.reason,
    tests: rule.tests
  });
  for (const testPath of rule.tests) {
    selected.set(testPath, rule.reason);
  }
}

const selectedTests = onlyTests.length > 0
  ? onlyTests
  : selected.size > 0
    ? [...selected.keys()]
    : ['tests/reset/legacy-marker.test.ts'];

const codeTouched = changedFiles.some((file) => (
  /^src\//.test(file)
  || /^scripts\//.test(file)
  || /^tests\//.test(file)
  || file === 'package.json'
  || /^tsconfig/.test(file)
  || /^vite\.config\./.test(file)
));
const shouldLint = !hasFlag('--skip-lint') && (hasFlag('--force-lint') || codeTouched || onlyTests.length > 0);
const shouldBuild = hasFlag('--build');
const shouldRunAll = hasFlag('--all');
const shouldList = hasFlag('--list');

const selection = {
  changedFiles,
  mode: shouldRunAll ? 'all' : onlyTests.length > 0 ? 'only' : 'changed-files',
  reasons,
  selectedTests,
  shouldBuild,
  shouldLint
};

if (shouldList) {
  console.log(JSON.stringify(selection, null, 2));
  process.exit(0);
}

const totalStart = performance.now();
const timings = [];
if (shouldLint) {
  timings.push(runNpm('TypeScript no-emit check', ['run', 'lint']));
}

if (shouldRunAll) {
  timings.push(runNpm('full verify test spine without build', ['run', 'test:verify']));
} else {
  timings.push(runNpm(`targeted vitest (${selectedTests.length} files)`, [
    'exec',
    '--',
    'vitest',
    'run',
    ...selectedTests
  ]));
}

if (shouldBuild) {
  timings.push(runNpm('production build', ['run', 'build']));
}

const totalDurationMs = Math.round(performance.now() - totalStart);
console.log(`\n[fast-verify] passed in ${totalDurationMs}ms`);
console.log(JSON.stringify({
  ...selection,
  timings,
  totalDurationMs
}, null, 2));
