import Phaser from 'phaser';
import {
  LEGACY_DEFAULTS,
  MAIN_MENU_BUTTONS,
  copyLegacySettings,
  linearColorToHex,
  linearColorToNumber,
  type LegacySettings
} from '../legacy-runtime/legacyDefaults';
import {
  createLegacyMaze,
  isWalkableTile,
  movePoint,
  type LegacyMazeSnapshot,
  type LegacyPoint
} from '../legacy-runtime/legacyMaze';
import {
  resolveLegacyMenuLayout,
  type LegacyMenuLayout
} from '../legacy-runtime/legacyMenuLayout';
import {
  applyLegacyOptionField,
  createLegacyOptionFieldDrafts,
  type LegacyOptionFieldDrafts,
  type LegacyOptionFieldId
} from '../legacy-runtime/legacyOptionFields';

type RuntimeMode = 'menu' | 'play';
type OverlayKind = 'none' | 'options' | 'features' | 'gameModes' | 'pause' | 'message';

interface UiButton {
  background: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
  setActive(active: boolean): void;
  destroy(): void;
}

interface StarParticle {
  x: number;
  y: number;
  radius: number;
  speed: number;
  alpha: number;
}

interface OverlayPanelFrame {
  centerX: number;
  height: number;
  left: number;
  top: number;
  width: number;
}

const BOARD_SHADOW_OFFSET = 10;
const MENU_BUTTON_ALPHA = 0.18;
const MENU_BUTTON_STROKE_ALPHA = 0.24;
const MENU_TEXT_COLOR = '#0b841d';
const TITLE_FILL_COLOR = '#249628';
const TITLE_SHADOW_COLOR = '#0c2e13';
const MESSAGE_DURATION_MS = 1800;
const DEMO_STEP_MS = 118;
const DEMO_REGEN_HOLD_MS = 860;
const TRAIL_FADE_TAIL = 16;

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const copyPoint = (point: LegacyPoint): LegacyPoint => ({ x: point.x, y: point.y });

const formatClock = (elapsedMs: number): string => {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

const buildPathTrail = (
  points: readonly LegacyPoint[],
  limit: number | null
): LegacyPoint[] => {
  if (limit === null || points.length <= limit) {
    return points.map(copyPoint);
  }

  return points.slice(Math.max(0, points.length - limit)).map(copyPoint);
};

export class MenuScene extends Phaser.Scene {
  private settings: LegacySettings = copyLegacySettings(LEGACY_DEFAULTS);
  private optionFieldDrafts: LegacyOptionFieldDrafts = createLegacyOptionFieldDrafts(LEGACY_DEFAULTS);
  private activeInputField: LegacyOptionFieldId | null = null;
  private mazeSeed = 0x5a17f00d;
  private maze!: LegacyMazeSnapshot;
  private player!: LegacyPoint;
  private trail: LegacyPoint[] = [];
  private mode: RuntimeMode = 'menu';
  private overlay: OverlayKind = 'none';
  private overlayReturn: OverlayKind = 'none';
  private pendingMazeRebuild = false;
  private demoCursor = 0;
  private nextDemoMoveAtMs = 0;
  private playStartedAtMs = 0;
  private messageText = '';
  private messageVisibleUntilMs = 0;
  private titleText!: Phaser.GameObjects.Text;
  private titleShadow!: Phaser.GameObjects.Text;
  private footerText!: Phaser.GameObjects.Text;
  private backdropGraphics!: Phaser.GameObjects.Graphics;
  private boardStaticGraphics!: Phaser.GameObjects.Graphics;
  private boardDynamicGraphics!: Phaser.GameObjects.Graphics;
  private overlayGraphics!: Phaser.GameObjects.Graphics;
  private hudGraphics!: Phaser.GameObjects.Graphics;
  private uiTexts: Phaser.GameObjects.Text[] = [];
  private uiButtons: UiButton[] = [];
  private stars: StarParticle[] = [];
  private layout!: LegacyMenuLayout;
  private boardStaticDirty = true;
  private boardDynamicDirty = true;
  private backdropDirty = true;
  private uiDirty = true;

  public constructor() {
    super('MenuScene');
  }

  public create(): void {
    this.backdropGraphics = this.add.graphics();
    this.boardStaticGraphics = this.add.graphics();
    this.boardDynamicGraphics = this.add.graphics();
    this.overlayGraphics = this.add.graphics();
    this.hudGraphics = this.add.graphics();

    this.titleShadow = this.add.text(0, 0, 'Mazer', {
      fontFamily: '"Courier New", monospace',
      fontSize: '96px',
      color: TITLE_SHADOW_COLOR
    }).setOrigin(0.5).setAlpha(0.72);
    this.titleText = this.add.text(0, 0, 'Mazer', {
      fontFamily: '"Courier New", monospace',
      fontSize: '96px',
      color: TITLE_FILL_COLOR
    }).setOrigin(0.5).setAlpha(0.62);
    this.footerText = this.add.text(0, 0, '', {
      fontFamily: '"Courier New", monospace',
      fontSize: '18px',
      color: '#d7d6de',
      align: 'center'
    }).setOrigin(0.5).setAlpha(0.92);

    this.createStars();
    this.rebuildMaze();
    this.refreshLayout();
    this.installInput();

    this.scale.on('resize', () => {
      this.refreshLayout();
    });
  }

  public update(time: number, delta: number): void {
    this.updateStars(delta);

    if (this.mode === 'menu' && this.overlay === 'none') {
      this.updateMenuDemo(time);
    }

    if (this.messageVisibleUntilMs > 0 && time >= this.messageVisibleUntilMs) {
      this.messageVisibleUntilMs = 0;
      this.messageText = '';
      if (this.overlay === 'message') {
        this.overlay = 'none';
        this.overlayReturn = 'none';
        this.boardDynamicDirty = true;
        this.uiDirty = true;
      }
    }

    if (this.backdropDirty) {
      this.drawBackdrop();
    }
    if (this.boardStaticDirty) {
      this.drawStaticBoard();
    }
    if (this.boardDynamicDirty) {
      this.drawDynamicBoard();
      this.drawHud(time);
    }
    if (this.uiDirty) {
      this.rebuildUi();
    }
  }

  private installInput(): void {
    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      if (event.repeat) {
        return;
      }

      if (this.overlay !== 'none' && this.handleOverlayFieldInput(event)) {
        return;
      }

      if (event.key === 'Escape') {
        this.handleBackAction();
        return;
      }

      if (event.key.toLowerCase() === 'p' && this.mode === 'play') {
        if (this.overlay === 'pause') {
          this.closeOverlay();
        } else if (this.overlay === 'none') {
          this.openOverlay('pause');
        }
        return;
      }

      if (event.key === 'Enter' && this.mode === 'menu' && this.overlay === 'none') {
        this.startPlayMode();
        return;
      }

      if (event.key.toLowerCase() === 'o' && this.mode === 'menu' && this.overlay === 'none') {
        this.openOverlay('options');
        return;
      }

      if (this.mode !== 'play' || this.overlay !== 'none') {
        return;
      }

      const lower = event.key.toLowerCase();
      if (lower === 'w' || event.key === 'ArrowUp') {
        this.tryMovePlayer(0, -1);
      } else if (lower === 's' || event.key === 'ArrowDown') {
        this.tryMovePlayer(0, 1);
      } else if (lower === 'a' || event.key === 'ArrowLeft') {
        this.tryMovePlayer(-1, 0);
      } else if (lower === 'd' || event.key === 'ArrowRight') {
        this.tryMovePlayer(1, 0);
      }
    });
  }

  private handleOverlayFieldInput(event: KeyboardEvent): boolean {
    if (this.activeInputField === null) {
      return false;
    }

    if (event.key === 'Enter') {
      this.commitOverlayField(this.activeInputField);
      return true;
    }

    if (event.key === 'Escape') {
      this.optionFieldDrafts = createLegacyOptionFieldDrafts(this.settings);
      this.activeInputField = null;
      this.uiDirty = true;
      return true;
    }

    if (event.key === 'Backspace') {
      const nextValue = this.optionFieldDrafts[this.activeInputField].slice(0, -1);
      this.optionFieldDrafts[this.activeInputField] = nextValue;
      this.uiDirty = true;
      return true;
    }

    if (!/^[0-9.-]$/.test(event.key)) {
      return false;
    }

    const currentValue = this.optionFieldDrafts[this.activeInputField];
    if (event.key === '-' && currentValue.includes('-')) {
      return true;
    }
    if (event.key === '.' && currentValue.includes('.')) {
      return true;
    }

    this.optionFieldDrafts[this.activeInputField] = `${currentValue}${event.key}`;
    this.uiDirty = true;
    return true;
  }

  private refreshLayout(): void {
    const width = this.scale.width;
    const height = this.scale.height;
    this.layout = resolveLegacyMenuLayout(width, height, this.settings.scale + this.settings.camScale, this.maze.size);

    this.titleShadow
      .setPosition(this.layout.titleX, this.layout.titleY + Math.max(6, Math.round(this.layout.tileSize * 0.18)))
      .setFontSize(Math.max(56, Math.round(this.layout.boardSize * 0.16)));
    this.titleText
      .setPosition(this.layout.titleX, this.layout.titleY)
      .setFontSize(Math.max(56, Math.round(this.layout.boardSize * 0.16)));
    this.footerText.setPosition(this.layout.width / 2, this.layout.footerY);

    this.boardStaticDirty = true;
    this.boardDynamicDirty = true;
    this.backdropDirty = true;
    this.uiDirty = true;
  }

  private rebuildMaze(): void {
    this.maze = createLegacyMaze(this.settings.scale, this.mazeSeed);
    this.player = copyPoint(this.maze.start);
    this.demoCursor = Math.min(6, Math.max(0, this.maze.solutionPath.length - 1));
    this.trail = buildPathTrail(this.maze.solutionPath.slice(0, this.demoCursor + 1), null);
    this.nextDemoMoveAtMs = 0;
    this.pendingMazeRebuild = false;
    this.optionFieldDrafts = createLegacyOptionFieldDrafts(this.settings);
    this.activeInputField = null;
    this.refreshLayout();
    this.boardStaticDirty = true;
    this.boardDynamicDirty = true;
    this.uiDirty = true;
  }

  private regenerateMaze(): void {
    this.mazeSeed = (this.mazeSeed + 1) >>> 0;
    this.rebuildMaze();
  }

  private enterMenuMode(): void {
    this.mode = 'menu';
    this.overlay = 'none';
    this.overlayReturn = 'none';
    this.regenerateMaze();
  }

  private startPlayMode(): void {
    this.mode = 'play';
    this.overlay = 'none';
    this.overlayReturn = 'none';
    this.player = copyPoint(this.maze.start);
    this.trail = [copyPoint(this.player)];
    this.playStartedAtMs = this.time.now;
    this.boardDynamicDirty = true;
    this.uiDirty = true;
  }

  private updateMenuDemo(time: number): void {
    if (time < this.nextDemoMoveAtMs) {
      return;
    }

    const path = this.maze.solutionPath;
    if (path.length === 0) {
      this.regenerateMaze();
      return;
    }

    if (this.demoCursor >= path.length - 1) {
      this.nextDemoMoveAtMs = time + DEMO_REGEN_HOLD_MS;
      this.regenerateMaze();
      return;
    }

    this.demoCursor += 1;
    const nextPoint = path[this.demoCursor];
    if (!nextPoint) {
      return;
    }

    this.player = copyPoint(nextPoint);
    this.trail = buildPathTrail(
      path.slice(0, this.demoCursor + 1),
      this.settings.toggleTrailFade ? TRAIL_FADE_TAIL : null
    );
    this.nextDemoMoveAtMs = time + DEMO_STEP_MS;
    this.boardDynamicDirty = true;
  }

  private tryMovePlayer(deltaX: number, deltaY: number): void {
    const next = movePoint(this.player, deltaX, deltaY);
    if (!isWalkableTile(this.maze, next)) {
      return;
    }

    this.player = next;
    this.trail.push(copyPoint(this.player));
    if (this.settings.toggleTrailFade && this.trail.length > TRAIL_FADE_TAIL) {
      this.trail = this.trail.slice(this.trail.length - TRAIL_FADE_TAIL);
    }

    if (next.x === this.maze.goal.x && next.y === this.maze.goal.y) {
      this.enterMenuMode();
      return;
    }

    this.boardDynamicDirty = true;
  }

  private createStars(): void {
    const starCount = 170;
    this.stars = Array.from({ length: starCount }, () => ({
      x: Math.random(),
      y: Math.random(),
      radius: 0.8 + (Math.random() * 2.3),
      speed: 0.014 + (Math.random() * 0.05),
      alpha: 0.28 + (Math.random() * 0.6)
    }));
  }

  private updateStars(delta: number): void {
    const speedScale = this.settings.darkMode ? 0.24 : 0.42;
    for (const star of this.stars) {
      star.y += star.speed * (delta / 1000) * speedScale;
      if (star.y > 1.05) {
        star.y = -0.05;
        star.x = Math.random();
      }
    }

    this.backdropDirty = true;
  }

  private drawBackdrop(): void {
    const { width, height } = this.layout;
    this.backdropGraphics.clear();

    const fieldColor = this.settings.darkMode ? 0x22172d : 0x2c1f3b;
    const glowColor = this.settings.darkMode ? 0x3b2a4f : 0x563b74;

    this.backdropGraphics.fillStyle(fieldColor, 1);
    this.backdropGraphics.fillRect(0, 0, width, height);
    this.backdropGraphics.fillStyle(glowColor, 0.24);
    this.backdropGraphics.fillCircle(width * 0.18, height * 0.24, Math.min(width, height) * 0.16);
    this.backdropGraphics.fillCircle(width * 0.82, height * 0.18, Math.min(width, height) * 0.14);
    this.backdropGraphics.fillCircle(width * 0.56, height * 0.82, Math.min(width, height) * 0.12);

    for (const star of this.stars) {
      this.backdropGraphics.fillStyle(0xffffff, star.alpha);
      this.backdropGraphics.fillRect(
        Math.round(star.x * width),
        Math.round(star.y * height),
        Math.max(1, Math.round(star.radius)),
        Math.max(1, Math.round(star.radius))
      );
    }

    this.backdropDirty = false;
  }

  private drawStaticBoard(): void {
    const { boardLeft, boardTop, boardSize, tileSize } = this.layout;
    const pathColor = linearColorToNumber(this.settings.pathColor);
    const wallColor = linearColorToNumber(this.settings.wallColor);
    const boardFill = this.settings.darkMode ? 0x221d25 : 0x4a454d;
    const boardEdge = this.settings.darkMode ? 0x0f0b10 : 0x2f2830;
    const pathGlow = this.settings.darkMode ? 0xb3acb8 : 0xd0cad2;

    this.boardStaticGraphics.clear();
    this.boardStaticGraphics.fillStyle(0x000000, 0.28);
    this.boardStaticGraphics.fillRect(boardLeft + BOARD_SHADOW_OFFSET, boardTop + BOARD_SHADOW_OFFSET, boardSize, boardSize);
    this.boardStaticGraphics.fillStyle(boardEdge, 1);
    this.boardStaticGraphics.fillRect(boardLeft - 6, boardTop - 8, boardSize + 12, boardSize + 12);
    this.boardStaticGraphics.fillStyle(boardFill, 0.96);
    this.boardStaticGraphics.fillRect(boardLeft, boardTop, boardSize, boardSize);

    for (let y = 0; y < this.maze.size; y += 1) {
      for (let x = 0; x < this.maze.size; x += 1) {
        const tileX = boardLeft + (x * tileSize);
        const tileY = boardTop + (y * tileSize);
        const walkable = this.maze.grid[y]?.[x] === true;

        this.boardStaticGraphics.fillStyle(walkable ? pathGlow : wallColor, 1);
        this.boardStaticGraphics.fillRect(tileX, tileY, tileSize, tileSize);

        if (walkable) {
          this.boardStaticGraphics.fillStyle(pathColor, 1);
          this.boardStaticGraphics.fillRect(
            tileX + 1,
            tileY + 1,
            Math.max(1, tileSize - 2),
            Math.max(1, tileSize - 2)
          );
        }
      }
    }

    this.titleText.setVisible(this.mode === 'menu');
    this.titleShadow.setVisible(this.mode === 'menu');
    this.boardStaticDirty = false;
  }

  private drawDynamicBoard(): void {
    const { boardLeft, boardTop, tileSize } = this.layout;
    this.boardDynamicGraphics.clear();

    const trail = this.mode === 'menu'
      ? this.trail
      : buildPathTrail(this.trail, this.settings.toggleTrailFade ? TRAIL_FADE_TAIL : null);
    const boardOffset = this.resolveBoardOffset();

    if (this.maze.start) {
      this.fillTile(this.boardDynamicGraphics, this.maze.start, 0xbca86f, boardLeft + boardOffset.x, boardTop + boardOffset.y, tileSize);
    }
    if (this.maze.goal) {
      this.fillTile(this.boardDynamicGraphics, this.maze.goal, 0xd81b2a, boardLeft + boardOffset.x, boardTop + boardOffset.y, tileSize);
    }

    for (let index = 0; index < trail.length; index += 1) {
      const point = trail[index];
      if (!point) {
        continue;
      }

      const alpha = this.mode === 'play'
        ? clamp(0.25 + ((index / Math.max(1, trail.length - 1)) * 0.75), 0.25, 1)
        : clamp(0.22 + ((index / Math.max(1, trail.length - 1)) * 0.82), 0.22, 1);
      this.fillTile(this.boardDynamicGraphics, point, 0x14b8d9, boardLeft + boardOffset.x, boardTop + boardOffset.y, tileSize, alpha, 1);
    }

    this.fillTile(this.boardDynamicGraphics, this.player, 0xf2f4f8, boardLeft + boardOffset.x, boardTop + boardOffset.y, tileSize, 1, 0);
    this.boardDynamicDirty = false;
  }

  private resolveBoardOffset(): Phaser.Math.Vector2 {
    if (this.mode !== 'play' || !this.settings.toggleCameraFollow) {
      return new Phaser.Math.Vector2(0, 0);
    }

    const xRatio = this.player.x / Math.max(1, this.maze.size - 1);
    const yRatio = this.player.y / Math.max(1, this.maze.size - 1);
    const offsetX = Math.round((0.5 - xRatio) * Math.min(42, this.layout.tileSize * 4));
    const offsetY = Math.round((0.5 - yRatio) * Math.min(42, this.layout.tileSize * 4));
    return new Phaser.Math.Vector2(offsetX, offsetY);
  }

  private fillTile(
    graphics: Phaser.GameObjects.Graphics,
    point: LegacyPoint,
    color: number,
    originX: number,
    originY: number,
    tileSize: number,
    alpha = 1,
    inset = 0
  ): void {
    graphics.fillStyle(color, alpha);
    graphics.fillRect(
      originX + (point.x * tileSize) + inset,
      originY + (point.y * tileSize) + inset,
      Math.max(1, tileSize - (inset * 2)),
      Math.max(1, tileSize - (inset * 2))
    );
  }

  private drawHud(time: number): void {
    this.hudGraphics.clear();
    this.clearHudTexts();
    if (this.mode !== 'play' || this.overlay !== 'none') {
      this.footerText.setText('');
      return;
    }

    this.footerText.setText('WASD or arrows to move   P to pause');

    const elapsed = formatClock(time - this.playStartedAtMs);
    const timerText = `Time ${elapsed}`;
    const arrowOriginX = this.layout.width - 130;
    const arrowOriginY = 58;
    const boardOffset = this.resolveBoardOffset();
    const goalScreenX = this.layout.boardLeft + boardOffset.x + (this.maze.goal.x * this.layout.tileSize);
    const goalScreenY = this.layout.boardTop + boardOffset.y + (this.maze.goal.y * this.layout.tileSize);
    const playerScreenX = this.layout.boardLeft + boardOffset.x + (this.player.x * this.layout.tileSize);
    const playerScreenY = this.layout.boardTop + boardOffset.y + (this.player.y * this.layout.tileSize);
    const angle = Phaser.Math.Angle.Between(playerScreenX, playerScreenY, goalScreenX, goalScreenY);
    const length = 36;

    this.hudGraphics.fillStyle(0x000000, 0.24);
    this.hudGraphics.fillRoundedRect(20, 18, 170, 42, 8);
    this.hudGraphics.lineStyle(1, 0xffffff, 0.18);
    this.hudGraphics.strokeRoundedRect(20, 18, 170, 42, 8);

    const timer = this.add.text(32, 29, timerText, {
      fontFamily: '"Courier New", monospace',
      fontSize: '20px',
      color: '#f2f2f4'
    });
    timer.setData('hud', true);
    this.uiTexts.push(timer);

    this.hudGraphics.lineStyle(3, 0xf4f6fa, 0.95);
    this.hudGraphics.beginPath();
    this.hudGraphics.moveTo(arrowOriginX, arrowOriginY);
    this.hudGraphics.lineTo(
      arrowOriginX + (Math.cos(angle) * length),
      arrowOriginY + (Math.sin(angle) * length)
    );
    this.hudGraphics.strokePath();
    this.hudGraphics.fillStyle(0xf4f6fa, 0.95);
    this.hudGraphics.fillTriangle(
      arrowOriginX + (Math.cos(angle) * length),
      arrowOriginY + (Math.sin(angle) * length),
      arrowOriginX + (Math.cos(angle + 2.4) * 12),
      arrowOriginY + (Math.sin(angle + 2.4) * 12),
      arrowOriginX + (Math.cos(angle - 2.4) * 12),
      arrowOriginY + (Math.sin(angle - 2.4) * 12)
    );
  }

  private clearHudTexts(): void {
    this.uiTexts.forEach((text) => {
      if (text.getData('hud') === true) {
        text.destroy();
      }
    });
    this.uiTexts = this.uiTexts.filter((text) => text.active);
  }

  private clearPlayHudImmediately(): void {
    this.hudGraphics.clear();
    this.clearHudTexts();
    this.footerText.setText('');
  }

  private rebuildUi(): void {
    this.overlayGraphics.clear();
    this.clearUi();

    if (this.overlay === 'none') {
      if (this.mode === 'menu') {
        const [leftLabel, centerLabel, rightLabel] = MAIN_MENU_BUTTONS;
        this.uiButtons.push(
          this.createButton(
            this.layout.leftButtonX,
            this.layout.buttonY,
            this.layout.buttonWidth,
            this.layout.buttonHeight,
            leftLabel,
            () => this.showExitMessage()
          ),
          this.createButton(
            this.layout.centerButtonX,
            this.layout.buttonY,
            this.layout.buttonWidth,
            this.layout.buttonHeight,
            centerLabel,
            () => this.startPlayMode()
          ),
          this.createButton(
            this.layout.rightButtonX,
            this.layout.buttonY,
            this.layout.buttonWidth,
            this.layout.buttonHeight,
            rightLabel,
            () => this.openOverlay('options')
          )
        );
      }

      this.uiDirty = false;
      return;
    }

    this.drawOverlayPanel();

    switch (this.overlay) {
      case 'options':
        this.buildOptionsOverlay();
        break;
      case 'features':
        this.buildFeaturesOverlay();
        break;
      case 'gameModes':
        this.buildGameModesOverlay();
        break;
      case 'pause':
        this.buildPauseOverlay();
        break;
      case 'message':
        this.buildMessageOverlay();
        break;
    }

    this.uiDirty = false;
  }

  private drawOverlayPanel(): void {
    const panel = this.resolveOverlayPanelFrame();

    this.overlayGraphics.fillStyle(0x06060b, 0.76);
    this.overlayGraphics.fillRect(0, 0, this.layout.width, this.layout.height);
    this.overlayGraphics.fillStyle(0x18151f, 0.96);
    this.overlayGraphics.fillRoundedRect(panel.left, panel.top, panel.width, panel.height, 12);
    this.overlayGraphics.lineStyle(2, 0x5f5866, 0.92);
    this.overlayGraphics.strokeRoundedRect(panel.left, panel.top, panel.width, panel.height, 12);
  }

  private resolveOverlayPanelFrame(): OverlayPanelFrame {
    const width = Math.min(720, this.layout.width - 40);
    const height = Math.min(620, this.layout.height - 72);
    const left = Math.round((this.layout.width - width) / 2);
    const top = Math.round((this.layout.height - height) / 2);

    return {
      centerX: left + Math.round(width / 2),
      height,
      left,
      top,
      width
    };
  }

  private buildOptionsOverlay(): void {
    const panel = this.resolveOverlayPanelFrame();
    let rowY = panel.top + 72;
    this.createOverlayTitle('Options', panel.top + 54);

    rowY = this.createInputRow('Maze Scale', 'scale', rowY, panel);
    rowY = this.createInputRow('Camera Scale', 'camScale', rowY, panel);
    rowY = this.createColorInputRow('Path RGB', ['pathR', 'pathG', 'pathB'], rowY, panel, this.settings.pathColor);
    rowY = this.createColorInputRow('Wall RGB', ['wallR', 'wallG', 'wallB'], rowY, panel, this.settings.wallColor);

    const buttonY = panel.top + panel.height - 140;
    const utilityButtonWidth = panel.width < 420 ? 124 : 170;
    this.uiButtons.push(
      this.createButton(panel.centerX - Math.round(panel.width * 0.24), buttonY, utilityButtonWidth, 54, 'Features', () => this.openNestedOverlay('features', 'options')),
      this.createButton(panel.centerX + Math.round(panel.width * 0.24), buttonY, utilityButtonWidth, 54, 'Game Modes', () => this.openNestedOverlay('gameModes', 'options')),
      this.createButton(panel.centerX, buttonY + 76, Math.min(180, panel.width - 96), 54, 'Back', () => this.handleBackAction())
    );
  }

  private buildFeaturesOverlay(): void {
    const panel = this.resolveOverlayPanelFrame();
    let rowY = panel.top + 54;
    this.createOverlayTitle('Features', rowY);
    rowY += 72;

    rowY = this.createToggleRow('Camera Follow', this.settings.toggleCameraFollow, rowY, panel, () => {
      this.settings.toggleCameraFollow = !this.settings.toggleCameraFollow;
      this.boardDynamicDirty = true;
      this.uiDirty = true;
    });

    rowY = this.createToggleRow('Trail Fade', this.settings.toggleTrailFade, rowY, panel, () => {
      this.settings.toggleTrailFade = !this.settings.toggleTrailFade;
      this.boardDynamicDirty = true;
      this.uiDirty = true;
    });

    this.uiButtons.push(
      this.createButton(panel.centerX, panel.top + panel.height - 120, Math.min(180, panel.width - 96), 54, 'Back', () => this.handleBackAction())
    );
  }

  private buildGameModesOverlay(): void {
    const panel = this.resolveOverlayPanelFrame();
    let rowY = panel.top + 54;
    this.createOverlayTitle('Game Modes', rowY);
    rowY += 72;

    this.createToggleRow('Dark Mode', this.settings.darkMode, rowY, panel, () => {
      this.settings.darkMode = !this.settings.darkMode;
      this.backdropDirty = true;
      this.boardStaticDirty = true;
      this.boardDynamicDirty = true;
      this.uiDirty = true;
    });

    this.uiButtons.push(
      this.createButton(panel.centerX, panel.top + panel.height - 120, Math.min(180, panel.width - 96), 54, 'Back', () => this.handleBackAction())
    );
  }

  private buildPauseOverlay(): void {
    const panel = this.resolveOverlayPanelFrame();
    let rowY = panel.top + 54;
    this.createOverlayTitle('Paused', rowY);
    rowY += 72;

    this.createInputRow('Camera Scale', 'camScale', rowY, panel);

    const stacked = panel.width < 420;
    if (stacked) {
      this.uiButtons.push(
        this.createButton(panel.centerX - 78, panel.top + panel.height - 196, 132, 54, 'Back', () => this.closeOverlay()),
        this.createButton(panel.centerX + 78, panel.top + panel.height - 196, 132, 54, 'Reset', () => {
          this.player = copyPoint(this.maze.start);
          this.trail = [copyPoint(this.player)];
          this.closeOverlay();
          this.boardDynamicDirty = true;
        }),
        this.createButton(panel.centerX, panel.top + panel.height - 120, Math.min(180, panel.width - 96), 54, 'Main Menu', () => this.enterMenuMode()),
        this.createButton(panel.centerX, panel.top + panel.height - 56, Math.min(180, panel.width - 96), 46, 'Features', () => this.openNestedOverlay('features', 'pause'))
      );
      return;
    }

    this.uiButtons.push(
      this.createButton(panel.centerX - Math.round(panel.width * 0.28), panel.top + panel.height - 196, 132, 54, 'Back', () => this.closeOverlay()),
      this.createButton(panel.centerX, panel.top + panel.height - 196, 132, 54, 'Reset', () => {
        this.player = copyPoint(this.maze.start);
        this.trail = [copyPoint(this.player)];
        this.closeOverlay();
        this.boardDynamicDirty = true;
      }),
      this.createButton(panel.centerX + Math.round(panel.width * 0.28), panel.top + panel.height - 196, 144, 54, 'Main Menu', () => this.enterMenuMode()),
      this.createButton(panel.centerX, panel.top + panel.height - 120, Math.min(180, panel.width - 96), 54, 'Features', () => this.openNestedOverlay('features', 'pause'))
    );
  }

  private buildMessageOverlay(): void {
    const panel = this.resolveOverlayPanelFrame();
    this.createOverlayTitle('Exit', panel.top + 76);
    const body = this.add.text(panel.centerX, panel.top + 190, this.messageText, {
      fontFamily: '"Courier New", monospace',
      fontSize: '22px',
      color: '#f2f2f4',
      align: 'center',
      wordWrap: { width: panel.width - 120 }
    }).setOrigin(0.5);
    this.uiTexts.push(body);
    this.uiButtons.push(
      this.createButton(panel.centerX, panel.top + panel.height - 120, Math.min(180, panel.width - 96), 54, 'Back', () => this.closeOverlay())
    );
  }

  private selectOverlayField(fieldId: LegacyOptionFieldId): void {
    if (this.activeInputField && this.activeInputField !== fieldId) {
      this.commitOverlayField(this.activeInputField);
    }

    this.activeInputField = fieldId;
    this.uiDirty = true;
  }

  private commitOverlayField(fieldId: LegacyOptionFieldId): void {
    const result = applyLegacyOptionField(this.settings, this.optionFieldDrafts, fieldId);
    const previousScale = this.settings.scale;

    this.settings = result.settings;
    this.optionFieldDrafts = result.drafts;

    if (result.affectsMaze) {
      this.pendingMazeRebuild = true;
      this.boardStaticDirty = true;
      this.boardDynamicDirty = true;
    }
    if (result.affectsCamera || this.settings.scale !== previousScale) {
      this.refreshLayout();
    }

    this.uiDirty = true;
  }

  private commitAllOverlayFields(): void {
    const fieldIds: LegacyOptionFieldId[] = this.overlay === 'pause'
      ? ['camScale']
      : ['scale', 'camScale', 'pathR', 'pathG', 'pathB', 'wallR', 'wallG', 'wallB'];

    for (const fieldId of fieldIds) {
      this.commitOverlayField(fieldId);
    }

    this.activeInputField = null;
  }

  private createOverlayTitle(text: string, y: number): void {
    const label = this.add.text(this.layout.width / 2, y, text, {
      fontFamily: '"Courier New", monospace',
      fontSize: '34px',
      color: '#6bc96f'
    }).setOrigin(0.5);
    this.uiTexts.push(label);
  }

  private createInputRow(
    label: string,
    fieldId: LegacyOptionFieldId,
    y: number,
    panel: OverlayPanelFrame
  ): number {
    const stacked = panel.width < 420;
    const labelX = panel.left + 28;
    const rowLabel = this.add.text(labelX, y, label, {
      fontFamily: '"Courier New", monospace',
      fontSize: stacked ? '20px' : '22px',
      color: '#d9d8df'
    }).setOrigin(0, 0.5);

    this.uiTexts.push(rowLabel);
    this.createInputFieldBox(
      stacked ? panel.centerX : panel.left + Math.round(panel.width * 0.72),
      stacked ? y + 34 : y,
      stacked ? panel.width - 56 : Math.min(188, Math.round(panel.width * 0.38)),
      44,
      fieldId,
      this.optionFieldDrafts[fieldId]
    );

    return y + (stacked ? 82 : 58);
  }

  private createColorInputRow(
    label: string,
    fieldIds: [LegacyOptionFieldId, LegacyOptionFieldId, LegacyOptionFieldId],
    y: number,
    panel: OverlayPanelFrame,
    color: { r: number; g: number; b: number }
  ): number {
    const stacked = panel.width < 420;
    const swatch = linearColorToHex(color);

    const rowLabel = this.add.text(panel.left + 28, y, label, {
      fontFamily: '"Courier New", monospace',
      fontSize: '20px',
      color: '#d9d8df'
    }).setOrigin(0, 0.5);
    const swatchLabel = this.add.text(panel.left + panel.width - 72, y, swatch, {
      fontFamily: '"Courier New", monospace',
      fontSize: stacked ? '16px' : '18px',
      color: swatch
    }).setOrigin(0.5);

    this.uiTexts.push(rowLabel, swatchLabel);
    const startX = stacked ? panel.left + 58 : panel.left + Math.round(panel.width * 0.46);
    const spacing = stacked ? Math.round((panel.width - 116) / 2) : 122;
    const inputY = stacked ? y + 38 : y;
    const channelLabelY = stacked ? y + 14 : y - 24;

    for (const [index, fieldId] of fieldIds.entries()) {
      const caption = this.add.text(startX + (spacing * index), channelLabelY, ['R', 'G', 'B'][index] ?? '', {
        fontFamily: '"Courier New", monospace',
        fontSize: '14px',
        color: '#6bc96f'
      }).setOrigin(0.5);
      this.uiTexts.push(caption);
      this.createInputFieldBox(
        startX + (spacing * index),
        inputY,
        stacked ? 84 : 100,
        42,
        fieldId,
        this.optionFieldDrafts[fieldId]
      );
    }

    return y + (stacked ? 92 : 82);
  }

  private createInputFieldBox(
    x: number,
    y: number,
    width: number,
    height: number,
    fieldId: LegacyOptionFieldId,
    value: string
  ): void {
    const isActive = this.activeInputField === fieldId;
    const background = this.add.rectangle(x, y, width, height, 0xffffff, isActive ? 0.18 : 0.08);
    background.setStrokeStyle(2, isActive ? 0x6bc96f : 0xb8b1c1, isActive ? 0.95 : 0.32);
    background.setInteractive({ useHandCursor: true });
    background.on('pointerdown', () => this.selectOverlayField(fieldId));

    const label = this.add.text(x, y, value, {
      fontFamily: '"Courier New", monospace',
      fontSize: `${Math.max(14, Math.min(22, Math.round(height * 0.38)))}px`,
      color: isActive ? '#7cf58f' : '#f0f0f4'
    }).setOrigin(0.5);

    this.uiButtons.push({
      background,
      label,
      setActive: () => undefined,
      destroy: () => {
        background.destroy();
        label.destroy();
      }
    });
  }

  private createToggleRow(
    label: string,
    value: boolean,
    y: number,
    panel: OverlayPanelFrame,
    onToggle: () => void
  ): number {
    const stacked = panel.width < 420;
    const rowLabel = this.add.text(panel.left + 28, y, label, {
      fontFamily: '"Courier New", monospace',
      fontSize: stacked ? '20px' : '22px',
      color: '#d9d8df'
    }).setOrigin(0, 0.5);
    const stateText = this.add.text(
      stacked ? panel.left + 64 : panel.left + Math.round(panel.width * 0.64),
      stacked ? y + 32 : y,
      value ? 'Off' : 'On',
      {
      fontFamily: '"Courier New", monospace',
      fontSize: stacked ? '18px' : '22px',
      color: '#6bc96f'
      }
    ).setOrigin(0.5);
    this.uiTexts.push(rowLabel, stateText);
    this.uiButtons.push(
      this.createButton(
        stacked ? panel.left + panel.width - 92 : panel.left + Math.round(panel.width * 0.82),
        stacked ? y + 32 : y,
        stacked ? 136 : 120,
        44,
        value ? 'Disable' : 'Enable',
        onToggle
      )
    );

    return y + (stacked ? 84 : 64);
  }

  private createButton(
    x: number,
    y: number,
    width: number,
    height: number,
    text: string,
    onClick: () => void
  ): UiButton {
    const background = this.add.rectangle(x, y, width, height, 0xffffff, MENU_BUTTON_ALPHA);
    background.setStrokeStyle(2, 0xb8b1c1, MENU_BUTTON_STROKE_ALPHA);
    background.setInteractive({ useHandCursor: true });

    const label = this.add.text(x, y, text, {
      fontFamily: '"Courier New", monospace',
      fontSize: `${Math.max(18, Math.min(40, Math.round(height * 0.48)))}px`,
      color: MENU_TEXT_COLOR
    }).setOrigin(0.5);

    const setActive = (active: boolean): void => {
      background.setFillStyle(0xffffff, active ? 0.28 : MENU_BUTTON_ALPHA);
      background.setStrokeStyle(2, 0xffffff, active ? 0.36 : MENU_BUTTON_STROKE_ALPHA);
      label.setAlpha(active ? 1 : 0.92);
    };

    background.on('pointerover', () => setActive(true));
    background.on('pointerout', () => setActive(false));
    background.on('pointerdown', onClick);

    return {
      background,
      label,
      setActive,
      destroy: () => {
        background.destroy();
        label.destroy();
      }
    };
  }

  private clearUi(): void {
    for (const button of this.uiButtons) {
      button.destroy();
    }
    this.uiButtons = [];

    for (const text of this.uiTexts) {
      if (text.active) {
        text.destroy();
      }
    }
    this.uiTexts = [];
  }

  private openNestedOverlay(kind: OverlayKind, returnTo: OverlayKind): void {
    this.activeInputField = null;
    if (this.mode === 'play') {
      this.clearPlayHudImmediately();
    }
    this.overlay = kind;
    this.overlayReturn = returnTo;
    this.boardDynamicDirty = true;
    this.uiDirty = true;
  }

  private openOverlay(kind: OverlayKind): void {
    if (kind === 'options' || kind === 'pause') {
      this.optionFieldDrafts = createLegacyOptionFieldDrafts(this.settings);
    }
    this.activeInputField = null;
    if (this.mode === 'play') {
      this.clearPlayHudImmediately();
    }
    this.overlay = kind;
    this.overlayReturn = 'none';
    this.boardDynamicDirty = true;
    this.uiDirty = true;
  }

  private closeOverlay(): void {
    if (this.overlay === 'options' || this.overlay === 'pause') {
      this.commitAllOverlayFields();
    }
    this.overlay = 'none';
    this.overlayReturn = 'none';
    if (this.pendingMazeRebuild) {
      this.regenerateMaze();
    }
    this.activeInputField = null;
    if (this.mode === 'play') {
      this.clearPlayHudImmediately();
    }
    this.boardDynamicDirty = true;
    this.uiDirty = true;
  }

  private handleBackAction(): void {
    if (this.overlay === 'none') {
      if (this.mode === 'play') {
        this.openOverlay('pause');
      }
      return;
    }

    if (this.overlayReturn !== 'none') {
      this.overlay = this.overlayReturn;
      this.overlayReturn = 'none';
      this.boardDynamicDirty = true;
      this.uiDirty = true;
      return;
    }

    this.closeOverlay();
  }

  private showExitMessage(): void {
    this.messageText = 'The original project used the engine quit command. Browser builds cannot close the tab directly, so Exit is preserved as UI but not as hard quit behavior.';
    this.messageVisibleUntilMs = this.time.now + MESSAGE_DURATION_MS;
    this.openOverlay('message');
  }
}
