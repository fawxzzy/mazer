import { describe, expect, test } from 'vitest';
import {
  MAZER_CANVAS_RESOLUTION_MAX,
  MAZER_CANVAS_RESOLUTION_MIN,
  resolveMazerCanvasBackingResolution,
  resolveMazerCanvasResolution,
  summarizeMazerRenderResolution
} from '../../src/boot/canvasResolution';

describe('resolveMazerCanvasResolution', () => {
  test('caps mobile render target resolution without uncapped DPR cost', () => {
    expect(MAZER_CANVAS_RESOLUTION_MIN).toBe(1);
    expect(MAZER_CANVAS_RESOLUTION_MAX).toBe(2);
    expect(resolveMazerCanvasResolution(0.5)).toBe(1);
    expect(resolveMazerCanvasResolution(1)).toBe(1);
    expect(resolveMazerCanvasResolution(1.375)).toBe(1.38);
    expect(resolveMazerCanvasResolution(2)).toBe(2);
    expect(resolveMazerCanvasResolution(3)).toBe(2);
    expect(resolveMazerCanvasResolution(Number.NaN)).toBe(1);
  });
});

describe('resolveMazerCanvasBackingResolution', () => {
  test('keeps CSS layout dimensions while scaling backing pixels to the capped DPR target', () => {
    expect(resolveMazerCanvasBackingResolution({
      canvasCssHeight: 958,
      canvasCssWidth: 405,
      devicePixelRatio: 2
    })).toEqual({
      canvasCssHeight: 958,
      canvasCssWidth: 405,
      canvasPixelHeight: 1916,
      canvasPixelWidth: 810,
      resolution: 2
    });

    expect(resolveMazerCanvasBackingResolution({
      canvasCssHeight: 958,
      canvasCssWidth: 405,
      devicePixelRatio: 3
    })).toEqual({
      canvasCssHeight: 958,
      canvasCssWidth: 405,
      canvasPixelHeight: 1916,
      canvasPixelWidth: 810,
      resolution: 2
    });
  });
});

describe('summarizeMazerRenderResolution', () => {
  test('reports native sampling when backing pixels match the DPR target', () => {
    expect(summarizeMazerRenderResolution({
      canvasCssHeight: 800,
      canvasCssWidth: 400,
      canvasPixelHeight: 800,
      canvasPixelWidth: 400,
      devicePixelRatio: 1
    })).toMatchObject({
      renderResolutionDeficit: 0,
      renderResolutionRatio: 1,
      renderResolutionTargetRatio: 1,
      status: 'native',
      undersampledForDevicePixelRatio: false
    });

    expect(summarizeMazerRenderResolution({
      canvasCssHeight: 800,
      canvasCssWidth: 400,
      canvasPixelHeight: 1600,
      canvasPixelWidth: 800,
      devicePixelRatio: 2
    })).toMatchObject({
      renderResolutionDeficit: 0,
      renderResolutionRatio: 2,
      renderResolutionTargetRatio: 2,
      status: 'native',
      undersampledForDevicePixelRatio: false
    });
  });

  test('reports undersampling when a high-DPI display is rendered at 1x backing pixels', () => {
    expect(summarizeMazerRenderResolution({
      canvasCssHeight: 800,
      canvasCssWidth: 400,
      canvasPixelHeight: 800,
      canvasPixelWidth: 400,
      devicePixelRatio: 2
    })).toMatchObject({
      renderResolutionDeficit: 1,
      renderResolutionRatio: 1,
      renderResolutionTargetRatio: 2,
      status: 'undersampled',
      undersampledForDevicePixelRatio: true
    });
  });

  test('reports oversampling when backing pixels exceed the capped target', () => {
    expect(summarizeMazerRenderResolution({
      canvasCssHeight: 800,
      canvasCssWidth: 400,
      canvasPixelHeight: 2400,
      canvasPixelWidth: 1200,
      devicePixelRatio: 2
    })).toMatchObject({
      renderResolutionDeficit: 0,
      renderResolutionRatio: 3,
      renderResolutionTargetRatio: 2,
      status: 'oversampled',
      undersampledForDevicePixelRatio: false
    });
  });

  test('reports unavailable when canvas dimensions are not measurable', () => {
    expect(summarizeMazerRenderResolution({
      canvasCssHeight: 0,
      canvasCssWidth: 0,
      canvasPixelHeight: 0,
      canvasPixelWidth: 0,
      devicePixelRatio: 2
    })).toMatchObject({
      renderResolutionDeficit: 0,
      renderResolutionRatio: 0,
      renderResolutionTargetRatio: 2,
      status: 'unavailable',
      undersampledForDevicePixelRatio: false
    });
  });
});
