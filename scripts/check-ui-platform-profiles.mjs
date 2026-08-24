import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGitChangedFiles } from './check-decision-registry.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PROFILE_PATH = 'docs/contracts/mazer-ui-rework-platform-profiles.v1.json';
const DECISION_REGISTRY_PATH = 'docs/contracts/mazer-ui-rework-decision-registry.v1.json';

export const EXPECTED_PLATFORM_PROFILES = Object.freeze({
  web: { auth: true, sync: true, input: ['keyboard', 'pointer', 'touch'], chrome: 'full' },
  mobile: { auth: true, sync: true, input: ['touch', 'keyboard'], chrome: 'compact' },
  desktop: { auth: true, sync: true, input: ['keyboard', 'pointer'], chrome: 'full' },
  tv: { auth: 'configurable', sync: 'optional', input: ['controller', 'remote'], chrome: 'distance' },
  obs: { auth: false, sync: 'optional', input: ['external'], chrome: 'minimal' },
  arcade: { auth: false, sync: 'optional', input: ['hardware'], chrome: 'kiosk' },
  cyberdeck: { auth: 'optional', sync: 'optional', input: ['hardware', 'touch', 'keyboard'], chrome: 'configurable' }
});

export const readPlatformProfiles = (profilePath = PROFILE_PATH, root = repoRoot) => (
  JSON.parse(readFileSync(resolve(root, profilePath), 'utf8'))
);

export const readDecisionRegistryForProfiles = (registryPath = DECISION_REGISTRY_PATH, root = repoRoot) => (
  JSON.parse(readFileSync(resolve(root, registryPath), 'utf8'))
);

const violation = (rule, path, message) => ({ rule, path, message });

const stableJson = (value) => JSON.stringify(value);

export const collectPlatformProfileViolations = (registry, root = repoRoot) => {
  const violations = [];
  const profiles = registry?.profiles;
  if (!profiles || typeof profiles !== 'object' || Array.isArray(profiles)) {
    return [violation('profiles-missing', 'profiles', 'profiles must be an object containing all seven authoritative profiles.')];
  }

  const expectedIds = Object.keys(EXPECTED_PLATFORM_PROFILES);
  const actualIds = Object.keys(profiles);
  for (const id of expectedIds) {
    if (!(id in profiles)) {
      violations.push(violation('profile-missing', `profiles.${id}`, `authoritative profile "${id}" is missing.`));
      continue;
    }
    if (stableJson(profiles[id]) !== stableJson(EXPECTED_PLATFORM_PROFILES[id])) {
      violations.push(violation('profile-contract-drift', `profiles.${id}`, `profile "${id}" differs from spec/platform-profiles.json.`));
    }
  }
  for (const id of actualIds) {
    if (!(id in EXPECTED_PLATFORM_PROFILES)) {
      violations.push(violation('unknown-profile', `profiles.${id}`, `profile "${id}" is not authoritative.`));
    }
  }

  const duplicateInputs = Object.entries(profiles).filter(([, profile]) => (
    Array.isArray(profile?.input) && new Set(profile.input).size !== profile.input.length
  ));
  for (const [id] of duplicateInputs) {
    violations.push(violation('duplicate-profile-input', `profiles.${id}.input`, 'profile input capabilities must be unique.'));
  }

  let decisions;
  try {
    decisions = readDecisionRegistryForProfiles(DECISION_REGISTRY_PATH, root);
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

export const collectWaveOwnershipViolationsForProfiles = (changedFiles, decisionRegistry) => {
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

export const readGitChangedFilesForProfiles = (root = repoRoot, options = {}) => readGitChangedFiles(root, options);

export const formatViolations = (violations) => violations.length === 0
  ? 'Platform profile contract passed.'
  : ['Platform profile contract failed:', ...violations.map((entry) => `- [${entry.rule}] ${entry.path}: ${entry.message}`)].join('\n');

export const checkPlatformProfiles = (registry = readPlatformProfiles(), root = repoRoot) => {
  const violations = collectPlatformProfileViolations(registry, root);
  if (violations.length > 0) {
    const error = new Error(formatViolations(violations));
    error.violations = violations;
    throw error;
  }
  return true;
};

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    checkPlatformProfiles();
    console.log('Platform profile contract passed.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
