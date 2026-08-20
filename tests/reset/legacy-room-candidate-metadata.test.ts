import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { createLegacyRuntimeMazeForMode } from '../../src/legacy-runtime/legacyGenerationLifecycle';
import { resolveLegacyMazeGenerationProfileForProgression } from '../../src/legacy-runtime/legacyProgression';
import {
  LEGACY_ROOM_CANDIDATE_FOOTPRINT_TILES,
  LEGACY_ROOM_CANDIDATE_MAX_EMITTED_PER_MAZE,
  LEGACY_ROOM_CANDIDATE_MAX_PERIMETER_OPENINGS,
  LEGACY_ROOM_CANDIDATE_MAX_ROUTE_INTERIOR_TILES,
  LEGACY_ROOM_CANDIDATE_MAX_SIDE_CLOSURE_EDGES,
  LEGACY_ROOM_CANDIDATE_MIN_PERIMETER_OPENINGS,
  LEGACY_ROOM_CANDIDATE_ROUTE_OPENING_COUNT,
  LEGACY_ROOM_CANDIDATE_ROUTE_THRESHOLD_COUNT,
  createLegacyRoomCandidateMetadata,
  type LegacyRoomCandidateRouteThresholds
} from '../../src/legacy-runtime/legacyRoomCandidateMetadata';
import { createLegacyStaticSlowTileState } from '../../src/legacy-runtime/legacyStaticSlowTile';

const footprintPoints = (topLeft: { x: number; y: number }): Array<{ x: number; y: number }> => [
  { ...topLeft },
  { x: topLeft.x + 1, y: topLeft.y },
  { x: topLeft.x, y: topLeft.y + 1 },
  { x: topLeft.x + 1, y: topLeft.y + 1 }
];

const pointKey = (point: { x: number; y: number }): string => `${point.x},${point.y}`;

const countPerimeterOpenings = (
  grid: boolean[][],
  topLeft: { x: number; y: number }
): number => {
  const footprint = footprintPoints(topLeft);
  const footprintKeys = new Set(footprint.map(pointKey));
  const cardinalOffsets = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 }
  ];

  return footprint.reduce((openingCount, point) => (
    openingCount + cardinalOffsets.filter((offset) => {
      const adjacent = {
        x: point.x + offset.x,
        y: point.y + offset.y
      };
      return (
        !footprintKeys.has(pointKey(adjacent))
        && grid[adjacent.y]?.[adjacent.x] === true
      );
    }).length
  ), 0);
};

const expectedPerimeterOpenings = (
  grid: boolean[][],
  topLeft: { x: number; y: number },
  routeThresholds: LegacyRoomCandidateRouteThresholds
) => {
  const { x, y } = topLeft;
  const perimeterEdges = [
    { inside: { x, y }, outside: { x, y: y - 1 }, side: 'top' as const },
    { inside: { x: x + 1, y }, outside: { x: x + 1, y: y - 1 }, side: 'top' as const },
    { inside: { x: x + 1, y }, outside: { x: x + 2, y }, side: 'right' as const },
    {
      inside: { x: x + 1, y: y + 1 },
      outside: { x: x + 2, y: y + 1 },
      side: 'right' as const
    },
    {
      inside: { x: x + 1, y: y + 1 },
      outside: { x: x + 1, y: y + 2 },
      side: 'bottom' as const
    },
    { inside: { x, y: y + 1 }, outside: { x, y: y + 2 }, side: 'bottom' as const },
    {
      inside: { x, y: y + 1 },
      outside: { x: x - 1, y: y + 1 },
      side: 'left' as const
    },
    { inside: { x, y }, outside: { x: x - 1, y }, side: 'left' as const }
  ];

  return perimeterEdges.flatMap(({ inside, outside, side }) => {
    if (grid[outside.y]?.[outside.x] !== true) {
      return [];
    }
    const threshold = routeThresholds.find((candidate) => (
      (
        candidate.kind === 'enter'
        && pointKey(candidate.from) === pointKey(outside)
        && pointKey(candidate.to) === pointKey(inside)
      )
      || (
        candidate.kind === 'exit'
        && pointKey(candidate.from) === pointKey(inside)
        && pointKey(candidate.to) === pointKey(outside)
      )
    ));
    return [{
      inside,
      kind: threshold ? `route-${threshold.kind}` as const : 'side' as const,
      outside,
      side
    }];
  });
};

const selectPriorCandidate = (
  maze: Parameters<typeof createLegacyRoomCandidateMetadata>[0],
  excludedPoint: { x: number; y: number } | null
) => {
  const maximumEligibleSolutionPathIndex = maze.solutionPath.length - 3;
  const solutionPathIndexByPoint = new Map(
    maze.solutionPath.map((point, index) => [pointKey(point), index])
  );
  const candidates = [];

  for (let y = 1; y < maze.height - 2; y += 1) {
    for (let x = 1; x < maze.width - 2; x += 1) {
      const footprint = footprintPoints({ x, y });
      if (!footprint.every((point) => maze.grid[point.y]?.[point.x] === true)) {
        continue;
      }
      if (
        footprint.some((point) => (
          pointKey(point) === pointKey(maze.start)
          || pointKey(point) === pointKey(maze.goal)
          || (excludedPoint && pointKey(point) === pointKey(excludedPoint))
        ))
      ) {
        continue;
      }

      const eligibleSolutionPathIndices = footprint
        .map((point) => solutionPathIndexByPoint.get(pointKey(point)))
        .filter((index): index is number => (
          index !== undefined
          && index >= 2
          && index <= maximumEligibleSolutionPathIndex
        ));
      if (eligibleSolutionPathIndices.length === 0) {
        continue;
      }

      candidates.push({
        solutionPathIndex: Math.min(...eligibleSolutionPathIndices),
        topLeft: { x, y }
      });
    }
  }

  candidates.sort((left, right) => (
    left.solutionPathIndex - right.solutionPathIndex
    || left.topLeft.y - right.topLeft.y
    || left.topLeft.x - right.topLeft.x
  ));
  return candidates[0] ?? null;
};

const sha256 = (value: unknown): string => createHash('sha256')
  .update(JSON.stringify(value))
  .digest('hex');

const corpusBands = [
  { band: 'architect' as const, targetComplexity: 132, scale: 71, minimumEvaluated: 1 },
  { band: 'mythic' as const, targetComplexity: 180, scale: 96, minimumEvaluated: 2 }
];

const corpusSeedChunks = Array.from({ length: 10 }, (_, chunkIndex) => {
  const firstSeed = chunkIndex * 10 + 1;
  const lastSeed = firstSeed + 9;
  return {
    firstSeed,
    lastSeed,
    seeds: Array.from({ length: 10 }, (_, seedIndex) => firstSeed + seedIndex)
  };
});

const runCorpusPass = (seeds: number[], assertContracts: boolean) => {
  const rows = [];
  const minimumEvaluatedByBand = {
    architect: Number.POSITIVE_INFINITY,
    mythic: Number.POSITIVE_INFINITY
  };
  let priorOverCapCount = 0;
  let selectionChangeCount = 0;

  for (const { band, minimumEvaluated, scale, targetComplexity } of corpusBands) {
    const generationProfile = resolveLegacyMazeGenerationProfileForProgression(targetComplexity);
    let observedMinimum = Number.POSITIVE_INFINITY;

    for (const seed of seeds) {
      const maze = createLegacyRuntimeMazeForMode('play', scale, seed, generationProfile);
      const slowTile = createLegacyStaticSlowTileState(maze, band);
      const before = assertContracts ? JSON.stringify(maze) : null;
      const priorCandidate = assertContracts
        ? selectPriorCandidate(maze, slowTile.placement?.point ?? null)
        : null;
      if (assertContracts) {
        expect(priorCandidate, `${band} seed ${seed} prior candidate`).not.toBeNull();
      }
      const metadata = createLegacyRoomCandidateMetadata(
        maze,
        band,
        slowTile.placement?.point ?? null
      );

      if (assertContracts) {
        expect(metadata, `${band} seed ${seed}`).not.toBeNull();
        expect(metadata).toMatchObject({
          band,
          candidateCount: LEGACY_ROOM_CANDIDATE_MAX_EMITTED_PER_MAZE,
          contractVersion: 'legacy-room-candidate-metadata-v7',
          roomsEnabled: false,
          source: 'existing-floor-metadata-only'
        });
        expect(metadata!.candidate).toMatchObject({
          footprintHeight: LEGACY_ROOM_CANDIDATE_FOOTPRINT_TILES,
          footprintWidth: LEGACY_ROOM_CANDIDATE_FOOTPRINT_TILES
        });

        const footprint = footprintPoints(metadata!.candidate.topLeft);
        const footprintKeys = new Set(footprint.map(pointKey));
        const expectedThresholds = maze.solutionPath.flatMap((to, toSolutionPathIndex) => {
          if (toSolutionPathIndex === 0) {
            return [];
          }
          const fromSolutionPathIndex = toSolutionPathIndex - 1;
          const from = maze.solutionPath[fromSolutionPathIndex]!;
          const fromInside = footprintKeys.has(pointKey(from));
          const toInside = footprintKeys.has(pointKey(to));
          return fromInside === toInside
            ? []
            : [{
                from,
                fromSolutionPathIndex,
                kind: toInside ? 'enter' as const : 'exit' as const,
                to,
                toSolutionPathIndex
              }];
        });

        expect(footprint.every((point) => maze.grid[point.y]?.[point.x] === true)).toBe(true);
        expect(footprint).not.toContainEqual(maze.start);
        expect(footprint).not.toContainEqual(maze.goal);
        expect(footprint).not.toContainEqual(slowTile.placement?.point);
        expect(metadata!.candidate.solutionPathIndex).toBeGreaterThanOrEqual(2);
        expect(metadata!.candidate.solutionPathIndex)
          .toBeLessThanOrEqual(maze.solutionPath.length - 3);
        expect(footprint).toContainEqual(maze.solutionPath[metadata!.candidate.solutionPathIndex]);
        expect(metadata!.perimeterOpeningCount)
          .toBe(countPerimeterOpenings(maze.grid, metadata!.candidate.topLeft));
        expect(metadata!.perimeterOpeningCount)
          .toBeGreaterThanOrEqual(LEGACY_ROOM_CANDIDATE_MIN_PERIMETER_OPENINGS);
        expect(metadata!.perimeterOpeningCount)
          .toBeLessThanOrEqual(LEGACY_ROOM_CANDIDATE_MAX_PERIMETER_OPENINGS);
        expect(expectedThresholds).toHaveLength(LEGACY_ROOM_CANDIDATE_ROUTE_THRESHOLD_COUNT);
        expect(metadata!.routeThresholds).toEqual(expectedThresholds);
        expect(metadata!.perimeterOpenings).toEqual(expectedPerimeterOpenings(
          maze.grid,
          metadata!.candidate.topLeft,
          metadata!.routeThresholds
        ));
        expect(metadata!.perimeterOpenings).toHaveLength(metadata!.perimeterOpeningCount);
        expect(metadata!.perimeterOpenings.map((opening) => opening.kind).filter((kind) => (
          kind === 'route-enter'
        ))).toHaveLength(1);
        expect(metadata!.perimeterOpenings.map((opening) => opening.kind).filter((kind) => (
          kind === 'route-exit'
        ))).toHaveLength(1);
        expect(metadata!.perimeterOpenings.every((opening) => (
          footprintKeys.has(pointKey(opening.inside))
          && !footprintKeys.has(pointKey(opening.outside))
          && maze.grid[opening.inside.y]?.[opening.inside.x] === true
          && maze.grid[opening.outside.y]?.[opening.outside.x] === true
          && (
            Math.abs(opening.inside.x - opening.outside.x)
            + Math.abs(opening.inside.y - opening.outside.y)
          ) === 1
        ))).toBe(true);
        const expectedRouteOpeningEdges = metadata!.perimeterOpenings.filter((opening) => (
          opening.kind !== 'side'
        ));
        expect(metadata!.routeOpeningEdges).toEqual(expectedRouteOpeningEdges);
        expect(metadata!.routeOpeningCount).toBe(LEGACY_ROOM_CANDIDATE_ROUTE_OPENING_COUNT);
        expect(metadata!.routeOpeningEdges).toHaveLength(metadata!.routeOpeningCount);
        expect(metadata!.routeOpeningEdges.filter((edge) => edge.kind === 'route-enter')).toHaveLength(1);
        expect(metadata!.routeOpeningEdges.filter((edge) => edge.kind === 'route-exit')).toHaveLength(1);
        const expectedSideClosureEdges = metadata!.perimeterOpenings.filter((opening) => (
          opening.kind === 'side'
        ));
        expect(metadata!.sideClosureEdges).toEqual(expectedSideClosureEdges);
        expect(metadata!.sideClosureCount).toBe(expectedSideClosureEdges.length);
        expect(metadata!.sideClosureCount)
          .toBe(metadata!.perimeterOpeningCount - LEGACY_ROOM_CANDIDATE_ROUTE_THRESHOLD_COUNT);
        expect(metadata!.sideClosureCount)
          .toBeLessThanOrEqual(LEGACY_ROOM_CANDIDATE_MAX_SIDE_CLOSURE_EDGES);
        expect(metadata!.sideClosureEdges.every((edge) => edge.kind === 'side')).toBe(true);
        expect(metadata!.routeThresholds.map((threshold) => threshold.kind))
          .toEqual(['enter', 'exit']);
        expect(metadata!.routeThresholds.every((threshold) => (
          Math.abs(threshold.from.x - threshold.to.x)
          + Math.abs(threshold.from.y - threshold.to.y)
        ) === 1)).toBe(true);
        const expectedRouteInterior = maze.solutionPath.slice(
          metadata!.routeThresholds[0].toSolutionPathIndex,
          metadata!.routeThresholds[1].fromSolutionPathIndex + 1
        );
        expect(expectedRouteInterior).toHaveLength(metadata!.routeInteriorTileCount);
        expect(expectedRouteInterior.every((point) => footprintKeys.has(pointKey(point)))).toBe(true);
        expect(metadata!.routeInteriorTileCount).toBeGreaterThanOrEqual(1);
        expect(metadata!.routeInteriorTileCount)
          .toBeLessThanOrEqual(LEGACY_ROOM_CANDIDATE_MAX_ROUTE_INTERIOR_TILES);
        expect(JSON.stringify(maze)).toBe(before);
      }

      if (assertContracts) {
        const priorPerimeterOpeningCount = countPerimeterOpenings(
          maze.grid,
          priorCandidate!.topLeft
        );
        const selectionChanged = (
          pointKey(metadata!.candidate.topLeft) !== pointKey(priorCandidate!.topLeft)
        );
        if (priorPerimeterOpeningCount > LEGACY_ROOM_CANDIDATE_MAX_PERIMETER_OPENINGS) {
          priorOverCapCount += 1;
          expect(selectionChanged, `${band} seed ${seed} over-cap prior selection`).toBe(true);
        } else {
          expect(selectionChanged, `${band} seed ${seed} in-cap prior selection`).toBe(false);
        }
        if (selectionChanged) {
          selectionChangeCount += 1;
        }
      }

      observedMinimum = Math.min(observedMinimum, metadata!.evaluatedCandidateCount);
      rows.push({
        band,
        candidate: metadata!.candidate,
        candidateCount: metadata!.candidateCount,
        evaluatedCandidateCount: metadata!.evaluatedCandidateCount,
        perimeterOpeningCount: metadata!.perimeterOpeningCount,
        perimeterOpenings: metadata!.perimeterOpenings,
        pressurePoint: slowTile.placement?.point ?? null,
        routeInteriorTileCount: metadata!.routeInteriorTileCount,
        routeOpeningCount: metadata!.routeOpeningCount,
        routeOpeningEdges: metadata!.routeOpeningEdges,
        roomsEnabled: metadata!.roomsEnabled,
        routeThresholds: metadata!.routeThresholds,
        sideClosureCount: metadata!.sideClosureCount,
        sideClosureEdges: metadata!.sideClosureEdges,
        seed,
        size: maze.width,
        source: metadata!.source
      });
    }

    minimumEvaluatedByBand[band] = observedMinimum;
  }

  if (assertContracts) {
    expect(selectionChangeCount).toBe(priorOverCapCount);
  }
  return {
    minimumEvaluatedByBand,
    priorOverCapCount,
    rows,
    selectionChangeCount
  };
};

type CorpusPass = ReturnType<typeof runCorpusPass>;
type CorpusPassPair = [CorpusPass, CorpusPass];

const runCorpusWorker = (
  firstSeed: number,
  resultPath: string
): Promise<CorpusPassPair> => new Promise((resolveWorker, rejectWorker) => {
  const vitestPath = resolve(process.cwd(), 'node_modules/vitest/vitest.mjs');
  const testPath = resolve(process.cwd(), 'tests/reset/legacy-room-candidate-metadata.test.ts');
  const child = spawn(
    process.execPath,
    [vitestPath, 'run', testPath, '--maxWorkers', '1'],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        MAZER_ROOM_CORPUS_FIRST_SEED: String(firstSeed),
        MAZER_ROOM_CORPUS_RESULT_PATH: resultPath
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    }
  );
  let settled = false;
  let stdout = '';
  let stderr = '';
  const timeout = setTimeout(() => {
    if (settled) {
      return;
    }
    settled = true;
    child.kill();
    rejectWorker(new Error(`Corpus worker ${firstSeed} timed out after 45 seconds.`));
  }, 45_000);

  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.on('data', (chunk: string) => {
    stderr += chunk;
  });
  child.on('error', (error) => {
    if (settled) {
      return;
    }
    settled = true;
    clearTimeout(timeout);
    rejectWorker(error);
  });
  child.on('close', (code, signal) => {
    if (settled) {
      return;
    }
    settled = true;
    clearTimeout(timeout);
    if (code !== 0) {
      rejectWorker(new Error(
        `Corpus worker ${firstSeed} exited ${code ?? signal}.\n${stdout}\n${stderr}`
      ));
      return;
    }
    resolveWorker(JSON.parse(readFileSync(resultPath, 'utf8')) as CorpusPassPair);
  });
});

const corpusWorkerFirstSeed = process.env.MAZER_ROOM_CORPUS_FIRST_SEED
  ? Number.parseInt(process.env.MAZER_ROOM_CORPUS_FIRST_SEED, 10)
  : null;

if (corpusWorkerFirstSeed !== null) {
  describe('legacy room-candidate metadata bounded worker', () => {
    test(`validates seeds ${corpusWorkerFirstSeed}-${corpusWorkerFirstSeed + 9}`, () => {
      const chunk = corpusSeedChunks.find(({ firstSeed }) => (
        firstSeed === corpusWorkerFirstSeed
      ));
      const resultPath = process.env.MAZER_ROOM_CORPUS_RESULT_PATH;
      expect(chunk).toBeDefined();
      expect(resultPath).toBeTruthy();
      const passes: CorpusPassPair = [
        runCorpusPass(chunk!.seeds, true),
        runCorpusPass(chunk!.seeds, false)
      ];
      expect(passes[0].rows).toEqual(passes[1].rows);
      writeFileSync(resultPath!, JSON.stringify(passes), 'utf8');
    }, 30_000);
  });
} else {
  describe('legacy room-candidate metadata', () => {
    test('caps perimeter openings through bounded corpus workers', async () => {
      const artifactDirectory = mkdtempSync(join(tmpdir(), 'mazer-room-corpus-'));
      const passPairs: CorpusPassPair[] = [];

      try {
        for (let index = 0; index < corpusSeedChunks.length; index += 4) {
          const batch = corpusSeedChunks.slice(index, index + 4);
          passPairs.push(...await Promise.all(batch.map(({ firstSeed }) => (
            runCorpusWorker(firstSeed, join(artifactDirectory, `${firstSeed}.json`))
          ))));
        }
      } finally {
        rmSync(artifactDirectory, { force: true, recursive: true });
      }

      const firstPasses = passPairs.map(([firstPass]) => firstPass);
      const secondPasses = passPairs.map(([, secondPass]) => secondPass);
    const firstPassRows = corpusBands.flatMap(({ band }) => (
      firstPasses.flatMap((pass) => pass.rows.filter((row) => row.band === band))
    ));
    const secondPassRows = corpusBands.flatMap(({ band }) => (
      secondPasses.flatMap((pass) => pass.rows.filter((row) => row.band === band))
    ));

    expect(firstPassRows).toHaveLength(200);
    expect(secondPassRows).toEqual(firstPassRows);
    for (const { band, minimumEvaluated } of corpusBands) {
      expect(Math.min(...firstPasses.map((pass) => pass.minimumEvaluatedByBand[band])))
        .toBe(minimumEvaluated);
    }
    expect(firstPasses.reduce((total, pass) => total + pass.priorOverCapCount, 0)).toBe(25);
    expect(firstPasses.reduce((total, pass) => total + pass.selectionChangeCount, 0)).toBe(25);
    expect(firstPassRows.reduce<Record<number, number>>((distribution, row) => {
      distribution[row.perimeterOpeningCount] = (
        distribution[row.perimeterOpeningCount] ?? 0
      ) + 1;
      return distribution;
    }, {})).toEqual({
      2: 19,
      3: 106,
      4: 75
    });
    expect(firstPassRows.reduce<Record<number, number>>((distribution, row) => {
      distribution[row.sideClosureCount] = (
        distribution[row.sideClosureCount] ?? 0
      ) + 1;
      return distribution;
    }, {})).toEqual({
      0: 19,
      1: 106,
      2: 75
    });
    const h1 = sha256(firstPassRows.map((row) => ({
      band: row.band,
      seed: row.seed,
      size: row.size,
      candidate: row.candidate,
      candidateCount: row.candidateCount,
      evaluatedCandidateCount: row.evaluatedCandidateCount,
      roomsEnabled: row.roomsEnabled,
      source: row.source,
      pressurePoint: row.pressurePoint
    })));
    const h2 = sha256(firstPassRows.map((row) => ({
      band: row.band,
      seed: row.seed,
      size: row.size,
      routeThresholds: row.routeThresholds
    })));
    const h3 = sha256(firstPassRows.map((row) => ({
      band: row.band,
      seed: row.seed,
      size: row.size,
      routeInteriorTileCount: row.routeInteriorTileCount
    })));
    const h4 = sha256(firstPassRows.map((row) => ({
      band: row.band,
      seed: row.seed,
      size: row.size,
      perimeterOpeningCount: row.perimeterOpeningCount
    })));
    const h5 = sha256(firstPassRows.map((row) => ({
      band: row.band,
      seed: row.seed,
      size: row.size,
      perimeterOpenings: row.perimeterOpenings
    })));
    const h6 = sha256(firstPassRows.map((row) => ({
      band: row.band,
      seed: row.seed,
      size: row.size,
      routeOpeningCount: row.routeOpeningCount,
      routeOpeningEdges: row.routeOpeningEdges
    })));
    const h7 = sha256(firstPassRows.map((row) => ({
      band: row.band,
      seed: row.seed,
      size: row.size,
      sideClosureCount: row.sideClosureCount,
      sideClosureEdges: row.sideClosureEdges
    })));
    expect(h1).toBe('00ca2b131207e1883d381fd27b614767d4fef1aab4b07a6786b5623946006dc7');
    expect(h2).toBe('037c6096bf6036b3d365828a1f0806e66eb6e410a9fbeca0dac9e4bcfe734c72');
    expect(h3).toBe('8aa5b3785c89a0ace02a05b29434bc10484258d9cd0dca7de38dfeb56e8de8ae');
    expect(h4).toBe('62ec7afc84f6ecd99b18d3a2f8088552226c666ad23af870f29aafbf6d648e11');
    expect(h5).toBe('f38a148959efc87f056035b3b603fe31eeff9f54708b25a07601a4a0203ccc78');
    expect(h6).toBe('84f6fe7ee1e8fd33da509e2e965e76316895099461d4b8c7cbda29ca71f78c2d');
    expect(h7).toBe('3f4d20a26636b44dcca5a37889626abf461775ca19dc9ce517a19200b10987bc');
    }, 120_000);

    test('keeps Tutorial through Navigator ineligible', () => {
      const maze = createLegacyRuntimeMazeForMode(
        'play',
        71,
        1,
        resolveLegacyMazeGenerationProfileForProgression(132)
      );

      for (const band of ['tutorial', 'starter', 'explorer', 'navigator'] as const) {
        expect(createLegacyRoomCandidateMetadata(maze, band)).toBeNull();
      }
    });

    test('wires metadata to play diagnostics without a render or gameplay consumer', () => {
      const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');
      const diagnosticsSource = readFileSync(
        resolve(process.cwd(), 'src/scenes/menuRuntimeDiagnostics.ts'),
        'utf8'
      );

      expect(menuSceneSource).toContain('private playRoomCandidateMetadata: LegacyRoomCandidateMetadata | null = null;');
      expect(menuSceneSource).toContain('this.playRoomCandidateMetadata = createLegacyRoomCandidateMetadata(');
      expect(menuSceneSource).toContain('roomCandidate: this.playRoomCandidateMetadata');
      expect(diagnosticsSource).toContain("contractVersion: 'legacy-room-candidate-metadata-v7';");
      expect(menuSceneSource)
        .toContain('perimeterOpeningCount: this.playRoomCandidateMetadata.perimeterOpeningCount');
      expect(menuSceneSource)
        .toContain('perimeterOpenings: this.playRoomCandidateMetadata.perimeterOpenings.map(');
      expect(menuSceneSource).toContain('inside: { ...opening.inside }');
      expect(menuSceneSource).toContain('outside: { ...opening.outside }');
      expect(menuSceneSource)
        .toContain('routeInteriorTileCount: this.playRoomCandidateMetadata.routeInteriorTileCount');
      expect(menuSceneSource)
        .toContain('routeOpeningCount: this.playRoomCandidateMetadata.routeOpeningCount');
      expect(menuSceneSource)
        .toContain('routeOpeningEdges: this.playRoomCandidateMetadata.routeOpeningEdges.map(');
      expect(menuSceneSource)
        .toContain('routeThresholds: this.playRoomCandidateMetadata.routeThresholds.map(');
      expect(menuSceneSource)
        .toContain('sideClosureCount: this.playRoomCandidateMetadata.sideClosureCount');
      expect(menuSceneSource)
        .toContain('sideClosureEdges: this.playRoomCandidateMetadata.sideClosureEdges.map(');
      expect(menuSceneSource).not.toContain('drawLegacyRoomCandidate');
      expect(menuSceneSource).not.toContain('applyLegacyRoomCandidate');
      expect(menuSceneSource).not.toContain('drawLegacyRoomRouteThreshold');
      expect(menuSceneSource).not.toContain('applyLegacyRoomRouteThreshold');
      expect(menuSceneSource).not.toContain('drawLegacyRoomPerimeterOpening');
      expect(menuSceneSource).not.toContain('applyLegacyRoomPerimeterOpening');
      expect(menuSceneSource).not.toContain('drawLegacyRoomRouteOpening');
      expect(menuSceneSource).not.toContain('applyLegacyRoomRouteOpening');
      expect(menuSceneSource).not.toContain('drawLegacyRoomSideClosure');
      expect(menuSceneSource).not.toContain('applyLegacyRoomSideClosure');
    });
  });
}
