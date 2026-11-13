/**
 * The thin Phaser side of appLoader.ts (MAZER-VIS-039): the same loader the HTML boot splash shows, as a cover over
 * the scene. One dark backdrop, the ring and the app icon; all three are Images/Rectangles whose alpha, scale and
 * position are the only things that change per frame (no Graphics clear/redraw, no per-frame allocation beyond one
 * small pose object), so the cost is three transforms. The icon is the same inline data URI the splash uses
 * (bootLoaderIconData.ts), registered once as a texture, so there is no request and no pop-in; until that texture
 * has decoded the icon simply stays hidden (the ring and backdrop still fade).
 *
 * The cover takes no input (no object here is interactive); a caller that needs an input shield adds its own.
 * Phaser pixel-alignment: Images sit at whole css px (see pixelAlignment.ts), so the icon is never half a pixel off
 * the HTML splash it hands over from.
 */
import type Phaser from 'phaser';
import { MAZER_BOOT_LOADER_ICON_DATA_URI } from '../brand/bootLoaderIconData';
import { designTokens, legacyPhaserAliases } from '../theme/tokens';
import {
  createLoaderMachine,
  resolveLoaderLayout,
  resolveLoaderPose,
  stepLoader,
  type LoaderLayout,
  type LoaderMachine
} from './appLoader';

export const MAZER_LOADER_ICON_TEXTURE_KEY = 'mazer-loader-icon';
export const MAZER_LOADER_RING_TEXTURE_KEY = 'mazer-loader-ring';
// Page near-black and the gate teal, from the design tokens (the HTML splash uses the same two values).
const BACKDROP_COLOR = legacyPhaserAliases['bg.page'];
const RING_COLOR = designTokens.legacy.color['brand.gate'];
const RING_TEXTURE_PX = 256;
const RING_LINE_PX = 4;
const RING_CORNER_RATIO = 0.22;

export class AppLoaderOverlay {
  private machine: LoaderMachine = createLoaderMachine();
  private shownAtMs = 0;
  private backdrop: Phaser.GameObjects.Rectangle | null = null;
  private ring: Phaser.GameObjects.Image | null = null;
  private icon: Phaser.GameObjects.Image | null = null;
  private lastWidth = -1;
  private lastHeight = -1;
  private layout: LoaderLayout = resolveLoaderLayout(1, 1);
  private iconBaseScale = 1;
  private ringBaseScale = 1;

  constructor(private readonly scene: Phaser.Scene, private readonly depth: number) {
    this.ensureTextures();
  }

  /** The current layout (centre, icon size, label line), for a caller that places its own label under the icon. */
  get currentLayout(): LoaderLayout {
    return this.layout;
  }

  /**
   * Advance one frame. `active` = something is being waited on. `instant` is for the first frame of a boot that the
   * HTML splash is still covering: the cover starts fully opaque so the splash can fade out over an identical frame.
   * Returns the loader opacity (0..1) so a caller can fade its own label with it.
   */
  sync(
    active: boolean,
    timeMs: number,
    reducedMotion: boolean,
    width: number,
    height: number,
    instant = false
  ): number {
    if (!active && this.machine.phase === 'idle') {
      return 0;
    }
    const wasIdle = this.machine.phase === 'idle' || this.machine.phase === 'waiting';
    const frame = stepLoader(this.machine, active, timeMs, reducedMotion, { instant });
    this.machine = frame.machine;
    if (wasIdle && (frame.machine.phase === 'fading-in' || frame.machine.phase === 'holding')) {
      this.shownAtMs = timeMs;
    }
    if (!frame.visible) {
      this.setVisible(false);
      return 0;
    }

    this.ensureObjects();
    if (width !== this.lastWidth || height !== this.lastHeight) {
      this.layout = resolveLoaderLayout(width, height);
      this.lastWidth = width;
      this.lastHeight = height;
      this.backdrop?.setSize(width, height);
      const iconSize = this.layout.iconSizePx;
      const left = Math.round(this.layout.centreX);
      const top = Math.round(this.layout.centreY);
      this.icon?.setPosition(left, top);
      this.ring?.setPosition(left, top);
      this.iconBaseScale = iconSize / (this.icon?.width || iconSize);
      this.ringBaseScale = iconSize / RING_TEXTURE_PX;
    }

    const pose = resolveLoaderPose(frame.alpha, timeMs - this.shownAtMs, reducedMotion);
    this.setVisible(true);
    this.backdrop?.setAlpha(pose.backdropAlpha);
    this.icon?.setAlpha(pose.iconAlpha).setScale(this.iconBaseScale * pose.iconScale);
    this.ring?.setAlpha(pose.ringAlpha).setScale(this.ringBaseScale * pose.ringScale);
    return pose.labelAlpha;
  }

  destroy(): void {
    this.backdrop?.destroy();
    this.ring?.destroy();
    this.icon?.destroy();
    this.backdrop = null;
    this.ring = null;
    this.icon = null;
  }

  private setVisible(visible: boolean): void {
    // Flag writes only (cheap), every frame: objects are created lazily, so a one-shot guard could leave a late one hidden.
    this.backdrop?.setVisible(visible);
    this.ring?.setVisible(visible);
    // The icon is only ever shown once its texture has decoded.
    this.icon?.setVisible(visible && this.scene.textures.exists(MAZER_LOADER_ICON_TEXTURE_KEY));
  }

  private ensureTextures(): void {
    const textures = this.scene.textures;
    if (!textures.exists(MAZER_LOADER_ICON_TEXTURE_KEY)) {
      textures.addBase64(MAZER_LOADER_ICON_TEXTURE_KEY, MAZER_BOOT_LOADER_ICON_DATA_URI);
    }
    if (!textures.exists(MAZER_LOADER_RING_TEXTURE_KEY)) {
      const texture = textures.createCanvas(MAZER_LOADER_RING_TEXTURE_KEY, RING_TEXTURE_PX, RING_TEXTURE_PX);
      const context = texture?.getContext();
      if (texture && context) {
        const inset = RING_LINE_PX / 2;
        const size = RING_TEXTURE_PX - RING_LINE_PX;
        const radius = size * RING_CORNER_RATIO;
        context.clearRect(0, 0, RING_TEXTURE_PX, RING_TEXTURE_PX);
        context.strokeStyle = RING_COLOR;
        context.lineWidth = RING_LINE_PX;
        context.beginPath();
        context.moveTo(inset + radius, inset);
        context.lineTo(inset + size - radius, inset);
        context.quadraticCurveTo(inset + size, inset, inset + size, inset + radius);
        context.lineTo(inset + size, inset + size - radius);
        context.quadraticCurveTo(inset + size, inset + size, inset + size - radius, inset + size);
        context.lineTo(inset + radius, inset + size);
        context.quadraticCurveTo(inset, inset + size, inset, inset + size - radius);
        context.lineTo(inset, inset + radius);
        context.quadraticCurveTo(inset, inset, inset + radius, inset);
        context.closePath();
        context.stroke();
        texture.refresh();
      }
    }
  }

  private ensureObjects(): void {
    if (this.backdrop === null) {
      this.backdrop = this.scene.add.rectangle(0, 0, 1, 1, BACKDROP_COLOR, 1).setOrigin(0, 0).setDepth(this.depth - 1).setVisible(false);
      this.lastWidth = -1;
    }
    if (this.ring === null && this.scene.textures.exists(MAZER_LOADER_RING_TEXTURE_KEY)) {
      this.ring = this.scene.add.image(0, 0, MAZER_LOADER_RING_TEXTURE_KEY).setOrigin(0.5, 0.5).setDepth(this.depth).setVisible(false);
      this.lastWidth = -1;
    }
    if (this.icon === null && this.scene.textures.exists(MAZER_LOADER_ICON_TEXTURE_KEY)) {
      this.icon = this.scene.add.image(0, 0, MAZER_LOADER_ICON_TEXTURE_KEY).setOrigin(0.5, 0.5).setDepth(this.depth).setVisible(false);
      this.lastWidth = -1;
    }
  }
}
