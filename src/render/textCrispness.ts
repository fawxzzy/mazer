import Phaser from 'phaser';
import { MAZER_CANVAS_RESOLUTION_MIN } from '../boot/canvasResolution';

const readDevicePixelRatio = (): number => {
  if (typeof window === 'undefined' || !Number.isFinite(window.devicePixelRatio)) {
    return 1;
  }

  return Math.max(1, window.devicePixelRatio);
};

export const resolveHudTextResolution = (
  _viewport: { width: number; height: number },
  _devicePixelRatio = readDevicePixelRatio()
): number => {
  // The main CanvasRenderer context already applies the capped DPR transform.
  // Applying an additional Phaser Text resolution multiplies the painted glyph
  // size without changing getBounds(), which is why mobile copy could cross its
  // chrome while every logical containment check still passed. Render text at
  // the texture baseline and let the game canvas own the only DPR transform.
  return MAZER_CANVAS_RESOLUTION_MIN;
};

export const applyTextResolution = <T extends Phaser.GameObjects.Text>(text: T, resolution: number): T => {
  if (Number.isFinite(resolution) && resolution > 1) {
    text.setResolution(resolution);
  }

  return text;
};
