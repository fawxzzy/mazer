/**
 * The Phaser side of the Halo ring controller (MAZER-CTRL-006; the numbers and maths are in controllerHaloLook.ts).
 *
 * Draw cost: every shape is baked ONCE into a small canvas texture at the canvas resolution (ring, lit arc, nub with
 * glow, flat nub for reduced motion, dashed leash arc). A frame only sets position, rotation, alpha and visibility on
 * at most four Images; nothing is cleared or re-stroked per frame. The leash arc is re-baked only when the leash length
 * itself changes (a display change), never while dragging.
 *
 * Images sit at whole css px (Phaser's roundPixels floors Image positions; see pixelAlignment.ts) and each bake box
 * is an even css size with the anchor on a whole css px, so the floor is a no-op and the ring is never half a pixel
 * off the thumb's anchor. The view takes no input.
 */
import type Phaser from 'phaser';
import {
  createControllerHaloState,
  drawControllerHaloLeashArc,
  drawControllerHaloLitArc,
  drawControllerHaloNub,
  drawControllerHaloRing,
  resolveControllerHaloFrame,
  resolveControllerHaloLeashBox,
  resolveControllerHaloNubBox,
  resolveControllerHaloRingBox,
  type ControllerHaloBakeBox,
  type ControllerHaloCanvasContext,
  type ControllerHaloFrame,
  type ControllerHaloFrameInput,
  type ControllerHaloState
} from './controllerHaloLook';

export const CONTROLLER_HALO_TEXTURE_KEYS = Object.freeze({
  ring: 'mazer-controller-halo-ring',
  lit: 'mazer-controller-halo-lit',
  nubGlow: 'mazer-controller-halo-nub-glow',
  nubFlat: 'mazer-controller-halo-nub-flat',
  leash: 'mazer-controller-halo-leash'
});

type HaloImage = Phaser.GameObjects.Image;

/** The default 56 px leash (legacyFloatingAnchor.ts); the first bake before any touch-down has reported the display's real leash. */
const DEFAULT_LEASH_BAKE_PX = 56;

export class ControllerHaloView {
  private readonly state: ControllerHaloState = createControllerHaloState();
  private readonly ringBox = resolveControllerHaloRingBox();
  private readonly nubBox = resolveControllerHaloNubBox();
  private bakedLeashPx: number | null = null;
  private bakedResolution = 0;
  private ring: HaloImage | null = null;
  private lit: HaloImage | null = null;
  private nub: HaloImage | null = null;
  private leash: HaloImage | null = null;
  private lastFrame: ControllerHaloFrame | null = null;
  private nubGlowShown = true;

  /**
   * Bakes and adds the Images now, so they take their place in the display list right where the caller constructs
   * the view (the scene does it right after its HUD graphics: over the board, under menus and toasts).
   */
  constructor(private readonly scene: Phaser.Scene, private readonly resolveResolution: () => number) {
    this.ensureBakes(null);
    scene.events?.once?.('shutdown', () => this.destroy());
  }

  /** The last frame shown (diagnostics: lit sector name, alpha). */
  get frame(): ControllerHaloFrame | null {
    return this.lastFrame;
  }

  /** True while a fade-out is still on screen (the caller keeps redrawing until it ends). */
  get fading(): boolean {
    return this.state.anchor !== null && this.state.alpha > 0;
  }

  update(input: ControllerHaloFrameInput): ControllerHaloFrame {
    const frame = resolveControllerHaloFrame(input, this.state);
    this.lastFrame = frame;
    if (!frame.visible) {
      this.setVisible(false);
      return frame;
    }
    this.ensureBakes(input.leashPx);
    const x = frame.anchorX;
    const y = frame.anchorY;
    this.ring?.setPosition(x, y).setAlpha(frame.ringAlpha).setVisible(true);
    if (this.lit) {
      this.lit.setPosition(x, y).setRotation(frame.litRotationRad).setAlpha(frame.litAlpha).setVisible(frame.litAlpha > 0);
    }
    if (this.nub) {
      if (frame.nubGlow !== this.nubGlowShown) {
        // Only when Reduce Motion flips: the two nub bakes share one box.
        this.nubGlowShown = frame.nubGlow;
        this.nub
          .setTexture(frame.nubGlow ? CONTROLLER_HALO_TEXTURE_KEYS.nubGlow : CONTROLLER_HALO_TEXTURE_KEYS.nubFlat)
          .setDisplaySize(this.nubBox.widthCss, this.nubBox.heightCss);
      }
      this.nub
        .setPosition(frame.nubX, frame.nubY)
        .setAlpha(frame.nubAlpha)
        .setVisible(true);
    }
    if (this.leash) {
      this.leash
        .setPosition(x, y)
        .setRotation(frame.leashRotationRad)
        .setAlpha(frame.leashAlpha)
        .setVisible(frame.leashAlpha > 0.005);
    }
    return frame;
  }

  /** Hide at once and forget the anchor (overlay opened, mode left play). */
  hide(): void {
    this.state.alpha = 0;
    this.state.anchor = null;
    this.state.finger = null;
    this.state.sector = null;
    this.state.lastMs = null;
    this.lastFrame = null;
    this.setVisible(false);
  }

  destroy(): void {
    for (const image of [this.ring, this.lit, this.nub, this.leash]) {
      image?.destroy();
    }
    this.ring = null;
    this.lit = null;
    this.nub = null;
    this.leash = null;
  }

  private setVisible(visible: boolean): void {
    this.ring?.setVisible(visible);
    this.lit?.setVisible(visible);
    this.nub?.setVisible(visible);
    this.leash?.setVisible(visible);
  }

  private ensureBakes(leashPx: number | null): void {
    const resolution = Math.max(1, this.resolveResolution());
    const leash = leashPx !== null && leashPx > 0 ? Math.round(leashPx) : null;
    if (resolution !== this.bakedResolution) {
      this.bakedResolution = resolution;
      // Creation order is draw order: leash cue under the ring, the lit arc over it, the nub on top.
      this.bakeLeash(leash ?? this.bakedLeashPx ?? DEFAULT_LEASH_BAKE_PX);
      this.bake(CONTROLLER_HALO_TEXTURE_KEYS.ring, this.ringBox, (ctx) => drawControllerHaloRing(ctx, this.ringBox));
      this.bake(CONTROLLER_HALO_TEXTURE_KEYS.lit, this.ringBox, (ctx) => drawControllerHaloLitArc(ctx, this.ringBox));
      this.bake(CONTROLLER_HALO_TEXTURE_KEYS.nubGlow, this.nubBox, (ctx) => drawControllerHaloNub(ctx, this.nubBox, true, resolution));
      this.bake(CONTROLLER_HALO_TEXTURE_KEYS.nubFlat, this.nubBox, (ctx) => drawControllerHaloNub(ctx, this.nubBox, false, resolution));
      this.ring = this.ensureImage(this.ring, CONTROLLER_HALO_TEXTURE_KEYS.ring, this.ringBox);
      this.lit = this.ensureImage(this.lit, CONTROLLER_HALO_TEXTURE_KEYS.lit, this.ringBox);
      this.nub = this.ensureImage(this.nub, CONTROLLER_HALO_TEXTURE_KEYS.nubGlow, this.nubBox);
      this.nubGlowShown = true;
    }
    if (leash !== null && leash !== this.bakedLeashPx) {
      this.bakeLeash(leash);
    }
  }

  /** Re-bakes the dashed leash arc for a new leash length (touch-down on a new display only, never per frame). */
  private bakeLeash(leash: number): void {
    this.bakedLeashPx = leash;
    const box = resolveControllerHaloLeashBox(leash);
    this.bake(CONTROLLER_HALO_TEXTURE_KEYS.leash, box, (ctx) => drawControllerHaloLeashArc(ctx, box, leash));
    this.leash = this.ensureImage(this.leash, CONTROLLER_HALO_TEXTURE_KEYS.leash, box);
  }

  private bake(key: string, box: ControllerHaloBakeBox, draw: (ctx: ControllerHaloCanvasContext) => void): void {
    const textures = this.scene.textures;
    const resolution = this.bakedResolution;
    const width = Math.max(1, Math.round(box.widthCss * resolution));
    const height = Math.max(1, Math.round(box.heightCss * resolution));
    if (textures.exists(key)) {
      textures.remove(key);
    }
    const texture = textures.createCanvas(key, width, height);
    const context = texture?.getContext();
    if (!texture || !context) {
      return;
    }
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, width, height);
    context.setTransform(width / box.widthCss, 0, 0, height / box.heightCss, 0, 0);
    draw(context as unknown as ControllerHaloCanvasContext);
    texture.refresh();
  }

  private ensureImage(image: HaloImage | null, key: string, box: ControllerHaloBakeBox): HaloImage {
    const next = image ?? this.scene.add.image(0, 0, key);
    next
      .setTexture(key)
      .setOrigin(box.originXCss / box.widthCss, box.originYCss / box.heightCss)
      .setDisplaySize(box.widthCss, box.heightCss)
      .setVisible(false);
    return next;
  }
}
