import type { LegacyPoint } from './legacyMaze';

export type LegacyPauseCommand = 'reset-player' | 'return-menu' | 'resume';

export interface LegacyPauseCommandResult {
  closesOverlay: boolean;
  enterMenu: boolean;
  nextPlayer: LegacyPoint | null;
  nextTrail: LegacyPoint[] | null;
}

const copyPoint = (point: LegacyPoint): LegacyPoint => ({ x: point.x, y: point.y });

export const resolveLegacyPauseCommand = (
  command: LegacyPauseCommand,
  start: LegacyPoint,
  currentTrail: readonly LegacyPoint[] = []
): LegacyPauseCommandResult => {
  switch (command) {
    case 'resume':
      return {
        closesOverlay: true,
        enterMenu: false,
        nextPlayer: null,
        nextTrail: null
      };
    case 'reset-player': {
      const nextPlayer = copyPoint(start);
      const preservedTrail = currentTrail.map(copyPoint);
      const trailAlreadyEndsAtStart = preservedTrail.at(-1)?.x === nextPlayer.x
        && preservedTrail.at(-1)?.y === nextPlayer.y;
      return {
        closesOverlay: true,
        enterMenu: false,
        nextPlayer,
        nextTrail: trailAlreadyEndsAtStart
          ? preservedTrail
          : [...preservedTrail, copyPoint(nextPlayer)]
      };
    }
    case 'return-menu':
      return {
        closesOverlay: false,
        enterMenu: true,
        nextPlayer: null,
        nextTrail: null
      };
    default:
      return command satisfies never;
  }
};
