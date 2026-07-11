export type MazeCycleAiDecisionSignal = 'clean' | 'searching' | 'chaotic';

export interface MazeCycleAiDecisionSummaryLike {
  backtrackCount?: number;
  decisionCount?: number;
  optionalRetargetCount?: number;
  recoveryCount?: number;
  visitedUndoCount?: number;
  wrongBranchCount?: number;
}

export interface MazeCycleAiDecisionScore {
  scorerId: string;
  scorerVersion: string;
  pressureScore: number;
  reliabilityScore: number;
  recoveryPressureScore: number;
  routeNoiseScore: number;
  retargetPressureScore: number;
  signal: MazeCycleAiDecisionSignal;
}

export type MazeCycleAiDecisionScoreComparisonStatus =
  | 'match'
  | 'mismatch'
  | 'stored-missing'
  | 'stored-incomplete'
  | 'recomputation-unavailable'
  | 'unavailable';

export interface MazeCycleAiDecisionScoreComparison {
  canonicalScorerId: string;
  canonicalScorerVersion: string;
  status: MazeCycleAiDecisionScoreComparisonStatus;
  stored: Record<string, unknown> | null;
  recomputed: MazeCycleAiDecisionScore | null;
}

export const MAZE_CYCLE_AI_SCORER_ID: string;
export const MAZE_CYCLE_AI_SCORER_VERSION: string;
export const scoreMazeCycleAiDecisionSummary: (
  summary: MazeCycleAiDecisionSummaryLike | null | unknown
) => MazeCycleAiDecisionScore | null;
export const compareMazeCycleAiDecisionScore: (
  storedScore: unknown,
  summary: MazeCycleAiDecisionSummaryLike | null | unknown
) => MazeCycleAiDecisionScoreComparison;
