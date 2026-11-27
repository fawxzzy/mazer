import { describe, expect, test } from 'vitest';
import {
  estimateTextCardHeight,
  resolveTextCardCellRect,
  resolveTextCardBoardView,
  resolveTextCardCover,
  resolveTextCardMechanicCells,
  resolveTextCardPlacement,
  resolveTextCardWidth,
  TEXT_CARD_MAX_WIDTH_PX,
  type TextCardBoardScene,
  type TextCardRect
} from '../../src/render/textCardPlacement';
import { NEON_TEXT_SKIN } from '../../src/ui/skin/neonTextSkin';

/*
 * Text card placement (rich-text skin, 2026-11-27): a card never covers the player, the end star, the thing it points
 * at, the active wraps/Switches or the HUD. The real-board proof (previewLevel 1, 10, 22, 200 at both phone sizes) is
 * in the PR captures; this pins the rule.
 */

const view = { viewWidth: 390, viewHeight: 844, topMin: 72, bottomInset: 16 };
const card = { cardWidth: resolveTextCardWidth(390), cardHeight: 120 };
const cell = (x: number, y: number, size = 16): TextCardRect => resolveTextCardCellRect({ x, y }, size)!;

describe('placement rule', () => {
  test('takes the top band, just under the HUD, when nothing is there', () => {
    const place = resolveTextCardPlacement({ ...view, ...card, keepClear: [cell(195, 500), null, cell(40, 700)] });
    expect(place.edge).toBe('top');
    expect(place.topPx).toBe(view.topMin);
    expect(place.covers).toBe(-1);
    expect(place.bottomPx).toBeUndefined();
  });

  test('never sits above the HUD line, whatever it has to cover', () => {
    const everywhere = Array.from({ length: 60 }, (_, i) => cell(195, 60 + (i * 14)));
    const place = resolveTextCardPlacement({ ...view, ...card, keepClear: everywhere });
    expect(place.topPx).toBeGreaterThanOrEqual(view.topMin);
    expect(place.rect.y + place.rect.height).toBeLessThanOrEqual(view.viewHeight - view.bottomInset);
  });

  test('goes to the bottom band when the top band covers something and the bottom is free', () => {
    const place = resolveTextCardPlacement({ ...view, ...card, keepClear: [cell(195, 120)] });
    expect(place.edge).toBe('bottom');
    expect(place.bottomPx).toBe(view.bottomInset);
    expect(place.rect.y + place.rect.height).toBe(view.viewHeight - view.bottomInset);
    expect(place.covers).toBe(-1);
  });

  test('scans down between the bands when both bands are taken', () => {
    const place = resolveTextCardPlacement({ ...view, ...card, keepClear: [cell(195, 120), cell(195, 780)] });
    expect(place.edge).toBe('scan');
    expect(place.covers).toBe(-1);
    expect(place.rect.y).toBeGreaterThan(120);
    expect(place.rect.y + place.rect.height).toBeLessThan(780);
  });

  test('when every spot covers something, it covers the least important thing (later in the list)', () => {
    // A column of things from top to bottom; the player (first) is at the top, the star (second) at the bottom.
    const column = Array.from({ length: 70 }, (_, i) => cell(195, 70 + (i * 11)));
    const keepClear = [column[2]!, column[column.length - 3]!, ...column];
    const place = resolveTextCardPlacement({ ...view, ...card, keepClear });
    expect(place.covers).toBeGreaterThan(1);
    expect(resolveTextCardCover(place.rect, keepClear.slice(0, 2))).toBe(-1);
  });

  test('a bottom-anchored line tries the bottom band, then steps up, and only then the top band', () => {
    const free = resolveTextCardPlacement({ ...view, cardWidth: 300, cardHeight: 48, keepClear: [cell(195, 100)], prefer: 'bottom' });
    expect(free.edge).toBe('bottom');
    // Level 1: the end star sits at the foot of the corridor, right where the line is anchored.
    const star = cell(195, 806, 24);
    const lifted = resolveTextCardPlacement({ ...view, cardWidth: 300, cardHeight: 48, keepClear: [cell(195, 60, 24), star], prefer: 'bottom' });
    expect(lifted.edge).toBe('scan');
    expect(lifted.covers).toBe(-1);
    expect(lifted.rect.y + lifted.rect.height).toBeLessThanOrEqual(star.y);
    expect(lifted.rect.y + lifted.rect.height).toBeGreaterThan(star.y - 8 - 1);
  });

  test('a thing beside the card (outside its width) is not covered', () => {
    const place = resolveTextCardPlacement({ ...view, viewWidth: 600, cardWidth: 300, cardHeight: 120, keepClear: [cell(40, 100)] });
    expect(place.rect.x).toBe(150);
    expect(place.edge).toBe('top');
  });
});

describe('card size', () => {
  test('width follows the notice host: 16 px side margins, never over the max width', () => {
    expect(resolveTextCardWidth(390)).toBe(358);
    expect(resolveTextCardWidth(1280)).toBe(TEXT_CARD_MAX_WIDTH_PX);
  });

  test('the height estimate covers the rich layout (padding + icon well + body) and grows with the text', () => {
    const short = estimateTextCardHeight({ cardWidth: 358, bodyChars: 30, heading: true, action: true });
    const long = estimateTextCardHeight({ cardWidth: 358, bodyChars: 140, heading: true, action: true });
    expect(short).toBeGreaterThanOrEqual((12 * 2) + NEON_TEXT_SKIN.glyph.sizePx + 8 + Math.ceil(NEON_TEXT_SKIN.body.sizePx * 1.36));
    expect(long).toBeGreaterThan(short);
    const plain = estimateTextCardHeight({ cardWidth: 358, bodyChars: 30, heading: false, action: false });
    expect(plain).toBeLessThan(short);
  });
});

describe('keep-clear cells', () => {
  test('a cell rect is the cell box grown by the pad', () => {
    expect(resolveTextCardCellRect({ x: 100, y: 50 }, 20, 4)).toEqual({ x: 86, y: 36, width: 28, height: 28 });
    expect(resolveTextCardCellRect(null, 20)).toBeNull();
  });

  test('Switch tiles and both mouths of every wrap are kept in view', () => {
    const grid = [
      [false, true, false, false],
      [true, true, true, true],
      [false, true, false, false],
      [false, true, false, false]
    ];
    const cells = resolveTextCardMechanicCells({ grid, bleedGates: [{ x: 2, y: 1 }] as never });
    expect(cells).toContainEqual({ x: 2, y: 1 });
    // Row 1 runs border to border: a horizontal wrap.
    expect(cells).toContainEqual({ x: 0, y: 1 });
    expect(cells).toContainEqual({ x: 3, y: 1 });
    // Column 1 runs border to border: a vertical wrap.
    expect(cells).toContainEqual({ x: 1, y: 0 });
    expect(cells).toContainEqual({ x: 1, y: 3 });
    // A border floor cell with a wall opposite is not a wrap.
    expect(resolveTextCardMechanicCells({ grid: [[true, false], [false, false]] })).toEqual([]);
  });
});

describe('reading the live scene (the DOM cards that cannot be handed rects)', () => {
  const grid = [[true, false, false], [true, true, true], [false, false, true]];
  const scene = (patch: Partial<TextCardBoardScene> = {}): TextCardBoardScene => ({
    mode: 'play',
    player: { x: 0, y: 0 },
    maze: { grid, goal: { x: 2, y: 2 }, bleedGates: [] },
    hazardGateLayout: { tileSize: 20, mazeLeft: 0, mazeTop: 0 },
    boardTileLayer: { snappedOrigin: { x: 10, y: 50 } },
    boardZoomContainer: { getWorldTransformMatrix: () => ({ transformPoint: (x: number, y: number) => ({ x, y }) }) },
    resolveBoardTileBackingScale: () => 1,
    layout: { width: 200, lanes: { hud: { top: 0, height: 40 } } },
    ...patch
  });

  test('player, end star, then the wrap mouths, in page px through the canvas box', () => {
    const view = resolveTextCardBoardView(scene(), { left: 5, top: 7, width: 400 })!;
    // Canvas is drawn at 2x the scene width: every scene px is two page px, offset by the canvas box.
    const [player, goal, ...mechanics] = view.keepClear;
    const centre = (r: TextCardRect | null): { x: number; y: number } => ({ x: r!.x + (r!.width / 2), y: r!.y + (r!.height / 2) });
    expect(player!.width - 8).toBeCloseTo(40);
    expect(centre(goal).x - centre(player).x).toBeCloseTo(80);
    expect(centre(goal).y - centre(player).y).toBeCloseTo(80);
    expect(mechanics).toHaveLength(2);
    expect(view.hudBottom).toBe(7 + 80);
  });

  test('no board in play = null (the caller keeps its default spot)', () => {
    const box = { left: 0, top: 0, width: 200 };
    expect(resolveTextCardBoardView(null, box)).toBeNull();
    expect(resolveTextCardBoardView(scene({ mode: 'menu' }), box)).toBeNull();
    expect(resolveTextCardBoardView(scene({ maze: null }), box)).toBeNull();
    expect(resolveTextCardBoardView(scene({ hazardGateLayout: { tileSize: 0, mazeLeft: 0, mazeTop: 0 } }), box)).toBeNull();
  });
});
