import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CATALOG_SIGNATURE_SQL,
  assertUnprivilegedReplayUser,
  buildLegacyRepairPlan,
  canonicalizeSql,
  classifyMigrationHistory,
  findDuplicateMigrationIdentities,
  parseAppliedVersionsArgument,
  parseConfirmedPrerequisitesArgument,
  parsePostgresMajor,
  ownedReplayCleanupDecision,
  requiredPreRepairPrerequisites,
  sha256,
  shouldRemoveOwnedReplayPath,
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
    retainedDatabasePrerequisites: [
      "target_specific_migration_lease",
      "exact_live_mazer_catalog_signature_match",
      "verified_backup_or_disposable_classification",
      "post_repair_migration_history_readback",
    ],
    repairSteps: [
      ...target.map((version) => ({ version, status: "applied" })),
      ...legacy.map((version) => ({ version, status: "reverted" })),
    ],
  };
  const preRepairProofs = [
    "target_specific_migration_lease",
    "exact_live_mazer_catalog_signature_match",
    "verified_backup_or_disposable_classification",
  ];
  const emptyCatalogCounts = {
    columns: 0,
    constraints: 0,
    functions: 0,
    grants: 0,
    indexes: 0,
    policies: 0,
    tables: 0,
    triggers: 0,
  };
  const emptySchemaProof = {
    databaseClass: "OWNED_DISPOSABLE",
    evidenceClass: "INDEPENDENT_MAZER_CATALOG_SIGNATURE",
    catalogCounts: emptyCatalogCounts,
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

  it("derives table grants from ACLs including PUBLIC", () => {
    expect(CATALOG_SIGNATURE_SQL).toContain("aclexplode(");
    expect(CATALOG_SIGNATURE_SQL).toContain("acl.grantee = 0 then 'PUBLIC'");
    expect(CATALOG_SIGNATURE_SQL).toContain("acl.privilege_type");
    expect(CATALOG_SIGNATURE_SQL).not.toContain(
      "information_schema.role_table_grants",
    );
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

  it("rejects root before POSIX cluster initialization", () => {
    expect(assertUnprivilegedReplayUser("win32", null)).toEqual({
      platform: "win32",
      uid: null,
      status: "NOT_APPLICABLE",
    });
    expect(assertUnprivilegedReplayUser("linux", 1000)).toEqual({
      platform: "linux",
      uid: 1000,
      status: "SATISFIED",
    });
    expect(() => assertUnprivilegedReplayUser("linux", 0)).toThrow(
      /must run as an unprivileged user/,
    );
    expect(() => assertUnprivilegedReplayUser("linux", null)).toThrow(
      /could not determine the POSIX user id/,
    );
  });

  it("preserves the owned replay path until shutdown is confirmed", () => {
    expect(
      shouldRemoveOwnedReplayPath({
        startAttempted: false,
        stopSucceeded: false,
        portReleased: true,
      }),
    ).toBe(true);
    expect(
      shouldRemoveOwnedReplayPath({
        startAttempted: true,
        stopSucceeded: true,
        portReleased: true,
      }),
    ).toBe(true);
    expect(
      shouldRemoveOwnedReplayPath({
        startAttempted: true,
        stopSucceeded: false,
        portReleased: true,
      }),
    ).toBe(false);
    expect(
      shouldRemoveOwnedReplayPath({
        startAttempted: true,
        stopSucceeded: true,
        portReleased: false,
      }),
    ).toBe(false);
  });

  it("returns a precise blocker when PostgreSQL stop is unconfirmed", () => {
    expect(
      ownedReplayCleanupDecision({
        startAttempted: true,
        started: true,
        stopSucceeded: false,
        portReleased: true,
      }),
    ).toEqual({
      pathRemovalAllowed: false,
      blockers: ["POSTGRES_STOP_UNCONFIRMED"],
    });
  });

  it("preserves partial-start artifacts when startup outcome is unconfirmed", () => {
    expect(
      ownedReplayCleanupDecision({
        startAttempted: true,
        started: false,
        stopSucceeded: false,
        portReleased: false,
      }),
    ).toEqual({
      pathRemovalAllowed: false,
      blockers: [
        "POSTGRES_STARTUP_OUTCOME_UNCONFIRMED",
        "OWNED_PORT_RELEASE_UNCONFIRMED",
      ],
    });
  });

  it("fails closed and emits deterministic legacy history repair steps", () => {
    expect(classifyMigrationHistory([], legacy, target)).toBe(
      "EMPTY_UNPROVEN",
    );
    expect(classifyMigrationHistory(legacy, legacy, target)).toBe(
      "REPAIR_REQUIRED",
    );
    expect(classifyMigrationHistory(target, legacy, target)).toBe("CURRENT");
    expect(
      classifyMigrationHistory([...legacy, target[0]], legacy, target),
    ).toBe("BLOCKED");

    const plan = buildLegacyRepairPlan(
      legacyContract,
      legacy,
      preRepairProofs,
    );
    expect(plan.ok).toBe(true);
    expect(plan.failClosed).toBe(true);
    expect(plan.normalApplyAllowed).toBe(false);
    expect(plan.mutationPerformed).toBe(false);
    expect(plan.commands).toEqual([
      ...target.map(
        (version) =>
          "supabase migration repair " + version + " --status applied",
      ),
      ...legacy.map(
        (version) =>
          "supabase migration repair " + version + " --status reverted",
      ),
    ]);

  });

  it("fails closed when empty-history catalog proof is missing or contradictory", () => {
    const missing = buildLegacyRepairPlan(
      legacyContract,
      [],
      preRepairProofs,
    );
    const contradictory = buildLegacyRepairPlan(
      legacyContract,
      [],
      preRepairProofs,
      { ...emptySchemaProof, databaseClass: "RETAINED" },
    );

    expect(missing.historyState).toBe("EMPTY_UNPROVEN");
    expect(missing.emptySchemaProofState).toBe("UNPROVEN");
    expect(missing.normalApplyAllowed).toBe(false);
    expect(missing.commands).toEqual([]);
    expect(contradictory.historyState).toBe("BLOCKED");
    expect(contradictory.emptySchemaProofState).toBe("BLOCKED");
    expect(contradictory.normalApplyAllowed).toBe(false);
    expect(contradictory.commands).toEqual([]);
  });

  it("blocks empty history when the independent Mazer catalog is populated", () => {
    const plan = buildLegacyRepairPlan(
      legacyContract,
      [],
      preRepairProofs,
      {
        ...emptySchemaProof,
        catalogCounts: { ...emptyCatalogCounts, tables: 1 },
      },
    );

    expect(plan.historyState).toBe("BLOCKED");
    expect(plan.emptySchemaProofState).toBe("BLOCKED");
    expect(plan.normalApplyAllowed).toBe(false);
    expect(plan.commands).toEqual([]);
    expect(plan.reason).toMatch(/catalog is populated or invalid/);
  });

  it("allows zero-to-head replay only with proven empty disposable catalog evidence", () => {
    const plan = buildLegacyRepairPlan(
      legacyContract,
      [],
      preRepairProofs,
      emptySchemaProof,
    );

    expect(
      classifyMigrationHistory([], legacy, target, emptySchemaProof),
    ).toBe("FRESH");
    expect(plan.historyState).toBe("FRESH");
    expect(plan.emptySchemaProofState).toBe("PROVEN_EMPTY");
    expect(plan.normalApplyAllowed).toBe(true);
    expect(plan.commands).toEqual([]);
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

  it("requires explicit prerequisite proof input", () => {
    const missing = parseConfirmedPrerequisitesArgument([
      "--legacy-repair-plan",
    ]);
    expect(missing.ok).toBe(false);
    expect(missing.inputState).toBe("MISSING");
    expect(missing.confirmedPrerequisites).toEqual([]);

    const empty = parseConfirmedPrerequisitesArgument([
      "--confirmed-prerequisites",
      "",
    ]);
    expect(empty.ok).toBe(false);
    expect(empty.inputState).toBe("EMPTY");
    expect(empty.confirmedPrerequisites).toEqual([]);
  });

  it("emits commands only for exact history with all pre-repair proofs", () => {
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
      preRepairProofs,
    );
    expect(plan.ok).toBe(true);
    expect(plan.historyState).toBe("REPAIR_REQUIRED");
    expect(plan.commands).toHaveLength(7);
    expect(plan.prerequisiteState).toBe("CONFIRMED");
    expect(plan.requiredPostRepairProofs).toEqual([
      "post_repair_migration_history_readback",
    ]);
  });

  it.each([
    ["missing", [], "MISSING"],
    ["partial", preRepairProofs.slice(0, 2), "MISSING"],
    ["unknown", [...preRepairProofs, "invented_proof"], "BLOCKED"],
  ])("emits no commands when prerequisite proof is %s", (_label, proofs, state) => {
    const plan = buildLegacyRepairPlan(legacyContract, legacy, proofs);
    expect(plan.ok).toBe(false);
    expect(plan.historyState).toBe("REPAIR_REQUIRED");
    expect(plan.prerequisiteState).toBe(state);
    expect(plan.commands).toEqual([]);
  });

  it.each([
    ["current", target, "CURRENT"],
    ["mixed", [...legacy, target[0]], "BLOCKED"],
    ["partial", legacy.slice(0, 2), "BLOCKED"],
    ["unknown", ["19990101000000"], "BLOCKED"],
  ])("emits no commands for %s observed history", (_label, versions, state) => {
    const plan = buildLegacyRepairPlan(
      legacyContract,
      versions,
      preRepairProofs,
    );
    expect(plan.ok).toBe(false);
    expect(plan.historyState).toBe(state);
    expect(plan.commands).toEqual([]);
  });

  it("derives pre-repair proofs without treating readback as precondition", () => {
    expect(requiredPreRepairPrerequisites(legacyContract)).toEqual(
      preRepairProofs,
    );
  });

  it("never exposes a falsely fresh history at a repair interruption point", () => {
    const plan = buildLegacyRepairPlan(
      legacyContract,
      legacy,
      preRepairProofs,
    );
    const history = new Set(legacy);

    for (const command of plan.commands) {
      const match = command.match(
        /^supabase migration repair (\d+) --status (applied|reverted)$/,
      );
      expect(match).not.toBeNull();
      const [, version, status] = match;
      if (status === "applied") {
        history.add(version);
      } else {
        history.delete(version);
      }
      expect(
        classifyMigrationHistory([...history], legacy, target),
      ).not.toBe("FRESH");
    }

    expect(classifyMigrationHistory([...history], legacy, target)).toBe(
      "CURRENT",
    );
  });

  it("keeps the documented POSIX repair command on one continued invocation", () => {
    const documentation = readFileSync(
      resolve("docs/MAZER_SUPABASE_STORAGE.md"),
      "utf8",
    ).replaceAll("\r\n", "\n");
    const documentedCommand =
      "npm run supabase:legacy-repair-plan -- --applied-versions " +
      legacy.join(",") +
      " \\\n" +
      "  --confirmed-prerequisites " +
      preRepairProofs.join(",");

    expect(documentation).toContain(documentedCommand);
  });

  it("documents empty-history authorization as owned-replay-only", () => {
    const documentation = readFileSync(
      resolve("docs/MAZER_SUPABASE_STORAGE.md"),
      "utf8",
    ).replaceAll("\r\n", "\n");

    expect(documentation).toContain(
      "The legacy repair-plan CLI intentionally does not accept or authorize\n" +
        "empty-history catalog proof.",
    );
    expect(documentation).toContain(
      "Only the owned replay harness can return `FRESH`",
    );
  });
});
