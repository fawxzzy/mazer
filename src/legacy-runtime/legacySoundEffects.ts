/**
 * Small synthesized sound effects (MAZER-AUDIO-003). The ONE place that touches Web Audio.
 *
 * Behaviour:
 * - Settings > Sound effects (`LegacySettings.soundEnabled`, default ON since MAZER-AUDIO-004) gates every call.
 *   While it is off no AudioContext is ever constructed, so a player who turns it off pays nothing.
 * - The context is created lazily on the first allowed effect, or earlier by `unlock()`, which the scene calls from
 *   the first pointerdown/touchend/keydown. A drag step is not a valid activation gesture on iOS and Chrome, so
 *   without that unlock the first steps would be silent. A suspended context is resumed on every allowed effect.
 * - Effects are tiny oscillator chirps (no audio files). Rapid repeats are throttled per kind.
 * - Unsupported platforms and any throwing audio call are silent no-ops: movement must never fail over a chirp.
 */

export type LegacySoundEffectKind =
  | 'step'
  | 'wallBump'
  | 'goal'
  | 'toggleOn'
  // Hazard moments (slice H6; named events in legacyHazardAudioEvents.ts). Softer than every older kind.
  | 'hazardIntro'
  | 'hazardTier'
  | 'hazardGateClosing'
  | 'hazardContact'
  | 'hazardBurnout'
  | 'shardCollected';

interface LegacySoundTone {
  /** Start offset from now, seconds. */
  at: number;
  durationSec: number;
  frequencyHz: number;
  gain: number;
  /** Fade-in, seconds. Defaults to 8 ms; the step tick uses a softer one so it never clicks. */
  attackSec?: number;
}

/** Named tones so call sites carry no magic numbers. Quiet by design (peak gain <= 0.06). */
export const LEGACY_SOUND_EFFECT_TONES: Readonly<Record<LegacySoundEffectKind, readonly LegacySoundTone[]>> = Object.freeze({
  // MAZER-AUDIO-004: a soft, short, low tick. The pitch comes from LEGACY_STEP_PITCH_WALK_HZ (this entry is its base).
  step: Object.freeze([{ at: 0, durationSec: 0.055, frequencyHz: 330, gain: 0.014, attackSec: 0.014 }]),
  wallBump: Object.freeze([{ at: 0, durationSec: 0.06, frequencyHz: 150, gain: 0.05 }]),
  goal: Object.freeze([
    { at: 0, durationSec: 0.09, frequencyHz: 523.25, gain: 0.05 },
    { at: 0.09, durationSec: 0.09, frequencyHz: 659.25, gain: 0.05 },
    { at: 0.18, durationSec: 0.16, frequencyHz: 783.99, gain: 0.05 }
  ]),
  toggleOn: Object.freeze([{ at: 0, durationSec: 0.08, frequencyHz: 660, gain: 0.04 }]),
  // Slice H6 hazard moments: every tone is at most 0.03 peak gain (below the goal chime and the wall bump) and soft-attacked.
  // A new kind: two rising pentatonic notes, the step tick's family.
  hazardIntro: Object.freeze([
    { at: 0, durationSec: 0.1, frequencyHz: 392, gain: 0.026, attackSec: 0.02 },
    { at: 0.1, durationSec: 0.14, frequencyHz: 523.25, gain: 0.026, attackSec: 0.02 }
  ]),
  // A tier pip: one short high tick.
  hazardTier: Object.freeze([{ at: 0, durationSec: 0.07, frequencyHz: 659.25, gain: 0.02, attackSec: 0.012 }]),
  // A gate about to close: a very soft low tick (it can repeat each beat, so it is the quietest).
  hazardGateClosing: Object.freeze([{ at: 0, durationSec: 0.05, frequencyHz: 246.94, gain: 0.012, attackSec: 0.012 }]),
  // A contact: a soft falling pair, lower than the wall bump's gain.
  hazardContact: Object.freeze([
    { at: 0, durationSec: 0.07, frequencyHz: 220, gain: 0.03, attackSec: 0.01 },
    { at: 0.07, durationSec: 0.09, frequencyHz: 174.61, gain: 0.024, attackSec: 0.01 }
  ]),
  // A Hunter gives up: three soft falling notes.
  hazardBurnout: Object.freeze([
    { at: 0, durationSec: 0.08, frequencyHz: 392, gain: 0.022, attackSec: 0.015 },
    { at: 0.08, durationSec: 0.08, frequencyHz: 329.63, gain: 0.02, attackSec: 0.015 },
    { at: 0.16, durationSec: 0.12, frequencyHz: 261.63, gain: 0.018, attackSec: 0.015 }
  ]),
  // A shard: one bright, short, quiet note.
  shardCollected: Object.freeze([{ at: 0, durationSec: 0.12, frequencyHz: 783.99, gain: 0.024, attackSec: 0.012 }])
});

/**
 * Step pitch walk: a deterministic ping-pong over a low A-minor pentatonic set (A3 C4 D4 E4 G4 and back), advanced
 * once per step that actually sounds. Dragging across 40+ tiles then reads as a gentle phrase, not one repeated beep.
 */
export const LEGACY_STEP_PITCH_WALK_HZ: readonly number[] = Object.freeze([
  220, 261.63, 293.66, 329.63, 392, 329.63, 293.66, 261.63
]);

/** Minimum gap between two plays of the same kind, ms. Fast drags thin out to about 8 steps a second. */
export const LEGACY_SOUND_EFFECT_MIN_GAP_MS: Readonly<Record<LegacySoundEffectKind, number>> = Object.freeze({
  step: 120,
  wallBump: 140,
  goal: 0,
  toggleOn: 0,
  hazardIntro: 400,
  hazardTier: 400,
  hazardGateClosing: 200,
  hazardContact: 250,
  hazardBurnout: 400,
  shardCollected: 120
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
  /**
   * Creates and resumes the audio context from inside a real user gesture (pointerdown, touchend, keydown) so the
   * first steps are audible. Does nothing while `enabled` is false. Returns true when a context is ready.
   */
  unlock(enabled: boolean): boolean;
  /** True once an audio context exists (false while the setting has never been on). */
  hasContext(): boolean;
}

export const createLegacySoundEffects = (
  createContext: LegacyAudioContextFactory = createDefaultLegacyAudioContext
): LegacySoundEffects => {
  let context: LegacyAudioContextLike | null = null;
  let contextFailed = false;
  const lastPlayedAtMs = new Map<LegacySoundEffectKind, number>();
  let stepCount = 0;

  return {
    hasContext: () => context !== null,
    unlock(enabled) {
      if (!enabled || contextFailed) {
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
        return true;
      } catch {
        return false;
      }
    },
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
        const stepHz = kind === 'step'
          ? LEGACY_STEP_PITCH_WALK_HZ[stepCount % LEGACY_STEP_PITCH_WALK_HZ.length]
          : null;
        for (const tone of LEGACY_SOUND_EFFECT_TONES[kind]) {
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          const from = start + tone.at;
          oscillator.type = 'sine';
          oscillator.frequency.value = stepHz ?? tone.frequencyHz;
          gain.gain.setValueAtTime(0, from);
          gain.gain.linearRampToValueAtTime(tone.gain, from + (tone.attackSec ?? 0.008));
          gain.gain.linearRampToValueAtTime(0, from + tone.durationSec);
          oscillator.connect(gain);
          gain.connect(context.destination);
          oscillator.start(from);
          oscillator.stop(from + tone.durationSec + 0.02);
        }
        lastPlayedAtMs.set(kind, nowMs);
        if (kind === 'step') {
          stepCount += 1;
        }
        return true;
      } catch {
        return false;
      }
    }
  };
};

/**
 * Wires `effects.unlock` to the first real gestures. Listeners stay until a context exists (so a player who turns
 * sound on later is unlocked by the next tap) and then remove themselves. Returns a disposer.
 */
export const installLegacyAudioUnlock = (
  effects: Pick<LegacySoundEffects, 'unlock'>,
  isEnabled: () => boolean,
  target: Pick<EventTarget, 'addEventListener' | 'removeEventListener'> | undefined
): (() => void) => {
  if (target === undefined) {
    return () => undefined;
  }
  const events = ['pointerdown', 'touchend', 'keydown'] as const;
  const dispose = (): void => {
    for (const name of events) {
      target.removeEventListener(name, handler, true);
    }
  };
  const handler = (): void => {
    if (effects.unlock(isEnabled())) {
      dispose();
    }
  };
  for (const name of events) {
    target.addEventListener(name, handler, true);
  }
  return dispose;
};
