/**
 * MAZER-UI-033: Phaser view of the main-menu online counter (exact copy of the website header counter).
 * Owns one Text ("7 online", muted, tabular) and draws the dot into the caller's Graphics: accent circle with a
 * soft glow and the web's 2.6s opacity pulse when live, a dim dot alone when idle. Geometry is the pure layout in
 * legacy-runtime/legacyPresenceCounterLayout.ts.
 */
import Phaser from 'phaser';
import {
  LEGACY_PRESENCE_COUNTER_NAME,
  LEGACY_PRESENCE_FONT_PX,
  LEGACY_PRESENCE_GLOW_ALPHA,
  LEGACY_PRESENCE_GLOW_RADIUS_PX,
  resolveLegacyPresenceDotAlpha,
  type LegacyPresenceCounterLayout
} from '../legacy-runtime/legacyPresenceCounterLayout';

export interface PresenceCounterViewStyle {
  readonly fontFamily: string;
  /** CSS colour string for the muted number and word. */
  readonly textColor: string;
  /** 0xRRGGBB accent for the dot. */
  readonly dotColor: number;
}

export class PresenceCounterView {
  private readonly label: Phaser.GameObjects.Text;

  public constructor(scene: Phaser.Scene, private readonly style: PresenceCounterViewStyle) {
    // Text resolution stays at the baseline (render/textCrispness.ts); depth 3 like the other menu controls.
    this.label = scene.add.text(0, 0, '', {
      color: style.textColor,
      fontFamily: style.fontFamily,
      fontSize: `${LEGACY_PRESENCE_FONT_PX}px`,
      padding: { bottom: 2, top: 2 }
    }).setOrigin(0, 0.5).setDepth(3).setVisible(false).setName(LEGACY_PRESENCE_COUNTER_NAME);
  }

  /** Measures a string in the counter font (used by the layout fit tiers). */
  public measure(value: string): number {
    const previous = this.label.text;
    this.label.setText(value);
    const width = this.label.width;
    this.label.setText(previous);
    return width;
  }

  public hide(): void {
    this.label.setVisible(false);
  }

  public draw(
    graphics: Phaser.GameObjects.Graphics,
    layout: LegacyPresenceCounterLayout,
    options: { readonly live: boolean; readonly timeMs: number; readonly reducedMotion: boolean; readonly textAlpha: number }
  ): void {
    if (!layout.visible || layout.dot === null) {
      this.label.setVisible(false);
      return;
    }
    const alpha = resolveLegacyPresenceDotAlpha(options.live, options.timeMs, options.reducedMotion);
    const { centerX, centerY, radius } = layout.dot;
    if (options.live) {
      // box-shadow 0 0 10px accent/0.55: a few stacked translucent rings, strongest at the dot.
      const rings = 4;
      for (let ring = rings; ring >= 1; ring -= 1) {
        const reach = radius + ((LEGACY_PRESENCE_GLOW_RADIUS_PX * ring) / rings);
        graphics.fillStyle(this.style.dotColor, (LEGACY_PRESENCE_GLOW_ALPHA / (rings * 2)) * alpha);
        graphics.fillCircle(centerX, centerY, reach);
      }
    }
    graphics.fillStyle(this.style.dotColor, alpha);
    graphics.fillCircle(centerX, centerY, radius);
    if (layout.text === null) {
      this.label.setVisible(false);
      return;
    }
    if (this.label.text !== layout.text.value) {
      this.label.setText(layout.text.value);
    }
    this.label
      .setPosition(Math.round(layout.text.left), Math.round(layout.text.centerY))
      .setAlpha(options.textAlpha)
      .setVisible(true);
  }
}
