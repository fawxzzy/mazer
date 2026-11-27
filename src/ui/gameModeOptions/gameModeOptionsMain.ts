import '../../styles/base.css';
import '../dom/primitives.css';
import './gameModeOptions.css';
import { palette, HAZARD_GATE_MAGENTA } from '../../render/palette';
import { DARK_THEME_TOKENS } from '../../theme/themes';
import { applyFeedbackTheme } from '../feedback/feedbackTheme';
import { GAME_MODE_SAMPLES } from './gameModeData';
import { createModeRail, type RailVariant } from './gameModeRail';

/**
 * Options page for the game-mode selector (dev/proposal only; not in vite.config build.rollupOptions.input).
 * Five side-scrolling directions. Everything is real DOM built from the shipping tokens (tokens.css and the dark neon
 * theme tokens), the shipped fonts (Space Grotesk, Oxanium), the kit button (createMazerButton) and the board palette
 * (src/render/palette.ts) for the Chip tile art. The game menu itself is a Phaser canvas, so the stage behind each
 * selector is a plain dark backdrop. Nothing here is imported by the game (pinned by a test).
 *
 * Query: theme=dark|default (default dark), only=peek|float|type|depth|dial (show one option).
 */
const params = new URLSearchParams(window.location.search);
const theme = params.get('theme') === 'default' ? 'default' : 'dark';
const only = params.get('only');

const hex = (value: number): string => `#${value.toString(16).padStart(6, '0')}`;
const root = document.documentElement;
applyFeedbackTheme(root, theme);
const dark = theme === 'dark';
const vars: Record<string, string> = {
  '--gm-corridor': dark ? DARK_THEME_TOKENS.corridor : hex(palette.board.floor),
  '--gm-corridor-edge': dark ? DARK_THEME_TOKENS.corridorEdge : hex(palette.board.innerStroke),
  '--gm-socket': dark ? DARK_THEME_TOKENS.socket : hex(palette.board.panelStroke),
  '--gm-accent-dim': dark ? DARK_THEME_TOKENS.accentDim : hex(palette.hud.panel),
  '--gm-accent-deep': dark ? DARK_THEME_TOKENS.accentDeep : hex(palette.hud.accent),
  '--gm-start': hex(palette.board.start),
  '--gm-start-core': hex(palette.board.startCore),
  '--gm-goal': hex(palette.board.goal),
  '--gm-trail': hex(palette.board.trail),
  '--gm-trail-glow': hex(palette.board.trailGlow),
  '--gm-gate': hex(HAZARD_GATE_MAGENTA)
};
for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, value);
document.body.style.margin = '0';
document.body.style.background = 'var(--mazer-token-color-bg-canvas, var(--mazer-token-color-bg-shell))';
document.body.style.color = 'var(--mazer-token-color-text-primary)';

interface Option {
  id: RailVariant;
  name: string;
  blurb: string;
  detailArt: boolean;
  pick?: boolean;
}

const OPTIONS: readonly Option[] = [
  { id: 'peek', name: 'A. Peeking cards', detailArt: false,
    blurb: 'Snap carousel. The centre card is full size, the neighbours peek in from both edges, smaller and dimmer. Closest to what exists today, with a light card.' },
  { id: 'float', name: 'B. Floating labels', detailArt: false, pick: true,
    blurb: 'No containers at all. The maze picture and the name float on the dark, drift gently, and fade as they leave the centre. Snap to centre, neighbours still peek.' },
  { id: 'type', name: 'C. Big-type rail', detailArt: true,
    blurb: 'Mode names set huge in a free-scrolling rail. The centred one is solid, the rest are outlines. One picture below follows the selection.' },
  { id: 'depth', name: 'D. Depth and parallax', detailArt: false,
    blurb: 'Cards turn on a perspective as they pass, the picture slides inside its frame and the star field behind moves slower than the rail.' },
  { id: 'dial', name: 'E. Dial', detailArt: true,
    blurb: 'Camera-dial style. A big picture on top, a thin ruler near your thumb with a fixed marker; slide the labels under the marker to switch.' }
];

const page = document.createElement('main');
page.className = 'gm-page';
const intro = document.createElement('header');
intro.className = 'gm-intro';
const h1 = document.createElement('h1');
h1.textContent = 'Game mode selector: pick a direction';
const p = document.createElement('p');
p.textContent = 'Each selector is live. Swipe or drag the row sideways, tap a mode to centre it, or use the arrow keys. Endless is the only playable mode; Hazards is the reserved slot; Sprint and Daily are placeholder names so the row has length. Level 37 is a sample number. Nothing here ships in the game.';
const themeLink = document.createElement('a');
themeLink.href = `?theme=${dark ? 'default' : 'dark'}${only ? `&only=${only}` : ''}`;
themeLink.textContent = `Theme: ${dark ? 'dark neon' : 'default mint'}. Switch to ${dark ? 'default mint' : 'dark neon'}.`;
if (only) p.hidden = true;
intro.append(h1, p, themeLink);
page.append(intro);

for (const option of OPTIONS) {
  if (only && only !== option.id) continue;
  const section = document.createElement('section');
  section.className = 'gm-option';
  const head = document.createElement('div');
  head.className = 'gm-option-head';
  const h2 = document.createElement('h2');
  h2.textContent = option.name;
  if (option.pick) {
    const badge = document.createElement('span');
    badge.className = 'gm-pick';
    badge.textContent = 'My pick';
    h2.append(' ', badge);
  }
  const blurb = document.createElement('p');
  blurb.textContent = option.blurb;
  head.append(h2, blurb);
  if (option.pick) {
    const why = document.createElement('p');
    why.className = 'gm-why';
    why.textContent = 'Why: it is the one that actually drops the container feel you asked for, keeps the maze picture as the star of each mode, and still shows neighbours so the sideways scroll is obvious on a phone. It also costs no extra taps for Endless: it opens centred on it.';
    head.append(why);
  }
  const rail = createModeRail({ variant: option.id, modes: GAME_MODE_SAMPLES, idPrefix: `opt-${option.id}`, detailArt: option.detailArt });
  section.append(head, rail.root);
  page.append(section);
}

const mount = document.getElementById('game-mode-options-root') as HTMLElement;
mount.replaceChildren(page);
