import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { MAZER_ACCESSIBILITY_SHORTCUTS } from '../../src/boot/accessibilitySurface';
import { resolveHumanKeyboardActionKind } from '../../src/input-human/keyboard';
import {
  LEGACY_GUIDE_CLOSE_LABEL,
  LEGACY_GUIDE_KEY_BINDINGS,
  LEGACY_GUIDE_PENDING_ROWS,
  LEGACY_GUIDE_ROWS,
  LEGACY_GUIDE_TITLE,
  buildLegacyGuideKeyboardLine,
  buildLegacyGuideSheetModel,
  type LegacyGuideRow
} from '../../src/legacy-runtime/legacyGuideContent';
import { resolveLegacyNavigationTarget } from '../../src/legacy-runtime/legacyMaze';
import {
  incrementLegacyProgressionOrdinal,
  resolveLegacyProgressionDifficultyProfile
} from '../../src/legacy-runtime/legacyProgression';
import {
  LEGACY_SETTINGS_GROUP_ROWS,
  buildLegacySettingsSheetModel
} from '../../src/legacy-runtime/legacySettingsSheetPlan';
import * as boardTileBake from '../../src/render/boardTileBake';
import * as edgeMarkers from '../../src/render/edgeMarkers';
import { designTokens } from '../../src/theme/tokens';

/**
 * Guide drift guard. Standing rule (Zac, 2026-11-06): any PR that changes
 * controls, tiles/markers, wrap/diamonds, levels/ranks, settings or pause
 * updates the guide in the same PR. This test is the mechanical half: every
 * claim in src/legacy-runtime/legacyGuideContent.ts is checked against live
 * constants, exports or (for private scene methods) the scene source text.
 * If it fails, update the guide module (and its icons), not just the test.
 */

const read = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8').replace(/\r\n?/g, '\n');
const MENU_SCENE = read('src/scenes/MenuScene.ts');
const row = (id: LegacyGuideRow['id']): LegacyGuideRow => LEGACY_GUIDE_ROWS.find((r) => r.id === id)!;
const exportsOf = (module: string): Record<string, unknown> | null => {
  if (module === 'src/render/boardTileBake.ts') return boardTileBake as Record<string, unknown>;
  if (module === 'src/render/edgeMarkers.ts') return edgeMarkers as Record<string, unknown>;
  return null;
};

describe('guide structure', () => {
  test('rows are unique, ordered and short enough to wrap in two lines at 14px on 320 wide', () => {
    expect(LEGACY_GUIDE_ROWS.map((r) => r.id)).toEqual(['goal', 'you', 'move', 'trail', 'wrap', 'levels']);
    expect(new Set(LEGACY_GUIDE_ROWS.map((r) => r.id)).size).toBe(LEGACY_GUIDE_ROWS.length);
    for (const r of LEGACY_GUIDE_ROWS) {
      expect(r.heading.length, r.id).toBeLessThanOrEqual(12);
      expect(r.text.length, r.id).toBeLessThanOrEqual(90);
    }
    expect(LEGACY_GUIDE_TITLE).toBe('How to play');
    expect(LEGACY_GUIDE_CLOSE_LABEL).toBe('Got it');
  });

  test('both contexts get the same rows from one module, and both settings contexts open it from the same How to play row', () => {
    const menu = buildLegacyGuideSheetModel('menu', { hasKeyboard: true });
    const pause = buildLegacyGuideSheetModel('pause', { hasKeyboard: true });
    expect(menu.rows).toBe(pause.rows);
    expect(menu.keyboardLine).toBe(pause.keyboardLine);
    expect(buildLegacyGuideSheetModel('menu').keyboardLine).toBeNull();
    for (const context of ['menu', 'pause'] as const) {
      const rows = buildLegacySettingsSheetModel(context, { signedIn: true }).sections.flatMap((s) => s.rows);
      const how = rows.find((r) => r.id === 'how-to-play')!;
      expect(how.command).toEqual({ type: 'OPEN_GUIDE' });
    }
  });

  test('pending rows are never shown, and each names what must land first', () => {
    const shown = new Set<string>(LEGACY_GUIDE_ROWS.map((r) => r.id));
    for (const pending of LEGACY_GUIDE_PENDING_ROWS) {
      expect(shown.has(pending.id)).toBe(false);
      expect(pending.reasonId).toMatch(/^[a-z0-9]+(-[a-z0-9]+){2,}$/);
    }
    expect(LEGACY_GUIDE_PENDING_ROWS.find((p) => p.id === 'start-marker')!.blockedOn).toBe('chip-wiring');
  });
});

describe('guide copy only names things that exist', () => {
  const allText = [
    ...LEGACY_GUIDE_ROWS.flatMap((r) => [r.heading, r.text]),
    buildLegacyGuideKeyboardLine(),
    LEGACY_GUIDE_TITLE,
    LEGACY_GUIDE_CLOSE_LABEL
  ].join(' \n ');

  test('retired or non-visible vocabulary is absent: gold start, rank letters, compass, Teleport, Skill, Exit', () => {
    expect(allText).not.toMatch(/\bgold\b/i);
    expect(allText).not.toMatch(/\brank/i);
    expect(allText).not.toMatch(/compass/i);
    expect(allText).not.toMatch(/teleport/i);
    expect(allText).not.toMatch(/skill/i);
    expect(allText).not.toMatch(/\bexit\b/i);
  });

  test('"gold" start: the live game draws no gold start marker in play (the endpoint glow draw is residue-only), so the guide must not promise one', () => {
    // If someone brings back a visible start marker (Chip start brackets), they must add the pending
    // start-marker row and delete this expectation in the same PR.
    expect(LEGACY_GUIDE_ROWS.some((r) => r.id === ('start' as string))).toBe(false);
    expect(boardTileBake.drawBoardMarkers).toBeTypeOf('function');
  });

  test('Trail row names the Settings toggle by its live label', () => {
    const fade = LEGACY_SETTINGS_GROUP_ROWS.find((r) => r.id === 'trail-fade')!;
    expect(fade.kind).toBe('toggle');
    expect(row('trail').text).toContain(fade.label);
    expect(row('trail').text).toMatch(/in Settings/);
  });

  test('Goal is a star: the scene draws a goal star and the Chip marker module draws a star path', () => {
    expect(row('goal').text).toMatch(/star/);
    expect(MENU_SCENE).toMatch(/private drawLegacyGoalStarMarker\(/);
    expect(read('src/render/boardTileBake.ts')).toMatch(/const starPath = /);
  });

  test('You are the green block: the player core token is a green-dominant color', () => {
    const hex = designTokens.legacy.color['player.core'].replace('#', '');
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
    expect(g).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(b);
    expect(row('you').text).toMatch(/green/);
    expect(MENU_SCENE).toMatch(/private fillLegacyPlayerMarkerTile\(/);
  });

  test('Move: touch uses the floating stick that spawns where the thumb lands, and there is no control-style toggle to contradict it', () => {
    expect(row('move').text).toMatch(/Touch and hold anywhere/);
    expect(MENU_SCENE).toMatch(/playFloatingStickOrigin/);
    expect(MENU_SCENE).toMatch(/private handleLegacyPlayTouchControl\(/);
    expect(MENU_SCENE).toMatch(/private drawLegacyPlayTouchStick\(/);
    const ids = LEGACY_SETTINGS_GROUP_ROWS.map((r) => r.settingKey);
    expect(ids).not.toContain('controlMode');
  });

  test('Wrap: leaving an open edge cell lands on the opposite open edge cell, and a closed far edge blocks it', () => {
    const open = { grid: [[false, false, false], [true, true, true], [false, false, false]] };
    expect(resolveLegacyNavigationTarget(open, { x: 0, y: 1 }, -1, 0)).toEqual({ x: 2, y: 1 });
    expect(resolveLegacyNavigationTarget(open, { x: 2, y: 1 }, 1, 0)).toEqual({ x: 0, y: 1 });
    const vertical = { grid: [[false, true, false], [false, true, false], [false, true, false]] };
    expect(resolveLegacyNavigationTarget(vertical, { x: 1, y: 0 }, 0, -1)).toEqual({ x: 1, y: 2 });
    const closed = { grid: [[false, false, false], [true, true, false], [false, false, false]] };
    expect(resolveLegacyNavigationTarget(closed, { x: 0, y: 1 }, -1, 0)).toBeNull();
  });

  test('Wrap: the perimeter diamond exists and generation still plans wraps for some levels, none for the tutorial band', () => {
    expect(edgeMarkers.EDGE_STATION_COUNT).toBe(8);
    expect(edgeMarkers.drawEdgeMarker).toBeTypeOf('function');
    const tutorial = resolveLegacyProgressionDifficultyProfile(1);
    expect(tutorial.band).toBe('tutorial');
    expect(tutorial.expectedEdgeWraps).toEqual({ horizontal: 0, vertical: 0 });
    const late = resolveLegacyProgressionDifficultyProfile(400);
    expect(late.expectedEdgeWraps.horizontal + late.expectedEdgeWraps.vertical).toBeGreaterThan(0);
    expect(row('wrap').text).toMatch(/^Some mazes wrap\./);
  });

  test('Levels: a clear raises the level ordinal by one and later difficulty bands differ from the tutorial', () => {
    expect(incrementLegacyProgressionOrdinal('1')).toBe('2');
    expect(incrementLegacyProgressionOrdinal('9')).toBe('10');
    expect(resolveLegacyProgressionDifficultyProfile(400).band).not.toBe(resolveLegacyProgressionDifficultyProfile(1).band);
    // Ranks are not player-visible, so the copy says levels only.
    expect(MENU_SCENE).toMatch(/private drawLegacyProgressionBadge\(\): VisualRect \| null \{\s*this\.clearLegacyPlayerProgressionBadge\(\);\s*this\.clearLegacyMenuAiProgressionBadge\(\);\s*return null;\s*\}/);
  });
});

describe('keyboard line resolves against the live input maps', () => {
  test('every key in the guide resolves to the claimed action in the human-input keymap', () => {
    for (const binding of LEGACY_GUIDE_KEY_BINDINGS) {
      for (const key of binding.keys) {
        const kind = resolveHumanKeyboardActionKind({ key });
        if (binding.expectedAction === 'move') {
          expect(kind, `${binding.label} ${key}`).toMatch(/^move_(up|down|left|right)$/);
        } else if (binding.expectedAction === 'pause') {
          expect(kind, `${binding.label} ${key}`).toBe('pause');
        }
      }
    }
  });

  test('the scene still handles the same keys: movement keys, P, Escape', () => {
    expect(MENU_SCENE).toMatch(/lower === 'w' \|\| event\.key === 'ArrowUp'/);
    expect(MENU_SCENE).toMatch(/lower === 's' \|\| event\.key === 'ArrowDown'/);
    expect(MENU_SCENE).toMatch(/lower === 'a' \|\| event\.key === 'ArrowLeft'/);
    expect(MENU_SCENE).toMatch(/lower === 'd' \|\| event\.key === 'ArrowRight'/);
    expect(MENU_SCENE).toMatch(/lowerKey === 'p' && this\.mode === 'play'/);
    expect(MENU_SCENE).toMatch(/event\.key === 'Escape'/);
  });

  test('the accessibility shortcut list agrees on pause and back', () => {
    const keys = new Map<string, string>(MAZER_ACCESSIBILITY_SHORTCUTS.map((s) => [s.command, s.key]));
    expect(keys.get('pause')).toBe('P');
    expect(keys.get('back')).toBe('Escape');
  });

  test('the keyboard line is built from the bindings and reads as expected', () => {
    expect(buildLegacyGuideKeyboardLine()).toBe('Arrow keys or WASD to move. P pauses. Esc goes back.');
  });
});

describe('guide icons are tied to the draw functions the board uses', () => {
  const scene = (symbol: string): boolean => new RegExp(`(?:private |public |function |const )${symbol}\\b`).test(MENU_SCENE);

  test('every board draw reference still exists (scene method or module export)', () => {
    for (const r of LEGACY_GUIDE_ROWS) {
      const draw = r.icon.boardDraw;
      if (draw === null) {
        continue;
      }
      if (draw.module === 'src/scenes/MenuScene.ts') {
        expect(scene(draw.symbol), `${r.id} -> ${draw.symbol}`).toBe(true);
      } else {
        expect(exportsOf(draw.module)?.[draw.symbol], `${r.id} -> ${draw.symbol}`).toBeTypeOf('function');
      }
    }
  });

  test('every Chip marker reference is exported by the Chip module and the marker is one drawBoardMarkers draws', () => {
    for (const r of LEGACY_GUIDE_ROWS) {
      const chip = r.icon.chipDraw;
      if (chip === null) {
        continue;
      }
      expect(exportsOf(chip.module)?.[chip.symbol], `${r.id}`).toBeTypeOf('function');
      expect(['start', 'goal', 'player']).toContain(chip.marker);
    }
    expect(row('goal').icon.chipDraw?.marker).toBe('goal');
    expect(row('you').icon.chipDraw?.marker).toBe('player');
  });

  test('status bookkeeping is honest: todo rows name a lane and why, shared rows name a board draw, guide-local rows say so', () => {
    for (const r of LEGACY_GUIDE_ROWS) {
      expect(r.icon.reasonId, r.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+){2,}$/);
      if (r.icon.status === 'todo-wiring') {
        expect(r.icon.lane, r.id).not.toBeNull();
      } else {
        expect(r.icon.lane, r.id).toBeNull();
      }
      if (r.icon.status === 'shared-with-board') {
        expect(r.icon.boardDraw, r.id).not.toBeNull();
      }
    }
  });

  test('the Chip wiring lane has an explicit todo row list: goal and wrap share the board draw; you and move are guide-local; trail and levels are tracked', () => {
    const byStatus = (status: string): string[] => LEGACY_GUIDE_ROWS.filter((r) => r.icon.status === status).map((r) => r.id);
    expect(byStatus('shared-with-board')).toEqual(['goal', 'wrap']);
    expect(byStatus('guide-local')).toEqual(['you', 'move']);
    expect(byStatus('todo-wiring')).toEqual(['trail', 'levels']);
    const chipLane = LEGACY_GUIDE_ROWS.filter((r) => r.icon.lane === 'chip-wiring').map((r) => r.id);
    expect(chipLane).toEqual(['trail', 'levels']);
  });
});

describe('the scene paints exactly what the guide data declares', () => {
  const method = (signature: string): string => {
    const start = MENU_SCENE.indexOf(signature);
    expect(start, signature).toBeGreaterThanOrEqual(0);
    return MENU_SCENE.slice(start, MENU_SCENE.indexOf('\n  }\n', start));
  };

  test('every glyph the data names has a draw case in the scene, and nothing else is drawn', () => {
    const icon = method('private drawLegacyGuideIcon(');
    const drawn = [...icon.matchAll(/case '([a-z-]+)':/g)].map((m) => m[1]).sort();
    const declared = LEGACY_GUIDE_ROWS.map((r) => r.icon.glyph).sort();
    expect(drawn).toEqual(declared);
  });

  test('icons declared shared-with-board call the board draw function itself, not a copy', () => {
    const icon = method('private drawLegacyGuideIcon(');
    const shared = LEGACY_GUIDE_ROWS.filter((r) => r.icon.status === 'shared-with-board');
    expect(shared.map((r) => r.id)).toEqual(['goal', 'wrap']);
    expect(icon).toContain('this.drawLegacyGoalStarMarker(');
    expect(icon).toContain('drawEdgeMarker(');
    // guide-local icons reuse the board constants/tokens (player) or mirror the stick (move).
    expect(method('private drawLegacyOptionsGuidePlayerGlyph(')).toContain('LEGACY_PLAY_PLAYER_MARKER_ACCENT_COLOR');
    expect(method('private drawLegacyOptionsGuideMoveGlyph(')).toContain('LEGACY_PLAY_TOUCH_BUTTON_STROKE');
    expect(icon).toContain('this.progressionState.tracks.player.level');
  });

  test('the scene holds no guide copy of its own: rows come from the data, headings and text both', () => {
    const guide = method('private buildLegacyGuideSheetOverlay(context: LegacySettingsContext): void');
    for (const r of LEGACY_GUIDE_ROWS) {
      expect(MENU_SCENE, r.id).not.toContain(r.text);
      expect(guide).not.toContain(`'${r.heading}'`);
    }
    expect(guide).toContain('row.heading,');
    expect(guide).toContain('row.text,');
    expect(MENU_SCENE).not.toContain(buildLegacyGuideKeyboardLine());
  });

  test('the keyboard line is shown only for a fine pointer with hover (desktop), never on touch', () => {
    const keyboard = method('private resolveLegacyGuideHasKeyboard(): boolean');
    expect(keyboard).toContain("(pointer: fine)");
    expect(keyboard).toContain("(hover: hover)");
  });

  test('the old Guide dropdown and its stale rows are gone from the scene', () => {
    expect(MENU_SCENE).not.toContain('createLegacyOptionsInfoSection');
    expect(MENU_SCENE).not.toContain('createLegacyOptionsGuideHeaderButton');
    expect(MENU_SCENE).not.toContain('overlayGuideExpanded');
    expect(MENU_SCENE).not.toMatch(/'begin at gold'|'reach the star'|'touch and drag anywhere'/);
  });
});
