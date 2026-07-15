import { describe, expect, test } from 'vitest';

const loadScreenContract = async () => {
  // @ts-expect-error The helper module is plain .mjs without TS declarations.
  return await import('../../scripts/visual/screen-contract.mjs');
};

describe('visual screen contract', () => {
  test('passes when menu route, diagnostics, and viewport agree', async () => {
    const { buildVisualScreenContract, assertVisualScreenContract } = await loadScreenContract();

    const contract = buildVisualScreenContract({
      expectedRoute: '/?content=core-only&theme=aurora',
      actualUrl: 'http://127.0.0.1:4173/?content=core-only&theme=aurora&runtimeDiagnostics=1&v=proof',
      viewport: { id: 'phone-portrait', width: 390, height: 844 },
      diagnostics: {
        surface: { mode: 'menu', overlay: 'none' },
        viewport: { width: 390, height: 844 }
      }
    });

    expect(assertVisualScreenContract(contract)).toBe(contract);
    expect(contract).toMatchObject({
      pass: true,
      expected: {
        mode: 'menu',
        overlay: 'none'
      },
      actual: {
        mode: 'menu',
        overlay: 'none'
      }
    });
  });

  test('ignores a Vercel share credential consumed before the app loads', async () => {
    const { buildVisualScreenContract } = await loadScreenContract();

    const contract = buildVisualScreenContract({
      expectedRoute: '/?content=core-only&theme=aurora&_vercel_share=temporary-review-token',
      actualUrl: 'https://preview.example.test/?content=core-only&theme=aurora',
      viewport: { width: 393, height: 852 },
      diagnostics: {
        runtime: { mode: 'menu', overlay: 'none' },
        viewport: { width: 393, height: 852 }
      }
    });

    expect(contract.pass).toBe(true);
  });

  test('passes when play route and diagnostics agree', async () => {
    const { buildVisualScreenContract } = await loadScreenContract();

    expect(buildVisualScreenContract({
      expectedRoute: '/?content=core-only&mode=play&theme=aurora',
      actualUrl: 'http://127.0.0.1:4173/?content=core-only&mode=play&theme=aurora&runtimeDiagnostics=1',
      diagnostics: {
        runtime: { mode: 'play', overlay: 'none' }
      }
    })).toMatchObject({
      pass: true,
      expected: {
        mode: 'play'
      },
      actual: {
        mode: 'play'
      },
      failures: []
    });
  });

  test('fails when the visible screen is not the requested route or mode', async () => {
    const { buildVisualScreenContract, assertVisualScreenContract } = await loadScreenContract();

    const contract = buildVisualScreenContract({
      expectedRoute: '/?content=core-only&mode=play&theme=aurora',
      actualUrl: 'http://127.0.0.1:4173/?content=core-only&theme=ember&runtimeDiagnostics=1',
      diagnostics: {
        surface: { mode: 'menu', overlay: 'none' }
      }
    });

    expect(contract.pass).toBe(false);
    expect(contract.failures.map((failure: { code: string }) => failure.code)).toEqual([
      'screen_query_mismatch',
      'screen_query_mismatch',
      'screen_mode_mismatch'
    ]);
    expect(() => assertVisualScreenContract(contract)).toThrow('Visual capture screen contract failed');
  });

  test('fails when the diagnostics viewport disagrees with the requested viewport', async () => {
    const { buildVisualScreenContract } = await loadScreenContract();

    const contract = buildVisualScreenContract({
      expectedRoute: '/?content=core-only&theme=aurora',
      actualUrl: 'http://127.0.0.1:4173/?content=core-only&theme=aurora&runtimeDiagnostics=1',
      viewport: { id: 'phone-portrait', width: 390, height: 844 },
      diagnostics: {
        surface: { mode: 'menu', overlay: 'none' },
        viewport: { width: 405, height: 844 }
      }
    });

    expect(contract.pass).toBe(false);
    expect(contract.failures).toContainEqual({
      code: 'screen_viewport_width_mismatch',
      expected: 390,
      actual: 405
    });
  });

  test('allows callers to assert an overlay reached after page load', async () => {
    const { buildVisualScreenContract } = await loadScreenContract();

    expect(buildVisualScreenContract({
      expectedRoute: '/?content=core-only&theme=aurora',
      actualUrl: 'http://127.0.0.1:4173/?content=core-only&theme=aurora&runtimeDiagnostics=1',
      expectedMode: 'menu',
      expectedOverlay: 'options',
      diagnostics: {
        surface: { mode: 'menu', overlay: 'options' }
      }
    })).toMatchObject({
      pass: true,
      expected: {
        mode: 'menu',
        overlay: 'options'
      },
      actual: {
        mode: 'menu',
        overlay: 'options'
      }
    });
  });
});
