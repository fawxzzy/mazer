import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY_PATH = 'docs/contracts/mazer-ui-rework-decision-registry.v1.json';

export const readDecisionRegistry = (registryPath = REGISTRY_PATH) => (
  JSON.parse(readFileSync(resolve(repoRoot, registryPath), 'utf8'))
);

const violation = (rule, path, message) => ({ rule, path, message });

const collectKnownDecisionIds = (registry) => {
  const ids = Array.isArray(registry?.decisions) ? registry.decisions.map((entry) => entry.id) : [];
  return new Set(ids);
};

const checkDuplicateAndUnknownDecisionIds = (registry) => {
  const violations = [];
  const decisions = Array.isArray(registry?.decisions) ? registry.decisions : [];

  const seen = new Set();
  for (const entry of decisions) {
    if (seen.has(entry.id)) {
      violations.push(violation('duplicate-decision-id', 'decisions', `decision id "${entry.id}" is registered more than once.`));
    }
    seen.add(entry.id);
  }

  const knownIds = collectKnownDecisionIds(registry);
  const refSources = [
    ['renderOwnership.decisionRef', registry?.renderOwnership?.decisionRef],
    ['shippingPresentation.decisionRef', registry?.shippingPresentation?.decisionRef],
    ['watchPass.decisionRef', registry?.watchPass?.decisionRef],
    ['planet3d.decisionRef', registry?.planet3d?.decisionRef],
    ['menuSceneDecomposition.decisionRef', registry?.menuSceneDecomposition?.decisionRef],
    ['prProtection.decisionRef', registry?.prProtection?.decisionRef],
    ['redesignComplete.decisionRef', registry?.redesignComplete?.decisionRef]
  ];
  for (const [path, ref] of refSources) {
    if (ref !== undefined && ref !== null && !knownIds.has(ref)) {
      violations.push(violation('unknown-decision-reference', path, `references unknown decision id "${ref}".`));
    }
  }

  for (const entry of (registry?.themes?.registry ?? [])) {
    for (const ref of entry.decisionRef ? [entry.decisionRef] : []) {
      if (!knownIds.has(ref)) {
        violations.push(violation('unknown-decision-reference', `themes.registry[${entry.id}]`, `references unknown decision id "${ref}".`));
      }
    }
  }

  for (const entry of (registry?.profiles?.registry ?? [])) {
    for (const ref of entry.decisionRef ? [entry.decisionRef] : []) {
      if (!knownIds.has(ref)) {
        violations.push(violation('unknown-decision-reference', `profiles.registry[${entry.id}]`, `references unknown decision id "${ref}".`));
      }
    }
  }

  for (const entry of (registry?.entrypoints ?? [])) {
    for (const ref of entry.decisionRefs ?? []) {
      if (!knownIds.has(ref)) {
        violations.push(violation('unknown-decision-reference', `entrypoints[${entry.entrypoint}]`, `references unknown decision id "${ref}".`));
      }
    }
  }

  return violations;
};

const checkThemesAndProfiles = (registry) => {
  const violations = [];
  const themeEntries = registry?.themes?.registry ?? [];
  const profileEntries = registry?.profiles?.registry ?? [];

  const canonicalPublicThemes = themeEntries.filter((entry) => entry.role === 'canonical' && entry.public === true);
  if (canonicalPublicThemes.length > 1) {
    violations.push(violation(
      'multiple-canonical-themes',
      'themes.registry',
      `more than one theme is registered as canonical/public: ${canonicalPublicThemes.map((entry) => entry.id).join(', ')}. Only one canonical player-facing theme is permitted.`
    ));
  }
  if (canonicalPublicThemes.length === 0) {
    violations.push(violation(
      'no-canonical-theme',
      'themes.registry',
      'no theme is registered as canonical/public; exactly one canonical player-facing theme is required.'
    ));
  }

  const themeIds = new Set(themeEntries.map((entry) => entry.id));
  const profileIds = new Set(profileEntries.map((entry) => entry.id));

  for (const entry of themeEntries) {
    if (entry.kind !== 'theme') {
      violations.push(violation('theme-kind-mismatch', `themes.registry[${entry.id}]`, `theme entry "${entry.id}" must have kind "theme", found "${entry.kind}".`));
    }
  }

  for (const entry of profileEntries) {
    if (entry.kind !== 'profile') {
      violations.push(violation(
        'profile-mislabeled-as-theme',
        `profiles.registry[${entry.id}]`,
        `output profile "${entry.id}" must have kind "profile", found "${entry.kind}". Profiles vary layout/density, not brand identity.`
      ));
    }
    if (themeIds.has(entry.id)) {
      violations.push(violation(
        'profile-mislabeled-as-theme',
        `profiles.registry[${entry.id}]`,
        `"${entry.id}" is registered as both a profile and a theme.`
      ));
    }
  }

  for (const entry of themeEntries) {
    if (profileIds.has(entry.id) && entry.role === 'canonical') {
      violations.push(violation(
        'profile-mislabeled-as-theme',
        `themes.registry[${entry.id}]`,
        `"${entry.id}" is a registered output profile but is also registered as a canonical theme.`
      ));
    }
  }

  return violations;
};

const checkWatchPass = (registry) => {
  const violations = [];
  if (registry?.watchPass?.productionBillingClaim !== false) {
    violations.push(violation(
      'watch-pass-billing-claim',
      'watchPass.productionBillingClaim',
      'Watch Pass must not claim production billing/entitlement; productionBillingClaim must be exactly false.'
    ));
  }
  return violations;
};

const checkPlanet3d = (registry) => {
  const violations = [];
  if (registry?.planet3d?.includedInCoreV1 !== false) {
    violations.push(violation(
      'planet3d-in-core-release-set',
      'planet3d.includedInCoreV1',
      'Planet 3D must remain excluded from core-v1 release acceptance; includedInCoreV1 must be exactly false.'
    ));
  }

  const coreSet = registry?.coreReleaseAcceptanceSet ?? [];
  if (coreSet.includes('planet3d.html')) {
    violations.push(violation(
      'planet3d-in-core-release-set',
      'coreReleaseAcceptanceSet',
      'planet3d.html must never appear in coreReleaseAcceptanceSet.'
    ));
  }

  return violations;
};

const checkShippingPresentation = (registry) => {
  const violations = [];
  const presentation = registry?.shippingPresentation ?? {};
  if (presentation.default !== 'corridor') {
    violations.push(violation(
      'tile-square-shipping-default',
      'shippingPresentation.default',
      `shipping default must be "corridor", found "${presentation.default}".`
    ));
  }
  if (presentation.tileSquareIsDefault !== false) {
    violations.push(violation(
      'tile-square-shipping-default',
      'shippingPresentation.tileSquareIsDefault',
      'tileSquareIsDefault must be exactly false; visible tile squares are optional proof/debug treatment only.'
    ));
  }
  return violations;
};

// Fixed baseline classification per entrypoint, sourced from the bundle's
// spec/surface-disposition.json. This is intentionally a constant independent of whatever the
// (possibly mutated) registry under test claims, so the checker can detect a reclassification
// away from that baseline rather than just re-reading whatever the registry currently says.
const BASELINE_ENTRYPOINT_CLASSIFICATIONS = Object.freeze({
  'index.html': 'product',
  'proof-surfaces.html': 'internal',
  'watch-pass-setup.html': 'incubator',
  'watch-pass-preview.html': 'incubator',
  'watch-pass-paywall.html': 'incubator-commerce-prototype',
  'visual-proof.html': 'internal',
  'future-phaser.html': 'retire',
  'planet3d.html': 'lab'
});

// A proof/incubator/lab/retire entrypoint (per its fixed baseline classification) may only be
// promoted to `classification: "product"` or `releaseGate: true` if it carries an explicit
// decisionRefs entry justifying why. Entrypoints whose baseline is already "product" (index.html)
// need no extra justification — they are release-gated by definition.
const checkEntrypointReclassification = (registry) => {
  const violations = [];
  for (const entry of (registry?.entrypoints ?? [])) {
    const baselineClassification = BASELINE_ENTRYPOINT_CLASSIFICATIONS[entry.entrypoint];
    const isKnownNonProductBaseline = baselineClassification !== undefined && baselineClassification !== 'product';
    if (!isKnownNonProductBaseline) {
      continue;
    }

    const promoted = entry.classification === 'product' || entry.releaseGate === true;
    if (!promoted) {
      continue;
    }

    const hasJustification = Array.isArray(entry.decisionRefs) && entry.decisionRefs.length > 0;
    if (!hasJustification) {
      violations.push(violation(
        'entrypoint-reclassified-without-justification',
        `entrypoints[${entry.entrypoint}]`,
        `entrypoint "${entry.entrypoint}" (baseline classification "${baselineClassification}") is now classification "${entry.classification}" with releaseGate: ${entry.releaseGate} but has no decisionRefs justifying the reclassification.`
      ));
    }
  }
  return violations;
};

const checkRedesignComplete = (registry) => {
  const violations = [];
  const claim = registry?.redesignComplete ?? {};
  if (claim.claimed === true && !claim.acceptanceEvidenceRef) {
    violations.push(violation(
      'redesign-complete-without-evidence',
      'redesignComplete',
      'redesignComplete.claimed is true but acceptanceEvidenceRef is empty; a "redesign complete" claim requires a reference to acceptance evidence.'
    ));
  }
  return violations;
};

export const collectDecisionRegistryViolations = (registry) => ([
  ...checkDuplicateAndUnknownDecisionIds(registry),
  ...checkThemesAndProfiles(registry),
  ...checkWatchPass(registry),
  ...checkPlanet3d(registry),
  ...checkShippingPresentation(registry),
  ...checkEntrypointReclassification(registry),
  ...checkRedesignComplete(registry)
]);

export const collectEntrypointExistenceViolations = (registry, root = repoRoot) => {
  const violations = [];
  for (const entry of (registry?.entrypoints ?? [])) {
    const entrypointPath = resolve(root, entry.entrypoint);
    if (!existsSync(entrypointPath)) {
      violations.push(violation(
        'entrypoint-missing-from-repo',
        entry.entrypoint,
        `registry references "${entry.entrypoint}" but it does not exist in the live repository at ${entrypointPath}.`
      ));
    }
  }
  return violations;
};

// Pure, independently-testable: given a list of changed/untracked file paths (repo-relative,
// forward-slash), flag any that match a protected path from the registry's prProtection list.
export const collectProtectedPathViolations = (changedFiles, registry) => {
  const protectedPaths = new Set(registry?.prProtection?.protectedPaths ?? []);
  const violations = [];
  for (const file of changedFiles) {
    const normalized = file.replace(/\\/g, '/');
    if (protectedPaths.has(normalized)) {
      violations.push(violation(
        'protected-path-touched',
        normalized,
        `"${normalized}" is a PR #83/#82 protected path (prProtection.protectedPaths) and must not be modified by Wave 0A.`
      ));
    }
  }
  return violations;
};

// Reads real `git status --short` output relative to repoRoot and returns the changed file list.
export const readGitChangedFiles = (root = repoRoot) => {
  const output = execFileSync('git', ['status', '--short'], { cwd: root, encoding: 'utf8' });
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      // porcelain short format: "XY path" or "XY orig -> path" for renames
      const withoutStatus = line.slice(2).trim();
      const arrowIndex = withoutStatus.indexOf(' -> ');
      const path = arrowIndex === -1 ? withoutStatus : withoutStatus.slice(arrowIndex + 4);
      return path.replace(/^"(.*)"$/, '$1');
    });
};

export const formatViolations = (violations) => {
  if (violations.length === 0) {
    return 'Decision registry contract passed.';
  }
  return [
    'Decision registry contract failed:',
    ...violations.map((entry) => `- [${entry.rule}] ${entry.path}: ${entry.message}`)
  ].join('\n');
};

export const checkDecisionRegistry = (registry = readDecisionRegistry(), root = repoRoot) => {
  const violations = [
    ...collectDecisionRegistryViolations(registry),
    ...collectEntrypointExistenceViolations(registry, root)
  ];
  if (violations.length > 0) {
    const error = new Error(formatViolations(violations));
    error.violations = violations;
    throw error;
  }
  return true;
};

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    checkDecisionRegistry();
    console.log('Decision registry contract passed.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
