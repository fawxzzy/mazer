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
    ['integratorWaveOwnership.decisionRef', registry?.integratorWaveOwnership?.decisionRef],
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

// Required ACTIVE owner per especially sensitive shared path -- an independent safety net
// alongside the registry JSON itself. Resolved against activePathOwners (below), which only
// counts status:'active' assignments: a wave that has completed and handed a path off no longer
// satisfies this check for that path, and cannot be used as an active exception.
const REQUIRED_INTEGRATOR_WAVE_BY_PATH = Object.freeze({
  'scripts/analysis/capture-auth-capability-surfaces.mjs': '0C',
  'scripts/analysis/capture-ui-surfaces.mjs': '0C',
  'scripts/analysis/live-auth-persistence-soak.mjs': '0C',
  'src/theme/tokens.ts': '1B',
  'src/theme/tokens.css': '1B',
  'src/scenes/diagnostics/menuSurfaceStateDiagnostics.ts': '1C',
  'src/scenes/diagnostics/menuLayoutBoundsDiagnostics.ts': '1C',
  'src/scenes/diagnostics/menuRenderDprDiagnostics.ts': '1C',
  'src/scenes/diagnostics/menuInputDiagnostics.ts': '1C',
  'src/scenes/diagnostics/menuWorldSemanticDiagnostics.ts': '1C',
  'src/scenes/diagnostics/menuCaptureMetadataDiagnostics.ts': '1C',
  'src/scenes/diagnostics/menuRuntimeDiagnosticsCompatibility.ts': '1C',
  'src/scenes/menuRuntimeDiagnostics.ts': '1C',
  'src/scenes/MenuScene.ts': '4D-A',
  'src/legacy-runtime/legacyAuth.ts': '3B',
  'src/legacy-runtime/legacyPlayerMessage.ts': '3B',
  'vite.config.ts': '5B',
  'package.json': '5B'
});

const INTEGRATOR_WAVE_STATUSES = Object.freeze(['active', 'completed']);

// Resolves the dependency graph and detects two structural defects a flat ordered list can't
// express: a dependsOn edge naming a wave that isn't itself a registered assignment, and a cycle
// (which would make "depends on" meaningless). Depth-first with a three-color visited set is
// sufficient at this graph's size and keeps the failure path a real cycle, not a stack overflow.
const collectWaveDependencyGraphViolations = (assignments) => {
  const violations = [];
  const waveIds = new Set(assignments.map((assignment) => assignment?.wave).filter(Boolean));
  const dependsOnByWave = new Map(assignments.map((assignment) => [
    assignment?.wave,
    Array.isArray(assignment?.dependsOn) ? assignment.dependsOn : []
  ]));

  for (const [wave, dependsOn] of dependsOnByWave) {
    for (const dependency of dependsOn) {
      if (!waveIds.has(dependency)) {
        violations.push(violation(
          'integrator-wave-dependency-missing',
          `integratorWaveOwnership.assignments[${wave}].dependsOn`,
          `Wave ${wave} depends on "${dependency}", which is not a registered wave.`
        ));
      }
    }
  }

  const UNVISITED = 0;
  const VISITING = 1;
  const VISITED = 2;
  const state = new Map(Array.from(waveIds, (wave) => [wave, UNVISITED]));
  const cyclesReported = new Set();

  const visit = (wave, path) => {
    if (state.get(wave) === VISITED) {
      return;
    }
    if (state.get(wave) === VISITING) {
      const cycleKey = [...path, wave].sort().join('>');
      if (!cyclesReported.has(cycleKey)) {
        cyclesReported.add(cycleKey);
        violations.push(violation(
          'integrator-wave-dependency-cycle',
          'integratorWaveOwnership.assignments',
          `dependency cycle detected: ${[...path, wave].join(' -> ')}.`
        ));
      }
      return;
    }
    state.set(wave, VISITING);
    for (const dependency of dependsOnByWave.get(wave) ?? []) {
      if (waveIds.has(dependency)) {
        visit(dependency, [...path, wave]);
      }
    }
    state.set(wave, VISITED);
  };

  for (const wave of waveIds) {
    visit(wave, []);
  }

  return violations;
};

// Only status:'active' assignments count as the current owner of a path -- a completed wave's
// paths remain in the registry as historical record but are not enforceable ownership going
// forward, and do not conflict with whichever wave is now active for that same path (a real,
// intended handoff, not a duplicate). Exported so both the git-diff ownership guards below and
// tests can resolve "who actively owns this path right now" from one authoritative place instead
// of each re-deriving it (and risking silently falling out of sync with each other).
export const resolveActivePathOwnersWithDuplicates = (assignments) => {
  const owners = new Map();
  const duplicates = [];
  for (const assignment of assignments) {
    if (assignment?.status !== 'active') {
      continue;
    }
    for (const path of (assignment?.paths ?? [])) {
      if (owners.has(path)) {
        duplicates.push({ path, first: owners.get(path), second: assignment.wave });
      } else {
        owners.set(path, assignment.wave);
      }
    }
  }
  return { owners, duplicates };
};

const checkIntegratorWaveOwnership = (registry) => {
  const violations = [];
  const staleDecisionPresent = (registry?.decisions ?? []).some((entry) => entry?.id === 'pr83-protected-paths-hold');
  if (staleDecisionPresent || registry?.prProtection !== undefined) {
    violations.push(violation(
      'obsolete-pr-hold-present',
      staleDecisionPresent ? 'decisions' : 'prProtection',
      'the superseded PR #83/#131 hold must not remain an active registry gate.'
    ));
  }

  const ownership = registry?.integratorWaveOwnership;
  if (!ownership || ownership.mode !== 'dependency-graph-single-active-owner' || !Array.isArray(ownership.assignments)) {
    violations.push(violation(
      'integrator-wave-ownership-missing',
      'integratorWaveOwnership',
      'shared UI/auth paths require dependency-graph single-active-owner wave assignments.'
    ));
    return violations;
  }

  const serializedOwnership = JSON.stringify(ownership);
  if (/claude\/mazer-pr83-fitness-auth-parity-successor/i.test(serializedOwnership)) {
    violations.push(violation(
      'obsolete-branch-binding',
      'integratorWaveOwnership',
      'current wave ownership must not require the obsolete PR #131 branch.'
    ));
  }

  const branchBindingKeys = new Set(['branch', 'branches', 'branchName', 'branchBinding']);
  for (const assignment of ownership.assignments) {
    const branchKey = Object.keys(assignment ?? {}).find((key) => branchBindingKeys.has(key));
    if (branchKey) {
      violations.push(violation(
        'branch-specific-wave-exception',
        `integratorWaveOwnership.assignments[${assignment?.wave ?? 'unknown'}].${branchKey}`,
        'integrator ownership is wave-bound, not branch-bound.'
      ));
    }
  }

  for (const assignment of ownership.assignments) {
    if (!INTEGRATOR_WAVE_STATUSES.includes(assignment?.status)) {
      violations.push(violation(
        'integrator-wave-status-invalid',
        `integratorWaveOwnership.assignments[${assignment?.wave ?? 'unknown'}]`,
        `status must be one of ${INTEGRATOR_WAVE_STATUSES.join(', ')}, found ${JSON.stringify(assignment?.status)}.`
      ));
    }
  }

  violations.push(...collectWaveDependencyGraphViolations(ownership.assignments));

  const { owners: activePathOwners, duplicates } = resolveActivePathOwnersWithDuplicates(ownership.assignments);
  for (const { path, first, second } of duplicates) {
    violations.push(violation(
      'duplicate-active-integrator-path-owner',
      `integratorWaveOwnership.assignments[${second}]`,
      `"${path}" is actively assigned to both Wave ${first} and Wave ${second}; exactly one wave may actively own a path at a time.`
    ));
  }

  for (const [path, expectedWave] of Object.entries(REQUIRED_INTEGRATOR_WAVE_BY_PATH)) {
    const actualWave = activePathOwners.get(path);
    if (actualWave !== expectedWave) {
      violations.push(violation(
        'integrator-path-wave-mismatch',
        path,
        `"${path}" must be actively owned by Wave ${expectedWave}, found ${actualWave ?? 'unassigned'}.`
      ));
    }
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
  ...checkIntegratorWaveOwnership(registry),
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

// Resolves which wave actively owns each assigned path right now -- ignores completed/historical
// assignments entirely, so a wave that has handed a path off cannot be used as an active exception
// for it, and the current active owner (e.g. Wave 4D-A for src/scenes/MenuScene.ts after the Wave
// 3A handoff) is the only one a real diff is checked against.
export const resolveActiveIntegratorPathOwners = (registry) => (
  resolveActivePathOwnersWithDuplicates(registry?.integratorWaveOwnership?.assignments ?? []).owners
);

// Pure, independently-testable: an assigned path may change only in its currently active
// integrator wave. Ownership is deliberately independent of branch names and old PRs, and a
// wave's own historical (completed) ownership of a path does not grant it permission to keep
// changing that path after an explicit handoff to a new active owner.
export const collectIntegratorWaveOwnershipViolations = (changedFiles, registry, claimedWave) => {
  const owners = resolveActiveIntegratorPathOwners(registry);
  const violations = [];
  for (const file of changedFiles) {
    const normalized = file.replace(/\\/g, '/');
    const assignedWave = owners.get(normalized);
    if (assignedWave && assignedWave !== claimedWave) {
      violations.push(violation(
        'integrator-wave-ownership-mismatch',
        normalized,
        `"${normalized}" belongs to integrator Wave ${assignedWave}, not ${claimedWave ?? 'an unspecified wave'}.`
      ));
    }
  }
  return violations;
};

// Wave-agnostic live-diff guard for shared CI and local architecture suites. A generic repository
// check cannot truthfully claim one historical wave for every future branch, but it can fail closed
// when one change set crosses two or more registered integrator owners. Packet-level exact path
// ceilings still bind the specific active wave; the pure claimed-wave checker above remains the
// authoritative unit for testing an explicit wave claim.
export const collectIntegratorWaveMixViolations = (changedFiles, registry) => {
  const owners = resolveActiveIntegratorPathOwners(registry);
  const ownedChanges = changedFiles
    .map((file) => file.replace(/\\/g, '/'))
    .map((path) => ({ path, wave: owners.get(path) }))
    .filter((entry) => typeof entry.wave === 'string');
  const waves = Array.from(new Set(ownedChanges.map((entry) => entry.wave))).sort();
  if (waves.length <= 1) {
    return [];
  }
  return ownedChanges.map(({ path, wave }) => violation(
    'integrator-wave-mix',
    path,
    `"${path}" belongs to Wave ${wave}; this change set spans registered Waves ${waves.join(', ')}.`
  ));
};

// Resolves which ref to diff HEAD against for *committed*-change detection. Tried in order:
// an explicit caller-supplied override, a manual `PROTECTED_PATH_BASE_REF` env var escape hatch,
// a CI-provided base ref (`GITHUB_BASE_REF`, set by GitHub Actions on `pull_request` events, in
// case this ever runs under CI in the future), then whichever of `origin/main` / `main` actually
// resolves in this checkout. Returns null (rather than throwing) if none resolve -- e.g. a
// shallow single-branch checkout with no remote and no local `main` -- so callers can degrade to
// uncommitted-only checking instead of crashing the whole guard.
const resolveProtectedPathBaseRef = (root, explicitBaseRef) => {
  const candidates = [
    explicitBaseRef,
    process.env.PROTECTED_PATH_BASE_REF,
    process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : undefined,
    'origin/main',
    'main'
  ].filter((candidate) => typeof candidate === 'string' && candidate.length > 0);

  for (const candidate of candidates) {
    try {
      execFileSync('git', ['rev-parse', '--verify', '--quiet', `${candidate}^{commit}`], {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore']
      });
      return candidate;
    } catch {
      continue;
    }
  }
  return null;
};

// Files that differ between HEAD and the merge-base with the resolved base ref -- i.e. everything
// a real PR branch has *committed*, independent of working-tree state. This is the half of the
// check that was previously missing entirely: once a branch is committed and pushed (the normal
// state of any real PR head, and of any CI checkout), `git status --short` alone is empty and a
// protected-path violation baked into history would go completely undetected.
const readGitCommittedChangedFiles = (root, explicitBaseRef) => {
  const baseRef = resolveProtectedPathBaseRef(root, explicitBaseRef);
  if (!baseRef) {
    return [];
  }

  let mergeBase;
  try {
    mergeBase = execFileSync('git', ['merge-base', baseRef, 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    return [];
  }
  if (!mergeBase) {
    return [];
  }

  try {
    const output = execFileSync('git', ['diff', '--name-only', mergeBase, 'HEAD'], { cwd: root, encoding: 'utf8' });
    return output.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);
  } catch {
    return [];
  }
};

// Uncommitted working-tree changes only (staged, unstaged, untracked) via `git status --short`.
// This is what the guard used to rely on *exclusively* -- correct for a live local edit, but blind
// to anything already committed.
const readGitUncommittedChangedFiles = (root) => {
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

// Union of committed (base...HEAD) and uncommitted (working tree) changed files, relative to
// repoRoot. Governance must catch both: a fully-committed, clean-status PR head (the normal state
// of anything actually mergeable) must not be read as "nothing changed" just because nothing is
// staged or dirty right now.
export const readGitChangedFiles = (root = repoRoot, options = {}) => {
  const uncommitted = readGitUncommittedChangedFiles(root);
  const committed = readGitCommittedChangedFiles(root, options.baseRef);
  return Array.from(new Set([...committed, ...uncommitted]));
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
