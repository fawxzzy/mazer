// PG17 two-session race test for mazer_submit_help_request_v1 (review P2: "advisory lock untested").
// Run from the repo root after scratch-pg.mjs init + build (README, Repeating the PG17 run):
//   node docs/ops/sql-proposals/mazer-help-requests-20261126/scratch-test/pg17/race-test.mjs --dir <scratch dir>
// Two real connections as the runner `postgres` with no JWT claim (so both callers are guests). The guest
// pool (30/hour) is pre-filled to 29. Session A opens a transaction, submits, and holds the transaction open
// for 2 s before committing. Session B waits until A is inside its transaction (a marker advisory lock, key
// 777; see the handshake below), waits 0.3 s more so A's submit has run, then submits. Exactly one of the
// two may be saved. A trial also FAILS if B did not call while A's transaction was still open.
//   LOCKED  (apply.sql as proposed): B passes the unlocked first count (A's row is not committed yet), then
//           waits on the advisory lock until A commits, recounts, sees 30 and is refused. Expect A saved,
//           B rate_limited, 30 guest rows, B answered after A committed.
//   MUTANT  (the same file with the advisory-lock line replaced by `null;`): B's second count also sees 29,
//           so both are saved and the pool ends at 31. The test must see that, or it proves nothing.
// Five trials per variant. Exit 0 only when every LOCKED trial passes AND every MUTANT trial over-fills.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const dir = argv[argv.indexOf('--dir') + 1];
if (!dir || argv.indexOf('--dir') < 0) { console.error('usage: race-test.mjs --dir <scratch dir>'); process.exit(2); }
const pack = 'docs/ops/sql-proposals/mazer-help-requests-20261126';
const applyPath = path.resolve(pack, 'apply.sql');
const seedPath = path.resolve(pack, 'scratch-test/pg17/seed.sql');
const LOCK_LINE = "perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('mazer_help_requests', 0));";
const apply = fs.readFileSync(applyPath, 'utf8');
if (apply.split(LOCK_LINE).length !== 2) { console.error('lock line not found exactly once in apply.sql'); process.exit(2); }
const mutantPath = path.join(dir, 'apply-nolock-mutant.sql');
fs.writeFileSync(mutantPath, apply.replace(LOCK_LINE, 'null; -- MUTANT: advisory lock removed'));

const psql = (db, role, args) => new Promise((resolve) => {
  const p = spawn(process.execPath, ['scripts/db-scratch/scratch-pg.mjs', 'psql', '--dir', dir, '--db', db, '--as', role, '--', ...args]);
  let out = '';
  p.stdout.on('data', (d) => { out += d; });
  p.stderr.on('data', (d) => { out += d; });
  p.on('close', (code) => resolve({ code, out: out.replace(/\r/g, '') }));
});
const must = async (label, r) => { if ((await r).code !== 0) { const x = await r; console.error(`SETUP FAILED ${label}\n${x.out}`); process.exit(2); } return r; };

const sessionA = path.join(dir, 'race-session-a.sql');
const sessionB = path.join(dir, 'race-session-b.sql');
// Handshake (process start-up on Windows can lag by seconds, so ordering never relies on timing):
// B connects and holds session marker 888 first; A waits for 888 before it opens its transaction; B waits
// for A's transaction marker 777. Either side raises RACE_HANDSHAKE_TIMEOUT after 30 s instead of guessing.
const waitFor = (key, who) => `do $w$ begin for i in 1..600 loop if exists (select 1 from pg_catalog.pg_locks where locktype = 'advisory' and objid = ${key} and granted) then return; end if; perform pg_sleep(0.05); end loop; raise exception 'RACE_HANDSHAKE_TIMEOUT ${who}'; end $w$;`;
fs.writeFileSync(sessionA, [
  waitFor(888, 'A waited for B'),
  'begin;',
  'select pg_advisory_xact_lock(777);',
  "select 'A_RESULT', mazer.mazer_submit_help_request_v1('race-a@example.com', 'session A')::text;",
  'select pg_sleep(2);',
  "select 'A_COMMIT_AT', to_char(clock_timestamp() at time zone 'UTC', 'HH24:MI:SS.MS');",
  'commit;', ''
].join('\n'));
fs.writeFileSync(sessionB, [
  'select pg_advisory_lock(888);',
  waitFor(777, 'B waited for A'),
  'select pg_sleep(0.3);',
  "select 'B_CALL_AT', to_char(clock_timestamp() at time zone 'UTC', 'HH24:MI:SS.MS');",
  "select 'B_RESULT', mazer.mazer_submit_help_request_v1('race-b@example.com', 'session B')::text;",
  "select 'B_DONE_AT', to_char(clock_timestamp() at time zone 'UTC', 'HH24:MI:SS.MS');", ''
].join('\n'));

const field = (out, key) => (out.split('\n').find((l) => l.startsWith(key + '|')) ?? '').split('|').slice(1).join('|');
const status = (s) => { try { return JSON.parse(s).status ?? '?'; } catch { return s || 'ERROR'; } };
const secs = (t) => { const [h, m, s] = t.split(':').map(Number); return h * 3600 + m * 60 + s; };

let pass = 0, fail = 0;
const check = (name, ok, detail) => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  [${detail}]`); };

for (const [variant, file] of [['LOCKED', applyPath], ['MUTANT', mutantPath]]) {
  const db = variant === 'LOCKED' ? 'help_race' : 'help_race_nolock';
  await must('drop', psql('postgres', 'scratch_super', ['-q', '-c', `drop database if exists ${db} with (force)`]));
  await must('clone', psql('postgres', 'scratch_super', ['-q', '-c', `create database ${db} template stub owner postgres`]));
  await must('seed', psql(db, 'postgres', ['-q', '-f', seedPath]));
  await must('apply', psql(db, 'postgres', ['-q', '-f', file]));
  console.log(`--- ${variant}: ${path.basename(file)} applied to ${db}`);
  for (let trial = 1; trial <= 5; trial++) {
    await must('reset', psql(db, 'postgres', ['-q', '-c',
      `delete from mazer.mazer_help_requests; insert into mazer.mazer_help_requests (contact_email, message, created_at) select 'fill' || i || '@example.com', 'fill', now() - make_interval(mins => 5 + i) from generate_series(1, 29) i;`]));
    const [a, b] = await Promise.all([
      psql(db, 'postgres', ['-q', '-A', '-t', '-f', sessionA]),
      psql(db, 'postgres', ['-q', '-A', '-t', '-f', sessionB])
    ]);
    const rows = (await psql(db, 'postgres', ['-q', '-A', '-t', '-c', "select count(*) from mazer.mazer_help_requests where user_id is null and created_at > now() - interval '1 hour'"])).out.trim();
    const sa = status(field(a.out, 'A_RESULT')), sb = status(field(b.out, 'B_RESULT'));
    const commitAt = field(a.out, 'A_COMMIT_AT'), bCall = field(b.out, 'B_CALL_AT'), bDone = field(b.out, 'B_DONE_AT');
    const bWaited = commitAt && bDone ? (secs(bDone) - secs(bCall)).toFixed(2) : '?';
    const detail = `A=${sa} B=${sb} guest_rows=${rows} B_call=${bCall} A_commit=${commitAt} B_done=${bDone} B_took=${bWaited}s exit=${a.code}/${b.code}`;
    if (variant === 'LOCKED') {
      check(`LOCKED trial ${trial}: exactly one saved (A), B refused after A committed, pool ends at 30`,
        a.code === 0 && b.code === 0 && sa === 'saved' && sb === 'rate_limited' && rows === '30' && bCall < commitAt && bDone >= commitAt, detail);
    } else {
      check(`MUTANT trial ${trial}: without the lock both are saved and the pool over-fills to 31 (the test bites)`,
        a.code === 0 && b.code === 0 && sa === 'saved' && sb === 'saved' && rows === '31' && bCall < commitAt, detail);
    }
    if (a.code !== 0 || b.code !== 0) console.log(a.out + '\n' + b.out);
  }
  await psql('postgres', 'scratch_super', ['-q', '-c', `drop database if exists ${db} with (force)`]);
}
fs.rmSync(mutantPath); fs.rmSync(sessionA); fs.rmSync(sessionB);
console.log(`\nRACE SUMMARY: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
