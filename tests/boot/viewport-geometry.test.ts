import { describe, expect, test } from 'vitest';
import {
  applyMazerViewportCssVariables,
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

describe('Mazer viewport geometry', () => {
  test('normalizes layout, visual, safe-area, and content geometry from one runtime snapshot', () => {
    const { runtime } = createRuntime({ height: 844, visualHeight: 780, visualWidth: 390, width: 390 });
    const geometry = resolveMazerViewportGeometryFromRuntime(runtime as never, 7);

    expect(geometry).toMatchObject({
      revision: 7,
      layout: { width: 390, height: 844 },
      visual: { width: 390, height: 780, offsetLeft: 0, offsetTop: 12, scale: 1 },
      safeArea: { top: 24, right: 0, bottom: 34, left: 0 },
      content: { left: 0, top: 24, width: 390, height: 722 },
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
    expect(cssValues.get('--mazer-safe-area-top')).toBe('24px');
    expect(cssValues.get('--mazer-safe-area-bottom')).toBe('34px');
    expect(root.dataset).toMatchObject({ mazerViewportRevision: '3' });
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
});
