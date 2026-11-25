import { createMazerButton } from '../dom/MazerButton';
import type { GameModeSample } from './gameModeData';

export type RailVariant = 'peek' | 'float' | 'type' | 'depth' | 'dial';

export interface RailOptions {
  variant: RailVariant;
  modes: readonly GameModeSample[];
  idPrefix: string;
  /** Variants whose big picture lives outside the rail (one shared slot), not on each item. */
  detailArt: boolean;
}

export interface RailHandle {
  root: HTMLElement;
  rail: HTMLElement;
  select: (index: number) => void;
  index: () => number;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const TILE_KIND: Readonly<Record<string, string>> = {
  '#': 'wall', S: 'start', E: 'end', t: 'trail', g: 'gate', x: 'hazard', '.': 'path'
};

/** The maze picture is DOM: a CSS grid of Chip tiles (corridor fill, lit rim), not an image, SVG or canvas. */
export const createModeArt = (mode: GameModeSample): HTMLElement => {
  const rows = mode.art;
  const art = el('div', 'gm-art');
  art.style.setProperty('--gm-cols', String(rows[0]?.length ?? 1));
  art.style.setProperty('--gm-rows', String(rows.length));
  art.setAttribute('aria-hidden', 'true');
  for (const row of rows) {
    for (const cell of row) art.append(el('i', `gm-tile gm-tile--${TILE_KIND[cell] ?? 'path'}`));
  }
  return art;
};

export const createModeRail = (options: RailOptions): RailHandle => {
  const { modes, variant, idPrefix } = options;
  const root = el('div', `gm-stage gm-v-${variant}`);
  const far = el('div', 'gm-far');
  far.setAttribute('aria-hidden', 'true');
  const kicker = el('p', 'gm-kicker', 'Choose a mode');
  const rail = el('div', 'gm-rail');
  rail.tabIndex = 0;
  rail.setAttribute('role', 'listbox');
  rail.setAttribute('aria-label', 'Game modes');
  const track = el('div', 'gm-track');
  const detailArt = el('div', 'gm-detail-art');
  const tagline = el('p', 'gm-tagline');
  tagline.setAttribute('aria-live', 'polite');
  const chips = el('div', 'gm-chips');
  const note = el('p', 'gm-note');
  const play = createMazerButton({ label: 'Play Endless', tone: 'primary', className: 'gm-play' });

  const items = modes.map((mode, i) => {
    const item = el('button', `gm-item${mode.playable ? '' : ' is-locked'}`);
    item.type = 'button';
    item.id = `${idPrefix}-${mode.id}`;
    item.setAttribute('role', 'option');
    item.setAttribute('aria-selected', 'false');
    item.dataset.index = String(i);
    if (!options.detailArt) item.append(createModeArt(mode));
    item.append(el('span', 'gm-name', mode.label), el('span', 'gm-sub', mode.playable ? mode.tagline : 'Coming soon'));
    return item;
  });
  track.append(...items);
  if (variant === 'dial') track.append(el('div', 'gm-ticks'));
  rail.append(track);

  if (variant === 'dial') {
    const wrap = el('div', 'gm-dialwrap');
    wrap.append(rail, el('div', 'gm-marker'));
    root.append(far, kicker, detailArt, tagline, chips, wrap, play, note);
  } else if (options.detailArt) {
    root.append(far, kicker, rail, detailArt, tagline, chips, play, note);
  } else {
    root.append(far, kicker, rail, tagline, chips, play, note);
  }

  let current = -1;
  let noteTimer = 0;

  const apply = (index: number): void => {
    if (index === current) return;
    current = index;
    const mode = modes[index]!;
    items.forEach((item, i) => {
      item.setAttribute('aria-selected', String(i === index));
      item.classList.toggle('is-active', i === index);
    });
    tagline.textContent = mode.tagline;
    chips.replaceChildren(...(mode.playable
      ? mode.stats.map((s) => el('span', 'gm-chip', `${s.label} ${s.value}`))
      : []));
    play.textContent = mode.playable ? `Play ${mode.label}` : 'Coming soon';
    play.disabled = !mode.playable;
    note.textContent = '';
    if (options.detailArt) detailArt.replaceChildren(createModeArt(mode));
    rail.setAttribute('aria-activedescendant', items[index]!.id);
  };

  const nearestIndex = (): number => {
    const centre = rail.scrollLeft + rail.clientWidth / 2;
    let best = 0;
    let bestDistance = Infinity;
    items.forEach((item, i) => {
      const distance = Math.abs(item.offsetLeft + item.offsetWidth / 2 - centre);
      if (distance < bestDistance) { bestDistance = distance; best = i; }
    });
    return best;
  };

  const measure = (): void => {
    const first = items[0]!;
    // Edge room in whole px (cqw padding on a max-content box sizes differently in WebKit): the first and last item can centre.
    const margin = Number.parseFloat(getComputedStyle(first).marginLeft) || 0;
    track.style.setProperty('--gm-pad', `${Math.max(0, (rail.clientWidth - first.offsetWidth) / 2 - margin).toFixed(1)}px`);
    const centre = rail.scrollLeft + rail.clientWidth / 2;
    let best = 0;
    let bestDistance = Infinity;
    items.forEach((item, i) => {
      const width = item.offsetWidth || 1;
      const d = (item.offsetLeft + width / 2 - centre) / width;
      item.style.setProperty('--d', d.toFixed(3));
      item.style.setProperty('--ad', Math.min(2, Math.abs(d)).toFixed(3));
      if (Math.abs(d) < bestDistance) { bestDistance = Math.abs(d); best = i; }
    });
    root.style.setProperty('--gm-scroll', rail.scrollLeft.toFixed(1));
    apply(best);
  };

  let frame = 0;
  rail.addEventListener('scroll', () => {
    if (frame) return;
    frame = window.requestAnimationFrame(() => { frame = 0; measure(); });
  }, { passive: true });

  const scrollToIndex = (index: number, smooth = true): void => {
    const item = items[Math.max(0, Math.min(items.length - 1, index))]!;
    const left = item.offsetLeft + item.offsetWidth / 2 - rail.clientWidth / 2;
    rail.scrollTo({ left, behavior: smooth ? 'smooth' : 'auto' });
  };

  // Mouse drag (touch and pen already scroll natively). A drag past 4 px cancels the click that would follow it.
  let drag: { x: number; left: number; moved: boolean } | null = null;
  rail.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    drag = { x: event.clientX, left: rail.scrollLeft, moved: false };
  });
  window.addEventListener('pointermove', (event) => {
    if (!drag) return;
    const dx = event.clientX - drag.x;
    if (!drag.moved && Math.abs(dx) > 4) {
      drag.moved = true;
      rail.classList.add('is-dragging');
    }
    if (drag.moved) rail.scrollLeft = drag.left - dx;
  });
  const endDrag = (): void => {
    if (!drag) return;
    const moved = drag.moved;
    drag = null;
    if (moved) {
      // Keep is-dragging through the click that follows the release, then re-enable snap and settle.
      window.setTimeout(() => { rail.classList.remove('is-dragging'); scrollToIndex(nearestIndex()); }, 0);
    }
  };
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);
  rail.addEventListener('click', (event) => {
    if (rail.classList.contains('is-dragging')) return;
    const hit = (event.target as HTMLElement).closest<HTMLElement>('.gm-item');
    if (hit) scrollToIndex(Number(hit.dataset.index));
  });
  rail.addEventListener('dragstart', (event) => event.preventDefault());
  rail.addEventListener('wheel', (event) => {
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    event.preventDefault();
    rail.scrollLeft += event.deltaY;
  }, { passive: false });
  rail.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowRight') { event.preventDefault(); scrollToIndex(current + 1); }
    else if (event.key === 'ArrowLeft') { event.preventDefault(); scrollToIndex(current - 1); }
    else if (event.key === 'Home') { event.preventDefault(); scrollToIndex(0); }
    else if (event.key === 'End') { event.preventDefault(); scrollToIndex(items.length - 1); }
  });

  play.addEventListener('click', () => {
    note.textContent = `Demo only: this would start ${modes[current]!.label}.`;
    window.clearTimeout(noteTimer);
    noteTimer = window.setTimeout(() => { note.textContent = ''; }, 2200);
  });

  window.addEventListener('resize', measure);
  window.requestAnimationFrame(measure);
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => measure()).observe(rail);

  return { root, rail, select: (i) => scrollToIndex(i, false), index: () => current };
};
