/**
 * The device-snapped trail path (MAZER-VIS-025).
 *
 * The player marker, the baked tiles and the end glyphs are centred on `snappedCellCenter` (the tile's centre between
 * two whole device-pixel grid lines), and the marker glides linearly between two snapped centres
 * (`resolvePlayerMarkerCenter`). The trail used to project cells with the plain linear `origin + (cell + 0.5) * tile`
 * (`buildContinuousTrailPath`), so its live head could sit up to half a device pixel from the marker's centre (hidden
 * under the trail width, but a real offset that varies per cell on fractional DPRs). `buildDeviceSnappedTrailPath` is
 * `buildContinuousTrailPath` with the projection swapped for the marker's own, so a head at the marker's cell is at the
 * marker's exact centre and mid-glide it is at the marker's interpolated centre. Everything after the projection (corner
 * rounding, trimming, geometry) is the same navigationCoreTrail.ts code. Pure; no Phaser import.
 */
import type { LegacyPoint } from '../legacy-runtime/legacyMaze';
import {
  buildTrailGeometryFromPixelSubpaths,
  roundPolylineCorners,
  splitGridPathAtDiscontinuities,
  trimPolylineEnd,
  type PixelPoint,
  type TrailGeometry
} from './navigationCoreTrail';
import { resolvePlayerMarkerCenter } from './playerMarker';

export interface DeviceSnappedTrailPathOptions {
  /** Same meaning as `BuildContinuousTrailPathOptions.gridPath`: visited path with the rendered head as last point. */
  gridPath: readonly LegacyPoint[];
  /** The board origin the marker is drawn from (the board layer's snapped origin). */
  originX: number;
  originY: number;
  tileSize: number;
  /** The same backing scale the marker uses (`resolveBoardTileBackingScale`). */
  devicePixelRatio: number;
  cornerRadiusRatio: number;
  playerTrimRatio: number;
}

export const createDeviceSnappedTrailProjector = (
  tileSize: number,
  devicePixelRatio: number,
  originX: number,
  originY: number
) => (point: LegacyPoint): PixelPoint => {
  const center = resolvePlayerMarkerCenter(point.x, point.y, tileSize, devicePixelRatio, originX, originY);
  return { x: center.x, y: center.y };
};

export const buildDeviceSnappedTrailPath = (options: DeviceSnappedTrailPathOptions): TrailGeometry => {
  const project = createDeviceSnappedTrailProjector(
    options.tileSize, options.devicePixelRatio, options.originX, options.originY
  );
  const rounded = splitGridPathAtDiscontinuities(options.gridPath).map((subpath) => (
    roundPolylineCorners(subpath.map(project), options.tileSize * options.cornerRadiusRatio)
  ));
  if (rounded.length > 0) {
    const lastIndex = rounded.length - 1;
    rounded[lastIndex] = trimPolylineEnd(rounded[lastIndex]!, options.tileSize * options.playerTrimRatio);
  }
  return buildTrailGeometryFromPixelSubpaths(rounded);
};
