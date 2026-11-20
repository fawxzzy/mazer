import type Phaser from 'phaser';
import type { LegacyHitRect } from '../legacy-runtime/legacyHitTarget';
import {
  CLOSED_LEGACY_MENU_DROPDOWN_STATE,
  LEGACY_MENU_DROPDOWN_ICON_SIZE_PX,
  LEGACY_MENU_DROPDOWN_ITEMS,
  LEGACY_MENU_DROPDOWN_LABEL_FONT_PX,
  LEGACY_MENU_DROPDOWN_TOGGLE_ACTION,
  resolveLegacyMenuDropdownLayout,
  resolveLegacyMenuDropdownLinearProgress,
  resolveLegacyMenuDropdownProgress,
  resolveLegacyMenuDropdownRowAlpha,
  resolveLegacyMenuDropdownSlideOffset,
  resolveLegacyMenuDropdownTap,
  setLegacyMenuDropdownOpen,
  type LegacyMenuDropdownItem,
  type LegacyMenuDropdownItemId,
  type LegacyMenuDropdownLayout,
  type LegacyMenuDropdownRect,
  type LegacyMenuDropdownState
} from '../legacy-runtime/legacyMenuDropdown';
import {
  MENU_DROPDOWN_ACCENT,
  MENU_DROPDOWN_FOREGROUND,
  MENU_DROPDOWN_PANEL_FILL,
  drawMenuBurgerGlyph,
  drawMenuDropdownPanel
} from './menuDropdownArt';
import { toCyberArcadeCssHex } from './cyberArcadeMaterial';
import { resolveButtonIconPressedTextureKey } from './buttonIcons';

/** Invisible hit zones (alpha 0.001 so Phaser still hit-tests them); the colour is a theme token, never seen. */
const HIT_ZONE_FILL = MENU_DROPDOWN_PANEL_FILL;
const HIT_ZONE_ALPHA = 0.001;

/**
 * L6 main-menu dropdown wiring (Phaser). MenuScene (Wave 5C guarded) only asks this controller for its buttons while
 * the menu has no overlay, closes it on Esc, and supplies a small host. Everything else (toggle, scrim, panel, rows,
 * open/close animation, highlight) lives here.
 *
 * Input: the toggle sits at the old header depth (3). While the panel is open a full-screen transparent scrim (depth 5)
 * sits over everything else, so the Start hit zone and the tap-anywhere start never see a tap; the rows (depth 7) sit
 * over the scrim. The scrim also counts as an "other button" for the tap-anywhere exclusion, so even a tap that slips
 * past the object hit test cannot start a run while the panel is open or closing.
 */

/** Structural twin of MenuScene's UiButton (kept local so the scene's interface stays private). */
export interface MenuDropdownUiButton {
  background: Phaser.GameObjects.Rectangle;
  bounds: LegacyHitRect;
  iconOnly?: boolean;
  label: Phaser.GameObjects.Text;
  semanticAction?: string;
  setActive(active: boolean): void;
  text: string;
  updateFrame?(time: number): void;
  destroy(): void;
}

export interface MenuDropdownHost {
  readonly scene: Phaser.Scene;
  readonly fontFamily: string;
  now(): number;
  reducedMotion(): boolean;
  /** Header-family blink alpha for the closed toggle (the same pulse the old corner icons used). */
  blinkAlpha(time: number, active: boolean): number;
  textureKey(id: LegacyMenuDropdownItemId): string;
  /** Crops, sizes and places a HUD icon image exactly like the header icons. */
  placeIcon(image: Phaser.GameObjects.Image, id: LegacyMenuDropdownItemId, centerX: number, centerY: number, size: number, alpha: number): void;
  prepareText(text: Phaser.GameObjects.Text): void;
  /** Runs a row's action (opens Settings, the account surface or the Leaderboard). */
  select(id: LegacyMenuDropdownItemId): void;
  requestRebuild(): void;
  /** Called every menu frame by the toggle (keeps per-frame menu side effects the retired corner icons owned). */
  tick?(time: number): void;
}

export interface MenuDropdownBuildInput {
  toggleFrame: LegacyMenuDropdownRect;
  toggleHit: LegacyHitRect;
  viewport: { width: number; height: number };
  safeArea?: { left?: number; right?: number };
  items?: readonly LegacyMenuDropdownItem[];
}

export const MENU_DROPDOWN_TOGGLE_DEPTH = 3;
export const MENU_DROPDOWN_SCRIM_DEPTH = 5;
export const MENU_DROPDOWN_PANEL_DEPTH = 6;
export const MENU_DROPDOWN_ROW_DEPTH = 7;
/** How long the toggle keeps its pressed look after a tap (a quick touch tap is otherwise a single frame). */
export const MENU_TOGGLE_PRESS_FLASH_MS = 180;

const hitRect = (rect: LegacyMenuDropdownRect): LegacyHitRect => ({
  bottom: rect.top + rect.height,
  centerX: rect.left + (rect.width / 2),
  centerY: rect.top + (rect.height / 2),
  height: rect.height,
  left: rect.left,
  right: rect.left + rect.width,
  top: rect.top,
  width: rect.width
});

export class LegacyMenuDropdownController {
  private state: LegacyMenuDropdownState = CLOSED_LEGACY_MENU_DROPDOWN_STATE;
  private highlightIndex: number | null = null;
  private closeRebuildPending = false;

  constructor(private readonly host: MenuDropdownHost) {}

  isOpen(): boolean {
    return this.state.open;
  }

  /** True while the panel is open or still animating closed (input stays blocked for the whole close). */
  isShown(time = this.host.now()): boolean {
    return this.state.open || resolveLegacyMenuDropdownLinearProgress(this.state, time, this.host.reducedMotion()) > 0;
  }

  open(): void {
    if (this.state.open) {
      return;
    }
    this.state = setLegacyMenuDropdownOpen(this.state, true, this.host.now(), this.host.reducedMotion());
    this.highlightIndex = null;
    this.closeRebuildPending = false;
    this.host.requestRebuild();
  }

  /** Closes the panel; returns whether it was open. `instant` skips the close animation (used when a row is picked). */
  close(instant = false): boolean {
    const wasOpen = this.state.open;
    if (!wasOpen && !instant) {
      return false;
    }
    this.state = setLegacyMenuDropdownOpen(this.state, false, this.host.now(), this.host.reducedMotion(), instant);
    this.highlightIndex = null;
    if (instant || this.host.reducedMotion()) {
      this.closeRebuildPending = false;
      this.host.requestRebuild();
    } else {
      // Rows and scrim stay (non-interactive) until the close animation ends, then one rebuild drops them.
      this.closeRebuildPending = true;
    }
    return wasOpen;
  }

  toggle(): void {
    if (this.state.open) {
      this.close();
    } else {
      this.open();
    }
  }

  /** The scene calls this on every UI rebuild: anything other than the bare menu snaps the panel shut. */
  syncVisibility(visible: boolean): void {
    if (!visible && (this.state.open || this.closeRebuildPending)) {
      this.state = CLOSED_LEGACY_MENU_DROPDOWN_STATE;
      this.highlightIndex = null;
      this.closeRebuildPending = false;
    }
  }

  buildButtons(input: MenuDropdownBuildInput): MenuDropdownUiButton[] {
    const items = input.items ?? LEGACY_MENU_DROPDOWN_ITEMS;
    const layout = resolveLegacyMenuDropdownLayout({
      items,
      safeArea: input.safeArea,
      toggleFrame: input.toggleFrame,
      toggleHit: input.toggleHit,
      viewport: input.viewport
    });
    const buttons: MenuDropdownUiButton[] = [this.createToggle(input, layout)];
    if (this.isShown()) {
      buttons.push(this.createScrim(input, layout));
      layout.rows.forEach((_row, index) => buttons.push(this.createRow(layout, index)));
    }
    return buttons;
  }

  private progress(time: number): number {
    return resolveLegacyMenuDropdownProgress(this.state, time, this.host.reducedMotion());
  }

  private createToggle(input: MenuDropdownBuildInput, layout: LegacyMenuDropdownLayout): MenuDropdownUiButton {
    const { scene } = this.host;
    const frame = input.toggleFrame;
    const hit = input.toggleHit;
    const size = Math.min(frame.width, frame.height);
    const centerX = frame.left + (frame.width / 2);
    const centerY = frame.top + (frame.height / 2);
    const background = scene.add.rectangle(hit.centerX, hit.centerY, hit.width, hit.height, HIT_ZONE_FILL, HIT_ZONE_ALPHA);
    background.setInteractive({ useHandCursor: true });
    background.setDepth(MENU_DROPDOWN_TOGGLE_DEPTH);
    // Drawn around (0, 0) and positioned at the frame centre so the blink scale grows from the centre.
    const graphics = scene.add.graphics({ x: centerX, y: centerY }).setDepth(MENU_DROPDOWN_TOGGLE_DEPTH);
    const label = scene.add.text(centerX, centerY, '', { fontFamily: this.host.fontFamily, fontSize: '1px' })
      .setOrigin(0.5)
      .setVisible(false);
    let active = false;
    let drawnKey = '';
    // MAZER-UI-097: C's pressed look (soft cyan ring) shows while the pointer is on the toggle and for a beat after a tap.
    let pressedUntil = 0;
    background.on('pointerover', () => { active = true; });
    background.on('pointerout', () => { active = false; });
    background.on('pointerdown', () => {
      pressedUntil = this.host.now() + MENU_TOGGLE_PRESS_FLASH_MS;
      this.toggle();
    });
    const updateFrame = (time: number): void => {
      this.host.tick?.(time);
      const progress = this.progress(time);
      const open = progress > 0.4;
      const pressed = active || time < pressedUntil;
      const key = `${progress.toFixed(3)}|${open}|${pressed}`;
      if (key !== drawnKey) {
        drawnKey = key;
        graphics.clear();
        // MAZER-UI-097: one ink for the lines in both states, like C (menu / menuOpen); the X is marked by its cyan dust
        // dot. The ink stays the foreground the Guide's Menu row passes, so the guide and the button remain one draw.
        drawMenuBurgerGlyph(graphics, 0, 0, size, progress, MENU_DROPDOWN_FOREGROUND, 1, pressed);
      }
      if (this.state.open) {
        graphics.setAlpha(1).setScale(1);
      } else {
        // MAZER-UI-097: a pressed toggle holds full alpha so C's pressed ring and cyan lines read through the blink.
        graphics.setAlpha(pressed ? 1 : Math.max(this.host.blinkAlpha(time, active), progress)).setScale(1);
      }
      if (this.closeRebuildPending && !this.isShown(time)) {
        this.closeRebuildPending = false;
        this.host.requestRebuild();
      }
    };
    updateFrame(this.host.now());
    return {
      background,
      bounds: hitRect(layout.toggle),
      iconOnly: true,
      label,
      semanticAction: LEGACY_MENU_DROPDOWN_TOGGLE_ACTION,
      setActive: (value: boolean) => { active = value; },
      text: LEGACY_MENU_DROPDOWN_TOGGLE_ACTION,
      updateFrame,
      destroy: () => {
        graphics.destroy();
        background.destroy();
        label.destroy();
      }
    };
  }

  private createScrim(input: MenuDropdownBuildInput, layout: LegacyMenuDropdownLayout): MenuDropdownUiButton {
    const { scene } = this.host;
    const { width, height } = input.viewport;
    const background = scene.add.rectangle(width / 2, height / 2, width, height, HIT_ZONE_FILL, HIT_ZONE_ALPHA);
    background.setDepth(MENU_DROPDOWN_SCRIM_DEPTH);
    if (this.state.open) {
      background.setInteractive();
    }
    background.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!this.state.open) {
        return;
      }
      const tap = resolveLegacyMenuDropdownTap(layout, { x: pointer.worldX, y: pointer.worldY });
      if (tap.kind === 'row') {
        this.pick(tap.id);
      } else if (tap.kind !== 'panel') {
        // The X, or anywhere outside the panel: close, and nothing else happens (no run starts).
        this.close();
      }
    });
    const panelGraphics = scene.add.graphics().setDepth(MENU_DROPDOWN_PANEL_DEPTH);
    const label = scene.add.text(0, 0, '', { fontFamily: this.host.fontFamily, fontSize: '1px' }).setVisible(false);
    let drawnKey = '';
    const updateFrame = (time: number): void => {
      if (!this.state.open && background.input?.enabled) {
        background.disableInteractive();
      }
      const progress = this.progress(time);
      const offset = resolveLegacyMenuDropdownSlideOffset(progress);
      const key = `${progress.toFixed(3)}|${offset}|${this.highlightIndex}`;
      if (key === drawnKey) {
        return;
      }
      drawnKey = key;
      panelGraphics.clear();
      drawMenuDropdownPanel(panelGraphics, layout.panel, layout.rows.map((row) => row.rect), progress, offset, this.highlightIndex);
    };
    updateFrame(this.host.now());
    return {
      background,
      bounds: hitRect({ height, left: 0, top: 0, width }),
      iconOnly: true,
      label,
      semanticAction: 'Close menu',
      setActive: () => undefined,
      text: 'Close menu',
      updateFrame,
      destroy: () => {
        panelGraphics.destroy();
        background.destroy();
        label.destroy();
      }
    };
  }

  private createRow(layout: LegacyMenuDropdownLayout, index: number): MenuDropdownUiButton {
    const { scene } = this.host;
    const row = layout.rows[index]!;
    const rect = row.rect;
    const background = scene.add.rectangle(
      rect.left + (rect.width / 2),
      rect.top + (rect.height / 2),
      rect.width,
      rect.height,
      HIT_ZONE_FILL,
      HIT_ZONE_ALPHA
    );
    background.setDepth(MENU_DROPDOWN_ROW_DEPTH);
    if (this.state.open) {
      background.setInteractive({ useHandCursor: true });
    }
    const iconKey = this.host.textureKey(row.item.id);
    // MAZER-UI-097: the lit row shows the icon's pressed bake (C: cyan ink), when one exists.
    const litIconKey = resolveButtonIconPressedTextureKey(iconKey);
    const icon = scene.add.image(0, 0, iconKey)
      .setOrigin(0.5, 0.5)
      .setDepth(MENU_DROPDOWN_ROW_DEPTH)
      .setVisible(false);
    const label = scene.add.text(row.labelLeft, row.centerY, row.item.label, {
      color: toCyberArcadeCssHex(MENU_DROPDOWN_FOREGROUND),
      fontFamily: this.host.fontFamily,
      fontSize: `${LEGACY_MENU_DROPDOWN_LABEL_FONT_PX}px`
    }).setOrigin(0, 0.5).setDepth(MENU_DROPDOWN_ROW_DEPTH);
    this.host.prepareText(label);
    const setHighlight = (on: boolean): void => {
      if (on && this.state.open) {
        this.highlightIndex = index;
      } else if (!on && this.highlightIndex === index) {
        this.highlightIndex = null;
      }
    };
    background.on('pointerover', () => setHighlight(true));
    background.on('pointerout', () => setHighlight(false));
    background.on('pointerdown', () => {
      if (this.state.open) {
        this.pick(row.item.id);
      }
    });
    let drawnKey = '';
    const updateFrame = (time: number): void => {
      if (!this.state.open && background.input?.enabled) {
        background.disableInteractive();
      }
      const progress = this.progress(time);
      const offset = resolveLegacyMenuDropdownSlideOffset(progress);
      const alpha = resolveLegacyMenuDropdownRowAlpha(progress, index);
      const lit = this.highlightIndex === index;
      const key = `${alpha.toFixed(3)}|${offset}|${lit}`;
      if (key === drawnKey) {
        return;
      }
      drawnKey = key;
      label.setPosition(row.labelLeft, row.centerY + offset)
        .setColor(toCyberArcadeCssHex(lit ? MENU_DROPDOWN_ACCENT : MENU_DROPDOWN_FOREGROUND))
        .setAlpha(alpha)
        .setVisible(alpha > 0.01);
      const wantKey = lit && scene.textures.exists(litIconKey) ? litIconKey : iconKey;
      if (icon.texture.key !== wantKey) {
        icon.setTexture(wantKey);
      }
      this.host.placeIcon(icon, row.item.id, row.iconCenterX, row.centerY + offset, LEGACY_MENU_DROPDOWN_ICON_SIZE_PX, alpha);
    };
    updateFrame(this.host.now());
    return {
      background,
      bounds: hitRect(rect),
      label,
      semanticAction: row.item.semanticAction,
      setActive: setHighlight,
      text: row.item.label,
      updateFrame,
      destroy: () => {
        icon.destroy();
        background.destroy();
        label.destroy();
      }
    };
  }

  private pick(id: LegacyMenuDropdownItemId): void {
    this.close(true);
    this.host.select(id);
  }
}
