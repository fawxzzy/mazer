export const PLATFORM_PROFILE_IDS = ['web', 'mobile', 'desktop', 'tv', 'obs', 'arcade', 'cyberdeck'] as const;
export type PlatformProfileId = (typeof PLATFORM_PROFILE_IDS)[number];

export type ProfileAuthCapability = boolean | 'configurable' | 'optional';
export type ProfileSyncCapability = boolean | 'optional';
export type ProfileInput = 'keyboard' | 'pointer' | 'touch' | 'controller' | 'remote' | 'external' | 'hardware';
export type ProfileChrome = 'full' | 'compact' | 'distance' | 'minimal' | 'kiosk' | 'configurable';

export interface UiPlatformProfile {
  readonly id: PlatformProfileId;
  readonly auth: ProfileAuthCapability;
  readonly sync: ProfileSyncCapability;
  readonly input: readonly ProfileInput[];
  readonly chrome: ProfileChrome;
}

const profile = (
  id: PlatformProfileId,
  auth: ProfileAuthCapability,
  sync: ProfileSyncCapability,
  input: readonly ProfileInput[],
  chrome: ProfileChrome
): UiPlatformProfile => Object.freeze({ id, auth, sync, input: Object.freeze([...input]), chrome });

export const PLATFORM_PROFILES: Readonly<Record<PlatformProfileId, UiPlatformProfile>> = Object.freeze({
  web: profile('web', true, true, ['keyboard', 'pointer', 'touch'], 'full'),
  mobile: profile('mobile', true, true, ['touch', 'keyboard'], 'compact'),
  desktop: profile('desktop', true, true, ['keyboard', 'pointer'], 'full'),
  tv: profile('tv', 'configurable', 'optional', ['controller', 'remote'], 'distance'),
  obs: profile('obs', false, 'optional', ['external'], 'minimal'),
  arcade: profile('arcade', false, 'optional', ['hardware'], 'kiosk'),
  cyberdeck: profile('cyberdeck', 'optional', 'optional', ['hardware', 'touch', 'keyboard'], 'configurable')
});

export const resolveUiProfile = (id: unknown): UiPlatformProfile | null => (
  typeof id === 'string' && PLATFORM_PROFILE_IDS.includes(id as PlatformProfileId)
    ? PLATFORM_PROFILES[id as PlatformProfileId]
    : null
);
