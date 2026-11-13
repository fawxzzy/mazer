import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  appendUpdateLine, canonicalJson, completedProblems, dueStatus, eventId, foldEvents, KEEP_UPDATE_LINES, parseJsonl, validateEventShape, withId,
} from "../scripts/board/board-events.mjs";
import {
  appendEvent, patchLedgerText, applyPlan, checkIntegrity, computePlan, computeStatus, flushLocal, formatPlan, localFallbackPath, readRemoteEvents, runBoardSync, serializeJson,
} from "../scripts/board/board-sync.mjs";
import { repinWeb, WEB_NEXT_COMMANDS } from "../scripts/board/web-repin.mjs";
import { renderOutputs } from "../scripts/analysis/work-report.mjs";
import { PUBLIC_TEXT_SCREENS, screenMatches } from "../scripts/board/public-text-screens.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");
const M = "fawxzzy/mazer";
const tmp = (label) => fs.mkdtempSync(path.join(os.tmpdir(), `board-sync-${label}-`));

const registry = (cards) => ({
  schemaVersion: 1,
  updatedAt: "2026-11-01T00:00:00.000Z",
  provenance: { stableIdentityCount: cards.length, openCardCount: 0, completedCardCount: 0, deferredCardCount: 0 },
  workItems: cards,
});
const card = (id, status = "planning", extra = {}) => ({
  id, status, updatedAt: "2026-11-01T00:00:00.000Z", sourceId: "mazer-owner-work-registry", sourceRef: `config/mazer-owner-work-registry.json#${id}`,
  title: `Card ${id}`, description: "Base text.", cardType: "feature", priority: "low", dependencies: [], acceptanceCriteria: ["a", "b", "c"], ...extra,
});
const ledger = () => ({ schemaVersion: 1, registry: "config/mazer-owner-work-registry.json", cards: {} });
const base = (ts, cardId, extra) => withId({ v: 1, ts, card: cardId, text: "One line of plain text.", ...extra });
const fold = (reg, events, applied = new Set()) => foldEvents({ registry: reg, ledger: ledger(), events: events.map((event) => ({ event })), appliedIds: applied });
const shipped = { prs: [{ repo: M, number: 7, mergedSha: "abcdef12" }], deployedBuild: "build-1234", headless: true, deviceChecked: false };

test("event ids are content hashes, independent of key order and of `by`", () => {
  const a = { v: 1, ts: "2026-11-13T00:00:00Z", card: "MAZER-X-001", text: "t" };
  const b = { text: "t", card: "MAZER-X-001", ts: "2026-11-13T00:00:00Z", v: 1, by: "worker" };
  assert.equal(eventId(a), eventId(b));
  assert.match(eventId(a), /^[0-9a-f]{12}$/);
  assert.equal(canonicalJson({ b: 1, a: [2, { d: 1, c: 2 }] }), '{"a":[2,{"c":2,"d":1}],"b":1}');
});

test("an edited recorded event is refused (append-only integrity)", () => {
  const e = base("2026-11-13T00:00:00Z", "MAZER-A-001");
  const r = fold(registry([card("MAZER-A-001")]), [{ ...e, text: "edited after the fact" }]);
  assert.match(r.errors.join("\n"), /does not match the content/);
  assert.equal(r.applied.length, 0);
});

test("shape rules: unknown fields, bad status, archived, URLs, paths, multi-line text, reserved marker", () => {
  const ok = { v: 1, ts: "2026-11-13T00:00:00Z", card: "MAZER-A-001", text: "fine" };
  assert.deepEqual(validateEventShape(ok), []);
  assert.match(validateEventShape({ ...ok, extra: 1 }).join(), /unknown field/);
  assert.match(validateEventShape({ ...ok, status: "archived" }).join(), /status must be one of/);
  assert.match(validateEventShape({ ...ok, text: "see https://example.com/x" }).join(), /URL or a file path/);
  assert.match(validateEventShape({ ...ok, text: "at C:\\ATLAS\\repos" }).join(), /URL or a file path/);
  assert.match(validateEventShape({ ...ok, text: "a\nb" }).join(), /one line/);
  assert.match(validateEventShape({ ...ok, text: "Board update 2026-01-01: x" }).join(), /reserved/);
  assert.match(validateEventShape({ ...ok, card: "bad" }).join(), /stable MAZER/);
  assert.match(validateEventShape({ ...ok, evidence: { deviceChecked: true } }).join(), /checkedOn/);
  assert.match(validateEventShape({ ...ok, evidence: { prs: [{ repo: "x/y", number: 1 }] } }).join(), /repo/);
});

test("completed requires a merged PR AND a deployed build; no-runtime work may use deviceChecked null", () => {
  const reg = registry([card("MAZER-A-001", "review")]);
  const noPr = fold(reg, [base("2026-11-13T00:00:00Z", "MAZER-A-001", { status: "completed" })]);
  assert.match(noPr.errors.join(), /completed needs evidence/);
  const open = fold(reg, [base("2026-11-13T00:00:00Z", "MAZER-A-001", { status: "completed", evidence: { prs: [{ repo: M, number: 7 }], headless: true, deviceChecked: false } })]);
  assert.match(open.errors.join(), /needs a merged PR/);
  const undeployed = fold(reg, [base("2026-11-13T00:00:00Z", "MAZER-A-001", { status: "completed", evidence: { prs: [{ repo: M, number: 7, mergedSha: "abcdef12" }], headless: true, deviceChecked: false } })]);
  assert.match(undeployed.errors.join(), /deployedBuild/);
  const ok = fold(reg, [base("2026-11-13T00:00:00Z", "MAZER-A-001", { status: "completed", evidence: shipped })]);
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.registry.workItems[0].status, "completed");
  assert.equal(ok.registry.provenance.completedCardCount, 1);
  assert.equal(ok.registry.provenance.openCardCount, 0);
  assert.match(ok.registry.workItems[0].description, /Checked only in headless Chromium, not on a real phone\./);
  assert.match(ok.registry.workItems[0].description, /Deployed: production build build-1234\./);
  const tooling = fold(reg, [base("2026-11-13T00:00:00Z", "MAZER-A-001", { status: "completed", evidence: { prs: [{ repo: M, number: 7, mergedSha: "abcdef12" }], headless: false, deviceChecked: null } })]);
  assert.deepEqual(tooling.errors, []);
  assert.match(tooling.registry.workItems[0].description, /No runtime surface to deploy/);
  assert.deepEqual(completedProblems("X", { prs: [], headless: true, deviceChecked: false }).length, 2);
});

test("review with a merged PR but no build says merged-not-deployed; the text cannot claim more than the evidence", () => {
  const r = fold(registry([card("MAZER-A-001")]), [base("2026-11-13T00:00:00Z", "MAZER-A-001", { status: "review", evidence: { prs: [{ repo: M, number: 7, mergedSha: "abcdef12" }], headless: true, deviceChecked: false } })]);
  assert.deepEqual(r.errors, []);
  assert.match(r.registry.workItems[0].description, /PR #7 merged \(abcdef12\)\. Merged, not deployed\./);
});

test("completed cards do not move back without reopen; blocked needs a blocker; unknown cards need a new block", () => {
  const reg = registry([card("MAZER-A-001", "completed")]);
  assert.match(fold(reg, [base("2026-11-13T00:00:00Z", "MAZER-A-001", { status: "review" })]).errors.join(), /reopen/);
  assert.deepEqual(fold(reg, [base("2026-11-13T00:00:00Z", "MAZER-A-001", { status: "review", reopen: true })]).errors, []);
  assert.match(fold(registry([card("MAZER-A-001")]), [base("2026-11-13T00:00:00Z", "MAZER-A-001", { status: "blocked" })]).errors.join(), /blocked needs a blocker/);
  assert.match(fold(registry([card("MAZER-A-001")]), [base("2026-11-13T00:00:00Z", "MAZER-Z-009")]).errors.join(), /not in the registry/);
  const blocker = { kind: "owner-decision", unblockedBy: "Zac", summary: "Needs a call.", ask: "Pick A or B." };
  const ok = fold(registry([card("MAZER-A-001")]), [base("2026-11-13T00:00:00Z", "MAZER-A-001", { status: "blocked", blocker })]);
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.ledger.cards["MAZER-A-001"].blocker.kind, "owner-decision");
});

test("new cards: unique id, known dependencies, three criteria, counts recomputed", () => {
  const neu = { title: "New thing", description: "Plan text.", cardType: "feature", priority: "low", dependencies: ["MAZER-A-001"], acceptanceCriteria: ["one", "two", "three"] };
  const reg = registry([card("MAZER-A-001")]);
  const ok = fold(reg, [base("2026-11-13T00:00:00Z", "MAZER-B-001", { status: "planning", new: neu })]);
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.registry.workItems.length, 2);
  assert.equal(ok.registry.provenance.stableIdentityCount, 2);
  assert.equal(ok.registry.provenance.openCardCount, 2);
  assert.equal(ok.registry.workItems[1].sourceRef, "config/mazer-owner-work-registry.json#MAZER-B-001");
  assert.match(fold(reg, [base("2026-11-13T00:00:00Z", "MAZER-A-001", { new: neu })]).errors.join(), /already exists/);
  assert.match(fold(reg, [base("2026-11-13T00:00:00Z", "MAZER-B-001", { new: { ...neu, dependencies: ["MAZER-Q-001"] } })]).errors.join(), /not a registry card/);
  assert.match(fold(reg, [base("2026-11-13T00:00:00Z", "MAZER-B-001", { new: { ...neu, acceptanceCriteria: ["x"] } })]).errors.join(), /at least 3/);
  assert.match(fold(reg, [base("2026-11-13T00:00:00Z", "MAZER-B-001", { new: { ...neu, title: "x".repeat(91) } })]).errors.join(), /max 90/);
});

test("one bad event blocks the whole fold: nothing partial", () => {
  const reg = registry([card("MAZER-A-001"), card("MAZER-B-001")]);
  const r = fold(reg, [base("2026-11-13T00:00:00Z", "MAZER-A-001", { status: "review" }), base("2026-11-13T00:00:01Z", "MAZER-B-001", { status: "completed" })]);
  assert.ok(r.errors.length > 0);
  assert.ok(r.applied.length === 1, "the good event folds in memory; the CLI refuses to write when errors exist");
});

test("events are applied in timestamp order and generated update lines are capped", () => {
  const reg = registry([card("MAZER-A-001")]);
  const events = [5, 3, 1, 4, 2].map((i) => base(`2026-11-1${i}T00:00:00Z`, "MAZER-A-001", { text: `Update number ${i}.` }));
  const r = fold(reg, events);
  const d = r.registry.workItems[0].description;
  assert.equal((d.match(/Board update /g) ?? []).length, KEEP_UPDATE_LINES);
  assert.ok(d.indexOf("Update number 3.") < d.indexOf("Update number 4.") && d.indexOf("Update number 4.") < d.indexOf("Update number 5."));
  assert.ok(d.startsWith("Base text."));
  assert.equal(r.registry.updatedAt, "2026-11-15T00:00:00.000Z");
  assert.equal(appendUpdateLine("Base. Board update 2026-01-01: one.", "Board update 2026-01-02: two."), "Base. Board update 2026-01-01: one. Board update 2026-01-02: two.");
});

test("already-applied and duplicate events are skipped (idempotent)", () => {
  const reg = registry([card("MAZER-A-001")]);
  const e = base("2026-11-13T00:00:00Z", "MAZER-A-001", { status: "review" });
  const first = fold(reg, [e, e]);
  assert.equal(first.applied.length, 1);
  assert.equal(first.skipped[0].reason, "duplicate in this run");
  const second = fold(first.registry, [e], new Set([e.id]));
  assert.equal(second.applied.length, 0);
  assert.deepEqual(second.registry, first.registry);
});

test("trigger policy: due on event count or age, never on an empty queue", () => {
  const day = 86_400_000;
  const now = Date.parse("2026-11-20T00:00:00Z");
  assert.equal(dueStatus([], now).due, false);
  assert.equal(dueStatus([{ ts: "2026-11-19T00:00:00Z" }], now).due, false);
  assert.equal(dueStatus([{ ts: "2026-11-12T00:00:00Z" }], now).due, true);
  assert.equal(dueStatus(Array.from({ length: 12 }, () => ({ ts: "2026-11-19T00:00:00Z" })), now).due, true);
  assert.equal(dueStatus([{ ts: new Date(now - 6 * day).toISOString() }], now).due, false);
});

test("the committed registry, ledger and archive are consistent and in canonical form", () => {
  const result = checkIntegrity(repoRoot);
  assert.deepEqual(result.errors, []);
});

// ---- whole pipeline on a scratch copy of the repo inputs ---------------------------------------------------------------

function scratchRepo() {
  const dir = tmp("repo");
  for (const rel of [
    "config/mazer-owner-work-registry.json", "config/mazer-work-ledger.json", "docs/current-truth.md", "docs/roadmap.md", "docs/mobile-plan.md",
    "scripts/export-project-board-owner.mjs",
  ]) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.copyFileSync(path.join(repoRoot, rel), path.join(dir, rel));
  }
  return dir;
}

function demoEvents(dir, cardId) {
  const lines = [
    base("2026-12-01T10:00:00Z", cardId, { status: "review", text: "Merged and live; phone check pending.", evidence: shipped }),
    base("2026-12-01T10:00:01Z", "MAZER-TEST-901", {
      status: "planning", text: "New card from the batch.",
      new: { title: "Scratch card for the board sync test", description: "Plan text.", cardType: "feature", priority: "low", dependencies: [cardId], acceptanceCriteria: ["one", "two", "three"] },
    }),
  ];
  const file = path.join(dir, "events.jsonl");
  fs.writeFileSync(file, `${lines.map((l) => canonicalJson(l)).join("\n")}\n`);
  return file;
}

test("plan is a dry run; apply writes registry, ledger, archive, export and report; a second apply is a no-op", () => {
  const dir = scratchRepo();
  const reg = JSON.parse(fs.readFileSync(path.join(dir, "config/mazer-owner-work-registry.json"), "utf8"));
  const target = reg.workItems.find((c) => c.status === "review").id;
  const events = demoEvents(dir, target);
  const before = fs.readFileSync(path.join(dir, "config/mazer-owner-work-registry.json"), "utf8");
  const lines = [];
  assert.equal(runBoardSync(["plan", "--events", events], dir, (l) => lines.push(l)), 0);
  assert.match(lines.join("\n"), /2 event\(s\) -> 2 card\(s\) changed, 1 new/);
  assert.equal(fs.readFileSync(path.join(dir, "config/mazer-owner-work-registry.json"), "utf8"), before, "plan must not write");
  assert.equal(fs.existsSync(path.join(dir, "config/mazer-board-events.jsonl")), false);

  assert.equal(runBoardSync(["apply", "--events", events], dir, () => {}), 0);
  const after = fs.readFileSync(path.join(dir, "config/mazer-owner-work-registry.json"), "utf8");
  assert.equal(after.includes("\r\n"), before.includes("\r\n"), "line endings are preserved");
  const written = JSON.parse(after);
  assert.equal(written.workItems.length, reg.workItems.length + 1);
  assert.equal(written.provenance.boardSync.appliedEventCount, 2);
  assert.equal(written.workItems.find((c) => c.id === target).status, "review");
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "config/mazer-work-ledger.json"), "utf8")).cards[target].evidence.deployedBuild, "build-1234");
  const exported = JSON.parse(fs.readFileSync(path.join(dir, "exports/mazer.project-board.owner-export.v1.json"), "utf8"));
  assert.equal(exported.cards.length, reg.workItems.length + 1);
  assert.ok(exported.cards.some((c) => c.record.card_id === "MAZER-TEST-901"));
  const report = renderOutputs(dir);
  assert.equal(fs.readFileSync(path.join(dir, "docs/ops/MAZER-WORK-REPORT.md"), "utf8"), report.markdown, "report regenerated atomically with the registry");
  assert.match(report.markdown, /Last board sync: 2026-12-01 \(2 board events applied in total\)/);
  assert.deepEqual(checkIntegrity(dir).errors, []);

  const again = [];
  assert.equal(runBoardSync(["apply", "--events", events], dir, (l) => again.push(l)), 0);
  assert.match(again.join("\n"), /nothing to apply \(2 event\(s\) already in the archive\)/);
  assert.equal(fs.readFileSync(path.join(dir, "config/mazer-owner-work-registry.json"), "utf8"), after, "second apply is byte-identical");
});

test("an event the exporter rejects aborts apply before anything is written", () => {
  const dir = scratchRepo();
  const reg = JSON.parse(fs.readFileSync(path.join(dir, "config/mazer-owner-work-registry.json"), "utf8"));
  const id = reg.workItems[0].id;
  const bad = base("2026-12-01T10:00:00Z", id, { text: "password: hunter2hunter2 was pasted here" });
  const file = path.join(dir, "events.jsonl");
  fs.writeFileSync(file, `${canonicalJson(bad)}\n`);
  const before = fs.readFileSync(path.join(dir, "config/mazer-owner-work-registry.json"), "utf8");
  const lines = [];
  assert.equal(runBoardSync(["apply", "--events", file], dir, (l) => lines.push(l)), 2);
  assert.match(lines.join("\n"), /"secret or credential word" screen: "password"/);
  assert.equal(fs.readFileSync(path.join(dir, "config/mazer-owner-work-registry.json"), "utf8"), before);
  assert.equal(fs.existsSync(path.join(dir, "config/mazer-board-events.jsonl")), false);
});

// ---- public-text screens (shared with tests/project-board-owner-export.test.mjs) ---------------------------------------------

const OK_NEW = { title: "Fine title", description: "Plain description of the work.", cardType: "feature", priority: "low", dependencies: [], acceptanceCriteria: ["one thing", "two things", "three things"] };
const SAMPLES = {
  "url": "see https://example.test/page",
  "drive or backslash path": "kept in C:\\work\\notes",
  "relative or home path": "see scripts/board/helper for details",
  "file name": "edit board-sync.mjs first",
  "long token-like run": `value ${"a1B2".repeat(9)} appeared`,
  "secret or credential word": "rotate the api key",
  "security finding word": "a security note",
  "money word": "add a paywall",
  "personal data word": "needs a phone number",
};

test("one shared screen list: nine screens, imported by the export test and by board-sync", () => {
  assert.deepEqual(PUBLIC_TEXT_SCREENS.map(([name]) => name), Object.keys(SAMPLES));
  const exportTest = fs.readFileSync(path.join(repoRoot, "tests/project-board-owner-export.test.mjs"), "utf8");
  assert.match(exportTest, /from "\.\.\/scripts\/board\/public-text-screens\.mjs"/);
  assert.doesNotMatch(exportTest, /const screens = \[/, "the export test must not carry its own copy of the screens");
  const events = fs.readFileSync(path.join(repoRoot, "scripts/board/board-events.mjs"), "utf8");
  assert.match(events, /from "\.\/public-text-screens\.mjs"/);
  for (const [name, sample] of Object.entries(SAMPLES)) assert.ok(screenMatches(sample).some((m) => m.screen === name), `${name} matches its sample`);
  assert.deepEqual(screenMatches("A plain sentence about the maze board and the tiles."), []);
});

test("every event-settable published string is screened, naming the screen and the substring", () => {
  const ok = { v: 1, ts: "2026-11-13T00:00:00Z", card: "MAZER-A-001", text: "fine" };
  const bad = "see scripts/board/board-sync for it";
  const cases = {
    "text": { text: bad },
    "title": { title: bad },
    "description": { description: bad },
    "acceptanceCriteria[]": { acceptanceCriteria: ["a fine one", bad, "another fine one"] },
    "note": { note: bad },
    "blocker.summary": { status: "blocked", blocker: { kind: "owner-decision", unblockedBy: "Zac", summary: bad, ask: "Pick." } },
    "blocker.ask": { status: "blocked", blocker: { kind: "owner-decision", unblockedBy: "Zac", summary: "Needs a call.", ask: bad } },
    "blocker.recommendation": { status: "blocked", blocker: { kind: "owner-decision", unblockedBy: "Zac", summary: "Needs a call.", ask: "Pick.", recommendation: bad } },
    "verify[].step": { verify: [{ where: "phone", step: bad, expected: "fine" }] },
    "verify[].expected": { verify: [{ where: "phone", step: "fine", expected: bad }] },
    "evidence.checkedOn": { evidence: { deviceChecked: true, checkedOn: bad } },
    "evidence.deployedBuild": { evidence: { deployedBuild: "build.json" } },
    "new.title": { new: { ...OK_NEW, title: bad } },
    "new.description": { new: { ...OK_NEW, description: bad } },
    "new.acceptanceCriteria[]": { new: { ...OK_NEW, acceptanceCriteria: ["a fine one", bad, "another fine one"] } },
  };
  for (const [field, extra] of Object.entries(cases)) {
    const problems = validateEventShape({ ...ok, ...extra }).filter((p) => p.includes("public-text"));
    assert.ok(problems.some((p) => p.startsWith(field)), `${field} is screened: ${problems.join(" | ")}`);
  }
  const named = validateEventShape({ ...ok, text: bad }).find((p) => p.includes("public-text"));
  assert.match(named, /text fails the public-text "relative or home path" screen: "scripts\/board"/);
});

test("the GOV-010 shape: a path and the word agent in a new-card description are refused at event time", () => {
  const description = "Build the tool in scripts/board/board-sync and let each agent record one line.";
  const event = { v: 1, ts: "2026-11-13T00:00:00Z", card: "MAZER-GOV-010", text: "x", status: "planning", new: { ...OK_NEW, description } };
  const problems = validateEventShape(event);
  assert.match(problems.join("\n"), /new\.description fails the public-text "relative or home path" screen: "scripts\/board"/);
});

test("event is rejected before anything reaches the events branch or the local fallback", () => {
  const { work } = gitRepoWithRemote();
  const bad = { v: 1, ts: "2026-12-01T10:00:00Z", card: "MAZER-A-001", text: "mentions sw.js in the text" };
  assert.throws(() => appendEvent(work, bad), /file name" screen: "sw\.js"/);
  assert.equal(readRemoteEvents(work), "", "nothing was pushed");
  assert.equal(fs.existsSync(localFallbackPath(work)), false, "nothing was queued offline either");
  assert.throws(() => runBoardSync(["event", "--card", "MAZER-A-001", "--text", "edit scripts/board/x now"], work, () => {}), /event rejected/);
});

test("plan, apply and check refuse screened text and write nothing", () => {
  const dir = scratchRepo();
  const reg = JSON.parse(fs.readFileSync(path.join(dir, "config/mazer-owner-work-registry.json"), "utf8"));
  const id = reg.workItems[0].id;
  const file = path.join(dir, "events.jsonl");
  // A recorded line that predates the screens (or came from a hand-edited branch) is caught at fold time too.
  fs.writeFileSync(file, `${canonicalJson(base("2026-12-01T10:00:00Z", id, { text: "the tool lives in scripts/board/board-sync here" }))}\n`);
  const before = fs.readFileSync(path.join(dir, "config/mazer-owner-work-registry.json"), "utf8");
  for (const command of ["plan", "apply"]) {
    const lines = [];
    assert.equal(runBoardSync([command, "--events", file], dir, (l) => lines.push(l)), 2, command);
    assert.match(lines.join("\n"), /REFUSED/);
    assert.match(lines.join("\n"), /"relative or home path" screen: "scripts\/board"/);
  }
  assert.equal(fs.readFileSync(path.join(dir, "config/mazer-owner-work-registry.json"), "utf8"), before);
  assert.equal(fs.existsSync(path.join(dir, "config/mazer-board-events.jsonl")), false);

  // check flags a registry card whose published title or description fails a screen
  const dirty = JSON.parse(before);
  dirty.workItems[0].description += " Details live in scripts/board/board-sync.";
  fs.writeFileSync(path.join(dir, "config/mazer-owner-work-registry.json"), serializeJson(dirty, before));
  const checked = checkIntegrity(dir).errors.join("\n");
  assert.match(checked, new RegExp(`${id} description fails the public-text "relative or home path" screen`));
});

test("the generated update line is screened too (the folded text, not only the event fields)", () => {
  const reg = registry([card("MAZER-A-001", "planning", { title: "Title with notes.md inside" })]);
  const r = fold(reg, [base("2026-11-13T00:00:00Z", "MAZER-A-001", { text: "Unrelated plain update." })]);
  assert.match(r.errors.join("\n"), /MAZER-A-001: resulting title fails the public-text "file name" screen: "notes\.md"/);
  assert.equal(r.applied.length, 0);
});

// ---- corrective description / acceptanceCriteria for an existing card -------------------------------------------------------------

test("a corrective event replaces an existing card's description and criteria (3 or more), then appends its own update line", () => {
  const reg = registry([card("MAZER-A-001", "planning", { description: "Old text. Board update 2026-11-02: earlier line." })]);
  const fixed = fold(reg, [base("2026-11-13T00:00:00Z", "MAZER-A-001", {
    text: "Corrected the published wording.",
    description: "Corrected description in plain words.",
    acceptanceCriteria: ["first criterion", "second criterion", "third criterion", "fourth criterion"],
  })]);
  assert.deepEqual(fixed.errors, []);
  const c = fixed.registry.workItems[0];
  assert.equal(c.description, "Corrected description in plain words. Board update 2026-11-13: Corrected the published wording.");
  assert.deepEqual(c.acceptanceCriteria, ["first criterion", "second criterion", "third criterion", "fourth criterion"]);
  assert.equal(c.status, "planning", "status is untouched when the event sets none");

  const only = fold(reg, [base("2026-11-13T00:00:00Z", "MAZER-A-001", { description: "Only the description changes." })]);
  assert.deepEqual(only.errors, []);
  assert.deepEqual(only.registry.workItems[0].acceptanceCriteria, ["a", "b", "c"]);

  assert.match(fold(reg, [base("2026-11-13T00:00:00Z", "MAZER-A-001", { acceptanceCriteria: ["x", "y"] })]).errors.join(), /acceptanceCriteria needs at least 3/);
  assert.match(fold(reg, [base("2026-11-13T00:00:00Z", "MAZER-A-001", { description: "see scripts/board/x" })]).errors.join(), /description fails the public-text "relative or home path"/);
  assert.match(fold(reg, [base("2026-11-13T00:00:00Z", "MAZER-A-001", { description: "x".repeat(1501) })]).errors.join(), /description is 1501 chars/);
  assert.match(fold(reg, [base("2026-11-13T00:00:00Z", "MAZER-B-001", { new: OK_NEW, description: "no" })]).errors.join(), /new card uses new\.description/);
  assert.match(fold(reg, [base("2026-11-13T00:00:00Z", "MAZER-B-001", { new: OK_NEW, acceptanceCriteria: ["a", "b", "c"] })]).errors.join(), /new card uses new\.acceptanceCriteria/);
});

test("a corrective event goes through the pipeline: a published description is repaired by a later sync", () => {
  const dir = scratchRepo();
  const reg = JSON.parse(fs.readFileSync(path.join(dir, "config/mazer-owner-work-registry.json"), "utf8"));
  const id = reg.workItems[0].id;
  const file = path.join(dir, "fix.jsonl");
  fs.writeFileSync(file, `${canonicalJson(base("2026-12-01T10:00:00Z", id, { text: "Wording corrected.", description: "A clean replacement description." }))}\n`);
  assert.equal(runBoardSync(["apply", "--events", file], dir, () => {}), 0);
  const after = JSON.parse(fs.readFileSync(path.join(dir, "config/mazer-owner-work-registry.json"), "utf8"));
  assert.equal(after.workItems[0].description, "A clean replacement description. Board update 2026-12-01: Wording corrected.");
  assert.deepEqual(checkIntegrity(dir).errors, []);
  const exported = JSON.parse(fs.readFileSync(path.join(dir, "exports/mazer.project-board.owner-export.v1.json"), "utf8"));
  assert.match(exported.cards.find((x) => x.record.card_id === id).content.summary, /A clean replacement description/);
});

test("status after an apply prints the last-sync form of the marker (scratch copy)", () => {
  const dir = scratchRepo();
  const reg = JSON.parse(fs.readFileSync(path.join(dir, "config/mazer-owner-work-registry.json"), "utf8"));
  const target = reg.workItems.find((c) => c.status === "review").id;
  const first = demoEvents(dir, target);
  assert.equal(runBoardSync(["apply", "--events", first], dir, () => {}), 0);
  const second = path.join(dir, "second.jsonl");
  const later = base("2026-12-02T10:00:00Z", target, { text: "One more plain line." });
  fs.writeFileSync(second, `${fs.readFileSync(first, "utf8")}${canonicalJson(later)}\n`);
  const lines = [];
  assert.equal(runBoardSync(["status", "--events", second], dir, (l) => lines.push(l)), 0);
  assert.match(lines[0], /^Board as of 2026-12-01 \(last sync 2026-12-01, 2 events applied in total\), 1 pending event,/);
  const status = computeStatus(dir, { eventFiles: [second] }, Date.parse("2026-12-03T10:00:00Z"));
  assert.equal(status.pending, 1);
  assert.equal(status.lastSync.slice(0, 10), "2026-12-01");
  assert.match(status.line, new RegExp(`^${MARKER_HEAD}, 1 pending event, oldest 1 d\\. Not due\\.`));
});

// Both forms of the marker: before the first apply (no sync yet) and after one ("last sync <date>, N events applied in total").
const MARKER_HEAD = String.raw`Board as of \d{4}-\d{2}-\d{2}(?: \(last sync \d{4}-\d{2}-\d{2}, \d+ events applied in total\))?`;
const STATUS_MARKER_TWO_PENDING = new RegExp(`^${MARKER_HEAD}, 2 pending events, oldest 1 d\\. Not due\\.`);

test("status prints the honest marker and exits 3 under --due when nothing is due", () => {
  const dir = scratchRepo();
  const reg = JSON.parse(fs.readFileSync(path.join(dir, "config/mazer-owner-work-registry.json"), "utf8"));
  const events = demoEvents(dir, reg.workItems.find((c) => c.status === "review").id);
  const status = computeStatus(dir, { eventFiles: [events] }, Date.parse("2026-12-02T10:00:00Z"));
  assert.equal(status.pending, 2);
  assert.equal(status.due, false);
  assert.match(status.line, STATUS_MARKER_TWO_PENDING);
  const late = computeStatus(dir, { eventFiles: [events] }, Date.parse("2026-12-20T00:00:00Z"));
  assert.equal(late.due, true);
  assert.equal(runBoardSync(["status", "--due", "--max-days", "100000", "--max-events", "1000", "--events", events], dir, () => {}), 3);
});

// ---- event store on a real (local) git remote ------------------------------------------------------------------------------

function gitRepoWithRemote() {
  const bare = tmp("bare");
  execFileSync("git", ["init", "--bare", "--quiet", bare]);
  const work = tmp("work");
  execFileSync("git", ["init", "--quiet", work]);
  execFileSync("git", ["remote", "add", "origin", bare], { cwd: work });
  return { bare, work };
}

test("append writes one line to the board-events branch without touching the working tree; duplicates are no-ops", () => {
  const { work } = gitRepoWithRemote();
  const e = { v: 1, ts: "2026-12-01T10:00:00Z", card: "MAZER-A-001", text: "first" };
  const a = appendEvent(work, e);
  assert.equal(a.pushed, 1);
  const b = appendEvent(work, { ...e, ts: "2026-12-01T10:00:05Z", text: "second" });
  assert.equal(b.pushed, 1);
  const again = appendEvent(work, e);
  assert.equal(again.pushed, 0);
  const text = readRemoteEvents(work);
  const parsed = parseJsonl(text).events.map((x) => x.event);
  assert.deepEqual(parsed.map((x) => x.text), ["first", "second"]);
  assert.equal(parsed[0].id, eventId(parsed[0]));
  assert.equal(fs.readdirSync(work).filter((n) => n !== ".git").length, 0, "no files appear in the working tree");
});

test("two clones appending alternately both land (each push rebuilds on the fetched tip)", () => {
  const { bare, work } = gitRepoWithRemote();
  const other = tmp("other");
  execFileSync("git", ["init", "--quiet", other]);
  execFileSync("git", ["remote", "add", "origin", bare], { cwd: other });
  appendEvent(work, { v: 1, ts: "2026-12-01T10:00:00Z", card: "MAZER-A-001", text: "from clone one" });
  appendEvent(other, { v: 1, ts: "2026-12-01T10:00:01Z", card: "MAZER-B-001", text: "from clone two" });
  appendEvent(work, { v: 1, ts: "2026-12-01T10:00:02Z", card: "MAZER-C-001", text: "from clone one again" });
  assert.equal(parseJsonl(readRemoteEvents(other)).events.length, 3);
});

test("offline append falls back to a local file in the git dir and flush pushes it later", () => {
  const { bare, work } = gitRepoWithRemote();
  const e = { v: 1, ts: "2026-12-01T10:00:00Z", card: "MAZER-A-001", text: "written offline" };
  execFileSync("git", ["remote", "set-url", "origin", path.join(bare, "does-not-exist")], { cwd: work });
  const r = appendEvent(work, e);
  assert.match(r.where, /local fallback/);
  assert.equal(fs.readFileSync(localFallbackPath(work), "utf8").trim().split("\n").length, 1);
  execFileSync("git", ["remote", "set-url", "origin", bare], { cwd: work });
  assert.equal(flushLocal(work).flushed, 1);
  assert.equal(parseJsonl(readRemoteEvents(work)).events[0].event.text, "written offline");
  assert.equal(fs.readFileSync(localFallbackPath(work), "utf8"), "");
});

// ---- FawxzzyWeb re-pin ----------------------------------------------------------------------------------------------------------

test("web re-pin copies the export into the Web board sources and reports new and removed ids", () => {
  const web = tmp("web");
  const source = path.join(web, "planning/board-sources/mazer.project-board.owner-export.v1.json");
  fs.mkdirSync(path.dirname(source), { recursive: true });
  const old = { cards: ["MAZER-A-001", "MAZER-GONE-001"].map((id) => ({ record: { card_id: id } })) };
  fs.writeFileSync(source, `${JSON.stringify(old, null, 2)}
`);
  const exportPath = path.join(tmp("exp"), "export.json");
  const exported = { cards: ["MAZER-A-001", "MAZER-B-001", "MAZER-C-001"].map((id) => ({ record: { card_id: id } })) };
  const bytes = `${JSON.stringify(exported, null, 2)}
`;
  fs.writeFileSync(exportPath, bytes);
  const dry = repinWeb({ webDir: web, exportPath, write: false });
  assert.deepEqual(dry.newIds, ["MAZER-B-001", "MAZER-C-001"]);
  assert.deepEqual(dry.removedIds, ["MAZER-GONE-001"]);
  assert.equal(dry.cards, 3);
  assert.equal(fs.readFileSync(source, "utf8"), `${JSON.stringify(old, null, 2)}
`, "dry run writes nothing");
  const done = repinWeb({ webDir: web, exportPath, write: true });
  assert.equal(fs.readFileSync(source, "utf8"), bytes, "the export is copied byte for byte");
  assert.deepEqual(done.files, ["planning/board-sources/mazer.project-board.owner-export.v1.json"]);
  assert.ok(WEB_NEXT_COMMANDS.includes("npm run data:project-board-owner-snapshot"));
  assert.ok(!WEB_NEXT_COMMANDS.some((command) => command.includes("project-board-public")));
});

test("web re-pin creates the source when absent and refuses a file that is not an owner export", () => {
  const web = tmp("web2");
  const exportPath = path.join(tmp("exp2"), "export.json");
  fs.writeFileSync(exportPath, JSON.stringify({ cards: [{ record: { card_id: "MAZER-A-001" } }] }));
  const created = repinWeb({ webDir: web, exportPath, write: true });
  assert.deepEqual(created.newIds, ["MAZER-A-001"]);
  assert.equal(fs.existsSync(path.join(web, "planning/board-sources/mazer.project-board.owner-export.v1.json")), true);
  fs.writeFileSync(exportPath, JSON.stringify({ nothing: true }));
  assert.throws(() => repinWeb({ webDir: web, exportPath }), /not an owner export/);
});

test("serializeJson round-trips the committed registry byte for byte", () => {
  const raw = fs.readFileSync(path.join(repoRoot, "config/mazer-owner-work-registry.json"), "utf8");
  assert.equal(serializeJson(JSON.parse(raw), raw), raw);
});

test("formatPlan names problems and never claims a write", () => {
  const dir = scratchRepo();
  const file = path.join(dir, "events.jsonl");
  fs.writeFileSync(file, `${canonicalJson(withId({ v: 1, ts: "2026-12-01T10:00:00Z", card: "MAZER-NOPE-999", text: "x" }))}\n`);
  const text = formatPlan(computePlan(dir, { eventFiles: [file] }));
  assert.match(text, /REFUSED/);
  assert.match(text, /not in the registry/);
});

test("ledger patching touches only changed and new entries and keeps the mixed formatting elsewhere", () => {
  const raw = fs.readFileSync(path.join(repoRoot, "config/mazer-work-ledger.json"), "utf8");
  const old = JSON.parse(raw);
  const next = JSON.parse(raw);
  const ids = Object.keys(next.cards);
  next.cards[ids[3]].note = "Changed by a board event.";
  next.cards["MAZER-TEST-901"] = { evidence: null, blocker: null, verify: [], lane: null, filesHint: [] };
  const patched = patchLedgerText(raw, old, next);
  assert.deepEqual(JSON.parse(patched), next);
  assert.equal(patched.includes("\r\n"), raw.includes("\r\n"));
  const a = new Set(raw.replace(/\r\n/g, "\n").split("\n"));
  const b = patched.replace(/\r\n/g, "\n").split("\n");
  const changed = b.filter((line) => !a.has(line)).length;
  assert.ok(changed < 40, "only a few lines may differ, got " + changed);
  assert.equal(patchLedgerText(raw, old, old), raw);
});
