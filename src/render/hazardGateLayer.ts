/**
 * Canvas-2D renderer for the Pulse Gate layer (slice H3, HAZ-004). It owns presentation only: the
 * open/closed state always comes from the source (the scene's gate controller), never from here
 * (graph contract, Rendering row).
 *
 * Identity by shape before colour: a gate is a magenta fence of three bars standing across the
 * corridor (perpendicular to travel), spanning 0.8 of the tile (the glyph floor is 0.7 tile).
 * Every bar sits on a dark keyline (the board void colour, like the end markers' keyline): magenta
 * alone is only ~2.1:1 against the mid-tone chip floor, while the keyline is >= 3:1 against the
 * floor and the magenta (also at the open alpha) is >= 3:1 against the keyline (tests).
 *
 * Telegraph (graph contract, arrival-tick rule): the bar STYLE shows the gate's NEXT-tick state, the
 * one the arrival rule consumes. Solid bars = closed next tick (do not step in); dashed bars = open
 * next tick. The bar ALPHA shows the current tick: full when closed now, dimmer when open now. So the
 * four states read without motion:
 *   open now, open next     dashed, dim     (pass)
 *   open now, closed next   solid,  dim     (closing: dashes went solid one tick early)
 *   closed now, closed next solid,  full    (closed)
 *   closed now, open next   dashed, full    (opening)
 * With motion allowed, a closing gate's alpha also ramps from dim to full across the tick in a few
 * quantised steps. Reduced motion shows the static state only (product contract: telegraphs become
 * static states).
 *
 * Allocation-free: one shared dash array mutated in place, no closures, no per-gate objects. The
 * caller clears and redraws only when its dirty key changes.
 */
import { boardMaterial } from './boardTileStyle';
import { HAZARD_GATE_MAGENTA } from './palette';

/** Pulse Gate magenta (identity colour). Floor contrast comes from the keyline, see the header. */
export const HAZARD_GATE_COLOR: number = HAZARD_GATE_MAGENTA;
/** Dark keyline under every bar: the board void colour. */
export const HAZARD_GATE_KEYLINE_COLOR: number = boardMaterial.void;
/** Keyline width on each side of a bar, as a share of the tile (at least half a logical px). */
export const HAZARD_GATE_KEYLINE_RATIO = 0.04;
/** Alpha of a gate that is open on the current tick. */
export const HAZARD_GATE_OPEN_ALPHA = 0.72;
/** Fence span across the corridor as a fraction of the tile (glyph floor 0.7). */
export const HAZARD_GATE_SPAN_RATIO = 0.8;
/** Steps the closing ramp is quantised into (each step is one redraw at most). */
export const HAZARD_GATE_RAMP_STEPS = 4;

export interface HazardGateLayerSource {
  readonly gateCount: number;
  gateX(index: number): number;
  gateY(index: number): number;
  /** 0: corridor runs left-right (bars stand vertical); 1: up-down (bars lie horizontal). */
  gateAxis(index: number): 0 | 1;
  isOpenAt(index: number, tick: number): boolean;
}

export interface HazardGateLayerFrame {
  /** Canvas-local position of grid cell (0, 0), in logical px. */
  readonly originX: number;
  readonly originY: number;
  readonly tileSize: number;
  /** The world clock's current tick. */
  readonly tick: number;
  /** Quantised progress toward the next tick, 0..HAZARD_GATE_RAMP_STEPS-1 (ignored with reduced motion). */
  readonly rampStep: number;
  readonly reducedMotion: boolean;
  /** Board-level fade (the reveal/deconstruct cast alpha), 0..1. */
  readonly alpha: number;
}

const dashPattern: number[] = [0, 0];
const solidPattern: number[] = [];

const toCssColor = (color: number, alpha: number): string => (
  `rgba(${(color >> 16) & 0xff}, ${(color >> 8) & 0xff}, ${color & 0xff}, ${alpha})`
);

const GATE_SOLID_STYLE = toCssColor(HAZARD_GATE_COLOR, 1);
const GATE_KEYLINE_STYLE = toCssColor(HAZARD_GATE_KEYLINE_COLOR, 1);

/** Quantised ramp step for a tick fraction (0..1), clamped into 0..HAZARD_GATE_RAMP_STEPS-1. */
export const resolveHazardGateRampStep = (remainderMs: number, tickMs: number): number => {
  if (!(tickMs > 0) || !(remainderMs > 0)) {
    return 0;
  }
  const step = Math.floor((remainderMs / tickMs) * HAZARD_GATE_RAMP_STEPS);
  return step < 0 ? 0 : (step >= HAZARD_GATE_RAMP_STEPS ? HAZARD_GATE_RAMP_STEPS - 1 : step);
};

/** The alpha one gate is drawn at, from its current/next state (exported for the state table test). */
export const resolveHazardGateAlpha = (
  openNow: boolean,
  openNext: boolean,
  rampStep: number,
  reducedMotion: boolean
): number => {
  if (!openNow) {
    return 1;
  }
  if (openNext || reducedMotion) {
    return HAZARD_GATE_OPEN_ALPHA;
  }
  const ramp = (rampStep + 1) / HAZARD_GATE_RAMP_STEPS;
  return HAZARD_GATE_OPEN_ALPHA + ((1 - HAZARD_GATE_OPEN_ALPHA) * ramp);
};

/** Clears every gate cell rect (the only pixels this layer ever paints). */
export const clearHazardGateCells = (
  context: Pick<CanvasRenderingContext2D, 'clearRect'>,
  source: HazardGateLayerSource,
  originX: number,
  originY: number,
  tileSize: number
): void => {
  for (let index = 0; index < source.gateCount; index += 1) {
    context.clearRect(
      originX + (source.gateX(index) * tileSize) - 1,
      originY + (source.gateY(index) * tileSize) - 1,
      tileSize + 2,
      tileSize + 2
    );
  }
};

/** The slice of a Phaser CanvasTexture this layer uses (kept structural so it tests without Phaser). */
export interface HazardGateCanvasTextureLike {
  readonly context: CanvasRenderingContext2D;
  setSize(width: number, height: number): unknown;
  clear(x?: number, y?: number, width?: number, height?: number, update?: boolean): unknown;
  refresh(): unknown;
}

export interface HazardGateCanvasImageLike {
  setPosition(x: number, y: number): unknown;
  setDisplaySize(width: number, height: number): unknown;
  setVisible(visible: boolean): unknown;
}

export interface HazardGateCanvasSource extends HazardGateLayerSource {
  /** Changes whenever the gate set changes (a new maze was installed). */
  readonly version: number;
  readonly boardWidth: number;
  readonly boardHeight: number;
}

export interface HazardGateCanvasLayout {
  /** Board-space position of grid cell (0, 0). */
  readonly mazeLeft: number;
  readonly mazeTop: number;
  readonly tileSize: number;
  /** Backing-store pixels per logical px (DPR times zoom, capped by the caller). */
  readonly resolution: number;
}

/**
 * The gate layer's own canvas: one texture covering the board, redrawn only when something visible
 * changed (gate set, layout, tick, ramp step, motion preference or fade). A same-layout redraw clears
 * only the gate cells; a layout or gate-set change resizes or fully clears first.
 */
export class HazardGateCanvasView {
  private width = 0;
  private height = 0;
  private resolution = 0;
  private version = -1;
  private left = Number.NaN;
  private top = Number.NaN;
  private tileSize = 0;
  private tick = -1;
  private rampStep = -1;
  private reducedMotion = false;
  private alpha = -1;
  private visible = false;
  /** Redraws performed (diagnostics and the no-redraw-when-idle test). */
  public redraws = 0;

  public constructor(
    private readonly texture: HazardGateCanvasTextureLike,
    private readonly image: HazardGateCanvasImageLike
  ) {}

  public hide(): void {
    if (this.visible) {
      this.image.setVisible(false);
      this.visible = false;
    }
  }

  /** Draws the gates for `tick` when anything visible changed; a no-op otherwise. */
  public draw(
    source: HazardGateCanvasSource,
    layout: HazardGateCanvasLayout,
    tick: number,
    rampStep: number,
    reducedMotion: boolean,
    alpha: number
  ): void {
    if (source.gateCount === 0 || !(layout.tileSize > 0) || !(alpha > 0)) {
      this.hide();
      return;
    }
    const left = Math.round(layout.mazeLeft);
    const top = Math.round(layout.mazeTop);
    const width = Math.max(1, Math.ceil(source.boardWidth * layout.tileSize) + 2);
    const height = Math.max(1, Math.ceil(source.boardHeight * layout.tileSize) + 2);
    const backingWidth = Math.max(1, Math.ceil(width * layout.resolution));
    const backingHeight = Math.max(1, Math.ceil(height * layout.resolution));
    const step = reducedMotion ? 0 : rampStep;
    const layoutChanged = left !== this.left || top !== this.top || layout.tileSize !== this.tileSize
      || layout.resolution !== this.resolution || source.version !== this.version;
    if (
      !layoutChanged && this.visible && tick === this.tick && step === this.rampStep
      && reducedMotion === this.reducedMotion && alpha === this.alpha
    ) {
      return;
    }
    const context = this.texture.context;
    if (backingWidth !== this.width || backingHeight !== this.height) {
      this.texture.setSize(backingWidth, backingHeight);
      this.width = backingWidth;
      this.height = backingHeight;
    } else if (layoutChanged) {
      this.texture.clear(0, 0, backingWidth, backingHeight, false);
    }
    context.setTransform(layout.resolution, 0, 0, layout.resolution, 0, 0);
    drawHazardGatesToCanvasContext(context, source, {
      originX: layout.mazeLeft - left + 1,
      originY: layout.mazeTop - top + 1,
      tileSize: layout.tileSize,
      tick,
      rampStep: step,
      reducedMotion,
      alpha
    });
    this.texture.refresh();
    if (layoutChanged || !this.visible) {
      // Whole-px origin: the CANVAS renderer floors an Image position (src/render/pixelAlignment.ts).
      this.image.setPosition(left - 1, top - 1);
      this.image.setDisplaySize(width, height);
      this.image.setVisible(true);
      this.visible = true;
    }
    this.left = left;
    this.top = top;
    this.tileSize = layout.tileSize;
    this.resolution = layout.resolution;
    this.version = source.version;
    this.tick = tick;
    this.rampStep = step;
    this.reducedMotion = reducedMotion;
    this.alpha = alpha;
    this.redraws += 1;
  }
}

export const drawHazardGatesToCanvasContext = (
  context: CanvasRenderingContext2D,
  source: HazardGateLayerSource,
  frame: HazardGateLayerFrame
): void => {
  const { tileSize } = frame;
  clearHazardGateCells(context, source, frame.originX, frame.originY, tileSize);
  if (source.gateCount === 0 || !(tileSize > 0) || !(frame.alpha > 0)) {
    return;
  }
  const span = tileSize * HAZARD_GATE_SPAN_RATIO;
  const inset = (tileSize - span) / 2;
  const barWidth = Math.max(1, tileSize * 0.13);
  const keylineWidth = barWidth + (2 * Math.max(0.5, tileSize * HAZARD_GATE_KEYLINE_RATIO));
  const gap = span / 4;
  dashPattern[0] = Math.max(1, span / 7);
  dashPattern[1] = Math.max(1, span / 9);
  context.save();
  context.lineCap = 'butt';
  for (let index = 0; index < source.gateCount; index += 1) {
    const openNow = source.isOpenAt(index, frame.tick);
    const openNext = source.isOpenAt(index, frame.tick + 1);
    context.setLineDash(openNext ? dashPattern : solidPattern);
    const left = frame.originX + (source.gateX(index) * tileSize);
    const top = frame.originY + (source.gateY(index) * tileSize);
    const vertical = source.gateAxis(index) === 0;
    context.beginPath();
    for (let bar = 1; bar <= 3; bar += 1) {
      const offset = inset + (gap * bar);
      if (vertical) {
        context.moveTo(left + offset, top + inset);
        context.lineTo(left + offset, top + inset + span);
      } else {
        context.moveTo(left + inset, top + offset);
        context.lineTo(left + inset + span, top + offset);
      }
    }
    // Keyline first (board fade only, never dimmed), then the magenta bars on the same path.
    context.globalAlpha = frame.alpha;
    context.strokeStyle = GATE_KEYLINE_STYLE;
    context.lineWidth = keylineWidth;
    context.stroke();
    context.globalAlpha = frame.alpha * resolveHazardGateAlpha(openNow, openNext, frame.rampStep, frame.reducedMotion);
    context.strokeStyle = GATE_SOLID_STYLE;
    context.lineWidth = barWidth;
    context.stroke();
  }
  context.restore();
};
