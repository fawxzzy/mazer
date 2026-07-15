import Phaser from 'phaser';
import { BootScene } from '../scenes/BootScene';
import { MenuScene } from '../scenes/MenuScene';

export interface MazerPhaserViewport {
  height: number;
  width: number;
}

export const createMazerPhaserConfig = (
  viewport: MazerPhaserViewport = { width: 1280, height: 720 }
): Phaser.Types.Core.GameConfig => ({
  type: Phaser.CANVAS,
  parent: 'app',
  width: viewport.width,
  height: viewport.height,
  backgroundColor: '#02080f',
  pixelArt: false,
  antialias: true,
  antialiasGL: true,
  roundPixels: true,
  audio: {
    noAudio: true
  },
  fps: {
    target: 60,
    min: 30
  },
  input: {
    activePointers: 2
  },
  scene: [BootScene, MenuScene],
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoRound: true,
    autoCenter: Phaser.Scale.CENTER_BOTH
  }
});

export const phaserConfig: Phaser.Types.Core.GameConfig = createMazerPhaserConfig();
