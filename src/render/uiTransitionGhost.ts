/**
 * The thin Phaser side of uiTransition.ts (MAZER-MOTION-002): a full-screen, non-interactive snapshot of the frame
 * that was on screen when a transition began, faded out on top of the already-final live scene.
 *
 * Why a snapshot instead of animating the live objects: the menu and every overlay are rebuilt wholesale from state
 * (rebuildUi) and many pieces (button panels, glyph words, the baked board) are not reachable from one list, so the
 * only coherent way to ease them out without keeping stale objects alive is to copy the finished canvas once. The
 * copy is one drawImage per transition, at a pixel-budgeted size (uiTransition.ts), into a texture that is reused
 * while the canvas size is unchanged (no allocation per transition); while it fades the renderer composites one extra
 * image per frame and nothing in the scene is redrawn, retargeted or moved, so taps and drags act on the live scene
 * immediately.
 *
 * The image has no input handlers (a Phaser object only takes pointer events when made interactive), so it can
 * never swallow a tap. The image is hidden as soon as the fade ends; the texture is freed on scene shutdown.
 */
import type Phaser from 'phaser';
import {
  UI_TRANSITION_FRAME_EMA_INITIAL_MS,
  advanceUiTransitionFrameAverageMs,
  resolveUiTransitionFrame,
  resolveUiTransitionSnapshotSize,
  shouldSkipUiTransitionForFrameBudget,
  type UiTransitionPlan
} from './uiTransition';

export class UiTransitionGhost {
  private image: Phaser.GameObjects.Image | null = null;
  private plan: UiTransitionPlan | null = null;
  private startedAtMs = 0;
  private frameAverageMs = UI_TRANSITION_FRAME_EMA_INITIAL_MS;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly textureKey: string,
    private readonly depth: number
  ) {}

  get active(): boolean {
    return this.plan !== null;
  }

  /**
   * Copy the canvas as it is right now and start fading it. Returns false (and changes nothing) when there is
   * nothing to copy, so a caller never has to guard it.
   */
  begin(plan: UiTransitionPlan, nowMs: number): boolean {
    if (plan.durationMs <= 0 || shouldSkipUiTransitionForFrameBudget(this.frameAverageMs)) {
      return false;
    }
    const source = this.scene.game?.canvas as HTMLCanvasElement | undefined;
    if (!source || source.width <= 0 || source.height <= 0) {
      return false;
    }

    const size = resolveUiTransitionSnapshotSize(source.width, source.height);
    const textures = this.scene.textures;
    let texture = textures.exists(this.textureKey)
      ? textures.get(this.textureKey) as Phaser.Textures.CanvasTexture
      : null;
    const existing = texture?.getSourceImage() as HTMLCanvasElement | undefined;
    if (texture && existing && (existing.width !== size.width || existing.height !== size.height)) {
      this.release();
      texture = null;
    }
    if (!texture) {
      texture = textures.createCanvas(this.textureKey, size.width, size.height);
    }
    const context = texture?.getContext();
    if (!texture || !context) {
      return false;
    }
    context.clearRect(0, 0, size.width, size.height);
    context.drawImage(source, 0, 0, source.width, source.height, 0, 0, size.width, size.height);
    texture.refresh();

    if (!this.image) {
      this.image = this.scene.add.image(0, 0, this.textureKey).setOrigin(0, 0).setDepth(this.depth);
    }
    this.image.setVisible(true);
    this.plan = plan;
    this.startedAtMs = nowMs;
    this.apply(nowMs);
    return true;
  }

  /**
   * Advance the fade; call once per scene update with the frame delta, which feeds the frame-budget gate (a device
   * under 30 fps gets no cover). Costs nothing while no transition is running.
   */
  update(nowMs: number, deltaMs?: number): void {
    if (deltaMs !== undefined) {
      this.frameAverageMs = advanceUiTransitionFrameAverageMs(this.frameAverageMs, deltaMs);
    }
    if (this.plan === null) {
      return;
    }
    this.apply(nowMs);
  }

  /** Drop the snapshot at once (scene shutdown, or a state where a cover would be wrong). */
  release(): void {
    this.plan = null;
    this.image?.destroy();
    this.image = null;
    if (this.scene.textures?.exists(this.textureKey)) {
      this.scene.textures.remove(this.textureKey);
    }
  }

  private apply(nowMs: number): void {
    const image = this.image;
    const plan = this.plan;
    if (!image || !plan) {
      return;
    }
    const frame = resolveUiTransitionFrame(plan, nowMs - this.startedAtMs);
    if (frame.done) {
      // Keep the (reused) texture and the image object; just stop drawing it.
      image.setVisible(false);
      this.plan = null;
      return;
    }
    const width = this.scene.scale.width;
    const height = this.scene.scale.height;
    // Scale about the screen centre by moving the top-left corner; at scale 1 the corner is exactly (0, 0), a whole
    // pixel, so the snapshot lines up with the live scene (roundPixels floors Image positions).
    image
      .setDisplaySize(width * frame.scale, height * frame.scale)
      .setPosition(width * (1 - frame.scale) / 2, height * (1 - frame.scale) / 2)
      .setAlpha(frame.alpha);
  }
}
