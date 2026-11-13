// Pure board-event logic: parse, validate and fold board events into the owner registry and the work ledger.
// No file system, no git, no clock: the same events and the same inputs always produce the same outputs.
// Process, event format and trigger policy: docs/ops/MAZER-BOARD-SYNC-PROCESS.md.
import crypto from "node:crypto";

export const EVENT_VERSION = 1;
export const STATUSES = ["active", "in_progress", "planning", "review", "blocked", "completed", "deferred_candidate"];
export const CARD_TYPES = ["feature", "bug", "governance", "architecture", "documentation", "automation", "research", "migration", "reliability", "technical-debt"];
export const PRIORITIES = ["critical", "high", "medium", "low", null];
export const BLOCKER_KINDS = ["owner-decision", "provider", "device", "dependency", "deferred-by-owner"];
export const UNBLOCKERS = ["Zac", "provider", "device", "other-card"];
export const VERIFY_WHERE = ["phone", "installed-app", "production", "external-tool"];
export const LANES = ["agent-buildable", "long-running", "owner-only"];
export const CARD_ID = /^MAZER-[A-Z0-9]+(?:-[A-Z0-9]+)*-[0-9]{3}$/;
export const MAX_TEXT = 700;
export const MAX_TITLE = 90;
// Generated lines in a card description. Only the newest few stay in the card; every event stays in the archive.
export const KEEP_UPDATE_LINES = 3;
export const UPDATE_MARKER = "Board update ";
const UPDATE_LINE = /(?:^| )Board update \d{4}-\d{2}-\d{2}: .*?(?= Board update \d{4}-\d{2}-\d{2}: |$)/gs;

const ALLOWED_KEYS = new Set(["v", "id", "ts", "card", "status", "text", "title", "new", "evidence", "blocker", "verify", "note", "lane", "reopen", "by"]);
const EVIDENCE_KEYS = new Set(["prs", "deployedBuild", "headless", "deviceChecked", "checkedOn"]);
const NEW_KEYS = new Set(["title", "description", "cardType", "priority", "dependencies", "acceptanceCriteria"]);

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().filter((k) => value[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Content id: first 12 hex chars of sha256 over the canonical event without `id` and `by`. */
export function eventId(event) {
  const { id: _id, by: _by, ...rest } = event;
  return crypto.createHash("sha256").update(canonicalJson(rest)).digest("hex").slice(0, 12);
}

export function withId(event) {
  return { ...event, id: eventId(event) };
}

export function isoDay(ts) {
  return new Date(ts).toISOString().slice(0, 10);
}

export function normalizeTs(ts) {
  return new Date(ts).toISOString();
}

/** Parse JSON lines. Returns { events: [{ event, line, source }], errors }. Blank lines are ignored. */
export function parseJsonl(text, source = "events") {
  const events = [];
  const errors = [];
  String(text ?? "").split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    if (!line) return;
    try {
      const event = JSON.parse(line);
      if (!event || typeof event !== "object" || Array.isArray(event)) throw new Error("not an object");
      events.push({ event, line: index + 1, source });
    } catch (error) {
      errors.push(`${source}:${index + 1}: not valid JSON (${error.message})`);
    }
  });
  return { events, errors };
}

const URL_OR_PATH = /https?:\/\/|\b[A-Za-z]:[\\/]|\\\\|(?:^|\s)~\//;
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;

function textProblems(label, value, max) {
  const out = [];
  if (typeof value !== "string" || !value.trim()) return [`${label} must be a non-empty string`];
  if (value.length > max) out.push(`${label} is ${value.length} chars (max ${max})`);
  if (/[\r\n]/.test(value)) out.push(`${label} must be one line`);
  if (URL_OR_PATH.test(value)) out.push(`${label} must not contain a URL or a file path (public board text)`);
  if (EMAIL.test(value)) out.push(`${label} must not contain an email address`);
  if (value.includes(UPDATE_MARKER)) out.push(`${label} must not contain "${UPDATE_MARKER.trim()}" (reserved for generated lines)`);
  return out;
}

/** Shape-only validation of one event line (no registry needed). */
export function validateEventShape(event) {
  const errors = [];
  for (const key of Object.keys(event)) if (!ALLOWED_KEYS.has(key)) errors.push(`unknown field "${key}"`);
  if (event.v !== EVENT_VERSION) errors.push(`v must be ${EVENT_VERSION}`);
  if (typeof event.ts !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(event.ts) || Number.isNaN(Date.parse(event.ts))) errors.push("ts must be an ISO UTC timestamp like 2026-11-13T12:00:00Z");
  if (typeof event.card !== "string" || !CARD_ID.test(event.card)) errors.push("card must be a stable MAZER-AREA-NNN id");
  if (event.status !== undefined && !STATUSES.includes(event.status)) errors.push(`status must be one of ${STATUSES.join(", ")} ("archived" is refused)`);
  errors.push(...textProblems("text", event.text, MAX_TEXT));
  if (event.title !== undefined) errors.push(...textProblems("title", event.title, MAX_TITLE));
  if (event.note !== undefined && event.note !== null) errors.push(...textProblems("note", event.note, 300));
  if (event.lane !== undefined && event.lane !== null && !LANES.includes(event.lane)) errors.push(`lane must be one of ${LANES.join(", ")}`);
  if (event.evidence !== undefined) {
    const ev = event.evidence;
    if (!ev || typeof ev !== "object" || Array.isArray(ev)) errors.push("evidence must be an object");
    else {
      for (const key of Object.keys(ev)) if (!EVIDENCE_KEYS.has(key)) errors.push(`evidence has unknown field "${key}"`);
      if (ev.prs !== undefined) {
        if (!Array.isArray(ev.prs)) errors.push("evidence.prs must be an array");
        else for (const pr of ev.prs) {
          if (!pr || !["fawxzzy/mazer", "fawxzzy/FawxzzyWeb"].includes(pr.repo)) errors.push("evidence.prs[].repo must be fawxzzy/mazer or fawxzzy/FawxzzyWeb");
          if (!Number.isInteger(pr?.number) || pr.number < 1) errors.push("evidence.prs[].number must be a positive integer");
          if (pr?.mergedSha !== undefined && !/^[0-9a-f]{7,40}$/.test(pr.mergedSha)) errors.push("evidence.prs[].mergedSha must be 7-40 hex chars");
        }
      }
      if (ev.deployedBuild !== undefined && !(typeof ev.deployedBuild === "string" && /^[A-Za-z0-9._-]{4,80}$/.test(ev.deployedBuild))) errors.push("evidence.deployedBuild must be a build name or sha (letters, digits, . _ -)");
      if (ev.headless !== undefined && typeof ev.headless !== "boolean") errors.push("evidence.headless must be boolean");
      if (ev.deviceChecked !== undefined && ev.deviceChecked !== null && typeof ev.deviceChecked !== "boolean") errors.push("evidence.deviceChecked must be boolean or null");
      if (ev.deviceChecked === true) errors.push(...(typeof ev.checkedOn === "string" ? textProblems("evidence.checkedOn", ev.checkedOn, 120) : ["evidence.checkedOn (what device and build) is required when deviceChecked is true"]));
    }
  }
  if (event.blocker !== undefined && event.blocker !== null) {
    const b = event.blocker;
    if (!BLOCKER_KINDS.includes(b?.kind)) errors.push(`blocker.kind must be one of ${BLOCKER_KINDS.join(", ")}`);
    if (!UNBLOCKERS.includes(b?.unblockedBy)) errors.push(`blocker.unblockedBy must be one of ${UNBLOCKERS.join(", ")}`);
    for (const f of ["summary", "ask"]) errors.push(...textProblems(`blocker.${f}`, b?.[f], 400));
    if (b?.recommendation !== undefined) errors.push(...textProblems("blocker.recommendation", b.recommendation, 400));
  }
  if (event.verify !== undefined) {
    if (!Array.isArray(event.verify)) errors.push("verify must be an array");
    else for (const s of event.verify) {
      if (!VERIFY_WHERE.includes(s?.where)) errors.push(`verify[].where must be one of ${VERIFY_WHERE.join(", ")}`);
      if (!s?.step || !s?.expected) errors.push("verify[] needs step and expected");
    }
  }
  if (event.new !== undefined) {
    const n = event.new;
    if (!n || typeof n !== "object") errors.push("new must be an object");
    else {
      for (const key of Object.keys(n)) if (!NEW_KEYS.has(key)) errors.push(`new has unknown field "${key}"`);
      errors.push(...textProblems("new.title", n.title, MAX_TITLE));
      errors.push(...textProblems("new.description", n.description, 1500));
      if (!CARD_TYPES.includes(n.cardType)) errors.push(`new.cardType must be one of ${CARD_TYPES.join(", ")}`);
      if (!PRIORITIES.includes(n.priority ?? null)) errors.push("new.priority must be critical, high, medium, low or null");
      if (!Array.isArray(n.dependencies ?? [])) errors.push("new.dependencies must be an array of card ids");
      if (!Array.isArray(n.acceptanceCriteria) || n.acceptanceCriteria.length < 3) errors.push("new.acceptanceCriteria needs at least 3 entries (exporter rule)");
      else for (const c of n.acceptanceCriteria) errors.push(...textProblems("new.acceptanceCriteria[]", c, 400));
    }
  }
  return errors;
}

/**
 * The sentence generated from the evidence the event itself carries, so card text cannot contradict the evidence fields.
 * `after` is the merged evidence (used only to say "merged, not deployed" when no build is recorded).
 */
export function evidenceSentence(evidence, after = evidence) {
  if (!evidence) return "";
  const parts = [];
  const prs = (evidence.prs ?? []).map((p) => {
    const label = p.repo === "fawxzzy/mazer" ? `PR #${p.number}` : `FawxzzyWeb PR #${p.number}`;
    return p.mergedSha ? `${label} merged (${p.mergedSha.slice(0, 8)})` : `${label} open`;
  });
  if (prs.length) parts.push(`${prs.join(", ")}.`);
  const merged = (evidence.prs ?? []).some((p) => p.mergedSha);
  if (evidence.deployedBuild) parts.push(`Deployed: production build ${evidence.deployedBuild}.`);
  else if (merged && after?.deviceChecked === null) parts.push("No runtime surface to deploy.");
  else if (merged && !after?.deployedBuild) parts.push("Merged, not deployed.");
  if (evidence.deviceChecked === true) parts.push(`Checked on a real device: ${evidence.checkedOn}.`);
  else if (evidence.deviceChecked === false) {
    parts.push((evidence.headless ?? after?.headless) ? "Checked only in headless Chromium, not on a real phone." : "Unit tests only: no browser or phone check.");
  } else if (evidence.deviceChecked === null) parts.push("No device surface.");
  else if (evidence.headless === true) parts.push("Headless Chromium run recorded.");
  return parts.join(" ");
}

function mergeEvidence(current, incoming) {
  const base = current ?? { prs: [], headless: false, deviceChecked: false };
  const out = { ...base, prs: [...(base.prs ?? [])] };
  for (const pr of incoming.prs ?? []) {
    const at = out.prs.findIndex((p) => p.repo === pr.repo && p.number === pr.number);
    if (at < 0) out.prs.push({ repo: pr.repo, number: pr.number, ...(pr.mergedSha ? { mergedSha: pr.mergedSha } : {}) });
    else if (pr.mergedSha) out.prs[at] = { ...out.prs[at], mergedSha: pr.mergedSha };
  }
  if (incoming.deployedBuild !== undefined) out.deployedBuild = incoming.deployedBuild;
  if (incoming.headless !== undefined) out.headless = incoming.headless;
  if (incoming.deviceChecked !== undefined) out.deviceChecked = incoming.deviceChecked;
  return out;
}

/** Evidence tier rules for `completed`: merged AND deployed, device state explicit. Returns problems. */
export function completedProblems(id, evidence) {
  const out = [];
  if (!evidence) return [`${id}: completed needs evidence (a merged PR and a deployed build)`];
  if (!(evidence.prs ?? []).some((p) => p.mergedSha)) out.push(`${id}: completed needs a merged PR (evidence.prs[].mergedSha); use review for open or unmerged work`);
  if (!evidence.deployedBuild && evidence.deviceChecked !== null) out.push(`${id}: completed needs evidence.deployedBuild (merged is not deployed); use review, or set deviceChecked null for work with no runtime surface`);
  if (typeof evidence.headless !== "boolean") out.push(`${id}: evidence.headless must be recorded`);
  if (evidence.deviceChecked === true && !evidence.checkedOn) out.push(`${id}: deviceChecked true needs checkedOn`);
  return out;
}

function renderUpdateLine(event, evidenceAfter, hasEvidence) {
  const tail = hasEvidence ? ` ${evidenceSentence(event.evidence, evidenceAfter)}` : "";
  return `${UPDATE_MARKER}${isoDay(event.ts)}: ${event.text.trim()}${tail}`.trimEnd();
}

/** Append a generated line and keep only the newest KEEP_UPDATE_LINES generated lines. */
export function appendUpdateLine(description, line) {
  const lines = description.match(UPDATE_LINE)?.map((l) => l.trim()) ?? [];
  const base = description.replace(UPDATE_LINE, "").trimEnd();
  const kept = [...lines, line].slice(-KEEP_UPDATE_LINES);
  return `${base} ${kept.join(" ")}`.trim();
}

const clone = (value) => JSON.parse(JSON.stringify(value));

export function recomputeProvenance(registry) {
  const items = registry.workItems;
  const completed = items.filter((c) => c.status === "completed").length;
  const deferred = items.filter((c) => c.status === "deferred_candidate").length;
  registry.provenance.stableIdentityCount = items.length;
  registry.provenance.completedCardCount = completed;
  registry.provenance.deferredCardCount = deferred;
  registry.provenance.openCardCount = items.length - completed - deferred;
}

/**
 * Fold events into copies of the registry and ledger.
 * @param {{registry: object, ledger: object, events: Array<{event: object, source?: string, line?: number}>, appliedIds?: Set<string>}} input
 * @returns {{registry, ledger, applied: object[], skipped: object[], errors: string[], warnings: string[], changes: object[]}}
 */
export function foldEvents({ registry: registryIn, ledger: ledgerIn, events, appliedIds = new Set() }) {
  const registry = clone(registryIn);
  const ledger = clone(ledgerIn);
  ledger.cards ??= {};
  const errors = [];
  const warnings = [];
  const skipped = [];
  const applied = [];
  const changes = new Map();
  const where = (item) => `${item.source ?? "events"}${item.line ? `:${item.line}` : ""}`;

  // 1. shape, id integrity, de-duplication
  const seen = new Map();
  const candidates = [];
  for (const item of events) {
    const event = item.event;
    const shape = validateEventShape(event);
    if (shape.length) { errors.push(...shape.map((e) => `${where(item)} ${event.card ?? "?"}: ${e}`)); continue; }
    const expected = eventId(event);
    if (event.id !== undefined && event.id !== expected) { errors.push(`${where(item)} ${event.card}: id ${event.id} does not match the content (${expected}); a recorded event was edited`); continue; }
    const id = expected;
    if (appliedIds.has(id)) { skipped.push({ id, card: event.card, reason: "already applied" }); continue; }
    if (seen.has(id)) { skipped.push({ id, card: event.card, reason: "duplicate in this run" }); continue; }
    seen.set(id, true);
    candidates.push({ ...item, event: { ...event, id } });
  }
  candidates.sort((a, b) => (a.event.ts < b.event.ts ? -1 : a.event.ts > b.event.ts ? 1 : 0));

  const byId = new Map(registry.workItems.map((card) => [card.id, card]));
  const record = (id) => { if (!changes.has(id)) changes.set(id, { card: id, from: byId.get(id)?.status ?? null, to: null, events: 0, created: false }); return changes.get(id); };

  // 2. fold in timestamp order
  for (const item of candidates) {
    const event = item.event;
    const problems = [];
    let card = byId.get(event.card);
    const creating = event.new !== undefined;
    if (creating) {
      if (card) problems.push("new card id already exists in the registry");
      for (const dep of event.new.dependencies ?? []) if (!byId.has(dep)) problems.push(`dependency ${dep} is not a registry card`);
      if (event.status === "completed") problems.push("a new card cannot be created as completed");
    } else if (!card) problems.push("card is not in the registry (create it with a `new` block)");
    if (problems.length) { errors.push(...problems.map((p) => `${where(item)} ${event.card}: ${p}`)); continue; }

    const entry0 = ledger.cards[event.card] ?? { evidence: null, blocker: null, verify: [], lane: null, filesHint: [] };
    const entry = clone(entry0);
    if (creating) {
      card = {
        id: event.card, status: event.status ?? "planning", updatedAt: normalizeTs(event.ts),
        sourceId: "mazer-owner-work-registry", sourceRef: `config/mazer-owner-work-registry.json#${event.card}`,
        title: event.new.title, description: event.new.description, cardType: event.new.cardType,
        priority: event.new.priority ?? null, dependencies: [...(event.new.dependencies ?? [])],
        acceptanceCriteria: [...event.new.acceptanceCriteria],
      };
    }
    const before = card.status;
    if (event.status && before === "completed" && event.status !== "completed" && !event.reopen) problems.push("completed cards do not move back without `reopen: true`");
    const next = { ...card };
    if (event.status) next.status = event.status;
    if (event.title) next.title = event.title;
    if (event.evidence) entry.evidence = mergeEvidence(entry.evidence, event.evidence);
    if (event.blocker !== undefined) entry.blocker = event.blocker === null ? null : { ...event.blocker };
    if (event.verify !== undefined) entry.verify = event.verify.map((s) => ({ ...s }));
    if (event.lane !== undefined) entry.lane = event.lane;
    if (event.note !== undefined) { if (event.note === null) delete entry.note; else entry.note = event.note; }
    if (event.status === "completed") {
      problems.push(...completedProblems(event.card, entry.evidence));
      if (event.blocker === undefined) entry.blocker = null;
      if (event.note === undefined) delete entry.note;
    }
    if (next.status === "blocked" && !entry.blocker) problems.push(`${event.card}: blocked needs a blocker (kind, unblockedBy, summary, ask)`);
    if (next.status === "review" && !entry.evidence && !event.evidence) warnings.push(`${where(item)} ${event.card}: review without any PR evidence`);
    if (card.updatedAt && normalizeTs(event.ts) < card.updatedAt && !creating) warnings.push(`${where(item)} ${event.card}: event is older than the card's updatedAt (${card.updatedAt}); applied anyway`);
    if (problems.length) { errors.push(...problems.map((p) => `${where(item)} ${p.startsWith(event.card) ? p : `${event.card}: ${p}`}`)); continue; }

    if (!creating) next.description = appendUpdateLine(card.description, renderUpdateLine(event, entry.evidence, Boolean(event.evidence)));
    next.updatedAt = normalizeTs(event.ts);
    if (creating) { registry.workItems.push(next); byId.set(next.id, next); }
    else { Object.assign(card, next); }
    ledger.cards[event.card] = entry;

    const change = record(event.card);
    change.to = next.status;
    change.events += 1;
    change.created = change.created || creating;
    if (event.evidence?.deployedBuild) change.deployedBuild = event.evidence.deployedBuild;
    for (const pr of event.evidence?.prs ?? []) (change.prs ??= []).push(pr.repo === "fawxzzy/mazer" ? `#${pr.number}` : `FawxzzyWeb#${pr.number}`);
    applied.push(event);
  }

  if (applied.length) {
    recomputeProvenance(registry);
    registry.updatedAt = applied.map((e) => normalizeTs(e.ts)).sort().at(-1);
  }
  return { registry, ledger, applied, skipped, errors, warnings, changes: [...changes.values()] };
}

/** Trigger policy: due when enough events or the oldest pending event is old enough. */
export const DEFAULT_POLICY = Object.freeze({ maxEvents: 12, maxDays: 7 });

export function dueStatus(pending, nowMs, policy = DEFAULT_POLICY) {
  const oldest = pending.map((e) => Date.parse(e.ts)).sort((a, b) => a - b)[0];
  const ageDays = oldest === undefined ? 0 : (nowMs - oldest) / 86_400_000;
  const reasons = [];
  if (pending.length >= policy.maxEvents) reasons.push(`${pending.length} pending events (limit ${policy.maxEvents})`);
  if (pending.length > 0 && ageDays >= policy.maxDays) reasons.push(`oldest pending event is ${ageDays.toFixed(1)} days old (limit ${policy.maxDays})`);
  return { due: reasons.length > 0, reasons, ageDays: oldest === undefined ? null : Number(ageDays.toFixed(1)) };
}
