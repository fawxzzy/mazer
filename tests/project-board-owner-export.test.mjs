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
