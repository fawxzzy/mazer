/**
 * Shared scaffold for the dev-only options pages (shards, Help). Real DOM built from the shipping tokens, the shipped
 * fonts, the kit (createMazerButton, createStatusBanner, createMazerSegmentedControl) and the board palette. The game
 * board and menu are Phaser canvases, so the small boards here are DOM Starlit Bevel tiles (the same convention as the
 * game-mode selector page); the icons are painted by the game's own paintButtonIcon. Nothing here is imported by the game.
 */
import '../../styles/base.css';
import '../dom/primitives.css';
import './optionsKit.css';
import {
  HAZARD_GATE_MAGENTA,
  SEED_SPIRAL_GREEN,
  STARLIT_BEVEL_TILE,
  palette
} from '../../render/palette';
import { applyFeedbackTheme } from '../feedback/feedbackTheme';
import { GOAL_STAR_SPIN } from '../../render/goalStarSpin';
import { paintButtonIcon, resolveButtonIconColours, type ButtonIconId, type ButtonIconState } from '../../render/buttonIcons';
import { diamondPoints, goalStarPoints, hexPoints, polygonCss, sparkKitePoints, sparklePoints } from './optionsGeometry';

export const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const hex = (value: number): string => `#${value.toString(16).padStart(6, '0')}`;

export type PageTheme = 'default' | 'dark';

/** Page boot: unlocks scrolling (base.css locks html/body for the game canvas), applies the theme, sets palette vars. */
export const bootOptionsPage = (): { theme: PageTheme; only: string | null; params: URLSearchParams } => {
  const params = new URLSearchParams(window.location.search);
  const theme: PageTheme = params.get('theme') === 'dark' ? 'dark' : 'default';
  const root = document.documentElement;
  root.classList.add('oo-page');
  applyFeedbackTheme(root, theme);
  const vars: Record<string, string> = {
    '--oo-floor': hex(STARLIT_BEVEL_TILE.floor),
    '--oo-rim': hex(STARLIT_BEVEL_TILE.rim),
    '--oo-hi': hex(STARLIT_BEVEL_TILE.highlight),
    '--oo-shade': hex(STARLIT_BEVEL_TILE.shade),
    '--oo-goal': hex(palette.board.goal),
    '--oo-goal-core': hex(palette.board.goalCore),
    '--oo-start': hex(SEED_SPIRAL_GREEN),
    '--oo-trail': hex(palette.board.trail),
    '--oo-trail-glow': hex(palette.board.trailGlow),
    '--oo-gate': hex(HAZARD_GATE_MAGENTA),
    '--oo-star-clip': polygonCss(goalStarPoints()),
    '--oo-kite-clip': polygonCss(sparkKitePoints()),
    '--oo-sparkle-clip': polygonCss(sparklePoints()),
    '--oo-diamond-clip': polygonCss(diamondPoints()),
    '--oo-hex-clip': polygonCss(hexPoints()),
    '--oo-star-spin': `${GOAL_STAR_SPIN.periodMs}ms`
  };
  for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, value);
  return { theme, only: params.get('only'), params };
};

export interface OptionSpec {
  readonly id: string;
  readonly name: string;
  readonly blurb: string;
  /** One line: what the build touches and what the in-app Guide would need if this is picked. */
  readonly needs?: string;
  readonly pick?: { readonly why: string };
  readonly build: () => HTMLElement;
}

export interface SectionSpec {
  readonly id: string;
  readonly title: string;
  readonly intro: string;
  readonly options: readonly OptionSpec[];
}

export const createSection = (spec: SectionSpec): HTMLElement => {
  const section = el('section', 'oo-section');
  section.id = spec.id;
  const head = el('header', 'oo-section-head');
  head.append(el('h2', undefined, spec.title), el('p', undefined, spec.intro));
  const list = el('div', 'oo-options');
  for (const option of spec.options) {
    const card = el('article', `oo-option${option.pick ? ' is-pick' : ''}`);
    card.dataset.option = option.id;
    const h3 = el('h3', undefined, option.name);
    if (option.pick) h3.append(' ', el('span', 'oo-pick', 'My pick'));
    card.append(h3, el('p', 'oo-blurb', option.blurb));
    card.append(option.build());
    if (option.pick) card.append(el('p', 'oo-why', `Why: ${option.pick.why}`));
    if (option.needs) card.append(el('p', 'oo-needs', `Build and Guide: ${option.needs}`));
    list.append(card);
  }
  section.append(head, list);
  return section;
};

export const createIntro = (title: string, paragraphs: readonly string[], theme: PageTheme, only: string | null): HTMLElement => {
  const intro = el('header', 'oo-intro');
  intro.append(el('h1', undefined, title));
  for (const text of paragraphs) intro.append(el('p', undefined, text));
  const link = el('a', 'oo-theme-link');
  link.href = `?theme=${theme === 'dark' ? 'default' : 'dark'}${only ? `&only=${only}` : ''}`;
  link.textContent = `Theme: ${theme === 'dark' ? 'dark neon' : 'default'}. Switch to ${theme === 'dark' ? 'default' : 'dark neon'}.`;
  intro.append(link);
  return intro;
};

export const createNav = (sections: readonly SectionSpec[]): HTMLElement => {
  const nav = el('nav', 'oo-nav');
  nav.setAttribute('aria-label', 'Sections');
  for (const section of sections) {
    const a = el('a', undefined, section.title.replace(/^\d+\.\s*/, ''));
    a.href = `#${section.id}`;
    nav.append(a);
  }
  return nav;
};

// ---------------------------------------------------------------------------------------------- small boards

export interface BoardHandle {
  readonly root: HTMLElement;
  readonly at: (row: number, col: number) => HTMLElement;
  /** Shard cells in collection order (digits 1..9 in the map). */
  readonly shardCells: readonly HTMLElement[];
  readonly endCell: HTMLElement | null;
  readonly startCell: HTMLElement | null;
}

/**
 * Builds a Starlit Bevel board (the shipped tile set H) as a CSS grid: '#' wall, '.' floor, 'S' start pinwheel, 'E' end
 * (the caller decorates it), '1'..'9' shard cells (the caller decorates them), 't' star-dust trail, 'P' Spark player.
 * The floor ribbon is continuous: a lit rim only on the sides that touch a wall, like the game.
 */
export const createBoard = (rows: readonly string[], cellPx: number): BoardHandle => {
  const rowCount = rows.length;
  const colCount = rows[0]?.length ?? 0;
  const root = el('div', 'oo-board');
  root.style.setProperty('--oo-cols', String(colCount));
  root.style.setProperty('--oo-rows', String(rowCount));
  root.style.setProperty('--oo-cell', `${cellPx}px`);
  const cells: HTMLElement[][] = [];
  const shardCells: Array<{ n: number; cell: HTMLElement }> = [];
  let endCell: HTMLElement | null = null;
  let startCell: HTMLElement | null = null;
  const wallAt = (r: number, c: number): boolean => (rows[r]?.[c] ?? '#') === '#';
  rows.forEach((row, r) => {
    const line: HTMLElement[] = [];
    [...row].forEach((ch, c) => {
      const cell = el('i', 'oo-c');
      if (ch === '#') {
        cell.classList.add('oo-c--wall');
      } else {
        cell.classList.add('oo-c--floor');
        if (wallAt(r - 1, c)) cell.classList.add('is-n');
        if (wallAt(r + 1, c)) cell.classList.add('is-s');
        if (wallAt(r, c + 1)) cell.classList.add('is-e');
        if (wallAt(r, c - 1)) cell.classList.add('is-w');
      }
      if (ch === 'S') { cell.append(el('b', 'oo-start')); startCell = cell; }
      if (ch === 'E') endCell = cell;
      if (ch === 't') cell.append(el('b', 'oo-trail'));
      if (ch === 'P') cell.append(el('b', 'oo-player'));
      if (/[1-9]/.test(ch)) { shardCells.push({ n: Number(ch), cell }); cell.dataset.shard = ch; }
      line.push(cell);
      root.append(cell);
    });
    cells.push(line);
  });
  shardCells.sort((a, b) => a.n - b.n);
  return {
    root,
    at: (r, c) => cells[r]![c]!,
    shardCells: shardCells.map((s) => s.cell),
    endCell,
    startCell
  };
};

/**
 * The sample board every shard demo uses: 9 x 7, three shards in order (1 at the corridor bend, 2 along the top, 3 at the
 * bottom), the end in the bottom wall. Start 'S', Spark player 'P' on shard 1 (just taken), star dust 't' behind it.
 */
export const SHARD_BOARD_ROWS: readonly string[] = Object.freeze([
  '#########',
  '#S..2...#',
  '#t#####.#',
  '#tP...#.#',
  '#.###.#.#',
  '#...3...#',
  '####E####'
]);

/** A real button icon painted by the game's own painter into a canvas (not an SVG or an image). */
export const createIconCanvas = (id: ButtonIconId, sizePx: number, state: ButtonIconState = 'idle'): HTMLCanvasElement => {
  const canvas = el('canvas', 'oo-icon');
  const dpr = Math.max(1, Math.round(window.devicePixelRatio || 1));
  canvas.width = sizePx * dpr;
  canvas.height = sizePx * dpr;
  canvas.style.setProperty('--oo-icon-size', `${sizePx}px`);
  canvas.setAttribute('aria-hidden', 'true');
  const ctx = canvas.getContext('2d');
  if (ctx) paintButtonIcon(ctx, id, { x: 0, y: 0, size: sizePx * dpr }, resolveButtonIconColours(state));
  return canvas;
};
