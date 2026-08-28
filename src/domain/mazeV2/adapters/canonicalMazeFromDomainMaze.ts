// Bridges src/domain/maze's OWN output into MazeV2CanonicalMaze -- the same
// neutral shape canonicalMaze.ts already bridges legacy-runtime's boolean[][]
// grid into.
//
// Deliberately bridges from MazeEpisode.raster (the TileBoard), NOT
// MazeEpisode.core. Investigation for this PR found the two are NOT the same
// grid: MazeBuildOptions.width/height only loosely determine the OUTPUT size
// -- buildMaze() first quantizes them into a much smaller "logical carving"
// lattice (generator.ts's normalizeLogicalSize: max(4, floor((n+1)/2))), then
// core.width/height report THAT smaller lattice, while the actual walkable
// board a player would see is raster, sized (core.width*2-1) per axis. A
// canonical maze built from `core` would silently misreport this engine's
// real board size to every downstream comparison -- e.g. a requested 16x16
// resolves to an 8x8 core but a 15x15 raster, and neither number is 16.
// Bridging from raster is the fair, honest comparison point since it's what
// the OTHER engine's grid (legacy-runtime's own walkable board) is actually
// analogous to.
//
// Mirrors canonicalMaze.ts's own wrapPairs honesty: src/domain/maze has no
// wrap/bleed topology concept anywhere in its type contract (MazeCore/
// MazeConfig/MazeBuildOptions have no wrap-related field at all), so this
// always returns an empty wrapPairs array -- not a bridge gap the way
// legacy-runtime's is, but a genuine absence in the engine itself.

import { isTileFloor, xFromIndex, yFromIndex } from '../../maze/grid';
import type { TileBoard } from '../../maze/types';
import type { MazeV2CanonicalMaze } from '../types';

export const deriveMazeV2CanonicalMazeFromDomainMazeRaster = (raster: TileBoard): MazeV2CanonicalMaze => {
  const walkable: boolean[][] = [];
  for (let y = 0; y < raster.height; y += 1) {
    const row: boolean[] = [];
    for (let x = 0; x < raster.width; x += 1) {
      row.push(isTileFloor(raster.tiles, (y * raster.width) + x));
    }
    walkable.push(row);
  }

  return {
    width: raster.width,
    height: raster.height,
    walkable,
    start: { x: xFromIndex(raster.startIndex, raster.width), y: yFromIndex(raster.startIndex, raster.width) },
    goal: { x: xFromIndex(raster.endIndex, raster.width), y: yFromIndex(raster.endIndex, raster.width) },
    wrapPairs: []
  };
};
