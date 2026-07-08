import Phaser from 'phaser';
import { BootScene } from '../scenes/BootScene';
import { MenuScene } from '../scenes/MenuScene';

export const phaserConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.CANVAS,
  parent: 'app',
  width: 1280,
  height: 720,
  backgroundColor: '#1d1330',
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
};
