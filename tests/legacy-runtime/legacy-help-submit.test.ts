import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  LEGACY_HELP_RPC,
  buildLegacyHelpRpcArgs,
  resolveLegacyHelpFixtureResult,
  resolveLegacyHelpRpcResult,
  submitLegacyHelpRequest,
  type LegacyHelpRpcClient,
  type LegacyHelpRpcResponse
} from '../../src/legacy-runtime/legacyHelpSubmit';
import type { HelpSubmitPayload } from '../../src/ui/help/helpState';

/**
 * Help send path (MAZER-ONB-001 family). Mock clients only: nothing here reaches a network or a database. The RPC
 * contract is docs/ops/sql-proposals/mazer-help-requests-20261126/apply.sql (live): name, five named parameters, the
 * two answer shapes and the bare error codes.
 */

const PAYLOAD: HelpSubmitPayload = Object.freeze({
  p_build_id: 'abc1234',
  p_email: 'player@example.com',
  p_game_mode: 'endless',
  p_message: 'The star will not open.',
  p_player_level: 12
});

const mockClient = (response: LegacyHelpRpcResponse | (() => never)) => {
  const rpc = vi.fn(async (_name: string, _args?: Record<string, unknown>) => (
    typeof response === 'function' ? response() : response
  ));
  return { client: { rpc } as LegacyHelpRpcClient, rpc };
};

const deps = (client: LegacyHelpRpcClient | null, extra: { isOnline?: () => boolean; search?: string } = {}) => ({
  getClient: async () => client,
  isOnline: extra.isOnline ?? (() => true),
  search: extra.search ?? ''
});

describe('help RPC contract', () => {
  it('names the live RPC and sends exactly its five named parameters (no user id)', () => {
    expect(LEGACY_HELP_RPC).toBe('mazer_submit_help_request_v1');
    expect(Object.keys(buildLegacyHelpRpcArgs(PAYLOAD)).sort()).toEqual(['p_build_id', 'p_email', 'p_game_mode', 'p_message', 'p_player_level']);
    const sql = readFileSync(resolve(process.cwd(), 'docs/ops/sql-proposals/mazer-help-requests-20261126/apply.sql'), 'utf8');
    expect(sql).toContain('mazer_submit_help_request_v1');
    for (const parameter of ['p_email', 'p_message', 'p_build_id', 'p_player_level', 'p_game_mode']) {
      expect(sql, parameter).toContain(parameter);
    }
    for (const code of ['MAZER_HELP_BAD_EMAIL', 'MAZER_HELP_MESSAGE_EMPTY', 'MAZER_HELP_MESSAGE_TOO_LONG', 'retry_after_seconds']) {
      expect(sql, code).toContain(code);
    }
  });

  it('maps the two answer shapes', () => {
    expect(resolveLegacyHelpRpcResult({ data: { status: 'saved' } })).toEqual({ status: 'saved' });
    expect(resolveLegacyHelpRpcResult({ data: { retry_after_seconds: 1500, status: 'rate_limited' } })).toEqual({ retryAfterSeconds: 1500, status: 'rate_limited' });
    expect(resolveLegacyHelpRpcResult({ data: { status: 'rate_limited' } })).toEqual({ retryAfterSeconds: 60, status: 'rate_limited' });
    expect(resolveLegacyHelpRpcResult({ data: { retry_after_seconds: 'x', status: 'rate_limited' } })).toEqual({ retryAfterSeconds: 60, status: 'rate_limited' });
  });

  it('maps the bare error codes; 22023 is told apart by the code name in the message', () => {
    expect(resolveLegacyHelpRpcResult({ error: { code: '22023', message: 'MAZER_HELP_BAD_EMAIL' } })).toEqual({ status: 'bad_email' });
    expect(resolveLegacyHelpRpcResult({ error: { code: '22023', message: 'MAZER_HELP_MESSAGE_EMPTY' } })).toEqual({ status: 'message_empty' });
    expect(resolveLegacyHelpRpcResult({ error: { code: '22001', message: 'MAZER_HELP_MESSAGE_TOO_LONG' } })).toEqual({ status: 'message_too_long' });
    expect(resolveLegacyHelpRpcResult({ error: { code: '22001', message: 'value too long' } })).toEqual({ status: 'message_too_long' });
    // Lock timeout, a deleted account whose JWT still works, anything unknown: one generic failure.
    expect(resolveLegacyHelpRpcResult({ error: { code: '55P03', message: 'lock timeout' } })).toEqual({ status: 'failed' });
    expect(resolveLegacyHelpRpcResult({ error: { code: '23503', message: 'fk' } })).toEqual({ status: 'failed' });
    expect(resolveLegacyHelpRpcResult({ error: { code: null, message: null } })).toEqual({ status: 'failed' });
  });

  it('the browser "no network" wording is offline (keep the draft, offer Try again)', () => {
    for (const message of ['TypeError: Failed to fetch', 'NetworkError when attempting to fetch resource.', 'Network request failed', 'Load failed']) {
      expect(resolveLegacyHelpRpcResult({ error: { message } }), message).toEqual({ status: 'offline' });
    }
  });

  it('an unknown or empty answer is a failure, never a false "sent"', () => {
    expect(resolveLegacyHelpRpcResult({ data: null })).toEqual({ status: 'failed' });
    expect(resolveLegacyHelpRpcResult({ data: { status: 'ok' } })).toEqual({ status: 'failed' });
    expect(resolveLegacyHelpRpcResult({})).toEqual({ status: 'failed' });
  });
});

describe('help send wrapper (mock client)', () => {
  it('calls the RPC once with the payload, signed in or not (no auth gate)', async () => {
    const { client, rpc } = mockClient({ data: { status: 'saved' } });
    await expect(submitLegacyHelpRequest(PAYLOAD, deps(client))).resolves.toEqual({ status: 'saved' });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('mazer_submit_help_request_v1', buildLegacyHelpRpcArgs(PAYLOAD));
  });

  it('offline: no call at all', async () => {
    const { client, rpc } = mockClient({ data: { status: 'saved' } });
    await expect(submitLegacyHelpRequest(PAYLOAD, deps(client, { isOnline: () => false }))).resolves.toEqual({ status: 'offline' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('no client (no Supabase config) is a failure; a thrown call is mapped, never rethrown', async () => {
    await expect(submitLegacyHelpRequest(PAYLOAD, deps(null))).resolves.toEqual({ status: 'failed' });
    const thrower = mockClient(() => { throw new TypeError('Failed to fetch'); });
    await expect(submitLegacyHelpRequest(PAYLOAD, deps(thrower.client))).resolves.toEqual({ status: 'offline' });
    const other = mockClient(() => { throw new Error('boom'); });
    await expect(submitLegacyHelpRequest(PAYLOAD, deps(other.client))).resolves.toEqual({ status: 'failed' });
  });

  it('never logs the typed email or message', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) => vi.spyOn(console, level).mockImplementation(() => {}));
    try {
      for (const response of [{ data: { status: 'saved' } }, { error: { code: '22023', message: 'MAZER_HELP_BAD_EMAIL' } }]) {
        await submitLegacyHelpRequest(PAYLOAD, deps(mockClient(response).client));
      }
      await submitLegacyHelpRequest(PAYLOAD, deps(mockClient(() => { throw new Error('boom'); }).client));
      for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });
});

describe('help QA fixture (dev only)', () => {
  it('needs runtimeDiagnostics=1 AND helpFixture; a plain URL never takes it', () => {
    expect(resolveLegacyHelpFixtureResult('')).toBeNull();
    expect(resolveLegacyHelpFixtureResult('?helpFixture=limited')).toBeNull();
    expect(resolveLegacyHelpFixtureResult('?runtimeDiagnostics=1')).toBeNull();
    expect(resolveLegacyHelpFixtureResult('?runtimeDiagnostics=1&helpFixture=limited')).toEqual({ retryAfterSeconds: 1500, status: 'rate_limited' });
    expect(resolveLegacyHelpFixtureResult('?runtimeDiagnostics=true&helpFixture=offline')).toEqual({ status: 'offline' });
    expect(resolveLegacyHelpFixtureResult('?runtimeDiagnostics=1&helpFixture=nope')).toEqual({ status: 'saved' });
  });

  it('a fixture answers without touching the client', async () => {
    const { client, rpc } = mockClient({ data: { status: 'saved' } });
    await expect(submitLegacyHelpRequest(PAYLOAD, deps(client, { search: '?runtimeDiagnostics=1&helpFixture=failed' }))).resolves.toEqual({ status: 'failed' });
    expect(rpc).not.toHaveBeenCalled();
  });
});
