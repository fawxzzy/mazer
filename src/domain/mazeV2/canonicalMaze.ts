// Bridges an already-generated legacy-runtime LegacyMazeSnapshot into the
// neutral MazeV2CanonicalMaze shape -- see that type's own doc comment in
// types.ts for why it exists (one exchange shape both engines convert into,
// so one analyzer and one identity scheme can measure either without
// engine-specific branching). The generator-convergence work (a later PR in
// this same wave) adds the matching src/domain/maze/ -> MazeV2CanonicalMaze
// bridge; this file only covers the legacy-runtime side, which is what
// metrics.ts already depends on.

import type { LegacyMazeSnapshot } from '../../legacy-runtime/legacyMaze';
import type { MazeV2CanonicalMaze, MazeV2WrapPair } from './types';

// legacy-runtime's own wrap-topology diagnostics record aggregate pair
// counts (mazer.mazer_progression_states-adjacent reporting fields), not
// the actual list of connected tile pairs -- there is currently no per-pair
// list anywhere in LegacyMazeSnapshot to bridge from. Rather than fabricate
// wrap pairs this bridge cannot actually observe, this returns an empty
// list and topology identity/metrics fall back to whatever the snapshot's
// own grid/solutionPath-derived measurements already capture. Documented
// here rather than silently done, since it means a legacy-runtime maze with
// real wrap connections currently bridges into a MazeV2CanonicalMaze that
// looks wrap-free -- a genuine bridge-fidelity gap, not a bug in this
// function, and one only legacy-runtime exposing the real pair list (or a
// future generator building on MazeV2CanonicalMaze natively) can close.
const deriveLegacyWrapPairs = (): readonly MazeV2WrapPair[] => [];

export const deriveMazeV2CanonicalMazeFromLegacySnapshot = (
  maze: Pick<LegacyMazeSnapshot, 'width' | 'height' | 'grid' | 'start' | 'goal'>
): MazeV2CanonicalMaze => ({
  width: maze.width,
  height: maze.height,
  walkable: maze.grid.map((row) => [...row]),
  start: { x: maze.start.x, y: maze.start.y },
  goal: { x: maze.goal.x, y: maze.goal.y },
  wrapPairs: deriveLegacyWrapPairs()
});
