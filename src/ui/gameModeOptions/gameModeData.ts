/**
 * Sample modes for the game-mode selector options page (dev/proposal only). Endless is the one real registered mode
 * (src/legacy-runtime/legacyGameModes.ts); Hazards is the reserved slot; Sprint and Daily are PLACEHOLDER names so the
 * scroll has something to scroll to. The level is labelled sample data on the page.
 */
export type ModeArtCell = 'S' | 'E' | 't' | '.' | '#' | 'g' | 'x';

export interface GameModeSample {
  readonly id: string;
  readonly label: string;
  readonly tagline: string;
  readonly playable: boolean;
  readonly stats: readonly { readonly label: string; readonly value: string }[];
  /** A small maze drawn as Chip tiles: S start, E end, t trail, . corridor, # wall, g gate, x hazard. */
  readonly art: readonly string[];
}

export const GAME_MODE_SAMPLES: readonly GameModeSample[] = Object.freeze([
  {
    id: 'endless',
    label: 'Endless',
    tagline: 'Every level harder than the last',
    playable: true,
    stats: [{ label: 'Level', value: '37' }],
    art: ['Sttttt#', '#####t#', 'Ettttt#', '#.#####', '#......']
  },
  {
    id: 'hazards',
    label: 'Hazards',
    tagline: 'Obstacles and enemies in the corridors',
    playable: false,
    stats: [],
    art: ['S.g....', '#.#.##.', '#...x..', '#.####.', '#E.....']
  },
  {
    id: 'sprint',
    label: 'Sprint',
    tagline: 'Beat the clock on short mazes',
    playable: false,
    stats: [],
    art: ['#######', 'S.....E', '#######', '#.#.#.#', '#######']
  },
  {
    id: 'daily',
    label: 'Daily',
    tagline: 'One new maze every day',
    playable: false,
    stats: [],
    art: ['S.#...E', '#.#.#.#', '#...#..', '#.###.#', '#.....#']
  }
]);
