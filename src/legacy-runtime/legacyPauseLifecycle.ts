import type { LegacyPoint } from './legacyMaze';

export type LegacyPauseCommand = 'reset-player' | 'return-menu' | 'resume' | 'reset-progression';

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
  _currentTrail: readonly LegacyPoint[] = []
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
      return {
        closesOverlay: true,
        enterMenu: false,
        nextPlayer,
        nextTrail: [copyPoint(nextPlayer)]
      };
    }
    case 'return-menu':
      return {
        closesOverlay: false,
        enterMenu: true,
        nextPlayer: null,
        nextTrail: null
      };
    case 'reset-progression':
      return {
        closesOverlay: false,
        enterMenu: false,
        nextPlayer: null,
        nextTrail: null
      };
    default:
      return command satisfies never;
  }
};
