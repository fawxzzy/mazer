// Shared helpers of the one-tile stub census script and its regression test (MAZER-GEN-006 follow-up).
import { createLegacyRuntimeMazeForMode } from '../../../src/legacy-runtime/legacyGenerationLifecycle';
import type { LegacyMazeSnapshot } from '../../../src/legacy-runtime/legacyMaze';
import {
  resolveLegacyMazeGenerationProfileForProgression,
  resolveLegacyMenuDemoMazeGenerationProfileForProgression,
  resolveLegacyProgressionScaleDetail
} from '../../../src/legacy-runtime/legacyProgression';
import { collectOneTileStubs, countOpenNeighbors } from '../../../src/legacy-runtime/legacyMazeStubs';
import { LADDER_BOARDS, seedForIndex, trackForLevel } from './progressionLadderSampling';

export { LADDER_BOARDS, seedForIndex };

export type StubCensusProfile = 'play' | 'menu';

// The viewport the real game builds each board for (phone 390x844, desktop 1280x720).
const VIEWPORTS = {
  phone: { width: 390, height: 844 },
  desktop: { width: 1280, height: 720 }
} as const;

// The exact inputs MenuScene resolves for a level: scale and feeder fraction from the viewport, the
// profile of its mode, the aspect ratio of the board, the track's target complexity.
export const generateStubCensusMaze = (
  level: number,
  board: typeof LADDER_BOARDS[number],
  seed: number,
  profile: StubCensusProfile
): LegacyMazeSnapshot => {
  const track = trackForLevel(level);
  const viewport = VIEWPORTS[board.name];
  const detail = resolveLegacyProgressionScaleDetail(50, track, {
    surface: profile === 'play' ? 'play' : 'menu-demo',
    viewport: { ...viewport, useFloatingTouchControls: true } as never
  });
  const scaleContext = { fraction: detail.fraction, sizeRule: detail.sizeRule };
  const generationProfile = profile === 'play'
    ? resolveLegacyMazeGenerationProfileForProgression(track, scaleContext)
    : resolveLegacyMenuDemoMazeGenerationProfileForProgression(track, scaleContext);
  return createLegacyRuntimeMazeForMode(
    profile === 'play' ? 'play' : 'menu',
    detail.scale,
    seed,
    generationProfile,
    { targetComplexity: track.targetComplexity },
    board.aspectRatio
  );
};

export interface MazeStubCounts {
  // Dead-end branches of exactly one cell (start and goal excluded): the GEN-004 definition.
  readonly strict: number;
  // Every one-open-neighbour floor cell (start and goal INCLUDED) whose only neighbour is a junction.
  readonly loose: number;
  // Loose nubs that sit on the border ring.
  readonly border: number;
}

export const countMazeStubs = (maze: LegacyMazeSnapshot): MazeStubCounts => {
  const strict = collectOneTileStubs(maze).length;
  let loose = 0;
  let border = 0;
  const { width, height, grid } = maze;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (grid[y]?.[x] !== true || countOpenNeighbors(maze, x, y) !== 1) { continue; }
      let hostDegree = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = (x + dx + width) % width;
        const ny = (y + dy + height) % height;
        if ((nx !== x || ny !== y) && grid[ny]?.[nx] === true) { hostDegree = countOpenNeighbors(maze, nx, ny); }
      }
      if (hostDegree < 3) { continue; }
      loose += 1;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) { border += 1; }
    }
  }
  return { strict, loose, border };
};
