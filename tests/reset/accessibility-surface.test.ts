import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  applyMazerCanvasAccessibility,
  describeMazerAccessibilityCanvas,
  MAZER_ACCESSIBILITY_DESCRIPTION_ID,
  MAZER_ACCESSIBILITY_SHORTCUTS
} from '../../src/boot/accessibilitySurface';

describe('Mazer accessibility shell', () => {
  test('publishes the existing keyboard commands as a semantic canvas contract', () => {
    expect(MAZER_ACCESSIBILITY_SHORTCUTS).toEqual([
      { command: 'start', key: 'Enter', label: 'Start maze' },
      { command: 'settings', key: 'O', label: 'Open settings' },
      { command: 'pause', key: 'P', label: 'Pause or resume game' },
      { command: 'back', key: 'Escape', label: 'Close dialog or go back' },
      { command: 'guest', key: 'G', label: 'Play as guest' }
    ]);
    expect(describeMazerAccessibilityCanvas()).toEqual({
      ariaDescriptionId: MAZER_ACCESSIBILITY_DESCRIPTION_ID,
      ariaKeyShortcuts: 'Enter O P Escape G',
      ariaLabel: 'Mazer precision maze game',
      role: 'application',
      tabIndex: 0
    });
  });

  test('makes the canvas keyboard focusable without changing Phaser input ownership', () => {
    const attributes = new Map<string, string>();
    const canvas = {
      tabIndex: -1,
      setAttribute: (name: string, value: string) => attributes.set(name, value)
    };

    applyMazerCanvasAccessibility(canvas);

    expect(canvas.tabIndex).toBe(0);
    expect(attributes).toEqual(new Map([
      ['aria-describedby', MAZER_ACCESSIBILITY_DESCRIPTION_ID],
      ['aria-keyshortcuts', 'Enter O P Escape G'],
      ['aria-label', 'Mazer precision maze game'],
      ['role', 'application']
    ]));
  });

  test('installs the semantic command rail and visible focus treatment from the boot shell', () => {
    const mainSource = readFileSync(resolve(process.cwd(), 'src/boot/main.ts'), 'utf8');
    const styleSource = readFileSync(resolve(process.cwd(), 'src/styles/base.css'), 'utf8');
    const surfaceSource = readFileSync(resolve(process.cwd(), 'src/boot/accessibilitySurface.ts'), 'utf8');

    expect(mainSource).toContain("import { installMazerAccessibilitySurface } from './accessibilitySurface';");
    expect(mainSource).toContain('installMazerAccessibilitySurface(document, game.canvas);');
    expect(surfaceSource).toContain("documentRef.dispatchEvent(new KeyboardEvent('keydown'");
    expect(surfaceSource).toContain("button.addEventListener('keydown', (event) => activateMazerShortcut(event, documentRef, shortcut.key));");
    expect(surfaceSource).toContain("surface.setAttribute('aria-label', 'Mazer keyboard controls');");
    expect(styleSource).toContain('canvas:focus-visible');
    expect(styleSource).toContain('.mazer-accessibility-shortcut:focus-visible');
  });
});
