import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGitChangedFiles } from './check-decision-registry.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TOPOLOGY_PATH_CONTRACT_PATH = 'docs/contracts/mazer-ui-rework-topology-path-contract.v1.json';
const DECISION_REGISTRY_PATH = 'docs/contracts/mazer-ui-rework-decision-registry.v1.json';

export const readTopologyPathContract = (contractPath = TOPOLOGY_PATH_CONTRACT_PATH, root = repoRoot) => (
  JSON.parse(readFileSync(resolve(root, contractPath), 'utf8'))
);

export const readDecisionRegistryForTopologyPathContract = (registryPath = DECISION_REGISTRY_PATH, root = repoRoot) => (
  JSON.parse(readFileSync(resolve(root, registryPath), 'utf8'))
);

const violation = (rule, path, message) => ({ rule, path, message });

const DIRECTIONS = ['N', 'E', 'S', 'W'];
const EXPECTED_BITS = { N: 1, E: 2, S: 4, W: 8 };

// Validates the JSON contract's "bits" field is exactly the four cardinal directions mapped to the
// four distinct powers of two used elsewhere in this file to independently recompute each mask's
// expected connection list.
const checkBitsShape = (model) => {
  const violations = [];
  const bits = model?.bits ?? {};
  const bitKeys = Object.keys(bits);

  for (const direction of DIRECTIONS) {
    if (bits[direction] !== EXPECTED_BITS[direction]) {
      violations.push(violation(
        'bits-value-mismatch',
        `bits.${direction}`,
        `"bits.${direction}" must be ${EXPECTED_BITS[direction]}, found ${JSON.stringify(bits[direction])}.`
      ));
    }
  }

  const unexpectedKeys = bitKeys.filter((key) => !DIRECTIONS.includes(key));
  for (const key of unexpectedKeys) {
    violations.push(violation('bits-unexpected-key', `bits.${key}`, `"bits" has an unexpected key "${key}"; only N/E/S/W are defined.`));
  }

  return violations;
};

// Independently recomputes, from "bits" alone, what each mask 0-15's connection list must be (bit
// decomposition in canonical N/E/S/W order), and compares against the JSON's own "masks[].connections"
// field. This catches a typo in either representation -- the two fields are meant to be redundant,
// not independently authored truth.
const computeExpectedConnections = (mask, bits) => (
  DIRECTIONS.filter((direction) => (mask & (bits[direction] ?? 0)) !== 0)
);

const checkMasksShape = (model) => {
  const violations = [];
  const masks = Array.isArray(model?.masks) ? model.masks : [];
  const bits = model?.bits ?? EXPECTED_BITS;

  if (masks.length !== 16) {
    violations.push(violation('masks-wrong-length', 'masks', `"masks" must contain exactly 16 entries (mask values 0-15), found ${masks.length}.`));
  }

  const seenMaskValues = new Set();
  for (let expectedMask = 0; expectedMask < 16; expectedMask += 1) {
    const entry = masks.find((candidate) => candidate?.mask === expectedMask);
    if (!entry) {
      violations.push(violation('masks-missing-entry', 'masks', `"masks" is missing an entry for mask ${expectedMask}.`));
      continue;
    }
  }

  for (const entry of masks) {
    const maskValue = entry?.mask;
    if (typeof maskValue !== 'number' || !Number.isInteger(maskValue) || maskValue < 0 || maskValue > 15) {
      violations.push(violation('masks-invalid-mask-value', 'masks', `mask entry has an invalid "mask" value: ${JSON.stringify(maskValue)}.`));
      continue;
    }
    if (seenMaskValues.has(maskValue)) {
      violations.push(violation('masks-duplicate-mask-value', 'masks', `mask value ${maskValue} appears more than once in "masks".`));
    }
    seenMaskValues.add(maskValue);

    const connections = Array.isArray(entry?.connections) ? entry.connections : null;
    if (!connections) {
      violations.push(violation('masks-connections-not-array', `masks[${maskValue}]`, `mask ${maskValue}'s "connections" must be an array.`));
      continue;
    }

    const expected = computeExpectedConnections(maskValue, bits);
    const actual = [...connections];
    const matches = expected.length === actual.length && expected.every((direction, index) => direction === actual[index]);
    if (!matches) {
      violations.push(violation(
        'masks-connections-mismatch',
        `masks[${maskValue}]`,
        `mask ${maskValue}'s "connections" is ${JSON.stringify(actual)}, but bit-decomposing "bits" against this mask value expects ${JSON.stringify(expected)} (canonical N/E/S/W order).`
      ));
    }
  }

  return violations;
};

const checkShippingPresentation = (model) => {
  const violations = [];
  if (typeof model?.shippingPresentation !== 'string' || model.shippingPresentation.length === 0) {
    violations.push(violation(
      'shipping-presentation-missing',
      'shippingPresentation',
      '"shippingPresentation" must be a non-empty string naming the default shipping mask presentation.'
    ));
  }
  return violations;
};

const checkDebugPresentations = (model) => {
  const violations = [];
  const debugPresentations = model?.debugPresentations;
  if (!Array.isArray(debugPresentations) || debugPresentations.length === 0) {
    violations.push(violation(
      'debug-presentations-empty-or-missing',
      'debugPresentations',
      '"debugPresentations" must be a non-empty array.'
    ));
    return violations;
  }

  const seen = new Set();
  for (const entry of debugPresentations) {
    if (typeof entry !== 'string' || entry.length === 0) {
      violations.push(violation('debug-presentations-value-not-a-string', 'debugPresentations', `"debugPresentations" contains a non-string or empty entry: ${JSON.stringify(entry)}.`));
      continue;
    }
    if (seen.has(entry)) {
      violations.push(violation('debug-presentations-duplicate-value', 'debugPresentations', `"debugPresentations" has a duplicate entry "${entry}".`));
    }
    seen.add(entry);

    if (entry === model?.shippingPresentation) {
      violations.push(violation(
        'debug-presentation-equals-shipping',
        'debugPresentations',
        `"${entry}" is listed as a debug presentation but is also the shipping presentation -- per decision shipping-corridor-not-tiles, debug/proof presentations must stay distinct from the shipping default.`
      ));
    }
  }

  return violations;
};

const checkDecisionRefs = (model, root) => {
  const violations = [];
  let decisionRegistry;
  try {
    decisionRegistry = readDecisionRegistryForTopologyPathContract(DECISION_REGISTRY_PATH, root);
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
        `topology/path contract registry references unknown decision id "${ref}".`
      ));
    }
  }
  return violations;
};

export const collectTopologyPathContractViolations = (model, root = repoRoot) => ([
  ...checkBitsShape(model),
  ...checkMasksShape(model),
  ...checkShippingPresentation(model),
  ...checkDebugPresentations(model),
  ...checkDecisionRefs(model, root)
]);

// Reused from scripts/check-decision-registry.mjs's protected-path convention (see that module and
// Wave 1A/1B's own copies for why): this wave must not touch any of PR #83/#82's collision files
// either, so the same self-check is applied here.
export const collectProtectedPathViolationsForTopologyPathContract = (changedFiles, decisionRegistry) => {
  const protectedPaths = new Set(decisionRegistry?.prProtection?.protectedPaths ?? []);
  const violations = [];
  for (const file of changedFiles) {
    const normalized = file.replace(/\\/g, '/');
    if (protectedPaths.has(normalized)) {
      violations.push(violation(
        'protected-path-touched',
        normalized,
        `"${normalized}" is a PR #83/#82 protected path (prProtection.protectedPaths) and must not be modified by Wave 2B.`
      ));
    }
  }
  return violations;
};

// Delegates to scripts/check-decision-registry.mjs's readGitChangedFiles, which unions committed
// (base...HEAD) changes with uncommitted working-tree changes -- see that module for why both
// halves matter, and Wave 1A's continuation-session receipt for how a git-status-only copy of this
// check previously went undetected on a fully-committed PR branch.
export const readGitChangedFilesForTopologyPathContract = (root = repoRoot, options = {}) => (
  readGitChangedFiles(root, options)
);

export const formatViolations = (violations) => {
  if (violations.length === 0) {
    return 'Topology/path contract passed.';
  }
  return [
    'Topology/path contract failed:',
    ...violations.map((entry) => `- [${entry.rule}] ${entry.path}: ${entry.message}`)
  ].join('\n');
};

export const checkTopologyPathContract = (model = readTopologyPathContract(), root = repoRoot) => {
  const violations = collectTopologyPathContractViolations(model, root);
  if (violations.length > 0) {
    const error = new Error(formatViolations(violations));
    error.violations = violations;
    throw error;
  }
  return true;
};

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    checkTopologyPathContract();
    console.log('Topology/path contract passed.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
