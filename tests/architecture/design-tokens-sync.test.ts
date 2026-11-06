import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  designTokens,
  legacyPhaserAliases,
  listCssCustomProperties,
  motionEasing
} from '../../src/theme/tokens';
import type { DesignTokens } from '../../src/theme/tokens';
import {
  collectDesignTokenViolations,
  deriveExpectedCssDeclarations,
  readDesignTokens
} from '../../scripts/check-design-tokens.mjs';
import {
  EDGE_MARKER_FLASH_MS,
  EDGE_MARKER_IDLE_PERIOD_MS
} from '../../src/render/edgeMarkers';
import {
  easeOutCubic,
  INTRO_BEAM_STAGGER_MS,
  INTRO_DIGIT_IN_MS,
  INTRO_INPUT_UNLOCK_MS,
  INTRO_LASER_MS,
  INTRO_REDUCED_MOTION_MS,
  INTRO_REVEAL_END_MS,
  INTRO_REVEAL_START_MS,
  OUTRO_DIGIT_IN_MS,
  OUTRO_HANDOFF_MS,
  OUTRO_LASER_MS,
  OUTRO_REDUCED_MOTION_MS
} from '../../src/render/introTimeline';
import { LEGACY_PLAYER_MESSAGE_COLORS } from '../../src/legacy-runtime/legacyPlayerMessage';
import { LEGACY_PLAYER_TRANSFER_SWIRL_PERIOD_MS } from '../../src/legacy-runtime/legacyPlayerTransfer';
import {
  TELEPORT_TRANSFER_EXTRACTION_REDUCED_MOTION_CROSSFADE_MS,
  TELEPORT_TRANSFER_REDUCED_MOTION_FADE_EDGE_MS
} from '../../src/render/teleportTransferPresentation';

const ROOT = process.cwd();
const read = (path: string): string => readFileSync(resolve(ROOT, path), 'utf8');

const registry = readDesignTokens() as { tokens: DesignTokens };
const evidenceFile = JSON.parse(read('docs/contracts/mazer-ui-rework-design-tokens-evidence.v1.json')) as {
  evidence: Record<string, Array<{ file: string; pattern?: string }>>;
};

const asMap = (entries: Array<{ name?: string; cssVar?: string; value: string }>): Map<string, string> => {
  const map = new Map<string, string>();
  for (const entry of entries) {
    const key = (entry.name ?? entry.cssVar) as string;
    expect(map.has(key), `duplicate declaration ${key}`).toBe(false);
    map.set(key, entry.value);
  }
  return map;
};

const parseCssDeclarations = (css: string): Array<{ name: string; value: string }> => (
  [...css.matchAll(/(--mazer-token-[A-Za-z0-9-]+)\s*:\s*([^;]+);/g)].map((match) => ({
    name: match[1],
    value: match[2].trim()
  }))
);

/** Leaf token paths for the groups that must carry evidence, separated by "/" (matches the evidence file keys). */
const leafPaths = (value: unknown, prefix: string, out: string[]): string[] => {
  if (Array.isArray(value)) {
    for (const item of value) out.push(`${prefix}/${String(item)}`);
  } else if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      leafPaths(child, `${prefix}/${key}`, out);
    }
  } else {
    out.push(prefix);
  }
  return out;
};

const NEW_COLOR_KEYS = ['tone.success', 'tone.warning', 'tone.error', 'tone.info', 'overlay.scrim'] as const;

const requiredEvidencePaths = (): string[] => [
  ...NEW_COLOR_KEYS.map((key) => `color/${key}`),
  ...leafPaths(registry.tokens.motion, 'motion', []),
  ...leafPaths(registry.tokens.legacy, 'legacy', [])
];

const literalPattern = (token: string): RegExp => {
  const hex = token.replace(/^#/, '');
  return new RegExp(`(?:#|0x)${hex}\\b`, 'i');
};

const resolveTokenValue = (path: string): string | undefined => {
  const [group, ...rest] = path.split('/');
  if (group === 'color') return registry.tokens.color[rest.join('/') as keyof DesignTokens['color']];
  if (group === 'legacy' && rest[0] === 'color') {
    return registry.tokens.legacy.color[rest.slice(1).join('/') as keyof DesignTokens['legacy']['color']];
  }
  return undefined;
};

describe('design token sync: tokens.ts, tokens.css and the JSON contract agree', () => {
  it('tokens.ts exposes exactly the JSON registry tokens', () => {
    expect(designTokens).toEqual(registry.tokens);
  });

  it('the TypeScript derivation, the checker derivation and tokens.css declare the same names and values', () => {
    const fromTs = asMap(listCssCustomProperties(designTokens));
    const fromChecker = asMap(deriveExpectedCssDeclarations(registry as unknown as Record<string, unknown>));
    const fromCss = asMap(parseCssDeclarations(read('src/theme/tokens.css')));

    expect([...fromTs.keys()].sort()).toEqual([...fromCss.keys()].sort());
    expect([...fromChecker.keys()].sort()).toEqual([...fromCss.keys()].sort());
    for (const [name, value] of fromCss) {
      expect(fromTs.get(name), `tokens.ts value for ${name}`).toBe(value);
      expect(fromChecker.get(name), `checker value for ${name}`).toBe(value);
    }
  });

  it('the shipped checker reports zero violations including orphan/duplicate detection', () => {
    expect(collectDesignTokenViolations(registry as unknown as Record<string, unknown>)).toEqual([]);
  });

  it('fails when a token exists in tokens.css but not in the JSON contract (orphan)', () => {
    const clone = JSON.parse(JSON.stringify(registry));
    delete clone.tokens.motion.durationMs.fast;
    const violations = collectDesignTokenViolations(clone);
    expect(violations.some((entry) => entry.rule === 'css-declaration-orphan'
      && entry.message.includes('--mazer-token-motion-duration-fast'))).toBe(true);
  });

  it('fails when a JSON value drifts from tokens.css', () => {
    const clone = JSON.parse(JSON.stringify(registry));
    clone.tokens.motion.introBeatMs = 1201;
    clone.tokens.legacy.color['text.bright'] = '#ECFFF6';
    const violations = collectDesignTokenViolations(clone).filter((entry) => entry.rule === 'css-declaration-missing-or-mismatched');
    expect(violations.some((entry) => entry.message.includes('motion-intro-beat'))).toBe(true);
    expect(violations.some((entry) => entry.message.includes('legacy-color-text-bright'))).toBe(true);
  });

  it('fails the TypeScript-vs-CSS comparison when tokens.ts and the JSON would diverge', () => {
    const drifted = JSON.parse(JSON.stringify(designTokens)) as DesignTokens;
    drifted.motion.loopMs.blink += 1;
    const fromCss = asMap(parseCssDeclarations(read('src/theme/tokens.css')));
    const diverged = listCssCustomProperties(drifted).filter((entry) => fromCss.get(entry.name) !== entry.value);
    expect(diverged.map((entry) => entry.name)).toEqual(['--mazer-token-motion-loop-blink']);
  });

  it('keeps every original Wave 1B token value frozen (new tokens are additive, zero visual change)', () => {
    expect(designTokens.color).toMatchObject({
      'bg.canvas': '#03070B', 'bg.shell': '#07131A', 'bg.panel': '#0B1A22', 'bg.elevated': '#10242B',
      'line.subtle': '#23434A', 'line.normal': '#5D9F98', 'line.active': '#A7E7D9', 'brand.mint': '#C3F4B9',
      'world.pathCore': '#E9FFF1', 'semantic.energy': '#39F58A', 'semantic.info': '#6BE8E1',
      'semantic.reward': '#F4C84A', 'semantic.danger': '#FF405D', 'semantic.anomaly': '#AF79FF',
      'text.primary': '#F1FAF6', 'text.muted': '#94AAA8', 'text.disabled': '#5D7478'
    });
    expect(designTokens.spacingPx).toEqual([4, 8, 12, 16, 20, 24, 32, 48, 64]);
    expect(designTokens.radiusPx).toEqual({ control: 8, panel: 12, sheet: 16, round: 999 });
    expect(designTokens.strokePx).toEqual({ hairline: 1, normal: 2, focus: 3 });
    expect(designTokens.motionMs).toEqual({ instant: 90, press: 140, panel: 220, emphasis: 420 });
    expect(designTokens.touchTargetMinPx).toBe(44);
    expect(designTokens.preferredTouchTargetPx).toBe(56);
    expect(designTokens.fonts).toEqual({
      ui: 'Space Grotesk, ui-sans-serif, system-ui',
      metrics: 'IBM Plex Mono, ui-monospace, monospace',
      title: 'topology-rendered'
    });
  });

  it('derives legacy Phaser numeric aliases from the legacy hex values', () => {
    for (const [key, hex] of Object.entries(designTokens.legacy.color)) {
      expect(legacyPhaserAliases[key as keyof typeof legacyPhaserAliases]).toBe(parseInt(hex.slice(1), 16));
    }
  });
});

describe('design token provenance: every added token equals a value that already ships', () => {
  it('has evidence for every added token, and no stale evidence entries', () => {
    const required = requiredEvidencePaths().sort();
    expect(Object.keys(evidenceFile.evidence).sort()).toEqual(required);
  });

  it('every evidence entry matches the cited source file', () => {
    for (const [path, entries] of Object.entries(evidenceFile.evidence)) {
      expect(entries.length, `${path} needs at least one citation`).toBeGreaterThan(0);
      const hexValue = resolveTokenValue(path);
      for (const entry of entries) {
        const source = read(entry.file);
        const pattern = entry.pattern !== undefined
          ? new RegExp(entry.pattern)
          : literalPattern(hexValue as string);
        expect(pattern.test(source), `${path}: ${entry.file} must contain ${pattern}`).toBe(true);
      }
    }
  });

  it('every hex token is cited by literal, not by an arbitrary pattern', () => {
    for (const [path, entries] of Object.entries(evidenceFile.evidence)) {
      if (resolveTokenValue(path) !== undefined) {
        expect(entries.every((entry) => entry.pattern === undefined), path).toBe(true);
      }
    }
  });

  it('numeric motion tokens equal the live module constants', () => {
    const motion = designTokens.motion;
    expect(motion.durationMs.fast).toBe(EDGE_MARKER_FLASH_MS);
    expect(motion.durationMs.base).toBe(INTRO_DIGIT_IN_MS);
    expect(motion.durationMs.slow).toBe(OUTRO_DIGIT_IN_MS);
    expect(motion.durationMs.slow).toBe(OUTRO_HANDOFF_MS);
    expect(motion.durationMs.long).toBe(INTRO_LASER_MS);
    expect(motion.durationMs.long).toBe(OUTRO_LASER_MS);
    expect(motion.durationMs.reveal).toBe(INTRO_REVEAL_END_MS - INTRO_REVEAL_START_MS);
    expect(motion.introBeatMs).toBe(INTRO_REVEAL_END_MS);
    expect(motion.introBeatMs).toBe(INTRO_INPUT_UNLOCK_MS);
    expect(motion.staggerMs.beamTotal).toBe(INTRO_BEAM_STAGGER_MS);
    expect(motion.loopMs.beat).toBe(LEGACY_PLAYER_TRANSFER_SWIRL_PERIOD_MS);
    expect(motion.loopMs.drift).toBe(EDGE_MARKER_IDLE_PERIOD_MS);
    expect(motion.reducedMotionMs.introCrossfade).toBe(INTRO_REDUCED_MOTION_MS);
    expect(motion.reducedMotionMs.outroCrossfade).toBe(OUTRO_REDUCED_MOTION_MS);
    expect(motion.reducedMotionMs.teleportCrossfade).toBe(TELEPORT_TRANSFER_EXTRACTION_REDUCED_MOTION_CROSSFADE_MS);
    expect(motion.reducedMotionMs.teleportFadeEdge).toBe(TELEPORT_TRANSFER_REDUCED_MOTION_FADE_EDGE_MS);
  });

  it('tone colors equal the live player-message colors', () => {
    const colors = designTokens.color;
    expect(colors['tone.error'].toLowerCase()).toBe(LEGACY_PLAYER_MESSAGE_COLORS.error);
    expect(colors['tone.info'].toLowerCase()).toBe(LEGACY_PLAYER_MESSAGE_COLORS.info);
    expect(colors['tone.success'].toLowerCase()).toBe(LEGACY_PLAYER_MESSAGE_COLORS.success);
    expect(colors['tone.warning'].toLowerCase()).toBe(LEGACY_PLAYER_MESSAGE_COLORS.warning);
  });

  it('easing functions match the live implementations and the registered name list', () => {
    expect(Object.keys(motionEasing).sort()).toEqual([...designTokens.motion.easing.functions].sort());
    const samples = [-0.5, 0, 0.1, 0.25, 0.5, 0.75, 0.9, 1, 1.5];
    for (const t of samples) {
      expect(motionEasing.easeOutCubic(t)).toBeCloseTo(easeOutCubic(t), 12);
      const x = Math.max(0, Math.min(1, t));
      const smooth = x * x * (3 - (2 * x));
      expect(motionEasing.smoothstep(t)).toBeCloseTo(smooth, 12);
      expect(motionEasing.smootherstep(t)).toBeCloseTo(smooth * smooth * (3 - (2 * smooth)), 12);
      // Phaser.Math.Easing.Sine.InOut: 0.5 * (1 - cos(pi * v)).
      expect(motionEasing.sineInOut(t)).toBeCloseTo(0.5 * (1 - Math.cos(Math.PI * x)), 12);
    }
    for (const name of designTokens.motion.easing.functions) {
      expect(motionEasing[name](0)).toBe(0);
      expect(motionEasing[name](1)).toBeCloseTo(1, 12);
    }
  });
});
