import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, test, vi } from 'vitest';

// BootScene/MenuScene are only imported here to confirm the game's actual
// Phaser scene wiring (src/boot/phaserConfig.ts). Neither scene's runtime
// behavior is exercised - this module intentionally covers only the pure,
// side-effect-free presentation config resolver in src/boot/presentation.ts
// plus the static scene-array wiring, both of which have a real production
// consumer (BootScene, phaserConfig, and scripts/analysis/mazer-variety-analysis.ts).
vi.mock('phaser', () => ({
  default: {
    AUTO: 'AUTO',
    CANVAS: 'CANVAS',
    Math: {
      Clamp: (value: number, min: number, max: number) => Math.max(min, Math.min(max, value)),
      Linear: (from: number, to: number, t: number) => from + ((to - from) * t)
    },
    Scale: {
      RESIZE: 'RESIZE',
      CENTER_BOTH: 'CENTER_BOTH'
    },
    Scene: class {}
  }
}));

let BootScene: typeof import('../../src/scenes/BootScene').BootScene;
let phaserConfig: typeof import('../../src/boot/phaserConfig').phaserConfig;
let DEFAULT_PRESENTATION_LAUNCH_CONFIG: typeof import('../../src/boot/presentation').DEFAULT_PRESENTATION_LAUNCH_CONFIG;
let isDeterministicPresentationCapture: typeof import('../../src/boot/presentation').isDeterministicPresentationCapture;
let resolveBootPresentationConfig: typeof import('../../src/boot/presentation').resolveBootPresentationConfig;
let resolveBootPresentationVariant: typeof import('../../src/boot/presentation').resolveBootPresentationVariant;
let resolveEffectivePresentationChrome: typeof import('../../src/boot/presentation').resolveEffectivePresentationChrome;
let shouldShowPresentationTitle: typeof import('../../src/boot/presentation').shouldShowPresentationTitle;

beforeAll(async () => {
  ({ BootScene } = await import('../../src/scenes/BootScene'));
  ({ phaserConfig } = await import('../../src/boot/phaserConfig'));
  ({
    DEFAULT_PRESENTATION_LAUNCH_CONFIG,
    isDeterministicPresentationCapture,
    resolveBootPresentationConfig,
    resolveBootPresentationVariant,
    resolveEffectivePresentationChrome,
    shouldShowPresentationTitle
  } = await import('../../src/boot/presentation'));
}, 20_000);

describe('boot presentation config resolution', () => {
  test('launch param selection defaults safely and sanitizes invalid values', () => {
    expect(resolveBootPresentationVariant('')).toBe('title');
    expect(resolveBootPresentationVariant('?presentation=ambient')).toBe('ambient');
    expect(resolveBootPresentationVariant('?presentation=loading')).toBe('loading');
    expect(resolveBootPresentationVariant('?profile=tv')).toBe('ambient');
    expect(resolveBootPresentationVariant('?profile=obs')).toBe('ambient');
    expect(resolveBootPresentationVariant('?profile=mobile')).toBe('ambient');
    expect(resolveBootPresentationVariant('?profile=recovery')).toBe('title');
    expect(resolveBootPresentationVariant('?presentation=unknown')).toBe('title');
    expect(resolveBootPresentationVariant({} as unknown as string)).toBe('title');

    expect(resolveBootPresentationConfig('')).toEqual(DEFAULT_PRESENTATION_LAUNCH_CONFIG);
    expect(resolveBootPresentationConfig('?profile=tv')).toEqual({
      presentation: 'ambient',
      chrome: 'minimal',
      mood: 'auto',
      title: 'hide',
      theme: 'auto',
      mode: 'watch',
      profile: 'tv'
    });
    expect(resolveBootPresentationConfig('?profile=obs')).toEqual({
      presentation: 'ambient',
      chrome: 'minimal',
      mood: 'auto',
      title: 'hide',
      theme: 'auto',
      mode: 'watch',
      profile: 'obs'
    });
    expect(resolveBootPresentationConfig('?profile=mobile')).toEqual({
      presentation: 'ambient',
      chrome: 'full',
      mood: 'auto',
      title: 'show',
      theme: 'auto',
      mode: 'watch',
      profile: 'mobile'
    });
    expect(resolveBootPresentationConfig('?profile=recovery')).toEqual({
      presentation: 'title',
      chrome: 'full',
      mood: 'auto',
      title: 'show',
      theme: 'auto',
      mode: 'watch',
      profile: 'recovery'
    });
    expect(resolveBootPresentationConfig('?design=recovery')).toEqual({
      presentation: 'ambient',
      chrome: 'minimal',
      mood: 'auto',
      title: 'show',
      theme: 'auto',
      mode: 'watch',
      design: 'recovery'
    });
    expect(resolveBootPresentationConfig('?design=recovery&profile=mobile')).toEqual({
      presentation: 'ambient',
      chrome: 'minimal',
      mood: 'auto',
      title: 'show',
      theme: 'auto',
      mode: 'watch',
      profile: 'mobile',
      design: 'recovery'
    });
    expect(resolveBootPresentationConfig('?content=full')).toEqual({
      presentation: 'title',
      chrome: 'full',
      mood: 'auto',
      title: 'show',
      theme: 'auto',
      mode: 'watch',
      contentProfile: 'full'
    });
    expect(resolveBootPresentationConfig('?profile=core-only')).toEqual({
      presentation: 'title',
      chrome: 'full',
      mood: 'auto',
      title: 'show',
      theme: 'auto',
      mode: 'watch',
      contentProfile: 'core-only'
    });
    expect(resolveBootPresentationConfig('?profile=tv&content=full')).toEqual({
      presentation: 'ambient',
      chrome: 'minimal',
      mood: 'auto',
      title: 'hide',
      theme: 'auto',
      mode: 'watch',
      profile: 'tv',
      contentProfile: 'full'
    });
    expect(resolveBootPresentationConfig('?presentation=loading&chrome=minimal&mood=scan&theme=aurora&seed=42&size=large&difficulty=spicy&title=hide')).toEqual({
      presentation: 'loading',
      chrome: 'minimal',
      mood: 'scan',
      theme: 'aurora',
      mode: 'watch',
      seed: 42,
      size: 'large',
      difficulty: 'spicy',
      title: 'hide'
    });
    expect(resolveBootPresentationConfig('?family=split-flow').family).toBe('split-flow');
    expect(resolveBootPresentationConfig('?family=nope').family).toBe('auto');
    expect(resolveBootPresentationConfig('?profile=tv&title=show')).toEqual({
      presentation: 'ambient',
      chrome: 'minimal',
      mood: 'auto',
      title: 'show',
      theme: 'auto',
      mode: 'watch',
      profile: 'tv'
    });
    expect(resolveBootPresentationConfig('?profile=obs&presentation=loading&theme=noir')).toEqual({
      presentation: 'loading',
      chrome: 'minimal',
      mood: 'auto',
      title: 'hide',
      theme: 'noir',
      mode: 'watch',
      profile: 'obs'
    });
    expect(resolveBootPresentationConfig('?profile=mobile&chrome=none')).toEqual({
      presentation: 'ambient',
      chrome: 'none',
      mood: 'auto',
      title: 'show',
      theme: 'auto',
      mode: 'watch',
      profile: 'mobile'
    });
    expect(resolveBootPresentationConfig('?presentation=nope&chrome=loud&mood=chaos&seed=-4&size=massive&difficulty=nightmare&title=gone')).toEqual(
      DEFAULT_PRESENTATION_LAUNCH_CONFIG
    );
    expect(resolveBootPresentationConfig('?profile=nope&presentation=nope&chrome=loud&mood=chaos&theme=radioactive&seed=-4&size=massive&difficulty=nightmare&title=gone'))
      .toEqual(DEFAULT_PRESENTATION_LAUNCH_CONFIG);
    expect(resolveBootPresentationConfig('?theme=monolith').theme).toBe('monolith');
    expect(resolveBootPresentationConfig('?theme=bad-value').theme).toBe('auto');
    expect(resolveBootPresentationConfig('?mode=play').mode).toBe('play');
    expect(resolveBootPresentationConfig('?mode=nope').mode).toBe('watch');
    expect(resolveEffectivePresentationChrome({
      ...DEFAULT_PRESENTATION_LAUNCH_CONFIG,
      chrome: 'full',
      title: 'hide'
    })).toBe('minimal');
    expect(shouldShowPresentationTitle({
      ...DEFAULT_PRESENTATION_LAUNCH_CONFIG,
      title: 'hide'
    })).toBe(false);
    expect(shouldShowPresentationTitle(resolveBootPresentationConfig('?profile=tv'))).toBe(false);
    expect(shouldShowPresentationTitle(resolveBootPresentationConfig('?profile=mobile'))).toBe(true);
    expect(shouldShowPresentationTitle(resolveBootPresentationConfig('?profile=recovery'))).toBe(true);
    expect(shouldShowPresentationTitle(resolveBootPresentationConfig('?profile=mobile&chrome=none'))).toBe(false);
  });

  test('deterministic capture mode requires seed, size, difficulty, and a non-auto mood', () => {
    const launchConfig = resolveBootPresentationConfig(
      '?presentation=ambient&chrome=none&mood=blueprint&theme=monolith&family=framed&seed=4242&size=huge&difficulty=brutal&title=hide'
    );

    expect(isDeterministicPresentationCapture(launchConfig)).toBe(true);
    expect(isDeterministicPresentationCapture(DEFAULT_PRESENTATION_LAUNCH_CONFIG)).toBe(false);
    expect(isDeterministicPresentationCapture({ ...launchConfig, seed: undefined })).toBe(false);
    expect(isDeterministicPresentationCapture({ ...launchConfig, size: undefined })).toBe(false);
    expect(isDeterministicPresentationCapture({ ...launchConfig, difficulty: undefined })).toBe(false);
    expect(isDeterministicPresentationCapture({ ...launchConfig, mood: 'auto' })).toBe(false);
  });

  test('scene wiring only includes boot and menu scenes', () => {
    expect(phaserConfig.scene).toEqual([BootScene, expect.any(Function)]);
    expect((phaserConfig.scene as Array<{ name?: string }>).map((scene) => scene.name)).toEqual(['BootScene', 'MenuScene']);
    expect(phaserConfig.pixelArt).toBe(false);
    expect(phaserConfig.antialias).toBe(true);
    expect(phaserConfig.antialiasGL).toBe(true);
    expect(phaserConfig.roundPixels).toBe(true);
    expect(phaserConfig.scale?.autoRound).toBe(true);
  });

  test('shell css keeps the viewport full-bleed while board framing stays in-scene', () => {
    const baseCss = readFileSync(resolve(process.cwd(), 'src/styles/base.css'), 'utf8');

    expect(baseCss).toContain('--mazer-environment-safe-area-top: env(safe-area-inset-top, 0px);');
    expect(baseCss).toContain('--mazer-safe-area-top: var(--mazer-environment-safe-area-top);');
    expect(baseCss).toContain('--mazer-viewport-width: 100vw;');
    expect(baseCss).toContain('--mazer-viewport-height: 100dvh;');
    expect(baseCss).toContain('#app {');
    expect(baseCss).toContain('position: fixed;');
    expect(baseCss).toContain('width: var(--mazer-viewport-width);');
    expect(baseCss).toContain('height: var(--mazer-viewport-height);');
    expect(baseCss).toContain('width: 100% !important;');
    expect(baseCss).toContain('height: 100% !important;');
    expect(baseCss).toContain('max-width: none;');
    expect(baseCss).toContain('max-height: none;');
    expect(baseCss).toContain('border: 0;');
    expect(baseCss).toContain('box-shadow: none;');
  });
});
