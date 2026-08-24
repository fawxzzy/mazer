import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import {
  LEGACY_ENDLESS_DEFAULT_MODIFIER_POLICY,
  LEGACY_ENDLESS_LEVEL_BOUNDARY,
  LEGACY_ENDLESS_MODIFIER_REGISTRY,
  resolveLegacyEndlessLevelRecipe,
  resolveLegacyProgressionRulesetId
} from '../../src/legacy-runtime/legacyEndlessProgression';

describe('legacy endless progression ruleset boundary', () => {
  test('levels below the boundary resolve to the unchanged legacy ruleset', () => {
    expect(resolveLegacyProgressionRulesetId(1)).toBe('legacy-v1');
    expect(resolveLegacyProgressionRulesetId(99)).toBe('legacy-v1');
  });

  test('levels at or above the boundary resolve to the endless ruleset', () => {
    expect(resolveLegacyProgressionRulesetId(LEGACY_ENDLESS_LEVEL_BOUNDARY)).toBe('endless-v1');
    expect(resolveLegacyProgressionRulesetId(1_000_000)).toBe('endless-v1');
  });

  test('keeps both persisted completion ordinals uncapped behind the idempotent server contract', () => {
    const foundation = readFileSync(
      new URL('../../supabase/migrations/20260822000000_mazer_endless_progression_foundation.sql', import.meta.url),
      'utf8'
    );
    const completionRpc = readFileSync(
      new URL('../../supabase/migrations/20260822000100_mazer_endless_completion_rpc.sql', import.meta.url),
      'utf8'
    );
    const remoteProgressionSource = readFileSync(
      new URL('../../src/legacy-runtime/legacyRemoteProgression.ts', import.meta.url),
      'utf8'
    );

    expect(foundation).toContain('drop constraint if exists mazer_progression_states_player_level_check');
    expect(foundation).toContain('drop constraint if exists mazer_ai_progression_states_level_check');
    expect(foundation).toContain('check (player_level >= 1)');
    expect(foundation).toContain('check (level >= 1)');
    expect(foundation).toContain('alter column player_level type bigint');
    expect(foundation).toContain('alter column level type bigint');
    expect(foundation).toContain('check (player_target_complexity between 8 and 400)');
    expect(foundation).toContain('check (target_complexity between 8 and 400)');
    expect(foundation).toContain('on public.mazer_cycle_receipts (user_id, client_run_id)');
    expect(completionRpc).toContain('v_next_level := v_current.player_level + 1');
    expect(completionRpc).toContain('create or replace function public.mazer_complete_ai_level');
    expect(completionRpc).toContain('v_next_level := v_current.level + 1');
    expect(completionRpc).toContain('p_completed_level text');
    expect(completionRpc).toContain('p_completed_at timestamp with time zone default null');
    expect(completionRpc).toContain("p_receipt jsonb default '{}'::jsonb");
    expect(completionRpc).toContain('player_level text');
    expect(completionRpc).toContain('player_completed_cycles text');
    expect(completionRpc).toContain('completed_cycles text');
    expect(completionRpc).toContain('state jsonb');
    expect(completionRpc).toContain('updated_at timestamp with time zone');
    expect(completionRpc).toContain('v_completed_level := p_completed_level::bigint');
    expect(completionRpc).toContain("'completedCycles', v_next_completed_cycles::text");
    expect(completionRpc).toContain("'level', v_next_level::text");
    expect(completionRpc).toContain('v_current.player_target_complexity + 4');
    expect(completionRpc).toContain('v_current.target_complexity + 4');
    expect(completionRpc).toContain("when v_next_target_complexity >= 125 then 'S'");
    expect(completionRpc).toContain("'colorTier', v_next_color_tier");
    expect(completionRpc).toContain("'rank', v_next_rank");
    expect(completionRpc).toContain("'targetComplexity', v_next_target_complexity");
    expect(completionRpc).toContain('player_rank = v_next_rank');
    expect(completionRpc).toContain('player_target_complexity = v_next_target_complexity');
    expect(completionRpc).toContain('rank = v_next_rank');
    expect(completionRpc).toContain('target_complexity = v_next_target_complexity');
    expect(completionRpc).not.toContain('p_completed_level integer');
    expect(completionRpc).not.toContain('p_completed_level bigint');
    expect(completionRpc).toContain("raise exception 'client_run_id is required for idempotent completion'");
    expect(completionRpc).toContain('security definer');
    expect(completionRpc).not.toContain('security invoker');
    expect(completionRpc).toContain('p_expected_user_id uuid');
    expect(completionRpc).toContain('p_expected_user_id is distinct from v_user_id');
    expect(completionRpc).toContain('v_now timestamp with time zone := pg_catalog.clock_timestamp()');
    expect(completionRpc).not.toContain('pg_catalog.coalesce(p_completed_at, pg_catalog.now())');
    expect(completionRpc).toContain("pg_catalog.jsonb_build_object('clientCompletedAt', p_completed_at)");
    expect(completionRpc).toContain("p_completed_at between v_now - interval '90 days' and v_now + interval '5 minutes'");
    expect(completionRpc.match(/if pg_catalog\.octet_length\(v_receipt::text\) > 8192 then/g)).toHaveLength(2);
    expect(completionRpc.match(/v_receipt := p_receipt;/g)).toHaveLength(2);
    expect(completionRpc).toContain('and r.client_run_id = p_client_run_id');
    expect(completionRpc).toContain('on conflict (user_id, client_run_id) where client_run_id is not null do nothing');
    expect(completionRpc).toContain('completed_at,');
    expect(completionRpc).toContain('receipt');
    expect(completionRpc).toContain("pg_catalog.octet_length(p_receipt::text) > 8192");
    expect(completionRpc).toContain("pg_catalog.nullif(p_receipt ->> 'id', '')");
    expect(completionRpc).toContain('load-bearing player completion transaction');
    expect(completionRpc).toContain('load-bearing menu-AI completion transaction');
    expect(completionRpc).toContain('create function public.mazer_initialize_progression');
    expect(completionRpc).toContain('create function public.mazer_reset_progression');
    expect(completionRpc).toContain('revoke insert, update on table public.mazer_progression_states from authenticated');
    expect(completionRpc).toContain('revoke insert, update on table public.mazer_ai_progression_states from authenticated');
    expect(completionRpc).toContain('revoke insert on table public.mazer_cycle_receipts from authenticated');
    expect(completionRpc).not.toContain('Not yet called by client code');
    expect(remoteProgressionSource).toContain("client.rpc('mazer_initialize_progression'");
    expect(remoteProgressionSource).toContain("client.rpc('mazer_complete_level'");
    expect(remoteProgressionSource).toContain("client.rpc('mazer_complete_ai_level'");
    expect(remoteProgressionSource).toContain("client.rpc('mazer_reset_progression'");
    expect(remoteProgressionSource).not.toContain('createRemoteProgressionPayload');
    expect(remoteProgressionSource).not.toContain('createRemoteAiProgressionPayload');
    expect(remoteProgressionSource).not.toContain('.from(LEGACY_REMOTE_CYCLE_RECEIPTS_TABLE)');
  });
});

describe('legacy endless level recipe resolution', () => {
  test('rejects levels below the endless boundary', () => {
    expect(() => resolveLegacyEndlessLevelRecipe(99)).toThrow();
    expect(() => resolveLegacyEndlessLevelRecipe(1.5 + LEGACY_ENDLESS_LEVEL_BOUNDARY)).toThrow();
  });

  test('the same level always resolves to an identical recipe', () => {
    const first = resolveLegacyEndlessLevelRecipe(142);
    const second = resolveLegacyEndlessLevelRecipe(142);
    expect(second).toEqual(first);
  });

  test('resolves successfully for representative large levels without overflow or throwing', () => {
    for (const level of ['100', '101', '250', '1000', '100000', '2000000000', '9007199254740993']) {
      const recipe = resolveLegacyEndlessLevelRecipe(level);
      expect(recipe.level).toBe(level);
      expect(Number.isFinite(recipe.complexityBudget)).toBe(true);
      expect(Number.isFinite(recipe.difficultyBudget)).toBe(true);
    }
  });

  test('level 101 differs from level 100 (not a flat repeat)', () => {
    const level100 = resolveLegacyEndlessLevelRecipe(100);
    const level101 = resolveLegacyEndlessLevelRecipe(101);
    expect(level101).not.toEqual({ ...level100, level: '101', seed: level101.seed });
    expect(level101.seed).not.toBe(level100.seed);
  });

  test('geometry and generation cost stay bounded across a huge level range -- never grows without bound', () => {
    const sampledLevels = [100, 500, 5_000, 50_000, 500_000, 5_000_000, 50_000_000];
    const budgets = sampledLevels.map((level) => resolveLegacyEndlessLevelRecipe(level));
    for (const recipe of budgets) {
      expect(recipe.complexityBudget).toBeGreaterThanOrEqual(280);
      expect(recipe.complexityBudget).toBeLessThanOrEqual(400);
      expect(recipe.difficultyBudget).toBeGreaterThanOrEqual(40);
      expect(recipe.difficultyBudget).toBeLessThanOrEqual(100);
      for (const modifier of recipe.modifiers) {
        expect(modifier.intensity).toBeGreaterThanOrEqual(0);
        expect(modifier.intensity).toBeLessThanOrEqual(1);
      }
    }
  });

  test('every enabled registry modifier appears on a level using the default policy', () => {
    const recipe = resolveLegacyEndlessLevelRecipe(100);
    const modifierIds = recipe.modifiers.map((modifier) => modifier.id).sort();
    const expectedIds = LEGACY_ENDLESS_MODIFIER_REGISTRY.map((definition) => definition.id).sort();
    expect(modifierIds).toEqual(expectedIds);
  });

  test('modifier ordering is deterministic and matches registry order', () => {
    const recipe = resolveLegacyEndlessLevelRecipe(500);
    const modifierIds = recipe.modifiers.map((modifier) => modifier.id);
    const registryIds = LEGACY_ENDLESS_MODIFIER_REGISTRY.map((definition) => definition.id);
    expect(modifierIds).toEqual(registryIds);
  });

  test('a disabled modifier never appears in the recipe', () => {
    const disabledId = LEGACY_ENDLESS_MODIFIER_REGISTRY[0]?.id;
    expect(disabledId).toBeDefined();
    const policy = {
      ...LEGACY_ENDLESS_DEFAULT_MODIFIER_POLICY,
      [disabledId as string]: { enabled: false }
    };
    const recipe = resolveLegacyEndlessLevelRecipe(100, policy);
    expect(recipe.modifiers.some((modifier) => modifier.id === disabledId)).toBe(false);
    expect(recipe.modifiers.length).toBe(LEGACY_ENDLESS_MODIFIER_REGISTRY.length - 1);
  });

  test('an enabled modifier stays within a configured tighter intensity bound', () => {
    const targetId = LEGACY_ENDLESS_MODIFIER_REGISTRY[0]?.id;
    expect(targetId).toBeDefined();
    const policy = {
      ...LEGACY_ENDLESS_DEFAULT_MODIFIER_POLICY,
      [targetId as string]: { enabled: true, maximumIntensity: 0.2, minimumIntensity: 0.1 }
    };
    for (let level = LEGACY_ENDLESS_LEVEL_BOUNDARY; level < LEGACY_ENDLESS_LEVEL_BOUNDARY + 30; level += 1) {
      const recipe = resolveLegacyEndlessLevelRecipe(level, policy);
      const modifier = recipe.modifiers.find((entry) => entry.id === targetId);
      expect(modifier).toBeDefined();
      expect(modifier!.intensity).toBeGreaterThanOrEqual(0.1);
      expect(modifier!.intensity).toBeLessThanOrEqual(0.2);
    }
  });

  test('empty enemy and obstacle collections serialize and deserialize safely', () => {
    const recipe = resolveLegacyEndlessLevelRecipe(100);
    expect(recipe.enemies).toEqual([]);
    expect(recipe.obstacles).toEqual([]);
    const roundTripped = JSON.parse(JSON.stringify(recipe));
    expect(roundTripped.enemies).toEqual([]);
    expect(roundTripped.obstacles).toEqual([]);
  });

  test('the last level of every challenge cycle is a capstone at maximum budget and intensity', () => {
    const capstoneLevel = LEGACY_ENDLESS_LEVEL_BOUNDARY + 22;
    const recipe = resolveLegacyEndlessLevelRecipe(capstoneLevel);
    expect(recipe.complexityBudget).toBe(400);
    expect(recipe.difficultyBudget).toBe(100);
    for (const modifier of recipe.modifiers) {
      expect(modifier.intensity).toBe(1);
    }
  });

  test('the level after a capstone resets to a lower budget rather than continuing to climb', () => {
    const capstoneLevel = LEGACY_ENDLESS_LEVEL_BOUNDARY + 22;
    const capstone = resolveLegacyEndlessLevelRecipe(capstoneLevel);
    const afterCapstone = resolveLegacyEndlessLevelRecipe(capstoneLevel + 1);
    expect(afterCapstone.complexityBudget).toBeLessThan(capstone.complexityBudget);
  });
});
