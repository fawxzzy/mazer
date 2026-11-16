import { describe, expect, test, vi } from 'vitest';
import { LEGACY_DEFAULTS, copyLegacySettings } from '../../src/legacy-runtime/legacyDefaults';
import { applyLegacyOverlayToggleField } from '../../src/legacy-runtime/legacyOverlayToggleFields';
import {
  LEGACY_SOUND_EFFECT_MIN_GAP_MS,
  LEGACY_SOUND_EFFECT_TONES,
  LEGACY_STEP_PITCH_WALK_HZ,
  installLegacyAudioUnlock,
  createLegacySoundEffects,
  type LegacyAudioContextLike
} from '../../src/legacy-runtime/legacySoundEffects';

const makeFakeContext = (state = 'running') => {
  const oscillators: Array<{ frequency: { value: number }; start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }> = [];
  const param = () => ({ value: 0, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() });
  const context = {
    currentTime: 1,
    destination: {},
    state,
    resume: vi.fn(async () => undefined),
    createOscillator: vi.fn(() => {
      const osc = { type: 'square', frequency: param(), connect: vi.fn(), start: vi.fn(), stop: vi.fn() };
      oscillators.push(osc);
      return osc;
    }),
    createGain: vi.fn(() => ({ gain: param(), connect: vi.fn() }))
  };
  return { context: context as unknown as LegacyAudioContextLike, raw: context, oscillators };
};

describe('sound effects setting', () => {
  test('is on by default and the Settings toggle flips it off and on', () => {
    expect(LEGACY_DEFAULTS.soundEnabled).toBe(true);
    const off = applyLegacyOverlayToggleField(copyLegacySettings(LEGACY_DEFAULTS), 'soundEnabled');
    expect(off.settings.soundEnabled).toBe(false);
    expect(off.stateText).toBe('Off');
    const on = applyLegacyOverlayToggleField(off.settings, 'soundEnabled');
    expect(on.settings.soundEnabled).toBe(true);
    expect(on.stateText).toBe('On');
  });
});

describe('createLegacySoundEffects', () => {
  test('never creates an audio context while the setting is off', () => {
    const factory = vi.fn(() => makeFakeContext().context);
    const effects = createLegacySoundEffects(factory);
    expect(effects.play('step', false, 0)).toBe(false);
    expect(effects.play('goal', false, 100)).toBe(false);
    expect(effects.unlock(false)).toBe(false);
    expect(factory).not.toHaveBeenCalled();
    expect(effects.hasContext()).toBe(false);
  });

  test('creates the context lazily on the first allowed effect and reuses it', () => {
    const fake = makeFakeContext();
    const factory = vi.fn(() => fake.context);
    const effects = createLegacySoundEffects(factory);
    expect(effects.play('toggleOn', true, 0)).toBe(true);
    expect(effects.play('goal', true, 10)).toBe(true);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(fake.oscillators.length).toBe(
      LEGACY_SOUND_EFFECT_TONES.toggleOn.length + LEGACY_SOUND_EFFECT_TONES.goal.length
    );
    expect(fake.oscillators[0]!.frequency.value).toBe(LEGACY_SOUND_EFFECT_TONES.toggleOn[0]!.frequencyHz);
  });

  test('resumes a suspended context (autoplay unlock on the first gesture)', () => {
    const fake = makeFakeContext('suspended');
    createLegacySoundEffects(() => fake.context).play('wallBump', true, 0);
    expect(fake.raw.resume).toHaveBeenCalled();
  });

  test('throttles rapid repeats of the same kind only', () => {
    const fake = makeFakeContext();
    const effects = createLegacySoundEffects(() => fake.context);
    expect(effects.play('step', true, 0)).toBe(true);
    expect(effects.play('step', true, 10)).toBe(false);
    expect(effects.play('wallBump', true, 10)).toBe(true);
    expect(effects.play('step', true, LEGACY_SOUND_EFFECT_MIN_GAP_MS.step - 1)).toBe(false);
    expect(effects.play('step', true, LEGACY_SOUND_EFFECT_MIN_GAP_MS.step)).toBe(true);
  });

  test('is a silent no-op without Web Audio or when audio calls throw', () => {
    const none = createLegacySoundEffects(() => null);
    expect(none.play('wallBump', true, 0)).toBe(false);
    expect(none.play('wallBump', true, 1000)).toBe(false);
    const broken = makeFakeContext();
    broken.raw.createOscillator.mockImplementation(() => { throw new Error('blocked'); });
    expect(createLegacySoundEffects(() => broken.context).play('goal', true, 0)).toBe(false);
  });

  test('step is a soft, short, low tick that walks a deterministic pentatonic pitch set', () => {
    const [tone] = LEGACY_SOUND_EFFECT_TONES.step;
    expect(tone!.gain).toBeLessThanOrEqual(0.018);
    expect(tone!.durationSec).toBeLessThanOrEqual(0.06);
    expect(tone!.attackSec ?? 0).toBeGreaterThanOrEqual(0.01);
    expect(Math.max(...LEGACY_STEP_PITCH_WALK_HZ)).toBeLessThanOrEqual(400);
    expect(LEGACY_SOUND_EFFECT_MIN_GAP_MS.step).toBeGreaterThanOrEqual(110);
    expect(LEGACY_SOUND_EFFECT_MIN_GAP_MS.step).toBeLessThanOrEqual(140);

    const run = () => {
      const fake = makeFakeContext();
      const effects = createLegacySoundEffects(() => fake.context);
      for (let i = 0; i < LEGACY_STEP_PITCH_WALK_HZ.length + 2; i += 1) {
        effects.play('step', true, i * LEGACY_SOUND_EFFECT_MIN_GAP_MS.step);
      }
      return fake.oscillators.map((osc) => osc.frequency.value);
    };
    const first = run();
    expect(first.slice(0, LEGACY_STEP_PITCH_WALK_HZ.length)).toEqual([...LEGACY_STEP_PITCH_WALK_HZ]);
    expect(first[LEGACY_STEP_PITCH_WALK_HZ.length]).toBe(LEGACY_STEP_PITCH_WALK_HZ[0]);
    expect(new Set(first).size).toBeGreaterThan(3);
    expect(run()).toEqual(first);
  });

  test('every tone stays quiet (peak gain cap) and the unchanged kinds keep their values', () => {
    for (const tones of Object.values(LEGACY_SOUND_EFFECT_TONES)) {
      for (const tone of tones) {
        expect(tone.gain).toBeLessThanOrEqual(0.06);
      }
    }
    expect(LEGACY_SOUND_EFFECT_TONES.wallBump).toEqual([{ at: 0, durationSec: 0.06, frequencyHz: 150, gain: 0.05 }]);
    expect(LEGACY_SOUND_EFFECT_TONES.toggleOn).toEqual([{ at: 0, durationSec: 0.08, frequencyHz: 660, gain: 0.04 }]);
    expect(LEGACY_SOUND_EFFECT_MIN_GAP_MS.wallBump).toBe(140);
    expect(LEGACY_SOUND_EFFECT_MIN_GAP_MS.goal).toBe(0);
  });

  test('slice H6 hazard sounds are gentle: at most 0.03 peak gain, a soft attack, short, and throttled', () => {
    const hazardKinds = ['hazardIntro', 'hazardTier', 'hazardGateClosing', 'hazardContact', 'hazardBurnout', 'shardCollected'] as const;
    for (const kind of hazardKinds) {
      const tones = LEGACY_SOUND_EFFECT_TONES[kind];
      expect(tones.length, kind).toBeGreaterThan(0);
      for (const tone of tones) {
        expect(tone.gain, kind).toBeLessThanOrEqual(0.03);
        expect(tone.attackSec ?? 0, kind).toBeGreaterThanOrEqual(0.01);
        expect(tone.durationSec, kind).toBeLessThanOrEqual(0.15);
      }
      expect(LEGACY_SOUND_EFFECT_MIN_GAP_MS[kind], kind).toBeGreaterThanOrEqual(120);
    }
  });

  test('hazard sounds obey the sound setting like every other effect (no context while off)', () => {
    const fake = makeFakeContext();
    const factory = vi.fn(() => fake.context);
    const effects = createLegacySoundEffects(factory);
    expect(effects.play('hazardIntro', false, 0)).toBe(false);
    expect(effects.play('hazardContact', false, 0)).toBe(false);
    expect(factory).not.toHaveBeenCalled();
    expect(effects.play('hazardIntro', true, 1000)).toBe(true);
    expect(fake.oscillators.length).toBe(LEGACY_SOUND_EFFECT_TONES.hazardIntro.length);
  });

  test('unlock creates and resumes the context inside a gesture, never while off', () => {
    const fake = makeFakeContext('suspended');
    const factory = vi.fn(() => fake.context);
    const effects = createLegacySoundEffects(factory);
    expect(effects.unlock(false)).toBe(false);
    expect(factory).not.toHaveBeenCalled();
    expect(effects.unlock(true)).toBe(true);
    expect(effects.hasContext()).toBe(true);
    expect(fake.raw.resume).toHaveBeenCalled();
    expect(effects.unlock(true)).toBe(true);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(createLegacySoundEffects(() => null).unlock(true)).toBe(false);
  });

  test('installLegacyAudioUnlock fires on the first gesture, waits while sound is off, then removes itself', () => {
    const listeners = new Map<string, EventListener>();
    const target = {
      addEventListener: vi.fn((name: string, fn: EventListener) => { listeners.set(name, fn); }),
      removeEventListener: vi.fn((name: string) => { listeners.delete(name); })
    };
    const fake = makeFakeContext('suspended');
    const effects = createLegacySoundEffects(() => fake.context);
    let enabled = false;
    installLegacyAudioUnlock(effects, () => enabled, target);
    expect([...listeners.keys()].sort()).toEqual(['keydown', 'pointerdown', 'touchend']);

    listeners.get('pointerdown')!(new Event('pointerdown'));
    expect(effects.hasContext()).toBe(false);
    expect(listeners.size).toBe(3);

    enabled = true;
    listeners.get('touchend')!(new Event('touchend'));
    expect(effects.hasContext()).toBe(true);
    expect(fake.raw.resume).toHaveBeenCalled();
    expect(listeners.size).toBe(0);
  });
});
