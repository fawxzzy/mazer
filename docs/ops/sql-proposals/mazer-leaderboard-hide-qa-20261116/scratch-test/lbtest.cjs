// Scratch test (in-memory Postgres via pglite 0.5.13; never touches Supabase) for
// supabase/migrations/20260828160000_mazer_leaderboard_hide_qa_accounts.sql and its rollback.
// Stand-ins: roles, auth.uid(), mazer.mazer_profiles + mazer.mazer_progression_states DDL (columns per live
// capture), profile RLS/grants/trigger as captured live. The two live leaderboard function bodies are installed
// from the repo copy in 20260824170159_mazer_master_runtime_contracts.sql (md5-equal to live, verified).
// Usage: node lbtest.cjs <runtime_contracts.sql> <migration.sql> <rollback.sql>
const { createRequire } = require('module');
const fs = require('fs');
const crypto = require('crypto');
const { PGlite } = createRequire(__dirname + '/package.json')('@electric-sql/pglite');
const [rcPath, migPath, rbPath] = process.argv.slice(2);
const rc = fs.readFileSync(rcPath, 'utf8');
const mig = fs.readFileSync(migPath, 'utf8');
const rb = fs.readFileSync(rbPath, 'utf8');
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
console.log('migration sha256:', sha(fs.readFileSync(migPath)));
console.log('rollback  sha256:', sha(fs.readFileSync(rbPath)));

const a = rc.indexOf('create or replace function mazer.mazer_leaderboard_page(');
const e0 = rc.indexOf('comment on function mazer.mazer_leaderboard_self_rank is\n');
const LIVE_FUNCS = rc.slice(a, rc.indexOf(';\n', e0) + 2);

const BASE = `
create role anon; create role authenticated; create role service_role; create role supabase_auth_admin;
create schema auth; create schema mazer;
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth, mazer to anon, authenticated, service_role;
create table mazer.mazer_profiles (
  user_id uuid primary key, display_name text, selected_control_mode text not null default 'stick',
  settings jsonb not null default '{}', created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), revision bigint not null default 0,
  username text not null, username_origin text not null default 'claimed');
create unique index mazer_profiles_username_unique_idx on mazer.mazer_profiles (lower(username));
create table mazer.mazer_progression_states (
  user_id uuid primary key, player_level bigint not null default 1, level_reached_at timestamptz);
alter table mazer.mazer_profiles enable row level security;
alter table mazer.mazer_profiles force row level security;
revoke all on mazer.mazer_profiles from anon, authenticated, service_role;
grant select, insert, update on mazer.mazer_profiles to authenticated;
grant select, insert, update, delete on mazer.mazer_profiles to service_role;
create policy own_select on mazer.mazer_profiles for select to authenticated using ((select auth.uid()) = user_id);
create policy own_insert on mazer.mazer_profiles for insert to authenticated with check ((select auth.uid()) = user_id);
create policy own_update on mazer.mazer_profiles for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy svc_all on mazer.mazer_profiles for all to service_role using (true) with check (true);
create function mazer.mazer_enforce_username_origin() returns trigger language plpgsql set search_path = '' as
  $$ begin if new.username is distinct from old.username then new.username_origin := 'claimed'; else new.username_origin := old.username_origin; end if; return new; end; $$;
create trigger mazer_enforce_username_origin_before_update before update of username, username_origin
  on mazer.mazer_profiles for each row execute function mazer.mazer_enforce_username_origin();
`;

const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
// n, username, level, level_reached_at  (ties on level exercise the tiebreak; null reached_at sorts last in ties)
const SEED = [
  [1, 'mzr-qa-1112', 50, '2026-01-01'],   // hidden, would be #1
  [2, 'MazerMaster', 40, '2026-01-02'],
  [3, 'claude', 40, '2026-01-01'],        // hidden, ties with MazerMaster and would beat it
  [4, 'fawxzzy', 30, '2026-02-01'],
  [5, 'cqa-a-1105', 30, null],            // hidden, null reached_at
  [6, 'cudding_muisc', 30, null],
  [7, 'cuddlingmuisc', 12, '2026-03-01'],
  [8, 'mzr-qa-2', 5, '2026-03-02'],       // hidden
  [9, 'Mazer-269110', 5, '2026-03-03'],
  [10, 'someplayer', 1, '2026-04-01'],
];
const HIDE = ['mzr-qa-1112', 'mzr-qa-2', 'cqa-a-1105', 'claude'];
const NOT_HIDE = ['fawxzzy', 'MazerMaster', 'cudding_muisc', 'cuddlingmuisc', 'Mazer-269110', 'someplayer'];

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { (ok ? pass++ : fail++); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  [' + detail + ']' : ''}`); };

async function seeded(applyLive = true) {
  const db = new PGlite();
  await db.exec(BASE);
  if (applyLive) await db.exec(LIVE_FUNCS + `
    alter function mazer.mazer_leaderboard_page(integer, integer) owner to postgres;
    alter function mazer.mazer_leaderboard_self_rank() owner to postgres;`);
  for (const [n, name, lvl, at] of SEED) {
    await db.query('insert into mazer.mazer_profiles (user_id, username) values ($1,$2)', [U(n), name]);
    await db.query('insert into mazer.mazer_progression_states (user_id, player_level, level_reached_at) values ($1,$2,$3)', [U(n), lvl, at]);
  }
  return db;
}
async function as(db, role, uid, fn) {
  await db.exec(`set role ${role}`);
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid || '']);
  try { return await fn(); } finally { await db.exec('reset role'); }
}
const page = (db, role = 'anon', uid = null, lim = 100, off = 0) =>
  as(db, role, uid, async () => (await db.query('select * from mazer.mazer_leaderboard_page($1,$2)', [lim, off])).rows);
const self = (db, n) =>
  as(db, 'authenticated', U(n), async () => (await db.query('select * from mazer.mazer_leaderboard_self_rank()')).rows);
const flagRows = async (db) => (await db.query('select username, leaderboard_hidden from mazer.mazer_profiles order by username')).rows;
async function catalog(db) {
  const q = async (s) => (await db.query(s)).rows;
  return JSON.stringify({
    funcs: await q(`select p.proname, md5(p.prosrc) m, (select string_agg(x::text, ',' order by x::text) from unnest(p.proacl) x) acl, p.prosecdef, p.proconfig::text cfg,
      pg_get_userbyid(p.proowner) o, obj_description(p.oid,'pg_proc') d, pg_get_function_result(p.oid) r
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='mazer' order by 1`),
    cols: await q(`select column_name, data_type, is_nullable, column_default from information_schema.columns
      where table_schema='mazer' and table_name='mazer_profiles' order by ordinal_position`),
    trig: await q(`select tgname from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relname='mazer_profiles' and not tgisinternal order by 1`),
    acl: await q(`select relacl::text from pg_class where relname='mazer_profiles'`),
    pol: await q(`select policyname from pg_policies where tablename='mazer_profiles' order by 1`),
  });
}

(async () => {
  // 0. baseline sanity: preimage shows everyone, contiguous
  let db = await seeded();
  let rows = await page(db);
  check('baseline: all 10 accounts ranked before migration', rows.length === 10 && rows[0].username === 'mzr-qa-1112', rows.map((r) => r.username).join(','));
  const before = await catalog(db);

  // 1. apply
  await db.exec(mig);
  rows = await page(db);
  const names = rows.map((r) => r.username);
  check('page excludes all 4 hidden accounts', HIDE.every((h) => !names.includes(h)), names.join(','));
  check('page keeps all 6 real accounts', NOT_HIDE.every((n) => names.includes(n)) && rows.length === 6);
  check('ranks contiguous 1..N and in row order', rows.every((r, i) => r.rank === String(i + 1)), rows.map((r) => r.rank).join(','));
  check('ordering unchanged (level desc, reached_at asc nulls last, user_id asc)',
    names.join(',') === 'MazerMaster,fawxzzy,cudding_muisc,cuddlingmuisc,Mazer-269110,someplayer', names.join(','));
  const pg2 = await page(db, 'anon', null, 2, 2);
  check('limit/offset still work and keep global ranks', pg2.length === 2 && pg2[0].rank === '3' && pg2[1].rank === '4', JSON.stringify(pg2.map((r) => r.rank)));
  const cl = await page(db, 'anon', null, 1000, -5);
  check('limit cap/offset floor unchanged', cl.length === 6 && cl[0].rank === '1');
  const flags = await flagRows(db);
  check('flag set for exactly the 4 target usernames', flags.filter((f) => f.leaderboard_hidden).map((f) => f.username).sort().join() === [...HIDE].sort().join());
  check('real accounts (fawxzzy, MazerMaster, cudding_muisc, cuddlingmuisc, Mazer-269110) not hidden',
    flags.filter((f) => !HIDE.includes(f.username)).every((f) => f.leaderboard_hidden === false));

  // self_rank consistency: every non-hidden user's self rank equals their page rank
  let consistent = true;
  for (const [n, name] of SEED) {
    if (HIDE.includes(name)) continue;
    const s = (await self(db, n))[0];
    const p = rows.find((r) => r.username === name);
    if (!s || s.rank !== p.rank || s.has_username !== true) consistent = false;
  }
  check('self_rank == page rank for every visible user', consistent);
  const hs = await self(db, 1);
  check('hidden user self_rank is safe: 1 row, rank null, level present, has_username true',
    hs.length === 1 && hs[0].rank === null && hs[0].player_level === '50' && hs[0].has_username === true, JSON.stringify(hs));
  const pu = await page(db, 'authenticated', U(2));
  check('is_requesting_user marks only the caller', pu.filter((r) => r.is_requesting_user).map((r) => r.username).join() === 'MazerMaster');
  const phid = await page(db, 'authenticated', U(1));
  check('hidden caller sees no is_requesting_user row', phid.every((r) => !r.is_requesting_user));
  check('unknown caller (no progression row) self_rank returns zero rows (unchanged)', (await self(db, 99)).length === 0);

  // grants/shape preserved
  const g = async (role, fn) => (await db.query(`select has_function_privilege('${role}', '${fn}', 'execute') x`)).rows[0].x;
  check('grants: page anon+authenticated yes, public/service_role per original', (await g('anon', 'mazer.mazer_leaderboard_page(integer,integer)')) && (await g('authenticated', 'mazer.mazer_leaderboard_page(integer,integer)')));
  check('grants: self_rank authenticated yes, anon no', (await g('authenticated', 'mazer.mazer_leaderboard_self_rank()')) && !(await g('anon', 'mazer.mazer_leaderboard_self_rank()')));
  const fm = (await db.query(`select proname, prosecdef, proconfig::text cfg, provolatile, pg_get_userbyid(proowner) o from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='mazer' and proname like 'mazer_leaderboard%' order by 1`)).rows;
  check('SECURITY DEFINER, search_path empty, STABLE, owner postgres on both', fm.length === 2 && fm.every((f) => f.prosecdef && f.provolatile === 's' && f.o === 'postgres' && /search_path/.test(f.cfg)), JSON.stringify(fm));
  const sig = (await db.query(`select proname, pg_get_function_arguments(oid) a, pg_get_function_result(oid) r from pg_proc where proname like 'mazer_leaderboard%' order by 1`)).rows;
  check('signatures unchanged', sig[0].a === 'p_limit integer DEFAULT 25, p_offset integer DEFAULT 0' && sig[0].r === 'TABLE(rank text, username text, player_level text, is_requesting_user boolean)' && sig[1].a === '' && sig[1].r === 'TABLE(rank text, player_level text, has_username boolean)');

  // 2. clients cannot set the flag
  await as(db, 'authenticated', U(10), () => db.query(`update mazer.mazer_profiles set leaderboard_hidden = true where user_id = $1`, [U(10)]));
  check('authenticated UPDATE own row set hidden=true is a no-op (stays false)', (await flagRows(db)).find((f) => f.username === 'someplayer').leaderboard_hidden === false);
  await as(db, 'authenticated', U(1), () => db.query(`update mazer.mazer_profiles set leaderboard_hidden = false, display_name = 'x' where user_id = $1`, [U(1)]));
  const r1 = (await db.query(`select leaderboard_hidden, display_name from mazer.mazer_profiles where user_id=$1`, [U(1)])).rows[0];
  check('authenticated UPDATE of a hidden row cannot unhide it (other columns still update)', r1.leaderboard_hidden === true && r1.display_name === 'x');
  await as(db, 'authenticated', U(20), () => db.query(`insert into mazer.mazer_profiles (user_id, username, leaderboard_hidden) values ($1,'newbie',true)`, [U(20)]));
  check('authenticated INSERT with hidden=true is forced to false', (await flagRows(db)).find((f) => f.username === 'newbie').leaderboard_hidden === false);
  await as(db, 'authenticated', U(10), () => db.query(`insert into mazer.mazer_profiles as t (user_id, username, leaderboard_hidden) values ($1,'someplayer',true) on conflict (user_id) do update set leaderboard_hidden = excluded.leaderboard_hidden`, [U(10)]));
  check('authenticated upsert cannot set hidden', (await flagRows(db)).find((f) => f.username === 'someplayer').leaderboard_hidden === false);
  await as(db, 'service_role', null, () => db.query(`update mazer.mazer_profiles set leaderboard_hidden = true where user_id = $1`, [U(10)]));
  check('service_role can set the flag (operator path)', (await flagRows(db)).find((f) => f.username === 'someplayer').leaderboard_hidden === true);
  await db.query(`update mazer.mazer_profiles set leaderboard_hidden = false where user_id = $1`, [U(10)]);
  check('postgres (migration/operator) can set the flag', (await flagRows(db)).find((f) => f.username === 'someplayer').leaderboard_hidden === false);
  const tg = (await db.query(`select has_function_privilege('authenticated','mazer.mazer_protect_leaderboard_hidden()','execute') x`)).rows[0].x;
  check('trigger function not directly executable by authenticated', tg === false);

  // 3. idempotent re-apply
  const afterOnce = await catalog(db);
  await db.exec(mig);
  check('re-apply is a clean no-op (catalog identical)', (await catalog(db)) === afterOnce);
  rows = await page(db);
  check('re-apply: page identical and contiguous', rows.length === 6 && rows.every((r, i) => r.rank === String(i + 1)));

  // 4. rollback restores the exact prior catalog
  await db.exec(rb);
  check('rollback: catalog (function md5/acl/owner/comment, columns, triggers, grants, policies) equals pre-apply', (await catalog(db)) === before);
  rows = await page(db);
  check('rollback: page shows all 10 again', rows.length === 10 && rows[0].username === 'mzr-qa-1112');
  await db.exec(rb.replace('begin;', 'begin;'));
  check('rollback is itself re-runnable', (await catalog(db)) === before);
  await db.exec(mig);
  check('apply after rollback works again', (await page(db)).length === 6);

  // 5. guard: drifted live body aborts the whole transaction, nothing changes
  db = await seeded();
  await db.exec(`create or replace function mazer.mazer_leaderboard_page(p_limit integer default 25, p_offset integer default 0)
    returns table (rank text, username text, player_level text, is_requesting_user boolean) language sql security definer set search_path = '' stable
    as $$ select '1'::text, 'x'::text, '1'::text, false $$;`);
  const driftBefore = await catalog(db);
  let err = null;
  try { await db.exec(mig); } catch (x) { err = x.message; }
  try { await db.exec('rollback'); } catch (_) { /* aborted tx */ }
  check('drifted page body: migration aborts with MAZER_LB_HIDE_PREIMAGE_DRIFT_PAGE', /MAZER_LB_HIDE_PREIMAGE_DRIFT_PAGE/.test(err || ''), err);
  check('drift abort leaves catalog untouched (no column, no trigger)', (await catalog(db)) === driftBefore);

  // 6. atomicity: a post-image failure (real player pre-flagged) rolls back EVERYTHING
  db = await seeded();
  await db.exec(`alter table mazer.mazer_profiles add column leaderboard_hidden boolean not null default false;
    update mazer.mazer_profiles set leaderboard_hidden = true where username = 'fawxzzy';`);
  const preFail = await catalog(db);
  err = null;
  try { await db.exec(mig); } catch (x) { err = x.message; }
  try { await db.exec('rollback'); } catch (_) { /* aborted tx */ }
  check('pre-flagged real player: post-image guard aborts', /MAZER_LB_HIDE_POSTIMAGE_(UNEXPECTED_HIDDEN|REAL_PLAYER_HIDDEN)/.test(err || ''), err);
  const postFail = await catalog(db);
  check('post-image abort rolls back the whole migration (functions + trigger unchanged)', postFail === preFail);

  // 7. fresh DB with none of the 4 usernames: applies cleanly, hides nobody
  db = new PGlite(); await db.exec(BASE); await db.exec(LIVE_FUNCS);
  await db.query(`insert into mazer.mazer_profiles (user_id, username) values ($1,'solo')`, [U(1)]);
  await db.query(`insert into mazer.mazer_progression_states (user_id, player_level) values ($1,3)`, [U(1)]);
  await db.exec(mig);
  check('replay on a DB without the QA accounts: clean, nobody hidden', (await page(db)).length === 1);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((x) => { console.error('HARNESS ERROR', x); process.exit(2); });
