import type { UiStateSnapshot } from './uiState';
import type { UiPlatformProfile } from './uiProfiles';

export const UI_VIEW_MODEL_NAMES = [
  'HomeViewModel',
  'AuthViewModel',
  'GameplayHudViewModel',
  'ControlSurfaceViewModel',
  'SettingsViewModel',
  'GuideViewModel',
  'LeaderboardViewModel',
  'ResultViewModel',
  'SystemStatusViewModel',
  'WatchPassViewModel'
] as const;

export interface HomeViewModel {
  readonly visible: boolean;
  readonly authenticated: boolean;
  readonly canStart: boolean;
}

export interface AuthViewModel {
  readonly visible: boolean;
  readonly phase: UiStateSnapshot['authPhase'];
  readonly pending: boolean;
}

export interface GameplayHudViewModel {
  readonly visible: boolean;
  readonly gamePhase: UiStateSnapshot['gamePhase'];
  readonly paused: boolean;
}

export interface ControlSurfaceViewModel {
  readonly visible: boolean;
  readonly mode: UiStateSnapshot['controlMode'];
  readonly enabled: boolean;
}

export interface SettingsViewModel {
  readonly visible: boolean;
  readonly motionMode: UiStateSnapshot['motionMode'];
  readonly effectsQuality: UiStateSnapshot['effectsQuality'];
}

export interface GuideViewModel {
  readonly visible: boolean;
}

export interface LeaderboardViewModel {
  readonly visible: boolean;
  readonly authenticated: boolean;
}

export interface ResultViewModel {
  readonly visible: boolean;
  readonly complete: boolean;
}

export interface SystemStatusViewModel {
  readonly visible: boolean;
  readonly connectionPhase: UiStateSnapshot['connectionPhase'];
  readonly installPhase: UiStateSnapshot['installPhase'];
}

export interface WatchPassViewModel {
  readonly visible: boolean;
  readonly surface: 'watch-pass-setup' | 'watch-pass-preview' | null;
}

export interface UiViewModels {
  readonly profile: UiPlatformProfile;
  readonly home: HomeViewModel;
  readonly auth: AuthViewModel;
  readonly gameplayHud: GameplayHudViewModel;
  readonly controlSurface: ControlSurfaceViewModel;
  readonly settings: SettingsViewModel;
  readonly guide: GuideViewModel;
  readonly leaderboard: LeaderboardViewModel;
  readonly result: ResultViewModel;
  readonly systemStatus: SystemStatusViewModel;
  readonly watchPass: WatchPassViewModel;
}

const frozen = <T extends object>(value: T): Readonly<T> => Object.freeze(value);

export const createUiViewModels = (snapshot: UiStateSnapshot, profile: UiPlatformProfile): UiViewModels => {
  const playVisible = snapshot.primarySurface === 'play';
  const watchPassSurface = (
    snapshot.primarySurface === 'watch-pass-setup' || snapshot.primarySurface === 'watch-pass-preview'
      ? snapshot.primarySurface
      : null
  );

  return frozen({
    profile,
    home: frozen({
      visible: snapshot.primarySurface === 'home',
      authenticated: snapshot.authPhase === 'authenticated',
      canStart: snapshot.gamePhase === 'idle' || snapshot.gamePhase === 'complete'
    }),
    auth: frozen({
      visible: snapshot.primarySurface === 'account',
      phase: snapshot.authPhase,
      pending: snapshot.authPhase === 'pending'
    }),
    gameplayHud: frozen({
      visible: playVisible,
      gamePhase: snapshot.gamePhase,
      paused: snapshot.gamePhase === 'paused'
    }),
    controlSurface: frozen({
      visible: playVisible,
      mode: snapshot.controlMode,
      enabled: snapshot.gamePhase === 'active'
    }),
    settings: frozen({
      visible: snapshot.primarySurface === 'settings',
      motionMode: snapshot.motionMode,
      effectsQuality: snapshot.effectsQuality
    }),
    guide: frozen({ visible: snapshot.primarySurface === 'guide' }),
    leaderboard: frozen({
      visible: snapshot.primarySurface === 'leaderboard',
      authenticated: snapshot.authPhase === 'authenticated'
    }),
    result: frozen({
      visible: snapshot.primarySurface === 'result',
      complete: snapshot.gamePhase === 'complete'
    }),
    systemStatus: frozen({
      visible: snapshot.connectionPhase !== 'online' || !['hidden', 'dismissed'].includes(snapshot.installPhase),
      connectionPhase: snapshot.connectionPhase,
      installPhase: snapshot.installPhase
    }),
    watchPass: frozen({ visible: watchPassSurface !== null, surface: watchPassSurface })
  });
};
