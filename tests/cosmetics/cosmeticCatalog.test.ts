import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildAssetIndex } from '../../src/domain/assets/assetManifest.ts';
import type { AssetIndex, AssetManifest } from '../../src/domain/assets/assetManifest.ts';
import { validateCosmeticCatalog } from '../../src/domain/cosmetics/index.ts';
import type { CosmeticCatalogValidationOptions } from '../../src/domain/cosmetics/index.ts';
// @ts-expect-error untyped .mjs validator script; shape asserted via runtime use below
import { collectAssetManifestViolations } from '../../scripts/assets/validate-asset-manifest.mjs';
// @ts-expect-error untyped .mjs registry checker
import { collectDecisionRegistryViolations, readDecisionRegistry } from '../../scripts/check-decision-registry.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const readJson = (relative: string): any => JSON.parse(readFileSync(resolve(here, relative), 'utf8'));
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const manifest = readJson('../fixtures/assets/example/manifest.json') as AssetManifest;
const assetIndex: AssetIndex = buildAssetIndex(manifest);
const baseOptions = (overrides: Partial<CosmeticCatalogValidationOptions> = {}): CosmeticCatalogValidationOptions => ({ assetIndex, ...overrides });
const rules = (result: { violations: readonly { rule: string }[] }): string[] => result.violations.map((entry) => entry.rule);
const validCatalog = (): any => readJson('../fixtures/cosmetics/example-catalog.json');

describe('cosmetic catalog validator', () => {
  it('accepts the example catalog registered against the example asset manifest fixture', () => {
    expect(collectAssetManifestViolations(manifest, { root: resolve(here, '../fixtures/assets/example') })).toEqual([]);
    const result = validateCosmeticCatalog(validCatalog(), baseOptions({
      unlockRuleIds: new Set(['example.rule.first-clear', 'example.rule.ten-clears']),
      requiredSlotIds: ['player', 'background']
    }));
    expect(result.ok).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it('is deterministic and sorts violations', () => {
    const catalog = validCatalog();
    catalog.items[1].assetRefs.primary = 'missing.asset';
    catalog.items[3].rarity = 'mythic';
    const first = validateCosmeticCatalog(catalog, baseOptions());
    const second = validateCosmeticCatalog(clone(catalog), baseOptions());
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    const keys = first.violations.map((entry) => `${entry.path}|${entry.rule}|${entry.message}`);
    expect([...keys].sort()).toEqual(keys);
  });

  it('rejects non-object input and unsupported versions', () => {
    expect(rules(validateCosmeticCatalog(null, baseOptions()))).toEqual(['invalid-catalog']);
    const catalog = validCatalog();
    catalog.schemaVersion = 9;
    catalog.extra = 1;
    expect(rules(validateCosmeticCatalog(catalog, baseOptions()))).toEqual(expect.arrayContaining(['unsupported-schema-version', 'unknown-field']));
  });

  it('rejects duplicate slot and item ids', () => {
    const catalog = validCatalog();
    catalog.slots.push(clone(catalog.slots[0]));
    catalog.items.push(clone(catalog.items[1]));
    expect(rules(validateCosmeticCatalog(catalog, baseOptions()))).toEqual(expect.arrayContaining(['duplicate-slot-id', 'duplicate-item-id']));
  });

  describe('slot map completeness', () => {
    it('requires every slot to have a resolvable default-source default item in the same slot', () => {
      const missing = validCatalog();
      missing.slots[0].defaultItemId = 'player.nope';
      expect(rules(validateCosmeticCatalog(missing, baseOptions()))).toContain('missing-default-item');

      const wrongSlot = validCatalog();
      wrongSlot.slots[0].defaultItemId = 'background.default';
      expect(rules(validateCosmeticCatalog(wrongSlot, baseOptions()))).toContain('default-item-wrong-slot');

      const notDefault = validCatalog();
      notDefault.slots[0].defaultItemId = 'player.spark';
      expect(rules(validateCosmeticCatalog(notDefault, baseOptions()))).toContain('default-item-not-default-source');
    });

    it('rejects a second default-source item in one slot', () => {
      const catalog = validCatalog();
      catalog.items.push({ ...clone(catalog.items[0]), id: 'player.default-two' });
      expect(rules(validateCosmeticCatalog(catalog, baseOptions()))).toContain('multiple-default-items');
    });

    it('rejects items in undeclared slots and missing required slots', () => {
      const catalog = validCatalog();
      catalog.items[1].slotId = 'trail';
      expect(rules(validateCosmeticCatalog(catalog, baseOptions({ requiredSlotIds: ['trail'] })))).toEqual(
        expect.arrayContaining(['unknown-slot', 'missing-required-slot'])
      );
    });
  });

  describe('references', () => {
    it('rejects unresolved, deprecated, wrong-kind, and (optionally) unapproved asset references', () => {
      const unresolved = validCatalog();
      unresolved.items[1].assetRefs.primary = 'missing.asset';
      expect(rules(validateCosmeticCatalog(unresolved, baseOptions()))).toEqual(['unresolved-asset']);

      const deprecatedIndex: AssetIndex = new Map([...assetIndex, ['example.icon.spark', { id: 'example.icon.spark', kind: 'icon', status: 'deprecated' }]]);
      expect(rules(validateCosmeticCatalog(validCatalog(), baseOptions({ assetIndex: deprecatedIndex })))).toEqual(['deprecated-asset']);

      const wrongKind = validCatalog();
      wrongKind.items[1].assetRefs.primary = 'example.image.banner';
      expect(rules(validateCosmeticCatalog(wrongKind, baseOptions()))).toEqual(['asset-kind-not-accepted']);

      // example.image.banner is "draft" in the fixture manifest.
      expect(rules(validateCosmeticCatalog(validCatalog(), baseOptions({ requireApprovedAssets: true })))).toEqual(['unapproved-asset']);
    });

    it('requires an asset when the slot demands one', () => {
      const catalog = validCatalog();
      catalog.slots[0].requiresAssets = true;
      catalog.items[1].assetRefs = {};
      const found = rules(validateCosmeticCatalog(catalog, baseOptions()));
      // The default item has no assets either, so both items in the slot are flagged.
      expect(found.filter((rule) => rule === 'missing-asset-ref')).toHaveLength(2);
    });

    it('resolves unlock rule references only when a rule set is supplied', () => {
      expect(rules(validateCosmeticCatalog(validCatalog(), baseOptions({ unlockRuleIds: new Set(['example.rule.first-clear']) })))).toEqual(['unresolved-unlock-rule']);
      expect(validateCosmeticCatalog(validCatalog(), baseOptions()).ok).toBe(true);
    });

    it('requires an unlock rule on earned items and forbids extras on default items', () => {
      const catalog = validCatalog();
      delete catalog.items[1].source.unlockRuleId;
      catalog.items[0].source.unlockRuleId = 'x';
      expect(rules(validateCosmeticCatalog(catalog, baseOptions()))).toEqual(['invalid-source', 'invalid-source']);
    });
  });

  describe('earned cosmetic budget', () => {
    const withEarned = (count: number, budget?: number): any => {
      const catalog = validCatalog();
      if (budget === undefined) delete catalog.budget; else catalog.budget.maxEarnedItems = budget;
      catalog.items = catalog.items.filter((item: any) => item.source.type === 'default');
      for (let index = 0; index < count; index += 1) {
        catalog.items.push({
          id: `player.earned-${index}`,
          slotId: 'player',
          nameKey: `example.cosmetics.item.earned-${index}`,
          rarity: 'rare',
          source: { type: 'earned', unlockRuleId: `example.rule.r${index}` },
          assetRefs: {}
        });
      }
      return catalog;
    };

    it('uses the catalog-declared cap, so the limit is data and not a constant', () => {
      expect(validateCosmeticCatalog(withEarned(12, 12), baseOptions()).ok).toBe(true);
      expect(rules(validateCosmeticCatalog(withEarned(13, 12), baseOptions()))).toEqual(['earned-budget-exceeded']);
      expect(validateCosmeticCatalog(withEarned(13, 20), baseOptions()).ok).toBe(true);
      expect(rules(validateCosmeticCatalog(withEarned(3, 2), baseOptions()))).toEqual(['earned-budget-exceeded']);
    });

    it('lets the earnedCap option override the declared cap', () => {
      expect(validateCosmeticCatalog(withEarned(5, 2), baseOptions({ earnedCap: 5 })).ok).toBe(true);
      expect(rules(validateCosmeticCatalog(withEarned(5, 50), baseOptions({ earnedCap: 4 })))).toEqual(['earned-budget-exceeded']);
    });

    it('fails when no cap is configured anywhere or the cap is malformed', () => {
      expect(rules(validateCosmeticCatalog(withEarned(1), baseOptions()))).toEqual(['missing-earned-cap']);
      expect(rules(validateCosmeticCatalog(withEarned(1, -1), baseOptions()))).toEqual(['invalid-earned-cap']);
      expect(rules(validateCosmeticCatalog(withEarned(1, 1.5), baseOptions()))).toEqual(['invalid-earned-cap']);
    });
  });

  describe('single public theme rule', () => {
    it('refuses a theme slot (and theme-prefixed slots) so cosmetics cannot become a second public theme', () => {
      for (const id of ['theme', 'theme-noir', 'theme.ember']) {
        const catalog = validCatalog();
        catalog.slots.push({ id, labelKey: 'x', acceptedAssetKinds: ['image'], requiresAssets: false, defaultItemId: `${id}.default` });
        catalog.items.push({ id: `${id}.default`, slotId: id, nameKey: 'x', rarity: 'common', source: { type: 'default' }, assetRefs: {} });
        expect(rules(validateCosmeticCatalog(catalog, baseOptions())), id).toEqual(['reserved-slot-id']);
      }
    });

    it('stays compatible with the shipped decision registry: one canonical public theme, zero violations', () => {
      const registry = readDecisionRegistry();
      expect(collectDecisionRegistryViolations(registry)).toEqual([]);
      const publicThemes = registry.themes.registry.filter((entry: any) => entry.role === 'canonical' && entry.public === true);
      expect(publicThemes).toHaveLength(1);
      // The catalog introduces no theme registry entries: its slot ids never collide with any registered theme id.
      const themeIds = new Set(registry.themes.registry.map((entry: any) => entry.id));
      for (const slot of validCatalog().slots) expect(themeIds.has(slot.id)).toBe(false);
    });
  });
});
