import { describe, expect, it } from "vitest";

import {
  canonicalizeSql,
  findDuplicateMigrationIdentities,
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
});
