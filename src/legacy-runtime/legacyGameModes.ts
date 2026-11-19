/**
 * Game mode registry (lane L11, "Game modes shell"). Contract:
 * docs/architecture/MAZER-GAME-MODES-PRODUCT-CONTRACT.md.
 *
 * A game mode is a named way to play with its own rules and its own leaderboard tab.
 * Today there is exactly one, `endless`: the current game (generated ladder, no upper level
 * limit, every account level, rank and leaderboard standing preserved). This module is the single
 * place a mode becomes real: the leaderboard tabs, the score-to-mode mapping and the "unknown
 * becomes Endless" fallback all read the registry, nothing else lists modes.
 *
 * Reserved slots are documentation only. `hazards` (obstacles and enemies, kept OUT of Endless by
 * the owner decision of 2026-11-19) is named so the future mode has a place to land, but it is not
 * in `LEGACY_GAME_MODES`, cannot be resolved, has no tab, no route, no flag and no code. Building
 * it is its own card; moving it from `LEGACY_RESERVED_GAME_MODE_SLOTS` into the registry is the
 * deliberate source change that makes it reachable.
 *
 * Pure: no Phaser, no DOM, no storage, no network.
 */

/** Every mode id that is registered and playable. Grows only when a mode ships. */
export type LegacyGameModeId = 'endless';

export interface LegacyGameMode {
  readonly id: LegacyGameModeId;
  /** Player-facing name (leaderboard tab label). */
  readonly label: string;
  /** What the mode's score is, in plain words (contract section 3). */
  readonly scoreMeaning: string;
  /** Always true for a registered mode; reserved slots are not registered. */
  readonly playable: true;
}

export const LEGACY_GAME_MODES: readonly LegacyGameMode[] = Object.freeze([
  Object.freeze({
    id: 'endless',
    label: 'Endless',
    playable: true,
    scoreMeaning: 'Highest level reached on the generated ladder.'
  } satisfies LegacyGameMode)
]);

/** The mode every unknown, missing or legacy value maps to. */
export const LEGACY_DEFAULT_GAME_MODE_ID: LegacyGameModeId = 'endless';

export interface LegacyReservedGameModeSlot {
  /** Working name only; not a registered id and never resolvable. */
  readonly slot: string;
  readonly status: 'reserved';
  readonly note: string;
}

/**
 * Future modes that have a documented place and nothing else. Not playable, not listed in any
 * tab, not accepted by `isLegacyGameModeId`.
 */
export const LEGACY_RESERVED_GAME_MODE_SLOTS: readonly LegacyReservedGameModeSlot[] = Object.freeze([
  Object.freeze({
    note: 'Obstacles and enemies. Stay out of Endless; a separate mode with its own ladder and leaderboard tab. Nothing is built.',
    slot: 'hazards',
    status: 'reserved'
  } satisfies LegacyReservedGameModeSlot)
]);

const REGISTERED_IDS: ReadonlySet<string> = new Set(LEGACY_GAME_MODES.map((mode) => mode.id));

export const isLegacyGameModeId = (value: unknown): value is LegacyGameModeId => (
  typeof value === 'string' && REGISTERED_IDS.has(value)
);

/** The registered mode for an id; anything else (null, unknown, a reserved slot) is Endless. */
export const resolveLegacyGameMode = (value: unknown): LegacyGameMode => (
  LEGACY_GAME_MODES.find((mode) => mode.id === value)
  ?? LEGACY_GAME_MODES.find((mode) => mode.id === LEGACY_DEFAULT_GAME_MODE_ID)
  ?? LEGACY_GAME_MODES[0]!
);

/**
 * The mode a stored score belongs to. A row with no `mode` (every row that exists today, and any
 * response from a database where the proposed `mode` column is not applied yet) is Endless, so the
 * client behaves the same before and after the column exists.
 */
export const resolveLegacyScoreMode = (rawMode: unknown): LegacyGameModeId => (
  resolveLegacyGameMode(typeof rawMode === 'string' ? rawMode.trim().toLowerCase() : rawMode).id
);
