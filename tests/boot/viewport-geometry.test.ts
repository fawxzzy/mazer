import { describe, expect, test } from 'vitest';
import {
  applyMazerViewportCssVariables,
  installMazerViewportGeometry,
  resolveMazerViewportGeometryFromRuntime,
  syncMazerGameToViewport
} from '../../src/boot/viewportGeometry';

const createRuntime = ({
  height = 844,
  visualHeight = height,
  visualWidth = 390,
  width = 390
}: {
  height?: number;
  visualHeight?: number;
  visualWidth?: number;
  width?: number;
} = {}) => {
  const cssValues = new Map<string, string>([
    ['--mazer-safe-area-top', '24px'],
    ['--mazer-safe-area-right', '0px'],
    ['--mazer-safe-area-bottom', '34px'],
    ['--mazer-safe-area-left', '0px']
  ]);
  const root = {
    clientHeight: height,
    clientWidth: width,
    dataset: {},
    style: {
      setProperty: (name: string, value: string): void => {
        cssValues.set(name, value);
      }
    }
  };
  const runtime = {
    addEventListener: (): void => {},
    devicePixelRatio: 2,
    document: {
      addEventListener: (): void => {},
      documentElement: root,
      removeEventListener: (): void => {}
    },
    getComputedStyle: () => ({
      getPropertyValue: (name: string): string => cssValues.get(name) ?? '0px'
    }),
    innerHeight: height,
    innerWidth: width,
    matchMedia: () => ({ matches: true }),
    navigator: { maxTouchPoints: 2 },
    removeEventListener: (): void => {},
    visualViewport: {
      height: visualHeight,
      offsetLeft: 0,
      offsetTop: 12,
      scale: 1,
      width: visualWidth
    }
  };

  return { cssValues, root, runtime };
};

const createObservableRuntime = (dimensions?: Parameters<typeof createRuntime>[0]) => {
  const { cssValues, root, runtime } = createRuntime(dimensions);
  const runtimeListeners = new Map<string, Set<() => void>>();
  const visualViewportListeners = new Map<string, Set<() => void>>();
  const animationFrames: FrameRequestCallback[] = [];
  const register = (listeners: Map<string, Set<() => void>>, type: string, listener: () => void): void => {
    const entries = listeners.get(type) ?? new Set<() => void>();
    entries.add(listener);
    listeners.set(type, entries);
  };
  const unregister = (listeners: Map<string, Set<() => void>>, type: string, listener: () => void): void => {
    listeners.get(type)?.delete(listener);
  };
  const emit = (listeners: Map<string, Set<() => void>>, type: string): void => {
    for (const listener of listeners.get(type) ?? []) {
      listener();
    }
  };

  Object.assign(runtime, {
    addEventListener: (type: string, listener: () => void): void => register(runtimeListeners, type, listener),
    removeEventListener: (type: string, listener: () => void): void => unregister(runtimeListeners, type, listener),
    requestAnimationFrame: (callback: FrameRequestCallback): number => {
      animationFrames.push(callback);
      return animationFrames.length;
    }
  });
  Object.assign(runtime.visualViewport, {
    addEventListener: (type: string, listener: () => void): void => register(visualViewportListeners, type, listener),
    removeEventListener: (type: string, listener: () => void): void => unregister(visualViewportListeners, type, listener)
  });

  return {
    cssValues,
    root,
    runtime,
    emitRuntime: (type: string): void => emit(runtimeListeners, type),
    emitVisualViewport: (type: string): void => emit(visualViewportListeners, type),
    flushAnimationFrame: (): void => {
      const callbacks = animationFrames.splice(0);
      callbacks.forEach((callback) => callback(0));
    },
    scheduledFrameCount: (): number => animationFrames.length
  };
};

describe('Mazer viewport geometry', () => {
  test('normalizes layout, visual, safe-area, and content geometry from one runtime snapshot', () => {
    const { runtime } = createRuntime({ height: 844, visualHeight: 780, visualWidth: 390, width: 390 });
    const geometry = resolveMazerViewportGeometryFromRuntime(runtime as never, 7);

    expect(geometry).toMatchObject({
      revision: 7,
      layout: { width: 390, height: 844 },
      visual: { width: 390, height: 780, offsetLeft: 0, offsetTop: 12, scale: 1 },
      safeArea: { top: 24, right: 0, bottom: 34, left: 0 },
      content: { left: 0, top: 36, width: 390, height: 722 },
      devicePixelRatio: 2,
      isPhoneLike: true,
      isLandscape: false
    });
  });

  test('writes the effective visual viewport and safe-area values into the CSS contract', () => {
    const { cssValues, root, runtime } = createRuntime({ height: 844, visualHeight: 780, visualWidth: 390, width: 390 });
    const geometry = resolveMazerViewportGeometryFromRuntime(runtime as never, 3);

    applyMazerViewportCssVariables(geometry, root as never);

    expect(cssValues.get('--mazer-viewport-width')).toBe('390px');
    expect(cssValues.get('--mazer-viewport-height')).toBe('722px');
    expect(cssValues.get('--mazer-viewport-left')).toBe('0px');
    expect(cssValues.get('--mazer-viewport-top')).toBe('36px');
    expect(cssValues.get('--mazer-safe-area-top')).toBe('24px');
    expect(cssValues.get('--mazer-safe-area-bottom')).toBe('34px');
    expect(root.dataset).toMatchObject({ mazerViewportRevision: '3' });
  });

  test('anchors iPhone and Android cutout content inside visual viewport offsets', () => {
    const iphone = createRuntime({ height: 852, visualHeight: 852, visualWidth: 393, width: 393 });
    iphone.cssValues.set('--mazer-safe-area-top', '59px');
    iphone.cssValues.set('--mazer-safe-area-right', '6px');
    iphone.cssValues.set('--mazer-safe-area-bottom', '34px');
    iphone.cssValues.set('--mazer-safe-area-left', '8px');
    iphone.runtime.visualViewport.offsetLeft = 3;
    iphone.runtime.visualViewport.offsetTop = 47;

    expect(resolveMazerViewportGeometryFromRuntime(iphone.runtime as never).content).toEqual({
      left: 11,
      top: 106,
      width: 379,
      height: 759
    });

    const android = createRuntime({ height: 915, visualHeight: 875, visualWidth: 412, width: 412 });
    android.cssValues.set('--mazer-safe-area-top', '32px');
    android.cssValues.set('--mazer-safe-area-bottom', '20px');
    android.runtime.visualViewport.offsetTop = 18;

    expect(resolveMazerViewportGeometryFromRuntime(android.runtime as never).content).toEqual({
      left: 0,
      top: 50,
      width: 412,
      height: 823
    });
  });

  test('avoids duplicate Phaser resize work and forwards the active geometry exactly once', () => {
    const resizeCalls: Array<[number, number]> = [];
    const game = {
      scale: {
        height: 844,
        resize: (width: number, height: number): void => {
          resizeCalls.push([width, height]);
        },
        width: 390
      }
    };

    expect(syncMazerGameToViewport(game as never, { content: { width: 390, height: 844 } })).toBe(false);
    expect(syncMazerGameToViewport(game as never, { content: { width: 844, height: 390 } })).toBe(true);
    expect(resizeCalls).toEqual([[844, 390]]);
  });

  test('recomputes shared content geometry once when browser chrome changes the visual viewport', () => {
    const observed = createObservableRuntime({ height: 844, visualHeight: 844, visualWidth: 390, width: 390 });
    const controller = installMazerViewportGeometry(observed.runtime as never);
    const snapshots = [] as ReturnType<typeof controller.getSnapshot>[];
    controller.subscribe((snapshot) => snapshots.push(snapshot));

    observed.runtime.visualViewport.height = 780;
    observed.runtime.visualViewport.offsetTop = 18;
    observed.emitVisualViewport('resize');
    observed.emitVisualViewport('scroll');

    expect(observed.scheduledFrameCount()).toBe(1);
    observed.flushAnimationFrame();

    expect(controller.getSnapshot()).toMatchObject({
      revision: 2,
      content: { left: 0, top: 42, width: 390, height: 722 },
      visual: { height: 780, offsetTop: 18, usedForContent: true }
    });
    expect(observed.cssValues.get('--mazer-viewport-top')).toBe('42px');
    expect(observed.cssValues.get('--mazer-viewport-height')).toBe('722px');
    expect(snapshots).toHaveLength(2);

    controller.dispose();
    observed.runtime.visualViewport.height = 760;
    observed.emitVisualViewport('resize');
    observed.flushAnimationFrame();
    expect(controller.getSnapshot().revision).toBe(2);
  });

  test('recomputes desktop maximize and restore from the current runtime snapshot', () => {
    const observed = createObservableRuntime({ height: 720, visualHeight: 720, visualWidth: 360, width: 360 });
    const controller = installMazerViewportGeometry(observed.runtime as never);
    const initial = controller.getSnapshot();

    observed.root.clientWidth = 1440;
    observed.root.clientHeight = 900;
    observed.runtime.innerWidth = 1440;
    observed.runtime.innerHeight = 900;
    observed.runtime.visualViewport.width = 1440;
    observed.runtime.visualViewport.height = 900;
    observed.runtime.visualViewport.offsetTop = 0;
    observed.emitRuntime('resize');
    observed.flushAnimationFrame();

    expect(controller.getSnapshot()).toMatchObject({
      revision: 2,
      content: { left: 0, top: 24, width: 1440, height: 842 },
      isLandscape: true
    });

    observed.root.clientWidth = 360;
    observed.root.clientHeight = 720;
    observed.runtime.innerWidth = 360;
    observed.runtime.innerHeight = 720;
    observed.runtime.visualViewport.width = 360;
    observed.runtime.visualViewport.height = 720;
    observed.runtime.visualViewport.offsetTop = 12;
    observed.emitRuntime('resize');
    observed.flushAnimationFrame();

    expect(controller.getSnapshot()).toEqual({ ...initial, revision: 3 });
    controller.dispose();
  });
});
