import { isWalkableTile, movePoint, type LegacyMazeSnapshot, type LegacyPoint } from './legacyMaze';

export const LEGACY_PLAY_TRAIL_FADE_TAIL = 16;
export const LEGACY_SIMULTANEOUS_KEY_PRESS_DELAY_MS = 50;

export interface LegacyPlayMoveFlags {
  down: boolean;
  left: boolean;
  right: boolean;
  up: boolean;
}

export interface LegacyPlayStepInput {
  deltaX: number;
  deltaY: number;
  maze: LegacyMazeSnapshot;
  player: LegacyPoint;
  toggleTrailFade: boolean;
  trail: LegacyPoint[];
  trailFadeTail?: number;
}

export interface LegacyPlayStepResult {
  moved: boolean;
  player: LegacyPoint;
  reachedGoal: boolean;
  trail: LegacyPoint[];
}

const copyPoint = (point: LegacyPoint): LegacyPoint => ({ x: point.x, y: point.y });

export const createLegacyPlayMoveFlags = (): LegacyPlayMoveFlags => ({
  down: false,
  left: false,
  right: false,
  up: false
});

export const resolveLegacyPlayMoveVector = (
  flags: LegacyPlayMoveFlags
): { deltaX: number; deltaY: number } => ({
  deltaX: (flags.right ? 1 : 0) - (flags.left ? 1 : 0),
  deltaY: (flags.down ? 1 : 0) - (flags.up ? 1 : 0)
});

export const advanceLegacyPlayStep = ({
  deltaX,
  deltaY,
  maze,
  player,
  toggleTrailFade,
  trail,
  trailFadeTail = LEGACY_PLAY_TRAIL_FADE_TAIL
}: LegacyPlayStepInput): LegacyPlayStepResult => {
  const next = movePoint(player, deltaX, deltaY);
  if (!isWalkableTile(maze, next)) {
    return {
      moved: false,
      player: copyPoint(player),
      reachedGoal: false,
      trail: trail.map(copyPoint)
    };
  }

  const nextPlayer = copyPoint(next);
  const nextTrail = [...trail.map(copyPoint), copyPoint(nextPlayer)];
  const boundedTrail = toggleTrailFade && nextTrail.length > trailFadeTail
    ? nextTrail.slice(nextTrail.length - trailFadeTail)
    : nextTrail;

  return {
    moved: true,
    player: nextPlayer,
    reachedGoal: nextPlayer.x === maze.goal.x && nextPlayer.y === maze.goal.y,
    trail: boundedTrail
  };
};
