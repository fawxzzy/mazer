// Deterministic FawxzzyWeb re-pin of the Mazer owner export (the mechanical edits the board-sync agent used to do by hand).
// Edits only: the board source copy, the allowlist sha256 and new ids, and the three hard-coded card counts.
// It never builds, commits, pushes or deploys; board-sync prints the commands to run next.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const WEB_FILES = Object.freeze({
  source: "planning/board-sources/mazer.project-board.owner-export.v1.json",
  allowlist: "planning/project-board-public-allowlist.v1.json",
  e2e: "tests/e2e/project-board-preview.spec.ts",
  snapshotTest: "tests/project-board-public-snapshot.test.mjs",
  doc: "docs/project-board-owner-export.md",
});

const sha256 = (buffer) => crypto.createHash("sha256").update(buffer).digest("hex");
const eolOf = (text) => (text.includes("\r\n") ? "\r\n" : "\n");

function replaceCount(text, pattern, replacement, label, minimum = 1) {
  let count = 0;
  const out = text.replace(pattern, (...args) => { count += 1; return typeof replacement === "function" ? replacement(...args) : replacement; });
  if (count < minimum) throw new Error(`web re-pin: pattern for ${label} matched ${count} times (expected at least ${minimum}); the Web file changed shape`);
  return { out, count };
}

/**
 * @param {{ webDir: string, exportPath: string, write?: boolean }} options
 * @returns {{ sha256: string, cards: number, newIds: string[], edits: string[], files: string[] }}
 */
export function repinWeb({ webDir, exportPath, write = false }) {
  const exportBytes = fs.readFileSync(exportPath);
  const exported = JSON.parse(exportBytes.toString("utf8"));
  const ids = exported.cards.map((c) => c.record.card_id);
  const sha = sha256(exportBytes);
  const abs = (rel) => path.join(webDir, rel);
  const edits = [];
  const writes = new Map();

  const allowRaw = fs.readFileSync(abs(WEB_FILES.allowlist), "utf8");
  const allow = JSON.parse(allowRaw);
  const source = allow.sources.find((s) => s.board === "mazer");
  if (!source) throw new Error("web re-pin: no mazer source in the allowlist");
  const oldSha = source.sha256;
  source.sha256 = sha;
  const before = new Set(allow.include.mazer);
  const newIds = ids.filter((id) => !before.has(id));
  allow.include.mazer = [...new Set([...allow.include.mazer, ...ids])].sort();
  const dropped = [...before].filter((id) => !ids.includes(id));
  if (dropped.length) throw new Error(`web re-pin: export no longer contains allowlisted ids: ${dropped.join(", ")}`);
  const eol = eolOf(allowRaw);
  writes.set(WEB_FILES.allowlist, `${JSON.stringify(allow, null, 2).replace(/\n/g, eol)}${allowRaw.endsWith("\n") ? eol : ""}`);
  edits.push(`allowlist: mazer sha256 ${oldSha.slice(0, 12)} -> ${sha.slice(0, 12)}, +${newIds.length} ids${newIds.length ? ` (${newIds.join(", ")})` : ""}`);

  const patch = (rel, pattern, replacement, label, minimum) => {
    const raw = fs.readFileSync(abs(rel), "utf8");
    const { out, count } = replaceCount(raw, pattern, replacement, label, minimum);
    writes.set(rel, out);
    edits.push(`${rel}: ${label} x${count} -> ${ids.length}`);
  };
  patch(WEB_FILES.e2e, /Mazer, \d+ cards/g, `Mazer, ${ids.length} cards`, "tab label", 1);
  patch(WEB_FILES.snapshotTest, /(BOARD_COUNTS = \{[^}]*\bmazer: )\d+/, (_m, head) => `${head}${ids.length}`, "BOARD_COUNTS.mazer", 1);
  patch(WEB_FILES.doc, /\b\d+ owner cards\b/, `${ids.length} owner cards`, "owner cards sentence", 1);

  if (write) {
    fs.mkdirSync(path.dirname(abs(WEB_FILES.source)), { recursive: true });
    fs.writeFileSync(abs(WEB_FILES.source), exportBytes);
    for (const [rel, text] of writes) fs.writeFileSync(abs(rel), text, "utf8");
  }
  return { sha256: sha, cards: ids.length, newIds, edits, files: [WEB_FILES.source, ...writes.keys()] };
}

export const WEB_NEXT_COMMANDS = [
  "npm run data:project-board-public",
  "npm run test:project-board-preview",
  "npx eslint .",
  "npm run build",
];
