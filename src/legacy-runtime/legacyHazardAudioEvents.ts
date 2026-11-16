/**
 * Hazard audio events (slice H6). Named events the hazard layer raises, each mapped to one gentle
 * kind in the existing sound system (legacySoundEffects.ts). No new loud sounds: every hazard tone
 * is at most 0.03 peak gain, below the wall bump and the goal chime, and plays only while the one
 * Sound setting (the same switch as the step ticks) is on. The scene calls
 * `playLegacySoundEffect(resolveHazardAudioSound(event))`, which applies that setting and the
 * per-kind throttle; nothing here touches Web Audio.
 *
 * H6 raises `hazard.intro` and `hazard.tier`. The others are named here so H3/H4/H5/H8 raise them
 * instead of inventing new kinds: gate closing (H3), contact (H4/H5), hunter burnout (H5), shard
 * collected (H8).
 */

import type { LegacySoundEffectKind } from './legacySoundEffects';

export type HazardAudioEvent =
  | 'hazard.intro'
  | 'hazard.tier'
  | 'hazard.gate.closing'
  | 'hazard.contact'
  | 'hazard.hunter.burnout'
  | 'hazard.shard.collected';

export const HAZARD_AUDIO_EVENTS: Readonly<Record<HazardAudioEvent, LegacySoundEffectKind>> = Object.freeze({
  'hazard.intro': 'hazardIntro',
  'hazard.tier': 'hazardTier',
  'hazard.gate.closing': 'hazardGateClosing',
  'hazard.contact': 'hazardContact',
  'hazard.hunter.burnout': 'hazardBurnout',
  'hazard.shard.collected': 'shardCollected'
});

export const resolveHazardAudioSound = (event: HazardAudioEvent): LegacySoundEffectKind => HAZARD_AUDIO_EVENTS[event];
