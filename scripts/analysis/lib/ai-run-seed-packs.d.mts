// Declarations for the pieces of ai-run-seed-packs.mjs consumed by TypeScript
// (the seed-pack runner). The full surface is exercised by the .mjs tests.
export function assertValidSeedPack(pack: unknown): unknown;
export function canonicalJson(value: unknown): string;
export function roundTo(value: number, precision?: number): number | null;
export function createBaselineReportFromCases(input: {
  pack: { packId: string; packVersion: string; hash: string; purpose?: unknown; runnerContract?: unknown; targets: unknown[] };
  cases: Array<{ targetId: string } & Record<string, unknown>>;
  environment: Record<string, unknown>;
}): Record<string, any>;
