import { describe, expect, it } from "vitest";

import {
  buildLegacyRepairPlan,
  canonicalizeSql,
  classifyMigrationHistory,
  findDuplicateMigrationIdentities,
  parseAppliedVersionsArgument,
  parsePostgresMajor,
  sha256,
  verifySourceRecovery,
} from "../../scripts/supabase/verify-source-recovery.mjs";

describe("Mazer Supabase source recovery", () => {
  const legacy = ["20260709005739", "20260709011209", "20260716205924"];
  const target = [
    "20260709045557",
    "20260709045648",
    "20260709045725",
    "20260716211513",
  ];
  const legacyContract = {
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
    expect(classifyMigrationHistory([], legacy, target)).toBe("FRESH");
    expect(classifyMigrationHistory(legacy, legacy, target)).toBe(
      "REPAIR_REQUIRED",
    );
    expect(classifyMigrationHistory(target, legacy, target)).toBe("CURRENT");
    expect(
      classifyMigrationHistory([...legacy, target[0]], legacy, target),
    ).toBe("BLOCKED");

    const plan = buildLegacyRepairPlan(legacyContract, legacy);
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

  it("requires the applied-versions flag and rejects an empty value", () => {
    const missing = parseAppliedVersionsArgument(["--legacy-repair-plan"]);
    expect(missing.ok).toBe(false);
    expect(missing.inputState).toBe("MISSING");
    expect(missing.appliedVersions).toBeUndefined();

    const empty = parseAppliedVersionsArgument([
      "--legacy-repair-plan",
      "--applied-versions",
      "",
    ]);
    expect(empty.ok).toBe(false);
    expect(empty.inputState).toBe("EMPTY");
    expect(empty.appliedVersions).toBeUndefined();

    const unknownPlan = buildLegacyRepairPlan(legacyContract);
    expect(unknownPlan.ok).toBe(false);
    expect(unknownPlan.historyState).toBe("UNKNOWN");
    expect(unknownPlan.normalApplyAllowed).toBe(false);
    expect(unknownPlan.commands).toEqual([]);
  });

  it("emits commands only for explicitly observed exact legacy history", () => {
    const observed = parseAppliedVersionsArgument([
      "--applied-versions",
      legacy.join(","),
    ]);
    expect(observed.ok).toBe(true);
    expect(observed.inputState).toBe("OBSERVED");
    expect(observed.appliedVersions).toEqual(legacy);

    const plan = buildLegacyRepairPlan(
      legacyContract,
      observed.appliedVersions,
    );
    expect(plan.ok).toBe(true);
    expect(plan.historyState).toBe("REPAIR_REQUIRED");
    expect(plan.commands).toHaveLength(7);
  });

  it.each([
    ["current", target, "CURRENT"],
    ["mixed", [...legacy, target[0]], "BLOCKED"],
    ["partial", legacy.slice(0, 2), "BLOCKED"],
    ["unknown", ["19990101000000"], "BLOCKED"],
  ])("emits no commands for %s observed history", (_label, versions, state) => {
    const plan = buildLegacyRepairPlan(legacyContract, versions);
    expect(plan.ok).toBe(false);
    expect(plan.historyState).toBe(state);
    expect(plan.commands).toEqual([]);
  });
});
