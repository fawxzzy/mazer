import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  readGitChangedFiles,
  collectProtectedPathViolations,
  resolveCurrentGitBranch,
  resolveReleasedProtectedPaths
} from './check-decision-registry.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const STATE_MODEL_PATH = 'docs/contracts/mazer-ui-rework-state-model.v1.json';
const DECISION_REGISTRY_PATH = 'docs/contracts/mazer-ui-rework-decision-registry.v1.json';

export const readUiStateModel = (stateModelPath = STATE_MODEL_PATH, root = repoRoot) => (
  JSON.parse(readFileSync(resolve(root, stateModelPath), 'utf8'))
);

export const readDecisionRegistryForStateModel = (registryPath = DECISION_REGISTRY_PATH, root = repoRoot) => (
  JSON.parse(readFileSync(resolve(root, registryPath), 'utf8'))
);

const violation = (rule, path, message) => ({ rule, path, message });

const CATEGORY_KEYS = [
  'primarySurfaces',
  'modalSurfaces',
  'gamePhases',
  'authPhases',
  'connectionPhases',
  'installPhases',
  'controlModes',
  'motionModes',
  'effectsQuality'
];

const checkCategoryShape = (model) => {
  const violations = [];
  for (const key of CATEGORY_KEYS) {
    const values = model?.[key];
    if (!Array.isArray(values) || values.length === 0) {
      violations.push(violation('category-empty-or-missing', key, `"${key}" must be a non-empty array.`));
      continue;
    }
    const seen = new Set();
    for (const value of values) {
      if (typeof value !== 'string' || value.length === 0) {
        violations.push(violation('category-value-not-a-string', key, `"${key}" contains a non-string or empty entry: ${JSON.stringify(value)}.`));
        continue;
      }
      if (seen.has(value)) {
        violations.push(violation('category-duplicate-value', key, `"${key}" has a duplicate entry "${value}".`));
      }
      seen.add(value);
    }
  }
  return violations;
};

// modalSurfaces must include "none" (the zero-modal case) -- without it, "zero-or-one-modal" has
// no way to express "zero".
const checkModalSurfacesIncludesNone = (model) => {
  const violations = [];
  const modalSurfaces = model?.modalSurfaces ?? [];
  if (!modalSurfaces.includes('none')) {
    violations.push(violation(
      'modal-surfaces-missing-none',
      'modalSurfaces',
      '"modalSurfaces" must include "none" to represent the zero-modal case required by the zero-or-one-modal invariant.'
    ));
  }
  return violations;
};

// Every entry in structurallyCheckableInvariants must also appear in invariants (it is a labeled
// subset, not a separate list), and both required structural invariants this wave actually claims
// to enforce (see src/state/uiState.ts) must be present.
const REQUIRED_STRUCTURAL_INVARIANTS = ['exactly-one-primary-surface', 'zero-or-one-modal'];

const checkInvariants = (model) => {
  const violations = [];
  const invariants = Array.isArray(model?.invariants) ? model.invariants : [];
  const structural = Array.isArray(model?.structurallyCheckableInvariants) ? model.structurallyCheckableInvariants : [];

  for (const name of structural) {
    if (!invariants.includes(name)) {
      violations.push(violation(
        'structural-invariant-not-listed',
        'structurallyCheckableInvariants',
        `"${name}" is listed as structurally checkable but is not present in "invariants".`
      ));
    }
  }

  for (const required of REQUIRED_STRUCTURAL_INVARIANTS) {
    if (!structural.includes(required)) {
      violations.push(violation(
        'required-structural-invariant-missing',
        'structurallyCheckableInvariants',
        `"${required}" must be listed in "structurallyCheckableInvariants" -- src/state/uiState.ts's UiStateSnapshot shape claims to structurally satisfy it.`
      ));
    }
  }

  return violations;
};

const checkDecisionRefs = (model, root) => {
  const violations = [];
  let decisionRegistry;
  try {
    decisionRegistry = readDecisionRegistryForStateModel(DECISION_REGISTRY_PATH, root);
  } catch {
    violations.push(violation(
      'decision-registry-unreadable',
      DECISION_REGISTRY_PATH,
      'could not read the decision registry to cross-check decisionRefs against.'
    ));
    return violations;
  }

  const knownIds = new Set((decisionRegistry.decisions ?? []).map((entry) => entry.id));
  for (const ref of model?.decisionRefs ?? []) {
    if (!knownIds.has(ref)) {
      violations.push(violation(
        'unknown-decision-reference',
        'decisionRefs',
        `state model registry references unknown decision id "${ref}".`
      ));
    }
  }
  return violations;
};

export const collectUiStateModelViolations = (model, root = repoRoot) => ([
  ...checkCategoryShape(model),
  ...checkModalSurfacesIncludesNone(model),
  ...checkInvariants(model),
  ...checkDecisionRefs(model, root)
]);

// Delegates to scripts/check-decision-registry.mjs's collectProtectedPathViolations -- the single
// implementation of the protected-path check (this module previously carried its own independent
// duplicate of the same Set-membership logic). Kept as its own exported name, with its own wave
// label baked in, so existing callers/tests that import collectProtectedPathViolationsForStateModel
// from this module keep working unchanged; options (e.g. { releasedPaths }) pass through untouched.
export const collectProtectedPathViolationsForStateModel = (changedFiles, decisionRegistry, options = {}) => (
  collectProtectedPathViolations(changedFiles, decisionRegistry, { waveLabel: 'Wave 1A', ...options })
);

// Delegates to scripts/check-decision-registry.mjs's readGitChangedFiles, which unions committed
// (base...HEAD) changes with uncommitted working-tree changes -- see that module for why both
// halves matter. Kept as its own exported name for the same reason
// check-design-tokens.mjs's readGitChangedFilesForTokens is: existing callers/tests that import
// readGitChangedFilesForStateModel from this module keep working unchanged.
export const readGitChangedFilesForStateModel = (root = repoRoot, options = {}) => (
  readGitChangedFiles(root, options)
);

// Thin delegations so this module's callers/tests can resolve the current branch and its actively
// released protected paths without a second import from check-decision-registry.mjs -- same
// rationale as readGitChangedFilesForStateModel above.
export const resolveCurrentGitBranchForStateModel = (root = repoRoot, explicitBranch) => (
  resolveCurrentGitBranch(root, explicitBranch)
);

export const resolveReleasedProtectedPathsForStateModel = (decisionRegistry, branchName) => (
  resolveReleasedProtectedPaths(decisionRegistry, branchName)
);

export const formatViolations = (violations) => {
  if (violations.length === 0) {
    return 'UI state model contract passed.';
  }
  return [
    'UI state model contract failed:',
    ...violations.map((entry) => `- [${entry.rule}] ${entry.path}: ${entry.message}`)
  ].join('\n');
};

export const checkUiStateModel = (model = readUiStateModel(), root = repoRoot) => {
  const violations = collectUiStateModelViolations(model, root);
  if (violations.length > 0) {
    const error = new Error(formatViolations(violations));
    error.violations = violations;
    throw error;
  }
  return true;
};

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    checkUiStateModel();
    console.log('UI state model contract passed.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
