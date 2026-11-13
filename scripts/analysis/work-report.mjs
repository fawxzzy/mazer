// Generates the Mazer work report from the owner registry plus the operational ledger.
//
//   node scripts/analysis/work-report.mjs           write docs/ops/MAZER-WORK-REPORT.md and .json
//   node scripts/analysis/work-report.mjs --check   fail when the committed outputs are stale
//
// Inputs:  config/mazer-owner-work-registry.json  (status, title, priority, dependencies: single source of truth)
//          config/mazer-work-ledger.json          (evidence, blockers, verification steps, lanes, file hints)
// The output is deterministic: no clock, no randomness, stable ordering. The only date is the registry's own updatedAt.
// Schema and bucket rules: docs/ops/MAZER-WORK-LEDGER-SCHEMA.md.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REGISTRY_PATH = "config/mazer-owner-work-registry.json";
export const LEDGER_PATH = "config/mazer-work-ledger.json";
export const REPORT_MD_PATH = "docs/ops/MAZER-WORK-REPORT.md";
export const REPORT_JSON_PATH = "docs/ops/MAZER-WORK-REPORT.json";

const PRIORITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 };
const BLOCKER_KINDS = new Set(["owner-decision", "provider", "device", "dependency", "deferred-by-owner"]);
const UNBLOCKERS = new Set(["Zac", "provider", "device", "other-card"]);
const VERIFY_WHERE = new Set(["phone", "installed-app", "production", "external-tool"]);
const LANES = new Set(["agent-buildable", "long-running", "owner-only"]);
// Files owned by a single UI wave: one change set may not mix waves (tests/architecture/ui-state-model-contract.test.ts).
const WAVE_FILES = new Map([
  ["src/scenes/MenuScene.ts", "5C"],
  ["src/legacy-runtime/legacyPlayerMessage.ts", "3B"],
  ["src/scenes/menuRuntimeDiagnostics.ts", "1C"],
  ["package.json", "5B"],
]);

export const COMPLETED_TIERS = ["device", "headless", "source-only", "no-device-surface", "unrecorded"];
export const BLOCKED_GROUPS = ["Zac", "provider", "device", "other-card", "unknown"];
const BLOCKED_GROUP_TITLES = {
  Zac: "Zac (an approval or a sign-off on a gated change)",
  provider: "Provider (a Supabase, web or other provider step)",
  device: "Device (needs a real phone run that has no exact steps yet)",
  "other-card": "Another card (waits on a card that is not finished)",
  unknown: "Unknown (blocked in the registry, no ledger entry says on what)",
};

function priorityRank(priority) {
  return priority in PRIORITY_RANK ? PRIORITY_RANK[priority] : 4;
}

function compareCards(a, b) {
  return priorityRank(a.priority) - priorityRank(b.priority) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

function compareCompleted(a, b) {
  const da = a.updatedAt ?? "";
  const db = b.updatedAt ?? "";
  return da < db ? 1 : da > db ? -1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function validateLedger(registry, ledger) {
  const errors = [];
  if (ledger?.schemaVersion !== 1) errors.push("ledger.schemaVersion must be 1");
  const ids = new Set(registry.workItems.map((card) => card.id));
  for (const [id, entry] of Object.entries(ledger?.cards ?? {})) {
    if (!ids.has(id)) { errors.push(`${id}: not in the registry`); continue; }
    const e = entry ?? {};
    if (e.lane != null && !LANES.has(e.lane)) errors.push(`${id}: bad lane ${e.lane}`);
    if (e.blocker != null) {
      if (!BLOCKER_KINDS.has(e.blocker.kind)) errors.push(`${id}: bad blocker.kind ${e.blocker.kind}`);
      if (!UNBLOCKERS.has(e.blocker.unblockedBy)) errors.push(`${id}: bad blocker.unblockedBy ${e.blocker.unblockedBy}`);
    }
    for (const step of e.verify ?? []) {
      if (!VERIFY_WHERE.has(step.where)) errors.push(`${id}: bad verify.where ${step.where}`);
      if (!step.step || !step.expected) errors.push(`${id}: verify step needs step and expected`);
    }
    if (e.evidence != null) {
      if (typeof e.evidence.headless !== "boolean") errors.push(`${id}: evidence.headless must be boolean`);
      if (e.evidence.deviceChecked !== null && typeof e.evidence.deviceChecked !== "boolean") errors.push(`${id}: evidence.deviceChecked must be boolean or null`);
      if (!Array.isArray(e.evidence.prs)) errors.push(`${id}: evidence.prs must be an array`);
    }
  }
  return errors;
}

export function completedTier(evidence) {
  if (!evidence) return "unrecorded";
  if (evidence.deviceChecked === true) return "device";
  if (evidence.deviceChecked === null) return "no-device-surface";
  return evidence.headless ? "headless" : "source-only";
}

function formatPrs(prs) {
  return (prs ?? []).map((p) => (p.repo === "fawxzzy/mazer" ? `#${p.number}` : `${p.repo.split("/")[1]}#${p.number}`)).join(", ");
}

function overlaps(a, b) {
  const norm = (p) => p.replace(/\/+$/, "");
  const pa = norm(a);
  const pb = norm(b);
  return pa === pb || pa.startsWith(`${pb}/`) || pb.startsWith(`${pa}/`);
}

function slim(card, entry, extra = {}) {
  return {
    id: card.id,
    title: card.title,
    status: card.status,
    priority: card.priority,
    ...extra,
  };
}

export function buildWorkReport(registry, ledger) {
  const errors = validateLedger(registry, ledger);
  if (errors.length) throw new Error(`work ledger invalid:\n  ${errors.join("\n  ")}`);
  const byId = new Map(registry.workItems.map((card) => [card.id, card]));
  const entryOf = (id) => ledger.cards?.[id] ?? {};

  const assignments = new Map(); // id -> { bucket, sub }
  const lists = {
    decisions: [], checks: [], review: [], inProgress: [], ready: [], deferred: [], unclassified: [],
    blocked: Object.fromEntries(BLOCKED_GROUPS.map((g) => [g, []])),
    completed: Object.fromEntries(COMPLETED_TIERS.map((t) => [t, []])),
  };
  const assign = (card, bucket, sub, item) => {
    assignments.set(card.id, { bucket, sub });
    return item;
  };

  for (const card of registry.workItems) {
    const e = entryOf(card.id);
    const blocker = e.blocker ?? null;
    const verify = e.verify ?? [];
    const base = { prs: formatPrs(e.evidence?.prs), lane: e.lane ?? null };

    if (card.status === "completed") {
      const tier = completedTier(e.evidence);
      lists.completed[tier].push(assign(card, "completed", tier, {
        ...slim(card, e),
        date: (card.updatedAt ?? "").slice(0, 10),
        tier,
        prs: base.prs,
        deployedBuild: e.evidence?.deployedBuild ?? null,
        updatedAt: card.updatedAt,
      }));
      continue;
    }
    if (card.status === "deferred_candidate") {
      lists.deferred.push(assign(card, "deferred", null, { ...slim(card, e), why: blocker?.summary ?? "", waitsOn: blocker?.unblockedBy ?? null }));
      continue;
    }
    if (blocker?.kind === "owner-decision" || verify.length > 0) {
      const decision = blocker?.kind === "owner-decision";
      const item = {
        ...slim(card, e),
        kind: decision ? "decision" : "check",
        ask: blocker?.ask ?? "",
        recommendation: blocker?.recommendation ?? "",
        context: blocker?.summary ?? "",
        prs: base.prs,
        verify,
      };
      (decision ? lists.decisions : lists.checks).push(assign(card, "needs-you", item.kind, item));
      continue;
    }
    if (blocker || card.status === "blocked") {
      const group = blocker ? blocker.unblockedBy : "unknown";
      lists.blocked[group].push(assign(card, "blocked", group, {
        ...slim(card, e),
        kind: blocker?.kind ?? "unknown",
        ask: blocker?.ask ?? "The registry marks this blocked but the ledger does not say on what.",
        derived: false,
      }));
      continue;
    }
    if (card.status === "review") {
      lists.review.push(assign(card, "in-review", null, { ...slim(card, e), prs: base.prs, note: e.note ?? "" }));
      continue;
    }
    if (card.status === "in_progress" || card.status === "active" || e.lane === "long-running") {
      lists.inProgress.push(assign(card, "in-progress", null, { ...slim(card, e), note: e.note ?? "" }));
      continue;
    }
    if (e.lane === "agent-buildable") {
      const open = (card.dependencies ?? []).filter((dep) => byId.get(dep)?.status !== "completed");
      if (open.length) {
        lists.blocked["other-card"].push(assign(card, "blocked", "other-card", {
          ...slim(card, e),
          kind: "dependency",
          ask: `Waits on ${open.map((dep) => `${dep} (${byId.get(dep)?.status ?? "missing"})`).join(", ")}.`,
          derived: true,
        }));
        continue;
      }
      lists.ready.push(assign(card, "ready", null, { ...slim(card, e), filesHint: e.filesHint ?? [] }));
      continue;
    }
    lists.unclassified.push(assign(card, "unclassified", null, { ...slim(card, e), lane: e.lane ?? null }));
  }

  lists.decisions.sort(compareCards);
  lists.checks.sort(compareCards);
  lists.review.sort(compareCards);
  lists.inProgress.sort(compareCards);
  lists.deferred.sort(compareCards);
  lists.unclassified.sort(compareCards);
  for (const g of BLOCKED_GROUPS) lists.blocked[g].sort(compareCards);
  for (const t of COMPLETED_TIERS) lists.completed[t].sort(compareCompleted);
  lists.ready.sort(compareCards);

  // Conflict planning for the ready queue: overlaps with an earlier (higher-priority) card, and wave files.
  lists.ready.forEach((item, index) => {
    const warnings = [];
    for (const earlier of lists.ready.slice(0, index)) {
      const shared = item.filesHint.filter((p) => earlier.filesHint.some((q) => overlaps(p, q)));
      if (shared.length) warnings.push(`overlaps ${earlier.id} on ${shared.join(", ")}`);
    }
    const waves = [...new Set(item.filesHint.map((p) => WAVE_FILES.get(p)).filter(Boolean))].sort();
    if (waves.length > 1) warnings.push(`touches files of waves ${waves.join(" and ")}: split the pull request`);
    item.waves = waves;
    item.warnings = warnings;
  });
  const menuSceneCards = lists.ready.filter((item) => item.filesHint.includes("src/scenes/MenuScene.ts")).map((item) => item.id);

  const open = registry.workItems.filter((c) => c.status !== "completed" && c.status !== "deferred_candidate").length;
  const bucketCounts = {
    "needs-you": lists.decisions.length + lists.checks.length,
    "in-review": lists.review.length,
    blocked: BLOCKED_GROUPS.reduce((n, g) => n + lists.blocked[g].length, 0),
    ready: lists.ready.length,
    "in-progress": lists.inProgress.length,
    unclassified: lists.unclassified.length,
    deferred: lists.deferred.length,
    completed: COMPLETED_TIERS.reduce((n, t) => n + lists.completed[t].length, 0),
  };
  const counters = {
    total: registry.workItems.length,
    open,
    completed: bucketCounts.completed,
    deferred: bucketCounts.deferred,
    buckets: bucketCounts,
    needsYou: { decisions: lists.decisions.length, checks: lists.checks.length },
    completedByTier: Object.fromEntries(COMPLETED_TIERS.map((t) => [t, lists.completed[t].length])),
    blockedByGroup: Object.fromEntries(BLOCKED_GROUPS.map((g) => [g, lists.blocked[g].length])),
  };

  const json = {
    schemaVersion: 1,
    generatedFrom: { registry: REGISTRY_PATH, ledger: LEDGER_PATH, registryUpdatedAt: registry.updatedAt, ...(registry.provenance?.boardSync ? { boardSync: registry.provenance.boardSync } : {}) },
    counters,
    needsYou: { decisions: lists.decisions, checks: lists.checks },
    completed: lists.completed,
    inReview: lists.review,
    blocked: lists.blocked,
    ready: { queue: lists.ready, menuSceneCards },
    inProgress: lists.inProgress,
    deferred: lists.deferred,
    unclassified: lists.unclassified,
    cards: Object.fromEntries(registry.workItems.map((c) => [c.id, assignments.get(c.id)])),
  };
  return { json, markdown: renderMarkdown(json) };
}

const prio = (p) => (p ? p : "none");

function renderMarkdown(report) {
  const { counters: c } = report;
  const L = [];
  const push = (line = "") => L.push(line);
  push("# Mazer work report");
  push();
  push(`<!-- GENERATED by scripts/analysis/work-report.mjs from ${REGISTRY_PATH} and ${LEDGER_PATH}. Do not edit by hand: change the registry or the ledger and run \`node scripts/analysis/work-report.mjs\`. -->`);
  push();
  push(`Board as of ${report.generatedFrom.registryUpdatedAt} (the registry's own updatedAt). Read time: about two minutes. Sections run from what needs you to what can wait.`);
  const sync = report.generatedFrom.boardSync;
  push();
  if (sync) {
    push(`Last board sync: ${String(sync.at).slice(0, 10)} (${sync.appliedEventCount} board events applied in total). Work that landed after that date waits in the pending board events and is not shown here; \`node scripts/board/board-sync.mjs status\` prints the pending count.`);
    push();
  }
  push("## At a glance");
  push();
  push(`- **${c.total} cards**: ${c.completed} completed, ${c.open} open, ${c.deferred} deferred.`);
  push(`- **Needs you now: ${c.buckets["needs-you"]}** (${c.needsYou.decisions} decisions, ${c.needsYou.checks} phone or device checks).`);
  push(`- Completed by proof: ${c.completedByTier.device} verified on a device, ${c.completedByTier.headless} headless-only, ${c.completedByTier["source-only"]} tests or capture frames only, ${c.completedByTier["no-device-surface"]} with no device surface, ${c.completedByTier.unrecorded} with no evidence recorded.`);
  push();
  push("| Bucket | Cards |");
  push("| --- | ---: |");
  push(`| 1. Needs you now | ${c.buckets["needs-you"]} |`);
  push(`| 2. Completed | ${c.buckets.completed} |`);
  push(`| 3. In review | ${c.buckets["in-review"]} |`);
  push(`| 4. Blocked | ${c.buckets.blocked} |`);
  push(`| 5. Ready to build | ${c.buckets.ready} |`);
  push(`| 6. In progress | ${c.buckets["in-progress"]} |`);
  push(`| 7. Deferred | ${c.buckets.deferred} |`);
  push(`| 8. Unclassified | ${c.buckets.unclassified} |`);
  push();

  // 1. Needs you now
  push("## 1. Needs you now");
  push();
  push(`### Decisions (${report.needsYou.decisions.length})`);
  push();
  if (!report.needsYou.decisions.length) push("None.");
  for (const d of report.needsYou.decisions) {
    const where = d.status === "review" ? `, in review${d.prs ? `, ${d.prs}` : ""}` : d.status === "blocked" ? ", blocked" : "";
    push(`- [ ] \`${d.id}\` ${d.title} (${prio(d.priority)}${where})`);
    push(`  - Ask: ${d.ask}`);
    push(`  - Recommendation: ${d.recommendation}`);
    for (const s of d.verify) push(`  - Then check (${s.where}): ${s.step} Expect: ${s.expected}`);
  }
  push();
  push(`### Phone and device checks (${report.needsYou.checks.length})`);
  push();
  if (!report.needsYou.checks.length) push("None.");
  for (const k of report.needsYou.checks) {
    const where = k.status === "review" ? `, in review${k.prs ? `, ${k.prs}` : ""}` : "";
    push(`- [ ] \`${k.id}\` ${k.title} (${prio(k.priority)}${where})`);
    push(`  - Ask: ${k.ask}`);
    push(`  - Recommendation: ${k.recommendation}`);
    for (const s of k.verify) push(`  - [ ] (${s.where}) ${s.step} Expect: ${s.expected}`);
  }
  push();
  const phonePass = c.completedByTier.headless + c.completedByTier["source-only"];
  push(`${phonePass} shipped cards (section 2) have no phone proof; the combined phone pass for them is the MAZER-QA-001 checklist above.`);
  push();

  // 2. Completed
  push("## 2. Completed");
  push();
  const completedBlock = (title, items, empty) => {
    push(`### ${title} (${items.length})`);
    push();
    if (!items.length) push(empty);
    for (const it of items) {
      const bits = [it.date, it.prs, it.deployedBuild ? `deployed ${it.deployedBuild}` : ""].filter(Boolean).join(", ");
      push(`- \`${it.id}\` ${it.title}${bits ? ` (${bits})` : ""}`);
    }
    push();
  };
  completedBlock("Verified on a device", report.completed.device, "None yet: no completed card records a real-device check.");
  completedBlock("Shipped, headless-only (needs a phone check)", report.completed.headless, "None.");
  completedBlock("Shipped on tests or capture frames only (no browser or phone proof recorded)", report.completed["source-only"], "None.");
  completedBlock("No device surface (tooling, governance, data, docs)", report.completed["no-device-surface"], "None.");
  completedBlock("Completed with no evidence recorded", report.completed.unrecorded, "None.");

  // 3. In review
  push("## 3. In review");
  push();
  push(`Review cards that wait on you are listed in section 1; these are the rest (${report.inReview.length}).`);
  push();
  if (!report.inReview.length) push("None.");
  for (const r of report.inReview) push(`- \`${r.id}\` ${r.title} (${prio(r.priority)}${r.prs ? `, ${r.prs}` : ""})${r.note ? `: ${r.note}` : ""}`);
  push();

  // 4. Blocked
  push("## 4. Blocked");
  push();
  push(`Grouped by who unblocks (${c.buckets.blocked} cards). Cards that only need your answer or a phone check are in section 1.`);
  push();
  for (const g of BLOCKED_GROUPS) {
    const items = report.blocked[g];
    if (!items.length) continue;
    push(`### ${BLOCKED_GROUP_TITLES[g]} (${items.length})`);
    push();
    for (const b of items) push(`- \`${b.id}\` ${b.title} (${prio(b.priority)}): ${b.ask}`);
    push();
  }
  if (!c.buckets.blocked) { push("None."); push(); }

  // 5. Ready
  push("## 5. Ready to build");
  push();
  push(`Agent-buildable with no open dependency, highest priority first (${report.ready.queue.length} cards). Hint files are for conflict planning only.`);
  push();
  if (report.ready.menuSceneCards.length > 1) {
    push(`> Hot file: \`src/scenes/MenuScene.ts\` (Wave 5C) is touched by ${report.ready.menuSceneCards.join(", ")}. Run at most 2 of them in one batch and merge them one at a time.`);
    push();
  }
  if (!report.ready.queue.length) push("None.");
  report.ready.queue.forEach((r, i) => {
    push(`${i + 1}. \`${r.id}\` ${r.title} (${prio(r.priority)})${r.warnings.length ? ` WARNING: ${r.warnings.join("; ")}` : ""}`);
  });
  push();

  // 6. In progress
  push("## 6. In progress");
  push();
  push("Long-running lanes. Audit the current state before assigning any of it to a worker.");
  push();
  if (!report.inProgress.length) push("None.");
  for (const p of report.inProgress) push(`- \`${p.id}\` ${p.title} (${prio(p.priority)}): ${p.note || "no audit note recorded"}`);
  push();

  // 7. Deferred
  push("## 7. Deferred");
  push();
  if (!report.deferred.length) push("None.");
  for (const d of report.deferred) push(`- \`${d.id}\` ${d.title}${d.why ? `: ${d.why}` : ""}`);
  push();

  // 8. Unclassified
  push("## 8. Unclassified");
  push();
  push("Open cards the ledger cannot place from evidence. Nothing is dropped silently.");
  push();
  if (!report.unclassified.length) push("None.");
  for (const u of report.unclassified) push(`- \`${u.id}\` ${u.title} (${prio(u.priority)}, ${u.status})`);
  push();
  return `${L.join("\n").replace(/\n+$/, "")}\n`;
}

export function renderOutputs(repoRoot = process.cwd()) {
  const registry = JSON.parse(fs.readFileSync(path.join(repoRoot, REGISTRY_PATH), "utf8"));
  const ledger = JSON.parse(fs.readFileSync(path.join(repoRoot, LEDGER_PATH), "utf8"));
  const { json, markdown } = buildWorkReport(registry, ledger);
  return { markdown, json: `${JSON.stringify(json, null, 2)}\n`, report: json };
}

export function runWorkReport(argv, repoRoot = process.cwd()) {
  const check = argv.includes("--check");
  const unknown = argv.filter((a) => a !== "--check");
  if (unknown.length) throw new Error(`unknown argument: ${unknown[0]}`);
  const out = renderOutputs(repoRoot);
  const targets = [[REPORT_MD_PATH, out.markdown], [REPORT_JSON_PATH, out.json]];
  if (check) {
    for (const [rel, text] of targets) {
      const file = path.join(repoRoot, rel);
      if (!fs.existsSync(file) || fs.readFileSync(file, "utf8").split("\r\n").join("\n") !== text) {
        throw new Error(`${rel} is stale: run node scripts/analysis/work-report.mjs`);
      }
    }
    process.stdout.write(`mazer-work-report: ok (${out.report.counters.total} cards)\n`);
    return;
  }
  for (const [rel, text] of targets) {
    const file = path.join(repoRoot, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text, "utf8");
  }
  process.stdout.write(`mazer-work-report: wrote ${REPORT_MD_PATH} and ${REPORT_JSON_PATH}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { runWorkReport(process.argv.slice(2)); }
  catch (error) { console.error(`mazer-work-report: ${error.message}`); process.exitCode = 1; }
}
