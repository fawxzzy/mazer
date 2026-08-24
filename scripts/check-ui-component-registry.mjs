import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGitChangedFiles } from './check-decision-registry.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const COMPONENT_PATH = 'docs/contracts/mazer-ui-rework-component-registry.v1.json';
const DECISION_REGISTRY_PATH = 'docs/contracts/mazer-ui-rework-decision-registry.v1.json';

export const EXPECTED_COMPONENTS = Object.freeze({
  shared: ['UiStore', 'UiCommandBus', 'ViewModels', 'ProfileResolver', 'DiagnosticsSnapshot', 'ViewportLayoutSolver', 'PathGeometry'],
  domFoundation: ['AppShell', 'StageShell', 'MazerPanel', 'MazerFrame', 'MazerText', 'MazerIcon', 'MazerButton', 'MazerIconButton', 'MazerField', 'MazerPasswordField', 'SettingRow', 'SettingsSection', 'MazerSwitch', 'MazerSegmentedControl', 'MazerSlider', 'MazerSelect', 'MazerScrollArea', 'StatusChip', 'StatusBanner', 'Toast', 'ConfirmDialog', 'BottomSheet'],
  domProduct: ['HomeActions', 'PreviousRunSummary', 'AccountScreen', 'SettingsScreen', 'PlayerGuide', 'LeaderboardScreen', 'GameplayHUD', 'PauseButton', 'ControlSurface', 'RadialStick', 'DirectionPad', 'CompassControl', 'ResultScreen', 'InstallPrompt', 'ConnectionBanner', 'UpdatePrompt'],
  phaser: ['MazeStage', 'CorridorRenderer', 'TitleRenderer', 'WorldMarkerRenderer', 'TrailRenderer', 'AmbientRenderer', 'WorldEffectsRenderer'],
  internal: ['FixtureToolbar', 'ScenarioHeader', 'GateList', 'DiagnosticTable', 'PreviewStage', 'ProjectionCard', 'CanaryControl', 'CaptureMetadata']
});

export const readComponentRegistry = (componentPath = COMPONENT_PATH, root = repoRoot) => (
  JSON.parse(readFileSync(resolve(root, componentPath), 'utf8'))
);

export const readDecisionRegistryForComponents = (registryPath = DECISION_REGISTRY_PATH, root = repoRoot) => (
  JSON.parse(readFileSync(resolve(root, registryPath), 'utf8'))
);

const violation = (rule, path, message) => ({ rule, path, message });

const ALLOWED_TOP_LEVEL_KEYS = new Set([
  'schemaVersion', 'wave', 'status', 'sourceRef', 'decisionRefs',
  'shared', 'domFoundation', 'domProduct', 'phaser', 'internal'
]);

export const collectComponentRegistryViolations = (registry, root = repoRoot) => {
  const violations = [];
  for (const key of Object.keys(registry ?? {})) {
    if (!ALLOWED_TOP_LEVEL_KEYS.has(key)) {
      violations.push(violation('unknown-component-category', key, `unknown component registry key "${key}".`));
    }
  }
  const categories = Object.keys(EXPECTED_COMPONENTS);
  const seen = new Map();
  for (const category of categories) {
    const values = registry?.[category];
    if (!Array.isArray(values)) {
      violations.push(violation('component-category-missing', category, `component category "${category}" must be an array.`));
      continue;
    }
    if (JSON.stringify(values) !== JSON.stringify(EXPECTED_COMPONENTS[category])) {
      violations.push(violation('component-contract-drift', category, `component category "${category}" differs from spec/component-registry.json.`));
    }
    for (const name of values) {
      if (seen.has(name)) {
        violations.push(violation('duplicate-component-owner', category, `component "${name}" is also owned by ${seen.get(name)}.`));
      } else {
        seen.set(name, category);
      }
    }
  }

  let decisions;
  try {
    decisions = readDecisionRegistryForComponents(DECISION_REGISTRY_PATH, root);
  } catch {
    violations.push(violation('decision-registry-unreadable', DECISION_REGISTRY_PATH, 'decision registry could not be read.'));
    return violations;
  }
  const knownIds = new Set((decisions?.decisions ?? []).map((entry) => entry.id));
  for (const ref of registry?.decisionRefs ?? []) {
    if (!knownIds.has(ref)) {
      violations.push(violation('unknown-decision-reference', 'decisionRefs', `unknown decision id "${ref}".`));
    }
  }
  return violations;
};

export const collectWaveOwnershipViolationsForComponents = (changedFiles, decisionRegistry) => {
  const assignments = decisionRegistry?.integratorWaveOwnership?.assignments;
  if (!Array.isArray(assignments)) {
    return [violation('integrator-wave-ownership-missing', 'integratorWaveOwnership.assignments', 'Wave 1A ownership registry is missing.')];
  }
  const owners = new Map(assignments.flatMap((assignment) => (
    (assignment.paths ?? []).map((path) => [path.replace(/\\/g, '/'), assignment.wave])
  )));
  return changedFiles.flatMap((path) => {
    const normalized = path.replace(/\\/g, '/');
    const owner = owners.get(normalized);
    return owner !== undefined && owner !== '1A'
      ? [violation('integrator-wave-ownership-mismatch', normalized, `"${normalized}" belongs to Wave ${owner}, not Wave 1A.`)]
      : [];
  });
};

export const readGitChangedFilesForComponents = (root = repoRoot, options = {}) => readGitChangedFiles(root, options);

export const formatViolations = (violations) => violations.length === 0
  ? 'Component registry contract passed.'
  : ['Component registry contract failed:', ...violations.map((entry) => `- [${entry.rule}] ${entry.path}: ${entry.message}`)].join('\n');

export const checkComponentRegistry = (registry = readComponentRegistry(), root = repoRoot) => {
  const violations = collectComponentRegistryViolations(registry, root);
  if (violations.length > 0) {
    const error = new Error(formatViolations(violations));
    error.violations = violations;
    throw error;
  }
  return true;
};

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    checkComponentRegistry();
    console.log('Component registry contract passed.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
