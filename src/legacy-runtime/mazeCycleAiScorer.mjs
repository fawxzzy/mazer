export const MAZE_CYCLE_AI_SCORER_ID = 'mazer.maze-cycle-ai-decision-pressure';
export const MAZE_CYCLE_AI_SCORER_VERSION = '1.0.0';

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const normalizeCount = (value) => (
  typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0
);

const roundScore = (value) => {
  const rounded = Math.round(value * 1000) / 1000;
  return Math.max(0, Math.min(100, rounded));
};

export const scoreMazeCycleAiDecisionSummary = (summary) => {
  if (!isRecord(summary)) {
    return null;
  }

  const decisionCount = Math.max(1, normalizeCount(summary.decisionCount));
  const wrongBranchCount = normalizeCount(summary.wrongBranchCount);
  const optionalRetargetCount = normalizeCount(summary.optionalRetargetCount);
  const visitedUndoCount = normalizeCount(summary.visitedUndoCount);
  const backtrackCount = normalizeCount(summary.backtrackCount);
  const recoveryCount = normalizeCount(summary.recoveryCount);
  const routeNoiseScore = roundScore(((
    wrongBranchCount
    + optionalRetargetCount * 1.5
    + visitedUndoCount * 4
  ) / decisionCount) * 100);
  const recoveryPressureScore = roundScore(((
    backtrackCount * 0.75
    + recoveryCount * 2.25
  ) / decisionCount) * 100);
  const retargetPressureScore = roundScore((optionalRetargetCount / decisionCount) * 100);
  const pressureScore = roundScore((
    routeNoiseScore * 0.45
    + recoveryPressureScore * 0.45
    + retargetPressureScore * 0.1
  ));

  return {
    scorerId: MAZE_CYCLE_AI_SCORER_ID,
    scorerVersion: MAZE_CYCLE_AI_SCORER_VERSION,
    pressureScore,
    reliabilityScore: roundScore(100 - pressureScore),
    recoveryPressureScore,
    routeNoiseScore,
    retargetPressureScore,
    signal: pressureScore >= 60 ? 'chaotic' : pressureScore >= 25 ? 'searching' : 'clean'
  };
};

const SCORE_FIELDS = [
  'pressureScore',
  'reliabilityScore',
  'recoveryPressureScore',
  'routeNoiseScore',
  'retargetPressureScore'
];

const hasCompleteStoredScore = (score) => (
  isRecord(score)
  && SCORE_FIELDS.every((field) => typeof score[field] === 'number' && Number.isFinite(score[field]))
  && ['clean', 'searching', 'chaotic'].includes(score.signal)
);

const normalizeStoredScore = (score) => {
  if (!isRecord(score)) {
    return null;
  }

  const normalized = {};
  for (const field of SCORE_FIELDS) {
    normalized[field] = typeof score[field] === 'number' && Number.isFinite(score[field])
      ? roundScore(score[field])
      : null;
  }
  normalized.signal = ['clean', 'searching', 'chaotic'].includes(score.signal) ? score.signal : 'unknown';
  normalized.scorerId = typeof score.scorerId === 'string' ? score.scorerId : null;
  normalized.scorerVersion = typeof score.scorerVersion === 'string' ? score.scorerVersion : null;
  return normalized;
};

const scoresMatch = (stored, recomputed) => (
  SCORE_FIELDS.every((field) => Math.abs(stored[field] - recomputed[field]) < 0.001)
  && stored.signal === recomputed.signal
);

export const compareMazeCycleAiDecisionScore = (storedScore, summary) => {
  const stored = normalizeStoredScore(storedScore);
  const recomputed = scoreMazeCycleAiDecisionSummary(summary);
  let status = 'match';

  if (recomputed === null) {
    status = stored === null ? 'unavailable' : 'recomputation-unavailable';
  } else if (stored === null) {
    status = 'stored-missing';
  } else if (!hasCompleteStoredScore(stored)) {
    status = 'stored-incomplete';
  } else if (!scoresMatch(stored, recomputed)) {
    status = 'mismatch';
  }

  return {
    canonicalScorerId: MAZE_CYCLE_AI_SCORER_ID,
    canonicalScorerVersion: MAZE_CYCLE_AI_SCORER_VERSION,
    status,
    stored,
    recomputed
  };
};
