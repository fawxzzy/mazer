export interface InstallSurfaceState {
  mode: 'hidden' | 'available' | 'manual';
  canPrompt: boolean;
  installed: boolean;
  standalone: boolean;
  instruction?: string;
}

export interface InstallSurfaceSnapshot {
  standalone: boolean;
  installed: boolean;
  canPrompt: boolean;
  dismissed?: boolean;
  instruction?: string;
}

export interface DeferredInstallPromptChoice {
  outcome: 'accepted' | 'dismissed';
  platform?: string;
}

export interface DeferredInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<DeferredInstallPromptChoice>;
}

export type InstallPromptOutcome = DeferredInstallPromptChoice['outcome'] | 'unavailable';

const HIDDEN_INSTALL_SURFACE_STATE: InstallSurfaceState = {
  mode: 'hidden',
  canPrompt: false,
  installed: false,
  standalone: false
};

let installState: InstallSurfaceState = { ...HIDDEN_INSTALL_SURFACE_STATE };

const subscribers = new Set<(state: InstallSurfaceState) => void>();

const publishInstallSurfaceState = (): InstallSurfaceState => {
  installState = { ...HIDDEN_INSTALL_SURFACE_STATE };

  for (const subscriber of subscribers) {
    subscriber(installState);
  }

  return installState;
};

export const resolveManualInstallInstruction = (
  _navigatorLike: unknown
): string | undefined => undefined;

export const resolveInstallSurfaceState = (
  _snapshot: InstallSurfaceSnapshot
): InstallSurfaceState => ({ ...HIDDEN_INSTALL_SURFACE_STATE });

export const initializeInstallSurface = (
  _runtime?: unknown
): InstallSurfaceState => publishInstallSurfaceState();

export const getInstallSurfaceState = (): InstallSurfaceState => installState;

export const subscribeInstallSurface = (
  listener: (state: InstallSurfaceState) => void
): (() => void) => {
  subscribers.add(listener);

  return () => {
    subscribers.delete(listener);
  };
};

export const dismissInstallSurface = (): InstallSurfaceState => publishInstallSurfaceState();

export const promptInstallSurface = async (): Promise<InstallPromptOutcome> => 'unavailable';

export const resetInstallSurfaceRuntimeForTests = (): void => {
  subscribers.clear();
  installState = { ...HIDDEN_INSTALL_SURFACE_STATE };
};
