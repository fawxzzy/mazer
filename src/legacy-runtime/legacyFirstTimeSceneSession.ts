/**
 * First-time cards: one session per play scene and account scope, shared by the card host (legacyFirstTimeHost.ts) and
 * the Guide (legacyFirstTimeGuideHost.ts, slice 4). Sharing matters on a Level Preview route (`?previewLevel=N`): the
 * session keeps its record in memory there, so a second session would not see what the cards wrote. No Phaser here.
 *
 * Flag off: the session is inert (store() null) and reads no scene storage; the flag itself is read once per scene.
 */
import type { TutorialStorage } from '../tutorial/tutorialAckStore';
import { resolveLegacyAuthStorageScope } from './legacyAuth';
import { createLegacyFirstTimeSession, type LegacyFirstTimeSession } from './legacyFirstTimeSession';
import { mergeLegacyFirstTimeGuestRecord } from './legacyFirstTimeStore';

/** The scene members the session reads (structural: MenuScene keeps them private). */
export interface LegacyFirstTimeSessionSceneView {
  readonly authSnapshot?: { userId?: string | null } | null;
  resolveBrowserLocalStorage?(): TutorialStorage | undefined;
}

const readWindowSearch = (): string => (typeof window === 'undefined' ? '' : window.location.search);
const readDeviceStorage = (): TutorialStorage | null => {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const sceneSessions = new WeakMap<object, { readonly scope: string; readonly session: LegacyFirstTimeSession }>();

/** The scene's account scope (`user:<id>` or `guest`), the key the record is stored under. */
export const resolveLegacyFirstTimeSceneScope = (scene: object): string => (
  resolveLegacyAuthStorageScope({ userId: (scene as LegacyFirstTimeSessionSceneView).authSnapshot?.userId ?? null })
);

/**
 * The scene's first-time session for the signed-in account (or guest). A change of account gives a fresh session for
 * the new scope; on sign-in the guest record merges into the account's (P2: union, max revision; never on a preview).
 */
export const resolveLegacyFirstTimeSceneSession = (scene: object): LegacyFirstTimeSession => {
  const view = scene as LegacyFirstTimeSessionSceneView;
  const scope = resolveLegacyFirstTimeSceneScope(scene);
  const cached = sceneSessions.get(scene);
  if (cached !== undefined && cached.scope === scope) return cached.session;
  const session = createLegacyFirstTimeSession({
    search: readWindowSearch(),
    deviceStorage: readDeviceStorage(),
    resolveSceneStorage: () => view.resolveBrowserLocalStorage?.(),
    scope
  });
  if (session.enabled && !session.preview) {
    const storage = view.resolveBrowserLocalStorage?.();
    if (storage) mergeLegacyFirstTimeGuestRecord(storage, scope);
  }
  sceneSessions.set(scene, { scope, session });
  return session;
};

/** Scene shutdown: the next scene starts a fresh session. */
export const forgetLegacyFirstTimeSceneSession = (scene: object): void => {
  sceneSessions.delete(scene);
};
