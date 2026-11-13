// Deterministic FawxzzyWeb re-pin of the Mazer owner export.
// FawxzzyWeb's Projects page is owner-only (2026-11-13): there is no allowlist, per-card approval or
// hard-coded count any more. Re-pinning is just copying the export into the Web repo's board sources;
// the Web repo then regenerates its owner snapshot from every card in every source.
// It never builds, commits, pushes or deploys; board-sync prints the commands to run next.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const WEB_FILES = Object.freeze({
  source: "planning/board-sources/mazer.project-board.owner-export.v1.json",
  snapshot: "src/server/projects/owner-board.generated.mjs",
});

const sha256 = (buffer) => crypto.createHash("sha256").update(buffer).digest("hex");

const cardIds = (parsed, label) => {
  if (!Array.isArray(parsed?.cards)) throw new Error(`web re-pin: ${label} is not an owner export (no cards array)`);
  return parsed.cards.map((c) => c.record.card_id);
};

/**
 * @param {{ webDir: string, exportPath: string, write?: boolean }} options
 * @returns {{ sha256: string, cards: number, newIds: string[], removedIds: string[], edits: string[], files: string[] }}
 */
export function repinWeb({ webDir, exportPath, write = false }) {
  const exportBytes = fs.readFileSync(exportPath);
  const ids = cardIds(JSON.parse(exportBytes.toString("utf8")), "the Mazer export");
  const sha = sha256(exportBytes);
  const target = path.join(webDir, WEB_FILES.source);
  const previous = fs.existsSync(target) ? new Set(cardIds(JSON.parse(fs.readFileSync(target, "utf8")), "the current Web copy")) : new Set();
  const newIds = ids.filter((id) => !previous.has(id));
  const removedIds = [...previous].filter((id) => !ids.includes(id));
  const edits = [`${WEB_FILES.source}: copy of the export, sha256 ${sha.slice(0, 12)}, ${ids.length} cards (+${newIds.length}, -${removedIds.length})`];
  if (write) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, exportBytes);
  }
  return { sha256: sha, cards: ids.length, newIds, removedIds, edits, files: [WEB_FILES.source] };
}

export const WEB_NEXT_COMMANDS = [
  "npm run data:project-board-owner-snapshot",
  "npm run test:project-board-preview",
  "npx eslint .",
  "npm run build",
];
