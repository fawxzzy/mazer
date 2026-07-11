import Phaser from 'phaser';
import { legacyTuning } from '../config/tuning';

const readDevicePixelRatio = (): number => {
  if (typeof window === 'undefined' || !Number.isFinite(window.devicePixelRatio)) {
    return 1;
  }

  return Math.max(1, window.devicePixelRatio);
};

export const resolveHudTextResolution = (viewport: { width: number; height: number }): number => {
  const devicePixelRatio = readDevicePixelRatio();
  const resolutionCap = viewport.width <= legacyTuning.menu.layout.narrowBreakpoint ? 1.4 : 1.85;
  return Phaser.Math.Clamp(Math.min(devicePixelRatio, resolutionCap), 1, resolutionCap);
};

export const applyTextResolution = <T extends Phaser.GameObjects.Text>(text: T, resolution: number): T => {
  if (Number.isFinite(resolution) && resolution > 1) {
    text.setResolution(resolution);
  }

  return text;
};
