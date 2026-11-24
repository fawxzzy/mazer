// Scratch test (in-memory Postgres via pglite 0.5.13; never touches Supabase) for
// docs/ops/sql-proposals/mazer-username-throttle-20261124/apply.sql and rollback.sql.
// Stand-ins (NOT live captures): roles, auth.users (id only), auth.uid() reading request.jwt.claim.sub,
// the applier role `owner_pg` (non-superuser, BYPASSRLS, owns the mazer objects; production's runner is
// `postgres`, also non-superuser with BYPASSRLS). REAL, from the live read-only capture of 2026-11-24:
// the three function bodies (byte exact, CRLF kept, md5 asserted) in live-bodies.json, and the profile
// table's columns, defaults, checks, unique index, FK, RLS (enabled + forced), policies, grants and the two
// existing triggers. Files under test run verbatim, as owner_pg.
// Usage: PGLITE_SANDBOX=<dir with node_modules/@electric-sql/pglite> node throttletest.cjs <repoRoot>
const { createRequire } = require('module');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sandbox = process.env.PGLITE_SANDBOX;
const { PGlite } = createRequire(path.join(sandbox, 'package.json'))('@electric-sql/pglite');
const root = process.argv[2];
const dir = 'docs/ops/sql-proposals/mazer-username-throttle-20261124';
const rd = (p) => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n');
const apply = rd(`${dir}/apply.sql`);
const rollback = rd(`${dir}/rollback.sql`);
const live = JSON.parse(fs.readFileSync(path.join(root, `${dir}/scratch-test/live-bodies.json`), 'utf8'));
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');
console.log('PGlite 0.5.13 (PostgreSQL 17 wasm), in-memory');
console.log(`### tested_file=${dir}/apply.sql sha256=${sha(apply)}`);
console.log(`### tested_file=${dir}/rollback.sql sha256=${sha(rollback)}`);
console.log(`### fixture=${dir}/scratch-test/live-bodies.json sha256=${sha(fs.readFileSync(path.join(root, `${dir}/scratch-test/live-bodies.json`), 'utf8'))}`);

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { (ok ? pass++ : fail++); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  [' + detail + ']' : ''}`); };
const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

// Live bodies must hash to the pins before anything is built from them.
check('fixture: set_username body md5 is the pin 1b1fae6c (CRLF kept)', md5(live.mazer_set_username.src) === '1b1fae6c5de66380e55f2f096f2de5cb' && live.mazer_set_username.cr_count === 31);
check('fixture: enforce_username_origin md5 is the pin 15faddd6', md5(live.mazer_enforce_username_origin.src) === '15faddd63b2eb3bc413f3751203ee961');
check('fixture: protect_leaderboard_hidden md5 is the pin a2d34bf2', md5(live.mazer_protect_leaderboard_hidden.src) === 'a2d34bf2c78cbcbcf0d1efc14c9a45f0');
check('repo copy of set_username differs from live (record only)', live.mazer_set_username.repo_20260827190000_md5_lf !== live.mazer_set_username.live_lf_md5,
  `repo(LF)=${live.mazer_set_username.repo_20260827190000_md5_lf} live(LF)=${live.mazer_set_username.live_lf_md5} live(stored)=${live.mazer_set_username.md5_stored}`);

const fnSql = (name, args, ret, body, definer) =>
  `create function mazer.${name}(${args}) returns ${ret} language plpgsql ${definer ? 'security definer ' : ''}set search_path = '' as $live$${body}$live$;`;

const BASE = `
create role anon; create role authenticated; create role service_role bypassrls; create role supabase_auth_admin;
create role owner_pg bypassrls;
create schema auth; create schema mazer authorization owner_pg;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role, supabase_auth_admin, owner_pg;
grant execute on function auth.uid() to anon, authenticated, service_role, owner_pg;
grant usage on schema mazer to anon, authenticated, service_role, supabase_auth_admin;
create table mazer.mazer_profiles (
  user_id uuid not null,
  display_name text,
  selected_control_mode text not null default 'stick',
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision bigint not null default 0,
  username text not null,
  username_origin text not null,
  leaderboard_hidden boolean not null default false,
  constraint mazer_profiles_pkey primary key (user_id),
  constraint mazer_profiles_user_fkey foreign key (user_id) references auth.users (id) on delete cascade,
  check (display_name is null or char_length(display_name) <= 64),
  check (revision >= 0),
  check (selected_control_mode = any (array['stick','arrows'])),
  check (jsonb_typeof(settings) = 'object'),
  check (username is null or (char_length(username) >= 2 and char_length(username) <= 15 and username ~ '^[a-zA-Z0-9._-]+$')),
  check (username_origin = any (array['generated','claimed']))
);
create unique index mazer_profiles_username_unique_idx on mazer.mazer_profiles (lower(username)) where username is not null;
alter table mazer.mazer_profiles owner to owner_pg;
alter table mazer.mazer_profiles enable row level security;
alter table mazer.mazer_profiles force row level security;
revoke all on mazer.mazer_profiles from public;
grant all on mazer.mazer_profiles to owner_pg;
grant select, insert, update on mazer.mazer_profiles to authenticated;
grant select (username) on mazer.mazer_profiles to supabase_auth_admin;
create policy mazer_profiles_owner_insert_r001 on mazer.mazer_profiles for insert to authenticated with check ((select auth.uid()) = user_id);
create policy mazer_profiles_owner_select_r001 on mazer.mazer_profiles for select to authenticated using ((select auth.uid()) = user_id);
create policy mazer_profiles_owner_update_r001 on mazer.mazer_profiles for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Mazer Auth hook can inspect usernames" on mazer.mazer_profiles for select to supabase_auth_admin using (true);
${fnSql('mazer_enforce_username_origin', '', 'trigger', live.mazer_enforce_username_origin.src, false)}
${fnSql('mazer_protect_leaderboard_hidden', '', 'trigger', live.mazer_protect_leaderboard_hidden.src, false)}
${fnSql('mazer_set_username', 'p_expected_user_id uuid, p_username text', 'text', live.mazer_set_username.src, true)}
alter function mazer.mazer_enforce_username_origin() owner to owner_pg;
alter function mazer.mazer_protect_leaderboard_hidden() owner to owner_pg;
alter function mazer.mazer_set_username(uuid, text) owner to owner_pg;
revoke all on function mazer.mazer_enforce_username_origin() from public;
revoke all on function mazer.mazer_protect_leaderboard_hidden() from public;
revoke all on function mazer.mazer_set_username(uuid, text) from public, anon;
grant execute on function mazer.mazer_set_username(uuid, text) to authenticated;
create trigger mazer_enforce_username_origin_before_update before update of username, username_origin on mazer.mazer_profiles
  for each row execute function mazer.mazer_enforce_username_origin();
create trigger mazer_protect_leaderboard_hidden_before_write before insert or update on mazer.mazer_profiles
  for each row execute function mazer.mazer_protect_leaderboard_hidden();
`;

const newDb = async () => {
  const db = new PGlite();
  await db.exec(BASE);
  for (let i = 1; i <= 8; i++) await db.exec(`insert into auth.users (id) values ('${U(i)}')`);
  // u1..u2 claimed, u3 generated, u4 claimed (for taken/other tests), u5 claimed, u6 claimed, u7 generated, u8 no profile
  const rows = [[1, 'Alpha1', 'claimed'], [2, 'Bravo2', 'claimed'], [3, 'mazer-000003', 'generated'], [4, 'Delta4', 'claimed'], [5, 'Echo5', 'claimed'], [6, 'Foxtrot6', 'claimed'], [7, 'mazer-000007', 'generated']];
  for (const [n, name, origin] of rows) await db.exec(`insert into mazer.mazer_profiles (user_id, display_name, username, username_origin) values ('${U(n)}', '${name}', '${name}', '${origin}')`);
  return db;
};

const mk = (db) => {
  const t = {};
  t.as = async (role, uid) => {
    await db.exec('reset role');
    await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid ?? '']);
    if (role) await db.exec(`set role ${role}`);
  };
  t.su = async () => { await db.exec('reset role'); await db.query(`select set_config('request.jwt.claim.sub', '', false)`); };
  t.runAs = async (role, sql) => { await t.su(); await db.exec(`set role ${role}`); try { return await db.exec(sql); } finally { await db.exec('reset role').catch(() => {}); } };
  t.try = async (sql, params) => { try { const r = await db.query(sql, params); return { ok: r.rows, n: r.affectedRows }; } catch (e) { return { err: e.message, code: e.code, detail: e.detail }; } };
  t.rename = async (n, name) => { await t.as('authenticated', U(n)); const r = await t.try('select mazer.mazer_set_username($1::uuid,$2::text) as r', [U(n), name]); await t.su(); return r; };
  t.patch = async (n, name) => { await t.as('authenticated', U(n)); const r = await t.try('update mazer.mazer_profiles set username = $1 where user_id = $2::uuid', [name, U(n)]); await t.su(); return r; };
  t.logCount = async (n) => { await t.su(); return Number((await db.query(`select count(*)::int c from mazer.mazer_username_changes ${n ? `where user_id='${U(n)}'` : ''}`)).rows[0].c); };
  t.username = async (n) => { await t.su(); return (await db.query(`select username, username_origin, display_name from mazer.mazer_profiles where user_id='${U(n)}'`)).rows[0]; };
  t.backdate = async (n, interval) => { await t.su(); await db.exec(`update mazer.mazer_username_changes set changed_at = changed_at - interval '${interval}' where user_id='${U(n)}'`); };
  t.applyAs = async (sql) => { await t.su(); await db.exec('set role owner_pg'); try { await db.exec(sql); return 'ok'; } catch (e) { await db.exec('rollback').catch(() => {}); return e.message; } finally { await db.exec('reset role').catch(() => {}); } };
  t.catalog = async () => {
    await t.su();
    const q = async (s) => JSON.stringify((await db.query(s)).rows);
    return [
      await q(`select c.relname, c.relkind, c.relrowsecurity, c.relforcerowsecurity, c.relacl::text, pg_get_userbyid(c.relowner) o from pg_class c where c.relnamespace='mazer'::regnamespace order by 1`),
      await q(`select p.proname, pg_get_function_identity_arguments(p.oid) a, md5(p.prosrc) m, p.prosecdef, p.proconfig::text, p.proacl::text, pg_get_userbyid(p.proowner) o from pg_proc p where p.pronamespace='mazer'::regnamespace order by 1,2`),
      await q(`select t.tgname, pg_get_triggerdef(t.oid) d, t.tgenabled from pg_trigger t where t.tgrelid='mazer.mazer_profiles'::regclass and not t.tgisinternal order by 1`),
      await q(`select conname, pg_get_constraintdef(oid) d from pg_constraint where connamespace='mazer'::regnamespace order by 1`),
      await q(`select indexname, indexdef from pg_indexes where schemaname='mazer' order by 1`),
      await q(`select polname, polcmd from pg_policy where polrelid='mazer.mazer_profiles'::regclass order by 1`),
      await q(`select a.attname, a.attacl::text from pg_attribute a where a.attrelid='mazer.mazer_profiles'::regclass and a.attnum>0 order by a.attnum`)
    ].join('\n');
  };
  return t;
};

(async () => {
  // ================= 0. preflight aborts (each on its own fresh database; nothing may be left behind)
  // baseline = objects the case itself pre-creates (a same-name table/function); apply must add nothing more.
  const abortCase = async (name, setup, expectRe, baseline = 0) => {
    const db = await newDb(); const t = mk(db);
    await t.su(); if (setup) await db.exec(setup);
    const out = await t.applyAs(apply);
    const objs = Number((await db.query(`select count(*)::int c from pg_class where relname='mazer_username_changes'`)).rows[0].c)
      + Number((await db.query(`select count(*)::int c from pg_proc where proname='mazer_throttle_username_change'`)).rows[0].c)
      + Number((await db.query(`select count(*)::int c from pg_trigger where tgname='mazer_throttle_username_change_before_update'`)).rows[0].c);
    check(`preflight aborts: ${name}`, expectRe.test(out) && objs === baseline, out.slice(0, 90));
    await db.close();
  };
  {
    const bare = new PGlite();
    const out = await bare.exec(apply).then(() => 'applied', (e) => e.message);
    check('preflight aborts: schema mazer missing', /MAZER_THROTTLE_PREIMAGE_MISSING_SCHEMA/.test(out), out.slice(0, 80));
    await bare.close();
  }
  await abortCase('set_username body drifted (one char added)',
    `create or replace function mazer.mazer_set_username(p_expected_user_id uuid, p_username text) returns text language plpgsql security definer set search_path = '' as $x$ begin return p_username; end; $x$;`,
    /MAZER_THROTTLE_PREIMAGE_SET_USERNAME_DRIFT/);
  await abortCase('set_username missing', `drop function mazer.mazer_set_username(uuid, text);`, /MAZER_THROTTLE_PREIMAGE_SET_USERNAME_DRIFT: missing/);
  await abortCase('origin trigger function drifted',
    `create or replace function mazer.mazer_enforce_username_origin() returns trigger language plpgsql set search_path = '' as $x$ begin return new; end; $x$;`,
    /MAZER_THROTTLE_PREIMAGE_ORIGIN_TRIGGER_DRIFT/);
  await abortCase('hidden-protect function drifted',
    `create or replace function mazer.mazer_protect_leaderboard_hidden() returns trigger language plpgsql set search_path = '' as $x$ begin return new; end; $x$;`,
    /MAZER_THROTTLE_PREIMAGE_HIDDEN_TRIGGER_DRIFT/);
  await abortCase('an unexpected extra trigger on the profile table',
    `create function mazer.noop() returns trigger language plpgsql as $x$ begin return new; end; $x$;
     create trigger zz_extra before update on mazer.mazer_profiles for each row execute function mazer.noop();`,
    /MAZER_THROTTLE_PREIMAGE_UNEXPECTED_TRIGGERS/);
  await abortCase('a same-name table with another shape', `create table mazer.mazer_username_changes (user_id uuid, note text);`, /MAZER_THROTTLE_PREIMAGE_UNEXPECTED_TABLE_SHAPE/, 1);
  await abortCase('same-name table, right columns, but no cascading FK / primary key',
    `create table mazer.mazer_username_changes (user_id uuid not null, changed_at timestamptz not null);`, /MAZER_THROTTLE_PREIMAGE_UNEXPECTED_TABLE_CONSTRAINTS/, 1);
  await abortCase('a same-name function with another signature',
    `create function mazer.mazer_throttle_username_change(x integer) returns integer language sql as $x$ select 1 $x$;`, /MAZER_THROTTLE_PREIMAGE_UNEXPECTED_FUNCTION/, 1);
  await abortCase('username column missing from profiles', `alter table mazer.mazer_profiles drop column username_origin cascade;`, /MAZER_THROTTLE_PREIMAGE_PROFILE_COLUMNS|PREIMAGE_ORIGIN_TRIGGER|PREIMAGE_UNEXPECTED_TRIGGERS/);

  // ================= 1. apply on the faithful stub
  const db = await newDb(); const t = mk(db);
  const preCatalog = await t.catalog();
  const a1 = await t.applyAs(apply);
  check('apply runs clean as the non-superuser applier', a1 === 'ok', a1.slice(0, 100));
  await t.su();
  const lt = (await db.query('show lock_timeout')).rows[0].lock_timeout;
  check('lock_timeout / statement_timeout were transaction-local (session back to default)', lt === '0' || lt === '0ms', `lock_timeout=${lt}`);
  check('apply text sets local lock_timeout 3s', /set local lock_timeout = '3s';/.test(apply));
  const shape = (await db.query(`select
    (select relrowsecurity from pg_class where oid='mazer.mazer_username_changes'::regclass) rls,
    (select relacl::text from pg_class where oid='mazer.mazer_username_changes'::regclass) tacl,
    (select proacl::text from pg_proc where oid='mazer.mazer_throttle_username_change()'::regprocedure) facl,
    (select prosecdef from pg_proc where oid='mazer.mazer_throttle_username_change()'::regprocedure) def,
    (select proconfig::text from pg_proc where oid='mazer.mazer_throttle_username_change()'::regprocedure) cfg,
    (select count(*)::int from pg_policy where polrelid='mazer.mazer_username_changes'::regclass) pol,
    (select count(*)::int from pg_trigger where tgrelid='mazer.mazer_profiles'::regclass and not tgisinternal) trg`)).rows[0];
  check('log table: RLS on, no policy, ACL only the owner', shape.rls === true && shape.pol === 0 && shape.tacl === '{owner_pg=arwdDxtm/owner_pg}', shape.tacl);
  check('trigger function: definer, search_path empty, ACL only the owner', shape.def === true && /^\{"?search_path=\\?"\\?""?\}$/.test(shape.cfg) && shape.facl === '{owner_pg=X/owner_pg}', shape.facl);
  check('profile table now has 3 triggers', shape.trg === 3);
  const fnMd5 = async () => (await db.query(`select (select md5(prosrc) from pg_proc where oid='mazer.mazer_set_username(uuid,text)'::regprocedure) a, (select md5(prosrc) from pg_proc where oid='mazer.mazer_enforce_username_origin()'::regprocedure) b, (select md5(prosrc) from pg_proc where oid='mazer.mazer_protect_leaderboard_hidden()'::regprocedure) c`)).rows[0];
  const m = await fnMd5();
  check('the three guarded live bodies are byte-identical after apply', m.a === '1b1fae6c5de66380e55f2f096f2de5cb' && m.b === '15faddd63b2eb3bc413f3751203ee961' && m.c === 'a2d34bf2c78cbcbcf0d1efc14c9a45f0');

  // ---- client-role access to the new objects
  await t.as('authenticated', U(1));
  for (const [what, sql] of [['select', 'select * from mazer.mazer_username_changes'], ['insert', `insert into mazer.mazer_username_changes values ('${U(1)}', now())`], ['delete', 'delete from mazer.mazer_username_changes'], ['call function', 'select mazer.mazer_throttle_username_change()']]) {
    const r = await t.try(sql);
    check(`authenticated cannot ${what} on the new objects`, !!r.err && /permission denied/.test(r.err), (r.err || 'allowed').slice(0, 70));
  }
  await t.as('anon');
  const ra = await t.try('select * from mazer.mazer_username_changes');
  check('anon cannot read the log table', !!ra.err && /permission denied/.test(ra.err));
  await t.as('service_role');
  const rs = await t.try('select * from mazer.mazer_username_changes');
  check('service_role has no grant on the log table (bypassrls does not bypass privileges)', !!rs.err && /permission denied/.test(rs.err));
  await t.su();

  // ---- old behaviours of the untouched RPC
  let r = await t.rename(1, 'x');
  check('RPC invalid name (1 char) still 22023 MAZER_USERNAME_INVALID', r.code === '22023' && /MAZER_USERNAME_INVALID/.test(r.err || ''), r.code);
  r = await t.rename(1, 'bad name!');
  check('RPC invalid characters still 22023', r.code === '22023');
  await t.as('authenticated', U(1));
  r = await t.try('select mazer.mazer_set_username($1::uuid,$2::text)', [U(2), 'Whatever1']);
  check('RPC account mismatch still 28000', r.code === '28000', r.code);
  await t.as('authenticated', U(8));
  r = await t.try('select mazer.mazer_set_username($1::uuid,$2::text)', [U(8), 'Whatever1']);
  check('RPC without a profile row still P0002 MAZER_PROFILE_MISSING', r.code === 'P0002', r.code);
  await t.as(null, '');
  r = await t.try('select mazer.mazer_set_username($1::uuid,$2::text)', [U(1), 'Whatever1']);
  check('RPC without a JWT (auth.uid() null) is not executable for the superuser path either way: account mismatch 28000', r.code === '28000', r.code);
  await t.su();

  // ---- same name: no throttle, no log (even though the account is about to be blocked)
  r = await t.rename(1, 'Alpha1');
  check('same-name call returns the name, nothing logged', r.ok && r.ok[0].r === 'Alpha1' && (await t.logCount(1)) === 0);

  // ---- u1 (claimed): first change logs, second inside 24h is blocked with the contract fields
  r = await t.rename(1, 'Alpha2');
  check('claimed account: first change succeeds and is logged', r.ok && r.ok[0].r === 'Alpha2' && (await t.logCount(1)) === 1);
  check('rename also moved display_name (live body behaviour kept)', (await t.username(1)).display_name === 'Alpha2');
  r = await t.rename(1, 'Alpha3');
  const retryDay = Number(/retry_after_seconds=(\d+) window=(day|week)/.exec(r.detail || '')?.[1] ?? -1);
  check('second change within 24h: SQLSTATE PT429 MAZER_USERNAME_RATE_LIMITED', r.code === 'PT429' && /MAZER_USERNAME_RATE_LIMITED/.test(r.err || ''), `${r.code} ${r.err}`);
  check('block detail carries retry_after_seconds (~24h) and window=day', retryDay > 86300 && retryDay <= 86400 && /window=day/.test(r.detail || ''), r.detail);
  check('blocked attempt changed nothing and logged nothing', (await t.username(1)).username === 'Alpha2' && (await t.logCount(1)) === 1);
  r = await t.rename(1, 'Alpha2');
  check('same-name call while blocked still succeeds (no budget burn, no error)', r.ok && r.ok[0].r === 'Alpha2' && (await t.logCount(1)) === 1);
  r = await t.rename(1, 'x');
  check('invalid name while blocked is still 22023 (validation first)', r.code === '22023', r.code);

  // ---- direct table write is throttled by the same trigger
  r = await t.patch(1, 'Alpha9');
  check('direct UPDATE of username by the owner is throttled too (PT429)', r.code === 'PT429', r.code + ' ' + (r.err || ''));
  await t.as('authenticated', U(1));
  r = await t.try('update mazer.mazer_profiles set revision = revision + 1, settings = $1::jsonb where user_id = $2::uuid', ['{"a":1}', U(1)]);
  await t.su();
  check('direct UPDATE of other columns is unaffected while rename-blocked', !r.err && r.n === 1, r.err);
  await t.as('authenticated', U(1));
  r = await t.try(`insert into mazer.mazer_profiles (user_id, username, username_origin) values ($1::uuid, 'Upsert1', 'claimed') on conflict (user_id) do update set username = excluded.username`, [U(1)]);
  await t.su();
  check('upsert (INSERT ... ON CONFLICT DO UPDATE SET username) hits the same throttle', r.code === 'PT429', `${r.code || 'allowed'} ${r.err || ''}`);
  await t.as('authenticated', U(2));
  r = await t.try('update mazer.mazer_profiles set username = $1 where user_id = $2::uuid', ['Hijack1', U(1)]);
  await t.su();
  check("another user cannot write someone's row (RLS: 0 rows, nothing logged)", !r.err && r.n === 0 && (await t.logCount(2)) === 0, r.err);

  // ---- window expiry (day)
  await t.backdate(1, '23 hours');
  r = await t.rename(1, 'Alpha3');
  const retry23 = Number(/retry_after_seconds=(\d+)/.exec(r.detail || '')?.[1] ?? -1);
  check('after 23h still blocked, retry_after about 1h', r.code === 'PT429' && retry23 > 3500 && retry23 <= 3600, String(retry23));
  await t.backdate(1, '2 hours');
  r = await t.rename(1, 'Alpha3');
  check('after 25h the change is allowed and logged (2 rows)', r.ok && r.ok[0].r === 'Alpha3' && (await t.logCount(1)) === 2);

  // ---- weekly bound: 3 per rolling 7 days
  await t.backdate(1, '25 hours');
  r = await t.rename(1, 'Alpha4');
  check('third change inside 7 days is allowed (day window clear)', r.ok && (await t.logCount(1)) === 3);
  await t.backdate(1, '25 hours');
  r = await t.rename(1, 'Alpha5');
  const w = /retry_after_seconds=(\d+) window=(day|week)/.exec(r.detail || '');
  check('fourth change inside 7 days: blocked, window=week, retry = oldest-of-three + 7d (about 3.9 days here)', r.code === 'PT429' && w && w[2] === 'week' && Number(w[1]) > 3600 * 24 * 2.5 && Number(w[1]) < 3600 * 24 * 4.1, r.detail);
  check('weekly block changed nothing', (await t.username(1)).username === 'Alpha4' && (await t.logCount(1)) === 3);
  await t.backdate(1, '100 hours');
  r = await t.rename(1, 'Alpha5');
  check('once the oldest of the three leaves the 7-day window the change is allowed', r.ok && r.ok[0].r === 'Alpha5');
  // setup (not a check): plant a 40-day-old row, then age the recent ones so the next change is allowed
  await t.su(); await db.exec(`insert into mazer.mazer_username_changes values ('${U(1)}', now() - interval '40 days')`);
  const planted = Number((await db.query(`select count(*)::int c from mazer.mazer_username_changes where user_id='${U(1)}' and changed_at < now() - interval '30 days'`)).rows[0].c);
  await t.backdate(1, '2 days');
  r = await t.rename(1, 'Alpha6');
  const old = Number((await db.query(`select count(*)::int c from mazer.mazer_username_changes where user_id='${U(1)}' and changed_at < now() - interval '30 days'`)).rows[0].c);
  check('...and it is gone after that change (rename allowed or blocked-no-prune is distinguished)', planted === 1 && old === 0 && !!r.ok, `planted=${planted} rename=${r.code || 'ok'} old_rows=${old}`);

  // ---- first claim away from a generated handle is free and not logged
  r = await t.rename(3, 'Charlie3');
  const u3 = await t.username(3);
  check('generated handle: first claim is free, not logged, origin becomes claimed', r.ok && u3.username === 'Charlie3' && u3.username_origin === 'claimed' && (await t.logCount(3)) === 0, JSON.stringify(u3));
  r = await t.rename(3, 'Charlie4');
  check('...the next change is logged (budget starts now)', r.ok && (await t.logCount(3)) === 1);
  r = await t.rename(3, 'Charlie5');
  check('...and the one after is blocked', r.code === 'PT429');
  // direct patch on a generated account: free once, then throttled
  r = await t.patch(7, 'Golf7');
  check('direct UPDATE on a generated account is also the free first claim', !r.err && (await t.logCount(7)) === 0 && (await t.username(7)).username_origin === 'claimed', r.err);

  // ---- taken name: unique violation rolls the log row back
  r = await t.rename(5, 'delta4');
  check('taken name (case-insensitive) is 23505 and spends no budget', r.code === '23505' && (await t.logCount(5)) === 0, `${r.code} log=${await t.logCount(5)}`);
  r = await t.rename(5, 'Echo55');
  check('...so the next valid change still works', r.ok && (await t.logCount(5)) === 1);

  // ---- case-only change counts as a change
  r = await t.rename(6, 'foxtrot6');
  check('case-only change is a change (logged)', r.ok && (await t.logCount(6)) === 1);
  r = await t.rename(6, 'FOXTROT6');
  check('...and a second case-only change inside 24h is blocked', r.code === 'PT429');

  // ---- budgets are per account
  r = await t.rename(2, 'Bravo3');
  check("another account's budget is independent (u2 can change while u1/u3/u5/u6 are spent)", r.ok && (await t.logCount(2)) === 1);

  // ---- exempt: ops (no auth.uid())
  await t.su();
  const before = await t.logCount(4);
  await db.exec(`update mazer.mazer_profiles set username = 'Ops4' where user_id = '${U(4)}'`);
  await db.exec(`update mazer.mazer_profiles set username = 'Ops44' where user_id = '${U(4)}'`);
  check('SQL-runner rename (auth.uid() null) is exempt and not logged, even repeated', (await t.username(4)).username === 'Ops44' && (await t.logCount(4)) === before);
  await t.runAs('owner_pg', `update mazer.mazer_profiles set username = 'Ops45' where user_id = '${U(4)}'`);
  check('applier role rename without JWT is exempt too', (await t.username(4)).username === 'Ops45' && (await t.logCount(4)) === 0);
  // ---- account deletion removes the log with the profile (cascade)
  await t.su();
  const had = await t.logCount(1);
  await db.exec(`delete from mazer.mazer_profiles where user_id = '${U(1)}'`);
  check('deleting a profile cascades its log rows', had > 0 && (await t.logCount(1)) === 0, `had=${had}`);
  await db.exec(`insert into auth.users (id) values ('${U(9)}')`).catch(() => {});

  // ---- idempotent re-apply keeps rows and converges
  const rowsBefore = await t.logCount();
  const catBefore = await t.catalog();
  const a2 = await t.applyAs(apply);
  check('re-apply over a live install is accepted (idempotent)', a2 === 'ok', a2.slice(0, 100));
  check('re-apply keeps every log row', (await t.logCount()) === rowsBefore, `${rowsBefore}`);
  check('re-apply leaves the catalog identical', (await t.catalog()) === catBefore);

  // ---- rollback with rows keeps the table, drops the throttle
  const rbRows = await t.applyAs(rollback);
  check('rollback with log rows runs clean', rbRows === 'ok', rbRows.slice(0, 100));
  const afterRb = (await db.query(`select (select count(*)::int from pg_trigger where tgname='mazer_throttle_username_change_before_update') trg, (select count(*)::int from pg_proc where proname='mazer_throttle_username_change') fn, (select count(*)::int from pg_class where relname='mazer_username_changes') tbl`)).rows[0];
  check('...throttle trigger and function gone, table KEPT (it holds rows)', afterRb.trg === 0 && afterRb.fn === 0 && afterRb.tbl === 1 && (await t.logCount()) === rowsBefore, JSON.stringify(afterRb));
  r = await t.rename(2, 'Bravo4');
  check('...and renames are unthrottled again', r.ok && r.ok[0].r === 'Bravo4');
  const a3 = await t.applyAs(apply);
  check('re-apply after a kept-table rollback works and reuses the table', a3 === 'ok' && (await t.logCount()) === rowsBefore, a3.slice(0, 100));
  r = await t.rename(2, 'Bravo5');
  check('...throttle is live again (the logged Bravo3 change is inside 24h, so Bravo5 is blocked)', r.code === 'PT429');

  // ---- rollback on an empty log restores the pre-apply catalog exactly
  await t.su(); await db.exec('delete from mazer.mazer_username_changes');
  const rbEmpty = await t.applyAs(rollback);
  check('rollback on an empty log runs clean', rbEmpty === 'ok', rbEmpty.slice(0, 100));
  check('catalog after rollback equals the catalog before apply (functions md5, ACLs, triggers, tables, policies, indexes)', (await t.catalog()) === preCatalog);
  const rb2 = await t.applyAs(rollback);
  check('rollback is itself re-runnable (no-op)', rb2 === 'ok', rb2.slice(0, 100));
  await db.close();

  // ================= 2. mutation probes: the tests above must be able to fail
  const probe = async (name, mutate, scenario) => {
    const src = mutate(apply);
    if (src === apply) { check(`mutant ${name}: mutation applied`, false, 'pattern not found'); return; }
    const d = await newDb(); const tt = mk(d);
    const out = await tt.applyAs(src);
    const verdict = out === 'ok' ? await scenario(tt, d) : (/MAZER_THROTTLE_POSTIMAGE/.test(out) ? true : 'apply-failed:' + out.slice(0, 60));
    check(`mutant ${name} is detected (by behaviour or by the apply postimage)`, verdict === true, String(verdict));
    await d.close();
  };
  await probe('weekly limit 3 -> 100', (s) => s.replace('c_week_limit constant integer := 3', 'c_week_limit constant integer := 100'), async (tt, d) => {
    for (let i = 0; i < 4; i++) { const r = await tt.rename(1, `Mut${i}`); if (r.err && i < 3) return 'unexpected block'; await tt.backdate(1, '25 hours'); }
    return (await tt.logCount(1)) === 4; // mutant lets a 4th change through, the real SQL blocks it
  });
  await probe('no auth.uid() exemption', (s) => s.replace('if (select auth.uid()) is null then', 'if false then'), async (tt, d) => {
    await tt.su(); await d.exec(`update mazer.mazer_profiles set username = 'OpsM1' where user_id = '${U(4)}'`);
    return (await tt.logCount(4)) === 1;
  });
  await probe('generated handle not free', (s) => s.replace("if old.username_origin = 'generated' then", 'if false then'), async (tt) => {
    await tt.rename(3, 'Charlie3');
    return (await tt.logCount(3)) === 1;
  });
  await probe('no WHEN clause / no distinct guard (same name would burn budget)', (s) => s.replace(/  if new\.username is not distinct from old\.username then\n    return new;\n  end if;\n/, '').replace('  when (new.username is distinct from old.username)\n', ''), async (tt) => {
    await tt.rename(1, 'Alpha1');
    return (await tt.logCount(1)) === 1;
  });
  await probe('error code reverted to 54000 (would reach clients as HTTP 500)', (s) => s.replace("errcode = 'PT429'", "errcode = '54000'"), async (tt) => {
    await tt.rename(1, 'Alpha2'); const r = await tt.rename(1, 'Alpha3');
    return r.code === '54000';
  });
  await probe('log insert removed (no budget is ever spent)', (s) => s.replace('insert into mazer.mazer_username_changes (user_id, changed_at) values (old.user_id, v_now);', 'null;'), async (tt) => {
    await tt.rename(1, 'Alpha2'); const r = await tt.rename(1, 'Alpha3');
    return !!r.ok && (await tt.logCount(1)) === 0;
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(2); });
