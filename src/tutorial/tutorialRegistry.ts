import type { AssetIndex } from '../domain/assets/assetManifest.ts';

// Tutorial registry v1: pure data. Tutorials are registered here as tokens; presentation code looks tokens up
// by trigger and renders copy by key. No UI, no storage, and no network in this module.

export const TUTORIAL_REGISTRY_SCHEMA_VERSION = 1;

export type TutorialTrigger =
  | { readonly kind: 'account-created' }
  | { readonly kind: 'first-occurrence'; readonly event: string };

export type TutorialRepeat = 'once' | 'repeatable';

export interface TutorialCopyKeys {
  readonly titleKey: string;
  readonly bodyKey: string;
  readonly continueKey: string;
}

export interface TutorialToken {
  readonly id: string;
  readonly trigger: TutorialTrigger;
  /** `once` tokens are suppressed after acknowledgement; `repeatable` tokens are never suppressed. */
  readonly repeat: TutorialRepeat;
  /** Bump to show a changed `once` tutorial again to accounts that acknowledged an earlier revision. */
  readonly revision: number;
  /** Display order among tokens that share a trigger; ties break by id. */
  readonly order: number;
  readonly copy: TutorialCopyKeys;
  /** Optional asset manifest id for the representative image. */
  readonly imageAssetId?: string;
}

export interface TutorialRegistry {
  readonly schemaVersion: typeof TUTORIAL_REGISTRY_SCHEMA_VERSION;
  readonly tokens: readonly TutorialToken[];
}

export interface TutorialRegistryViolation {
  readonly rule: string;
  readonly path: string;
  readonly message: string;
}

export interface TutorialRegistryValidationOptions {
  /** When supplied, `imageAssetId` references must resolve and must not be deprecated. */
  readonly assetIndex?: AssetIndex;
}

const ID_PATTERN = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;
const TOKEN_KEYS = new Set(['id', 'trigger', 'repeat', 'revision', 'order', 'copy', 'imageAssetId']);
const COPY_KEYS = ['titleKey', 'bodyKey', 'continueKey'] as const;

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => value !== null && typeof value === 'object' && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const v = (rule: string, path: string, message: string): TutorialRegistryViolation => ({ rule, path, message });

/** Stable string form of a trigger, used for grouping and lookup. */
export const triggerKey = (trigger: TutorialTrigger): string => (
  trigger.kind === 'account-created' ? 'account-created' : `first-occurrence:${trigger.event}`
);

const compareTokens = (a: TutorialToken, b: TutorialToken): number => (
  a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
);

/** Tokens for a trigger in deterministic display order (order, then id). */
export const getTutorialsForTrigger = (registry: TutorialRegistry, trigger: TutorialTrigger): TutorialToken[] => {
  const key = triggerKey(trigger);
  return registry.tokens.filter((token) => triggerKey(token.trigger) === key).sort(compareTokens);
};

/** Pure structural validation of an unknown value as a registry. Violations are sorted. */
export const validateTutorialRegistry = (
  input: unknown,
  options: TutorialRegistryValidationOptions = {}
): { ok: true; registry: TutorialRegistry; violations: readonly [] } | { ok: false; violations: readonly TutorialRegistryViolation[] } => {
  const violations: TutorialRegistryViolation[] = [];
  if (!isObject(input)) return { ok: false, violations: [v('invalid-registry', '$', 'registry must be an object.')] };

  for (const key of Object.keys(input)) {
    if (key !== 'schemaVersion' && key !== 'tokens') violations.push(v('unknown-field', '$', `unknown field "${key}".`));
  }
  if (input.schemaVersion !== TUTORIAL_REGISTRY_SCHEMA_VERSION) {
    violations.push(v('unsupported-schema-version', 'schemaVersion', `schemaVersion must be ${TUTORIAL_REGISTRY_SCHEMA_VERSION}.`));
  }
  if (!Array.isArray(input.tokens)) {
    violations.push(v('invalid-tokens', 'tokens', 'tokens must be an array.'));
    return { ok: false, violations: sortViolations(violations) };
  }

  const counts = new Map<string, number>();
  for (const token of input.tokens) {
    if (isObject(token) && isText(token.id)) counts.set(token.id, (counts.get(token.id) ?? 0) + 1);
  }

  input.tokens.forEach((token, index) => {
    if (!isObject(token)) {
      violations.push(v('invalid-token', `tokens[${index}]`, 'token must be an object.'));
      return;
    }
    const at = `tokens[${isText(token.id) ? token.id : index}]`;
    for (const key of Object.keys(token)) if (!TOKEN_KEYS.has(key)) violations.push(v('unknown-field', at, `unknown field "${key}".`));
    if (typeof token.id !== 'string' || !ID_PATTERN.test(token.id)) violations.push(v('invalid-id', at, 'id must be a lowercase dot/dash id.'));
    else if ((counts.get(token.id) ?? 0) > 1) violations.push(v('duplicate-id', at, `id "${token.id}" is declared ${counts.get(token.id)} times.`));

    const trigger = token.trigger;
    if (!isObject(trigger) || (trigger.kind !== 'account-created' && trigger.kind !== 'first-occurrence')) {
      violations.push(v('invalid-trigger', at, 'trigger.kind must be "account-created" or "first-occurrence".'));
    } else if (trigger.kind === 'first-occurrence') {
      if (typeof trigger.event !== 'string' || !ID_PATTERN.test(trigger.event)) violations.push(v('invalid-trigger', at, 'first-occurrence triggers require a lowercase dot/dash event id.'));
      if (Object.keys(trigger).some((key) => key !== 'kind' && key !== 'event')) violations.push(v('invalid-trigger', at, 'unknown trigger field.'));
    } else if (Object.keys(trigger).length !== 1) {
      violations.push(v('invalid-trigger', at, 'account-created triggers take no other fields.'));
    }

    if (token.repeat !== 'once' && token.repeat !== 'repeatable') violations.push(v('invalid-repeat', at, 'repeat must be "once" or "repeatable".'));
    if (!Number.isInteger(token.revision) || (token.revision as number) < 1) violations.push(v('invalid-revision', at, 'revision must be an integer >= 1.'));
    if (!Number.isInteger(token.order) || (token.order as number) < 0) violations.push(v('invalid-order', at, 'order must be an integer >= 0.'));

    const copy = token.copy;
    if (!isObject(copy)) violations.push(v('missing-copy-key', at, 'copy {titleKey, bodyKey, continueKey} is required.'));
    else {
      for (const key of COPY_KEYS) if (!isText(copy[key])) violations.push(v('missing-copy-key', at, `copy.${key} is required.`));
      for (const key of Object.keys(copy)) if (!(COPY_KEYS as readonly string[]).includes(key)) violations.push(v('unknown-field', at, `unknown copy field "${key}".`));
    }

    if (token.imageAssetId !== undefined) {
      if (!isText(token.imageAssetId)) violations.push(v('invalid-asset-ref', at, 'imageAssetId, when present, must be a non-empty string.'));
      else if (options.assetIndex) {
        const asset = options.assetIndex.get(token.imageAssetId);
        if (!asset) violations.push(v('unresolved-asset', at, `imageAssetId "${token.imageAssetId}" is not in the asset manifest.`));
        else if (asset.status === 'deprecated') violations.push(v('deprecated-asset', at, `asset "${token.imageAssetId}" is deprecated.`));
      }
    }
  });

  if (violations.length > 0) return { ok: false, violations: sortViolations(violations) };
  return { ok: true, registry: input as unknown as TutorialRegistry, violations: [] };
};

const sortViolations = (violations: TutorialRegistryViolation[]): TutorialRegistryViolation[] => violations.sort((a, b) => (
  a.path < b.path ? -1 : a.path > b.path ? 1
    : a.rule < b.rule ? -1 : a.rule > b.rule ? 1
      : a.message < b.message ? -1 : a.message > b.message ? 1 : 0
));
