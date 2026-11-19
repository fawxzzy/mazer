import Phaser from 'phaser';
import { BootScene } from '../scenes/BootScene';
import { MenuScene } from '../scenes/MenuScene';
import { installFrameRateCap } from '../legacy-runtime/frameRateCap';

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
  // MAZER-PERF: a 120 Hz screen no longer doubles every update and render; installed before the loop starts.
  callbacks: {
    postBoot: (game) => {
      installFrameRateCap(game);
    }
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
