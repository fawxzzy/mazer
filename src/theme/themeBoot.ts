/**
 * MAZER-UI-102: resolves the theme before anything draws. Imported first by src/boot/main.ts.
 *
 * The persisted Settings > Dark mode switch (legacyDarkModePreference.ts, default off) picks the theme. With it off nothing is
 * installed and the app is the shipping app. Turning the switch reloads the game, so every baked texture, text and DOM
 * surface is built once under one theme (a live swap would leave baked pieces behind).
 */
import Phaser from 'phaser';
import { installDarkThemeCanvasBridge, type ThemeGraphicsPrototype } from './darkThemeCanvasBridge';
import { readDarkModePreference } from '../legacy-runtime/legacyDarkModePreference';
import { setActiveMazerThemeId } from './themes';

const readBrowserStorage = (): Storage | undefined => {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
};

if (typeof window !== 'undefined' && typeof CanvasRenderingContext2D !== 'undefined') {
  if (readDarkModePreference(readBrowserStorage())) {
    setActiveMazerThemeId('dark');
    installDarkThemeCanvasBridge('dark', Phaser.GameObjects.Graphics.prototype as unknown as ThemeGraphicsPrototype);
  }
}
