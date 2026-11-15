/**
 * Small synthesized sound effects (MAZER-AUDIO-003). The ONE place that touches Web Audio.
 *
 * Behaviour:
 * - Settings > Sound effects (`LegacySettings.soundEnabled`, default OFF) gates every call. While it is off no
 *   AudioContext is ever constructed, so a player who never opts in pays nothing and no audio engine starts.
 * - The context is created lazily on the first allowed effect. That first effect comes from the tap that turned the
 *   setting on or from a later step, so it runs inside a user gesture, which is what iOS and Chrome autoplay
 *   policies need. A suspended context is resumed on every allowed effect.
 * - Effects are tiny oscillator chirps (no audio files). Rapid repeats are throttled per kind.
 * - Unsupported platforms and any throwing audio call are silent no-ops: movement must never fail over a chirp.
 */

export type LegacySoundEffectKind = 'wallBump' | 'goal' | 'toggleOn';

interface LegacySoundTone {
  /** Start offset from now, seconds. */
  at: number;
  durationSec: number;
  frequencyHz: number;
  gain: number;
}

/** Named tones so call sites carry no magic numbers. Quiet by design (peak gain <= 0.06). */
export const LEGACY_SOUND_EFFECT_TONES: Readonly<Record<LegacySoundEffectKind, readonly LegacySoundTone[]>> = Object.freeze({
  wallBump: Object.freeze([{ at: 0, durationSec: 0.06, frequencyHz: 150, gain: 0.05 }]),
  goal: Object.freeze([
    { at: 0, durationSec: 0.09, frequencyHz: 523.25, gain: 0.05 },
    { at: 0.09, durationSec: 0.09, frequencyHz: 659.25, gain: 0.05 },
    { at: 0.18, durationSec: 0.16, frequencyHz: 783.99, gain: 0.05 }
  ]),
  toggleOn: Object.freeze([{ at: 0, durationSec: 0.08, frequencyHz: 660, gain: 0.04 }])
});

/** Minimum gap between two plays of the same kind, ms. Repeated bumps fire quickly. */
export const LEGACY_SOUND_EFFECT_MIN_GAP_MS: Readonly<Record<LegacySoundEffectKind, number>> = Object.freeze({
  wallBump: 140,
  goal: 0,
  toggleOn: 0
});

export interface LegacyAudioParamLike {
  value: number;
  setValueAtTime(value: number, time: number): unknown;
  linearRampToValueAtTime(value: number, time: number): unknown;
}

export interface LegacyAudioNodeLike {
  connect(destination: unknown): unknown;
}

export interface LegacyOscillatorLike extends LegacyAudioNodeLike {
  type: string;
  frequency: LegacyAudioParamLike;
  start(when?: number): void;
  stop(when?: number): void;
}

export interface LegacyGainLike extends LegacyAudioNodeLike {
  gain: LegacyAudioParamLike;
}

/** The slice of AudioContext this module uses (so tests can pass a fake). */
export interface LegacyAudioContextLike {
  readonly currentTime: number;
  readonly destination: unknown;
  readonly state: string;
  resume?(): Promise<void> | void;
  createOscillator(): LegacyOscillatorLike;
  createGain(): LegacyGainLike;
}

export type LegacyAudioContextFactory = () => LegacyAudioContextLike | null;

export const createDefaultLegacyAudioContext: LegacyAudioContextFactory = () => {
  const scope = globalThis as unknown as {
    AudioContext?: new () => LegacyAudioContextLike;
    webkitAudioContext?: new () => LegacyAudioContextLike;
  };
  const Ctor = scope.AudioContext ?? scope.webkitAudioContext;
  return Ctor === undefined ? null : new Ctor();
};

export interface LegacySoundEffects {
  /** Plays one effect when `enabled`; returns true only when tones were scheduled. */
  play(kind: LegacySoundEffectKind, enabled: boolean, nowMs: number): boolean;
  /** True once an audio context exists (false while the setting has never been on). */
  hasContext(): boolean;
}

export const createLegacySoundEffects = (
  createContext: LegacyAudioContextFactory = createDefaultLegacyAudioContext
): LegacySoundEffects => {
  let context: LegacyAudioContextLike | null = null;
  let contextFailed = false;
  const lastPlayedAtMs = new Map<LegacySoundEffectKind, number>();

  return {
    hasContext: () => context !== null,
    play(kind, enabled, nowMs) {
      if (!enabled || contextFailed) {
        return false;
      }
      const lastAt = lastPlayedAtMs.get(kind);
      if (lastAt !== undefined && nowMs - lastAt < LEGACY_SOUND_EFFECT_MIN_GAP_MS[kind]) {
        return false;
      }

      try {
        if (context === null) {
          context = createContext();
          if (context === null) {
            contextFailed = true;
            return false;
          }
        }
        if (context.state === 'suspended') {
          void Promise.resolve(context.resume?.()).catch(() => undefined);
        }

        const start = context.currentTime;
        for (const tone of LEGACY_SOUND_EFFECT_TONES[kind]) {
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          const from = start + tone.at;
          oscillator.type = 'sine';
          oscillator.frequency.value = tone.frequencyHz;
          gain.gain.setValueAtTime(0, from);
          gain.gain.linearRampToValueAtTime(tone.gain, from + 0.008);
          gain.gain.linearRampToValueAtTime(0, from + tone.durationSec);
          oscillator.connect(gain);
          gain.connect(context.destination);
          oscillator.start(from);
          oscillator.stop(from + tone.durationSec + 0.02);
        }
        lastPlayedAtMs.set(kind, nowMs);
        return true;
      } catch {
        return false;
      }
    }
  };
};
