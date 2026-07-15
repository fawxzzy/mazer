import type { MazeCycleAiDecisionSummaryLike } from './mazeCycleAiScorer.mjs';

export type MazeCycleRunQualitySignal = 'challenge' | 'ease' | 'hold';

export interface MazeCycleRunQualityInput {
  aiDecisionSummary?: MazeCycleAiDecisionSummaryLike | null;
  averageFrameMs: number;
  backtracks: number;
  completionTimeMs: number;
  complexity: number;
  playerPathLength: number;
  resetUsed: boolean;
  shortestViablePathLength: number;
  surface: 'menu-demo' | 'play';
  wrongTurns: number;
}

export interface MazeCycleRunQualityScore {
  backtrackScore: number;
  renderSafetyPenaltyScore: number;
  resetScore: number;
  routeEfficiencyPressureScore: number;
  routeEfficiencyScore: number;
  routeOverrunRatio: number;
  routeOverrunSteps: number;
  scorerId: string;
  scorerVersion: string;
  shortestPathModel: string;
  shortestViablePathLength: number;
  signal: MazeCycleRunQualitySignal;
  stabilityScore: number;
  timeScore: number;
  total: number;
  wrongTurnScore: number;
}

export interface MazeCycleRunQualityScoreComparison {
  canonicalScorerId: string;
  canonicalScorerVersion: string;
  status: 'match' | 'mismatch' | 'stored-missing' | 'stored-incomplete' | 'recomputation-unavailable' | 'unavailable';
  stored: Record<string, unknown> | null;
  recomputed: MazeCycleRunQualityScore | null;
}

export const MAZE_CYCLE_RUN_QUALITY_SCORER_ID: string;
export const MAZE_CYCLE_RUN_QUALITY_SCORER_VERSION: string;
export const MAZE_CYCLE_RUN_QUALITY_SHORTEST_PATH_MODEL: string;
export const MAZE_CYCLE_RUN_QUALITY_AI_CHALLENGE_SCORE_THRESHOLD: number;
export const MAZE_CYCLE_RUN_QUALITY_AI_EASE_SCORE_THRESHOLD: number;
export const MAZE_CYCLE_RUN_QUALITY_AI_CHAOTIC_PRESSURE_THRESHOLD: number;
export const MAZE_CYCLE_RUN_QUALITY_AI_SEARCHING_EXHAUSTION_SCORE_CAP: number;

export const summarizeMazeCycleShortestPathComparison: (playerPathLength: number, shortestPathLength: number) => {
  routeOverrunRatio: number;
  routeOverrunSteps: number;
  shortestViablePathLength: number;
};
export const scoreMazeCycleRouteEfficiencyPressure: (playerPathLength: number, shortestPathLength: number) => number;
export const scoreMazeCycleRenderSafetyPenalty: (averageFrameMs: number) => number;
export const resolveMazeCycleExpectedCompletionMs: (
  input: Pick<MazeCycleRunQualityInput, 'playerPathLength' | 'surface'>,
  complexity: number
) => number;
export const scoreMazeCyclePace: (
  input: Pick<MazeCycleRunQualityInput, 'completionTimeMs' | 'playerPathLength' | 'surface'>,
  complexity: number
) => number;
export const scoreMazeCycleRunQuality: (input: MazeCycleRunQualityInput | null | unknown) => MazeCycleRunQualityScore | null;
export const normalizeStoredMazeCycleRunQualityScore: (value: unknown) => Record<string, unknown> | null;
export const compareMazeCycleRunQualityScore: (
  storedScore: unknown,
  input: MazeCycleRunQualityInput | null | unknown
) => MazeCycleRunQualityScoreComparison;
