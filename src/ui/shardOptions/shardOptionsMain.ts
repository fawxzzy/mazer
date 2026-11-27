import './shardOptions.css';
import { createMazerButton } from '../dom/MazerButton';
import { createStatusBanner } from '../dom/StatusBanner';
import {
  bootOptionsPage,
  createBoard,
  createIconCanvas,
  createIntro,
  createNav,
  createSection,
  el,
  type BoardHandle,
  type OptionSpec,
  type SectionSpec
} from '../optionsPages/optionsKit';
import { SHARD_SAMPLE_LEVELS, pipModel, shardFactAt, shardStateOf } from '../optionsPages/optionsGeometry';
import { advanceShardProgress, isStarUnlocked } from '../../mazer-core/hazards/shards';

/**
 * Options page for endless shards (dev/proposal only; not in vite.config build.rollupOptions.input).
 * A shard is a pickup the player collects, strictly in order, to unlock a locked end star. Five options each for: the
 * shard look, the HUD counter, the locked/unlocked end star, the unlock moment and the first-time hint. Real DOM from the
 * shipping tokens, fonts, kit components and the game's own icon painter; the board is a DOM Starlit Bevel mini board
 * (the real board is a Phaser canvas). Nothing here is imported by the game (pinned by a test).
 *
 * Query: theme=default|dark (default: default), only=look|counter|star|moment|hint (show one section).
 */
const { theme, only } = bootOptionsPage();

const TOTAL = 3;
/** Cell ids of the sample shards in collection order; the real progress rule takes them (shards count only in order). */
const SHARD_IDS: readonly number[] = [10, 20, 30];
const BASE_ROWS: readonly string[] = [
  '#########',
  '#S..2...#',
  '#.#####.#',
  '#.1...#.#',
  '#.###.#.#',
  '#...3...#',
  '####E####'
];
const CELL = 32;

type Look = 'gem' | 'hex' | 'splinter' | 'tile' | 'prism';

/** The sample board for `collected` shards taken: taken shards are gone, Spark sits where the last one was. */
const sampleBoard = (collected: number, look: Look, cellPx = CELL): BoardHandle => {
  const rows = BASE_ROWS.map((row) => [...row]);
  const pos = new Map<number, [number, number]>();
  rows.forEach((row, r) => row.forEach((ch, c) => { if (/[1-9]/.test(ch)) pos.set(Number(ch), [r, c]); }));
  if (collected >= 1) { rows[2]![1] = 't'; rows[3]![1] = 't'; }
  pos.forEach(([r, c], n) => { if (n <= collected) rows[r]![c] = '.'; });
  const at = pos.get(collected);
  if (at) rows[at[0]]![at[1]] = 'P';
  const board = createBoard(rows.map((row) => row.join('')), cellPx);
  board.root.querySelectorAll<HTMLElement>('[data-shard]').forEach((cell) => {
    const n = Number(cell.dataset.shard);
    cell.append(shardNode(look, n, shardStateOf(n - 1, collected)));
  });
  return board;
};

const shardNode = (look: Look, n: number, state: 'collected' | 'next' | 'later'): HTMLElement => {
  const wrap = el('span', `sh-wrap sh-${state}`);
  const body = el('b', `sh sh-${look}`);
  if (look === 'hex' || look === 'tile') body.textContent = String(n);
  wrap.append(body);
  return wrap;
};

const addEnd = (board: BoardHandle, lock: 'locked' | 'open', variant: string): void => {
  const end = board.endCell;
  if (!end) return;
  end.dataset.lock = lock;
  end.classList.add(`end-${variant}`);
  const star = el('b', 'oo-end');
  end.append(star);
};

const stage = (...children: HTMLElement[]): HTMLElement => {
  const node = el('div', 'oo-stage');
  node.append(...children);
  return node;
};

const caption = (text: string): HTMLElement => el('p', 'oo-kicker', text);

/** A little control row: step the collected count and replay. */
const stepper = (onChange: (collected: number) => void, start: number, label = 'Collect next shard'): { root: HTMLElement; set: (n: number) => void } => {
  let collected = start;
  const row = el('div', 'oo-controls');
  const status = el('span', 'sh-step-status');
  const button = createMazerButton({ label, tone: 'secondary', onPress: () => {
    collected = collected >= TOTAL ? 0 : advanceShardProgress(SHARD_IDS, SHARD_IDS[collected]!, collected);
    apply();
  } });
  const apply = (): void => {
    status.textContent = `${collected} of ${TOTAL} taken${isStarUnlocked(collected, TOTAL) ? ', star unlocked' : ''}`;
    button.textContent = collected >= TOTAL ? 'Start over' : label;
    onChange(collected);
  };
  row.append(button, status);
  apply();
  return { root: row, set: (n) => { collected = n; apply(); } };
};

// ------------------------------------------------------------------------------------------ 1. shard look

const lookOption = (id: string, name: string, blurb: string, look: Look, pick?: string): OptionSpec => ({
  id,
  name,
  blurb,
  ...(pick ? { pick: { why: pick } } : {}),
  build: () => {
    const board = sampleBoard(1, look);
    addEnd(board, 'locked', 'A');
    return stage(board.root, caption('Shard 1 taken, 2 is next, 3 waits'));
  }
});

const lookSection: SectionSpec = {
  id: 'look',
  title: '1. Shard look',
  intro: 'What a shard looks like on the board. Each one has to read as a pickup (not a wall, not the red end star, not the green start pinwheel, not the magenta gate, not the star dust trail), and the NEXT shard has to stand out because they only count in order. Taken shards are gone from the board.',
  options: [
    lookOption('A', 'A  Gem', 'A gold diamond with a lit facet. The next one breathes; later ones sit dimmer and still.', 'gem',
      'Gold is the reward colour in the tokens and nothing on the board uses it; a diamond cannot be mistaken for the star, the kite or the trail. No digits, so it scales to 35 shards.'),
    lookOption('B', 'B  Numbered crystal', 'A cyan hexagon with its order number inside. Reads the order instantly at 1 to 9 shards.', 'hex'),
    lookOption('C', 'C  Splinter', 'A thin violet shard, tilted like a broken fragment. Subtle; quiet on a busy board.', 'splinter'),
    lookOption('D', 'D  Tile chip', 'A raised mint chip with the order number, like a spare tile. Matches the tile family.', 'tile'),
    lookOption('E', 'E  Prism', 'A cyan triangle that leans toward the star. Directional but easy to confuse with the Spark kite.', 'prism')
  ]
};

// ------------------------------------------------------------------------------------------ 2. HUD counter

/** A phone-shaped frame: dark full-bleed screen, the board, the real menu icon top right, plus the counter. */
const phone = (board: BoardHandle): { root: HTMLElement; screen: HTMLElement } => {
  const screen = el('div', 'sh-phone');
  const menu = el('span', 'sh-menu');
  menu.append(createIconCanvas('menu', 22));
  screen.append(board.root, menu);
  return { root: stage(screen), screen };
};

const gemGlyph = (): HTMLElement => el('b', 'sh sh-gem sh-inline');

const counterOption = (
  id: string,
  name: string,
  blurb: string,
  mount: (screen: HTMLElement, collected: number) => void,
  pick?: string
): OptionSpec => ({
  id,
  name,
  blurb,
  ...(pick ? { pick: { why: pick } } : {}),
  build: () => {
    const holder = el('div', 'sh-demo');
    const render = (collected: number): void => {
      holder.querySelector('.sh-phone-host')?.remove();
      const board = sampleBoard(collected, 'gem');
      addEnd(board, isStarUnlocked(collected, TOTAL) ? 'open' : 'locked', 'plain');
      const frame = phone(board);
      frame.root.classList.add('sh-phone-host');
      mount(frame.screen, collected);
      holder.prepend(frame.root);
    };
    const control = stepper(render, 1);
    holder.append(control.root);
    return holder;
  }
});

const counterSection: SectionSpec = {
  id: 'counter',
  title: '2. HUD counter (collected out of needed)',
  intro: 'The real play screen is the full-bleed maze with just the menu icon top right, so the counter has to earn its space. Tap the button to take shards and see the counter change. Up to 35 shards late in endless: counters must still work there, so B and D collapse to a number past 8.',
  options: [
    counterOption('A', 'A  Corner chip', 'A small chip under the menu icon: a gem and 1 / 3. Always the same place; costs a corner.', (screen, collected) => {
      const chip = el('div', 'sh-chip');
      chip.append(gemGlyph(), el('span', undefined, `${collected} / ${TOTAL}`));
      screen.append(chip);
    }),
    counterOption('B', 'B  Pip rail', 'A row of pips along the bottom edge, one per shard, the next one lit. A number only when there are more than 8.', (screen, collected) => {
      const model = pipModel(TOTAL, collected, 8);
      const rail = el('div', 'sh-rail');
      model.pips?.forEach((state) => rail.append(el('i', `sh-pip sh-pip-${state}`)));
      if (!model.pips) rail.append(el('span', undefined, model.label));
      screen.append(rail);
    }),
    counterOption('C', 'C  Star ring', 'A ring around the locked star that fills one segment per shard. The count lives on the thing you are heading for, nothing extra on screen.', (screen, collected) => {
      const ring = el('i', 'sh-ring');
      ring.style.setProperty('--sh-fill', String(collected / TOTAL));
      ring.dataset.collected = String(collected);
      screen.querySelector('[data-lock]')?.append(ring);
    }, 'Zero new screen furniture: the count sits on the star, so the player already looks at it. It works at 35 shards as a smooth fill.'),
    counterOption('D', 'D  Edge thread', 'A thin line along the top edge that fills left to right, with the number at its end. Quiet and scales to any count.', (screen, collected) => {
      const thread = el('div', 'sh-thread');
      const fill = el('i');
      fill.style.setProperty('--sh-fill', String(collected / TOTAL));
      thread.append(fill, el('span', undefined, `${collected}/${TOTAL}`));
      screen.append(thread);
    }),
    counterOption('E', 'E  Gem tray', 'A tray at the bottom left that always shows the NEXT shard and how many are left: gem x 2.', (screen, collected) => {
      const left = TOTAL - collected;
      const tray = el('div', 'sh-tray');
      tray.append(gemGlyph(), el('span', undefined, left > 0 ? `x ${left} left` : 'Star open'));
      screen.append(tray);
    })
  ]
};

// ------------------------------------------------------------------------------------------ 3. locked vs unlocked star

const starOption = (id: string, name: string, blurb: string, variant: string, pick?: string): OptionSpec => ({
  id,
  name,
  blurb,
  ...(pick ? { pick: { why: pick } } : {}),
  build: () => {
    const holder = el('div', 'sh-demo');
    const pair = el('div', 'sh-pair');
    for (const lock of ['locked', 'open'] as const) {
      const close = createBoard(['#E#'], 54);
      addEnd(close, lock, variant);
      const figure = el('div', 'sh-fig');
      figure.append(close.root, el('span', 'oo-kicker', lock === 'open' ? 'Unlocked' : 'Locked'));
      pair.append(figure);
    }
    const board = sampleBoard(1, 'gem', 32);
    addEnd(board, 'locked', variant);
    holder.append(stage(pair), stage(board.root, caption('In play, one shard still missing')));
    return holder;
  }
});

const starSection: SectionSpec = {
  id: 'star',
  title: '3. Locked and unlocked end star',
  intro: 'The red 5-point end star spins when it is playable (shipped). While shards are missing it must clearly say "not yet" without turning into a different object. Flip Locked / Unlocked on each. Open question for you, not decided here: should the goal beacon still show while the star is locked?',
  options: [
    starOption('A', 'A  Caged star', 'Locked: the star is dimmed and held inside a ring cage. Unlocked: the cage drops away and the star spins.', 'A',
      'It keeps the star recognisable (same silhouette) and adds one obvious extra thing, the cage, that goes away. The cage reads as "locked" without any text or icon.'),
    starOption('B', 'B  Hollow star', 'Locked: only the outline of the star, not spinning. Unlocked: it fills red and spins.', 'B'),
    starOption('C', 'C  Shutter', 'Locked: two plates cover the star like a shutter. Unlocked: the plates slide apart.', 'C'),
    starOption('D', 'D  Veiled star', 'Locked: the star is dim, small and still. Unlocked: full size, full colour, spinning.', 'D'),
    starOption('E', 'E  Barred star', 'Locked: two bars cross the star. Unlocked: the bars slide out. Closest to a gate; may read as a hazard.', 'E')
  ]
};

// ------------------------------------------------------------------------------------------ 4. unlock moment

const momentOption = (id: string, name: string, blurb: string, variant: string, pick?: string): OptionSpec => ({
  id,
  name,
  blurb,
  ...(pick ? { pick: { why: pick } } : {}),
  build: () => {
    const holder = el('div', 'sh-demo');
    const host = el('div');
    const play = (): void => {
      const board = sampleBoard(TOTAL - 1, 'gem', 36);
      addEnd(board, 'locked', 'A');
      const wrap = stage(board.root);
      host.replaceChildren(wrap);
      const end = board.endCell;
      const player = board.root.querySelector<HTMLElement>('.oo-player')?.parentElement ?? null;
      const last = board.root.querySelector<HTMLElement>('[data-shard]');
      // Replay: after a short beat the last shard is taken and the moment runs.
      window.setTimeout(() => {
        const taken = last?.querySelector('.sh-wrap');
        taken?.remove();
        if (variant === 'A' && last) {
          for (let i = 0; i < 6; i += 1) {
            const spark = el('i', 'sh-spark');
            const angle = (Math.PI * 2 * i) / 6;
            spark.style.setProperty('--dx', `${Math.round(Math.cos(angle) * 22)}px`);
            spark.style.setProperty('--dy', `${Math.round(Math.sin(angle) * 22)}px`);
            last.append(spark);
          }
        }
        if (variant === 'C' && player && end) {
          const dx = end.offsetLeft - player.offsetLeft;
          const dy = end.offsetTop - player.offsetTop;
          for (let i = 0; i < 3; i += 1) {
            const fly = el('b', 'sh sh-gem sh-fly');
            fly.style.setProperty('--dx', `${dx}px`);
            fly.style.setProperty('--dy', `${dy}px`);
            fly.style.setProperty('--delay', `${i * 120}ms`);
            fly.style.left = `${player.offsetLeft + 9}px`;
            fly.style.top = `${player.offsetTop + 9}px`;
            fly.style.width = '18px';
            fly.style.height = '18px';
            board.root.append(fly);
          }
        }
        if (variant === 'E') wrap.prepend(createStatusBanner({ message: 'Star unlocked', tone: 'success' }));
        if (end) { end.dataset.lock = 'open'; end.dataset.moment = variant; }
      }, 700);
    };
    const row = el('div', 'oo-controls');
    row.append(createMazerButton({ label: 'Replay', tone: 'secondary', onPress: play }));
    holder.append(row, host);
    play();
    return holder;
  }
});

const momentSection: SectionSpec = {
  id: 'moment',
  title: '4. Unlock moment',
  intro: 'What happens the instant the last shard is taken. Press Replay. Under reduced motion every option collapses to D (the star just brightens), which is also the cheapest build.',
  options: [
    momentOption('A', 'A  Burst and wake', 'The last shard bursts into star dust and the star flashes once as it wakes and starts to spin.', 'A',
      'One short beat that uses vocabulary the game already has (star dust). Cheap, and it reads clearly as "something just opened".'),
    momentOption('B', 'B  Ripple', 'A ring ripples out from the star across the board. Large and clear; heavier on a small screen.', 'B'),
    momentOption('C', 'C  Gather', 'The shards you took stream from the player into the star. Tells the story but is the most code.', 'C'),
    momentOption('D', 'D  Quiet', 'No effect: the star simply brightens. Respects reduced motion by default; easy to miss.', 'D'),
    momentOption('E', 'E  Notice', 'The in-flow notice "Star unlocked" slides in above the board and the star brightens. Needs no animation of its own.', 'E')
  ]
};

// ------------------------------------------------------------------------------------------ 5. first-time hint

const hintOption = (id: string, name: string, blurb: string, build: (board: BoardHandle, host: HTMLElement) => void, needs: string, pick?: string): OptionSpec => ({
  id,
  name,
  blurb,
  needs,
  ...(pick ? { pick: { why: pick } } : {}),
  build: () => {
    const board = sampleBoard(0, 'gem');
    addEnd(board, 'locked', 'A');
    const host = el('div', 'sh-hint-host');
    host.append(board.root);
    build(board, host);
    return stage(host);
  }
});

const hintSection: SectionSpec = {
  id: 'hint',
  title: '5. First-time hint (the first shard level, L60)',
  intro: 'How a player learns what the shard and the locked star mean the first time they meet them. Errors and notices use the in-flow notice (createStatusBanner), never inline red text. Whichever is picked needs a Guide entry (legacyGuideContent.ts, pinned by tests/reset/legacy-guide-content-drift.test.ts).',
  options: [
    hintOption('A', 'A  Notice', 'The in-flow notice on level entry: "Take the shards in order to unlock the star." with a Got it action.', (_board, host) => {
      host.prepend(createStatusBanner({ message: 'Take the shards in order to unlock the star.', tone: 'info', actionLabel: 'Got it' }));
    }, 'one notice line on first L60 entry plus a "seen" flag in settings storage; add a Shards entry to the Guide.',
      'It reuses the notice the game already has, never covers the board, and the player can keep playing while it shows.'),
    hintOption('B', 'B  Coach mark', 'The first shard gets a pulsing dotted ring and a short caption above it. Only the first one; the next shard pulses on its own.', (board, host) => {
      const first = board.root.querySelector<HTMLElement>('[data-shard="1"]');
      first?.classList.add('sh-coach');
      const tag = el('span', 'sh-coach-tag', 'Take me first');
      first?.append(tag);
      host.dataset.hint = 'coach';
    }, 'a coach overlay tied to shard 1 and a seen flag; Guide entry.'),
    hintOption('C', 'C  Intro card', 'A small card over the board with an illustration and a Got it button. Blocks play until dismissed.', (_board, host) => {
      const card = el('div', 'sh-card');
      card.append(el('b', undefined, 'New: shards'), el('span', undefined, 'Take every shard, in order, to unlock the star.'), createMazerButton({ label: 'Got it', tone: 'primary' }));
      host.append(card);
    }, 'a modal card (new overlay surface), focus handling and a seen flag; Guide entry.'),
    hintOption('D', 'D  On first bump', 'Nothing up front. The first time the player reaches the locked star, the notice says "2 shards left. Take them in order."', (_board, host) => {
      host.prepend(createStatusBanner({ message: '2 shards left. Take them in order, then come back.', tone: 'info' }));
    }, 'a hook on arrival at a locked star, a seen flag; Guide entry.'),
    hintOption('E', 'E  Guide only', 'No in-game hint; the Guide explains shards. Cheapest, but players who never open the Guide may not learn it.', (_board, host) => {
      const guide = el('div', 'sh-card sh-guide');
      guide.append(el('b', undefined, 'Shards'), el('span', undefined, 'From level 60, a locked star opens only after you take every shard, in order.'));
      host.append(guide);
    }, 'only the Guide copy and icon in legacyGuideContent.ts.')
  ]
};

// ------------------------------------------------------------------------------------------ facts and mount

const factsTable = (): HTMLElement => {
  const table = el('table', 'oo-facts');
  const head = el('tr');
  ['Level', 'Shards', 'Route target (ticks)'].forEach((text) => head.append(el('th', undefined, text)));
  table.append(head);
  for (const level of SHARD_SAMPLE_LEVELS) {
    const fact = shardFactAt(level);
    const row = el('tr');
    [String(fact.level), String(fact.shards), fact.target === null ? 'a modest detour' : String(fact.target)].forEach((text) => row.append(el('td', undefined, text)));
    table.append(row);
  }
  return table;
};

const sections = [lookSection, counterSection, starSection, momentSection, hintSection];
const visible = only ? sections.filter((section) => section.id === only) : sections;

const wrap = el('main', 'oo-wrap');
wrap.append(
  createIntro('Endless shards: options', [
    'A locked end star opens only after the player collects shards, in order. They start at level 60 (one shard) and one more is added every 50 levels once the maze mix is full (level 288); after that only the route length to collect them grows: 160 + 2 x (level - 288) ticks. Pick one option per section. Nothing is wired into the game.',
    'Every option uses the shipped look: Starlit Bevel tiles, the Spark kite, the red end star, the green start pinwheel, the real menu icon from the game, and the in-flow notice. The play screen here is a DOM stand-in for the Phaser canvas.'
  ], theme, only),
  createNav(sections)
);
const facts = el('section', 'oo-section');
facts.append(el('h2', undefined, 'The numbers (from the game code)'), factsTable());
wrap.append(facts, ...visible.map(createSection));
document.getElementById('shard-options-root')?.append(wrap);
