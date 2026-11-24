/**
 * A recording stand-in for a canvas 2D context, for the frame-budget guard (tests/architecture/frame-budget-guard.test.ts).
 *
 * It draws nothing. It counts calls by name, the property writes that cost the real canvas something (shadowBlur,
 * shadow colour, fill/stroke style), and the device pixels a full-canvas operation touches (clearRect, fillRect,
 * drawImage). Counts are exact and identical on every machine, which is the point: a wall-clock budget flakes on a busy
 * runner, an operation count does not.
 */

export interface RecordingCanvasStats {
  /** Calls by method name. */
  calls: Record<string, number>;
  /** Writes by property name. */
  writes: Record<string, number>;
  /** Largest shadowBlur written, device px. */
  maxShadowBlur: number;
  /** Sum of w * h over clearRect / fillRect / drawImage destination rects, device px (the area the canvas has to touch). */
  touchedPixels: number;
  /** Total lineTo + moveTo vertices submitted to paths. */
  vertices: number;
}

export interface RecordingCanvas {
  ctx: CanvasRenderingContext2D;
  canvas: { width: number; height: number; getContext: (kind: string) => CanvasRenderingContext2D };
  stats: RecordingCanvasStats;
  count(name: string): number;
  /** Everything the canvas counts as a paint: stroke, fill, fillRect, drawImage. */
  paintOps(): number;
}

const METHODS = [
  'save', 'restore', 'setTransform', 'resetTransform', 'scale', 'translate', 'clearRect', 'beginPath', 'closePath', 'moveTo',
  'lineTo', 'arc', 'rect', 'fill', 'stroke', 'fillRect', 'clip', 'drawImage', 'quadraticCurveTo', 'bezierCurveTo'
] as const;

export const createRecordingCanvas = (width: number, height: number, scale = 1): RecordingCanvas => {
  const stats: RecordingCanvasStats = { calls: {}, writes: {}, maxShadowBlur: 0, touchedPixels: 0, vertices: 0 };
  const props: Record<string, unknown> = {
    fillStyle: '', strokeStyle: '', lineWidth: 1, lineCap: 'butt', lineJoin: 'miter', globalAlpha: 1,
    shadowBlur: 0, shadowColor: '', imageSmoothingEnabled: true, imageSmoothingQuality: 'low'
  };
  let transformScale = scale;
  // eslint-disable-next-line prefer-const -- the canvas and the context refer to each other
  let ctx: CanvasRenderingContext2D;
  const canvas = { width, height, getContext: (_kind: string) => ctx };
  ctx = new Proxy({} as Record<string, unknown>, {
    get(_target, name: string) {
      if (name === 'canvas') {
        return canvas;
      }
      if (name === 'getTransform') {
        return () => ({ a: transformScale, d: transformScale, e: 0, f: 0 });
      }
      if ((METHODS as readonly string[]).includes(name)) {
        return (...args: number[]) => {
          stats.calls[name] = (stats.calls[name] ?? 0) + 1;
          if (name === 'moveTo' || name === 'lineTo') {
            stats.vertices += 1;
          } else if (name === 'setTransform') {
            transformScale = Number(args[0]);
          } else if (name === 'clearRect' || name === 'fillRect') {
            stats.touchedPixels += Math.abs(Number(args[2]) * Number(args[3]));
          } else if (name === 'drawImage') {
            // drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh) or (image, dx, dy, dw, dh)
            const dw = args.length >= 9 ? args[7] : args[3];
            const dh = args.length >= 9 ? args[8] : args[4];
            stats.touchedPixels += Math.abs(Number(dw ?? 0) * Number(dh ?? 0));
          }
        };
      }
      return props[name];
    },
    set(_target, name: string, value: unknown) {
      props[name] = value;
      stats.writes[name] = (stats.writes[name] ?? 0) + 1;
      if (name === 'shadowBlur') {
        stats.maxShadowBlur = Math.max(stats.maxShadowBlur, Number(value));
      }
      return true;
    }
  }) as unknown as CanvasRenderingContext2D;
  return {
    ctx,
    canvas,
    stats,
    count: (name) => stats.calls[name] ?? 0,
    paintOps: () => (stats.calls.stroke ?? 0) + (stats.calls.fill ?? 0) + (stats.calls.fillRect ?? 0) + (stats.calls.drawImage ?? 0)
  };
};

/**
 * Install a `document.createElement('canvas')` that hands out recording canvases (the trail bloom's scratch canvas is made
 * that way). Returns the created canvases and an uninstall function.
 */
export const installRecordingDocument = (): { created: RecordingCanvas[]; uninstall: () => void } => {
  const created: RecordingCanvas[] = [];
  const holder = globalThis as { document?: unknown };
  const previous = holder.document;
  holder.document = {
    createElement: (_tag: string) => {
      const recording = createRecordingCanvas(0, 0);
      created.push(recording);
      return recording.canvas;
    }
  };
  return {
    created,
    uninstall: () => {
      if (previous === undefined) {
        delete holder.document;
      } else {
        holder.document = previous;
      }
    }
  };
};
