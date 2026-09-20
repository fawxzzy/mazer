#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

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
// Complete semicolon-terminated WHATWG named-character-reference table used by
// CommonMark 0.31.2 (2,125 names; decoded JSON SHA-256
// 71c1137e74b6cf94dbc75855e4cb7eb69db1b378663efb6b02107af80c976bcd).
const COMMONMARK_NAMED_CHARACTER_REFERENCES = Object.freeze(JSON.parse(gunzipSync(Buffer.from(`
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
`.replace(/\s/g, ""), "base64")).toString("utf8")));
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

function isMarkdownWhitespace(character) {
  return character === undefined || /\s/u.test(character);
}

function isMarkdownPunctuation(character) {
  return character !== undefined && /[\p{P}\p{S}]/u.test(character);
}

function stripMarkdownEmphasis(value) {
  const characters = [...value];
  const runs = [];
  for (let index = 0; index < characters.length;) {
    const marker = characters[index];
    if ((marker !== "*" && marker !== "_") || characters[index - 1] === "\\") {
      index += 1;
      continue;
    }
    let end = index + 1;
    while (characters[end] === marker) end += 1;
    const previous = characters[index - 1];
    const next = characters[end];
    const leftFlanking = !isMarkdownWhitespace(next)
      && (!isMarkdownPunctuation(next) || isMarkdownWhitespace(previous) || isMarkdownPunctuation(previous));
    const rightFlanking = !isMarkdownWhitespace(previous)
      && (!isMarkdownPunctuation(previous) || isMarkdownWhitespace(next) || isMarkdownPunctuation(next));
    runs.push({
      marker,
      start: index,
      end,
      length: end - index,
      remaining: end - index,
      canOpen: marker === "*" ? leftFlanking : leftFlanking && (!rightFlanking || isMarkdownPunctuation(previous)),
      canClose: marker === "*" ? rightFlanking : rightFlanking && (!leftFlanking || isMarkdownPunctuation(next)),
    });
    index = end;
  }

  const removed = new Set();
  for (let closerIndex = 0; closerIndex < runs.length; closerIndex += 1) {
    const closer = runs[closerIndex];
    if (!closer.canClose) continue;
    for (let openerIndex = closerIndex - 1; openerIndex >= 0 && closer.remaining > 0; openerIndex -= 1) {
      const opener = runs[openerIndex];
      if (!opener.canOpen || opener.marker !== closer.marker || opener.remaining === 0) continue;
      while (opener.remaining > 0 && closer.remaining > 0) {
        const oneCanBoth = (opener.canClose || closer.canOpen);
        const blockedByRuleOfThree = oneCanBoth
          && (opener.remaining + closer.remaining) % 3 === 0
          && (opener.remaining % 3 !== 0 || closer.remaining % 3 !== 0);
        if (blockedByRuleOfThree) break;
        const used = opener.remaining >= 2 && closer.remaining >= 2 ? 2 : 1;
        for (let offset = 0; offset < used; offset += 1) {
          removed.add(opener.end - opener.length + opener.remaining - 1 - offset);
          removed.add(closer.start + closer.length - closer.remaining + offset);
        }
        opener.remaining -= used;
        closer.remaining -= used;
      }
    }
  }
  return characters.filter((_, index) => !removed.has(index)).join("");
}

function normalizeMarkdownCodeSpanContent(value) {
  const normalized = value.replace(/\r\n?|\n/g, " ");
  return normalized.startsWith(" ") && normalized.endsWith(" ") && /[^ ]/.test(normalized)
    ? normalized.slice(1, -1)
    : normalized;
}

function isEscapedMarkdownDelimiter(value, index) {
  let backslashes = 0;
  for (let cursor = index - 1; cursor >= 0 && value[cursor] === "\\"; cursor -= 1) backslashes += 1;
  return backslashes % 2 === 1;
}

function protectMarkdownCodeSpans(value, protect) {
  let rendered = "";
  let index = 0;
  while (index < value.length) {
    if (value[index] !== "`" || isEscapedMarkdownDelimiter(value, index)) {
      rendered += value[index];
      index += 1;
      continue;
    }
    let openerEnd = index + 1;
    while (value[openerEnd] === "`") openerEnd += 1;
    const markerLength = openerEnd - index;
    let closing = -1;
    let cursor = openerEnd;
    while (cursor < value.length) {
      const candidate = value.indexOf("`", cursor);
      if (candidate < 0) break;
      let candidateEnd = candidate + 1;
      while (value[candidateEnd] === "`") candidateEnd += 1;
      if (candidateEnd - candidate === markerLength) {
        closing = candidate;
        break;
      }
      cursor = candidateEnd;
    }
    if (closing < 0) {
      rendered += value.slice(index, openerEnd);
      index = openerEnd;
      continue;
    }
    rendered += protect(normalizeMarkdownCodeSpanContent(value.slice(openerEnd, closing)));
    index = closing + markerLength;
  }
  return rendered;
}

function decodeCommonMarkCharacterReferences(value) {
  return value.replace(
    /&(?:#([0-9]{1,7})|#[xX]([0-9A-Fa-f]{1,6})|([A-Za-z][A-Za-z0-9]{0,30}));/g,
    (match, decimal, hexadecimal, named) => {
      if (named !== undefined) return COMMONMARK_NAMED_CHARACTER_REFERENCES[named] ?? match;
      const codePoint = Number.parseInt(decimal ?? hexadecimal, decimal === undefined ? 16 : 10);
      if (codePoint === 0 || codePoint > 0x10FFFF || (codePoint >= 0xD800 && codePoint <= 0xDFFF)) {
        return "\uFFFD";
      }
      return String.fromCodePoint(codePoint);
    },
  );
}

function normalizeMarkdownReferenceLabel(value) {
  return decodeCommonMarkCharacterReferences(value)
    .replace(/\\([!-/:-@[-`{-~])/g, "$1")
    .replace(/[ \t\r\n]+/g, " ")
    .trim()
    .toLowerCase();
}

function isValidBareMarkdownLinkDestination(value) {
  if (!value || /[\u0000-\u0020\u007f]/.test(value)) return false;
  let depth = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === "\\" && /[!-/:-@[-`{-~]/.test(value[index + 1] ?? "")) {
      index += 1;
      continue;
    }
    if (value[index] === "(") depth += 1;
    if (value[index] === ")" && --depth < 0) return false;
  }
  return depth === 0;
}

function isValidMarkdownReferenceDestination(value) {
  const normalized = value.trim();
  if (normalized === "") return false;
  const separator = normalized.search(/[ \t]/);
  const destination = separator < 0 ? normalized : normalized.slice(0, separator);
  const title = separator < 0 ? "" : normalized.slice(separator).trim();
  const validDestination = destination.startsWith("<")
    ? /^<[^<>\n]*>$/.test(destination)
    : isValidBareMarkdownLinkDestination(destination);
  return validDestination && (title === "" || /^(?:"[^"\n]*"|'[^'\n]*'|\([^\)\n]*\))$/.test(title));
}

function markdownReferenceLabels(lines) {
  const labels = new Set();
  const definitionStart = /^ {0,3}\[([^\]\n]+)\]:[ \t]*(.*)$/;
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index]?.match(definitionStart);
    if (!match) continue;
    const sameLineDestination = match[2].trim();
    const nextLineDestination = sameLineDestination === "" ? lines[index + 1]?.trim() : null;
    if (!isValidMarkdownReferenceDestination(sameLineDestination || nextLineDestination || "")) continue;
    const label = normalizeMarkdownReferenceLabel(match[1]);
    if (label) labels.add(label);
  }
  return labels;
}

function parseMarkdownBracketedText(value, opening) {
  if (value[opening] !== "[") return null;
  let depth = 1;
  for (let index = opening + 1; index < value.length; index += 1) {
    if (value[index] === "\\" && /[!-/:-@[-`{-~]/.test(value[index + 1] ?? "")) {
      index += 1;
      continue;
    }
    if (value[index] === "[") depth += 1;
    if (value[index] === "]" && --depth === 0) {
      return { content: value.slice(opening + 1, index), end: index + 1 };
    }
  }
  return null;
}

function renderMarkdownReferenceLinks(value, referenceLabels, protect) {
  let rendered = "";
  let cursor = 0;
  while (cursor < value.length) {
    const openingBracket = value.indexOf("[", cursor);
    if (openingBracket < 0) return rendered + value.slice(cursor);
    const imageMarker = openingBracket > 0 && value[openingBracket - 1] === "!" ? "!" : "";
    const matchStart = openingBracket - imageMarker.length;
    rendered += value.slice(cursor, matchStart);
    if (isEscapedMarkdownDelimiter(value, openingBracket)) {
      rendered += value.slice(matchStart, openingBracket + 1);
      cursor = openingBracket + 1;
      continue;
    }
    const label = parseMarkdownBracketedText(value, openingBracket);
    if (!label || label.content.includes("\n")) {
      rendered += value.slice(matchStart, openingBracket + 1);
      cursor = openingBracket + 1;
      continue;
    }
    const explicitLabel = value[label.end] === "[" ? parseMarkdownBracketedText(value, label.end) : null;
    const matchEnd = explicitLabel?.end ?? label.end;
    const referenceLabel = explicitLabel
      ? (explicitLabel.content === "" ? label.content : explicitLabel.content)
      : label.content;
    const resolved = !explicitLabel?.content.includes("\n")
      && referenceLabels.has(normalizeMarkdownReferenceLabel(referenceLabel));
    const match = value.slice(matchStart, matchEnd);
    rendered += resolved ? label.content : (explicitLabel ? protect(match) : match);
    cursor = matchEnd;
  }
  return rendered;
}

const COMMONMARK_INLINE_OPEN_TAG = new RegExp(
  `^<[A-Za-z][A-Za-z0-9-]*(?:[ \\t]+${HTML_ATTRIBUTE_NAME}(?:[ \\t]*=[ \\t]*${HTML_ATTRIBUTE_VALUE})?)*[ \\t]*/?>`,
);
const COMMONMARK_INLINE_CLOSING_TAG = /^<\/[A-Za-z][A-Za-z0-9-]*[ \t]*>/;

function markdownInlineHtmlEnd(value, opening) {
  const suffix = value.slice(opening);
  if (suffix.startsWith("<!-->")) return opening + 5;
  if (suffix.startsWith("<!--->")) return opening + 6;
  if (suffix.startsWith("<!--")) {
    const closing = value.indexOf("-->", opening + 4);
    if (closing < 0) return null;
    const content = value.slice(opening + 4, closing);
    return content.startsWith(">") || content.startsWith("->") || content.endsWith("-") || content.includes("--")
      ? null
      : closing + 3;
  }
  for (const [prefix, terminator] of [["<![CDATA[", "]]>"], ["<?", "?>"]]) {
    if (!suffix.startsWith(prefix)) continue;
    const closing = value.indexOf(terminator, opening + prefix.length);
    return closing < 0 ? null : closing + terminator.length;
  }
  const declaration = suffix.match(/^<![A-Z]+[ \t]+[^>]*>/);
  if (declaration) return opening + declaration[0].length;
  const tag = suffix.match(COMMONMARK_INLINE_OPEN_TAG) ?? suffix.match(COMMONMARK_INLINE_CLOSING_TAG);
  return tag ? opening + tag[0].length : null;
}

function stripMarkdownInlineHtml(value) {
  let rendered = "";
  let cursor = 0;
  while (cursor < value.length) {
    const opening = value.indexOf("<", cursor);
    if (opening < 0) return rendered + value.slice(cursor);
    rendered += value.slice(cursor, opening);
    if (isEscapedMarkdownDelimiter(value, opening)) {
      rendered += "<";
      cursor = opening + 1;
      continue;
    }
    const closing = markdownInlineHtmlEnd(value, opening);
    if (closing === null) {
      rendered += "<";
      cursor = opening + 1;
      continue;
    }
    cursor = closing;
  }
  return rendered;
}

function renderedMarkdownHeadingText(value, referenceLabels) {
  const protectedText = [];
  const protect = (text) => {
    const token = `\uE000${protectedText.length}\uE001`;
    protectedText.push(text);
    return token;
  };
  let rendered = protectMarkdownCodeSpans(value, protect)
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
  rendered = renderMarkdownReferenceLinks(rendered, referenceLabels, protect);
  rendered = stripMarkdownInlineHtml(rendered)
    .replace(/\\([!-/:-@[-`{-~])/g, (_match, escaped) => protect(escaped));
  rendered = decodeCommonMarkCharacterReferences(stripMarkdownEmphasis(rendered).replace(/~/g, ""));
  return rendered.replace(/\uE000(\d+)\uE001/g, (_match, index) => protectedText[Number(index)]);
}

function githubHeadingBaseSlug(value, referenceLabels) {
  return renderedMarkdownHeadingText(value, referenceLabels)
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

function canLazilyContinueBlockQuoteParagraph(line) {
  if (/^\s*$/.test(line)) return false;
  if (markdownIndentColumns(line.match(/^[ \t]*/)?.[0] ?? "") >= 4) return true;
  return !startsMarkdownBlockOutsideTable(line);
}

function hasValidInlineCommentCloseWithinParagraph(lines, sourceIndex, rawLine, quoteDepth, containerView) {
  const opening = rawLine.lastIndexOf("<!--");
  if (opening < 0) return false;
  let comment = rawLine.slice(opening);
  for (let index = sourceIndex + 1; index < lines.length; index += 1) {
    const parsedQuoteView = markdownBlockQuoteContainerView(lines[index]);
    const isLazyQuoteContinuation = parsedQuoteView.depth < quoteDepth
      && canLazilyContinueBlockQuoteParagraph(parsedQuoteView.line);
    const continuationLine = isLazyQuoteContinuation
      && markdownIndentColumns(parsedQuoteView.line.match(/^[ \t]*/)?.[0] ?? "") >= 4
      ? stripMarkdownIndent(parsedQuoteView.line, 4)
      : parsedQuoteView.line;
    const effectiveQuoteDepth = isLazyQuoteContinuation ? quoteDepth : parsedQuoteView.depth;
    if (effectiveQuoteDepth !== quoteDepth || /^\s*$/.test(parsedQuoteView.line)) return false;
    const continuationView = markdownListContainerView(
      continuationLine,
      containerView.listContentIndent,
      containerView.listContentIndents,
    );
    const exitsOwningList = containerView.listContentIndent !== null
      && continuationView.startsNewListItem
      && continuationView.firstListMarkerIndent < containerView.listContentIndent;
    if (continuationView.startsNewListItem && (continuationView.canInterruptParagraph || exitsOwningList)) return false;
    if (startsMarkdownBlockOutsideTable(continuationView.line)) return false;
    comment += `\n${continuationLine}`;
    if (continuationLine.includes("-->")) return markdownInlineHtmlEnd(comment, 0) !== null;
  }
  return false;
}

function isMarkdownType7Start(line) {
  return COMMONMARK_COMPLETE_OPEN_TAG.test(line) || COMMONMARK_COMPLETE_CLOSING_TAG.test(line);
}

function detectMarkdownRawHtmlBlock(line, allowType7) {
  const rawTextOpening = line.match(/^ {0,3}<(pre|script|style|textarea)(?:[\t >]|$)/i);
  if (rawTextOpening) {
    return { endPattern: new RegExp(`</${rawTextOpening[1]}>`, "i"), endOnBlank: false };
  }
  if (/^ {0,3}<!--/.test(line)) return { endPattern: /-->/, endOnBlank: false };
  if (/^ {0,3}<\?/.test(line)) return { endPattern: /\?>/, endOnBlank: false };
  if (/^ {0,3}<![A-Z]/.test(line)) return { endPattern: />/, endOnBlank: false };
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

function markdownHeadingLine(line) {
  const indentation = line.match(/^[ \t]*/)?.[0] ?? "";
  return markdownIndentColumns(indentation) <= 3 ? line : null;
}

function markdownBlockQuoteContainerView(line, maximumDepth = Number.POSITIVE_INFINITY) {
  let projected = line;
  let depth = 0;
  while (depth < maximumDepth) {
    const marker = projected.match(/^ {0,3}>[ \t]?/);
    if (!marker) break;
    projected = projected.slice(marker[0].length);
    depth += 1;
  }
  return { line: projected, depth };
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
    startsWithIndentedCode: itemContent !== "" && measuredFollowingIndent > 4,
    canInterruptParagraph: itemContent.trim() !== ""
      && (markerMatch[2] !== undefined || markerMatch[3] === "1"),
  };
}

function nextMarkdownParagraphState(line, state, containerView = null) {
  if (/^\s*$/.test(line)) return { ...state, open: false };
  if (containerView?.startsNewListItem) {
    const exitsActiveListParagraph = state.listContentIndent !== null
      && containerView.firstListMarkerIndent < state.listContentIndent;
    if (state.open && !exitsActiveListParagraph && !containerView.canInterruptParagraph) return state;
    if (state.open && state.listContentIndent === null && !containerView.canInterruptParagraph) return state;
    const nextState = {
      ...state,
      listContentIndent: containerView.listContentIndent,
      listContentIndents: containerView.listContentIndents,
    };
    if (containerView.startsWithIndentedCode
      || /^ {0,3}#{1,6}(?:[ \t]+|$)/.test(line)
      || /^ {0,3}(?:(?:\*[ \t]*){3,}|(?:_[ \t]*){3,}|(?:-[ \t]*){3,})$/.test(line)
      || /^ {0,3}>/.test(line)) return { ...nextState, open: false };
    return { ...nextState, open: line.trim() !== "" };
  }
  if (containerView?.listContentIndent !== null) {
    const nextState = {
      ...state,
      listContentIndent: containerView.listContentIndent,
      listContentIndents: containerView.listContentIndents,
    };
    if (containerView.startsWithIndentedCode
      || /^ {0,3}#{1,6}(?:[ \t]+|$)/.test(line)
      || (state.open && /^ {0,3}(?:=+|-+)[ \t]*$/.test(line))
      || /^ {0,3}(?:(?:\*[ \t]*){3,}|(?:_[ \t]*){3,}|(?:-[ \t]*){3,})$/.test(line)
      || /^ {0,3}>/.test(line)) return { ...nextState, open: false };
    return { ...nextState, open: true };
  }
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
    const listContentIndents = (state.listContentIndents ?? [])
      .filter((indent) => indent <= listItem.markerIndent && indent < listItem.contentIndent);
    listContentIndents.push(listItem.contentIndent);
    return {
      ...state,
      open: listItem.itemContent.trim() !== "" && !listItem.startsWithIndentedCode,
      listContentIndent: listItem.contentIndent,
      listContentIndents,
    };
  }

  const lineIndent = markdownIndentColumns(line.match(/^[ \t]*/)?.[0] ?? "");
  if (state.listContentIndent !== null) {
    if (state.open || lineIndent >= state.listContentIndent) return { ...state, open: true };
    const listContentIndents = (state.listContentIndents ?? []).filter((indent) => indent <= lineIndent);
    return { ...state, open: true, listContentIndent: listContentIndents.at(-1) ?? null, listContentIndents };
  }
  if (lineIndent >= 4) return state;
  return { ...state, open: true, listContentIndent: null, listContentIndents: [] };
}

function splitGfmTableRow(line) {
  if (!/^ {0,3}\S/.test(line)) return null;
  const trimmed = line.trim();
  let escaped = false;
  let hasSeparator = false;
  let cell = "";
  const cells = [];
  for (const character of trimmed) {
    if (escaped) {
      cell += character;
      escaped = false;
      continue;
    }
    if (character === "\\") {
      cell += character;
      escaped = true;
      continue;
    }
    if (character === "|") {
      cells.push(cell.trim());
      cell = "";
      hasSeparator = true;
      continue;
    }
    cell += character;
  }
  cells.push(cell.trim());
  if (!hasSeparator) return null;
  if (cells[0] === "") cells.shift();
  if (cells.at(-1) === "") cells.pop();
  return cells.length > 0 ? cells : null;
}

function gfmTableColumnCount(headerLine, delimiterLine) {
  const header = splitGfmTableRow(headerLine);
  const delimiter = splitGfmTableRow(delimiterLine);
  if (!header || !delimiter || header.length !== delimiter.length) return null;
  return delimiter.every((cell) => /^:?-+:?$/.test(cell)) ? delimiter.length : null;
}

function stripMarkdownIndent(line, columns) {
  let consumedColumns = 0;
  let index = 0;
  while (index < line.length && consumedColumns < columns && (line[index] === " " || line[index] === "\t")) {
    const width = line[index] === "\t" ? 4 - (consumedColumns % 4) : 1;
    consumedColumns += width;
    index += 1;
  }
  const remainder = line.slice(index);
  const remainingIndentation = remainder.match(/^[ \t]*/)?.[0] ?? "";
  const remainingColumns = markdownIndentColumns(remainingIndentation, consumedColumns);
  return `${" ".repeat(Math.max(0, consumedColumns - columns) + remainingColumns)}${remainder.slice(remainingIndentation.length)}`;
}

function markdownListContainerView(
  line,
  activeListContentIndent,
  activeListContentIndents = [],
  projectedBaseIndentOverride = null,
) {
  let candidate = line;
  let startsNewListItem = false;
  let canInterruptParagraph = false;
  let firstListMarkerIndent = null;
  let projectedBaseIndent = projectedBaseIndentOverride ?? 0;
  const lineIndent = markdownIndentColumns(line.match(/^[ \t]*/)?.[0] ?? "");
  let listContentIndents = projectedBaseIndentOverride === null
    ? activeListContentIndents.filter((indent) => indent <= lineIndent)
    : [...activeListContentIndents];
  if (projectedBaseIndentOverride === null) {
    const survivingListContentIndent = listContentIndents.at(-1)
      ?? (activeListContentIndent !== null && activeListContentIndent <= lineIndent ? activeListContentIndent : null);
    if (survivingListContentIndent !== null) {
      candidate = stripMarkdownIndent(line, survivingListContentIndent);
      projectedBaseIndent = survivingListContentIndent;
    }
  }
  while (true) {
    const listItem = parseMarkdownListItem(candidate, null);
    if (!listItem) break;
    startsNewListItem = true;
    firstListMarkerIndent ??= projectedBaseIndent + listItem.markerIndent;
    canInterruptParagraph ||= listItem.canInterruptParagraph;
    const listContentIndent = projectedBaseIndent + listItem.contentIndent;
    listContentIndents = listContentIndents.filter((indent) => indent < listContentIndent);
    listContentIndents.push(listContentIndent);
    projectedBaseIndent = listContentIndent;
    if (listItem.startsWithIndentedCode) {
      return {
        line: candidate,
        listContentIndent,
        listContentIndents,
        startsNewListItem,
        firstListMarkerIndent,
        canInterruptParagraph,
        startsWithIndentedCode: true,
      };
    }
    const nextCandidate = listItem.itemContent;
    if (nextCandidate.length >= candidate.length) throw new Error("list-container projection made no progress");
    candidate = nextCandidate;
  }
  return {
    line: candidate,
    listContentIndent: listContentIndents.at(-1) ?? null,
    listContentIndents,
    startsNewListItem,
    firstListMarkerIndent,
    canInterruptParagraph,
    startsWithIndentedCode: false,
  };
}

function markdownListBlockQuoteContainerView(line, activeListContentIndent, activeListContentIndents = []) {
  let listView = markdownListContainerView(line, activeListContentIndent, activeListContentIndents);
  const containerPath = [];
  let priorListIndent = 0;
  if (listView.listContentIndent !== null) {
    containerPath.push({ kind: "list", columns: listView.listContentIndent });
    priorListIndent = listView.listContentIndent;
  }
  let nestedQuoteDepth = 0;
  while (!listView.startsWithIndentedCode) {
    const quoteView = markdownBlockQuoteContainerView(listView.line);
    if (quoteView.depth === 0) break;
    containerPath.push({ kind: "quote", depth: quoteView.depth });
    nestedQuoteDepth += quoteView.depth;
    const nextListView = markdownListContainerView(
      quoteView.line,
      listView.listContentIndent,
      listView.listContentIndents,
      listView.listContentIndent ?? 0,
    );
    const nextListIndent = nextListView.listContentIndent ?? priorListIndent;
    if (nextListIndent > priorListIndent) {
      containerPath.push({ kind: "list", columns: nextListIndent - priorListIndent });
      priorListIndent = nextListIndent;
    }
    listView = {
      ...nextListView,
      startsNewListItem: listView.startsNewListItem || nextListView.startsNewListItem,
      firstListMarkerIndent: listView.firstListMarkerIndent ?? nextListView.firstListMarkerIndent,
      canInterruptParagraph: listView.canInterruptParagraph || nextListView.canInterruptParagraph,
    };
  }
  return { ...listView, nestedQuoteDepth, containerPath };
}

function markdownActiveBlockContainerView(
  sourceLine,
  rootQuoteDepth,
  containerPath,
  lazyQuoteDepth = null,
) {
  const rootQuoteView = markdownBlockQuoteContainerView(sourceLine, rootQuoteDepth);
  const totalNestedQuoteDepth = containerPath
    .filter((entry) => entry.kind === "quote")
    .reduce((total, entry) => total + entry.depth, 0);
  const retainsLazyContainers = lazyQuoteDepth === rootQuoteDepth + totalNestedQuoteDepth;
  let projected = rootQuoteView.line;
  let retainsContainers = rootQuoteView.depth === rootQuoteDepth || retainsLazyContainers;
  for (const entry of containerPath) {
    if (entry.kind === "list") {
      const blank = /^\s*$/.test(projected);
      const lineIndent = markdownIndentColumns(projected.match(/^[ \t]*/)?.[0] ?? "");
      if (!blank && lineIndent >= entry.columns) projected = stripMarkdownIndent(projected, entry.columns);
      else if (!blank && !retainsLazyContainers) retainsContainers = false;
      continue;
    }
    const quoteView = markdownBlockQuoteContainerView(projected, entry.depth);
    projected = quoteView.line;
    if (quoteView.depth !== entry.depth && !retainsLazyContainers) retainsContainers = false;
  }
  return {
    line: projected,
    retainsContainers,
  };
}

function markdownFenceContainerView(line, listContentIndent) {
  if (listContentIndent === null) return line;
  const lineIndent = markdownIndentColumns(line.match(/^[ \t]*/)?.[0] ?? "");
  return lineIndent >= listContentIndent ? stripMarkdownIndent(line, listContentIndent) : line;
}

function startsMarkdownBlockOutsideTable(line) {
  if (/^\s*$/.test(line)) return true;
  if (/^ {0,3}#{1,6}(?:[ \t]+|$)/.test(line)) return true;
  if (/^ {0,3}(?:`{3,}|~{3,})/.test(line)) return true;
  if (/^ {0,3}(?:(?:\*[ \t]*){3,}|(?:_[ \t]*){3,}|(?:-[ \t]*){3,})$/.test(line)) return true;
  if (/^ {0,3}>/.test(line)) return true;
  if (parseMarkdownListItem(line, null)) return true;
  if (markdownIndentColumns(line.match(/^[ \t]*/)?.[0] ?? "") >= 4) return true;
  return detectMarkdownRawHtmlBlock(line, true) !== null;
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
  const renderedHeadingLines = [];
  const renderedHeadingBlocks = [];
  const setextUnderlineIndexes = new Set();
  const paragraphOnlyHeadingIndexes = new Set();
  const referenceDefinitionLines = [];
  let fence = null;
  let htmlCommentState = null;
  let rawHtmlBlock = null;
  let gfmTableColumns = null;
  let previousTableLine = null;
  let previousTableBlock = null;
  let paragraphBlockSerial = 0;
  let paragraphState = { open: false, listContentIndent: null, listContentIndents: [], quoteDepth: 0 };
  for (let sourceIndex = 0; sourceIndex < lines.length; sourceIndex += 1) {
    const sourceLine = lines[sourceIndex];
    const sourceIndent = markdownIndentColumns(sourceLine.match(/^[ \t]*/)?.[0] ?? "");
    const parsedQuoteView = paragraphState.listContentIndent !== null
      && sourceIndent >= paragraphState.listContentIndent
      ? { line: sourceLine, depth: 0 }
      : markdownBlockQuoteContainerView(sourceLine);
    const isLazyQuoteContinuation = paragraphState.open
      && parsedQuoteView.depth < paragraphState.quoteDepth
      && canLazilyContinueBlockQuoteParagraph(parsedQuoteView.line);
    const lazyQuoteLine = isLazyQuoteContinuation
      && markdownIndentColumns(parsedQuoteView.line.match(/^[ \t]*/)?.[0] ?? "") >= 4
      ? stripMarkdownIndent(parsedQuoteView.line, 4)
      : parsedQuoteView.line;
    const quoteView = isLazyQuoteContinuation
      ? { ...parsedQuoteView, line: lazyQuoteLine, depth: paragraphState.quoteDepth, lazy: true }
      : { ...parsedQuoteView, lazy: false };
    let rawLine = quoteView.line;
    if (fence) {
      const activeView = markdownActiveBlockContainerView(
        sourceLine,
        fence.rootQuoteDepth,
        fence.containerPath,
      );
      if (activeView.retainsContainers) {
        const fenceMatch = activeView.line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
        if (fenceMatch && fenceMatch[1][0] === fence.marker && fenceMatch[1].length >= fence.length
          && fenceMatch[2].trim() === "") fence = null;
        renderedLines.push(null);
        renderedHeadingLines.push(null);
        renderedHeadingBlocks.push(null);
        referenceDefinitionLines.push(null);
        previousTableLine = null;
        previousTableBlock = null;
        continue;
      }
      const exitedFence = fence;
      fence = null;
      const listContentIndents = exitedFence.listContentIndents
        .filter((indent) => indent < exitedFence.listContentIndent && indent <= sourceIndent);
      paragraphState = {
        open: false,
        listContentIndent: listContentIndents.at(-1) ?? null,
        listContentIndents,
        quoteDepth: quoteView.depth,
      };
      rawLine = quoteView.line;
    }
    if (gfmTableColumns !== null) {
      const tableView = markdownActiveBlockContainerView(
        sourceLine,
        gfmTableColumns.rootQuoteDepth,
        gfmTableColumns.containerPath,
      );
      const cells = tableView.retainsContainers
        ? splitGfmTableRow(tableView.line)
        : null;
      if (cells && !startsMarkdownBlockOutsideTable(tableView.line)) {
        renderedLines.push(rawLine);
        renderedHeadingLines.push(null);
        renderedHeadingBlocks.push(null);
        referenceDefinitionLines.push(null);
        previousTableLine = null;
        previousTableBlock = null;
        continue;
      }
      gfmTableColumns = null;
    }
    if (rawHtmlBlock) {
      const activeView = markdownActiveBlockContainerView(
        sourceLine,
        rawHtmlBlock.rootQuoteDepth,
        rawHtmlBlock.containerPath,
      );
      if (activeView.retainsContainers) {
        const rawMasked = maskMarkdownRawHtmlBlock(activeView.line, rawHtmlBlock);
        rawHtmlBlock = rawMasked.state;
        renderedLines.push(rawMasked.masked);
        renderedHeadingLines.push(null);
        renderedHeadingBlocks.push(null);
        referenceDefinitionLines.push(null);
        previousTableLine = null;
        previousTableBlock = null;
        if (!rawHtmlBlock && /^\s*$/.test(activeView.line)) paragraphState = { ...paragraphState, open: false };
        continue;
      }
      const exitedRawHtml = rawHtmlBlock;
      rawHtmlBlock = null;
      const listContentIndents = exitedRawHtml.listContentIndents
        .filter((indent) => indent < exitedRawHtml.listContentIndent && indent <= sourceIndent);
      paragraphState = {
        open: false,
        listContentIndent: listContentIndents.at(-1) ?? null,
        listContentIndents,
        quoteDepth: quoteView.depth,
      };
      rawLine = quoteView.line;
    }
    if (htmlCommentState !== null) {
      const commentView = markdownActiveBlockContainerView(
        sourceLine,
        htmlCommentState.rootQuoteDepth,
        htmlCommentState.containerPath,
        quoteView.lazy ? paragraphState.quoteDepth : null,
      );
      if (commentView.retainsContainers) {
        const commentMasked = maskMarkdownHtmlComments(commentView.line, true);
        htmlCommentState = commentMasked.inComment ? htmlCommentState : null;
      renderedLines.push(commentMasked.masked);
        renderedHeadingLines.push(markdownHeadingLine(commentMasked.masked));
      paragraphOnlyHeadingIndexes.add(renderedHeadingLines.length - 1);
      renderedHeadingBlocks.push({
        paragraphBlockSerial,
          quoteDepth: paragraphState.quoteDepth,
        listContentIndents: paragraphState.listContentIndents.join(","),
      });
      referenceDefinitionLines.push(null);
      previousTableLine = null;
      previousTableBlock = null;
      continue;
      }
      htmlCommentState = null;
    }
    rawLine = quoteView.line;
    let containerView = markdownListBlockQuoteContainerView(
      rawLine,
      paragraphState.listContentIndent,
      paragraphState.listContentIndents,
    );
    let effectiveQuoteDepth = quoteView.depth + containerView.nestedQuoteDepth;
    if (paragraphState.quoteDepth !== effectiveQuoteDepth) {
      paragraphState = { open: false, listContentIndent: null, listContentIndents: [], quoteDepth: effectiveQuoteDepth };
      containerView = markdownListBlockQuoteContainerView(rawLine, null, []);
      effectiveQuoteDepth = quoteView.depth + containerView.nestedQuoteDepth;
    }
    const exitsActiveListParagraph = paragraphState.listContentIndent !== null
      && containerView.startsNewListItem
      && containerView.firstListMarkerIndent < paragraphState.listContentIndent;
    const listContainerCanOpenFence = !paragraphState.open
      || !containerView.startsNewListItem
      || containerView.canInterruptParagraph
      || exitsActiveListParagraph;
    const fenceMatch = quoteView.lazy || containerView.startsWithIndentedCode || !listContainerCanOpenFence
      ? null
      : containerView.line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (fenceMatch && (fenceMatch[1][0] === "~" || !fenceMatch[2].includes("`"))) {
      fence = {
        marker: fenceMatch[1][0],
        length: fenceMatch[1].length,
        listContentIndent: containerView.listContentIndent,
        listContentIndents: containerView.listContentIndents,
        rootQuoteDepth: quoteView.depth,
        nestedQuoteDepth: containerView.nestedQuoteDepth,
        containerPath: containerView.containerPath,
        quoteDepth: effectiveQuoteDepth,
      };
      renderedLines.push(null);
      renderedHeadingLines.push(null);
      renderedHeadingBlocks.push(null);
      referenceDefinitionLines.push(null);
      previousTableLine = null;
      previousTableBlock = null;
      paragraphState = {
        open: false,
        listContentIndent: containerView.listContentIndent,
        listContentIndents: containerView.listContentIndents,
        quoteDepth: effectiveQuoteDepth,
      };
      continue;
    }
    const rawIndent = markdownIndentColumns(rawLine.match(/^[ \t]*/)?.[0] ?? "");
    if (!quoteView.lazy && paragraphState.open && paragraphState.listContentIndent !== null
      && (rawIndent < paragraphState.listContentIndent || containerView.canInterruptParagraph)
      && isMarkdownType7Start(containerView.line)) {
      paragraphState = { open: false, listContentIndent: null, listContentIndents: [], quoteDepth: effectiveQuoteDepth };
    }
    const rawMasked = quoteView.lazy || containerView.startsWithIndentedCode
      ? { masked: rawLine, state: null, isBlock: false }
      : maskMarkdownRawHtmlBlock(
        containerView.line,
        null,
        !paragraphState.open || (containerView.startsNewListItem && containerView.canInterruptParagraph),
      );
    if (rawMasked.isBlock) {
      rawHtmlBlock = rawMasked.state === null
        ? null
        : {
          ...rawMasked.state,
          listContentIndent: containerView.listContentIndent,
          listContentIndents: containerView.listContentIndents,
          rootQuoteDepth: quoteView.depth,
          nestedQuoteDepth: containerView.nestedQuoteDepth,
          containerPath: containerView.containerPath,
          quoteDepth: effectiveQuoteDepth,
        };
      renderedLines.push(" ".repeat(rawLine.length));
      renderedHeadingLines.push(null);
      renderedHeadingBlocks.push(null);
      referenceDefinitionLines.push(null);
      previousTableLine = null;
      previousTableBlock = null;
      paragraphState = { ...paragraphState, open: false };
      continue;
    }
    let commentMasked = maskMarkdownHtmlComments(rawLine, false);
    const commentOwnerState = nextMarkdownParagraphState(containerView.line, paragraphState, containerView);
    if (commentMasked.inComment
      && (!commentOwnerState.open
        || !hasValidInlineCommentCloseWithinParagraph(lines, sourceIndex, rawLine, effectiveQuoteDepth, containerView))) {
      commentMasked = { masked: rawLine, inComment: false };
    }
    htmlCommentState = commentMasked.inComment
      ? {
        rootQuoteDepth: quoteView.depth,
        nestedQuoteDepth: containerView.nestedQuoteDepth,
        listContentIndent: containerView.listContentIndent,
        containerPath: containerView.containerPath,
      }
      : null;
    const visibleLine = commentMasked.masked;
    const visibleContainerView = markdownListBlockQuoteContainerView(
      commentMasked.inComment ? visibleLine : rawLine,
      paragraphState.listContentIndent,
      paragraphState.listContentIndents,
    );
    const effectiveExitsActiveListParagraph = paragraphState.listContentIndent !== null
      && visibleContainerView.startsNewListItem
      && visibleContainerView.firstListMarkerIndent < paragraphState.listContentIndent;
    const markerInterruptsParagraph = !quoteView.lazy && (!visibleContainerView.startsNewListItem
      || !paragraphState.open
      || visibleContainerView.canInterruptParagraph
      || effectiveExitsActiveListParagraph);
    const effectiveContainerView = markerInterruptsParagraph
      ? visibleContainerView
      : {
        ...visibleContainerView,
        line: visibleLine,
        listContentIndent: paragraphState.listContentIndent,
        listContentIndents: paragraphState.listContentIndents,
        startsNewListItem: false,
        firstListMarkerIndent: null,
        canInterruptParagraph: false,
        startsWithIndentedCode: false,
      };
    renderedLines.push(visibleLine);
    if (!paragraphState.open || effectiveContainerView.startsNewListItem) paragraphBlockSerial += 1;
    const headingBlock = {
      paragraphBlockSerial,
      quoteDepth: effectiveQuoteDepth,
      listContentIndents: effectiveContainerView.listContentIndents.join(","),
    };
    renderedHeadingLines.push(markdownHeadingLine(effectiveContainerView.line));
    if (quoteView.lazy) paragraphOnlyHeadingIndexes.add(renderedHeadingLines.length - 1);
    if (!quoteView.lazy) setextUnderlineIndexes.add(renderedHeadingLines.length - 1);
    renderedHeadingBlocks.push(headingBlock);
    referenceDefinitionLines.push(quoteView.lazy ? null : effectiveContainerView.line);
    const tableColumnCount = quoteView.lazy || previousTableLine === null || !isDeepStrictEqual(previousTableBlock, headingBlock)
      ? null
      : gfmTableColumnCount(previousTableLine, effectiveContainerView.line);
    if (tableColumnCount !== null) {
      gfmTableColumns = {
        columnCount: tableColumnCount,
        rootQuoteDepth: quoteView.depth,
        nestedQuoteDepth: effectiveContainerView.nestedQuoteDepth,
        containerPath: effectiveContainerView.containerPath,
        quoteDepth: effectiveQuoteDepth,
        listContentIndent: effectiveContainerView.listContentIndent,
        listContentIndents: effectiveContainerView.listContentIndents,
      };
      paragraphState = { ...paragraphState, open: false };
      previousTableLine = null;
      previousTableBlock = null;
      continue;
    }
    previousTableLine = quoteView.lazy ? null : effectiveContainerView.line;
    previousTableBlock = quoteView.lazy ? null : headingBlock;
    paragraphState = quoteView.lazy
      ? { ...paragraphState, open: true }
      : nextMarkdownParagraphState(effectiveContainerView.line, paragraphState, effectiveContainerView);
  }
  for (let index = 0; index < renderedHeadingLines.length; index += 1) {
    const line = renderedHeadingLines[index];
    if (!line) continue;
    const atx = paragraphOnlyHeadingIndexes.has(index)
      ? null
      : line.match(/^[ \t]*#{1,6}(?:[ \t]+|$)(.*)$/);
    if (atx) {
      headings.push(atx[1].replace(/[ \t]+#+[ \t]*$/, "").trim());
      continue;
    }
    const next = renderedHeadingLines[index + 1];
    const block = renderedHeadingBlocks[index];
    const nextBlock = renderedHeadingBlocks[index + 1];
    if (line.trim() && next && /^[ \t]*(?:=+|-+)[ \t]*$/.test(next)
      && setextUnderlineIndexes.has(index + 1)
      && block && nextBlock && isDeepStrictEqual(block, nextBlock)) {
      let paragraphStart = index;
      while (paragraphStart > 0) {
        const priorBlock = renderedHeadingBlocks[paragraphStart - 1];
        if (!priorBlock || !isDeepStrictEqual(priorBlock, block)) break;
        paragraphStart -= 1;
      }
      headings.push(renderedHeadingLines.slice(paragraphStart, index + 1)
        .map((part) => part?.trim())
        .filter(Boolean)
        .join(" "));
      index += 1;
    }
  }
  const referenceLabels = markdownReferenceLabels(referenceDefinitionLines);
  const anchors = new Set();
  for (const heading of headings) {
    const base = githubHeadingBaseSlug(heading, referenceLabels);
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
  const registryUpdatedAt = normalizeTimestamp(registry.updatedAt, "registry.updatedAt");
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
    const itemUpdatedAt = normalizeTimestamp(item.updatedAt, `${item.id}.updatedAt`);
    if (itemUpdatedAt > registryUpdatedAt) throw new Error(`${item.id}.updatedAt must not be later than registry.updatedAt`);
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
    if (!Array.isArray(item.acceptanceCriteria) || item.acceptanceCriteria.length < 3) {
      throw new Error(`${item.id} requires at least three acceptance criteria`);
    }
    item.acceptanceCriteria.forEach((criterion) => requireString(criterion, `${item.id}.acceptanceCriteria`));
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
    ["known secret format", /\b(?:gh[pousr]_[A-Z0-9]{20,}|github_pat_[A-Z0-9_]{20,}|(?:AKIA|ASIA)[0-9A-Z]{16}|xox[baprs]-[A-Z0-9-]{10,}|sk_(?:live|test)_[A-Z0-9]{16,}|AIza[A-Z0-9_-]{30,}|sk-[A-Z0-9_-]{20,}|sb_secret_[A-Z0-9_-]{10,}|eyJ[A-Z0-9_-]{8,}\.[A-Z0-9_-]{8,}\.[A-Z0-9_-]{8,})\b/i],
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
  let sourceRegistry;
  try {
    sourceRegistry = JSON.parse(sourceBytes["mazer-owner-work-registry"]);
  } catch {
    throw new Error("mazer-owner-work-registry source bytes must contain valid JSON");
  }
  if (!isDeepStrictEqual(registry, sourceRegistry)) {
    throw new Error("registry argument must exactly match mazer-owner-work-registry source bytes");
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
