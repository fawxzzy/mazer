// Reproduces run.log. Usage (repo root): node docs/ops/sql-proposals/mazer-leaderboard-hide-qa-20261116/scratch-test/run-scratch.mjs <new dir under C:\ATLAS\tmp> <port 55440+> > run.log
// Needs PostgreSQL 17 (see scripts/db-scratch/README.md). Never touches Supabase.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const proposal = resolve(here, '..');
const repo = resolve(here, '../../../../..');
const migration = join(repo, 'supabase/migrations/20260828160000_mazer_leaderboard_hide_qa_accounts.sql');
const rollback = join(proposal, 'rollback.sql');
const [dir, port] = process.argv.slice(2);
if (!dir || !port) throw new Error('usage: run-scratch.mjs <new scratch dir> <port>');
const harness = join(repo, 'scripts/db-scratch/scratch-pg.mjs');
const sha = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');
const rel = (f) => f.slice(repo.length + 1).replace(/\\/g, '/');
const sc = (...a) => join(here, ...a);
let bad = 0;

const say = (s = '') => console.log(s);
const run = (title, args, { allowFail = false } = {}) => {
  say(`\n$ ${title}`);
  const r = spawnSync(process.execPath, [harness, ...args], { encoding: 'utf8', cwd: repo });
  const out = `${r.stdout || ''}${r.stderr || ''}`.replace(/\r\n/g, '\n').trimEnd();
  if (out) say(out);
  say(`(exit ${r.status})`);
  if (r.status !== 0 && !allowFail) { bad++; }
  return r;
};

say(`### tested_file=${rel(migration)} sha256=${sha(migration)}`);
say(`### tested_file=${rel(rollback)} sha256=${sha(rollback)}`);
say(`### stub_source=${rel(join(proposal, 'preimage.json'))} sha256=${sha(join(proposal, 'preimage.json'))} (live read-only capture 2026-11-16)`);
for (const f of ['make-stub.mjs', 'stub-app.sql', 'stub-super.sql', 'seed.sql', 'check.sql', 'check-rollback.sql', 'run-scratch.mjs']) {
  say(`### harness_file=${rel(sc(f))} sha256=${sha(sc(f))}`);
}
say(`### run_at_utc=${new Date().toISOString()}`);

run('scratch-pg.mjs init', ['init', '--dir', dir, '--port', port]);
run('scratch-pg.mjs build (roles + auth.users stub + LIVE-capture stub)', ['build', '--dir', dir, '--extra-super', sc('stub-super.sql'), '--extra', sc('stub-app.sql')]);
run('runner role facts', ['psql', '--dir', dir, '--db', 'stub', '--', '-At', '-c',
  "select 'runner=' || rolname || ' superuser=' || rolsuper || ' member_of_auth_admin=' || pg_has_role(rolname, 'supabase_auth_admin', 'member') || ' bypassrls=' || rolbypassrls from pg_roles where rolname = 'postgres'"]);

say('\n==== 1. harness pair: apply, check, re-apply, rollback, catalog equality (clone of the stub, as postgres) ====');
run('scratch-pg.mjs pair --apply <migration> --rollback <rollback> --seed seed.sql --check check.sql --reapply --schemas mazer',
  ['pair', '--dir', dir, '--apply', migration, '--rollback', rollback, '--seed', sc('seed.sql'), '--check', sc('check.sql'), '--reapply', '--schemas', 'mazer']);

say('\n==== 2. verbose walk-through on a second clone (same files; shows each PASS line) ====');
const db = 'lbwalk';
const P = (title, args, o) => run(title, ['psql', '--dir', dir, ...args], o);
P('create clone', ['--db', 'postgres', '--', '-q', '-c', `create database ${db} template stub`]);
P('seed', ['--db', db, '--', '-q', '-f', sc('seed.sql')]);
P('preimage: both live function md5s on the stub', ['--db', db, '--', '-At', '-c',
  "select p.proname || ' ' || md5(p.prosrc) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'mazer' and p.proname like 'mazer_leaderboard%' order by 1"]);
P('preimage: public page BEFORE apply (anon, all 10 ranked)', ['--db', db, '--', '-q', '-At', '-c',
  "set role anon; select string_agg(username || ':' || rank, ',' order by rank::int) from mazer.mazer_leaderboard_page(100, 0)"]);
P('APPLY migration', ['--db', db, '--', '-q', '-f', migration]);
P('check.sql after apply', ['--db', db, '--', '-q', '-f', sc('check.sql')]);
P('RE-APPLY migration (must be refused or a no-op)', ['--db', db, '--', '-q', '-f', migration], { allowFail: true });
P('check.sql again after re-apply (state identical)', ['--db', db, '--', '-q', '-f', sc('check.sql')]);
P('hidden flags after re-apply', ['--db', db, '--', '-At', '-c', "select string_agg(username, ',' order by username) from mazer.mazer_profiles where leaderboard_hidden"]);
P('ROLLBACK', ['--db', db, '--', '-q', '-f', rollback]);
P('check-rollback.sql', ['--db', db, '--', '-q', '-f', sc('check-rollback.sql')]);

say('\n==== 3. guard mutants on a third clone (guard must abort and leave the DB unchanged) ====');
const m = 'lbmut';
P('create clone', ['--db', 'postgres', '--', '-q', '-c', `create database ${m} template stub`]);
P('seed', ['--db', m, '--', '-q', '-f', sc('seed.sql')]);
P('mutant: page body drifted (extra comment) -> apply must abort with DRIFT_PAGE', ['--db', m, '--', '-q', '-c',
  "create or replace function mazer.mazer_leaderboard_page(p_limit integer default 25, p_offset integer default 0) returns table(rank text, username text, player_level text, is_requesting_user boolean) language sql stable security definer set search_path to '' as $f$ select 'x'::text, 'y'::text, 'z'::text, false $f$"]);
P('apply on drifted page body', ['--db', m, '--', '-q', '-f', migration], { allowFail: true });
P('after abort: column absent, flag trigger absent (transaction rolled back)', ['--db', m, '--', '-At', '-c',
  "select (select count(*) from information_schema.columns where table_schema = 'mazer' and table_name = 'mazer_profiles' and column_name = 'leaderboard_hidden') || ' column(s), ' || (select count(*) from pg_trigger where tgname = 'mazer_protect_leaderboard_hidden_before_write') || ' trigger(s)'"]);
P('mutant: self_rank function missing -> apply must abort', ['--db', m, '--', '-q', '-c', 'drop function mazer.mazer_leaderboard_self_rank(); create or replace function mazer.mazer_leaderboard_page(p_limit integer default 25, p_offset integer default 0) returns table(rank text, username text, player_level text, is_requesting_user boolean) language sql stable security definer set search_path to \'\' as $f$ select \'x\'::text, \'y\'::text, \'z\'::text, false $f$']);
P('apply with self_rank missing', ['--db', m, '--', '-q', '-f', migration], { allowFail: true });

for (const d of [db, m]) P(`drop clone ${d}`, ['--db', 'postgres', '--', '-q', '-c', `drop database ${d} with (force)`]);
run('destroy scratch cluster', ['destroy', '--dir', dir]);
say(`\n==== RESULT: ${bad === 0 ? 'ALL STEPS PASSED' : bad + ' STEP(S) FAILED'} (mutant/re-apply refusals are expected non-zero exits and are marked in the text) ====`);
process.exit(bad ? 1 : 0);
