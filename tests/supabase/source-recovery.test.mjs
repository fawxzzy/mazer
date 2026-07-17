import { describe, expect, it } from "vitest";

import {
  buildLegacyRepairPlan,
  canonicalizeSql,
  classifyMigrationHistory,
  findDuplicateMigrationIdentities,
  parsePostgresMajor,
  sha256,
  verifySourceRecovery,
} from "../../scripts/supabase/verify-source-recovery.mjs";

describe("Mazer Supabase source recovery", () => {
  it("maps exactly one canonical source to every live migration version", () => {
    const result = verifySourceRecovery();

    expect(result.ok).toBe(true);
    expect(result.migrationCount).toBe(4);
    expect(result.duplicateVersions).toEqual([]);
    expect(result.duplicateNames).toEqual([]);
    expect(result.legacyHistory.historyState).toBe("REPAIR_REQUIRED");
    expect(result.legacyHistory.normalApplyAllowed).toBe(false);
  });

  it("uses newline-insensitive canonical SQL digests", () => {
    const lf = "select 1;\n\nselect 2;\n";
    const crlf = "select 1;\r\n\r\nselect 2;\r\n";

    expect(canonicalizeSql(lf)).toBe(canonicalizeSql(crlf));
    expect(sha256(canonicalizeSql(lf))).toBe(sha256(canonicalizeSql(crlf)));
  });

  it("rejects duplicate executable migration versions and names", () => {
    const duplicates = findDuplicateMigrationIdentities([
      "20260709045557_mazer_progression_state.sql",
      "20260709045557_another_identity.sql",
      "20260709045648_mazer_progression_state.sql",
    ]);

    expect(duplicates.versions).toEqual(["20260709045557"]);
    expect(duplicates.names).toEqual(["mazer_progression_state"]);
  });

  it("identifies the PostgreSQL major version before replay", () => {
    expect(parsePostgresMajor("postgres (PostgreSQL) 17.9")).toBe(17);
    expect(parsePostgresMajor("psql (PostgreSQL) 16.10")).toBe(16);
    expect(() => parsePostgresMajor("unknown database")).toThrow(
      /Unable to determine PostgreSQL major version/,
    );
  });

  it("fails closed and emits deterministic legacy history repair steps", () => {
    const legacy = ["20260709005739", "20260709011209", "20260716205924"];
    const target = [
      "20260709045557",
      "20260709045648",
      "20260709045725",
      "20260716211513",
    ];
    const contract = {
      legacyVersions: legacy.map((version) => ({ version })),
      targetVersions: target,
      disposableDatabaseDisposition: "RESET_AND_REPLAY_FROM_ZERO",
      retainedDatabaseDisposition: "EXACT_CATALOG_PROOF_THEN_HISTORY_REPAIR",
      retainedDatabasePrerequisites: ["exact_live_mazer_catalog_signature_match"],
      repairSteps: [
        ...legacy.map((version) => ({ version, status: "reverted" })),
        ...target.map((version) => ({ version, status: "applied" })),
      ],
    };

    expect(classifyMigrationHistory([], legacy, target)).toBe("FRESH");
    expect(classifyMigrationHistory(legacy, legacy, target)).toBe(
      "REPAIR_REQUIRED",
    );
    expect(classifyMigrationHistory(target, legacy, target)).toBe("CURRENT");
    expect(
      classifyMigrationHistory([...legacy, target[0]], legacy, target),
    ).toBe("BLOCKED");

    const plan = buildLegacyRepairPlan(contract, legacy);
    expect(plan.ok).toBe(true);
    expect(plan.failClosed).toBe(true);
    expect(plan.normalApplyAllowed).toBe(false);
    expect(plan.mutationPerformed).toBe(false);
    expect(plan.commands).toEqual([
      ...legacy.map(
        (version) =>
          "supabase migration repair " + version + " --status reverted",
      ),
      ...target.map(
        (version) =>
          "supabase migration repair " + version + " --status applied",
      ),
    ]);
  });
});
