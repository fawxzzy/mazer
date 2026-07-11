export const MAZER_CANVAS_RESOLUTION_MIN = 1;
export const MAZER_CANVAS_RESOLUTION_MAX = 2;
export const MAZER_CANVAS_RESOLUTION_STATUS_EPSILON = 0.05;

export type MazerRenderResolutionStatus = 'native' | 'undersampled' | 'oversampled' | 'unavailable';

export interface MazerRenderResolutionSample {
  canvasCssHeight: number;
  canvasCssWidth: number;
  canvasPixelHeight: number;
  canvasPixelWidth: number;
  devicePixelRatio: number;
}

export interface MazerRenderResolutionDiagnostics extends MazerRenderResolutionSample {
  renderResolutionDeficit: number;
  renderResolutionRatio: number;
  renderResolutionTargetRatio: number;
  status: MazerRenderResolutionStatus;
  undersampledForDevicePixelRatio: boolean;
}

export interface MazerCanvasBackingResolutionInput {
  canvasCssHeight: number;
  canvasCssWidth: number;
  devicePixelRatio?: number;
}

export interface MazerCanvasBackingResolution {
  canvasCssHeight: number;
  canvasCssWidth: number;
  canvasPixelHeight: number;
  canvasPixelWidth: number;
  resolution: number;
}

export interface MazerCanvasBackingResolutionTarget extends MazerCanvasBackingResolution {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D | null | undefined;
  renderer?: {
    height?: number;
    resize?: (width: number, height: number) => void;
    width?: number;
  } | null;
}

const readRuntimeDevicePixelRatio = (): number => {
  if (typeof window === 'undefined' || !Number.isFinite(window.devicePixelRatio)) {
    return MAZER_CANVAS_RESOLUTION_MIN;
  }

  return window.devicePixelRatio;
};

export const resolveMazerCanvasResolution = (
  devicePixelRatio = readRuntimeDevicePixelRatio()
): number => {
  const safeDevicePixelRatio = Number.isFinite(devicePixelRatio)
    ? devicePixelRatio
    : MAZER_CANVAS_RESOLUTION_MIN;
  const cappedResolution = Math.min(
    MAZER_CANVAS_RESOLUTION_MAX,
    Math.max(MAZER_CANVAS_RESOLUTION_MIN, safeDevicePixelRatio)
  );

  return Math.round(cappedResolution * 100) / 100;
};

const roundResolutionRatio = (value: number): number => Math.round(value * 100) / 100;

const normalizePositiveInteger = (value: number): number => {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return Math.max(1, Math.round(value));
};

export const resolveMazerCanvasBackingResolution = (
  input: MazerCanvasBackingResolutionInput
): MazerCanvasBackingResolution => {
  const canvasCssWidth = normalizePositiveInteger(input.canvasCssWidth);
  const canvasCssHeight = normalizePositiveInteger(input.canvasCssHeight);
  const resolution = resolveMazerCanvasResolution(input.devicePixelRatio);
  const canvasPixelWidth = canvasCssWidth > 0 ? Math.max(1, Math.round(canvasCssWidth * resolution)) : 0;
  const canvasPixelHeight = canvasCssHeight > 0 ? Math.max(1, Math.round(canvasCssHeight * resolution)) : 0;

  return {
    canvasCssHeight,
    canvasCssWidth,
    canvasPixelHeight,
    canvasPixelWidth,
    resolution
  };
};

export const summarizeMazerRenderResolution = (
  sample: MazerRenderResolutionSample
): MazerRenderResolutionDiagnostics => {
  const canvasCssWidth = normalizePositiveInteger(sample.canvasCssWidth);
  const canvasCssHeight = normalizePositiveInteger(sample.canvasCssHeight);
  const canvasPixelWidth = normalizePositiveInteger(sample.canvasPixelWidth);
  const canvasPixelHeight = normalizePositiveInteger(sample.canvasPixelHeight);
  const devicePixelRatio = Number.isFinite(sample.devicePixelRatio)
    ? Math.max(MAZER_CANVAS_RESOLUTION_MIN, sample.devicePixelRatio)
    : MAZER_CANVAS_RESOLUTION_MIN;

  if (canvasCssWidth === 0 || canvasCssHeight === 0 || canvasPixelWidth === 0 || canvasPixelHeight === 0) {
    return {
      canvasCssHeight,
      canvasCssWidth,
      canvasPixelHeight,
      canvasPixelWidth,
      devicePixelRatio,
      renderResolutionDeficit: 0,
      renderResolutionRatio: 0,
      renderResolutionTargetRatio: resolveMazerCanvasResolution(devicePixelRatio),
      status: 'unavailable',
      undersampledForDevicePixelRatio: false
    };
  }

  const widthRatio = canvasPixelWidth / canvasCssWidth;
  const heightRatio = canvasPixelHeight / canvasCssHeight;
  const renderResolutionRatio = roundResolutionRatio(Math.min(widthRatio, heightRatio));
  const renderResolutionTargetRatio = resolveMazerCanvasResolution(devicePixelRatio);
  const renderResolutionDeficit = roundResolutionRatio(Math.max(0, renderResolutionTargetRatio - renderResolutionRatio));
  const renderResolutionSurplus = roundResolutionRatio(Math.max(0, renderResolutionRatio - renderResolutionTargetRatio));
  const undersampledForDevicePixelRatio = renderResolutionDeficit > MAZER_CANVAS_RESOLUTION_STATUS_EPSILON;
  const status: MazerRenderResolutionStatus = undersampledForDevicePixelRatio
    ? 'undersampled'
    : renderResolutionSurplus > MAZER_CANVAS_RESOLUTION_STATUS_EPSILON
      ? 'oversampled'
      : 'native';

  return {
    canvasCssHeight,
    canvasCssWidth,
    canvasPixelHeight,
    canvasPixelWidth,
    devicePixelRatio,
    renderResolutionDeficit,
    renderResolutionRatio,
    renderResolutionTargetRatio,
    status,
    undersampledForDevicePixelRatio
  };
};

const MAZER_CONTEXT_RESOLUTION_KEY = '__mazerCanvasResolution';
const MAZER_CONTEXT_SET_TRANSFORM_KEY = '__mazerOriginalSetTransform';

type MazerPatchedCanvasContext = CanvasRenderingContext2D & {
  [MAZER_CONTEXT_RESOLUTION_KEY]?: number;
  [MAZER_CONTEXT_SET_TRANSFORM_KEY]?: (...args: unknown[]) => void;
};

const patchCanvasContextResolution = (
  context: CanvasRenderingContext2D,
  resolution: number
): void => {
  const patchedContext = context as MazerPatchedCanvasContext;

  if (patchedContext[MAZER_CONTEXT_SET_TRANSFORM_KEY] === undefined) {
    const originalSetTransform = context.setTransform.bind(context) as (...args: unknown[]) => void;
    patchedContext[MAZER_CONTEXT_SET_TRANSFORM_KEY] = originalSetTransform;
    context.setTransform = ((...args: unknown[]) => {
      const activeResolution = patchedContext[MAZER_CONTEXT_RESOLUTION_KEY] ?? MAZER_CANVAS_RESOLUTION_MIN;
      if (
        args.length >= 6
        && typeof args[0] === 'number'
        && typeof args[1] === 'number'
        && typeof args[2] === 'number'
        && typeof args[3] === 'number'
        && typeof args[4] === 'number'
        && typeof args[5] === 'number'
      ) {
        return originalSetTransform(
          args[0] * activeResolution,
          args[1] * activeResolution,
          args[2] * activeResolution,
          args[3] * activeResolution,
          args[4] * activeResolution,
          args[5] * activeResolution
        );
      }

      originalSetTransform(...args);
    }) as CanvasRenderingContext2D['setTransform'];
  }

  patchedContext[MAZER_CONTEXT_RESOLUTION_KEY] = resolution;
};

export const applyMazerCanvasBackingResolution = (
  target: MazerCanvasBackingResolutionTarget
): void => {
  const { canvas, context, renderer } = target;
  const { canvasCssHeight, canvasCssWidth, canvasPixelHeight, canvasPixelWidth, resolution } = target;

  if (canvasCssWidth <= 0 || canvasCssHeight <= 0 || canvasPixelWidth <= 0 || canvasPixelHeight <= 0) {
    return;
  }

  if (canvas.width !== canvasPixelWidth) {
    canvas.width = canvasPixelWidth;
  }
  if (canvas.height !== canvasPixelHeight) {
    canvas.height = canvasPixelHeight;
  }

  canvas.style.width = `${canvasCssWidth}px`;
  canvas.style.height = `${canvasCssHeight}px`;

  if (renderer !== null && renderer !== undefined) {
    if (typeof renderer.resize === 'function') {
      renderer.resize(canvasPixelWidth, canvasPixelHeight);
    } else {
      renderer.width = canvasPixelWidth;
      renderer.height = canvasPixelHeight;
    }
  }

  if (context !== null && context !== undefined) {
    patchCanvasContextResolution(context, resolution);
  }
};
