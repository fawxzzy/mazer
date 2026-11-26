import '../dom/primitives.css';
import './modeSelect.css';
import { HAZARD_GATE_MAGENTA, palette } from '../../render/palette';
import { DARK_THEME_TOKENS } from '../../theme/themes';
import { applyFeedbackTheme } from '../feedback/feedbackTheme';
import { createModeSelectRail, type ModeSelectRailHandle, type ModeSelectRailOptions } from './modeSelectRail';

/**
 * Puts the game-mode selector (look D, modeSelectRail.ts) on the page over the menu canvas. This is the only module
 * that touches the real document for it, and it is loaded on demand (src/legacy-runtime/legacyModeSelectLayer.ts), so
 * none of the selector, its CSS or the kit buttons are in the boot bundle.
 *
 *  - One layer: fixed, full screen, above the canvas. The canvas keeps drawing the overlay dim behind it.
 *  - Keyboard: keydown / keyup / keypress stop at the layer, so the game's window and document key handlers never see a
 *    key pressed in the selector. Arrows / Home / End move, Enter plays the centred playable mode, Escape is Back,
 *    Tab stays inside the layer. Focus starts on the rail and returns there if it falls out of the layer.
 *  - Wheel: a vertical wheel anywhere on the layer steps one mode, unless a short layout is scrolling vertically and
 *    the wheel is off the rail.
 */

export const MODE_SELECT_LAYER_CLASS = 'mazer-mode-select';

export interface ModeSelectMountOptions extends Omit<ModeSelectRailOptions, 'doc'> {
  readonly theme: 'default' | 'dark';
  readonly host?: HTMLElement;
  readonly doc?: Document;
}

export interface ModeSelectMountHandle {
  readonly layer: HTMLElement;
  readonly rail: ModeSelectRailHandle;
  close: () => void;
  isClosed: () => boolean;
}

const hex = (value: number): string => `#${value.toString(16).padStart(6, '0')}`;

/** The board palette for the Chip tile pictures, as layer custom properties (no colour literal in the CSS). */
export const resolveModeSelectPaletteVars = (theme: 'default' | 'dark'): Readonly<Record<string, string>> => {
  const dark = theme === 'dark';
  return {
    '--mms-accent-deep': dark ? DARK_THEME_TOKENS.accentDeep : hex(palette.hud.accent),
    '--mms-corridor': dark ? DARK_THEME_TOKENS.corridor : hex(palette.board.floor),
    '--mms-corridor-edge': dark ? DARK_THEME_TOKENS.corridorEdge : hex(palette.board.innerStroke),
    '--mms-gate': hex(HAZARD_GATE_MAGENTA),
    '--mms-goal': hex(palette.board.goal),
    '--mms-socket': dark ? DARK_THEME_TOKENS.socket : hex(palette.board.panelStroke),
    '--mms-start': hex(palette.board.start),
    '--mms-start-core': hex(palette.board.startCore),
    '--mms-trail': hex(palette.board.trail),
    '--mms-trail-glow': hex(palette.board.trailGlow)
  };
};

export const mountModeSelect = (options: ModeSelectMountOptions): ModeSelectMountHandle => {
  const doc = options.doc ?? document;
  const host = options.host ?? doc.body;
  const layer = doc.createElement('div');
  layer.className = MODE_SELECT_LAYER_CLASS;
  layer.classList.toggle('is-reduced-motion', options.reducedMotion);
  layer.setAttribute('role', 'dialog');
  layer.setAttribute('aria-modal', 'true');
  layer.setAttribute('aria-label', options.title);
  applyFeedbackTheme(layer, options.theme);
  for (const [name, value] of Object.entries(resolveModeSelectPaletteVars(options.theme))) layer.style.setProperty(name, value);

  const far = doc.createElement('div');
  far.className = 'mms-far';
  far.setAttribute('aria-hidden', 'true');

  let closed = false;
  const rail = createModeSelectRail({
    ...options,
    doc,
    onScroll: (scrollLeft) => far.style.setProperty('--mms-scroll', scrollLeft.toFixed(1))
  });
  layer.append(far, rail.root);

  const stop = (event: Event): void => event.stopPropagation();
  layer.addEventListener('keyup', stop);
  layer.addEventListener('keypress', stop);
  layer.addEventListener('keydown', (event) => {
    event.stopPropagation();
    if (event.key === 'Tab') {
      const stops = [rail.rail, rail.play, rail.back].filter((node) => !(node as HTMLButtonElement).disabled);
      const at = stops.indexOf(doc.activeElement as HTMLElement);
      const next = event.shiftKey
        ? stops[(at <= 0 ? stops.length : at) - 1]
        : stops[(at + 1) % stops.length];
      event.preventDefault();
      next?.focus({ preventScroll: true });
      return;
    }
    rail.handleKey(event);
  });

  layer.addEventListener('wheel', (event) => {
    const onRail = rail.rail.contains(event.target as Node);
    const layerScrolls = layer.scrollHeight > layer.clientHeight + 1;
    if (!onRail && layerScrolls) return;
    rail.handleWheel(event);
  }, { passive: false });

  // Focus stays in the selector: a click on its empty space would otherwise drop focus to the page, and the arrow keys
  // would stop working.
  layer.addEventListener('focusout', (event) => {
    if (closed) return;
    const next = event.relatedTarget as Node | null;
    if (next !== null && layer.contains(next)) return;
    rail.rail.focus({ preventScroll: true });
  });

  // Focus goes back where it was (the game canvas) when the selector closes, so keyboard play carries on from there.
  const previousFocus = doc.activeElement instanceof HTMLElement && doc.activeElement !== doc.body ? doc.activeElement : null;
  host.append(layer);
  rail.remeasure();
  rail.rail.focus({ preventScroll: true });

  return {
    close: () => {
      if (closed) return;
      closed = true;
      const hadFocus = layer.contains(doc.activeElement);
      rail.destroy();
      layer.remove();
      if (hadFocus && previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    },
    isClosed: () => closed,
    layer,
    rail
  };
};
