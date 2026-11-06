import type Phaser from 'phaser';
import {
  resolveLegacyBootMessage,
  type LegacyPlayerMessage
} from '../legacy-runtime/legacyPlayerMessage';
import {
  removeMazerBootSplash,
  resolveMazerBootSplashMessage,
  setMazerBootSplashMessage
} from './bootSplash';

export const MAZER_BOOT_STATUS_WINDOW_KEY = '__MAZER_BOOT_STATUS__' as const;
export const MAZER_GAME_WINDOW_KEY = '__MAZER_GAME__' as const;

export type MazerBootStage =
  | 'boot-start'
  | 'reload-requested'
  | 'install-gate-checking'
  | 'shared-account-redirect'
  | 'oauth-exchange'
  | 'account-bootstrap'
  | 'game-creating'
  | 'game-created'
  | 'service-worker-error'
  | 'menu-scene-create'
  | 'splash-removed'
  | 'error';

export interface MazerBootStatus {
  errorMessage?: string;
  gameCreated: boolean;
  menuSceneCreated: boolean;
  playerMessage?: LegacyPlayerMessage;
  /** True once the static index.html boot splash has been removed (menu ready, install gate shown, or boot error). */
  splashRemoved: boolean;
  stage: MazerBootStage;
  updatedAtIso: string;
}

declare global {
  interface Window {
    __MAZER_BOOT_STATUS__?: MazerBootStatus;
    __MAZER_GAME__?: Phaser.Game;
  }
}

const buildStatus = (
  stage: MazerBootStage,
  previous: MazerBootStatus | undefined,
  errorMessage?: string
): MazerBootStatus => {
  const playerMessage = stage === 'error' || stage === 'service-worker-error'
    ? resolveLegacyBootMessage(stage, errorMessage)
    : previous?.playerMessage;

  return {
    stage,
    updatedAtIso: new Date().toISOString(),
    gameCreated: previous?.gameCreated === true || stage === 'game-created' || stage === 'menu-scene-create',
    menuSceneCreated: previous?.menuSceneCreated === true || stage === 'menu-scene-create',
    splashRemoved: previous?.splashRemoved === true || stage === 'splash-removed' || stage === 'error',
    ...(errorMessage ? { errorMessage } : previous?.errorMessage ? { errorMessage: previous.errorMessage } : {}),
    ...(playerMessage ? { playerMessage } : {})
  };
};

export const markMazerBootStatus = (stage: MazerBootStage, errorMessage?: string): void => {
  if (typeof window === 'undefined') {
    return;
  }

  window[MAZER_BOOT_STATUS_WINDOW_KEY] = buildStatus(stage, window[MAZER_BOOT_STATUS_WINDOW_KEY], errorMessage);

  // The static splash follows the boot stages: its message tracks the stage
  // (only a live OAuth exchange says "Signing you in"), and it is removed
  // explicitly when the menu exists, when the install gate takes over, or when
  // boot fails (so an error is never hidden behind it).
  setMazerBootSplashMessage(resolveMazerBootSplashMessage(stage));
  if (stage === 'splash-removed' || stage === 'error') {
    removeMazerBootSplash();
  } else if (stage === 'menu-scene-create') {
    markMazerBootStatus('splash-removed');
  }
};

export const attachMazerGameToWindow = (game: Phaser.Game): void => {
  if (typeof window === 'undefined') {
    return;
  }

  window[MAZER_GAME_WINDOW_KEY] = game;
};

export const clearMazerBootStatusForTests = (): void => {
  if (typeof window === 'undefined') {
    return;
  }

  delete window[MAZER_BOOT_STATUS_WINDOW_KEY];
  delete window[MAZER_GAME_WINDOW_KEY];
};
