/**
 * Whole-pixel placement for canvas-backed images, so Phaser's `roundPixels` cannot move them.
 *
 * Mazer runs Phaser with `roundPixels: true` (text and controls stay crisp; see docs/research/
 * MAZER_PIXEL_ART_VISUAL_LANGUAGE.md). The canvas renderer then draws every Image at `Math.floor(image.x)` /
 * `Math.floor(image.y)` css px (node_modules/phaser/src/renderer/canvas/CanvasRenderer.js, batchSprite), while a
 * Graphics path (the player, the end markers, the goal beacon, the dock pulse) is drawn exactly where it is told.
 * An image placed at a fractional css position is therefore drawn up to ONE css px up and to the left of where its
 * own bookkeeping says it is. Two consequences, both measured on a 412 x 915 css px, devicePixelRatio 2.625 phone
 * viewport:
 *  - the end star and the start arrow (Graphics) sat 2 device px off the corridor's centre line (the baked board is
 *    an Image), the "star is not centred" report;
 *  - the trail and the player's glow (Images whose bounds follow the moving head, so their fractional position
 *    changes every frame) jumped by a whole css px each time the position crossed an integer: the trail "shakes" or
 *    "vibrates" beside the player and the board while the player moves.
 *
 * The fix is to never hand Phaser a fractional position: floor the bounds' origin to a whole css px ourselves and grow
 * the size by the fraction, so the drawing inside the canvas (which is relative to that origin) stays exactly where it
 * was meant to be and the floor Phaser applies afterwards is a no-op.
 */
export interface OriginSettable {
  setOrigin: (x: number, y?: number) => unknown;
}

/**
 * Phaser's Camera.preRender places the camera at `Math.floor(x + width * originX + 0.5)` and then translates back by
 * `width * originX`: with the default origin 0.5 and an ODD game width (or height) that leaves a constant +0.5 css px
 * in the camera matrix. A Graphics path is drawn with that +0.5; an Image is drawn with it rounded UP to +1
 * (`camera.renderRoundPixels`), so on an odd-width phone (375, 393, 411 ... css px) every Image (the baked board, the
 * trail) sat half a css px to the right of and below every Graphics (the player, the end markers, the beacon): the
 * "star is not centred" report. The scene never zooms or rotates the camera (the board zoom is a container scale), so
 * the camera's pivot is irrelevant; putting it at the top-left makes the offset exactly 0 at every size.
 */
export const alignCameraToWholePixels = (camera: OriginSettable): void => {
  camera.setOrigin(0, 0);
};

export interface PixelBounds {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** The smallest bounds with a whole-pixel origin and size that contain `bounds`. */
export const alignBoundsToWholePixels = (bounds: PixelBounds): PixelBounds => {
  const left = Math.floor(bounds.left);
  const top = Math.floor(bounds.top);
  return {
    left,
    top,
    width: Math.max(1, Math.ceil(bounds.left + bounds.width) - left),
    height: Math.max(1, Math.ceil(bounds.top + bounds.height) - top)
  };
};

/**
 * A whole-css-px Image position for a position that is a device-snapped value within half a device pixel of a whole
 * number (the board image: whole-px board origin minus a whole-px bake margin, device-snapped). It ROUNDS, it does not
 * floor: flooring a value like 7.909 (the snap landed a hair under 8) would move the board a whole css px, which is
 * exactly the misalignment this module removes. Phaser's own floor is then a no-op.
 */
export const toWholeImagePosition = (value: number): number => Math.round(value);
