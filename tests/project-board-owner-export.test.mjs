import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  assertFawxzzyWebConsumerAcceptance,
  assertPublicSafety,
  buildProjectBoardOwnerExport,
  readOwnerExportSources,
  renderProjectBoardOwnerExport,
  runProjectBoardOwnerExport,
} from "../scripts/export-project-board-owner.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");
const bytes = readOwnerExportSources(repoRoot);
const registry = JSON.parse(bytes["mazer-owner-work-registry"]);

test("exports only the exact current public Mazer owner set", () => {
  const output = buildProjectBoardOwnerExport(registry, bytes);
  assert.equal(output.contract_version, "atlas.project-board.owner-export.v1");
  assert.equal(output.project_id, "mazer");
  assert.equal(output.board_id, "discordos:project-feedback:mazer");
  assert.equal(output.extensions.stable_identity_count, 13);
  assert.equal(output.cards.length, 3);
  assert.deepEqual(output.cards.map((card) => card.record.card_id), ["MAZER-2D-001", "MAZER-NATIVE-001", "MAZER-WORLD-001"]);
  assert.equal(new Set(output.cards.map((card) => card.idempotency_key)).size, 3);
  assert.deepEqual(
    output.cards.find((card) => card.record.card_id === "MAZER-WORLD-001").record.dependencies,
    ["MAZER-2D-001", "MAZER-TELEPORT-001"],
  );
  assert.equal(
    output.cards.length + output.extensions.excluded_completed_card_count + output.extensions.excluded_deferred_candidate_count,
    output.extensions.stable_identity_count,
  );
});

test("retains completed truth in the registry and excludes it from public cards", () => {
  const output = buildProjectBoardOwnerExport(registry, bytes);
  const completed = registry.workItems.filter((item) => item.status === "completed");
  assert.equal(completed.length, 8);
  assert.equal(output.extensions.excluded_completed_card_count, 8);
  for (const item of completed) assert.equal(output.cards.some((card) => card.record.card_id === item.id), false);
});

test("excludes deferred research candidates and imports no research inventory", () => {
  const output = buildProjectBoardOwnerExport(registry, bytes);
  const deferred = registry.workItems.filter((item) => item.status === "deferred_candidate");
  assert.equal(deferred.length, 2);
  assert.equal(output.extensions.excluded_deferred_candidate_count, 2);
  assert.equal(output.extensions.imported_research_candidate_count, 0);
  assert.equal(output.extensions.research_candidate_exported_count, 0);
  for (const item of deferred) assert.equal(output.cards.some((card) => card.record.card_id === item.id), false);
});

test("maps active and planned lifecycle without inventing readiness", () => {
  const output = buildProjectBoardOwnerExport(registry, bytes);
  const byId = new Map(output.cards.map((card) => [card.record.card_id, card]));
  assert.deepEqual([byId.get("MAZER-2D-001").record_status, byId.get("MAZER-2D-001").record.lifecycle], ["active", "in-progress"]);
  assert.deepEqual([byId.get("MAZER-WORLD-001").record_status, byId.get("MAZER-WORLD-001").record.lifecycle], ["active", "in-progress"]);
  assert.deepEqual([byId.get("MAZER-NATIVE-001").record_status, byId.get("MAZER-NATIVE-001").record.lifecycle], ["candidate", "planning"]);
  assert.ok(output.cards.every((card) => card.content.blockers.length === 0));
});

test("validates stable dependency relationships and preserves deterministic deduplication", () => {
  const withDuplicate = structuredClone(registry);
  const world = withDuplicate.workItems.find((item) => item.id === "MAZER-WORLD-001");
  world.dependencies = ["MAZER-2D-001", "MAZER-2D-001"];
  const output = buildProjectBoardOwnerExport(withDuplicate, {
    ...bytes,
    "mazer-owner-work-registry": JSON.stringify(withDuplicate),
  });
  const exportedWorld = output.cards.find((card) => card.record.card_id === "MAZER-WORLD-001");
  assert.deepEqual(exportedWorld.record.dependencies, ["MAZER-2D-001"]);

  const malformed = structuredClone(registry);
  malformed.workItems[0].dependencies = "MAZER-WORLD-001";
  assert.throws(
    () => buildProjectBoardOwnerExport(malformed, { ...bytes, "mazer-owner-work-registry": JSON.stringify(malformed) }),
    /dependencies must be an array/,
  );

  const dangling = structuredClone(registry);
  dangling.workItems[0].dependencies = ["MAZER-MISSING-001"];
  assert.throws(
    () => buildProjectBoardOwnerExport(dangling, { ...bytes, "mazer-owner-work-registry": JSON.stringify(dangling) }),
    /unknown stable registry identity/,
  );

  const malformedEntry = structuredClone(registry);
  malformedEntry.workItems[0].dependencies = [null];
  assert.throws(
    () => buildProjectBoardOwnerExport(malformedEntry, { ...bytes, "mazer-owner-work-registry": JSON.stringify(malformedEntry) }),
    /unknown stable registry identity/,
  );

  const self = structuredClone(registry);
  self.workItems[0].dependencies = [self.workItems[0].id];
  assert.throws(
    () => buildProjectBoardOwnerExport(self, { ...bytes, "mazer-owner-work-registry": JSON.stringify(self) }),
    /cannot depend on itself/,
  );
});

test("resolves only rendered Markdown headings with the required GitHub-compatible slug behavior", () => {
  assert.doesNotThrow(() => buildProjectBoardOwnerExport(registry, bytes));

  const duplicateHeading = structuredClone(registry);
  duplicateHeading.workItems[0].sourceRef = "docs/current-truth.md#repeated-heading-1";
  assert.doesNotThrow(() => buildProjectBoardOwnerExport(duplicateHeading, {
    ...bytes,
    "mazer-owner-work-registry": JSON.stringify(duplicateHeading),
    "mazer-current-truth": `${bytes["mazer-current-truth"]}\n## Repeated heading\n\n## Repeated heading\n`,
  }));

  const underscoreHeading = structuredClone(registry);
  underscoreHeading.workItems[0].sourceRef = "docs/current-truth.md#heading_with_underscore-punctuation";
  assert.doesNotThrow(() => buildProjectBoardOwnerExport(underscoreHeading, {
    ...bytes,
    "mazer-owner-work-registry": JSON.stringify(underscoreHeading),
    "mazer-current-truth": `${bytes["mazer-current-truth"]}\n## Heading_with_underscore: punctuation!\n`,
  }));

  for (const [label, fencedMarkdown] of [
    ["backtick fence with info string", "````markdown\n## Fenced Heading\n````"],
    ["tilde fence with a longer closer", "~~~md\nFenced Heading\n---\n~~~~"],
    ["short closer does not end a fence", "````md\n## Fenced Heading\n```\n## Still Fenced\n````"],
    ["indented code", "    ## Fenced Heading"],
  ]) {
    const fencedHeading = structuredClone(registry);
    fencedHeading.workItems[0].sourceRef = "docs/current-truth.md#fenced-heading";
    assert.throws(
      () => buildProjectBoardOwnerExport(fencedHeading, {
        ...bytes,
        "mazer-owner-work-registry": JSON.stringify(fencedHeading),
        "mazer-current-truth": `${bytes["mazer-current-truth"]}\n${fencedMarkdown}\n`,
      }),
      /sourceRef fragment does not exist/,
      label,
    );
  }

  const headingAfterFence = structuredClone(registry);
  headingAfterFence.workItems[0].sourceRef = "docs/current-truth.md#heading-after-fence";
  assert.doesNotThrow(() => buildProjectBoardOwnerExport(headingAfterFence, {
    ...bytes,
    "mazer-owner-work-registry": JSON.stringify(headingAfterFence),
    "mazer-current-truth": `${bytes["mazer-current-truth"]}\n\`\`\`md\n## Fenced Heading\n\`\`\`\n## Heading After Fence\n`,
  }));

  for (const [label, commentedMarkdown] of [
    ["same-line comment", "<!-- ## Commented Heading -->"],
    ["multiline comment", "<!--\n## Commented Heading\n-->"],
    ["comment then heading on the same line", "<!-- hidden --> ## Commented Heading"],
  ]) {
    const commentedHeading = structuredClone(registry);
    commentedHeading.workItems[0].sourceRef = "docs/current-truth.md#commented-heading";
    assert.throws(
      () => buildProjectBoardOwnerExport(commentedHeading, {
        ...bytes,
        "mazer-owner-work-registry": JSON.stringify(commentedHeading),
        "mazer-current-truth": `${bytes["mazer-current-truth"]}\n${commentedMarkdown}\n`,
      }),
      /sourceRef fragment does not exist/,
      label,
    );
  }

  for (const [sourceRef, markdown] of [
    ["docs/current-truth.md#heading-before-comment", "## Heading Before Comment\n<!--\n## Hidden Heading\n-->"],
    ["docs/current-truth.md#heading-after-comment", "<!-- hidden -->\n## Heading After Comment"],
    ["docs/current-truth.md#heading-with-trailing-comment", "## Heading With Trailing Comment <!-- hidden -->"],
  ]) {
    const visibleHeading = structuredClone(registry);
    visibleHeading.workItems[0].sourceRef = sourceRef;
    assert.doesNotThrow(() => buildProjectBoardOwnerExport(visibleHeading, {
      ...bytes,
      "mazer-owner-work-registry": JSON.stringify(visibleHeading),
      "mazer-current-truth": `${bytes["mazer-current-truth"]}\n${markdown}\n`,
    }));
  }

  const dangling = structuredClone(registry);
  dangling.workItems[0].sourceRef = "docs/current-truth.md#renamed-or-missing-heading";
  assert.throws(
    () => buildProjectBoardOwnerExport(dangling, { ...bytes, "mazer-owner-work-registry": JSON.stringify(dangling) }),
    /sourceRef fragment does not exist/,
  );
});

test("requires every work item card type to match the atlas.card-record.v2 enum", () => {
  for (const [label, cardType] of [
    ["missing", undefined],
    ["non-string", null],
    ["unsupported", "feature_typo"],
  ]) {
    const malformed = structuredClone(registry);
    if (cardType === undefined) delete malformed.workItems[0].cardType;
    else malformed.workItems[0].cardType = cardType;
    assert.throws(
      () => buildProjectBoardOwnerExport(malformed, { ...bytes, "mazer-owner-work-registry": JSON.stringify(malformed) }),
      /cardType must be a supported atlas\.card-record\.v2 card type/,
      label,
    );
  }
});

test("keeps DiscordOS as provenance and board identity only", () => {
  const output = buildProjectBoardOwnerExport(registry, bytes);
  assert.equal(output.extensions.discordos_role, "provenance-and-board-identity-only");
  assert.ok(output.sources.every((source) => source.repository === "mazer"));
  assert.ok(output.cards.every((card) => card.record.owner === "mazer"));
  assert.ok(output.cards.every((card) => card.record.board_id === "discordos:project-feedback:mazer"));
});

test("passes the public-safety and FawxzzyWeb consumer contracts", () => {
  const output = buildProjectBoardOwnerExport(registry, bytes);
  assert.equal(assertPublicSafety(output), true);
  assert.equal(assertFawxzzyWebConsumerAcceptance(output), true);
  const unsafe = structuredClone(output);
  unsafe.cards[0].content.secret = "redacted";
  assert.throws(() => assertPublicSafety(unsafe), /forbidden key/);
  const terminal = structuredClone(output);
  terminal.cards[0].record.lifecycle = "completed";
  assert.throws(() => assertFawxzzyWebConsumerAcceptance(terminal), /non-public lifecycle/);
});

test("scans the complete public envelope and rejects sensitive values without echoing them", () => {
  const output = buildProjectBoardOwnerExport(registry, bytes);
  const hostileCases = [
    ["top-level forbidden metadata", (value) => { value.access_token = "not-public"; }, /forbidden key export\.access_token/],
    ["source forbidden metadata", (value) => { value.sources[0].credential = "not-public"; }, /forbidden key export\.sources\[0\]\.credential/],
    ["email in title", (value) => { value.cards[0].record.title = "Contact owner@example.com"; }, /sensitive email address/],
    ["secret in description", (value) => { value.cards[0].record.description = "token=private-value"; }, /sensitive credential-like assignment/],
    ["secret in acceptance criteria", (value) => { value.cards[0].content.acceptance_criteria[0] = "Use https:\/\/example.test\/?token=private-value"; }, /sensitive query value/],
    ["PKCS8 private key", (value) => { value.cards[0].record.title = "-----BEGIN PRIVATE KEY-----\nprivate-material"; }, /sensitive PEM private key/],
    ["RSA private key with case and spacing drift", (value) => { value.cards[0].record.description = "-----begin  rsa   private key -----"; }, /sensitive PEM private key/],
    ["OpenSSH private key", (value) => { value.cards[0].content.acceptance_criteria[0] = "-----BEGIN OPENSSH PRIVATE KEY-----"; }, /sensitive PEM private key/],
    ["PGP private key block", (value) => { value.cards[0].content.summary = "-----BEGIN PGP PRIVATE KEY BLOCK-----"; }, /sensitive PEM private key/],
  ];
  for (const [label, mutate, expected] of hostileCases) {
    const hostile = structuredClone(output);
    mutate(hostile);
    assert.throws(() => assertPublicSafety(hostile), (error) => {
      assert.match(error.message, expected, label);
      assert.doesNotMatch(error.message, /owner@example\.com|private-value|not-public|BEGIN.*PRIVATE KEY/i, `${label} echoed a sensitive value`);
      return true;
    });
  }

  for (const safePemLabel of ["-----BEGIN PUBLIC KEY-----", "-----BEGIN CERTIFICATE-----"]) {
    const safe = structuredClone(output);
    safe.cards[0].record.title = safePemLabel;
    assert.doesNotThrow(() => assertPublicSafety(safe));
  }
});

test("renders deterministically and keeps the checked export current", () => {
  assert.equal(renderProjectBoardOwnerExport(repoRoot), renderProjectBoardOwnerExport(repoRoot));
  runProjectBoardOwnerExport(["--check"], repoRoot);
});

test("fails closed on denominator, identity, source, and stale-output drift", () => {
  const duplicate = structuredClone(registry);
  duplicate.workItems[1].id = duplicate.workItems[0].id;
  assert.throws(() => buildProjectBoardOwnerExport(duplicate, { ...bytes, "mazer-owner-work-registry": JSON.stringify(duplicate) }), /unique stable MAZER ids/);

  const missing = structuredClone(registry);
  missing.workItems.pop();
  assert.throws(() => buildProjectBoardOwnerExport(missing, { ...bytes, "mazer-owner-work-registry": JSON.stringify(missing) }), /stable identity denominator/);

  const unsupported = structuredClone(registry);
  const completed = unsupported.workItems.find((item) => item.status === "completed");
  completed.status = "complete_typo";
  unsupported.provenance.completedExcludedCount -= 1;
  assert.throws(
    () => buildProjectBoardOwnerExport(unsupported, { ...bytes, "mazer-owner-work-registry": JSON.stringify(unsupported) }),
    /unsupported lifecycle status/,
  );

  const badSource = structuredClone(registry);
  badSource.workItems[0].sourceRef = "docs/roadmap.md#active-lane";
  assert.throws(() => buildProjectBoardOwnerExport(badSource, { ...bytes, "mazer-owner-work-registry": JSON.stringify(badSource) }), /sourceRef is not bound/);

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "mazer-owner-export-"));
  try {
    for (const relativePath of ["config/mazer-owner-work-registry.json", "docs/current-truth.md", "docs/roadmap.md", "docs/mobile-plan.md", "scripts/export-project-board-owner.mjs"]) {
      const target = path.join(temp, relativePath);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(path.join(repoRoot, relativePath), target);
    }
    fs.mkdirSync(path.join(temp, "exports"), { recursive: true });
    fs.writeFileSync(path.join(temp, "exports/mazer.project-board.owner-export.v1.json"), "{}\n");
    assert.throws(() => runProjectBoardOwnerExport(["--check"], temp), /stale/);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
