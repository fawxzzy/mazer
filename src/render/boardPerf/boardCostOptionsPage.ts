/**
 * board-cost-options.html page body (not a build input, not imported by the game): boots the real game, applies the
 * chosen board-layer option, and shows a bar with the options, the frame times measured headless for each
 * (boardCostMeasurements.ts) and a live frame meter. The long trail, the walk and the frame meter reuse the trail cost
 * page's harness (trailPerf/trailPerfOptionsHarness.ts), so both pages measure the same way.
 *
 * Hooks (for scripts/analysis/board-cost-options-bench.mjs): window.__MAZER_BOARD_COST__ (this page) and
 * window.__MAZER_TRAIL_PERF__ (the trail harness).
 */
import Phaser from 'phaser';
import { resolveMazerCanvasResolution } from '../../boot/canvasResolution';
import { installExactImageBlit, type ExactBlitImageLike, type ExactImageBlitStats } from '../exactImageBlit';
import { createTrailPerfHarness, isPlayReady, type TrailPerfHarness } from '../trailPerf/trailPerfOptionsHarness';
import { BOARD_COST_SETUP, describeBoardCostMeasurement } from './boardCostMeasurements';
import { BOARD_COST_VARIANTS, capDevicePixelRatio, findBoardCostVariant, type BoardCostVariantId } from './boardCostVariants';

interface SceneLike { boardTileLayer?: { image: ExactBlitImageLike }; refreshLayout?: () => void }
interface GameLike { canvas: HTMLCanvasElement; scene: { scenes: SceneLike[] } }

const findScene = (): SceneLike | null => {
  const game = (window as unknown as { __MAZER_GAME__?: GameLike }).__MAZER_GAME__;
  return game?.scene?.scenes?.find((scene) => Boolean(scene.boardTileLayer)) ?? null;
};

/** Trail painting off: today's plan with every layer off (the trail canvas is still cleared and drawn, as in the game). */
const TRAIL_OFF = { bloom: 'off', thread: 'off', keyline: false, fills: false } as const;

export interface BoardCostHarness {
  readonly variant: BoardCostVariantId;
  /**
   * Switch option in place: same maze, same trail, same frame. The canvas cap of B and C is applied the way the boot
   * path applies it (the device pixel ratio the game reads), then the scene re-lays out, so the canvas and the board
   * bake are rebuilt at the new scale. Loading the page with ?boardVariant=B applies it before boot instead.
   */
  select(id: BoardCostVariantId): void;
  /** Exact-copy counters (null when the option does not copy the board 1:1). */
  exactStats(): ExactImageBlitStats | null;
  /** Trail painting on (today's painter) or off. */
  setTrailPaint(on: boolean): void;
  readonly trailPaint: boolean;
  readonly trail: TrailPerfHarness;
}

export const startBoardCostOptionsPage = (variantId: BoardCostVariantId, realDevicePixelRatio: number): void => {
  let variant = findBoardCostVariant(variantId);
  const params = new URLSearchParams(window.location.search);
  const trail = createTrailPerfHarness('shipped');
  let trailPaint = params.get('trailPaint') !== '0';
  let exact: { stats: ExactImageBlitStats; uninstall: () => void } | null = null;
  let exactImage: ExactBlitImageLike | null = null;
  let appliedCap = variant.canvasScaleCap;

  const applyTrailPaint = (): void => {
    if (trailPaint) trail.select('shipped');
    else trail.usePlan(TRAIL_OFF);
  };
  applyTrailPaint();

  // The exact copy follows the option; re-checked every 250 ms, since a scene restart builds a new board layer.
  const syncExact = (): void => {
    const image = findScene()?.boardTileLayer?.image ?? null;
    if (exact && (!variant.exactBoard || image !== exactImage)) {
      exact.uninstall();
      exact = null;
      exactImage = null;
    }
    if (!variant.exactBoard || !image || exact) return;
    exactImage = image;
    exact = installExactImageBlit(
      image,
      () => resolveMazerCanvasResolution(),
      () => new Phaser.GameObjects.Components.TransformMatrix()
    );
  };
  const applyCanvasCap = (): void => {
    if (variant.canvasScaleCap === appliedCap) return;
    appliedCap = variant.canvasScaleCap;
    const ratio = capDevicePixelRatio(realDevicePixelRatio, appliedCap);
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, get: () => ratio });
    findScene()?.refreshLayout?.();
  };

  const harness: BoardCostHarness = {
    get variant() { return variant.id; },
    select(id) {
      variant = findBoardCostVariant(id);
      applyCanvasCap();
      syncExact();
      const url = new URL(window.location.href);
      url.searchParams.set('boardVariant', variant.id);
      window.history.replaceState(null, '', url.toString());
      renderBar();
    },
    exactStats: () => (exact ? { ...exact.stats } : null),
    setTrailPaint(on) {
      trailPaint = on;
      applyTrailPaint();
    },
    get trailPaint() { return trailPaint; },
    trail
  };
  const w = window as unknown as { __MAZER_BOARD_COST__?: BoardCostHarness; __MAZER_TRAIL_PERF__?: TrailPerfHarness };
  w.__MAZER_BOARD_COST__ = harness;
  w.__MAZER_TRAIL_PERF__ = trail;

  // ---- bar (styles live in board-cost-options.html, out of src/ for the colour-literal ratchet) ----
  const bar = document.createElement('div');
  bar.id = 'board-cost-bar';
  bar.setAttribute('role', 'region');
  bar.setAttribute('aria-label', 'Board layer cost options');
  const pickRow = document.createElement('div');
  pickRow.className = 'row';
  const look = document.createElement('div');
  look.className = 'look';
  const measured = document.createElement('div');
  measured.className = 'nums measured';
  const live = document.createElement('div');
  live.className = 'nums live';
  bar.append(pickRow, look, measured, live);

  const optionButtons = BOARD_COST_VARIANTS.map((option) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = option.name;
    button.addEventListener('click', () => harness.select(option.id));
    pickRow.appendChild(button);
    return { option, button };
  });
  const paintButton = document.createElement('button');
  paintButton.type = 'button';
  paintButton.addEventListener('click', () => {
    harness.setTrailPaint(!trailPaint);
    renderButtons();
  });
  const trailButton = document.createElement('button');
  trailButton.type = 'button';
  trailButton.textContent = 'Long trail';
  trailButton.addEventListener('click', () => trail.fillLongTrail());
  const walkButton = document.createElement('button');
  walkButton.type = 'button';
  walkButton.addEventListener('click', () => {
    if (trail.walking) trail.stopWalk();
    else trail.startWalk();
    renderButtons();
  });
  const minButton = document.createElement('button');
  minButton.type = 'button';
  minButton.textContent = 'Hide';
  minButton.addEventListener('click', () => {
    bar.classList.toggle('min');
    minButton.textContent = bar.classList.contains('min') ? 'Show' : 'Hide';
  });
  pickRow.append(paintButton, trailButton, walkButton, minButton);

  const renderButtons = (): void => {
    for (const { option, button } of optionButtons) button.setAttribute('aria-pressed', String(option.id === variant.id));
    paintButton.textContent = trailPaint ? 'Trail paint: on' : 'Trail paint: off';
    paintButton.setAttribute('aria-pressed', String(!trailPaint));
    walkButton.textContent = trail.walking ? 'Stop walk' : 'Walk';
    walkButton.setAttribute('aria-pressed', String(trail.walking));
  };
  function renderBar(): void {
    renderButtons();
    look.textContent = variant.look;
    measured.textContent = `Measured per frame${variant.id === 'today' ? '' : ' (this option vs Today, same run)'}: `
      + `${describeBoardCostMeasurement(variant.id).join(' | ')}.`;
    measured.title = BOARD_COST_SETUP;
  }

  const keepExactInSync = (): void => {
    syncExact();
    window.setTimeout(keepExactInSync, 250);
  };

  const mount = (): void => {
    document.body.appendChild(bar);
    renderBar();
    window.setInterval(() => {
      renderButtons();
      const m = trail.meter(2000);
      const game = (window as unknown as { __MAZER_GAME__?: GameLike }).__MAZER_GAME__;
      const canvas = game ? `${game.canvas.width}x${game.canvas.height} (${resolveMazerCanvasResolution()}x)` : '-';
      const s = harness.exactStats();
      live.textContent = `Live here: ${m.meanMs.toFixed(1)} ms mean, ${m.p95Ms.toFixed(1)} ms p95 (${m.fps.toFixed(0)} fps)`
        + ` | canvas ${canvas}`
        + (s ? ` | exact board copies ${s.exact}, fallbacks ${s.fallback}` : '');
    }, 500);
  };

  const autoTrail = params.get('autoTrail') !== '0';
  const waitForPlay = (): void => {
    if (isPlayReady()) {
      if (autoTrail) trail.fillLongTrail();
      return;
    }
    window.setTimeout(waitForPlay, 250);
  };

  void import('../../boot/main').then(() => {
    keepExactInSync();
    mount();
    waitForPlay();
  });
};
