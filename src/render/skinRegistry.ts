/**
 * Player and trail skins: which look the board draws, and the catalogue of looks that exist.
 *
 * L7 (owner picks 2026-11-19): the player is SPARK (a faceted kite that points where it travels and carries the trail's
 * shifting colour) and the trail is STAR DUST (tiny four-point sparkles in today's trail colours). Those two are the
 * defaults and, for now, the only selectable skins.
 *
 * The other designs from the owner's options page are registered here as data so a future customisation shop can offer
 * them, but they are `selectable: false` and have no draw code in the app yet: `resolvePlayerSkin` / `resolveTrailSkin`
 * never return them, whatever id is asked for. "chip" (the rounded green block) and "neon-tube" (the continuous glowing
 * line) are the looks the game had before L7; their draw code still exists (playerMarker.ts, trailLayersCanvas.ts), so
 * they are marked `built: true` and could be made selectable without new art.
 *
 * Pure data and two lookups: no Phaser, no DOM, no storage. There is no setting or shop yet, so nothing persists a pick.
 */

export type PlayerPingShape =
  | 'rounded-square'
  | 'kite'
  | 'circle'
  | 'five-star'
  | 'dashed-rounded-square'
  | 'arrow'
  | 'scallop'
  | 'bubbles'
  | 'sonar-arcs'
  | 'saucer'
  | 'ember-dashes'
  | 'toothed-ring'
  | 'pixel-ring'
  | 'tilted-orbit'
  | 'hexagon';

export interface SkinEntry<Id extends string> {
  readonly id: Id;
  /** Name as shown on the owner's options page (and, later, in a shop). */
  readonly name: string;
  readonly description: string;
  /** True when the app can draw it today. */
  readonly built: boolean;
  /** True when a player may pick it. Only built skins can be selectable; today only the defaults are. */
  readonly selectable: boolean;
}

export interface PlayerSkinEntry extends SkinEntry<PlayerSkinId> {
  /** Shape of the find-me ping rings for this character. */
  readonly ping: PlayerPingShape;
  /** True when the character turns to face the direction of travel. */
  readonly facesTravel: boolean;
}

export type PlayerSkinId =
  | 'spark'
  | 'chip'
  | 'comet'
  | 'pilot-star'
  | 'chip-with-eye'
  | 'iris'
  | 'arrowhead'
  | 'ghost'
  | 'fish'
  | 'bat'
  | 'ufo'
  | 'wisp-flame'
  | 'cog'
  | 'invader'
  | 'ringed-planet'
  | 'snowflake';

export type TrailSkinId =
  | 'star-dust'
  | 'neon-tube'
  | 'chip-beads'
  | 'chevron-flow'
  | 'printed-line'
  | 'ember-sparks'
  | 'double-helix'
  | 'tapered-comet'
  | 'marching-dashes';

export const DEFAULT_PLAYER_SKIN: PlayerSkinId = 'spark';
export const DEFAULT_TRAIL_SKIN: TrailSkinId = 'star-dust';

const player = (
  id: PlayerSkinId,
  name: string,
  description: string,
  ping: PlayerPingShape,
  facesTravel: boolean,
  built = false
): PlayerSkinEntry => Object.freeze({
  id,
  name,
  description,
  ping,
  facesTravel,
  built,
  selectable: id === DEFAULT_PLAYER_SKIN
});

const trail = (id: TrailSkinId, name: string, description: string, built = false): SkinEntry<TrailSkinId> => (
  Object.freeze({ id, name, description, built, selectable: id === DEFAULT_TRAIL_SKIN })
);

export const PLAYER_SKINS: readonly PlayerSkinEntry[] = Object.freeze([
  player('spark', 'Spark', 'Faceted kite that points where you go and turns with you, in the trail\'s shifting colour. Ping is a kite-shaped ring.', 'kite', true, true),
  player('chip', 'Chip', 'The look before L7: a green rounded block inside a bright ring. Ping is a rounded square.', 'rounded-square', false, true),
  player('comet', 'Comet', 'Glowing orb that drags a tail behind it, so the tail swings round when you turn. Ping is a round ripple.', 'circle', true),
  player('pilot-star', 'Pilot star', 'Small five-point star that spins as it travels. Ping is a star.', 'five-star', false),
  player('chip-with-eye', 'Chip with eye', 'Rounded square whose eye looks where you are heading. Ping is a dashed rounded square.', 'dashed-rounded-square', true),
  player('iris', 'Iris', 'A ring whose pupil slides to the direction of travel. Ping is soft concentric circles.', 'circle', true),
  player('arrowhead', 'Arrowhead', 'Points along the move and swings round on turns. Ping is an arrow-shaped ripple.', 'arrow', true),
  player('ghost', 'Ghost', 'Friendly ghost with a wavy hem; eyes look the way you move. Ping is a wavy scalloped ring.', 'scallop', true),
  player('fish', 'Fish', 'Swims head-first with a wagging tail; never upside down. Ping is a ring of bubbles.', 'bubbles', true),
  player('bat', 'Bat', 'Flaps its wings the whole way, little red eyes follow the move. Ping is sonar: curved arcs.', 'sonar-arcs', true),
  player('ufo', 'UFO', 'Dome and disc with chasing lights; tips toward the way you slide. Ping is a flat saucer ripple.', 'saucer', true),
  player('wisp-flame', 'Wisp flame', 'A small flame that streams behind you and flickers. Ping is an ember burst of short dashes.', 'ember-dashes', true),
  player('cog', 'Cog', 'A turning gear. Ping is a chunky toothed ring.', 'toothed-ring', false),
  player('invader', 'Invader', 'Little pixel alien that wiggles its legs. Ping is a ring of chunky square pixels.', 'pixel-ring', false),
  player('ringed-planet', 'Ringed planet', 'A small planet with a ring that tilts as you turn. Ping is a tilted orbit ripple.', 'tilted-orbit', true),
  player('snowflake', 'Snowflake', 'Six-arm crystal drifting round as it goes. Ping is a six-sided ice ring.', 'hexagon', false)
]);

export const TRAIL_SKINS: readonly SkinEntry<TrailSkinId>[] = Object.freeze([
  trail('star-dust', 'Star dust', 'Tiny four-point sparkles in the trail colours, twinkling along the route.', true),
  trail('neon-tube', 'Neon tube', 'The look before L7: a continuous glowing line with a soft bloom, dark underlay and crisp core.', true),
  trail('chip-beads', 'Chip beads', 'A chain of little rounded-square chips, the same shape as the old player, shrinking with age.'),
  trail('chevron-flow', 'Chevron flow', 'Small arrowheads in a row pointing where you are going.'),
  trail('printed-line', 'Printed line', 'A thin flat line with a dark keyline and bright nodes, like it is printed on the floor.'),
  trail('ember-sparks', 'Ember sparks', 'A drift of tiny glowing sparks that scatter and twinkle off the path behind you.'),
  trail('double-helix', 'Double helix', 'Two thin strands winding around each other with faint rungs.'),
  trail('tapered-comet', 'Tapered comet', 'A fat bright head that narrows to a fine point, with a soft bloom.'),
  trail('marching-dashes', 'Marching dashes', 'A dashed fuse on a dark rail, with the dashes marching toward the player.')
]);

const findSelectable = <E extends SkinEntry<string>>(
  skins: readonly E[],
  id: string | null | undefined,
  fallback: E['id']
): E => {
  const match = id ? skins.find((skin) => skin.id === id) : undefined;
  if (match && match.selectable && match.built) {
    return match;
  }
  return skins.find((skin) => skin.id === fallback)!;
};

/** The player skin to draw for a requested id: the request when it is selectable, else the default (Spark). */
export const resolvePlayerSkin = (id?: string | null): PlayerSkinEntry => findSelectable(PLAYER_SKINS, id, DEFAULT_PLAYER_SKIN);

/** The trail skin to draw for a requested id: the request when it is selectable, else the default (Star dust). */
export const resolveTrailSkin = (id?: string | null): SkinEntry<TrailSkinId> => findSelectable(TRAIL_SKINS, id, DEFAULT_TRAIL_SKIN);
