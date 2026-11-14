#!/usr/bin/env node
// Mazer board sync: append cheap board events during work, fold them into the registry, the work ledger,
// the owner export and the work report in one deterministic command. No LLM, no network except `event`/`status`/`flush`.
//
//   node scripts/board/board-sync.mjs event --card MAZER-X-001 --status review --text "..." [--title ..] [--description ..] [--pr 492:<mergedSha>] [--deployed <build>] [--headless] [--device false|true|none]
//   node scripts/board/board-sync.mjs status [--due]        pending count, oldest age, board-as-of marker (exit 3 with --due when not due)
//   node scripts/board/board-sync.mjs plan                  dry-run diff of folding every pending event (writes nothing)
//   node scripts/board/board-sync.mjs apply                 fold + write registry, ledger, archive, export, work report
//   node scripts/board/board-sync.mjs check                 archive and registry/ledger integrity (used by CI)
//   node scripts/board/board-sync.mjs web --web <dir> [--write]   re-pin the FawxzzyWeb snapshot inputs
//   node scripts/board/board-sync.mjs flush                 push events that were saved locally while offline
// Process, event format, trigger policy and rollback: docs/ops/MAZER-BOARD-SYNC-PROCESS.md.
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildProjectBoardOwnerExport, readOwnerExportSources } from "../export-project-board-owner.mjs";
import { buildWorkReport, REPORT_JSON_PATH, REPORT_MD_PATH } from "../analysis/work-report.mjs";
import {
  DEFAULT_POLICY, dueStatus, eventId, foldEvents, parseJsonl, validateEventShape, withId, canonicalJson,
} from "./board-events.mjs";
import { screenProblems } from "./public-text-screens.mjs";
import { repinWeb, WEB_FILES, WEB_NEXT_COMMANDS } from "./web-repin.mjs";

export const REGISTRY_PATH = "config/mazer-owner-work-registry.json";
export const LEDGER_PATH = "config/mazer-work-ledger.json";
export const ARCHIVE_PATH = "config/mazer-board-events.jsonl";
export const EXPORT_PATH = "exports/mazer.project-board.owner-export.v1.json";
export const EVENTS_BRANCH = "board-events";
export const EVENTS_FILE = "events.jsonl";

const eolOf = (text) => (text.includes("\r\n") ? "\r\n" : "\n");
const toLf = (text) => text.replace(/\r\n/g, "\n");
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

function git(repoRoot, args, options = {}) {
  return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], maxBuffer: 1 << 28, ...options });
}

export function serializeJson(value, raw) {
  const eol = eolOf(raw);
  return `${JSON.stringify(value, null, 2).replace(/\n/g, eol)}${eol}`;
}

/**
 * Patch only the ledger entries that changed. The committed ledger mixes compact and expanded formatting, so a full
 * re-serialisation would rewrite thousands of unrelated lines; this touches exactly the changed or new cards.
 */
export function patchLedgerText(raw, oldLedger, newLedger) {
  const eol = eolOf(raw);
  let text = toLf(raw);
  const body = (id, entry) => "    " + JSON.stringify(id) + ": " + JSON.stringify(entry, null, 2).replace(/\n/g, "\n    ");
  const added = [];
  for (const [id, entry] of Object.entries(newLedger.cards)) {
    const old = oldLedger.cards?.[id];
    if (old !== undefined && JSON.stringify(old) === JSON.stringify(entry)) continue;
    if (old === undefined) { added.push(body(id, entry)); continue; }
    const start = text.indexOf("\n    " + JSON.stringify(id) + ": {");
    if (start < 0) throw new Error("ledger patch: cannot find the entry for " + id);
    const close = text.indexOf("\n    }", start + 1);
    if (close < 0) throw new Error("ledger patch: cannot find the end of " + id);
    text = text.slice(0, start + 1) + body(id, entry) + text.slice(close + "\n    }".length);
  }
  if (added.length) {
    const end = text.lastIndexOf("\n  }\n}");
    if (end < 0) throw new Error("ledger patch: cannot find the end of cards");
    text = text.slice(0, end) + ",\n" + added.join(",\n") + text.slice(end);
  }
  if (JSON.stringify(JSON.parse(text)) !== JSON.stringify(newLedger)) throw new Error("ledger patch: patched text does not parse back to the folded ledger");
  return text.replace(/\n/g, eol);
}

// ---- event store: a branch with one file (plumbing only: never touches a working tree) -------------------------------

export function readRemoteEvents(repoRoot, remote = "origin") {
  try { git(repoRoot, ["fetch", "--quiet", remote, `+refs/heads/${EVENTS_BRANCH}:refs/remotes/${remote}/${EVENTS_BRANCH}`]); } catch { /* branch may not exist yet */ }
  try { return git(repoRoot, ["show", `refs/remotes/${remote}/${EVENTS_BRANCH}:${EVENTS_FILE}`]); } catch { return ""; }
}

export function localFallbackPath(repoRoot) {
  const common = git(repoRoot, ["rev-parse", "--git-common-dir"]).trim();
  return path.join(path.resolve(repoRoot, common), "mazer-board-events.local.jsonl");
}

function pushLines(repoRoot, lines, remote = "origin") {
  const env = { ...process.env, GIT_AUTHOR_NAME: "mazer-board-events", GIT_AUTHOR_EMAIL: "board-events@users.noreply.github.com", GIT_COMMITTER_NAME: "mazer-board-events", GIT_COMMITTER_EMAIL: "board-events@users.noreply.github.com" };
  let lastError;
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const current = readRemoteEvents(repoRoot, remote);
    const have = new Set(parseJsonl(current).events.map((e) => e.event.id));
    const fresh = lines.filter((l) => !have.has(JSON.parse(l).id));
    if (!fresh.length) return { pushed: 0 };
    const next = `${current}${current && !current.endsWith("\n") ? "\n" : ""}${fresh.join("\n")}\n`;
    const blob = git(repoRoot, ["hash-object", "-w", "--stdin"], { input: next, env }).trim();
    const tree = git(repoRoot, ["mktree"], { input: `100644 blob ${blob}\t${EVENTS_FILE}\n`, env }).trim();
    let parent = "";
    try { parent = git(repoRoot, ["rev-parse", "--verify", "--quiet", `refs/remotes/${remote}/${EVENTS_BRANCH}`]).trim(); } catch { /* first event */ }
    const message = `board events: ${fresh.map((l) => JSON.parse(l).card).join(", ")}`;
    const commit = git(repoRoot, ["commit-tree", tree, ...(parent ? ["-p", parent] : []), "-m", message], { env }).trim();
    try {
      git(repoRoot, ["push", "--quiet", remote, `${commit}:refs/heads/${EVENTS_BRANCH}`], { env });
      return { pushed: fresh.length, commit };
    } catch (error) { lastError = error; }
  }
  throw new Error(`could not push board events after 6 attempts: ${String(lastError?.stderr ?? lastError).trim()}`);
}

export function appendEvent(repoRoot, event, { remote = "origin", offlineOk = true } = {}) {
  const full = withId(event);
  const errors = validateEventShape(full);
  if (errors.length) throw new Error(`event rejected:\n  ${errors.join("\n  ")}`);
  const line = canonicalJson(full);
  const local = localFallbackPath(repoRoot);
  const queued = fs.existsSync(local) ? fs.readFileSync(local, "utf8").split("\n").filter(Boolean) : [];
  try {
    const result = pushLines(repoRoot, [...queued, line], remote);
    if (queued.length) fs.writeFileSync(local, "");
    return { id: full.id, where: `${remote}/${EVENTS_BRANCH}`, ...result };
  } catch (error) {
    if (!offlineOk) throw error;
    if (!queued.includes(line)) fs.appendFileSync(local, `${line}\n`);
    return { id: full.id, where: "local fallback (offline); run `flush` later", pushed: 0, warning: String(error.message).split("\n")[0] };
  }
}

export function flushLocal(repoRoot, remote = "origin") {
  const local = localFallbackPath(repoRoot);
  const queued = fs.existsSync(local) ? fs.readFileSync(local, "utf8").split("\n").filter(Boolean) : [];
  if (!queued.length) return { flushed: 0 };
  const result = pushLines(repoRoot, queued, remote);
  fs.writeFileSync(local, "");
  return { flushed: queued.length, ...result };
}

// ---- inputs ---------------------------------------------------------------------------------------------------------

function loadState(repoRoot) {
  const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), "utf8");
  const registryRaw = read(REGISTRY_PATH);
  const ledgerRaw = read(LEDGER_PATH);
  const archivePath = path.join(repoRoot, ARCHIVE_PATH);
  const archiveRaw = fs.existsSync(archivePath) ? fs.readFileSync(archivePath, "utf8") : "";
  return { registryRaw, ledgerRaw, archiveRaw, registry: JSON.parse(registryRaw), ledger: JSON.parse(ledgerRaw) };
}

function loadPending(repoRoot, options) {
  const items = [];
  const errors = [];
  const add = (text, source) => { const parsed = parseJsonl(text, source); items.push(...parsed.events); errors.push(...parsed.errors); };
  if (options.eventFiles?.length) for (const file of options.eventFiles) add(fs.readFileSync(file, "utf8"), file);
  else {
    if (!options.noRemote) add(readRemoteEvents(repoRoot, options.remote), `${options.remote ?? "origin"}/${EVENTS_BRANCH}`);
    const local = localFallbackPath(repoRoot);
    if (fs.existsSync(local)) add(fs.readFileSync(local, "utf8"), "local fallback");
  }
  return { items, errors };
}

function archiveIds(archiveRaw) {
  const { events, errors } = parseJsonl(archiveRaw, ARCHIVE_PATH);
  return { ids: new Set(events.map((e) => e.event.id)), events, errors };
}

// ---- plan / apply ---------------------------------------------------------------------------------------------------

export function computePlan(repoRoot, options = {}) {
  const state = loadState(repoRoot);
  const pending = loadPending(repoRoot, options);
  const archived = archiveIds(state.archiveRaw);
  const fold = foldEvents({ registry: state.registry, ledger: state.ledger, events: pending.items, appliedIds: archived.ids });
  const errors = [...pending.errors, ...archived.errors, ...fold.errors];
  const plan = { state, fold, errors, archived, outputs: null, summary: null };
  if (errors.length || !fold.applied.length) return plan;

  const totalApplied = archived.events.length + fold.applied.length;
  fold.registry.provenance.boardSync = { at: fold.registry.updatedAt, appliedEventCount: totalApplied, lastEventId: fold.applied.at(-1).id };
  const registryText = serializeJson(fold.registry, state.registryRaw);
  let ledgerText;
  try { ledgerText = patchLedgerText(state.ledgerRaw, state.ledger, fold.ledger); }
  catch (error) { errors.push(error.message); return plan; }
  const archiveAppend = fold.applied.map((e) => `${canonicalJson(e)}\n`).join("");

  // Build every generated output in memory first: a rejected export or report aborts before any file is written.
  const sourceBytes = readOwnerExportSources(repoRoot);
  sourceBytes["mazer-owner-work-registry"] = registryText;
  let exportText;
  try { exportText = `${JSON.stringify(buildProjectBoardOwnerExport(fold.registry, sourceBytes), null, 2)}\n`; }
  catch (error) { errors.push(`owner export rejected the folded registry: ${error.message}`); return plan; }
  let report;
  try { report = buildWorkReport(fold.registry, fold.ledger); }
  catch (error) { errors.push(`work report rejected the folded ledger: ${error.message}`); return plan; }
  plan.outputs = {
    [REGISTRY_PATH]: registryText,
    [LEDGER_PATH]: ledgerText,
    [ARCHIVE_PATH]: `${state.archiveRaw}${state.archiveRaw && !state.archiveRaw.endsWith("\n") ? "\n" : ""}${archiveAppend}`,
    [EXPORT_PATH]: exportText,
    [REPORT_MD_PATH]: report.markdown,
    [REPORT_JSON_PATH]: `${JSON.stringify(report.json, null, 2)}\n`,
  };
  plan.summary = {
    events: fold.applied.length,
    alreadyApplied: fold.skipped.length,
    cardsChanged: fold.changes.length,
    newCards: fold.changes.filter((c) => c.created).map((c) => c.card),
    cards: state.registry.workItems.length + fold.changes.filter((c) => c.created).length,
    registryBytesDelta: toLf(registryText).length - toLf(state.registryRaw).length,
    exportSha256: sha256(exportText),
    registryUpdatedAt: fold.registry.updatedAt,
  };
  return plan;
}

export function formatPlan(plan) {
  const L = [];
  const { fold, errors, summary } = plan;
  if (errors.length) { L.push(`board-sync: REFUSED, ${errors.length} problem(s); nothing written`); for (const e of errors) L.push(`  - ${e}`); }
  for (const w of fold.warnings) L.push(`  warning: ${w}`);
  if (errors.length) return L.join("\n");
  if (!fold.applied.length) return [...L, `board-sync: nothing to apply (${fold.skipped.length} event(s) already in the archive)`].join("\n");
  L.push(`board-sync plan: ${summary.events} event(s) -> ${summary.cardsChanged} card(s) changed, ${summary.newCards.length} new (${summary.cards} cards total); registry ${summary.registryBytesDelta >= 0 ? "+" : ""}${summary.registryBytesDelta} bytes; ${summary.alreadyApplied} already applied`);
  for (const c of fold.changes) {
    const move = c.created ? `NEW (${c.to})` : c.from === c.to ? `${c.to} (text only)` : `${c.from} -> ${c.to}`;
    L.push(`  ${c.card.padEnd(18)} ${move}${c.prs ? `  ${c.prs.join(" ")}` : ""}${c.deployedBuild ? `  deployed ${c.deployedBuild}` : ""}${c.events > 1 ? `  (${c.events} events)` : ""}`);
  }
  L.push(`  export sha256 ${summary.exportSha256}; registry updatedAt ${summary.registryUpdatedAt}`);
  return L.join("\n");
}

export function applyPlan(repoRoot, plan) {
  if (plan.errors.length || !plan.outputs) throw new Error("refusing to apply a plan with problems");
  for (const [rel, text] of Object.entries(plan.outputs)) {
    const file = path.join(repoRoot, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text, "utf8");
  }
}

// Same two checks CI runs as "Deterministic public owner export". Runs only where the test file exists (a repo checkout).
export const OWNER_EXPORT_CHECKS = [
  { label: "tests/project-board-owner-export.test.mjs", args: ["--test", "tests/project-board-owner-export.test.mjs"] },
  { label: "export-project-board-owner.mjs --check", args: ["scripts/export-project-board-owner.mjs", "--check"] },
];

export function runOwnerExportPreflight(repoRoot) {
  if (!fs.existsSync(path.join(repoRoot, "tests/project-board-owner-export.test.mjs"))) return { skipped: true, failures: [] };
  const failures = [];
  for (const check of OWNER_EXPORT_CHECKS) {
    try { execFileSync(process.execPath, check.args, { cwd: repoRoot, encoding: "utf8", stdio: "pipe" }); }
    catch (error) { failures.push({ label: check.label, output: `${error.stdout ?? ""}${error.stderr ?? ""}`.trim() }); }
  }
  return { skipped: false, failures };
}

// ---- status / check ---------------------------------------------------------------------------------------------------

export function computeStatus(repoRoot, options = {}, nowMs = Date.now()) {
  const state = loadState(repoRoot);
  const pending = loadPending(repoRoot, options);
  const archived = archiveIds(state.archiveRaw);
  const unique = new Map();
  for (const { event } of pending.items) {
    const id = event.id ?? (validateEventShape(event).length ? null : eventId(event));
    if (id && !archived.ids.has(id)) unique.set(id, event);
  }
  const open = [...unique.values()];
  const policy = { maxEvents: options.maxEvents ?? DEFAULT_POLICY.maxEvents, maxDays: options.maxDays ?? DEFAULT_POLICY.maxDays };
  const due = dueStatus(open, nowMs, policy);
  const sync = state.registry.provenance?.boardSync;
  const asOf = state.registry.updatedAt;
  return {
    asOf, lastSync: sync?.at ?? null, pending: open.length, malformed: pending.errors.length, ...due, policy,
    line: `Board as of ${asOf.slice(0, 10)}${sync ? ` (last sync ${sync.at.slice(0, 10)}, ${sync.appliedEventCount} events applied in total)` : ""}, ${open.length} pending event${open.length === 1 ? "" : "s"}${due.ageDays !== null ? `, oldest ${due.ageDays} d` : ""}. ${due.due ? `SYNC DUE: ${due.reasons.join("; ")}.` : "Not due."}`,
  };
}

export function checkIntegrity(repoRoot) {
  const state = loadState(repoRoot);
  const errors = [];
  const ids = state.registry.workItems.map((c) => c.id);
  if (new Set(ids).size !== ids.length) errors.push("registry has duplicate card ids");
  const idSet = new Set(ids);
  for (const id of Object.keys(state.ledger.cards ?? {})) if (!idSet.has(id)) errors.push(`ledger names ${id}, which is not in the registry`);
  // The published card text (title, description) must pass the same screens as tests/project-board-owner-export.test.mjs.
  for (const c of state.registry.workItems) for (const field of ["title", "description"]) errors.push(...screenProblems(`${REGISTRY_PATH}#${c.id} ${field}`, c[field]));
  const archived = archiveIds(state.archiveRaw);
  errors.push(...archived.errors);
  const seen = new Set();
  for (const { event, line } of archived.events) {
    const shape = validateEventShape(event);
    if (shape.length) errors.push(`${ARCHIVE_PATH}:${line}: ${shape.join("; ")}`);
    else if (event.id !== eventId(event)) errors.push(`${ARCHIVE_PATH}:${line}: id does not match content (an archived event was edited)`);
    if (seen.has(event.id)) errors.push(`${ARCHIVE_PATH}:${line}: duplicate event id ${event.id}`);
    seen.add(event.id);
    if (!idSet.has(event.card)) errors.push(`${ARCHIVE_PATH}:${line}: card ${event.card} is not in the registry`);
  }
  const sync = state.registry.provenance?.boardSync;
  if (sync && sync.appliedEventCount !== archived.events.length) errors.push(`provenance.boardSync.appliedEventCount (${sync.appliedEventCount}) does not match the archive (${archived.events.length})`);
  const prov = state.registry.provenance;
  const done = state.registry.workItems.filter((c) => c.status === "completed").length;
  const deferred = state.registry.workItems.filter((c) => c.status === "deferred_candidate").length;
  if (prov.stableIdentityCount !== ids.length || prov.completedCardCount !== done || prov.deferredCardCount !== deferred || prov.openCardCount !== ids.length - done - deferred) errors.push("registry provenance counts do not match the cards");
  if (serializeJson(state.registry, state.registryRaw) !== state.registryRaw) errors.push(`${REGISTRY_PATH} is not in canonical formatting (2-space JSON); run apply or re-serialize`);
  return { errors, cards: ids.length, archived: archived.events.length };
}

// ---- CLI --------------------------------------------------------------------------------------------------------------

function parseArgs(argv) {
  const out = { _: [], prs: [], eventFiles: [] };
  const flagsWithValue = new Set(["card", "status", "text", "title", "note", "lane", "deployed", "device", "checked-on", "description", "pr", "webpr", "events", "web", "max-events", "max-days", "remote", "json", "by", "ts"]);
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith("--")) { out._.push(a); continue; }
    const key = a.slice(2);
    if (flagsWithValue.has(key)) {
      const value = argv[++i];
      if (value === undefined) throw new Error(`--${key} needs a value`);
      if (key === "pr" || key === "webpr") out.prs.push({ repo: key === "pr" ? "fawxzzy/mazer" : "fawxzzy/FawxzzyWeb", value });
      else if (key === "events") out.eventFiles.push(value);
      else out[key] = value;
    } else out[key] = true;
  }
  return out;
}

function eventFromArgs(args) {
  if (args.json) return JSON.parse(args.json);
  const event = { v: 1, ts: args.ts ?? new Date().toISOString().replace(/\.\d{3}Z$/, "Z"), card: args.card, text: args.text };
  if (args.status) event.status = args.status;
  if (args.title) event.title = args.title;
  if (args.description) event.description = args.description;
  if (args.note) event.note = args.note;
  if (args.lane) event.lane = args.lane;
  if (args.by) event.by = args.by;
  const evidence = {};
  if (args.prs.length) evidence.prs = args.prs.map(({ repo, value }) => { const [n, sha] = value.split(":"); return { repo, number: Number(n), ...(sha ? { mergedSha: sha } : {}) }; });
  if (args.deployed) evidence.deployedBuild = args.deployed;
  if (args.headless) evidence.headless = true;
  if (args.device !== undefined) evidence.deviceChecked = args.device === "true" ? true : args.device === "none" ? null : false;
  if (args["checked-on"]) evidence.checkedOn = args["checked-on"];
  if (Object.keys(evidence).length) event.evidence = evidence;
  return event;
}

export function runBoardSync(argv, repoRoot = process.cwd(), out = (line) => process.stdout.write(`${line}\n`), deps = {}) {
  const args = parseArgs(argv);
  const command = args._[0];
  const options = { eventFiles: args.eventFiles, remote: args.remote ?? "origin", noRemote: Boolean(args["no-remote"]), maxEvents: args["max-events"] ? Number(args["max-events"]) : undefined, maxDays: args["max-days"] ? Number(args["max-days"]) : undefined };
  if (command === "event") {
    const result = appendEvent(repoRoot, eventFromArgs(args), { remote: options.remote });
    out(`board event ${result.id} recorded in ${result.where}${result.warning ? ` (${result.warning})` : ""}`);
    return 0;
  }
  if (command === "flush") { const r = flushLocal(repoRoot, options.remote); out(`board-sync: flushed ${r.flushed} locally saved event(s)`); return 0; }
  if (command === "status") {
    const status = computeStatus(repoRoot, options);
    out(status.line);
    if (status.malformed) out(`warning: ${status.malformed} malformed pending line(s) will block apply`);
    return args.due && !status.due ? 3 : 0;
  }
  if (command === "plan" || command === "apply") {
    const plan = computePlan(repoRoot, options);
    out(formatPlan(plan));
    if (plan.errors.length) return 2;
    if (command === "apply" && plan.outputs) {
      // Preflight: write, run the CI owner-export checks on the result, and restore every file if they fail.
      const snapshot = Object.keys(plan.outputs).map((rel) => { const file = path.join(repoRoot, rel); return [file, fs.existsSync(file) ? fs.readFileSync(file) : null]; });
      applyPlan(repoRoot, plan);
      const pre = (deps.ownerExportPreflight ?? runOwnerExportPreflight)(repoRoot);
      if (pre.failures.length) {
        for (const [file, content] of snapshot) { if (content === null) fs.rmSync(file, { force: true }); else fs.writeFileSync(file, content); }
        out(`board-sync: REFUSED, the owner export check (the one CI runs) fails on the folded result; every file restored, nothing left written`);
        for (const f of pre.failures) { out(`  - ${f.label}:`); for (const line of f.output.split("\n").slice(0, 25)) out(`      ${line}`); }
        out("Fix the event text with a corrective event (wording), then run apply again.");
        return 2;
      }
      if (pre.skipped) out("board-sync: owner export preflight skipped (tests/project-board-owner-export.test.mjs not present here)");
      else out("board-sync: owner export preflight passed (same checks as CI)");
      out(`board-sync: wrote ${Object.keys(plan.outputs).join(", ")}`);
      out("Next: commit those files in one pull request, wait for the Owner export check, merge, then run `web --web <FawxzzyWeb worktree> --write` and the Web checks.");
    } else if (command === "plan") out("(dry run: nothing written; run apply to write)");
    return 0;
  }
  if (command === "check") {
    const result = checkIntegrity(repoRoot);
    if (result.errors.length) { out(`board-sync check: FAILED\n  - ${result.errors.join("\n  - ")}`); return 2; }
    out(`board-sync check: ok (${result.cards} cards, ${result.archived} archived events)`);
    return 0;
  }
  if (command === "web") {
    if (!args.web) throw new Error("web needs --web <FawxzzyWeb worktree>");
    const result = repinWeb({ webDir: path.resolve(args.web), exportPath: path.join(repoRoot, EXPORT_PATH), write: Boolean(args.write) });
    out(`board-sync web: ${args.write ? "wrote" : "would write (dry run, add --write)"} ${result.cards} cards, export sha256 ${result.sha256}`);
    for (const e of result.edits) out(`  ${e}`);
    out(`Next in the Web worktree: ${WEB_NEXT_COMMANDS.join(" ; ")}; stage only: ${result.files.join(", ")}, ${WEB_FILES.snapshot}`);
    return 0;
  }
  out("usage: board-sync.mjs <event|status|plan|apply|check|web|flush> [options]; see docs/ops/MAZER-BOARD-SYNC-PROCESS.md");
  return command ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = runBoardSync(process.argv.slice(2)); }
  catch (error) { console.error(`board-sync: ${error.message}`); process.exitCode = 1; }
}
