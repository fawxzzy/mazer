import { describe, expect, test, vi } from 'vitest';
import { LEGACY_DEFAULTS, copyLegacySettings } from '../../src/legacy-runtime/legacyDefaults';
import { applyLegacyOverlayToggleField } from '../../src/legacy-runtime/legacyOverlayToggleFields';
import {
  LEGACY_SOUND_EFFECT_TONES,
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
  test('is off by default and the Settings toggle flips it on and off', () => {
    expect(LEGACY_DEFAULTS.soundEnabled).toBe(false);
    const on = applyLegacyOverlayToggleField(copyLegacySettings(LEGACY_DEFAULTS), 'soundEnabled');
    expect(on.settings.soundEnabled).toBe(true);
    expect(on.stateText).toBe('On');
    const off = applyLegacyOverlayToggleField(on.settings, 'soundEnabled');
    expect(off.settings.soundEnabled).toBe(false);
    expect(off.stateText).toBe('Off');
  });
});

describe('createLegacySoundEffects', () => {
  test('never creates an audio context while the setting is off', () => {
    const factory = vi.fn(() => makeFakeContext().context);
    const effects = createLegacySoundEffects(factory);
    expect(effects.play('step', false, 0)).toBe(false);
    expect(effects.play('goal', false, 100)).toBe(false);
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
    createLegacySoundEffects(() => fake.context).play('step', true, 0);
    expect(fake.raw.resume).toHaveBeenCalled();
  });

  test('throttles rapid repeats of the same kind only', () => {
    const fake = makeFakeContext();
    const effects = createLegacySoundEffects(() => fake.context);
    expect(effects.play('step', true, 0)).toBe(true);
    expect(effects.play('step', true, 10)).toBe(false);
    expect(effects.play('wallBump', true, 10)).toBe(true);
    expect(effects.play('step', true, 100)).toBe(true);
  });

  test('is a silent no-op without Web Audio or when audio calls throw', () => {
    const none = createLegacySoundEffects(() => null);
    expect(none.play('step', true, 0)).toBe(false);
    expect(none.play('step', true, 1000)).toBe(false);
    const broken = makeFakeContext();
    broken.raw.createOscillator.mockImplementation(() => { throw new Error('blocked'); });
    expect(createLegacySoundEffects(() => broken.context).play('goal', true, 0)).toBe(false);
  });
});
