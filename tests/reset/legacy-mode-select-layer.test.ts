import { describe, expect, it, vi } from 'vitest';
import { buildLegacyModeSelectItems } from '../../src/legacy-runtime/legacyModeSelectPlan';
import { createLegacyModeSelectLayer, type LegacyModeSelectLayerShowOptions } from '../../src/legacy-runtime/legacyModeSelectLayer';
import type { ModeSelectMountHandle, ModeSelectMountOptions } from '../../src/ui/modeSelect/modeSelectMount';

const flush = async (): Promise<void> => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
};

const fakeMount = () => {
  const mounts: { options: ModeSelectMountOptions; closed: boolean }[] = [];
  const mountModeSelect = (options: ModeSelectMountOptions): ModeSelectMountHandle => {
    const entry = { closed: false, options };
    mounts.push(entry);
    return {
      close: () => { entry.closed = true; },
      isClosed: () => entry.closed,
      layer: {} as HTMLElement,
      rail: {} as ModeSelectMountHandle['rail']
    };
  };
  return { load: vi.fn(async () => ({ mountModeSelect })), mounts };
};

const showOptions = (overrides: Partial<LegacyModeSelectLayerShowOptions> = {}): LegacyModeSelectLayerShowOptions => ({
  initialIndex: 0,
  items: buildLegacyModeSelectItems({ level: 3, rank: 'E' }),
  onBack: vi.fn(),
  onPlay: vi.fn(),
  onSelect: vi.fn(),
  reducedMotion: false,
  theme: 'default',
  ...overrides
});

describe('mode-select layer controller (MAZER-MODE-002 look D)', () => {
  it('mounts one layer with the plan copy, and repeated show() while up never adds a second', async () => {
    const { load, mounts } = fakeMount();
    const layer = createLegacyModeSelectLayer({ loadMount: load, onUnavailable: vi.fn() });
    layer.show(showOptions());
    layer.show(showOptions());
    await flush();
    layer.show(showOptions());
    await flush();
    expect(mounts).toHaveLength(1);
    expect(layer.isOpen()).toBe(true);
    expect(layer.isMounted()).toBe(true);
    const options = mounts[0]!.options;
    expect(options.title).toBe('Choose a mode');
    expect(options.backLabel).toBe('Back to Menu');
    expect(options.comingSoonLabel).toBe('Coming soon');
    expect(options.items.map((item) => item.id)).toEqual(['endless', 'hazards', 'sprint', 'daily']);
    expect(options.resolvePlay(options.items[0])).toEqual({ disabled: false, label: 'Play Endless' });
    expect(options.resolvePlay(options.items[1])).toEqual({ disabled: true, label: 'Coming soon' });
  });

  it('routes play / back / select to the latest show() callbacks', async () => {
    const { load, mounts } = fakeMount();
    const layer = createLegacyModeSelectLayer({ loadMount: load, onUnavailable: vi.fn() });
    const first = showOptions();
    layer.show(first);
    await flush();
    const second = showOptions();
    layer.show(second);
    mounts[0]!.options.onPlay(0);
    mounts[0]!.options.onBack();
    mounts[0]!.options.onSelect?.(2);
    expect(first.onPlay).not.toHaveBeenCalled();
    expect(second.onPlay).toHaveBeenCalledWith(0);
    expect(second.onBack).toHaveBeenCalledTimes(1);
    expect(second.onSelect).toHaveBeenCalledWith(2);
  });

  it('hide() closes the layer; syncVisibility(false) hides, syncVisibility(true) never mounts by itself', async () => {
    const { load, mounts } = fakeMount();
    const layer = createLegacyModeSelectLayer({ loadMount: load, onUnavailable: vi.fn() });
    layer.syncVisibility(true);
    await flush();
    expect(mounts).toHaveLength(0);
    layer.show(showOptions());
    await flush();
    layer.syncVisibility(false);
    expect(mounts[0]!.closed).toBe(true);
    expect(layer.isOpen()).toBe(false);
    expect(layer.isMounted()).toBe(false);
  });

  it('a hide() while the chunk is still loading cancels the mount', async () => {
    const { load, mounts } = fakeMount();
    const layer = createLegacyModeSelectLayer({ loadMount: load, onUnavailable: vi.fn() });
    layer.show(showOptions());
    layer.hide();
    await flush();
    expect(mounts).toHaveLength(0);
    // and a fresh show() after that mounts exactly one
    layer.show(showOptions());
    await flush();
    expect(mounts).toHaveLength(1);
  });

  it('destroy() closes and blocks show() until activate()', async () => {
    const { load, mounts } = fakeMount();
    const layer = createLegacyModeSelectLayer({ loadMount: load, onUnavailable: vi.fn() });
    layer.show(showOptions());
    await flush();
    layer.destroy();
    expect(mounts[0]!.closed).toBe(true);
    layer.show(showOptions());
    await flush();
    expect(mounts).toHaveLength(1);
    layer.activate();
    layer.show(showOptions());
    await flush();
    expect(mounts).toHaveLength(2);
  });

  it('prefetch loads the chunk once and show() reuses it', async () => {
    const { load, mounts } = fakeMount();
    const layer = createLegacyModeSelectLayer({ loadMount: load, onUnavailable: vi.fn() });
    layer.prefetch();
    layer.prefetch();
    await flush();
    layer.show(showOptions());
    await flush();
    expect(load).toHaveBeenCalledTimes(1);
    expect(mounts).toHaveLength(1);
  });

  it('a failed chunk load calls onUnavailable once (the scene starts Endless) and a later show() retries the load', async () => {
    const onUnavailable = vi.fn();
    const load = vi.fn(async () => { throw new Error('offline'); });
    const layer = createLegacyModeSelectLayer({ loadMount: load, onUnavailable });
    layer.prefetch();
    await flush();
    expect(onUnavailable).not.toHaveBeenCalled();
    layer.show(showOptions());
    await flush();
    expect(onUnavailable).toHaveBeenCalledTimes(1);
    expect(layer.isOpen()).toBe(false);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
