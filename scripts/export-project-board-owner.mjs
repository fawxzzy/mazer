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
const SUPPORTED_CARD_TYPES = new Set([
  "feature",
  "bug",
  "governance",
  "architecture",
  "documentation",
  "automation",
  "research",
  "migration",
  "reliability",
  "technical-debt",
]);
// Exact atlas.card-record.v2 priority enum, including its explicit nullable value.
const SUPPORTED_PRIORITIES = new Set(["critical", "high", "medium", "low", null]);
const COMMONMARK_HTML_BLOCK_TAGS = [
  "address", "article", "aside", "base", "basefont", "blockquote", "body", "caption", "center", "col", "colgroup",
  "dd", "details", "dialog", "dir", "div", "dl", "dt", "fieldset", "figcaption", "figure", "footer", "form",
  "frame", "frameset", "h1", "h2", "h3", "h4", "h5", "h6", "head", "header", "hr", "html", "iframe",
  "legend", "li", "link", "main", "menu", "menuitem", "nav", "noframes", "ol", "optgroup", "option", "p",
  "param", "search", "section", "summary", "table", "tbody", "td", "tfoot", "th", "thead", "title", "tr",
  "track", "ul",
].join("|");
const COMMONMARK_TYPE_6_START = new RegExp(`^ {0,3}</?(?:${COMMONMARK_HTML_BLOCK_TAGS})(?:[\\t >]|/>|$)`, "i");
const HTML_ATTRIBUTE_NAME = "[A-Za-z_:][A-Za-z0-9_.:-]*";
const HTML_ATTRIBUTE_VALUE = "(?:[^\\t\\n\\f\\r \\\"'=<>`]+|'[^']*'|\\\"[^\\\"]*\\\")";
const COMMONMARK_COMPLETE_OPEN_TAG = new RegExp(
  `^ {0,3}<[A-Za-z][A-Za-z0-9-]*(?:[ \\t]+${HTML_ATTRIBUTE_NAME}(?:[ \\t]*=[ \\t]*${HTML_ATTRIBUTE_VALUE})?)*[ \\t]*/?>[ \\t]*$`,
);
const COMMONMARK_COMPLETE_CLOSING_TAG = /^ {0,3}<\/[A-Za-z][A-Za-z0-9-]*[ \t]*>[ \t]*$/;
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
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    throw new Error(`${label} must be a canonical UTC timestamp`);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new Error(`${label} must be a canonical UTC timestamp`);
  }
  return value;
}

function githubHeadingBaseSlug(value) {
  return value
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]*>/g, "")
    .replace(/[`*~]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\t\r\n]/g, " ")
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc}\- ]/gu, "")
    .replace(/ /g, "-");
}

function maskMarkdownHtmlComments(line, inComment) {
  let masked = "";
  let cursor = 0;
  while (cursor < line.length) {
    if (inComment) {
      const end = line.indexOf("-->", cursor);
      if (end < 0) {
        masked += " ".repeat(line.length - cursor);
        return { masked, inComment: true };
      }
      masked += " ".repeat(end + 3 - cursor);
      cursor = end + 3;
      inComment = false;
      continue;
    }
    const start = line.indexOf("<!--", cursor);
    if (start < 0) {
      masked += line.slice(cursor);
      break;
    }
    masked += line.slice(cursor, start);
    cursor = start;
    inComment = true;
  }
  return { masked, inComment };
}

function isMarkdownType7Start(line) {
  return COMMONMARK_COMPLETE_OPEN_TAG.test(line) || COMMONMARK_COMPLETE_CLOSING_TAG.test(line);
}

function detectMarkdownRawHtmlBlock(line, allowType7) {
  const rawTextOpening = line.match(/^ {0,3}<(pre|script|style|textarea)(?:[\t >]|$)/i);
  if (rawTextOpening) {
    return { endPattern: new RegExp(`</${rawTextOpening[1]}\\s*>`, "i"), endOnBlank: false };
  }
  if (/^ {0,3}<!--/.test(line)) return { endPattern: /-->/, endOnBlank: false };
  if (/^ {0,3}<\?/.test(line)) return { endPattern: /\?>/, endOnBlank: false };
  if (/^ {0,3}<![A-Za-z]/.test(line)) return { endPattern: />/, endOnBlank: false };
  if (/^ {0,3}<!\[CDATA\[/.test(line)) return { endPattern: /\]\]>/, endOnBlank: false };
  if (COMMONMARK_TYPE_6_START.test(line)) return { endPattern: null, endOnBlank: true };
  if (allowType7 && isMarkdownType7Start(line)) {
    return { endPattern: null, endOnBlank: true };
  }
  return null;
}

function markdownIndentColumns(text, startColumn = 0) {
  let column = startColumn;
  for (const character of text) {
    column = character === "\t" ? column + (4 - (column % 4)) : column + 1;
  }
  return column - startColumn;
}

function parseMarkdownListItem(line, activeListContentIndent) {
  const indentation = line.match(/^[ \t]*/)?.[0] ?? "";
  const markerIndent = markdownIndentColumns(indentation);
  const isRootMarker = markerIndent <= 3;
  const isNestedMarker = activeListContentIndent !== null
    && markerIndent >= activeListContentIndent
    && markerIndent <= activeListContentIndent + 3;
  if (!isRootMarker && !isNestedMarker) return null;

  const markerMatch = line.slice(indentation.length)
    .match(/^(([*+-])|(\d{1,9})[.)])(?:(?:([ \t]+)(.*))|[ \t]*)$/);
  if (!markerMatch) return null;
  const marker = markerMatch[1];
  const followingWhitespace = markerMatch[4] ?? "";
  const itemContent = markerMatch[5] ?? "";
  const markerEndColumn = markerIndent + marker.length;
  const measuredFollowingIndent = markdownIndentColumns(followingWhitespace, markerEndColumn);
  const followingIndent = itemContent === "" ? 1 : measuredFollowingIndent > 4 ? 1 : measuredFollowingIndent;
  return {
    markerIndent,
    contentIndent: markerEndColumn + followingIndent,
    itemContent,
    canInterruptParagraph: itemContent.trim() !== ""
      && (markerMatch[2] !== undefined || markerMatch[3] === "1"),
  };
}

function nextMarkdownParagraphState(line, state) {
  if (/^\s*$/.test(line)) return { ...state, open: false };
  if (/^ {0,3}#{1,6}(?:[ \t]+|$)/.test(line)) return { ...state, open: false };
  if (state.open && /^ {0,3}(?:=+|-+)[ \t]*$/.test(line)) return { ...state, open: false };
  if (/^ {0,3}(?:(?:\*[ \t]*){3,}|(?:_[ \t]*){3,}|(?:-[ \t]*){3,})$/.test(line)) {
    return { ...state, open: false };
  }
  if (/^ {0,3}>/.test(line)) return { ...state, open: false };

  const listItem = parseMarkdownListItem(line, state.listContentIndent);
  if (listItem) {
    const exitsActiveListParagraph = state.listContentIndent !== null
      && listItem.markerIndent < state.listContentIndent;
    if (state.open && !exitsActiveListParagraph && !listItem.canInterruptParagraph) return state;
    if (state.open && state.listContentIndent === null && !listItem.canInterruptParagraph) return state;
    return {
      open: listItem.itemContent.trim() !== "",
      listContentIndent: listItem.contentIndent,
    };
  }

  const lineIndent = markdownIndentColumns(line.match(/^[ \t]*/)?.[0] ?? "");
  if (state.listContentIndent !== null) {
    if (state.open || lineIndent >= state.listContentIndent) return { ...state, open: true };
    return { open: true, listContentIndent: null };
  }
  if (lineIndent >= 4) return state;
  return { open: true, listContentIndent: null };
}

function maskMarkdownRawHtmlBlock(line, state, allowType7 = true) {
  const active = state ?? detectMarkdownRawHtmlBlock(line, allowType7);
  if (!active) return { masked: line, state: null, isBlock: false };
  if (active.endOnBlank && /^\s*$/.test(line)) return { masked: line, state: null, isBlock: false };
  const ended = active.endPattern?.test(line) ?? false;
  return {
    masked: " ".repeat(line.length),
    state: ended ? null : active,
    isBlock: true,
  };
}

function markdownHeadingAnchors(markdown) {
  const headings = [];
  const lines = normalize(markdown).split("\n");
  const renderedLines = [];
  let fence = null;
  let htmlComment = false;
  let rawHtmlBlock = null;
  let paragraphState = { open: false, listContentIndent: null };
  for (const rawLine of lines) {
    if (fence) {
      const fenceMatch = rawLine.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
      if (fenceMatch && fenceMatch[1][0] === fence.marker && fenceMatch[1].length >= fence.length
        && fenceMatch[2].trim() === "") fence = null;
      renderedLines.push(null);
      continue;
    }
    if (rawHtmlBlock) {
      const rawMasked = maskMarkdownRawHtmlBlock(rawLine, rawHtmlBlock);
      rawHtmlBlock = rawMasked.state;
      renderedLines.push(rawMasked.masked);
      if (!rawHtmlBlock && /^\s*$/.test(rawLine)) paragraphState = { ...paragraphState, open: false };
      continue;
    }
    if (htmlComment) {
      const commentMasked = maskMarkdownHtmlComments(rawLine, htmlComment);
      htmlComment = commentMasked.inComment;
      renderedLines.push(commentMasked.masked);
      if (!htmlComment && /^\s*$/.test(commentMasked.masked)) paragraphState = { ...paragraphState, open: false };
      continue;
    }
    const fenceMatch = rawLine.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (fenceMatch && (fenceMatch[1][0] === "~" || !fenceMatch[2].includes("`"))) {
      fence = { marker: fenceMatch[1][0], length: fenceMatch[1].length };
      renderedLines.push(null);
      paragraphState = { ...paragraphState, open: false };
      continue;
    }
    const rawIndent = markdownIndentColumns(rawLine.match(/^[ \t]*/)?.[0] ?? "");
    if (paragraphState.open && paragraphState.listContentIndent !== null
      && rawIndent < paragraphState.listContentIndent && isMarkdownType7Start(rawLine)) {
      paragraphState = { open: false, listContentIndent: null };
    }
    const rawMasked = maskMarkdownRawHtmlBlock(rawLine, null, !paragraphState.open);
    if (rawMasked.isBlock) {
      rawHtmlBlock = rawMasked.state;
      renderedLines.push(rawMasked.masked);
      paragraphState = { ...paragraphState, open: false };
      continue;
    }
    const commentMasked = maskMarkdownHtmlComments(rawLine, htmlComment);
    htmlComment = commentMasked.inComment;
    const visibleLine = commentMasked.masked;
    renderedLines.push(visibleLine);
    paragraphState = nextMarkdownParagraphState(visibleLine, paragraphState);
  }
  for (let index = 0; index < renderedLines.length; index += 1) {
    const line = renderedLines[index];
    if (!line || /^(?: {4}|\t)/.test(line)) continue;
    const atx = line.match(/^\s{0,3}#{1,6}(?:[ \t]+|$)(.*)$/);
    if (atx) {
      headings.push(atx[1].replace(/[ \t]+#+[ \t]*$/, "").trim());
      continue;
    }
    const next = renderedLines[index + 1];
    if (line.trim() && next && /^\s{0,3}(?:=+|-+)[ \t]*$/.test(next)) {
      headings.push(line.trim());
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
  for (const item of registry.workItems) {
    requireString(item.id, "work item id");
    requireString(item.title, `${item.id}.title`);
    requireString(item.description, `${item.id}.description`);
    normalizeTimestamp(item.updatedAt, `${item.id}.updatedAt`);
    if (!ADMITTED_STATUSES.has(item.status)) throw new Error(`${item.id} has an unsupported lifecycle status`);
    if (typeof item.cardType !== "string" || !SUPPORTED_CARD_TYPES.has(item.cardType)) {
      throw new Error(`${item.id}.cardType must be a supported atlas.card-record.v2 card type`);
    }
    if (!SUPPORTED_PRIORITIES.has(item.priority)) {
      throw new Error(`${item.id}.priority must match the atlas.card-record.v2 priority enum`);
    }
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
  const dependencyGraph = new Map(registry.workItems.map((item) => [item.id, uniqueSorted(item.dependencies)]));
  const visiting = new Set();
  const visited = new Set();
  const visit = (id) => {
    if (visiting.has(id)) throw new Error("Mazer registry dependency graph must be acyclic");
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of dependencyGraph.get(id)) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of stableIds) visit(id);
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
    ["PEM private key", /-{5}[ \t]*BEGIN[ \t]+(?:[A-Z0-9]+[ \t]+)*PRIVATE[ \t]+KEY(?:[ \t]+BLOCK)?[ \t]*-{5}/i],
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
    const expectedBytes = Buffer.from(rendered, "utf8");
    if (!fs.existsSync(outputPath) || !fs.readFileSync(outputPath).equals(expectedBytes)) throw new Error(`${DEFAULT_OUTPUT_PATH} is stale`);
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
