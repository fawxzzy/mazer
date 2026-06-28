import Phaser from 'phaser';
import { BootScene } from '../scenes/BootScene';
import { MenuScene } from '../scenes/MenuScene';

export const phaserConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'app',
  width: 1280,
  height: 720,
  backgroundColor: '#1d1330',
  pixelArt: true,
  antialias: false,
  antialiasGL: false,
  roundPixels: true,
  audio: {
    noAudio: true
  },
  scene: [BootScene, MenuScene],
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoRound: true,
    autoCenter: Phaser.Scale.CENTER_BOTH
  }
};
