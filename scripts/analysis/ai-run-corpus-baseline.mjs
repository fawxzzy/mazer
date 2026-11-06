// Entry point for `npm run ai:corpus:baseline` (run through vite-node so the
// TypeScript seed-pack runner can import src/). vite-node does not set
// process.argv[1] to this script, so the audit module's own direct-run guard
// cannot fire here; this wrapper calls the shared CLI explicitly.
import { runMazerAiRunCorpusAuditCli } from './ai-run-corpus-audit.mjs';

runMazerAiRunCorpusAuditCli(process.argv.slice(2)).catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
