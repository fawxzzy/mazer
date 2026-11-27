// Scratch test (in-memory Postgres via pglite 0.5.13; never touches Supabase) for
// docs/ops/sql-proposals/mazer-help-requests-20261126/apply.sql, rollback.sql and the two ops/ files.
// Stand-ins (NOT live captures): roles anon/authenticated/service_role, auth.users (id only), auth.uid()
// reading request.jwt.claim.sub, schema mazer with a reduced mazer_profiles (user_id, username) for the read
// file. The applier is pglite's superuser `postgres` (production's runner is NOT a superuser; section 13 uses
// a non-superuser, non-BYPASSRLS owner, and the PG17 harness run in pg17/ covers the real runner shape).
// Files under test run verbatim (CRLF normalised to LF, the bytes that are hashed and applied).
// Usage: PGLITE_SANDBOX=<dir with node_modules/@electric-sql/pglite> node helptest.cjs <repoRoot>
const { createRequire } = require('module');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pathToFileURL } = require('url');
const sandbox = process.env.PGLITE_SANDBOX;
const { PGlite } = createRequire(path.join(sandbox, 'package.json'))('@electric-sql/pglite');
const root = process.argv[2];
const dir = 'docs/ops/sql-proposals/mazer-help-requests-20261126';
const rd = (p) => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n');
const apply = rd(`${dir}/apply.sql`);
const rollback = rd(`${dir}/rollback.sql`);
const readFile = rd(`${dir}/ops/read-open-help-requests.sql`);
const closeFile = rd(`${dir}/ops/close-help-request.sql`);
const volumeFile = rd(`${dir}/ops/read-help-intake-last-hour.sql`);
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const pgliteVersion = JSON.parse(fs.readFileSync(path.join(sandbox, 'node_modules/@electric-sql/pglite/package.json'), 'utf8')).version;
console.log(`PGlite ${pgliteVersion} (PostgreSQL 17 wasm), in-memory`);
console.log(`### tested_file=${dir}/apply.sql sha256=${sha(apply)}`);
console.log(`### tested_file=${dir}/rollback.sql sha256=${sha(rollback)}`);
console.log(`### tested_file=${dir}/ops/read-open-help-requests.sql sha256=${sha(readFile)}`);
console.log(`### tested_file=${dir}/ops/close-help-request.sql sha256=${sha(closeFile)}`);
console.log(`### tested_file=${dir}/ops/read-help-intake-last-hour.sql sha256=${sha(volumeFile)}`);

const BASE = `
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create schema mazer;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth, mazer to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
create table mazer.mazer_profiles (user_id uuid primary key references auth.users (id) on delete cascade, username text);
`;
const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const FN = 'mazer.mazer_submit_help_request_v1(text,text,text,integer,text)';
const T = 'mazer.mazer_help_requests';
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { (ok ? pass++ : fail++); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  [' + detail + ']' : ''}`); };
const checkViolations = [];

(async () => {
  const screen = await import(pathToFileURL(path.join(root, 'scripts/db-scratch/lib/sql-screen.mjs')).href);
  const db = new PGlite();
  await db.exec(BASE);
  for (let i = 1; i <= 6; i++) await db.exec(`insert into auth.users (id) values ('${U(i)}')`);
  await db.exec(`insert into mazer.mazer_profiles (user_id, username) values ('${U(1)}', 'player_one')`);

  const as = async (role, uid) => {
    await db.exec('reset role');
    await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid ?? '']);
    if (role) await db.exec(`set role ${role}`);
  };
  const su = async () => { await db.exec('reset role'); await db.query(`select set_config('request.jwt.claim.sub', '', false)`); };
  const rpc = async (args) => {
    const p = [args[0] ?? null, args[1] ?? null, args[2] ?? null, args[3] ?? null, args[4] ?? null];
    const r = await db.query('select mazer.mazer_submit_help_request_v1($1::text,$2::text,$3::text,$4::integer,$5::text) as r', p);
    return r.rows[0].r;
  };
  const tryRpc = async (args) => {
    try { return { ok: await rpc(args) }; } catch (e) {
      if (e.code === '23514') checkViolations.push(e.message);
      return { err: e.message, code: e.code, detail: e.detail ?? '' };
    }
  };
  const tryExec = async (sql) => { try { const r = await db.query(sql); return { ok: r.rows }; } catch (e) { return { err: e.message, code: e.code }; } };
  const count = async (where = 'true') => { await su(); return Number((await db.query(`select count(*)::int c from ${T} where ${where}`)).rows[0].c); };
  const wipe = async () => { await su(); await db.exec(`delete from ${T}`); };
  const catalog = async () => {
    await su();
    const q = async (s) => JSON.stringify((await db.query(s)).rows);
    return [
      await q(`select c.relname, c.relkind, c.relrowsecurity, c.relacl::text from pg_class c where c.relnamespace='mazer'::regnamespace order by 1`),
      await q(`select attrelid::regclass::text t, attname, attacl::text from pg_attribute where attrelid in (select oid from pg_class where relnamespace='mazer'::regnamespace) and attacl is not null order by 1,2`),
      await q(`select p.proname, pg_get_function_identity_arguments(p.oid) a, p.proacl::text from pg_proc p where p.pronamespace='mazer'::regnamespace order by 1,2`),
      await q(`select conname from pg_constraint where connamespace='mazer'::regnamespace order by 1`),
      await q(`select polname from pg_policy order by 1`)
    ].join('\n');
  };
  const fresh = async (setup, sql) => {
    const m = new PGlite();
    await m.exec(BASE);
    const out = await m.exec(setup + sql).then(() => 'applied', (e) => e.message);
    await m.exec('rollback').catch(() => {});
    await m.close();
    return out;
  };

  // ---- 0. preflight aborts
  const preCatalog = await catalog();
  const bare = new PGlite();
  const bareRun = await bare.exec(apply).then(() => 'applied', (e) => e.message);
  check('preflight aborts when schema mazer is missing', /MAZER_HELP_PREIMAGE_MISSING_SCHEMA/.test(bareRun), bareRun.slice(0, 80));
  await bare.close();
  const noAuth = await fresh('drop schema auth cascade;\n', apply);
  check('preflight aborts when auth.users is missing', /MAZER_HELP_PREIMAGE_MISSING_AUTH_USERS/.test(noAuth), noAuth.slice(0, 80));
  const overload = await fresh(`create function mazer.mazer_submit_help_request_v1(integer) returns integer language sql as 'select 1';\n`, apply);
  check('preflight aborts on a same-name function of any signature', /MAZER_HELP_PREIMAGE_FUNCTION_EXISTS/.test(overload), overload.slice(0, 80));
  const foreign = await fresh(`create table mazer.mazer_help_requests (x int);\n`, apply);
  check('preflight aborts on a pre-existing mazer_help_requests table of any shape', /MAZER_HELP_PREIMAGE_TABLE_EXISTS/.test(foreign), foreign.slice(0, 80));

  // ---- 1. apply
  await db.exec(apply);
  const postCatalog = await catalog();
  check('apply runs clean (as superuser postgres in pglite)', true);
  check('apply changed the catalog', postCatalog !== preCatalog);

  // ---- 2. ACL / RLS / shape
  await su();
  const acl = (await db.query(`select
    has_table_privilege('anon','${T}','select,insert,update,delete,truncate,references,trigger') a_any,
    has_table_privilege('authenticated','${T}','select,insert,update,delete,truncate,references,trigger') u_any,
    has_any_column_privilege('anon','${T}','select,insert,update,references') a_col,
    has_any_column_privilege('authenticated','${T}','select,insert,update,references') u_col,
    has_table_privilege('service_role','${T}','select') s_sel, has_table_privilege('service_role','${T}','delete') s_del,
    has_table_privilege('service_role','${T}','insert') s_ins, has_table_privilege('service_role','${T}','update') s_upd_tbl,
    has_column_privilege('service_role','${T}','status','update') s_upd_status, has_column_privilege('service_role','${T}','closed_at','update') s_upd_closed,
    has_column_privilege('service_role','${T}','message','update') s_upd_msg, has_column_privilege('service_role','${T}','contact_email','update') s_upd_email,
    has_function_privilege('public','${FN}','execute') pub,
    has_function_privilege('anon','${FN}','execute') anon_x,
    has_function_privilege('authenticated','${FN}','execute') auth_x,
    (select relrowsecurity from pg_class where oid='${T}'::regclass) rls,
    (select relforcerowsecurity from pg_class where oid='${T}'::regclass) forced,
    (select count(*)::int from pg_policy where polrelid='${T}'::regclass) pol,
    (select prosecdef from pg_proc where proname='mazer_submit_help_request_v1') secdef,
    (select proconfig::text from pg_proc where proname='mazer_submit_help_request_v1') cfg,
    (select pg_get_userbyid(proowner) from pg_proc where proname='mazer_submit_help_request_v1') fn_owner,
    (select pg_get_userbyid(relowner) from pg_class where oid='${T}'::regclass) tbl_owner,
    (select confdeltype::text from pg_constraint where conrelid='${T}'::regclass and contype='f') fk_action,
    (select attnotnull from pg_attribute where attrelid='${T}'::regclass and attname='user_id') uid_nn,
    (select pg_get_function_arguments(oid) from pg_proc where proname='mazer_submit_help_request_v1') args`)).rows[0];
  check('anon and authenticated have no table or column privilege', !acl.a_any && !acl.u_any && !acl.a_col && !acl.u_col, JSON.stringify(acl));
  check('service_role: select + delete, UPDATE only on status and closed_at, no insert', acl.s_sel && acl.s_del && !acl.s_ins && !acl.s_upd_tbl && acl.s_upd_status && acl.s_upd_closed && !acl.s_upd_msg && !acl.s_upd_email);
  check('function: public denied; anon AND authenticated allowed (guests and players)', !acl.pub && acl.anon_x && acl.auth_x);
  check('RLS on, not forced, zero policies', acl.rls && !acl.forced && acl.pol === 0);
  check('function is SECURITY DEFINER with empty search_path and lock_timeout=3s', acl.secdef && /search_path=\\?"\\?"/.test(acl.cfg) && /lock_timeout=3s/.test(acl.cfg), acl.cfg);
  check('FK is ON DELETE CASCADE, user_id NULLABLE, function and table share an owner', acl.fk_action === 'c' && acl.uid_nn === false && acl.fn_owner === acl.tbl_owner, JSON.stringify([acl.fk_action, acl.uid_nn, acl.fn_owner, acl.tbl_owner]));
  check('the RPC has no user-id parameter (cannot file as someone else)', !/user/.test(acl.args), acl.args);

  // ---- 3. guest submit
  await as('anon', null);
  const g1 = await rpc(['  Guest.Person@Example.com \n', '\n  My progress vanished.\nLine two.  \n', 'abc1234', 63, 'endless']);
  check('guest (anon) submit -> {"status":"saved"}', g1.status === 'saved', JSON.stringify(g1));
  await su();
  const grow = (await db.query(`select * from ${T}`)).rows[0];
  check('guest row: user_id NULL, email trimmed with case kept, message trimmed with inner newline kept, context, status open', grow.user_id === null && grow.contact_email === 'Guest.Person@Example.com' && grow.message === 'My progress vanished.\nLine two.' && grow.build_id === 'abc1234' && grow.player_level === 63 && grow.game_mode === 'endless' && grow.status === 'open' && grow.closed_at === null && !!grow.created_at, JSON.stringify(grow));

  // ---- 4. signed-in submit
  await as('authenticated', U(1));
  const s1 = await rpc(['p1@example.com', 'Signed in question']);
  check('signed-in submit -> saved', s1.status === 'saved');
  check('signed-in row carries user_id from auth.uid()', (await count(`user_id='${U(1)}' and message='Signed in question'`)) === 1);
  await as('authenticated', null);
  const noUid = await rpc(['nouid@example.com', 'authenticated role without a uid']);
  check('authenticated role with no auth.uid() is stored as a guest (user_id NULL), not refused', noUid.status === 'saved' && (await count(`contact_email='nouid@example.com' and user_id is null`)) === 1);

  // ---- 5. email validation (and the email is never echoed)
  await wipe();
  await as('anon', null);
  const badEmails = [null, '', '   ', 'a', 'ab', 'no-at-sign.com', 'a@b', 'a b@c.de', 'a@@b.co', 'a@b@c.co', '@b.co', 'a@.', 'a@b.', `tab\tin@x.io`, `ctl\u0001x@x.io`, 'x'.repeat(250) + '@b.co'];
  for (const e of badEmails) {
    const r = await tryRpc([e, 'hello']);
    const echoed = typeof e === 'string' && e.trim().length > 2 && ((r.err ?? '').includes(e.trim()) || (r.detail ?? '').includes(e.trim()));
    check(`email ${JSON.stringify(e === null ? null : e.length > 30 ? e.slice(0, 12) + '...(' + e.length + ')' : e)} -> MAZER_HELP_BAD_EMAIL 22023, not echoed`, /^MAZER_HELP_BAD_EMAIL$/.test(r.err ?? '') && r.code === '22023' && !echoed, `${r.err ?? JSON.stringify(r.ok)} ${r.code ?? ''}`);
  }
  const e254 = 'x'.repeat(249) + '@b.co';
  check('254-character email accepted (boundary)', e254.length === 254 && (await rpc([e254, 'long address'])).status === 'saved');
  check('255-character email rejected', /MAZER_HELP_BAD_EMAIL/.test((await tryRpc(['y'.repeat(250) + '@b.co', 'x'])).err ?? ''));
  check('padded email that is valid after trimming is accepted', (await rpc(['\t ok@pad.io \r\n', 'padded'])).status === 'saved' && (await count(`contact_email='ok@pad.io'`)) === 1);
  check('unicode email (IDN-style) accepted as typed', (await rpc(['jürgen@bücher.de', 'umlaut'])).status === 'saved');
  check('rejected emails stored nothing (3 rows saved in this block)', (await count()) === 3);

  // ---- 6. message validation
  await wipe();
  await as('anon', null);
  for (const m of [null, '', '   ', ' \n\t\r ']) {
    const r = await tryRpc([`m${Math.random().toString(36).slice(2, 8)}@x.io`, m]);
    check(`message ${JSON.stringify(m)} -> MAZER_HELP_MESSAGE_EMPTY 22023`, r.err === 'MAZER_HELP_MESSAGE_EMPTY' && r.code === '22023', `${r.err ?? JSON.stringify(r.ok)}`);
  }
  const m2000 = 'm'.repeat(2000), m2001 = 'm'.repeat(2001);
  check('2000-character message accepted (boundary)', (await rpc(['len1@x.io', m2000])).status === 'saved');
  const r2001 = await tryRpc(['len2@x.io', m2001]);
  check('2001-character message -> MAZER_HELP_MESSAGE_TOO_LONG 22001, text not echoed', r2001.err === 'MAZER_HELP_MESSAGE_TOO_LONG' && r2001.code === '22001' && !(r2001.detail ?? '').includes('mmmm'), `${r2001.err} ${r2001.code}`);
  check('2001 characters padded with whitespace still rejected', /MAZER_HELP_MESSAGE_TOO_LONG/.test((await tryRpc(['len3@x.io', `  ${m2001}\n`])).err ?? ''));
  check('2000 emoji accepted (cap counts characters, not bytes)', (await rpc(['emoji@x.io', '\u{1F600}'.repeat(2000)])).status === 'saved');
  check('a 1-character message is accepted', (await rpc(['one@x.io', '?'])).status === 'saved');
  check('markup is stored verbatim as plain text', (await rpc(['html@x.io', '<script>alert(1)</script> =HYPERLINK("x")'])).status === 'saved' && (await count(`message='<script>alert(1)</script> =HYPERLINK("x")'`)) === 1);

  // ---- 7. context sanitised, never rejected
  await wipe();
  await as('anon', null);
  check('bad context still saves', (await rpc(['ctx@x.io', 'ctx', 'bad id with spaces!', -5, 'DROP TABLE x'])).status === 'saved');
  await su();
  const crow = (await db.query(`select * from ${T}`)).rows[0];
  check('bad build id / level / mode -> NULL', crow.build_id === null && crow.player_level === null && crow.game_mode === null, JSON.stringify(crow));
  await as('anon', null);
  await rpc(['ctx2@x.io', 'ctx2', 'v1.2.3+sha', 1000001, 'daily_2']);
  await su();
  const crow2 = (await db.query(`select * from ${T} where contact_email='ctx2@x.io'`)).rows[0];
  check('level above cap -> NULL; v1.2.3+sha build and daily_2 mode kept', crow2.player_level === null && crow2.build_id === 'v1.2.3+sha' && crow2.game_mode === 'daily_2');

  // ---- 8. rate limits
  // 8a. per signed-in user: 3/hour (different emails, so only the user budget applies)
  await wipe();
  await as('authenticated', U(2));
  const outs = [];
  for (let i = 0; i < 5; i++) outs.push(await rpc([`u2-${i}@x.io`, `n${i}`]));
  check('per user: first 3 saved, 4th and 5th rate_limited', outs.slice(0, 3).every((o) => o.status === 'saved') && outs[3].status === 'rate_limited' && outs[4].status === 'rate_limited', outs.map((o) => o.status).join(','));
  check('per user: retry_after_seconds in (0, 3600]', outs[3].retry_after_seconds > 0 && outs[3].retry_after_seconds <= 3600, String(outs[3].retry_after_seconds));
  check('rate-limited calls stored nothing (3 rows)', (await count(`user_id='${U(2)}'`)) === 3);
  await as('authenticated', U(3));
  check('another user is unaffected by user 2 budget', (await rpc(['u3@x.io', 'hi'])).status === 'saved');
  await su(); await db.exec(`update ${T} set created_at = created_at - interval '61 minutes' where user_id='${U(2)}'`);
  await as('authenticated', U(2));
  check('per user: after the hour passes, user 2 can send again', (await rpc(['u2-new@x.io', 'again'])).status === 'saved');
  // 8b. per user daily 10
  await wipe();
  for (let i = 0; i < 10; i++) await db.exec(`insert into ${T} (user_id, contact_email, message, created_at) values ('${U(2)}', 'd${i}@x.io', 'old', now() - interval '${61 + i * 60} minutes')`);
  await as('authenticated', U(2));
  const day = await rpc(['d-new@x.io', 'eleventh']);
  check('per user: 11th within 24h refused by the daily cap (hour budget empty), wait > 1h', day.status === 'rate_limited' && day.retry_after_seconds > 3600, JSON.stringify(day));
  // 8c. per email: 3/hour, case-insensitive, across guests and players
  await wipe();
  await as('anon', null);
  const em = [];
  em.push(await rpc(['Same@Mail.io', 'one']));
  em.push(await rpc(['same@mail.io', 'two']));
  await as('authenticated', U(4));
  em.push(await rpc(['SAME@MAIL.IO', 'three (signed in)']));
  await as('anon', null);
  em.push(await rpc([' sAmE@mAiL.iO ', 'four (mixed case, padded)']));
  check('per email: 3 per hour counted case-insensitively across guests and players, 4th (mixed case) rate_limited', em.slice(0, 3).every((o) => o.status === 'saved') && em[3].status === 'rate_limited', em.map((o) => o.status).join(','));
  check('per email: a different address from the same guest still works', (await rpc(['other@mail.io', 'five'])).status === 'saved');
  await as('authenticated', U(5));
  check('per email: also binds a signed-in player with a fresh user budget', (await rpc(['same@mail.io', 'six'])).status === 'rate_limited');
  // 8d. per email daily 10
  await wipe();
  for (let i = 0; i < 10; i++) await db.exec(`insert into ${T} (contact_email, message, created_at) values ('daily@x.io', 'old', now() - interval '${61 + i * 60} minutes')`);
  await as('anon', null);
  const eday = await rpc(['Daily@X.io', 'eleventh']);
  check('per email: 11th within 24h refused by the daily cap, wait > 1h', eday.status === 'rate_limited' && eday.retry_after_seconds > 3600, JSON.stringify(eday));
  // 8e. guest pool 30/hour: guests refused, signed-in players still served
  await wipe();
  for (let i = 0; i < 29; i++) await db.exec(`insert into ${T} (contact_email, message, created_at) values ('g${i}@x.io', 'guest', now() - make_interval(secs => ${3500 - i * 60}))`);
  await as('anon', null);
  check('guest pool: the 30th guest message in the hour is saved (boundary)', (await rpc(['g29@x.io', 'thirtieth'])).status === 'saved');
  const g31 = await rpc(['g30@x.io', 'thirty-first']);
  check('guest pool: the 31st guest message is rate_limited (fresh address)', g31.status === 'rate_limited' && g31.retry_after_seconds > 0 && g31.retry_after_seconds <= 3600, JSON.stringify(g31));
  await as('authenticated', U(3));
  check('guest pool full: a signed-in player can still send', (await rpc(['player@x.io', 'player while guests are flooded'])).status === 'saved');
  check('guest pool: refused guest stored nothing (30 guest rows)', (await count('user_id is null')) === 30);
  // 8f. global 90/hour (30 players x 3 each fill it without touching the per-user cap)
  await wipe();
  for (let i = 1; i <= 30; i++) await db.exec(`insert into auth.users (id) values ('${U(100 + i)}') on conflict do nothing`);
  for (let i = 0; i < 89; i++) await db.exec(`insert into ${T} (user_id, contact_email, message, created_at) values ('${U(101 + (i % 30))}', 'glob${i}@x.io', 'x', now() - make_interval(secs => ${3540 - i * 39}))`);
  await as('authenticated', U(3));
  check('global: the 90th message in the hour is saved (boundary)', (await rpc(['g90@x.io', 'ninetieth'])).status === 'saved');
  await as('authenticated', U(4));
  const p91 = await rpc(['g91@x.io', 'ninety-first']);
  await as('anon', null);
  const a91 = await rpc(['g92@x.io', 'guest ninety-first']);
  check('global: the 91st is rate_limited for a fresh player AND a guest', p91.status === 'rate_limited' && a91.status === 'rate_limited' && p91.retry_after_seconds <= 3600, JSON.stringify([p91, a91]));
  check('global: refused calls stored nothing (90 rows in the hour)', (await count(`created_at > now() - interval '1 hour'`)) === 90);
  await su(); await db.exec(`update ${T} set created_at = created_at - interval '2 hours' where id in (select id from ${T} order by created_at limit 2)`);
  await as('anon', null);
  check('global: after rows age past the hour the budget frees up', (await rpc(['g63@x.io', 'later'])).status === 'saved');
  // 8g. longest wait wins: user hour (~10 min left) + email day (~23 h left)
  await wipe();
  for (let i = 0; i < 10; i++) await db.exec(`insert into ${T} (contact_email, message, created_at) values ('long@x.io', 'old', now() - interval '${60 + i} minutes')`);
  for (let i = 0; i < 3; i++) await db.exec(`insert into ${T} (user_id, contact_email, message, created_at) values ('${U(2)}', 'lw${i}@x.io', 'old', now() - interval '${50 - i} minutes')`);
  await as('authenticated', U(2));
  const both = await rpc(['long@x.io', 'x']);
  check('two limits used up: the retry is the LONGER wait (> 20h, <= 24h)', both.status === 'rate_limited' && both.retry_after_seconds > 20 * 3600 && both.retry_after_seconds <= 24 * 3600, JSON.stringify(both));
  // 8g'. long wait found FIRST: user day (checked 2nd, ~23 h left) then email hour (checked 3rd, ~10 min left).
  // A plain assignment instead of greatest() would answer the later, SHORTER wait; the mutant below proves it.
  const longFirstSetup = (q) => q(`insert into ${T} (user_id, contact_email, message, created_at) select '${U(2)}', 'ud' || i || '@x.io', 'old', now() - make_interval(mins => 61 + i) from generate_series(0, 9) i`)
    .then(() => q(`insert into ${T} (contact_email, message, created_at) select 'short@x.io', 'old', now() - make_interval(mins => 50 - i) from generate_series(0, 2) i`));
  await wipe();
  await longFirstSetup((s) => db.exec(s));
  await as('authenticated', U(2));
  const longFirst = await rpc(['short@x.io', 'x']);
  check('long wait checked first, short wait later: the retry is still the LONGER wait (> 20h)', longFirst.status === 'rate_limited' && longFirst.retry_after_seconds > 20 * 3600 && longFirst.retry_after_seconds <= 24 * 3600, JSON.stringify(longFirst));
  {
    const noGreatest = apply.replace(/v_retry := greatest\(v_retry,\n\s+(ceil\([^;]+\)::integer)\);/g, 'v_retry := $1;');
    const m = new PGlite();
    await m.exec(BASE);
    await m.exec(`insert into auth.users (id) values ('${U(2)}')`);
    await m.exec(noGreatest);
    await longFirstSetup((s) => m.exec(s));
    await m.query(`select set_config('request.jwt.claim.sub', $1, false)`, [U(2)]);
    await m.exec('set role authenticated');
    const mr = (await m.query(`select mazer.mazer_submit_help_request_v1('short@x.io', 'x') r`)).rows[0].r;
    await m.close();
    check('MUTANT: greatest() replaced by plain assignment answers the SHORT wait (the case above bites)', noGreatest !== apply && (noGreatest.match(/greatest\(v_retry/g) ?? []).length === 0 && mr.status === 'rate_limited' && mr.retry_after_seconds <= 3600, JSON.stringify(mr));
  }
  // 8g''. early count: a call refused by the first (unlocked) count never takes the advisory lock; a saved
  // call does. Observed inside one transaction (an xact advisory lock is held until commit/rollback).
  {
    const advisoryHeld = async (args) => {
      await db.exec('begin');
      const r = (await db.query('select mazer.mazer_submit_help_request_v1($1::text, $2::text) r', args)).rows[0].r;
      const n = Number((await db.query(`select count(*)::int c from pg_catalog.pg_locks where locktype = 'advisory' and pid = pg_catalog.pg_backend_pid()`)).rows[0].c);
      await db.exec('rollback');
      return { status: r.status, locks: n };
    };
    await wipe();
    await as('anon', null);
    const okCall = await advisoryHeld(['lockprobe@x.io', 'saved path']);
    await su();
    for (let i = 0; i < 3; i++) await db.exec(`insert into ${T} (contact_email, message) values ('lockprobe@x.io', 'old')`);
    await as('anon', null);
    const refused = await advisoryHeld(['lockprobe@x.io', 'refused path']);
    check('early count: a saved call holds the advisory lock; a refused call answers without it', okCall.status === 'saved' && okCall.locks === 1 && refused.status === 'rate_limited' && refused.locks === 0, JSON.stringify([okCall, refused]));
    await su();
  }
  // 8h. limits are checked AFTER validation: a bad call never consumes budget nor takes the lock path
  await wipe();
  await as('anon', null);
  for (let i = 0; i < 5; i++) await tryRpc(['bad', 'x']);
  check('invalid calls consume no budget (a valid call afterwards is saved)', (await rpc(['after@x.io', 'ok'])).status === 'saved' && (await count()) === 1);

  // ---- 9. RLS / privileges: nobody reads or writes directly
  await wipe();
  await as('authenticated', U(1)); await rpc(['secret1@x.io', 'secret one']);
  await as('anon', null); await rpc(['secret2@x.io', 'secret two']);
  for (const [role, uid] of [['authenticated', U(1)], ['anon', null]]) {
    await as(role, uid);
    const sel = await tryExec(`select * from ${T}`);
    check(`direct SELECT denied (${role})`, /permission denied/.test(sel.err ?? ''), sel.err ?? JSON.stringify(sel.ok));
    const ins = await tryExec(`insert into ${T} (contact_email, message) values ('d@x.io', 'direct')`);
    const upd = await tryExec(`update ${T} set status = 'closed', closed_at = now()`);
    const del = await tryExec(`delete from ${T}`);
    check(`direct INSERT, UPDATE, DELETE denied (${role})`, /permission denied/.test(ins.err ?? '') && /permission denied/.test(upd.err ?? '') && /permission denied/.test(del.err ?? ''));
  }
  await su(); await db.exec(`grant select, insert, update, delete on ${T} to anon, authenticated`);
  await as('anon', null);
  const sel2 = await tryExec(`select * from ${T}`);
  check('MUTANT (grant added by mistake): RLS still returns 0 rows to anon', Array.isArray(sel2.ok) && sel2.ok.length === 0, sel2.err ?? `rows=${sel2.ok?.length}`);
  const ins2 = await tryExec(`insert into ${T} (contact_email, message) values ('d@x.io', 'direct')`);
  check('MUTANT: RLS still blocks a direct insert', /row-level security/.test(ins2.err ?? ''), ins2.err ?? '');
  await su(); await db.exec(`revoke all on ${T} from anon, authenticated`);

  // ---- 10. service_role (owner-side tooling)
  await as('service_role', null);
  const srv = await tryExec(`select count(*)::int c from ${T}`);
  check('service_role sees both rows', srv.ok && srv.ok[0].c === 2, srv.err ?? '');
  const srvClose = await tryExec(`update ${T} set status = 'closed', closed_at = now() where contact_email = 'secret2@x.io' returning id`);
  check('service_role can close a message (status + closed_at)', Array.isArray(srvClose.ok) && srvClose.ok.length === 1, srvClose.err ?? '');
  const srvMsg = await tryExec(`update ${T} set message = 'rewritten'`);
  const srvEmail = await tryExec(`update ${T} set contact_email = 'z@z.io'`);
  check('service_role can NOT rewrite message or email', /permission denied/.test(srvMsg.err ?? '') && /permission denied/.test(srvEmail.err ?? ''));
  const srvIns = await tryExec(`insert into ${T} (contact_email, message) values ('s@x.io', 'srv')`);
  check('service_role can NOT insert directly', /permission denied/.test(srvIns.err ?? ''));
  const srvHalf = await tryExec(`update ${T} set status = 'closed' where status = 'open'`);
  check('closing without closed_at is refused by the table (status/closed_at check)', /mazer_help_requests_closed_at_check/.test(srvHalf.err ?? ''), srvHalf.err ?? '');

  // ---- 11. table constraints as defence in depth (superuser, bypasses the function)
  await su();
  const tc = async (cols, vals) => (await tryExec(`insert into ${T} (${cols}) values (${vals})`)).err ?? 'inserted';
  check('table rejects an empty / padded message', /message_check/.test(await tc('contact_email, message', `'a@b.co', ''`)) && /message_check/.test(await tc('contact_email, message', `'a@b.co', ' x '`)));
  check('table rejects a 2001-character message', /message_check/.test(await tc('contact_email, message', `'a@b.co', '${m2001}'`)));
  check('table rejects a malformed or padded email', /email_check/.test(await tc('contact_email, message', `'nope', 'x'`)) && /email_check/.test(await tc('contact_email, message', `' a@b.co', 'x'`)));
  check('table rejects NULL email and NULL message', /null value/.test(await tc('message', `'x'`)) && /null value/.test(await tc('contact_email', `'a@b.co'`)));
  check('table rejects an unknown status and a closed row without closed_at', /status_check/.test(await tc('contact_email, message, status, closed_at', `'a@b.co', 'x', 'pending', null`)) &&/closed_at_check/.test(await tc('contact_email, message, status', `'a@b.co', 'x', 'closed'`)));
  check('table rejects an open row with closed_at', /closed_at_check/.test(await tc('contact_email, message, closed_at', `'a@b.co', 'x', now()`)));
  check('table rejects a user id that is not in auth.users (FK)', /foreign key/.test(await tc('user_id, contact_email, message', `'${U(999)}', 'a@b.co', 'x'`)));
  check('no call through the function ever reached a table CHECK (no row echo in errors)', checkViolations.length === 0, checkViolations.join(' | ').slice(0, 120));

  // ---- 12. the function never echoes input: every error message is a bare code
  await as('anon', null);
  const echoProbe = [['leak-probe@x.io', ''], ['leak probe@x.io', 'x'], ['leak-probe@x.io', 'L'.repeat(2001)]];
  let bareCodes = true;
  for (const [e, m] of echoProbe) { const r = await tryRpc([e, m]); if (!/^MAZER_HELP_[A-Z_]+$/.test(r.err ?? '') || /leak/.test(`${r.err} ${r.detail}`)) bareCodes = false; }
  check('error messages are bare MAZER_HELP_* codes with no input in message or detail', bareCodes);
  // A still-valid JWT of a DELETED account: auth.uid() names a user that no longer exists, so the insert hits
  // the FK (23503). Its detail names the caller's OWN user id (from their token) and nothing they typed.
  await wipe();
  await as('authenticated', U(999));
  const stale = await tryRpc(['stale-jwt@x.io', 'stale token message']);
  check('deleted account with a still-valid JWT: 23503 whose detail holds only the caller\'s own user id, no email or message', stale.code === '23503' && stale.detail.includes(U(999)) && !/stale-jwt|stale token/.test(`${stale.err} ${stale.detail}`) && (await count()) === 0, JSON.stringify(stale));

  // ---- 13. non-superuser, non-BYPASSRLS owner (closer to production's runner)
  await su();
  await db.exec(`create role help_owner nologin; grant usage on schema auth, mazer to help_owner;
    alter table ${T} owner to help_owner; alter function ${FN} owner to help_owner;`);
  await wipe();
  await as('anon', null);
  const nb = await tryRpc(['owner@x.io', 'owner without bypassrls']);
  await as('authenticated', U(1));
  const nb2 = await tryRpc(['owner2@x.io', 'owner without bypassrls, signed in']);
  check('RPC works for guest and player when the owner is not superuser and has no BYPASSRLS (RLS not forced)', nb.ok?.status === 'saved' && nb2.ok?.status === 'saved', `${nb.err ?? ''} ${nb2.err ?? ''}`);
  await su();
  await db.exec(`alter function ${FN} owner to postgres; alter table ${T} owner to postgres; revoke usage on schema auth, mazer from help_owner; drop role help_owner;`);

  // ---- 14. account deletion deletes that account's messages (cascade), guests' and others' stay
  await wipe();
  await as('authenticated', U(6)); await rpc(['bye@x.io', 'bye']);
  await as('authenticated', U(5)); await rpc(['stay@x.io', 'stay']);
  await as('anon', null); await rpc(['guest@x.io', 'guest stays']);
  await su(); await db.exec(`delete from auth.users where id='${U(6)}'`);
  check("deleting an account deletes that account's messages, not other players' or guests'", (await count(`message='bye'`)) === 0 && (await count(`message='stay'`)) === 1 && (await count(`message='guest stays'`)) === 1);

  // ---- 15. ops files
  check('read file passes the read-only wrapper screen, one statement', screen.screenReadOnly(readFile).length === 0 && screen.countStatements(readFile) === 1, JSON.stringify(screen.screenReadOnly(readFile)));
  check('close file is refused by the read-only screen (it is a write)', screen.screenReadOnly(closeFile).includes('update'));
  await wipe();
  await as('authenticated', U(1)); await rpc(['p1@x.io', 'first, signed in']);
  await as('anon', null); await rpc(['g@x.io', 'second, guest']);
  await su();
  const readRows = (await db.query(readFile)).rows;
  check('read file: open rows oldest first, signed_in flag, username for players, open_total', readRows.length === 2 && readRows[0].message === 'first, signed in' && readRows[0].signed_in === true && readRows[0].username === 'player_one' && readRows[1].signed_in === false && readRows[1].username === null && Number(readRows[0].open_total) === 2, JSON.stringify(readRows.map((r) => [r.message, r.signed_in, r.username, r.open_total])));
  const target = readRows[0].id;
  const closeSql = closeFile.replace('00000000-0000-0000-0000-000000000000', target);
  check('close template has exactly one placeholder uuid', closeFile.split('00000000-0000-0000-0000-000000000000').length === 2);
  const closed1 = (await db.query(closeSql)).rows;
  check('close file: closes exactly that row and returns it', closed1.length === 1 && closed1[0].id === target && closed1[0].status === 'closed' && !!closed1[0].closed_at);
  const closed2 = (await db.query(closeSql)).rows;
  check('close file: a second run changes nothing (0 rows back)', closed2.length === 0);
  const readAfter = (await db.query(readFile)).rows;
  check('read file after close: only the other row is open', readAfter.length === 1 && readAfter[0].message === 'second, guest' && Number(readAfter[0].open_total) === 1);
  const placeholderRun = (await db.query(closeFile)).rows;
  check('close template run unedited touches nothing', placeholderRun.length === 0 && (await count(`status='open'`)) === 1);
  // intake-volume read: counts only, last hour, guests vs players
  check('intake-volume file passes the read-only wrapper screen, one statement', screen.screenReadOnly(volumeFile).length === 0 && screen.countStatements(volumeFile) === 1, JSON.stringify(screen.screenReadOnly(volumeFile)));
  check('intake-volume limits match the function constants (30 guests, 90 total)', /30 as guest_hour_limit/.test(volumeFile) && /90 as total_hour_limit/.test(volumeFile) && /c_guest_hour_limit constant integer := 30;/.test(apply) && /c_global_hour_limit constant integer := 90;/.test(apply));
  await wipe();
  for (let i = 0; i < 4; i++) await db.exec(`insert into ${T} (contact_email, message, created_at) values ('${i < 3 ? 'Flood' : 'other'}${i}@x.io', 'g', now() - interval '${10 + i} minutes')`);
  await db.exec(`insert into ${T} (contact_email, message, created_at) values ('flood0@X.io', 'g', now() - interval '5 minutes')`);
  await db.exec(`insert into ${T} (contact_email, message, created_at) values ('old@x.io', 'g', now() - interval '2 hours')`);
  await db.exec(`insert into ${T} (user_id, contact_email, message) values ('${U(1)}', 'p@x.io', 'p')`);
  const vol = (await db.query(volumeFile)).rows[0];
  const volCols = Object.keys(vol).join(',');
  check('intake-volume: 5 guests (4 distinct addresses, case-folded), 1 player, 6 total in the hour; older rows ignored', Number(vol.guest_last_hour) === 5 && Number(vol.distinct_guest_addresses) === 4 && Number(vol.signed_in_last_hour) === 1 && Number(vol.total_last_hour) === 6 && Number(vol.guest_hour_limit) === 30 && Number(vol.total_hour_limit) === 90 && vol.oldest_guest_in_window !== null, JSON.stringify(vol));
  check('intake-volume returns no email or message column', !/email|message/.test(volCols.replace('distinct_guest_addresses', '')), volCols);

  // ---- 16. re-apply over a live install aborts and changes nothing
  await wipe();
  const reRun = await db.exec(apply).then(() => 'applied', (e) => e.message);
  await db.exec('rollback').catch(() => {});
  check('re-apply aborts with PREIMAGE_FUNCTION_EXISTS and leaves the catalog unchanged', /MAZER_HELP_PREIMAGE_FUNCTION_EXISTS/.test(reRun) && (await catalog()) === postCatalog, reRun.slice(0, 60));

  // ---- 17. rollback: rows present -> table kept; empty -> catalog equals pre-apply
  await as('anon', null); await rpc(['keep@x.io', 'keep me']);
  await su();
  await db.exec(rollback);
  const kept = (await db.query(`select to_regclass('${T}') is not null t, to_regprocedure('${FN}') is not null f`)).rows[0];
  check('rollback with data: function dropped (intake stopped), table KEPT with its row', !kept.f && kept.t && (await count()) === 1);
  await as('anon', null);
  check('kept table is still unreadable by clients after rollback', /permission denied/.test((await tryExec(`select * from ${T}`)).err ?? ''));
  await wipe();
  await db.exec(rollback);
  check('rollback with empty table: catalog equals the pre-apply catalog', (await catalog()) === preCatalog);
  await su();
  check('rollback twice in a row is harmless', await db.exec(rollback).then(() => true, () => false));

  // ---- 18. apply after rollback works
  await db.exec(apply);
  check('apply after rollback equals the first post-apply catalog', (await catalog()) === postCatalog);
  await as('anon', null);
  check('and the function works again', (await rpc(['again@x.io', 'again'])).status === 'saved');

  // ---- 19. timeouts in force; the post-image assertions bite
  await wipe();
  await db.exec(rollback);
  const probe = (txt) => txt.replace(/commit;\s*$/, "do $p$ begin if current_setting('lock_timeout') <> '3s' or current_setting('statement_timeout') <> '15s' then raise exception 'TIMEOUTS_NOT_SET'; end if; end $p$;\ncommit;\n");
  const probedApply = await db.exec(probe(apply)).then(() => 'ok', (e) => e.message);
  check('apply: lock_timeout=3s and statement_timeout=15s in force at the end of the transaction', probedApply === 'ok', probedApply.slice(0, 80));
  check('apply: the timeouts are transaction-local (session back to default)', (await db.query("select current_setting('lock_timeout') v")).rows[0].v === '0');
  await wipe();
  const probedRb = await db.exec(probe(rollback)).then(() => 'ok', (e) => e.message);
  check('rollback: lock_timeout=3s and statement_timeout=15s in force', probedRb === 'ok', probedRb.slice(0, 80));
  check('both files set the timeouts BEFORE the first DDL statement', apply.indexOf("set local lock_timeout = '3s'") > 0 && apply.indexOf("set local lock_timeout = '3s'") < apply.indexOf('create table') && rollback.indexOf("set local lock_timeout = '3s'") < rollback.indexOf('drop function'));
  const postMutant = async (from, to) => {
    if (!apply.includes(from)) return 'MUTANT-TEXT-NOT-FOUND';
    return fresh('', apply.replace(from, to));
  };
  const mutants = [
    ['granting EXECUTE to anon is missing (signed-in only by mistake)', 'to anon, authenticated;\n\ncomment on function', 'to authenticated;\n\ncomment on function', 'FUNCTION_ACL'],
    ['EXECUTE left to public', `revoke all on function mazer.mazer_submit_help_request_v1(text, text, text, integer, text) from public, anon, authenticated;`, '', 'FUNCTION_ACL'],
    ['a different FK action', 'on delete cascade', 'on delete set null', 'FOREIGN_KEY'],
    ['user_id NOT NULL', 'user_id uuid references auth.users (id) on delete cascade', 'user_id uuid not null references auth.users (id) on delete cascade', 'FOREIGN_KEY'],
    ['a function without lock_timeout', "set lock_timeout = '3s'\nvolatile", 'volatile', 'FUNCTION_SHAPE'],
    ['a SECURITY INVOKER function', 'security definer\nset search_path', 'security invoker\nset search_path', 'FUNCTION_SHAPE'],
    ['a client table grant', 'grant select, delete on table mazer.mazer_help_requests to service_role;', 'grant select, delete on table mazer.mazer_help_requests to service_role, anon;', 'CLIENT_TABLE_PRIVILEGE'],
    ['service_role allowed to rewrite the message', 'grant update (status, closed_at)', 'grant update (status, closed_at, message)', 'SERVICE_ROLE_PRIVILEGE'],
    ['service_role allowed to insert', 'grant select, delete on table mazer.mazer_help_requests to service_role;', 'grant select, insert, delete on table mazer.mazer_help_requests to service_role;', 'SERVICE_ROLE_PRIVILEGE'],
    ['RLS left off', 'alter table mazer.mazer_help_requests enable row level security;', '', 'RLS_OFF']
  ];
  for (const [name, from, to, code] of mutants) {
    const out = await postMutant(from, to);
    check(`MUTANT: ${name} aborts the apply (POSTIMAGE_${code})`, new RegExp(`MAZER_HELP_POSTIMAGE_${code}`).test(out), out.slice(0, 80));
  }
  await db.exec(apply);

  await su();
  console.log(`\nSUMMARY: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(2); });
