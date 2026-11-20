import type Phaser from 'phaser';
import type { LegacyHitRect } from '../legacy-runtime/legacyHitTarget';
import {
  CLOSED_LEGACY_MENU_DROPDOWN_STATE,
  LEGACY_MENU_DROPDOWN_DISABLED_ALPHA,
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

/** Invisible hit zones (alpha 0.001 so Phaser still hit-tests them); the colour is a theme token, never seen. */
const HIT_ZONE_FILL = MENU_DROPDOWN_PANEL_FILL;
const HIT_ZONE_ALPHA = 0.001;
/** Gap between the open toggle's X and its optional visible label (in-game "Resume"). */
const OPEN_TOGGLE_LABEL_GAP_PX = 6;

/**
 * L6 main-menu dropdown wiring (Phaser). MenuScene (Wave 5C guarded) only asks this controller for its buttons while
 * the menu has no overlay, closes it on Esc, and supplies a small host. Everything else (toggle, scrim, panel, rows,
 * open/close animation, highlight) lives here.
 *
 * Input: the toggle sits at the old header depth (3). While the panel is open a full-screen transparent scrim (depth 5)
 * sits over everything else, so the Start hit zone and the tap-anywhere start never see a tap; the rows (depth 7) sit
 * over the scrim. The scrim also counts as an "other button" for the tap-anywhere exclusion, so even a tap that slips
 * past the object hit test cannot start a run while the panel is open or closing.
 *
 * MAZER-UI-095: the in-game Menu is a second instance of this same controller (same panel, rows, hit zones, timings).
 * It passes options the main menu does not: the open X publishes 'Resume' and shows a visible "Resume" label, a tap on
 * the X or outside the panel calls `dismissed` (the scene resumes the run), and some rows keep the panel open when
 * picked (Sound, the two-tap Reset level / Main menu arm). Rows may carry a state word or be disabled.
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

export interface MenuDropdownHost<TId extends string = LegacyMenuDropdownItemId> {
  readonly scene: Phaser.Scene;
  readonly fontFamily: string;
  now(): number;
  reducedMotion(): boolean;
  /** Header-family blink alpha for the closed toggle (the same pulse the old corner icons used). */
  blinkAlpha(time: number, active: boolean): number;
  /** Texture for a row's icon image; null = the row has no image (it is painted by `drawIcon`). */
  textureKey(id: TId): string | null;
  /** Optional named frame on that texture (the HUD atlas glyphs). */
  textureFrame?(id: TId): string | undefined;
  /** Crops, sizes and places a HUD icon image exactly like the header icons. */
  placeIcon(image: Phaser.GameObjects.Image, id: TId, centerX: number, centerY: number, size: number, alpha: number): void;
  /** Optional vector icon painter for rows without an image (in-game Sound, Reset level, Main menu). */
  drawIcon?(graphics: Phaser.GameObjects.Graphics, id: TId, centerX: number, centerY: number, size: number, alpha: number): void;
  prepareText(text: Phaser.GameObjects.Text): void;
  /** Runs a row's action (opens Settings, the account surface or the Leaderboard). */
  select(id: TId): void;
  requestRebuild(): void;
  /** Called every menu frame by the toggle (keeps per-frame menu side effects the retired corner icons owned). */
  tick?(time: number): void;
  /**
   * When set, a tap on the X or outside the panel closes it at once and calls this (the in-game menu resumes the run).
   * Unset (main menu): the panel animates closed and nothing else happens.
   */
  dismissed?(): void;
  /** Rows whose pick leaves the panel open (in-game Sound toggle, the first press of a two-tap row). */
  keepOpenOnSelect?(id: TId): boolean;
}

export interface MenuDropdownToggleOptions {
  /** Name the closed toggle publishes (default 'Menu'). */
  readonly closedAction?: string;
  /** Name the open toggle (the X) publishes; default = closedAction. In game this is 'Resume'. */
  readonly openAction?: string;
  /** Visible label drawn to the left of the open X (in game: "Resume"). Its touch area joins the toggle's. */
  readonly openLabel?: string | null;
}

export interface MenuDropdownBuildInput<TId extends string = LegacyMenuDropdownItemId> {
  toggleFrame: LegacyMenuDropdownRect;
  toggleHit: LegacyHitRect;
  viewport: { width: number; height: number };
  safeArea?: { left?: number; right?: number };
  items?: readonly LegacyMenuDropdownItem<TId>[];
  panelWidth?: number;
  toggle?: MenuDropdownToggleOptions;
}

export const MENU_DROPDOWN_TOGGLE_DEPTH = 3;
export const MENU_DROPDOWN_SCRIM_DEPTH = 5;
export const MENU_DROPDOWN_PANEL_DEPTH = 6;
export const MENU_DROPDOWN_ROW_DEPTH = 7;

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

export class LegacyMenuDropdownController<TId extends string = LegacyMenuDropdownItemId> {
  private state: LegacyMenuDropdownState = CLOSED_LEGACY_MENU_DROPDOWN_STATE;
  private highlightIndex: number | null = null;
  private closeRebuildPending = false;

  constructor(private readonly host: MenuDropdownHost<TId>) {}

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
      this.dismiss();
    } else {
      this.open();
    }
  }

  /** The scene calls this on every UI rebuild: anything other than the surface that owns the panel snaps it shut. */
  syncVisibility(visible: boolean): void {
    if (!visible && (this.state.open || this.closeRebuildPending)) {
      this.state = CLOSED_LEGACY_MENU_DROPDOWN_STATE;
      this.highlightIndex = null;
      this.closeRebuildPending = false;
    }
  }

  buildButtons(input: MenuDropdownBuildInput<TId>): MenuDropdownUiButton[] {
    const items = input.items ?? (LEGACY_MENU_DROPDOWN_ITEMS as unknown as readonly LegacyMenuDropdownItem<TId>[]);
    const layout = resolveLegacyMenuDropdownLayout<TId>({
      items,
      panelWidth: input.panelWidth,
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

  /** The X or a tap outside: the main menu animates shut; the in-game menu shuts at once and resumes. */
  private dismiss(): void {
    if (this.host.dismissed === undefined) {
      this.close();
      return;
    }
    this.close(true);
    this.host.dismissed();
  }

  private createToggle(input: MenuDropdownBuildInput<TId>, panelLayout: LegacyMenuDropdownLayout<TId>): MenuDropdownUiButton {
    const { scene } = this.host;
    const frame = input.toggleFrame;
    const size = Math.min(frame.width, frame.height);
    const centerX = frame.left + (frame.width / 2);
    const centerY = frame.top + (frame.height / 2);
    const closedAction = input.toggle?.closedAction ?? LEGACY_MENU_DROPDOWN_TOGGLE_ACTION;
    const openAction = input.toggle?.openAction ?? closedAction;
    const openLabelText = input.toggle?.openLabel ?? null;
    // MAZER-UI-095: the in-game X reads "Resume" in words too (right-aligned against the X, row font, accent colour).
    const openLabel = openLabelText === null
      ? null
      : scene.add.text(Math.round(frame.left - OPEN_TOGGLE_LABEL_GAP_PX), Math.round(centerY), openLabelText, {
        color: toCyberArcadeCssHex(MENU_DROPDOWN_ACCENT),
        fontFamily: this.host.fontFamily,
        fontSize: `${LEGACY_MENU_DROPDOWN_LABEL_FONT_PX}px`
      }).setOrigin(1, 0.5).setDepth(MENU_DROPDOWN_TOGGLE_DEPTH).setVisible(false);
    if (openLabel !== null) {
      this.host.prepareText(openLabel);
    }
    // While open, the visible label is part of the Resume target: the zone grows left to cover it (never below 44 px).
    const widen = openLabel !== null && this.state.open;
    const widenedLeft = widen
      ? Math.min(input.toggleHit.left, Math.floor(openLabel.x - openLabel.width) - OPEN_TOGGLE_LABEL_GAP_PX)
      : input.toggleHit.left;
    const layout: LegacyMenuDropdownLayout<TId> = widen
      ? {
        ...panelLayout,
        toggle: {
          height: panelLayout.toggle.height,
          left: widenedLeft,
          top: panelLayout.toggle.top,
          width: (panelLayout.toggle.left + panelLayout.toggle.width) - widenedLeft
        }
      }
      : panelLayout;
    const hit = widen ? hitRect(layout.toggle) : input.toggleHit;
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
    background.on('pointerover', () => { active = true; });
    background.on('pointerout', () => { active = false; });
    background.on('pointerdown', () => this.toggle());
    const updateFrame = (time: number): void => {
      this.host.tick?.(time);
      const progress = this.progress(time);
      const open = progress > 0.4;
      const key = `${progress.toFixed(3)}|${open}`;
      if (key !== drawnKey) {
        drawnKey = key;
        graphics.clear();
        drawMenuBurgerGlyph(graphics, 0, 0, size, progress, open ? MENU_DROPDOWN_ACCENT : MENU_DROPDOWN_FOREGROUND);
      }
      if (this.state.open) {
        graphics.setAlpha(1).setScale(1);
      } else {
        graphics.setAlpha(Math.max(this.host.blinkAlpha(time, active), progress)).setScale(1);
      }
      openLabel?.setAlpha(progress).setVisible(this.state.open && progress > 0.01);
      if (this.closeRebuildPending && !this.isShown(time)) {
        this.closeRebuildPending = false;
        this.host.requestRebuild();
      }
    };
    updateFrame(this.host.now());
    const action = this.state.open ? openAction : closedAction;
    return {
      background,
      bounds: hitRect(layout.toggle),
      iconOnly: true,
      label,
      semanticAction: action,
      setActive: (value: boolean) => { active = value; },
      text: action,
      updateFrame,
      destroy: () => {
        graphics.destroy();
        background.destroy();
        label.destroy();
        openLabel?.destroy();
      }
    };
  }

  private createScrim(input: MenuDropdownBuildInput<TId>, layout: LegacyMenuDropdownLayout<TId>): MenuDropdownUiButton {
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
      const tap = resolveLegacyMenuDropdownTap<TId>(layout, { x: pointer.worldX, y: pointer.worldY });
      if (tap.kind === 'row') {
        this.pick(tap.id);
      } else if (tap.kind !== 'panel') {
        // The X, or anywhere outside the panel: close, and nothing else happens (no run starts).
        this.dismiss();
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

  private createRow(layout: LegacyMenuDropdownLayout<TId>, index: number): MenuDropdownUiButton {
    const { scene } = this.host;
    const row = layout.rows[index]!;
    const rect = row.rect;
    const disabled = row.item.disabled === true;
    const background = scene.add.rectangle(
      rect.left + (rect.width / 2),
      rect.top + (rect.height / 2),
      rect.width,
      rect.height,
      HIT_ZONE_FILL,
      HIT_ZONE_ALPHA
    );
    background.setDepth(MENU_DROPDOWN_ROW_DEPTH);
    if (this.state.open && !disabled) {
      background.setInteractive({ useHandCursor: true });
    }
    const textureKey = this.host.textureKey(row.item.id);
    const icon = textureKey === null
      ? null
      : scene.add.image(0, 0, textureKey, this.host.textureFrame?.(row.item.id))
        .setOrigin(0.5, 0.5)
        .setDepth(MENU_DROPDOWN_ROW_DEPTH)
        .setVisible(false);
    const iconGraphics = this.host.drawIcon === undefined ? null : scene.add.graphics().setDepth(MENU_DROPDOWN_ROW_DEPTH);
    const label = scene.add.text(row.labelLeft, row.centerY, row.item.label, {
      color: toCyberArcadeCssHex(MENU_DROPDOWN_FOREGROUND),
      fontFamily: this.host.fontFamily,
      fontSize: `${LEGACY_MENU_DROPDOWN_LABEL_FONT_PX}px`
    }).setOrigin(0, 0.5).setDepth(MENU_DROPDOWN_ROW_DEPTH);
    this.host.prepareText(label);
    const stateText = row.item.stateText ?? null;
    const state = stateText === null
      ? null
      : scene.add.text(row.stateRight, row.centerY, stateText, {
        color: toCyberArcadeCssHex(MENU_DROPDOWN_ACCENT),
        fontFamily: this.host.fontFamily,
        fontSize: `${LEGACY_MENU_DROPDOWN_LABEL_FONT_PX - 2}px`
      }).setOrigin(1, 0.5).setDepth(MENU_DROPDOWN_ROW_DEPTH);
    if (state !== null) {
      this.host.prepareText(state);
    }
    const setHighlight = (on: boolean): void => {
      if (on && this.state.open && !disabled) {
        this.highlightIndex = index;
      } else if (!on && this.highlightIndex === index) {
        this.highlightIndex = null;
      }
    };
    background.on('pointerover', () => setHighlight(true));
    background.on('pointerout', () => setHighlight(false));
    background.on('pointerdown', () => {
      if (this.state.open && !disabled) {
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
      const alpha = resolveLegacyMenuDropdownRowAlpha(progress, index) * (disabled ? LEGACY_MENU_DROPDOWN_DISABLED_ALPHA : 1);
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
      state?.setPosition(row.stateRight, row.centerY + offset).setAlpha(alpha).setVisible(alpha > 0.01);
      if (icon !== null) {
        this.host.placeIcon(icon, row.item.id, row.iconCenterX, row.centerY + offset, LEGACY_MENU_DROPDOWN_ICON_SIZE_PX, alpha);
      }
      if (iconGraphics !== null) {
        iconGraphics.clear();
        this.host.drawIcon?.(iconGraphics, row.item.id, row.iconCenterX, row.centerY + offset, LEGACY_MENU_DROPDOWN_ICON_SIZE_PX, alpha);
      }
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
        icon?.destroy();
        iconGraphics?.destroy();
        state?.destroy();
        background.destroy();
        label.destroy();
      }
    };
  }

  private pick(id: TId): void {
    if (this.host.keepOpenOnSelect?.(id) === true) {
      this.host.select(id);
      return;
    }
    this.close(true);
    this.host.select(id);
  }
}
