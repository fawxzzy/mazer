import { scoreMazeCycleAiDecisionSummary } from './mazeCycleAiScorer.mjs';

export const MAZE_CYCLE_RUN_QUALITY_SCORER_ID = 'mazer.maze-cycle-run-quality';
export const MAZE_CYCLE_RUN_QUALITY_SCORER_VERSION = '1.0.0';
export const MAZE_CYCLE_RUN_QUALITY_SHORTEST_PATH_MODEL = 'playable-wrap-aware-shortest-path-v1';
export const MAZE_CYCLE_RUN_QUALITY_METRICS_VERSION = '1.0.0';
export const MAZE_CYCLE_RUN_QUALITY_EXPLORER_THRESHOLD = 0.25;

export const MAZE_CYCLE_RUN_QUALITY_AI_CHALLENGE_SCORE_THRESHOLD = 58;
export const MAZE_CYCLE_RUN_QUALITY_AI_EASE_SCORE_THRESHOLD = 34;
export const MAZE_CYCLE_RUN_QUALITY_AI_CHAOTIC_PRESSURE_THRESHOLD = 60;
export const MAZE_CYCLE_RUN_QUALITY_AI_SEARCHING_EXHAUSTION_SCORE_CAP = 56;

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const roundNumber = (value, precision = 3) => {
  const scale = 10 ** precision;
  return Math.round(value * scale) / scale;
};

const clampScore = (value) => Math.max(0, Math.min(100, roundNumber(value)));
const clampInteger = (value) => Math.max(0, Math.min(100, Math.round(value)));
const normalizeCount = (value) => (
  typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0
);
const normalizeNumber = (value) => (
  typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0
);

export const summarizeMazeCycleShortestPathComparison = (playerPathLength, shortestPathLength) => {
  const shortestViablePathLength = Math.max(1, normalizeCount(shortestPathLength));
  const safePathLength = normalizeCount(playerPathLength);
  const routeOverrunSteps = Math.max(0, safePathLength - shortestViablePathLength);

  return {
    routeOverrunRatio: roundNumber(routeOverrunSteps / shortestViablePathLength),
    routeOverrunSteps,
    shortestViablePathLength
  };
};

export const scoreMazeCycleRouteEfficiencyPressure = (playerPathLength, shortestPathLength) => {
  const safeShortestPathLength = Math.max(1, normalizeCount(shortestPathLength));
  const safePathLength = normalizeCount(playerPathLength);
  const routeWasteRatio = Math.max(0, safePathLength - safeShortestPathLength) / safeShortestPathLength;
  return clampScore((routeWasteRatio / 1.5) * 100);
};

export const scoreMazeCycleRenderSafetyPenalty = (averageFrameMs) => {
  if (typeof averageFrameMs !== 'number' || !Number.isFinite(averageFrameMs) || averageFrameMs <= 18) {
    return 0;
  }
  return clampScore(((averageFrameMs - 18) / 18) * 100);
};

export const resolveMazeCycleExpectedCompletionMs = ({ playerPathLength, surface }, complexity) => {
  const surfaceMultiplier = surface === 'menu-demo' ? 1.18 : 1;
  const routePressureMs = Math.max(8_000, normalizeCount(playerPathLength) * 440);
  const complexityPressureMs = Math.max(10_000, normalizeCount(complexity) * 360);
  return Math.round(Math.max(routePressureMs, complexityPressureMs) * surfaceMultiplier);
};

export const scoreMazeCyclePace = (input, complexity) => {
  const completionTimeMs = normalizeNumber(input?.completionTimeMs);
  if (completionTimeMs <= 0) return 0;
  const expectedMs = resolveMazeCycleExpectedCompletionMs(input ?? {}, complexity);
  const ratio = completionTimeMs / Math.max(1, expectedMs);
  if (ratio <= 0.68) return 100;
  if (ratio >= 1.7) return 0;
  return clampInteger(100 - (((ratio - 0.68) / (1.7 - 0.68)) * 100));
};

const scoreBaseRunQuality = (input, complexity) => {
  const playerPathLength = normalizeCount(input.playerPathLength);
  const shortestPath = summarizeMazeCycleShortestPathComparison(
    playerPathLength,
    input.shortestViablePathLength
  );
  const routeEfficiencyPressureScore = scoreMazeCycleRouteEfficiencyPressure(
    playerPathLength,
    shortestPath.shortestViablePathLength
  );
  const averageFrameMs = normalizeNumber(input.averageFrameMs);
  const renderSafetyPenaltyScore = scoreMazeCycleRenderSafetyPenalty(averageFrameMs);
  const wrongTurns = normalizeCount(input.wrongTurns);
  const backtracks = normalizeCount(input.backtracks);
  const resetUsed = input.resetUsed === true;
  const timeScore = scoreMazeCyclePace(input, complexity);
  const routeEfficiencyScore = clampInteger(100 - routeEfficiencyPressureScore);
  const wrongTurnScore = clampInteger(100 - (wrongTurns * 16));
  const backtrackScore = clampInteger(100 - (backtracks * 14));
  const resetScore = resetUsed ? 0 : 100;
  const stabilityScore = clampInteger(
    100 - Math.max(renderSafetyPenaltyScore, averageFrameMs >= 24 ? 75 : 0)
  );
  const weightedTotal = (
    (timeScore * 0.38)
    + (routeEfficiencyScore * 0.22)
    + (wrongTurnScore * 0.14)
    + (backtrackScore * 0.12)
    + (resetScore * 0.08)
    + (stabilityScore * 0.06)
  );
  const timeStruggleCap = timeScore <= 5 && (wrongTurns >= 2 || backtracks >= 2) ? 28 : 100;
  const resetStruggleCap = resetUsed ? 36 : 100;
  const unsafeRenderCap = stabilityScore <= 25 ? 62 : 100;
  const total = clampInteger(Math.min(weightedTotal, timeStruggleCap, resetStruggleCap, unsafeRenderCap));
  let signal = 'hold';

  if (stabilityScore <= 25 || averageFrameMs >= 24) {
    signal = 'hold';
  } else if (
    resetUsed
    || wrongTurns >= 6
    || backtracks >= 6
    || routeEfficiencyPressureScore >= 75
    || total <= 38
    || (total <= 48 && (wrongTurns >= 2 || backtracks >= 2))
  ) {
    signal = 'ease';
  } else if (
    total >= 72
    && wrongTurns <= 1
    && backtracks <= 1
    && routeEfficiencyPressureScore <= 25
  ) {
    signal = 'challenge';
  }

  return {
    backtrackScore,
    renderSafetyPenaltyScore,
    resetScore,
    routeEfficiencyPressureScore,
    routeEfficiencyScore,
    routeOverrunRatio: shortestPath.routeOverrunRatio,
    routeOverrunSteps: shortestPath.routeOverrunSteps,
    shortestViablePathLength: shortestPath.shortestViablePathLength,
    signal,
    stabilityScore,
    timeScore,
    total,
    wrongTurnScore
  };
};

export const scoreMazeCycleRunQuality = (input) => {
  if (!isRecord(input)) return null;
  if (input.completed === false) return null;
  if (!['menu-demo', 'play'].includes(input.surface)) return null;
  if (!Number.isFinite(input.playerPathLength) || !Number.isFinite(input.shortestViablePathLength)) return null;
  if (input.shortestViablePathLength <= 0) return null;
  if (!Number.isFinite(input.complexity)) return null;

  const base = scoreBaseRunQuality(input, input.complexity);
  let score = base;
  const aiScore = input.surface === 'menu-demo'
    ? scoreMazeCycleAiDecisionSummary(input.aiDecisionSummary)
    : null;

  if (aiScore) {
    const routeEfficiencyScore = clampInteger(
      (base.routeEfficiencyScore * 0.86) + (aiScore.reliabilityScore * 0.14)
    );
    const backtrackScore = clampInteger(
      100
      - (aiScore.recoveryPressureScore * 0.48)
      - (base.routeEfficiencyPressureScore * 0.22)
      - (input.resetUsed === true ? 18 : 0)
    );
    const wrongTurnScore = clampInteger(
      100
      - (aiScore.routeNoiseScore * 0.52)
      - (base.routeEfficiencyPressureScore * 0.24)
      - (input.resetUsed === true ? 18 : 0)
    );
    const weightedTotal = (
      (base.timeScore * 0.22)
      + (routeEfficiencyScore * 0.32)
      + (wrongTurnScore * 0.16)
      + (backtrackScore * 0.14)
      + (base.resetScore * 0.06)
      + (base.stabilityScore * 0.05)
      + (aiScore.reliabilityScore * 0.05)
    );
    const isSearchingExhaustion = input.resetUsed === true
      && aiScore.signal === 'searching'
      && aiScore.pressureScore < MAZE_CYCLE_RUN_QUALITY_AI_CHAOTIC_PRESSURE_THRESHOLD;
    const total = clampInteger(Math.min(
      weightedTotal,
      aiScore.signal === 'chaotic' ? MAZE_CYCLE_RUN_QUALITY_AI_EASE_SCORE_THRESHOLD : 100,
      input.resetUsed === true
        ? isSearchingExhaustion
          ? MAZE_CYCLE_RUN_QUALITY_AI_SEARCHING_EXHAUSTION_SCORE_CAP
          : 38
        : 100,
      base.routeEfficiencyPressureScore >= 88 ? 45 : 100,
      base.stabilityScore <= 25 ? 62 : 100
    ));
    let signal = 'hold';
    if (base.stabilityScore <= 25 || normalizeNumber(input.averageFrameMs) >= 24) {
      signal = 'hold';
    } else if (
      aiScore.pressureScore >= MAZE_CYCLE_RUN_QUALITY_AI_CHAOTIC_PRESSURE_THRESHOLD
      || (total <= MAZE_CYCLE_RUN_QUALITY_AI_EASE_SCORE_THRESHOLD && !isSearchingExhaustion)
      || (base.routeEfficiencyPressureScore >= 88 && !isSearchingExhaustion)
    ) {
      signal = 'ease';
    } else if (
      total >= MAZE_CYCLE_RUN_QUALITY_AI_CHALLENGE_SCORE_THRESHOLD
      && !isSearchingExhaustion
      && aiScore.pressureScore < MAZE_CYCLE_RUN_QUALITY_AI_CHAOTIC_PRESSURE_THRESHOLD
      && base.routeEfficiencyPressureScore <= 70
    ) {
      signal = 'challenge';
    }
    score = { ...base, backtrackScore, routeEfficiencyScore, signal, total, wrongTurnScore };
  }

  return {
    scorerId: MAZE_CYCLE_RUN_QUALITY_SCORER_ID,
    scorerVersion: MAZE_CYCLE_RUN_QUALITY_SCORER_VERSION,
    shortestPathModel: MAZE_CYCLE_RUN_QUALITY_SHORTEST_PATH_MODEL,
    ...score
  };
};

const SCORE_FIELDS = [
  'backtrackScore',
  'renderSafetyPenaltyScore',
  'resetScore',
  'routeEfficiencyPressureScore',
  'routeEfficiencyScore',
  'routeOverrunRatio',
  'routeOverrunSteps',
  'shortestViablePathLength',
  'stabilityScore',
  'timeScore',
  'total',
  'wrongTurnScore'
];

export const normalizeStoredMazeCycleRunQualityScore = (value) => {
  if (!isRecord(value)) return null;
  const normalized = {
    scorerId: typeof value.scorerId === 'string' ? value.scorerId : null,
    scorerVersion: typeof value.scorerVersion === 'string' ? value.scorerVersion : null,
    shortestPathModel: typeof value.shortestPathModel === 'string' ? value.shortestPathModel : null,
    signal: ['challenge', 'ease', 'hold'].includes(value.signal) ? value.signal : 'unknown'
  };
  for (const field of SCORE_FIELDS) {
    normalized[field] = typeof value[field] === 'number' && Number.isFinite(value[field])
      ? roundNumber(value[field])
      : null;
  }
  return normalized;
};

const hasCompleteStoredScore = (score) => (
  isRecord(score)
  && score.scorerId === MAZE_CYCLE_RUN_QUALITY_SCORER_ID
  && typeof score.scorerVersion === 'string'
  && typeof score.shortestPathModel === 'string'
  && ['challenge', 'ease', 'hold'].includes(score.signal)
  && SCORE_FIELDS.every((field) => typeof score[field] === 'number' && Number.isFinite(score[field]))
);

const scoresMatch = (stored, recomputed) => (
  stored.scorerId === recomputed.scorerId
  && stored.scorerVersion === recomputed.scorerVersion
  && stored.shortestPathModel === recomputed.shortestPathModel
  && stored.signal === recomputed.signal
  && SCORE_FIELDS.every((field) => Math.abs(stored[field] - recomputed[field]) < 0.001)
);

export const compareMazeCycleRunQualityScore = (storedScore, input) => {
  const stored = normalizeStoredMazeCycleRunQualityScore(storedScore);
  const recomputed = scoreMazeCycleRunQuality(input);
  let status = 'match';
  if (recomputed === null) status = stored === null ? 'unavailable' : 'recomputation-unavailable';
  else if (stored === null) status = 'stored-missing';
  else if (!hasCompleteStoredScore(stored)) status = 'stored-incomplete';
  else if (!scoresMatch(stored, recomputed)) status = 'mismatch';

  return {
    canonicalScorerId: MAZE_CYCLE_RUN_QUALITY_SCORER_ID,
    canonicalScorerVersion: MAZE_CYCLE_RUN_QUALITY_SCORER_VERSION,
    status,
    stored,
    recomputed
  };
};
