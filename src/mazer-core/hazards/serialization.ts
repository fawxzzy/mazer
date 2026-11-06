/**
 * DRAFT stable serialization for hazard witnesses and verdict records (packet P3).
 * Output is canonical JSON: object keys sorted by code point, no insignificant
 * whitespace, no trailing newline, so equal values always produce identical bytes.
 */

import { HAZARD_ACTION_ORDER, type HazardAction } from './graphContract';
import { HAZARD_WITNESS_CONTRACT, type HazardWitness } from './solvability';

const encode = (value: unknown, path: string): string => {
  if (value === null) {
    return 'null';
  }
  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number':
      if (!Number.isFinite(value)) {
        throw new TypeError(`non-finite number at ${path}`);
      }
      return JSON.stringify(value);
    case 'string':
      return JSON.stringify(value);
    case 'object': {
      if (Array.isArray(value)) {
        return `[${value.map((item, index) => encode(item, `${path}[${index}]`)).join(',')}]`;
      }
      const record = value as Record<string, unknown>;
      const parts: string[] = [];
      for (const key of Object.keys(record).sort()) {
        if (record[key] === undefined) {
          continue;
        }
        parts.push(`${JSON.stringify(key)}:${encode(record[key], `${path}.${key}`)}`);
      }
      return `{${parts.join(',')}}`;
    }
    default:
      throw new TypeError(`unsupported value at ${path}`);
  }
};

export const stableStringify = (value: unknown): string => encode(value, '$');

export const serializeWitness = (witness: HazardWitness): string => stableStringify(witness);

const isIntegerArray = (value: unknown): value is number[] => (
  Array.isArray(value) && value.every((item) => Number.isInteger(item))
);

/** Parses and shape-checks a persisted witness; throws on any structural problem. */
export const parseWitness = (text: string): HazardWitness => {
  const data = JSON.parse(text) as Record<string, unknown>;
  const integerFields = ['width', 'height', 'start', 'goal', 'startTick', 'invulnerableTurns', 'period', 'ticks', 'waits'];
  if (data === null || typeof data !== 'object' || data.contract !== HAZARD_WITNESS_CONTRACT) {
    throw new TypeError('not a hazard witness record');
  }
  for (const field of integerFields) {
    if (!Number.isInteger(data[field])) {
      throw new TypeError(`witness field ${field} must be an integer`);
    }
  }
  if (!isIntegerArray(data.cells) || !Array.isArray(data.actions)) {
    throw new TypeError('witness cells/actions malformed');
  }
  const actions = data.actions as unknown[];
  if (!actions.every((action) => HAZARD_ACTION_ORDER.includes(action as HazardAction))) {
    throw new TypeError('witness contains an unknown action');
  }
  if (data.cells.length !== actions.length + 1 || data.ticks !== actions.length) {
    throw new TypeError('witness length mismatch');
  }
  return data as unknown as HazardWitness;
};
