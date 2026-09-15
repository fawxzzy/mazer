#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REGISTRY_PATH = "config/mazer-owner-work-registry.json";
const CURRENT_TRUTH_PATH = "docs/current-truth.md";
const ROADMAP_PATH = "docs/roadmap.md";
const MOBILE_PLAN_PATH = "docs/mobile-plan.md";
const ADAPTER_PATH = "scripts/export-project-board-owner.mjs";
const DEFAULT_OUTPUT_PATH = "exports/mazer.project-board.owner-export.v1.json";
const PROJECT_ID = "mazer";
const BOARD_ID = "discordos:project-feedback:mazer";
const OWNER = "mazer";
const ATLAS_PREFIX = "repos/mazer/";
const PUBLIC_STATUSES = new Map([
  ["active", { recordStatus: "active", lifecycle: "in-progress" }],
  ["in_progress", { recordStatus: "active", lifecycle: "in-progress" }],
  ["planning", { recordStatus: "candidate", lifecycle: "planning" }],
]);
const COMPLETED_STATUS = "completed";
const DEFERRED_CANDIDATE_STATUS = "deferred_candidate";
const ADMITTED_STATUSES = new Set([
  ...PUBLIC_STATUSES.keys(),
  COMPLETED_STATUS,
  DEFERRED_CANDIDATE_STATUS,
]);
const SOURCE_PATHS = Object.freeze({
  "mazer-owner-work-registry": { kind: "manual-registry", path: REGISTRY_PATH },
  "mazer-current-truth": { kind: "markdown", path: CURRENT_TRUTH_PATH },
  "mazer-roadmap": { kind: "markdown", path: ROADMAP_PATH },
  "mazer-mobile-plan": { kind: "markdown", path: MOBILE_PLAN_PATH },
  "mazer-owner-export-adapter": { kind: "generated", path: ADAPTER_PATH },
});

const normalize = (value) => String(value).replace(/\r\n?/g, "\n");
const digest = (value) => crypto.createHash("sha256").update(value).digest("hex");
const atlasPath = (value) => `${ATLAS_PREFIX}${value.replaceAll("\\", "/")}`;
const uniqueSorted = (values) => [...new Set(values)].sort((left, right) => left.localeCompare(right));

function requireString(value, label) {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${label} must be a non-empty string`);
  return value.trim();
}

function normalizeTimestamp(value, label) {
  const parsed = new Date(value);
  if (!value || Number.isNaN(parsed.getTime())) throw new Error(`${label} must be a valid timestamp`);
  return parsed.toISOString();
}

function githubHeadingBaseSlug(value) {
  return value
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]*>/g, "")
    .replace(/[`*_~]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\t\r\n]/g, " ")
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc}\- ]/gu, "")
    .replace(/ /g, "-");
}

function markdownHeadingAnchors(markdown) {
  const headings = [];
  const lines = normalize(markdown).split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const atx = lines[index].match(/^\s{0,3}#{1,6}(?:[ \t]+|$)(.*)$/);
    if (atx) {
      headings.push(atx[1].replace(/[ \t]+#+[ \t]*$/, "").trim());
      continue;
    }
    if (lines[index].trim() && index + 1 < lines.length && /^\s{0,3}(?:=+|-+)[ \t]*$/.test(lines[index + 1])) {
      headings.push(lines[index].trim());
      index += 1;
    }
  }
  const anchors = new Set();
  for (const heading of headings) {
    const base = githubHeadingBaseSlug(heading);
    if (!base) continue;
    let anchor = base;
    let suffix = 0;
    while (anchors.has(anchor)) anchor = `${base}-${++suffix}`;
    anchors.add(anchor);
  }
  return anchors;
}

function validateRegistry(registry, sourceBytes) {
  if (registry?.schemaVersion !== 1 || registry.projectId !== PROJECT_ID || registry.boardId !== BOARD_ID
    || registry.owner !== OWNER || registry.state !== "active") throw new Error("unexpected Mazer registry identity");
  if (!Array.isArray(registry.workItems) || registry.workItems.length !== registry.provenance?.stableIdentityCount) {
    throw new Error("Mazer stable identity denominator is incomplete");
  }
  const ids = registry.workItems.map((item) => item.id);
  if (new Set(ids).size !== ids.length || ids.some((id) => !/^MAZER-[A-Z0-9]+(?:-[A-Z0-9]+)*-[0-9]{3}$/.test(id))) {
    throw new Error("Mazer registry ids must be unique stable MAZER ids");
  }
  const stableIds = new Set(ids);
  const headingAnchorsBySource = new Map();
  const unsupportedStatus = registry.workItems.find((item) => !ADMITTED_STATUSES.has(item.status));
  if (unsupportedStatus) throw new Error(`${unsupportedStatus.id} has an unsupported lifecycle status`);
  const publicCount = registry.workItems.filter((item) => PUBLIC_STATUSES.has(item.status)).length;
  const completedCount = registry.workItems.filter((item) => item.status === COMPLETED_STATUS).length;
  const candidateCount = registry.workItems.filter((item) => item.status === DEFERRED_CANDIDATE_STATUS).length;
  if (publicCount !== registry.provenance.publicCardCount || completedCount !== registry.provenance.completedExcludedCount
    || candidateCount !== registry.provenance.candidateExcludedCount
    || publicCount + completedCount + candidateCount !== registry.workItems.length
    || publicCount + completedCount + candidateCount !== registry.provenance.stableIdentityCount
    || registry.provenance.researchCandidateImportCount !== 0
    || registry.provenance.discordosRole !== "provenance-and-board-identity-only") {
    throw new Error("Mazer owner reconciliation counts are inconsistent");
  }
  for (const item of registry.workItems) {
    requireString(item.id, "work item id");
    requireString(item.title, `${item.id}.title`);
    requireString(item.description, `${item.id}.description`);
    if (!SOURCE_PATHS[item.sourceId] || item.sourceId === "mazer-owner-export-adapter") throw new Error(`${item.id} has an unsupported source`);
    if (!item.sourceRef.startsWith(`${SOURCE_PATHS[item.sourceId].path}#`)) throw new Error(`${item.id} sourceRef is not bound to its source`);
    if (!Array.isArray(item.dependencies)) throw new Error(`${item.id}.dependencies must be an array`);
    for (const dependency of item.dependencies) {
      if (typeof dependency !== "string" || !stableIds.has(dependency)) throw new Error(`${item.id} depends on an unknown stable registry identity`);
      if (dependency === item.id) throw new Error(`${item.id} cannot depend on itself`);
    }
    if (SOURCE_PATHS[item.sourceId].kind === "markdown") {
      const fragment = item.sourceRef.slice(item.sourceRef.indexOf("#") + 1);
      if (!headingAnchorsBySource.has(item.sourceId)) {
        headingAnchorsBySource.set(item.sourceId, markdownHeadingAnchors(sourceBytes[item.sourceId]));
      }
      if (!fragment || !headingAnchorsBySource.get(item.sourceId).has(fragment)) {
        throw new Error(`${item.id} sourceRef fragment does not exist in its source document`);
      }
    }
    if (!Array.isArray(item.acceptanceCriteria) || item.acceptanceCriteria.length < 3) throw new Error(`${item.id} requires at least three acceptance criteria`);
  }
}

function mapCard(item) {
  const mapping = PUBLIC_STATUSES.get(item.status);
  if (!mapping) throw new Error(`cannot export non-public status ${item.status}`);
  const sourceRef = atlasPath(item.sourceRef);
  const normalizedId = item.id.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return {
    idempotency_key: `pbk_mazer_${normalizedId}_v1`,
    record_kind: "project-work",
    record_status: mapping.recordStatus,
    record: {
      contract_version: "atlas.card-record.v2",
      card_id: item.id,
      project_id: PROJECT_ID,
      board_id: BOARD_ID,
      title: item.title,
      description: item.description,
      card_type: item.cardType,
      lifecycle: mapping.lifecycle,
      priority: item.priority,
      owner: OWNER,
      dependencies: uniqueSorted(item.dependencies ?? []),
      board_version: 1,
      updated_at: normalizeTimestamp(item.updatedAt, `${item.id}.updatedAt`),
      source_ref: sourceRef,
      extensions: { owner_status: item.status, public_safe: true },
    },
    source: {
      source_id: item.sourceId,
      source_ref: sourceRef,
      source_status: "current",
      source_updated_at: normalizeTimestamp(item.updatedAt, `${item.id}.updatedAt`),
    },
    content: {
      summary: item.description,
      objective: item.description,
      acceptance_criteria: item.acceptanceCriteria.map((criterion) => requireString(criterion, `${item.id}.acceptanceCriteria`)),
      discoveries: [],
      next_actions: [],
      blockers: [],
      evidence: [atlasPath(SOURCE_PATHS[item.sourceId].path)],
    },
    relationships: { parent_card_id: null, duplicate_of: null, superseded_by: null },
  };
}

export function assertPublicSafety(exported) {
  const forbiddenKey = /(?:secret|credential|password|token|cookie|session_data|user_id|email|phone|message_id|thread_id|channel_id|supabase_key|service_role)/i;
  const sensitiveValues = [
    ["email address", /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i],
    ["authorization value", /\bbearer\s+[A-Z0-9._~+/=-]{8,}/i],
    ["sensitive query value", /https?:\/\/[^\s"']+\?[^\s"']*(?:token|key|secret|code|password|credential|session|cookie|email|phone|user_id)=/i],
    ["credential-like assignment", /\b(?:secret|credential|password|token|cookie|session(?:_data)?|supabase_key|service_role)\b\s*(?:=|:)\s*["']?[^\s"',;]{4,}/i],
    ["known secret format", /\b(?:gh[pousr]_[A-Z0-9]{20,}|github_pat_[A-Z0-9_]{20,}|sk-[A-Z0-9_-]{20,}|sb_secret_[A-Z0-9_-]{10,}|eyJ[A-Z0-9_-]{8,}\.[A-Z0-9_-]{8,}\.[A-Z0-9_-]{8,})\b/i],
  ];
  const visit = (value, location = "export") => {
    if (Array.isArray(value)) return value.forEach((entry, index) => visit(entry, `${location}[${index}]`));
    if (typeof value === "string") {
      for (const [label, pattern] of sensitiveValues) {
        if (pattern.test(value)) throw new Error(`public export contains sensitive ${label} at ${location}`);
      }
      return;
    }
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if (forbiddenKey.test(key)) throw new Error(`public export contains forbidden key ${location}.${key}`);
      visit(child, `${location}.${key}`);
    }
  };
  visit(exported);
  return true;
}

export function assertFawxzzyWebConsumerAcceptance(exported) {
  if (exported.contract_version !== "atlas.project-board.owner-export.v1" || exported.project_id !== PROJECT_ID
    || exported.board_id !== BOARD_ID || exported.owner !== OWNER) throw new Error("FawxzzyWeb owner-export identity mismatch");
  for (const card of exported.cards) {
    if (!card.record.card_id || !card.record.title || !card.content.summary || !card.record.lifecycle) {
      throw new Error("FawxzzyWeb public card fields are incomplete");
    }
    if (!["active", "candidate"].includes(card.record_status) || ["completed", "archived", "blocked"].includes(card.record.lifecycle)) {
      throw new Error("FawxzzyWeb received a non-public lifecycle");
    }
    if (card.record.extensions?.public_safe !== true || card.content.acceptance_criteria.length < 3) {
      throw new Error("FawxzzyWeb received an unqualified public card");
    }
  }
  return true;
}

export function buildProjectBoardOwnerExport(registry, sourceBytes) {
  for (const sourceId of Object.keys(SOURCE_PATHS)) {
    if (typeof sourceBytes[sourceId] !== "string") throw new Error(`missing source bytes for ${sourceId}`);
  }
  validateRegistry(registry, sourceBytes);
  const sourceRevision = `sha256:${digest(Object.keys(SOURCE_PATHS).map((sourceId) => normalize(sourceBytes[sourceId])).join("\n--MAZER-OWNER-SOURCE--\n"))}`;
  const generatedAt = normalizeTimestamp(registry.updatedAt, "registry.updatedAt");
  const cards = registry.workItems.filter((item) => PUBLIC_STATUSES.has(item.status)).map(mapCard)
    .sort((left, right) => left.record.card_id.localeCompare(right.record.card_id));
  const exported = {
    contract_version: "atlas.project-board.owner-export.v1",
    export_id: `pbe_mazer_owner_registry_${sourceRevision.slice(7, 19)}`,
    project_id: PROJECT_ID,
    board_id: BOARD_ID,
    owner: OWNER,
    adapter_id: "mazer-owner-registry-v1",
    source_revision: sourceRevision,
    generated_at: generatedAt,
    sources: Object.entries(SOURCE_PATHS).map(([sourceId, source]) => ({
      source_id: sourceId,
      kind: source.kind,
      repository: "mazer",
      path: atlasPath(source.path),
      revision: `sha256:${digest(normalize(sourceBytes[sourceId]))}`,
      observed_at: generatedAt,
    })),
    cards,
    extensions: {
      stable_identity_count: registry.provenance.stableIdentityCount,
      exported_public_card_count: cards.length,
      excluded_completed_card_count: registry.provenance.completedExcludedCount,
      excluded_deferred_candidate_count: registry.provenance.candidateExcludedCount,
      imported_research_candidate_count: registry.provenance.researchCandidateImportCount,
      research_candidate_exported_count: 0,
      discordos_role: registry.provenance.discordosRole,
      private_records_included: false,
      external_system_identifiers_included: false,
    },
  };
  if (cards.length !== registry.provenance.publicCardCount) throw new Error("Mazer public-card denominator is incomplete");
  assertPublicSafety(exported);
  assertFawxzzyWebConsumerAcceptance(exported);
  return exported;
}

export function readOwnerExportSources(repoRoot) {
  return Object.fromEntries(Object.entries(SOURCE_PATHS).map(([sourceId, source]) => [sourceId, fs.readFileSync(path.join(repoRoot, source.path), "utf8")]));
}

export function renderProjectBoardOwnerExport(repoRoot) {
  const sourceBytes = readOwnerExportSources(repoRoot);
  const registry = JSON.parse(sourceBytes["mazer-owner-work-registry"]);
  return `${JSON.stringify(buildProjectBoardOwnerExport(registry, sourceBytes), null, 2)}\n`;
}

export function runProjectBoardOwnerExport(argv, repoRoot = process.cwd()) {
  const check = argv.includes("--check");
  const unknown = argv.filter((argument) => argument !== "--check");
  if (unknown.length) throw new Error(`unknown argument: ${unknown[0]}`);
  const rendered = renderProjectBoardOwnerExport(repoRoot);
  const outputPath = path.join(repoRoot, DEFAULT_OUTPUT_PATH);
  if (check) {
    if (!fs.existsSync(outputPath) || normalize(fs.readFileSync(outputPath, "utf8")) !== normalize(rendered)) throw new Error(`${DEFAULT_OUTPUT_PATH} is stale`);
    process.stdout.write(`mazer-project-board-owner-export: ok (${JSON.parse(rendered).cards.length} cards)\n`);
    return;
  }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, rendered, "utf8");
  process.stdout.write(`mazer-project-board-owner-export: wrote ${DEFAULT_OUTPUT_PATH}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { runProjectBoardOwnerExport(process.argv.slice(2)); }
  catch (error) { console.error(`mazer-project-board-owner-export: ${error.message}`); process.exitCode = 1; }
}
