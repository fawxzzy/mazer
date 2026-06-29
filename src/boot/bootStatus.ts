import type Phaser from 'phaser';

export const MAZER_BOOT_STATUS_WINDOW_KEY = '__MAZER_BOOT_STATUS__' as const;
export const MAZER_GAME_WINDOW_KEY = '__MAZER_GAME__' as const;

export type MazerBootStage =
  | 'boot-start'
  | 'reload-requested'
  | 'game-creating'
  | 'game-created'
  | 'menu-scene-create'
  | 'error';

export interface MazerBootStatus {
  errorMessage?: string;
  gameCreated: boolean;
  menuSceneCreated: boolean;
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
): MazerBootStatus => ({
  stage,
  updatedAtIso: new Date().toISOString(),
  gameCreated: previous?.gameCreated === true || stage === 'game-created' || stage === 'menu-scene-create',
  menuSceneCreated: previous?.menuSceneCreated === true || stage === 'menu-scene-create',
  ...(errorMessage ? { errorMessage } : previous?.errorMessage ? { errorMessage: previous.errorMessage } : {})
});

export const markMazerBootStatus = (stage: MazerBootStage, errorMessage?: string): void => {
  if (typeof window === 'undefined') {
    return;
  }

  window[MAZER_BOOT_STATUS_WINDOW_KEY] = buildStatus(stage, window[MAZER_BOOT_STATUS_WINDOW_KEY], errorMessage);
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
