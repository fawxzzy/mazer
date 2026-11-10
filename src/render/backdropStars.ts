/**
 * Which backdrop stars the play/menu backdrop draws. Pure policy, no drawing (MenuScene.drawBackdrop paints).
 *
 * History: the backdrop used to draw its nearest, biggest stars as coloured four-point sparkles (green, orange,
 * purple, blue, red crosses) and every other star as a small round dot. Owner feedback, 2026-11-10, looking at the
 * live phone board: "no more stagnant stars in the background". Those coloured crosses read as fixed decorations
 * behind the maze (and with Animated Background on "Still" or the OS reduced-motion preference on, every star was a
 * frozen dot at one alpha), so they looked like pretend stars.
 *
 * Now:
 *  - the coloured four-point sparkles are gone for good (any star that would have been one is simply not drawn);
 *  - the remaining stars are the small round, warp-drifting, twinkling dots, and they are drawn ONLY while the
 *    backdrop is actually animating. With motion off (Animated Background on "Still", or reduced motion) none is
 *    drawn: a frozen dot is exactly the "stagnant star" this removes, and the dark space background, the shards and
 *    the edge diamonds carry the look by themselves.
 */

/** A star whose rounded core is at least this many px wide used to be drawn as a coloured sparkle. */
export const RETIRED_BACKDROP_SPARKLE_CORE_PX = 3;

export type BackdropStarDraw = 'none' | 'dot';

/** What to draw for one backdrop star: `coreSize` is its rounded core width in px. */
export const resolveBackdropStarDraw = (coreSize: number, motionEnabled: boolean): BackdropStarDraw => {
  if (!motionEnabled) {
    return 'none';
  }
  return coreSize >= RETIRED_BACKDROP_SPARKLE_CORE_PX ? 'none' : 'dot';
};
