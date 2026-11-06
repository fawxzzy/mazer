// Pure (no src/ TypeScript imports) helpers for versioned AI run seed packs:
// schema validation, content hashing, baseline-report shaping, markdown
// rendering and idempotent coverage accounting. The generator/AI execution
// lives in ai-run-seed-pack-runner.ts so this module stays loadable by plain
// node and by the corpus-audit unit tests.
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const MAZER_AI_RUN_SEED_PACK_SCHEMA = 'mazer.ai-run-seed-pack.v1';
export const MAZER_AI_RUN_SEED_PACK_BASELINE_SCHEMA = 'mazer.ai-run-seed-pack-baseline.v1';
export const MAZER_AI_RUN_SEED_PACK_COVERAGE_SCHEMA = 'mazer.ai-run-seed-pack-coverage.v1';
export const MAZER_AI_RUN_SEED_PACK_RUNNER_CONTRACT = 'menu-demo-advance-walker-v1';

export const MAZER_AI_RUN_SEED_PACK_PURPOSES = ['representative', 'stress', 'wrap-anomaly'];
// Mirrors LegacyProgressionDifficultyBand. Bands are coverage LABELS only: a
// pack target never derives its generation parameters from a band, it carries
// them explicitly (see generationProfile / scale / selection).
export const MAZER_AI_RUN_SEED_PACK_BANDS = [
  'tutorial',
  'starter',
  'explorer',
  'navigator',
  'architect',
  'mythic'
];
export const MAZER_AI_RUN_SEED_PACK_RANKS = ['E', 'D', 'C', 'B', 'A', 'S'];
export const MAZER_AI_RUN_SEED_PACK_BIAS_PROFILES = [
  'balanced', 'direct-chaser', 'wall-follower', 'shortcut-gambler', 'cautious-mapper', 'speedrunner'
];

// Field -> validator for LegacyMazeGenerationProfile. Ranges mirror
// normalizeLegacyMazeGenerationProfile's clamps so an explicit profile is also
// the effective profile; the runner double-checks this at run time.
const nullableInt = (min, max) => (value) => value === null || (Number.isInteger(value) && value >= min && value <= max);
const boundedNumber = (min, max) => (value) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const boundedInt = (min, max) => (value) => Number.isInteger(value) && value >= min && value <= max;
const GENERATION_PROFILE_FIELDS = {
  borderFeederTargetPerSide: nullableInt(0, 8),
  checkpointCountMultiplier: boundedNumber(0.2, 1.6),
  checkpointCountOverride: nullableInt(1, 400),
  maxDeadEndCount: nullableInt(0, 999),
  minCheckpoints: boundedInt(1, 50),
  routeQualityReinforcementMultiplier: boundedNumber(0, 2),
  shortcutCountMultiplier: boundedNumber(0, 2),
  straightnessBias: boundedNumber(0, 1)
};

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

export const roundTo = (value, precision = 3) => {
  if (!Number.isFinite(value)) return null;
  const scale = 10 ** precision;
  return Math.round(value * scale) / scale;
};

// Key-sorted JSON, no insignificant whitespace: the single serialisation used
// for hashing so that key order in a hand-edited fixture never changes a hash.
export const canonicalJson = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
};

export const sha256Hex = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

export const hashSeedPack = (pack) => {
  const { hash: _ignored, ...body } = pack;
  return `sha256:${sha256Hex(canonicalJson(body))}`;
};

export const sealSeedPack = (pack) => ({ ...pack, hash: hashSeedPack(pack) });

const exactKeys = (record, allowed, label, errors) => {
  for (const key of Object.keys(record)) {
    if (!allowed.includes(key)) errors.push(`${label}: unknown field "${key}"`);
  }
  for (const key of allowed) {
    if (!(key in record)) errors.push(`${label}: missing field "${key}"`);
  }
};

export const validateSeedPack = (pack) => {
  const errors = [];
  if (!isRecord(pack)) return { ok: false, errors: ['pack: must be an object'] };
  exactKeys(pack, [
    'schema', 'packId', 'packVersion', 'purpose', 'description', 'runnerContract', 'targets', 'hash'
  ], 'pack', errors);
  if (pack.schema !== MAZER_AI_RUN_SEED_PACK_SCHEMA) errors.push(`pack: schema must be ${MAZER_AI_RUN_SEED_PACK_SCHEMA}`);
  if (typeof pack.packId !== 'string' || !/^[a-z0-9][a-z0-9.-]*$/.test(pack.packId)) errors.push('pack: packId must be a lowercase slug');
  if (typeof pack.packVersion !== 'string' || !/^\d+\.\d+\.\d+$/.test(pack.packVersion)) errors.push('pack: packVersion must be semver');
  if (!MAZER_AI_RUN_SEED_PACK_PURPOSES.includes(pack.purpose)) errors.push('pack: purpose must be representative|stress|wrap-anomaly');
  if (typeof pack.description !== 'string' || pack.description.length === 0) errors.push('pack: description required');
  if (pack.runnerContract !== MAZER_AI_RUN_SEED_PACK_RUNNER_CONTRACT) errors.push(`pack: runnerContract must be ${MAZER_AI_RUN_SEED_PACK_RUNNER_CONTRACT}`);
  if (!Array.isArray(pack.targets) || pack.targets.length === 0) {
    errors.push('pack: targets must be a non-empty array');
  } else {
    const targetIds = new Set();
    pack.targets.forEach((target, index) => {
      const label = `targets[${index}]`;
      if (!isRecord(target)) { errors.push(`${label}: must be an object`); return; }
      exactKeys(target, [
        'targetId', 'band', 'levelRangeHint', 'scale', 'aspectRatio', 'selection', 'generationProfile', 'ai', 'seeds'
      ], label, errors);
      if (typeof target.targetId !== 'string' || !/^[a-z0-9][a-z0-9.-]*$/.test(target.targetId)) errors.push(`${label}: targetId must be a slug`);
      else if (targetIds.has(target.targetId)) errors.push(`${label}: duplicate targetId ${target.targetId}`);
      else targetIds.add(target.targetId);
      if (!MAZER_AI_RUN_SEED_PACK_BANDS.includes(target.band)) errors.push(`${label}: band must be one of ${MAZER_AI_RUN_SEED_PACK_BANDS.join('|')}`);
      if (target.levelRangeHint !== null && !(isRecord(target.levelRangeHint)
        && Number.isInteger(target.levelRangeHint.min) && Number.isInteger(target.levelRangeHint.max)
        && target.levelRangeHint.min >= 1 && target.levelRangeHint.max >= target.levelRangeHint.min)) {
        errors.push(`${label}: levelRangeHint must be null or {min,max} (informational only)`);
      }
      if (!Number.isInteger(target.scale) || target.scale < 5 || target.scale > 150) errors.push(`${label}: scale must be an integer 5..150`);
      if (!(typeof target.aspectRatio === 'number' && target.aspectRatio >= 0.25 && target.aspectRatio <= 4)) errors.push(`${label}: aspectRatio must be a number 0.25..4`);
      if (!isRecord(target.selection)) errors.push(`${label}: selection must be an object`);
      else {
        exactKeys(target.selection, ['targetComplexity', 'candidateCount', 'tolerance'], `${label}.selection`, errors);
        if (!boundedInt(0, 999)(target.selection.targetComplexity)) errors.push(`${label}.selection: targetComplexity must be an integer 0..999`);
        if (!boundedInt(1, 9)(target.selection.candidateCount)) errors.push(`${label}.selection: candidateCount must be an integer 1..9`);
        if (!boundedInt(0, 999)(target.selection.tolerance)) errors.push(`${label}.selection: tolerance must be an integer 0..999`);
      }
      if (!isRecord(target.generationProfile)) errors.push(`${label}: generationProfile must be an object`);
      else {
        const profile = target.generationProfile;
        exactKeys(profile, [...Object.keys(GENERATION_PROFILE_FIELDS), 'requiredOppositeBorderConnections'], `${label}.generationProfile`, errors);
        for (const [field, isValid] of Object.entries(GENERATION_PROFILE_FIELDS)) {
          if (field in profile && !isValid(profile[field])) errors.push(`${label}.generationProfile: invalid ${field}`);
        }
        const connections = profile.requiredOppositeBorderConnections;
        if (!isRecord(connections) || typeof connections.horizontal !== 'boolean' || typeof connections.vertical !== 'boolean') {
          errors.push(`${label}.generationProfile: requiredOppositeBorderConnections must be {horizontal:boolean,vertical:boolean}`);
        }
      }
      if (!isRecord(target.ai)) errors.push(`${label}: ai must be an object`);
      else {
        exactKeys(target.ai, ['skillLevel', 'skillRank', 'biasProfile'], `${label}.ai`, errors);
        if (!boundedInt(1, 999)(target.ai.skillLevel)) errors.push(`${label}.ai: skillLevel must be an integer 1..999`);
        if (!MAZER_AI_RUN_SEED_PACK_RANKS.includes(target.ai.skillRank)) errors.push(`${label}.ai: skillRank must be E..S`);
        if (target.ai.biasProfile !== null && !MAZER_AI_RUN_SEED_PACK_BIAS_PROFILES.includes(target.ai.biasProfile)) errors.push(`${label}.ai: biasProfile must be null or a known bias profile`);
      }
      if (!Array.isArray(target.seeds) || target.seeds.length === 0) errors.push(`${label}: seeds must be a non-empty array`);
      else {
        if (!target.seeds.every((seed) => Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff)) errors.push(`${label}: seeds must be uint32 integers`);
        if (new Set(target.seeds).size !== target.seeds.length) errors.push(`${label}: seeds must be unique`);
      }
    });
  }
  if (typeof pack.hash !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(pack.hash)) errors.push('pack: hash must be sha256:<hex>');
  else if (errors.length === 0 && pack.hash !== hashSeedPack(pack)) errors.push('pack: hash does not match pack content (re-seal after editing)');
  return { ok: errors.length === 0, errors };
};

export const assertValidSeedPack = (pack) => {
  const { ok, errors } = validateSeedPack(pack);
  if (!ok) throw new Error(`Invalid seed pack: ${errors.join('; ')}`);
  return pack;
};

export const countSeedPackCases = (pack) => pack.targets.reduce((total, target) => total + target.seeds.length, 0);

// ---- baseline shaping ------------------------------------------------------

export const summarizeNumbers = (values) => {
  const safe = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (safe.length === 0) return { count: 0, min: null, median: null, max: null, mean: null };
  const middle = Math.floor(safe.length / 2);
  const median = safe.length % 2 === 0 ? (safe[middle - 1] + safe[middle]) / 2 : safe[middle];
  return {
    count: safe.length,
    min: roundTo(safe[0]),
    median: roundTo(median),
    max: roundTo(safe[safe.length - 1]),
    mean: roundTo(safe.reduce((total, value) => total + value, 0) / safe.length)
  };
};

const countBy = (items, keyOf) => {
  const counts = {};
  for (const item of items) {
    const key = String(keyOf(item) ?? 'missing');
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
};

// Case rows are the unit of evidence. Everything below is derived from them,
// which keeps the aggregate math testable without running the generator.
export const summarizeBaselineCases = (cases) => ({
  caseCount: cases.length,
  reachedGoalCount: cases.filter((entry) => entry.reachedGoal).length,
  resetUsedCount: cases.filter((entry) => entry.resetUsed).length,
  wrappedMazeCount: cases.filter((entry) => entry.edgeWrapCount > 0).length,
  actualShorterThanBenchmarkCount: cases.filter((entry) => entry.playerPathLength < entry.shortestPathLength).length,
  profileNormalizationDriftCount: cases.filter((entry) => !entry.generationProfileNormalized).length,
  aiSignalCounts: countBy(cases, (entry) => entry.aiSignal),
  runQualitySignalCounts: countBy(cases, (entry) => entry.runQualitySignal),
  selectionDeliveryCounts: countBy(cases, (entry) => entry.selectionDelivery),
  measuredComplexity: summarizeNumbers(cases.map((entry) => entry.measuredComplexity)),
  edgeWrapCount: summarizeNumbers(cases.map((entry) => entry.edgeWrapCount)),
  shortestPathLength: summarizeNumbers(cases.map((entry) => entry.shortestPathLength)),
  playerPathLength: summarizeNumbers(cases.map((entry) => entry.playerPathLength)),
  routeOverrunRatio: summarizeNumbers(cases.map((entry) => entry.routeOverrunRatio)),
  runQualityTotal: summarizeNumbers(cases.map((entry) => entry.runQualityTotal)),
  aiPressureScore: summarizeNumbers(cases.map((entry) => entry.aiPressureScore)),
  coverageRatio: summarizeNumbers(cases.map((entry) => entry.coverageRatio))
});

export const digestBaselineBody = (body) => `sha256:${sha256Hex(canonicalJson(body))}`;

export const createBaselineReportFromCases = ({ pack, cases, environment }) => {
  const targets = pack.targets.map((target) => {
    const targetCases = cases.filter((entry) => entry.targetId === target.targetId);
    return {
      targetId: target.targetId,
      band: target.band,
      scale: target.scale,
      aspectRatio: target.aspectRatio,
      selection: target.selection,
      generationProfile: target.generationProfile,
      ai: target.ai,
      summary: summarizeBaselineCases(targetCases)
    };
  });
  const body = {
    schema: MAZER_AI_RUN_SEED_PACK_BASELINE_SCHEMA,
    pack: {
      packId: pack.packId,
      packVersion: pack.packVersion,
      hash: pack.hash,
      purpose: pack.purpose,
      runnerContract: pack.runnerContract
    },
    environment,
    dataPolicy: {
      fixturesAndGeneratedMazesOnly: true,
      accountDataAccessed: false,
      liveDatabaseAccessed: false,
      progressionMutationPerformed: false,
      receiptsPersisted: false,
      rawPathsExcluded: true,
      scoringOrReceiptContractChanged: false
    },
    totals: summarizeBaselineCases(cases),
    targets,
    cases
  };
  return { ...body, resultDigest: digestBaselineBody(body) };
};

const fixed = (value, digits = 3) => (value === null || value === undefined ? 'n/a' : Number(value).toFixed(digits).replace(/\.?0+$/, '') || '0');

export const renderBaselineMarkdown = (report) => {
  const lines = [
    `# AI run seed pack baseline: ${report.pack.packId} v${report.pack.packVersion}`,
    '',
    `- Pack hash: \`${report.pack.hash}\``,
    `- Result digest: \`${report.resultDigest}\``,
    `- Purpose: ${report.pack.purpose}; runner contract: \`${report.pack.runnerContract}\``,
    `- AI scorer: \`${report.environment.aiScorer.id}@${report.environment.aiScorer.version}\`; run-quality scorer: \`${report.environment.runQualityScorer.id}@${report.environment.runQualityScorer.version}\` (${report.environment.runQualityScorer.shortestPathModel})`,
    `- Cases: ${report.totals.caseCount}; reached goal: ${report.totals.reachedGoalCount}; reset used: ${report.totals.resetUsedCount}; wrapped mazes: ${report.totals.wrappedMazeCount}; path shorter than benchmark: ${report.totals.actualShorterThanBenchmarkCount}`,
    '- Data policy: fixtures and generated mazes only; no account data, database, or progression state touched.',
    '',
    '| target | band | scale | cases | goal | reset | wrapped | complexity (med) | run quality (med/min) | AI pressure (med) | overrun ratio (med) |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: |'
  ];
  for (const target of report.targets) {
    const s = target.summary;
    lines.push(`| ${target.targetId} | ${target.band} | ${target.scale} | ${s.caseCount} | ${s.reachedGoalCount} | ${s.resetUsedCount} | ${s.wrappedMazeCount} | ${fixed(s.measuredComplexity.median)} | ${fixed(s.runQualityTotal.median)}/${fixed(s.runQualityTotal.min)} | ${fixed(s.aiPressureScore.median)} | ${fixed(s.routeOverrunRatio.median)} |`);
  }
  lines.push('', 'Generation parameters are carried explicitly per target in the pack and this report (not derived from level or band), so a later generation change shows up as a changed result digest for an unchanged pack hash.', '');
  return lines.join('\n');
};

// ---- coverage accounting ---------------------------------------------------

const readJsonIfPresent = async (path) => {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
};

export const loadSeedPackDirectory = async (directory) => {
  const names = (await readdir(directory)).filter((name) => name.endsWith('.pack.json')).sort();
  const packs = [];
  for (const name of names) packs.push({ file: name, pack: JSON.parse(await readFile(join(directory, name), 'utf8')) });
  return packs;
};

export const baselineFileNameForPack = (pack) => `${pack.packId}.v${pack.packVersion}.baseline.json`;

export const loadBaselineForPack = async (directory, pack) => (
  readJsonIfPresent(join(directory, 'baselines', baselineFileNameForPack(pack)))
);

// Pure function of (packs, baselines): re-running it, or re-running the
// baseline generator, can never change the accounting by itself. States:
//   current      baseline exists and its pack hash matches the pack
//   stale        baseline exists for the pack id+version but the pack content changed
//   missing      no baseline committed for the pack
//   invalid      the pack fails schema/hash validation
export const createSeedPackCoverageReport = (entries) => {
  const sorted = [...entries].sort((left, right) => String(left.pack?.packId).localeCompare(String(right.pack?.packId)));
  const packs = sorted.map(({ file, pack, baseline }) => {
    const validation = validateSeedPack(pack);
    const state = !validation.ok
      ? 'invalid'
      : !baseline ? 'missing' : baseline.pack?.hash === pack.hash ? 'current' : 'stale';
    return {
      file,
      packId: pack?.packId ?? null,
      packVersion: pack?.packVersion ?? null,
      purpose: pack?.purpose ?? null,
      hash: pack?.hash ?? null,
      state,
      errors: validation.errors,
      caseCount: validation.ok ? countSeedPackCases(pack) : 0,
      targetIds: validation.ok ? pack.targets.map((target) => target.targetId) : [],
      bands: validation.ok ? [...new Set(pack.targets.map((target) => target.band))].sort() : [],
      baselineResultDigest: baseline?.resultDigest ?? null
    };
  });
  const bandCoverage = {};
  for (const band of MAZER_AI_RUN_SEED_PACK_BANDS) {
    const covering = sorted
      .filter(({ pack }) => validateSeedPack(pack).ok && pack.targets.some((target) => target.band === band))
      .map(({ pack }) => pack.packId);
    const baselined = packs.filter((entry) => entry.state === 'current' && entry.bands.includes(band)).map((entry) => entry.packId);
    bandCoverage[band] = { packs: covering.sort(), baselinedPacks: baselined.sort(), covered: baselined.length > 0 };
  }
  const purposeCoverage = {};
  for (const purpose of MAZER_AI_RUN_SEED_PACK_PURPOSES) {
    purposeCoverage[purpose] = packs.filter((entry) => entry.purpose === purpose && entry.state === 'current').map((entry) => entry.packId).sort();
  }
  return {
    schema: MAZER_AI_RUN_SEED_PACK_COVERAGE_SCHEMA,
    packs,
    bandCoverage,
    purposeCoverage,
    uncoveredBands: MAZER_AI_RUN_SEED_PACK_BANDS.filter((band) => !bandCoverage[band].covered),
    uncoveredPurposes: MAZER_AI_RUN_SEED_PACK_PURPOSES.filter((purpose) => purposeCoverage[purpose].length === 0),
    allPacksCurrent: packs.length > 0 && packs.every((entry) => entry.state === 'current')
  };
};

export const loadSeedPackCoverageInputs = async (directory) => {
  const loaded = await loadSeedPackDirectory(directory);
  const entries = [];
  for (const { file, pack } of loaded) {
    const baseline = validateSeedPack(pack).ok ? await loadBaselineForPack(directory, pack) : null;
    entries.push({ file, pack, baseline });
  }
  return entries;
};

export const renderCoverageMarkdown = (coverage) => {
  const lines = [
    '# AI run seed pack coverage',
    '',
    `- All packs current: ${coverage.allPacksCurrent ? 'yes' : 'no'}`,
    `- Uncovered bands: ${coverage.uncoveredBands.length === 0 ? 'none' : coverage.uncoveredBands.join(', ')}`,
    `- Purposes without a current baseline: ${coverage.uncoveredPurposes.length === 0 ? 'none' : coverage.uncoveredPurposes.join(', ')}`,
    '',
    '| pack | version | purpose | state | cases | bands |',
    '| --- | --- | --- | --- | ---: | --- |'
  ];
  for (const entry of coverage.packs) {
    lines.push(`| ${entry.packId} | ${entry.packVersion} | ${entry.purpose} | ${entry.state} | ${entry.caseCount} | ${entry.bands.join(', ')} |`);
  }
  lines.push('');
  return lines.join('\n');
};
