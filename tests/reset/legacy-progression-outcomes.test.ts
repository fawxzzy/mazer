// Characterization fixtures for the mazer-ai-level-rank-progression board card.
//
// These tests PIN what the current formula does with five representative run
// outcomes (perfect, strong, average, weak, failed) for both the player and the
// AI-runner track. They do not assert what the formula SHOULD do. Any future
// formula change (slower step, signal-weighted step, regression hysteresis)
// must change these expectations deliberately and in the same commit.
//
// The headline finding the fixtures document: today the run outcome never moves
// targetComplexity. Every accepted completion adds the flat
// LEGACY_PROGRESSION_COMPLETION_DIFFICULTY_STEP (+4) regardless of score or
// signal, so there is no regression to smooth and no hysteresis to tune. The
// outcome only changes the stored signal, pace score, clean/struggle counters,
// and the six-entry recent-signal window (diagnostics).
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import {
  LEGACY_PROGRESSION_COMPLETION_DIFFICULTY_STEP,
  LEGACY_PROGRESSION_MAX_COMPLEXITY,
  LEGACY_PROGRESSION_MIN_COMPLEXITY,
  LEGACY_PROGRESSION_SIGNAL_WINDOW_LIMIT,
  createEmptyLegacyProgressionState,
  recordLegacyProgressionCycle,
  resolveLegacyMazeComplexity,
  resolveLegacyProgressionExpectedCompletionMs,
  resolveLegacyProgressionPerformanceScoreForReceipt,
  resolveLegacyProgressionRank,
  summarizeLegacyProgressionPacing,
  type LegacyProgressionRank,
  type LegacyProgressionSignal,
  type LegacyProgressionState,
  type LegacyProgressionTrackId
} from '../../src/legacy-runtime/legacyProgression';
import type { MazeCycleTelemetrySurface } from '../../src/legacy-runtime/mazeCycleTelemetry';
import {
  PROGRESSION_OUTCOME_IDS,
  createProgressionOutcomeMaze,
  createProgressionOutcomeReceipt,
  type ProgressionOutcomeId
} from '../../scripts/analysis/lib/progressionOutcomeFixtures';
import {
  buildComparisonReport,
  formatComparisonReport
} from '../../scripts/analysis/progression-formula-compare';

const SURFACES: readonly MazeCycleTelemetrySurface[] = ['play', 'menu-demo'];
const trackIdFor = (surface: MazeCycleTelemetrySurface): LegacyProgressionTrackId => (
  surface === 'play' ? 'player' : 'ai-runner'
);

const FIXTURE_COMPLEXITY = 59;

// Replays outcomes in order through the real recordLegacyProgressionCycle.
// Storage is intentionally undefined: no persistence, no clock.
const replay = (
  surface: MazeCycleTelemetrySurface,
  outcomes: readonly ProgressionOutcomeId[],
  start: LegacyProgressionState = createEmptyLegacyProgressionState()
): LegacyProgressionState[] => {
  const states: LegacyProgressionState[] = [];
  let state = start;
  outcomes.forEach((outcomeId, index) => {
    state = recordLegacyProgressionCycle(
      undefined,
      state,
      createProgressionOutcomeReceipt(outcomeId, surface, index),
      createProgressionOutcomeMaze(index)
    );
    states.push(state);
  });
  return states;
};

const repeat = (outcomeId: ProgressionOutcomeId, count: number): ProgressionOutcomeId[] => (
  Array.from({ length: count }, () => outcomeId)
);

describe('progression outcome fixtures', () => {
  test('fixture maze is pinned so every downstream number is attributable', () => {
    const maze = createProgressionOutcomeMaze();
    expect(resolveLegacyMazeComplexity(maze).total).toBe(FIXTURE_COMPLEXITY);
    const receipt = createProgressionOutcomeReceipt('perfect', 'play');
    expect(receipt.shortestViablePathLength).toBe(13);
    expect(receipt.playerPathLength).toBe(13);
    // The expected completion time is dominated by the complexity floor
    // (59 * 360 ms), not by the 13-tile route (13 * 440 ms), for this maze.
    expect(resolveLegacyProgressionExpectedCompletionMs({ playerPathLength: 13, surface: 'play' }, FIXTURE_COMPLEXITY)).toBe(21_240);
    expect(resolveLegacyProgressionExpectedCompletionMs({ playerPathLength: 13, surface: 'menu-demo' }, FIXTURE_COMPLEXITY)).toBe(25_063);
  });

  test('fixture receipts are deterministic and mutually distinct', () => {
    const first = createProgressionOutcomeReceipt('average', 'menu-demo', 3);
    const second = createProgressionOutcomeReceipt('average', 'menu-demo', 3);
    expect(second).toEqual(first);
    expect(createProgressionOutcomeReceipt('average', 'menu-demo', 4).id).not.toBe(first.id);
    expect(first.completedAt).toBe('2026-11-05T12:03:00.000Z');
    for (const outcomeId of PROGRESSION_OUTCOME_IDS) {
      const receipt = createProgressionOutcomeReceipt(outcomeId, 'play');
      expect(receipt.routeOverrunRatio).toBe(
        { perfect: 0, strong: 0.154, average: 0.615, weak: 1.231, failed: 3 }[outcomeId]
      );
    }
  });

  describe('score and quality signal per outcome (scorer output, before progression)', () => {
    // total = weighted 0..100 run-quality score. signal is the scorer's own
    // verdict; the player scorer and the AI scorer use different rules, so the
    // same fixture can legitimately land on different signals per surface.
    const expectedScores: Record<MazeCycleTelemetrySurface, Record<ProgressionOutcomeId, { signal: LegacyProgressionSignal; total: number }>> = {
      play: {
        perfect: { signal: 'challenge', total: 100 },
        strong: { signal: 'challenge', total: 91 },
        average: { signal: 'hold', total: 61 },
        weak: { signal: 'ease', total: 32 },
        failed: { signal: 'ease', total: 6 }
      },
      'menu-demo': {
        perfect: { signal: 'challenge', total: 100 },
        strong: { signal: 'challenge', total: 94 },
        average: { signal: 'challenge', total: 73 },
        weak: { signal: 'hold', total: 50 },
        failed: { signal: 'ease', total: 13 }
      }
    };

    for (const surface of SURFACES) {
      for (const outcomeId of PROGRESSION_OUTCOME_IDS) {
        test(`${surface} ${outcomeId}`, () => {
          const score = resolveLegacyProgressionPerformanceScoreForReceipt(
            createProgressionOutcomeReceipt(outcomeId, surface),
            FIXTURE_COMPLEXITY
          );
          expect({ signal: score.signal, total: score.total }).toEqual(expectedScores[surface][outcomeId]);
        });
      }
    }

    test('player scorer: reset or extreme detour eases, otherwise total >= 70 challenges', () => {
      const detail = (outcomeId: ProgressionOutcomeId) => resolveLegacyProgressionPerformanceScoreForReceipt(
        createProgressionOutcomeReceipt(outcomeId, 'play'),
        FIXTURE_COMPLEXITY
      );
      // average (61) is under the 70 challenge threshold and not a failure
      // condition, so it is hold.
      expect(detail('average')).toMatchObject({ resetScore: 100, routeEfficiencyScore: 59, timeScore: 42, total: 61 });
      // failed combines reset (score 0, total capped at 36) with a 3x overrun.
      expect(detail('failed')).toMatchObject({ resetScore: 0, routeEfficiencyScore: 0, timeScore: 0, total: 6 });
    });
  });

  describe('what a recorded completion does to each track', () => {
    // After exactly one completion from the Level-1 baseline (target 8):
    // target 12, rank E, level ordinal '2', color tier 0, regardless of outcome.
    const expectedTrackAfterOne: Record<MazeCycleTelemetrySurface, Record<ProgressionOutcomeId, {
      cleanCycles: number;
      lastSignal: LegacyProgressionSignal;
      paceScore: number;
      struggleDelta: number;
    }>> = {
      play: {
        // Live player progression records every completion as 'challenge'
        // (resolveProgressionSignal), so cleanCycles always increments and
        // struggleCycles (a persisted sentinel for player) never moves. paceScore
        // still stores the scorer total as diagnostics.
        perfect: { cleanCycles: 1, lastSignal: 'challenge', paceScore: 100, struggleDelta: 0 },
        strong: { cleanCycles: 1, lastSignal: 'challenge', paceScore: 91, struggleDelta: 0 },
        average: { cleanCycles: 1, lastSignal: 'challenge', paceScore: 61, struggleDelta: 0 },
        weak: { cleanCycles: 1, lastSignal: 'challenge', paceScore: 32, struggleDelta: 0 },
        failed: { cleanCycles: 1, lastSignal: 'challenge', paceScore: 6, struggleDelta: 0 }
      },
      'menu-demo': {
        // AI progression stores the scorer's signal; ease counts a struggle
        // cycle and challenge counts a clean cycle; hold counts neither.
        perfect: { cleanCycles: 1, lastSignal: 'challenge', paceScore: 100, struggleDelta: 0 },
        strong: { cleanCycles: 1, lastSignal: 'challenge', paceScore: 94, struggleDelta: 0 },
        average: { cleanCycles: 1, lastSignal: 'challenge', paceScore: 73, struggleDelta: 0 },
        weak: { cleanCycles: 0, lastSignal: 'hold', paceScore: 50, struggleDelta: 0 },
        failed: { cleanCycles: 0, lastSignal: 'ease', paceScore: 13, struggleDelta: 1 }
      }
    };

    for (const surface of SURFACES) {
      for (const outcomeId of PROGRESSION_OUTCOME_IDS) {
        test(`${surface} ${outcomeId}: +4 target, rank E, level 2, signal and counters as pinned`, () => {
          const trackId = trackIdFor(surface);
          const start = createEmptyLegacyProgressionState();
          const [after] = replay(surface, [outcomeId], start);
          const track = after!.tracks[trackId];
          const expected = expectedTrackAfterOne[surface][outcomeId];

          expect(track.targetComplexity).toBe(LEGACY_PROGRESSION_MIN_COMPLEXITY + LEGACY_PROGRESSION_COMPLETION_DIFFICULTY_STEP);
          expect(track.rank).toBe('E');
          expect(track.level).toBe('2');
          expect(track.completedCycles).toBe('1');
          expect(track.colorTier).toBe(0);
          expect(track.lastSignal).toBe(expected.lastSignal);
          expect(track.recentSignals).toEqual([expected.lastSignal]);
          expect(track.paceScore).toBe(expected.paceScore);
          expect(track.cleanCycles).toBe(start.tracks[trackId].cleanCycles + expected.cleanCycles);
          expect(track.struggleCycles).toBe(start.tracks[trackId].struggleCycles + expected.struggleDelta);
          // peakComplexity tracks max(previous, measured maze, new target).
          expect(track.peakComplexity).toBe(FIXTURE_COMPLEXITY);
          expect(track.lastCompletionTimeMs).toBe(
            { perfect: 9_000, strong: 16_000, average: 27_000, weak: 34_000, failed: 45_000 }[outcomeId]
          );
        });
      }
    }

    test('the other track is untouched by a completion on this one', () => {
      const start = createEmptyLegacyProgressionState();
      const [afterPlayer] = replay('play', ['perfect'], start);
      expect(afterPlayer!.tracks['ai-runner']).toEqual(start.tracks['ai-runner']);
      const [afterAi] = replay('menu-demo', ['failed'], start);
      expect(afterAi!.tracks.player).toEqual(start.tracks.player);
    });

    test('replaying the same receipt id is idempotent', () => {
      const start = createEmptyLegacyProgressionState();
      const receipt = createProgressionOutcomeReceipt('strong', 'menu-demo', 0);
      const maze = createProgressionOutcomeMaze(0);
      const once = recordLegacyProgressionCycle(undefined, start, receipt, maze);
      const twice = recordLegacyProgressionCycle(undefined, once, receipt, maze);
      expect(twice.tracks['ai-runner']).toEqual(once.tracks['ai-runner']);
    });
  });

  describe('target complexity does not depend on the outcome (no regression, no hysteresis input)', () => {
    for (const surface of SURFACES) {
      test(`${surface}: every outcome yields the same target, rank, level and color tier`, () => {
        const trackId = trackIdFor(surface);
        const projections = PROGRESSION_OUTCOME_IDS.map((outcomeId) => {
          const [after] = replay(surface, [outcomeId]);
          const track = after!.tracks[trackId];
          return {
            colorTier: track.colorTier,
            level: track.level,
            rank: track.rank,
            targetComplexity: track.targetComplexity
          };
        });
        for (const projection of projections) {
          expect(projection).toEqual(projections[0]);
        }
      });

      test(`${surface}: one failed run after a strong streak gains exactly what a strong run gains`, () => {
        const trackId = trackIdFor(surface);
        const streak = replay(surface, repeat('strong', 4));
        const baseline = streak.at(-1)!.tracks[trackId].targetComplexity;
        expect(baseline).toBe(24);

        const failedNext = recordLegacyProgressionCycle(
          undefined,
          streak.at(-1)!,
          createProgressionOutcomeReceipt('failed', surface, 4),
          createProgressionOutcomeMaze(4)
        );
        const strongNext = recordLegacyProgressionCycle(
          undefined,
          streak.at(-1)!,
          createProgressionOutcomeReceipt('strong', surface, 4),
          createProgressionOutcomeMaze(4)
        );
        expect(failedNext.tracks[trackId].targetComplexity).toBe(28);
        expect(failedNext.tracks[trackId].targetComplexity).toBe(strongNext.tracks[trackId].targetComplexity);
        expect(failedNext.tracks[trackId].rank).toBe('D');
        // The only trace of the bad run is diagnostic.
        expect(failedNext.tracks[trackId].lastSignal).toBe(surface === 'play' ? 'challenge' : 'ease');
      });

      test(`${surface}: a run of failed outcomes never lowers target; it climbs +4 per completion`, () => {
        const trackId = trackIdFor(surface);
        const targets = replay(surface, repeat('failed', 8)).map((state) => state.tracks[trackId].targetComplexity);
        expect(targets).toEqual([12, 16, 20, 24, 28, 32, 36, 40]);
        for (let index = 1; index < targets.length; index += 1) {
          expect(targets[index]! - targets[index - 1]!).toBe(LEGACY_PROGRESSION_COMPLETION_DIFFICULTY_STEP);
        }
      });
    }

    test('different outcome orders converge on the same target for the same completion count', () => {
      const orders: ProgressionOutcomeId[][] = [
        ['perfect', 'strong', 'average', 'weak', 'failed'],
        ['failed', 'weak', 'average', 'strong', 'perfect'],
        repeat('failed', 5),
        repeat('perfect', 5)
      ];
      for (const surface of SURFACES) {
        const targets = orders.map((order) => replay(surface, order).at(-1)!.tracks[trackIdFor(surface)].targetComplexity);
        expect(new Set(targets)).toEqual(new Set([28]));
      }
    });
  });

  describe('pacing signal and hysteresis behaviour', () => {
    test('AI signal window is newest-first and capped at six entries', () => {
      const outcomes: ProgressionOutcomeId[] = ['perfect', 'strong', 'average', 'weak', 'failed', 'failed', 'perfect'];
      const states = replay('menu-demo', outcomes);
      expect(LEGACY_PROGRESSION_SIGNAL_WINDOW_LIMIT).toBe(6);
      expect(states[4]!.tracks['ai-runner'].recentSignals).toEqual(['ease', 'hold', 'challenge', 'challenge', 'challenge']);
      // The oldest 'challenge' (perfect) falls off once a seventh run lands.
      expect(states[6]!.tracks['ai-runner'].recentSignals).toEqual(
        ['challenge', 'ease', 'ease', 'hold', 'challenge', 'challenge']
      );
      expect(states[6]!.tracks['ai-runner'].recentSignals).toHaveLength(6);
    });

    test('skillTrend reads the window but never feeds back into the next target', () => {
      const states = replay('menu-demo', ['failed', 'failed', 'failed', 'weak']);
      const track = states.at(-1)!.tracks['ai-runner'];
      const pacing = summarizeLegacyProgressionPacing(track, FIXTURE_COMPLEXITY, 'ai-runner');
      expect(pacing.signalWindow).toEqual(['hold', 'ease', 'ease', 'ease']);
      expect(pacing.recentEaseCount).toBe(3);
      expect(pacing.recentChallengeCount).toBe(0);
      expect(pacing.skillTrend).toBe('falling');
      // A "falling" trend still previews the same upward step as a rising one.
      expect(track.targetComplexity).toBe(24);
      expect(pacing.nextEaseTargetComplexity).toBe(28);
      expect(pacing.nextChallengeTargetComplexity).toBe(28);
      expect(pacing.easeStep).toBe(LEGACY_PROGRESSION_COMPLETION_DIFFICULTY_STEP);
      expect(pacing.challengeStep).toBe(LEGACY_PROGRESSION_COMPLETION_DIFFICULTY_STEP);
    });

    test('recovery after a struggle streak flips the trend with no target dip', () => {
      const states = replay('menu-demo', [...repeat('failed', 3), ...repeat('perfect', 4)]);
      const targets = states.map((state) => state.tracks['ai-runner'].targetComplexity);
      expect(targets).toEqual([12, 16, 20, 24, 28, 32, 36]);
      const pacing = summarizeLegacyProgressionPacing(states.at(-1)!.tracks['ai-runner'], FIXTURE_COMPLEXITY, 'ai-runner');
      expect(pacing.signalWindow).toEqual(['challenge', 'challenge', 'challenge', 'challenge', 'ease', 'ease']);
      expect(pacing.skillTrend).toBe('rising');
      expect(states.at(-1)!.tracks['ai-runner'].struggleCycles).toBe(3);
      expect(states.at(-1)!.tracks['ai-runner'].cleanCycles).toBe(4);
    });

    test('mixed window reports mixed; empty window reports steady', () => {
      const [first] = replay('menu-demo', ['perfect']);
      const empty = summarizeLegacyProgressionPacing(createEmptyLegacyProgressionState().tracks['ai-runner'], FIXTURE_COMPLEXITY, 'ai-runner');
      expect(empty.skillTrend).toBe('steady');
      const mixed = replay('menu-demo', ['perfect', 'failed']).at(-1)!.tracks['ai-runner'];
      expect(summarizeLegacyProgressionPacing(mixed, FIXTURE_COMPLEXITY, 'ai-runner').skillTrend).toBe('mixed');
      expect(summarizeLegacyProgressionPacing(first!.tracks['ai-runner'], FIXTURE_COMPLEXITY, 'ai-runner').skillTrend).toBe('rising');
    });

    test('player track stays in a pure challenge window whatever the scorer says', () => {
      const states = replay('play', ['failed', 'weak', 'average', 'failed']);
      expect(states.at(-1)!.tracks.player.recentSignals).toEqual(['challenge', 'challenge', 'challenge', 'challenge']);
      const pacing = summarizeLegacyProgressionPacing(states.at(-1)!.tracks.player, FIXTURE_COMPLEXITY, 'player');
      expect(pacing.skillTrend).toBe('rising');
      expect(pacing.recentEaseCount).toBe(0);
    });
  });

  describe('rank ladder and ceiling reached by completions alone', () => {
    // Rank is derived from targetComplexity only: E <28, D 28, C 46, B 70, A 96, S 125.
    // Target after n completions from baseline = 8 + 4n, so the first target at
    // or above each threshold lands on a fixed completion count.
    const ladder: Array<{ completions: number; rank: LegacyProgressionRank; target: number }> = [
      { completions: 4, rank: 'E', target: 24 },
      { completions: 5, rank: 'D', target: 28 },
      { completions: 9, rank: 'D', target: 44 },
      { completions: 10, rank: 'C', target: 48 },
      { completions: 15, rank: 'C', target: 68 },
      { completions: 16, rank: 'B', target: 72 },
      { completions: 21, rank: 'B', target: 92 },
      { completions: 22, rank: 'A', target: 96 },
      { completions: 29, rank: 'A', target: 124 },
      { completions: 30, rank: 'S', target: 128 }
    ];

    for (const surface of SURFACES) {
      test(`${surface}: first completion count to reach each rank`, () => {
        const trackId = trackIdFor(surface);
        const states = replay(surface, repeat('perfect', 30));
        for (const step of ladder) {
          const track = states[step.completions - 1]!.tracks[trackId];
          expect({ completions: step.completions, rank: track.rank, target: track.targetComplexity }).toEqual(step);
          expect(track.level).toBe(String(step.completions + 1));
        }
      });
    }

    test('rank boundaries are exact at the thresholds', () => {
      const boundaries: Array<[number, LegacyProgressionRank]> = [
        [8, 'E'], [27, 'E'], [28, 'D'], [45, 'D'], [46, 'C'], [69, 'C'],
        [70, 'B'], [95, 'B'], [96, 'A'], [124, 'A'], [125, 'S'], [400, 'S']
      ];
      for (const [target, rank] of boundaries) {
        expect(resolveLegacyProgressionRank(target)).toBe(rank);
      }
    });

    test('target saturates at the maximum while the completion ordinal keeps counting', () => {
      const states = replay('play', repeat('weak', 100));
      const at98 = states[97]!.tracks.player;
      const at99 = states[98]!.tracks.player;
      const at100 = states[99]!.tracks.player;
      expect(at98.targetComplexity).toBe(LEGACY_PROGRESSION_MAX_COMPLEXITY);
      expect(at99.targetComplexity).toBe(LEGACY_PROGRESSION_MAX_COMPLEXITY);
      expect(at100.targetComplexity).toBe(LEGACY_PROGRESSION_MAX_COMPLEXITY);
      expect(at98.level).toBe('99');
      expect(at99.level).toBe('100');
      expect(at100.level).toBe('101');
      expect(at100.rank).toBe('S');
      expect(at100.colorTier).toBe(5);
    });
  });

  describe('server-owned copy of the step, clamp and rank thresholds', () => {
    // The completion RPCs are the second copy of this arithmetic. Read the
    // latest migration that defines them and prove it matches the client for
    // every legal target, so drift fails here instead of silently on the server.
    const sql = readFileSync(
      new URL('../../supabase/migrations/20260828153000_mazer_maze_seed_unsigned32_widen.sql', import.meta.url),
      'utf8'
    ).replace(/\r\n?/g, '\n');

    const parseRankCase = (block: string): Array<{ rank: string; threshold: number }> => (
      [...block.matchAll(/when v_next_target_complexity >= (\d+) then '([SABCD])'/g)]
        .map((match) => ({ rank: match[2]!, threshold: Number(match[1]) }))
    );

    test('both RPCs add the client step, clamp to the client maximum and use the client thresholds', () => {
      expect(sql.match(/greatest\(8, v_current\.player_target_complexity \+ 4\)/g)).toHaveLength(1);
      expect(sql.match(/greatest\(8, v_current\.target_complexity \+ 4\)/g)).toHaveLength(1);
      expect(sql.match(/least\(\s*400,/g)).toHaveLength(2);
      expect(LEGACY_PROGRESSION_COMPLETION_DIFFICULTY_STEP).toBe(4);
      expect(LEGACY_PROGRESSION_MIN_COMPLEXITY).toBe(8);
      expect(LEGACY_PROGRESSION_MAX_COMPLEXITY).toBe(400);

      const cases = [...sql.matchAll(/v_next_rank := case([\s\S]*?)end;/g)].map((match) => parseRankCase(match[1]!));
      expect(cases).toHaveLength(2);
      const expectedThresholds = [
        { rank: 'S', threshold: 125 },
        { rank: 'A', threshold: 96 },
        { rank: 'B', threshold: 70 },
        { rank: 'C', threshold: 46 },
        { rank: 'D', threshold: 28 }
      ];
      for (const rankCase of cases) {
        expect(rankCase).toEqual(expectedThresholds);
        for (let target = LEGACY_PROGRESSION_MIN_COMPLEXITY; target <= LEGACY_PROGRESSION_MAX_COMPLEXITY; target += 1) {
          const sqlRank = rankCase.find((entry) => target >= entry.threshold)?.rank ?? 'E';
          expect(sqlRank).toBe(resolveLegacyProgressionRank(target));
        }
      }
    });

    test('server color tier formula matches the client color tier for every ladder step', () => {
      expect(sql.match(/greatest\(0, \(\(v_next_target_complexity - 8\) \/ 4\) \/ 5\)/g)).toHaveLength(2);
      const states = replay('menu-demo', repeat('perfect', 100));
      states.forEach((state, index) => {
        const target = state.tracks['ai-runner'].targetComplexity;
        const serverTier = Math.min(5, Math.max(0, Math.floor(Math.floor((target - 8) / 4) / 5)));
        expect(state.tracks['ai-runner'].colorTier, `completion ${index + 1}`).toBe(serverTier);
      });
    });

    test('the receipt body is stored but the RPC reads no quality field from it', () => {
      // The RPC copies p_receipt into mazer_cycle_receipts and only reads
      // p_receipt ->> 'id' for lastReceiptId. No score, signal or overrun term
      // is consulted, so outcome fixtures cannot move the server target either.
      const receiptReads = [...sql.matchAll(/p_receipt\s*->>?\s*'([A-Za-z]+)'/g)].map((match) => match[1]);
      expect([...new Set(receiptReads)]).toEqual(['id']);
    });
  });

  describe('offline candidate-formula comparison script', () => {
    test('replays the same fixtures: current is flat +4, candidates differ, output is deterministic', () => {
      const report = buildComparisonReport(40);
      expect(buildComparisonReport(40)).toEqual(report);
      expect(formatComparisonReport(report)).toBe(formatComparisonReport(buildComparisonReport(40)));
      expect(report.perOutcome).toHaveLength(SURFACES.length * PROGRESSION_OUTCOME_IDS.length);
      for (const row of report.perOutcome) {
        expect(row.deltas.current).toBe(4);
        expect(row.deltas['slow-flat-2']).toBe(2);
        expect(row.deltas['signal-weighted']).toBe({ challenge: 4, hold: 2, ease: 1 }[row.qualitySignal]);
      }
      const currentPerfect = report.completionsToRank.find((row) => (
        row.formula === 'current' && row.outcome === 'perfect' && row.surface === 'play'
      ));
      expect(currentPerfect?.ranks).toEqual({ D: 5, C: 10, B: 16, A: 22, S: 30 });
    });
  });
});
