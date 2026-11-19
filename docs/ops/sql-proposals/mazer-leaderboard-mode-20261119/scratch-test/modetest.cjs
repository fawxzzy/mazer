// Scratch test (in-memory Postgres via pglite 0.5.13; never touches Supabase) for
// supabase/migrations/20260828170000_mazer_leaderboard_game_mode.sql and its rollback.
// Stand-ins (NOT live captures): roles, auth.uid(), mazer.mazer_profiles and
// mazer.mazer_progression_states DDL reduced to the columns the leaderboard reads, the profile RLS /
// grants / username-origin trigger as in the hide-QA scratch stub, a stand-in completion function
// that inserts a progression row WITHOUT naming mode. Real files run verbatim: the repo copy of the
// two leaderboard bodies from 20260824170159_mazer_master_runtime_contracts.sql (md5-equal to live
// before hide-QA), then 20260828160000 (hide-QA, applied live 2026-11-16), then the proposal and its rollback.
// Usage: PGLITE_SANDBOX=<dir with node_modules/@electric-sql/pglite> node modetest.cjs <repoRoot>
const { createRequire } = require('module');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sandbox = process.env.PGLITE_SANDBOX;
const { PGlite } = createRequire(path.join(sandbox, 'package.json'))('@electric-sql/pglite');
const root = process.argv[2];
const rd = (p) => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n');
const rc = rd('supabase/migrations/20260824170159_mazer_master_runtime_contracts.sql');
const hide = rd('supabase/migrations/20260828160000_mazer_leaderboard_hide_qa_accounts.sql');
const mig = rd('supabase/migrations/20260828170000_mazer_leaderboard_game_mode.sql');
const rb = rd('docs/ops/sql-proposals/mazer-leaderboard-mode-20261119/rollback.sql');
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');
console.log('PGlite 0.5.13 (PostgreSQL 17 wasm), in-memory');
console.log('apply    sha256 (LF):', sha(mig));
console.log('rollback sha256 (LF):', sha(rb));
console.log('hide-QA  sha256 (LF):', sha(hide));

const a = rc.indexOf('create or replace function mazer.mazer_leaderboard_page(');
const e0 = rc.indexOf('comment on function mazer.mazer_leaderboard_self_rank is\n');
const PRE_HIDE_FUNCS = rc.slice(a, rc.indexOf(';\n', e0) + 2);
const bodies = [...hide.matchAll(/as \$\$([\s\S]*?)\$\$;/g)].map((m) => m[1]);
console.log('post-hide-QA md5 page/self (pinned in apply file):', md5(bodies[1]), md5(bodies[2]));

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
create index mazer_progression_states_player_level_idx on mazer.mazer_progression_states (player_level);
alter table mazer.mazer_profiles enable row level security;
alter table mazer.mazer_profiles force row level security;
revoke all on mazer.mazer_profiles from anon, authenticated, service_role;
grant select, insert, update on mazer.mazer_profiles to authenticated;
grant select, insert, update, delete on mazer.mazer_profiles to service_role;
create policy own_select on mazer.mazer_profiles for select to authenticated using ((select auth.uid()) = user_id);
create policy own_update on mazer.mazer_profiles for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter table mazer.mazer_progression_states enable row level security;
alter table mazer.mazer_progression_states force row level security;
revoke all on mazer.mazer_progression_states from anon, authenticated, service_role;
grant select on mazer.mazer_progression_states to authenticated;
grant select, insert, update, delete on mazer.mazer_progression_states to service_role;
-- stand-in for the completion functions: SECURITY DEFINER, INSERT list does not name mode
create function mazer.stub_complete(p_user uuid, p_level bigint) returns void language sql security definer set search_path = '' as
  $$ insert into mazer.mazer_progression_states (user_id, player_level, level_reached_at) values (p_user, p_level, now())
     on conflict (user_id) do update set player_level = excluded.player_level $$;
alter function mazer.stub_complete(uuid, bigint) owner to postgres;
grant execute on function mazer.stub_complete(uuid, bigint) to authenticated;
`;

const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const SEED = [
  [1, 'mzr-qa-1112', 50, '2026-01-01'], [2, 'MazerMaster', 40, '2026-01-02'], [3, 'claude', 40, '2026-01-01'],
  [4, 'fawxzzy', 30, '2026-02-01'], [5, 'cqa-a-1105', 30, null], [6, 'cudding_muisc', 30, null],
  [7, 'cuddlingmuisc', 12, '2026-03-01'], [8, 'mzr-qa-2', 5, '2026-03-02'], [9, 'Mazer-269110', 5, '2026-03-03'],
  [10, 'someplayer', 1, '2026-04-01'],
];
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { (ok ? pass++ : fail++); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  [' + detail + ']' : ''}`); };

// Live state before this proposal = repo bodies + hide-QA applied.
async function liveState() {
  const db = new PGlite();
  await db.exec(BASE);
  await db.exec(PRE_HIDE_FUNCS + `
    alter function mazer.mazer_leaderboard_page(integer, integer) owner to postgres;
    alter function mazer.mazer_leaderboard_self_rank() owner to postgres;`);
  for (const [n, name, lvl, at] of SEED) {
    await db.query('insert into mazer.mazer_profiles (user_id, username) values ($1,$2)', [U(n), name]);
    await db.query('insert into mazer.mazer_progression_states (user_id, player_level, level_reached_at) values ($1,$2,$3)', [U(n), lvl, at]);
  }
  await db.exec(hide);
  return db;
}
async function as(db, role, uid, fn) {
  await db.exec(`set role ${role}`);
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid || '']);
  try { return await fn(); } finally { await db.exec('reset role'); }
}
const page = (db, role = 'anon', uid = null, lim = 100, off = 0) =>
  as(db, role, uid, async () => (await db.query('select * from mazer.mazer_leaderboard_page($1,$2)', [lim, off])).rows);
const self = (db, n) => as(db, 'authenticated', U(n), async () => (await db.query('select * from mazer.mazer_leaderboard_self_rank()')).rows);
async function catalog(db) {
  const q = async (s) => (await db.query(s)).rows;
  return JSON.stringify({
    funcs: await q(`select p.proname, md5(p.prosrc) m, (select string_agg(x::text, ',' order by x::text) from unnest(p.proacl) x) acl, p.prosecdef, p.proconfig::text cfg,
      pg_get_userbyid(p.proowner) o, obj_description(p.oid,'pg_proc') d, pg_get_function_result(p.oid) r, p.provolatile
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='mazer' order by 1`),
    cols: await q(`select column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema='mazer' and table_name='mazer_progression_states' order by ordinal_position`),
    idx: await q(`select indexname, indexdef from pg_indexes where schemaname='mazer' and tablename='mazer_progression_states' order by 1`),
    con: await q(`select conname, pg_get_constraintdef(oid) d from pg_constraint where conrelid='mazer.mazer_progression_states'::regclass order by 1`),
    acl: await q(`select relacl::text from pg_class where relname='mazer_progression_states'`),
  });
}
const aborts = async (db, sql, code) => {
  try { await db.exec(sql); return false; } catch (e) {
    // psql ends the session on error, which rolls the open transaction back; do the same here.
    try { await db.exec('rollback'); } catch { /* none open */ }
    return String(e.message).includes(code);
  }
};

(async () => {
  let db = await liveState();
  let before = await page(db);
  check('baseline (post hide-QA): 6 visible accounts', before.length === 6, before.map((r) => r.username).join(','));
  check('baseline: live-pin md5 matches the repo post-hide-QA bodies',
    md5((await db.query(`select prosrc from pg_proc where oid='mazer.mazer_leaderboard_page(integer,integer)'::regprocedure`)).rows[0].prosrc) === md5(bodies[1])
    && md5((await db.query(`select prosrc from pg_proc where oid='mazer.mazer_leaderboard_self_rank()'::regprocedure`)).rows[0].prosrc) === md5(bodies[2]));
  const selfBefore = [];
  for (const [n] of SEED) selfBefore.push(JSON.stringify(await self(db, n)));
  const cat0 = await catalog(db);

  // 1. apply
  await db.exec(mig);
  const after = await page(db);
  check('page identical before and after apply (same rows, ranks, order)', JSON.stringify(after) === JSON.stringify(before));
  const selfAfter = [];
  for (const [n] of SEED) selfAfter.push(JSON.stringify(await self(db, n)));
  check('self_rank identical before and after apply for all 10 accounts', JSON.stringify(selfAfter) === JSON.stringify(selfBefore));
  const modes = (await db.query(`select mode, count(*)::int c from mazer.mazer_progression_states group by 1`)).rows;
  check('backfill: every existing row is endless', modes.length === 1 && modes[0].mode === 'endless' && modes[0].c === 10, JSON.stringify(modes));
  const col = (await db.query(`select is_nullable, column_default, data_type from information_schema.columns where table_name='mazer_progression_states' and column_name='mode'`)).rows[0];
  check('column is text not null default endless', col && col.is_nullable === 'NO' && col.column_default === "'endless'::text" && col.data_type === 'text', JSON.stringify(col));
  const catA = JSON.parse(await catalog(db));
  const catB = JSON.parse(cat0);
  check('function ACL, owner, security definer, config, comments, return types unchanged by apply',
    JSON.stringify(catA.funcs.map((f) => ({ ...f, m: 0 }))) === JSON.stringify(catB.funcs.map((f) => ({ ...f, m: 0 }))));
  check('function bodies changed (md5 differs) for the two leaderboard functions only',
    catA.funcs.filter((f, i) => f.m !== catB.funcs[i].m).map((f) => f.proname).join() === 'mazer_leaderboard_page,mazer_leaderboard_self_rank');
  check('table ACL unchanged (no new grant)', JSON.stringify(catA.acl) === JSON.stringify(catB.acl));
  check('index mode_level_idx exists', catA.idx.some((i) => i.indexname === 'mazer_progression_states_mode_level_idx' && /\(mode, player_level DESC, level_reached_at, user_id\)/.test(i.indexdef)), JSON.stringify(catA.idx.map((i) => i.indexname)));
  // index is usable for the endless ranking scan
  await db.exec('set enable_seqscan = off');
  const plan = (await db.query(`explain select user_id from mazer.mazer_progression_states where mode='endless' order by player_level desc, level_reached_at asc nulls last, user_id`)).rows.map((r) => Object.values(r)[0]).join('\n');
  await db.exec('reset enable_seqscan');
  check('planner can use the new index for the endless ordering (seqscan disabled)', /mazer_progression_states_mode_level_idx/.test(plan));

  // 2. new rows get endless through the completion path; clients cannot set mode
  await db.query('insert into mazer.mazer_profiles (user_id, username) values ($1,$2)', [U(11), 'newplayer']);
  await as(db, 'authenticated', U(11), async () => db.query('select mazer.stub_complete($1, 60)', [U(11)]));
  const newMode = (await db.query('select mode from mazer.mazer_progression_states where user_id=$1', [U(11)])).rows[0];
  check('a row created by a completion function without naming mode is endless', newMode.mode === 'endless');
  const top = await page(db);
  check('the new endless row appears at rank 1 (level 60)', top[0].username === 'newplayer' && top[0].rank === '1');
  let denied = false;
  try { await as(db, 'authenticated', U(2), async () => db.query(`update mazer.mazer_progression_states set mode='zen' where user_id=$1`, [U(2)])); } catch (e) { denied = /permission denied/.test(e.message); }
  check('authenticated cannot update the mode column (no write grant)', denied);
  let shapeRejected = false;
  try { await db.query(`update mazer.mazer_progression_states set mode='Bad Mode' where user_id=$1`, [U(2)]); } catch (e) { shapeRejected = /mazer_progression_states_mode_check/.test(e.message); }
  check('shape check rejects a malformed mode', shapeRejected);
  const nullRejected = await aborts(db, `update mazer.mazer_progression_states set mode=null where user_id='${U(2)}'`, 'not-null');
  check('null mode rejected', nullRejected);

  // 3. a row of another mode never ranks in Endless (future-proofing the filter)
  await db.exec(`update mazer.mazer_progression_states set mode='zen' where user_id='${U(2)}'`);
  const pz = await page(db);
  check('a non-endless row is excluded from the page', !pz.some((r) => r.username === 'MazerMaster') && pz.every((r, i) => r.rank === String(i + 1)), pz.map((r) => r.username).join(','));
  const sz = await self(db, 2);
  check('and has no endless self rank (zero rows)', sz.length === 0, JSON.stringify(sz));
  await db.exec(`update mazer.mazer_progression_states set mode='endless' where user_id='${U(2)}'`);

  // 4. idempotent re-apply
  const cat1 = await catalog(db);
  await db.exec(mig);
  check('re-apply is a no-op (catalog unchanged)', (await catalog(db)) === cat1);

  // 5. rollback
  await db.exec(rb);
  const cat2 = await catalog(db);
  check('catalog after rollback equals catalog before apply (functions, columns, indexes, constraints, ACL)', cat2 === cat0);
  const pr = await page(db);
  check('after rollback the page shows the same accounts as post-hide-QA plus the new player', pr.length === 7 && pr[0].username === 'newplayer', pr.map((r) => r.username).join(','));
  await db.exec(mig); // apply again after rollback works
  check('apply after rollback succeeds', (await page(db)).length === 7);

  // 6. abort tests (each leaves the database unchanged)
  const drift = await liveState();
  await drift.exec(`create or replace function mazer.mazer_leaderboard_page(p_limit integer default 25, p_offset integer default 0)
    returns table (rank text, username text, player_level text, is_requesting_user boolean) language sql security definer set search_path = '' stable
    as $$ select '1'::text, 'x'::text, '1'::text, false $$;`);
  const c0 = await catalog(drift);
  check('drifted page body aborts MAZER_LB_MODE_PREIMAGE_DRIFT_PAGE', await aborts(drift, mig, 'MAZER_LB_MODE_PREIMAGE_DRIFT_PAGE'));
  check('abort leaves the database unchanged', (await catalog(drift)) === c0);

  const noHide = new PGlite();
  await noHide.exec(BASE); await noHide.exec(PRE_HIDE_FUNCS);
  await noHide.exec(`alter table mazer.mazer_profiles add column leaderboard_hidden boolean not null default false`);
  check('pre-hide-QA function bodies abort (hide-QA must be applied first)', await aborts(noHide, mig, 'MAZER_LB_MODE_PREIMAGE_DRIFT'));
  const noCol = new PGlite();
  await noCol.exec(BASE); await noCol.exec(PRE_HIDE_FUNCS);
  check('missing leaderboard_hidden column aborts MAZER_LB_MODE_PREIMAGE_HIDE_QA_NOT_APPLIED', await aborts(noCol, mig, 'MAZER_LB_MODE_PREIMAGE_HIDE_QA_NOT_APPLIED'));
  const noFn = await liveState();
  await noFn.exec('drop function mazer.mazer_leaderboard_self_rank()');
  check('missing self_rank function aborts the apply', await aborts(noFn, mig, 'mazer_leaderboard_self_rank'));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERROR', e); process.exit(2); });
