// Scratch test (in-memory Postgres via pglite 0.5.13; never touches Supabase) for
// docs/ops/sql-proposals/mazer-feedback-20261123/apply.sql and rollback.sql.
// Stand-ins (NOT live captures): roles anon/authenticated/service_role, auth.users (id only),
// auth.uid() reading request.jwt.claim.sub, schema mazer with no other objects. The applier is pglite's
// superuser `postgres` (production's runner is NOT a superuser; check 12 uses a non-superuser,
// non-BYPASSRLS function owner to cover that). Files under test run verbatim.
// Usage: PGLITE_SANDBOX=<dir with node_modules/@electric-sql/pglite> node feedbacktest.cjs <repoRoot>
const { createRequire } = require('module');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sandbox = process.env.PGLITE_SANDBOX;
const { PGlite } = createRequire(path.join(sandbox, 'package.json'))('@electric-sql/pglite');
const root = process.argv[2];
const dir = 'docs/ops/sql-proposals/mazer-feedback-20261123';
const rd = (p) => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n');
const apply = rd(`${dir}/apply.sql`);
const rollback = rd(`${dir}/rollback.sql`);
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
console.log('PGlite 0.5.13 (PostgreSQL 17 wasm), in-memory');
console.log(`### tested_file=${dir}/apply.sql sha256=${sha(apply)}`);
console.log(`### tested_file=${dir}/rollback.sql sha256=${sha(rollback)}`);

const BASE = `
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create schema mazer;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth, mazer to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
`;
const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const FN = 'mazer.mazer_submit_feedback_v1(integer,text,text,integer,text,text)';
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { (ok ? pass++ : fail++); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  [' + detail + ']' : ''}`); };

(async () => {
  const db = new PGlite();
  await db.exec(BASE);
  for (let i = 1; i <= 3; i++) await db.exec(`insert into auth.users (id) values ('${U(i)}')`);

  const as = async (role, uid) => {
    await db.exec('reset role');
    await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid ?? '']);
    if (role) await db.exec(`set role ${role}`);
  };
  const su = async () => { await db.exec('reset role'); await db.query(`select set_config('request.jwt.claim.sub', '', false)`); };
  const rpc = async (args) => {
    const p = [args[0] ?? null, args[1] ?? null, args[2] ?? null, args[3] ?? null, args[4] ?? null, args[5] === undefined ? 'menu' : args[5]];
    const r = await db.query('select mazer.mazer_submit_feedback_v1($1::integer,$2::text,$3::text,$4::integer,$5::text,$6::text) as r', p);
    return r.rows[0].r;
  };
  const tryRpc = async (args) => { try { return { ok: await rpc(args) }; } catch (e) { return { err: e.message }; } };
  const tryExec = async (sql) => { try { const r = await db.query(sql); return { ok: r.rows }; } catch (e) { return { err: e.message }; } };
  const count = async (where = 'true') => { await su(); return Number((await db.query(`select count(*)::int c from mazer.mazer_feedback where ${where}`)).rows[0].c); };
  const catalog = async () => {
    await su();
    const q = async (s) => JSON.stringify((await db.query(s)).rows);
    return [
      await q(`select c.relname, c.relkind, c.relrowsecurity, c.relacl::text from pg_class c where c.relnamespace='mazer'::regnamespace order by 1`),
      await q(`select p.proname, pg_get_function_identity_arguments(p.oid) a, p.proacl::text from pg_proc p where p.pronamespace='mazer'::regnamespace order by 1,2`),
      await q(`select conname from pg_constraint where connamespace='mazer'::regnamespace order by 1`),
      await q(`select polname from pg_policy order by 1`)
    ].join('\n');
  };

  // ---- 0. pre-apply catalog, preflight abort on a missing schema
  const preCatalog = await catalog();
  const bare = new PGlite();
  const bareRun = await bare.exec(apply).then(() => 'applied', (e) => e.message);
  check('preflight aborts when schema mazer is missing', /MAZER_FEEDBACK_PREIMAGE_MISSING_SCHEMA/.test(bareRun), bareRun.slice(0, 80));
  await bare.close();

  // ---- 0b. preflight mutants (fresh databases)
  const mutant = async (setup) => {
    const m = new PGlite();
    await m.exec(BASE);
    const out = await m.exec(setup + apply).then(() => 'applied', (e) => e.message);
    await m.exec('rollback').catch(() => {});
    await m.close();
    return out;
  };
  const overload = await mutant(`create function mazer.mazer_submit_feedback_v1(integer) returns integer language sql as 'select 1';\n`);
  check('preflight aborts on a same-name function with another signature (is distinct from, not <>)', /MAZER_FEEDBACK_PREIMAGE_UNEXPECTED_FUNCTION/.test(overload), overload.slice(0, 80));
  const foreign = await mutant(`create table mazer.mazer_feedback (x int);\n`);
  check('preflight aborts on a pre-existing mazer_feedback table of any shape', /MAZER_FEEDBACK_PREIMAGE_TABLE_EXISTS/.test(foreign), foreign.slice(0, 80));
  const noAuth = await mutant(`drop schema auth cascade;\n`);
  check('preflight aborts when auth.users is missing', /MAZER_FEEDBACK_PREIMAGE_MISSING_AUTH_USERS/.test(noAuth), noAuth.slice(0, 80));

  // ---- 1. apply
  await db.exec(apply);
  const postCatalog = await catalog();
  check('apply runs clean (as superuser postgres in pglite)', true);

  // ---- 2. ACL / RLS shape
  await su();
  const acl = (await db.query(`select
    has_table_privilege('anon','mazer.mazer_feedback','select') a_sel, has_table_privilege('anon','mazer.mazer_feedback','insert') a_ins,
    has_table_privilege('authenticated','mazer.mazer_feedback','select') u_sel, has_table_privilege('authenticated','mazer.mazer_feedback','insert') u_ins,
    has_table_privilege('authenticated','mazer.mazer_feedback','update') u_upd, has_table_privilege('authenticated','mazer.mazer_feedback','delete') u_del,
    has_table_privilege('service_role','mazer.mazer_feedback','select') s_sel, has_table_privilege('service_role','mazer.mazer_feedback','delete') s_del,
    has_table_privilege('service_role','mazer.mazer_feedback','insert') s_ins,
    has_function_privilege('public','${FN}','execute') pub,
    has_function_privilege('anon','${FN}','execute') anon_x,
    has_function_privilege('authenticated','${FN}','execute') auth_x,
    (select relrowsecurity from pg_class where oid='mazer.mazer_feedback'::regclass) rls,
    (select relforcerowsecurity from pg_class where oid='mazer.mazer_feedback'::regclass) forced,
    (select count(*)::int from pg_policy where polrelid='mazer.mazer_feedback'::regclass) pol,
    (select prosecdef from pg_proc where proname='mazer_submit_feedback_v1') secdef,
    (select proconfig::text from pg_proc where proname='mazer_submit_feedback_v1') cfg`)).rows[0];
  check('anon and authenticated have no table privilege', !acl.a_sel && !acl.a_ins && !acl.u_sel && !acl.u_ins && !acl.u_upd && !acl.u_del, JSON.stringify(acl));
  check('service_role can select and delete, not insert directly', acl.s_sel && acl.s_del && !acl.s_ins);
  check('function: public denied, anon + authenticated allowed', !acl.pub && acl.anon_x && acl.auth_x);
  check('RLS on, not forced, zero policies', acl.rls && !acl.forced && acl.pol === 0);
  check('function is SECURITY DEFINER with empty search_path', acl.secdef && /search_path=\\?"\\?"/.test(acl.cfg), acl.cfg);

  // ---- 3. insert ok (signed in), user id is auth.uid, not spoofable
  await as('authenticated', U(1));
  const ok1 = await rpc([5, '  Love it  ', 'abc1234', 12, 'endless', 'menu']);
  check('signed-in insert ok -> {"status":"saved"}', ok1.status === 'saved', JSON.stringify(ok1));
  await su();
  const row = (await db.query(`select * from mazer.mazer_feedback`)).rows[0];
  check('row has user id from auth.uid, trimmed comment, context', row.user_id === U(1) && row.comment === 'Love it' && row.rating === 5 && row.build_id === 'abc1234' && row.player_level === 12 && row.game_mode === 'endless' && row.source === 'menu' && !!row.created_at, JSON.stringify(row));
  check('the RPC has no user-id parameter (cannot file as someone else)', !(await db.query(`select pg_get_function_arguments(oid) a from pg_proc where proname='mazer_submit_feedback_v1'`)).rows[0].a.includes('user'));
  await as('authenticated', U(1));
  const noComment = await rpc([3]);
  check('rating-only (no comment) saves', noComment.status === 'saved');
  const blank = await rpc([4, '   \n  ']);
  check('whitespace-only comment saves', blank.status === 'saved');
  check('null and blank comments are stored as NULL', (await count('user_id is not null and comment is null')) === 2);

  // ---- 4. rating rejected
  await as('authenticated', U(2));
  for (const bad of [0, 6, -1, 100, null]) {
    const r = await tryRpc([bad]);
    check(`rating ${bad} rejected`, /MAZER_FEEDBACK_BAD_RATING/.test(r.err ?? ''), r.err ?? JSON.stringify(r.ok));
  }
  check('rating 1 and 5 accepted (boundaries)', (await rpc([1])).status === 'saved' && (await rpc([5])).status === 'saved');

  // ---- 5. comment length
  await as('authenticated', U(3));
  const c500 = 'x'.repeat(500), c501 = 'x'.repeat(501);
  check('500-char comment accepted', (await rpc([4, c500])).status === 'saved');
  const r501 = await tryRpc([4, c501]);
  check('501-char comment rejected', /MAZER_FEEDBACK_COMMENT_TOO_LONG/.test(r501.err ?? ''), r501.err ?? '');
  const r501b = await tryRpc([4, ' ' + c501 + ' ']);
  check('501 chars padded with spaces still rejected', /MAZER_FEEDBACK_COMMENT_TOO_LONG/.test(r501b.err ?? ''));
  check('500 emoji accepted (cap counts characters, not bytes)', (await rpc([2, '\u{1F600}'.repeat(500)])).status === 'saved');
  check('rejected calls stored nothing (2 rows for user 3)', (await count(`user_id='${U(3)}'`)) === 2);

  // ---- 6. context sanitised, not rejected
  await su(); await db.exec(`delete from mazer.mazer_feedback where user_id='${U(3)}'`);
  await as('authenticated', U(3));
  const ctx = await rpc([3, null, 'bad id with spaces!', -5, 'DROP TABLE x', 'hacker']);
  check('bad context still saves', ctx.status === 'saved');
  await su();
  const crow = (await db.query(`select * from mazer.mazer_feedback where user_id='${U(3)}'`)).rows[0];
  check('bad build id / level / mode -> NULL, bad source -> menu', crow.build_id === null && crow.player_level === null && crow.game_mode === null && crow.source === 'menu', JSON.stringify(crow));
  await su(); await db.exec(`delete from mazer.mazer_feedback where user_id='${U(3)}'`);
  await as('authenticated', U(3));
  await rpc([3, null, 'v1.2.3+sha', 1000001, null, 'post_level']);
  await su();
  const crow2 = (await db.query(`select * from mazer.mazer_feedback where user_id='${U(3)}'`)).rows[0];
  check('level above cap -> NULL; post_level source and v1.2.3+sha build kept', crow2.player_level === null && crow2.source === 'post_level' && crow2.build_id === 'v1.2.3+sha');

  // ---- 7. rate limit signed in: 5/hour
  await su(); await db.exec(`delete from mazer.mazer_feedback`);
  await as('authenticated', U(1));
  const outs = [];
  for (let i = 0; i < 7; i++) outs.push(await rpc([4, `n${i}`]));
  check('first 5 saved, 6th and 7th rate_limited', outs.slice(0, 5).every((o) => o.status === 'saved') && outs[5].status === 'rate_limited' && outs[6].status === 'rate_limited', outs.map((o) => o.status).join(','));
  check('retry_after_seconds in (0, 3600]', outs[5].retry_after_seconds > 0 && outs[5].retry_after_seconds <= 3600, String(outs[5].retry_after_seconds));
  check('rate-limited calls stored nothing (5 rows)', (await count(`user_id='${U(1)}'`)) === 5);
  await as('authenticated', U(2));
  check('another user is unaffected by user 1 budget', (await rpc([2])).status === 'saved');
  await su(); await db.exec(`update mazer.mazer_feedback set created_at = created_at - interval '61 minutes' where user_id='${U(1)}'`);
  await as('authenticated', U(1));
  check('after the hour window passes, user 1 can submit again', (await rpc([4])).status === 'saved');

  // ---- 8. daily cap 20
  await su(); await db.exec(`delete from mazer.mazer_feedback`);
  for (let i = 0; i < 20; i++) {
    await db.exec(`insert into mazer.mazer_feedback (user_id, rating, created_at) values ('${U(1)}', 3, now() - interval '${61 + i * 60} minutes')`);
  }
  await as('authenticated', U(1));
  const day = await rpc([4]);
  check('21st within 24h rejected by the daily cap (hour budget is empty)', day.status === 'rate_limited' && day.retry_after_seconds > 0, JSON.stringify(day));
  // both budgets used up: 20 rows all within the last 10 minutes -> hourly wait ~50 min, daily wait ~23h50: answer the LONGER one
  await su(); await db.exec(`delete from mazer.mazer_feedback`);
  for (let i = 0; i < 5; i++) await db.exec(`insert into mazer.mazer_feedback (user_id, rating, created_at) values ('${U(1)}', 3, now() - interval '${10 - i} minutes')`);
  await as('authenticated', U(1));
  const hourOnly = await rpc([4]);
  check('hourly cap only: retry is the hourly wait (<= 3600)', hourOnly.status === 'rate_limited' && hourOnly.retry_after_seconds > 0 && hourOnly.retry_after_seconds <= 3600, JSON.stringify(hourOnly));
  await su(); await db.exec(`delete from mazer.mazer_feedback`);
  for (let i = 0; i < 20; i++) await db.exec(`insert into mazer.mazer_feedback (user_id, rating, created_at) values ('${U(1)}', 3, now() - interval '${10 - (i % 5)} minutes')`);
  await as('authenticated', U(1));
  const both = await rpc([4]);
  check('both caps hit: retry is the LONGER daily wait (> 20h)', both.status === 'rate_limited' && both.retry_after_seconds > 20 * 3600 && both.retry_after_seconds <= 24 * 3600, JSON.stringify(both));
  await su(); await db.exec(`update mazer.mazer_feedback set created_at = created_at - interval '24 hours' where user_id='${U(1)}'`);
  await as('authenticated', U(1));
  check('after the oldest rows age past 24h the user can submit again', (await rpc([4])).status === 'saved');

  // ---- 9. signed out
  await su(); await db.exec(`delete from mazer.mazer_feedback`);
  await as('anon', null);
  const an = await rpc([5, 'hi from guest']);
  check('signed-out insert ok', an.status === 'saved');
  check('signed-out row has NULL user_id', (await count('user_id is null')) === 1);
  await as('anon', null);
  for (let i = 0; i < 29; i++) await rpc([4]);
  const an31 = await rpc([4]);
  check('signed-out shared budget: 30 saved, 31st rate_limited', an31.status === 'rate_limited', JSON.stringify(an31));
  await as('authenticated', U(2));
  check('signed-in user still saves while the signed-out budget is exhausted', (await rpc([4])).status === 'saved');
  await as('anon', null);
  const anBad = await tryRpc([0]);
  check('signed-out rating 0 rejected', /MAZER_FEEDBACK_BAD_RATING/.test(anBad.err ?? ''));

  // ---- 10. RLS / privileges: nobody reads or writes directly
  await su(); await db.exec(`delete from mazer.mazer_feedback`);
  await as('authenticated', U(1)); await rpc([5, 'secret one']);
  await as('authenticated', U(2)); await rpc([1, 'secret two']);
  for (const [role, uid] of [['authenticated', U(1)], ['authenticated', U(2)], ['anon', null]]) {
    await as(role, uid);
    const sel = await tryExec('select * from mazer.mazer_feedback');
    check(`direct SELECT denied (${role}${uid ? ' user ' + uid.slice(-1) : ''})`, /permission denied/.test(sel.err ?? ''), sel.err ?? JSON.stringify(sel.ok));
  }
  await as('authenticated', U(1));
  const ins = await tryExec(`insert into mazer.mazer_feedback (user_id, rating) values ('${U(1)}', 5)`);
  check('direct INSERT denied (own user id)', /permission denied/.test(ins.err ?? ''), ins.err ?? '');
  const insSpoof = await tryExec(`insert into mazer.mazer_feedback (user_id, rating) values ('${U(2)}', 5)`);
  check('direct INSERT spoofing another user denied', /permission denied/.test(insSpoof.err ?? ''));
  const upd = await tryExec(`update mazer.mazer_feedback set rating = 1`);
  const del = await tryExec(`delete from mazer.mazer_feedback`);
  check('direct UPDATE and DELETE denied', /permission denied/.test(upd.err ?? '') && /permission denied/.test(del.err ?? ''));
  // second layer: even if a grant were added by mistake, RLS with no policy returns nothing and blocks writes
  await su(); await db.exec(`grant select, insert, update, delete on mazer.mazer_feedback to authenticated`);
  await as('authenticated', U(1));
  const sel2 = await tryExec('select * from mazer.mazer_feedback');
  check('MUTANT (grant added by mistake): RLS still returns 0 rows to authenticated', Array.isArray(sel2.ok) && sel2.ok.length === 0, sel2.err ?? `rows=${sel2.ok?.length}`);
  const ins2 = await tryExec(`insert into mazer.mazer_feedback (user_id, rating) values ('${U(1)}', 5)`);
  check('MUTANT: RLS still blocks a direct insert (own row)', /row-level security/.test(ins2.err ?? ''), ins2.err ?? '');
  const upd2 = await tryExec(`update mazer.mazer_feedback set rating = 1 returning id`);
  check('MUTANT: RLS update touches 0 rows', Array.isArray(upd2.ok) && upd2.ok.length === 0);
  await su(); await db.exec(`revoke all on mazer.mazer_feedback from authenticated`);
  await as('service_role', null);
  const srv = await tryExec('select count(*)::int c from mazer.mazer_feedback');
  check('service_role (owner-side read) sees both rows', srv.ok && srv.ok[0].c === 2, srv.err ?? '');

  // ---- 11. table constraints as defence in depth (superuser, bypasses the function)
  await su();
  const t0 = await tryExec(`insert into mazer.mazer_feedback (rating) values (0)`);
  const t6 = await tryExec(`insert into mazer.mazer_feedback (rating) values (6)`);
  const tLong = await tryExec(`insert into mazer.mazer_feedback (rating, comment) values (3, '${c501}')`);
  const tSrc = await tryExec(`insert into mazer.mazer_feedback (rating, source) values (3, 'x')`);
  const tEmpty = await tryExec(`insert into mazer.mazer_feedback (rating, comment) values (3, '')`);
  const tNull = await tryExec(`insert into mazer.mazer_feedback (rating) values (null)`);
  check('table CHECK rejects rating 0 and 6', /mazer_feedback_rating_check/.test(t0.err ?? '') && /mazer_feedback_rating_check/.test(t6.err ?? ''));
  check('table CHECK rejects 501-char and empty comment', /mazer_feedback_comment_check/.test(tLong.err ?? '') && /mazer_feedback_comment_check/.test(tEmpty.err ?? ''));
  check('table rejects unknown source and NULL rating', /mazer_feedback_source_check/.test(tSrc.err ?? '') && /null value/.test(tNull.err ?? ''));

  // ---- 12. non-superuser, non-BYPASSRLS function owner (closer to production's runner)
  await su();
  await db.exec(`create role fb_owner nologin; grant usage on schema auth, mazer to fb_owner;
    alter table mazer.mazer_feedback owner to fb_owner;
    alter function ${FN} owner to fb_owner;`);
  await db.exec(`delete from mazer.mazer_feedback`);
  await as('authenticated', U(1));
  const nb = await tryRpc([4, 'owner without bypassrls']);
  check('RPC works when the owner is not superuser and has no BYPASSRLS (RLS not forced)', !!nb.ok && nb.ok.status === 'saved', nb.err ?? '');
  await su();
  await db.exec(`alter function ${FN} owner to postgres; alter table mazer.mazer_feedback owner to postgres; revoke usage on schema auth, mazer from fb_owner; drop role fb_owner;`);

  // ---- 13. account deletion keeps the row but drops the identity
  await su(); await db.exec(`delete from mazer.mazer_feedback`);
  await as('authenticated', U(3)); await rpc([2, 'bye']);
  await su(); await db.exec(`delete from auth.users where id='${U(3)}'`);
  check('deleting the auth user nulls feedback.user_id (FK on delete set null)', (await count(`user_id is null and comment = 'bye'`)) === 1);

  // ---- 14. re-apply over a live install aborts and changes nothing
  await su(); await db.exec(`delete from mazer.mazer_feedback`);
  const reRun = await db.exec(apply).then(() => 'applied', (e) => e.message);
  await db.exec('rollback').catch(() => {});
  check('re-apply aborts with PREIMAGE_TABLE_EXISTS and leaves the catalog unchanged', /MAZER_FEEDBACK_PREIMAGE_TABLE_EXISTS/.test(reRun) && (await catalog()) === postCatalog, reRun.slice(0, 60));

  // ---- 15. rollback: rows present -> table kept; empty -> catalog equals pre-apply
  await as('authenticated', U(1)); await rpc([5, 'keep me']);
  await su();
  await db.exec(rollback);
  const keptTable = (await db.query(`select to_regclass('mazer.mazer_feedback') is not null t, to_regprocedure('${FN}') is not null f`)).rows[0];
  check('rollback with data: function dropped, table KEPT with its row', !keptTable.f && keptTable.t && (await count()) === 1);
  await as('authenticated', U(1));
  const afterRb = await tryExec('select * from mazer.mazer_feedback');
  check('kept table is still unreadable by clients after rollback', /permission denied/.test(afterRb.err ?? ''));
  await su(); await db.exec(`delete from mazer.mazer_feedback`);
  await db.exec(rollback);
  check('rollback with empty table: catalog equals the pre-apply catalog', (await catalog()) === preCatalog);

  // ---- 16. apply after rollback works
  await db.exec(apply);
  check('apply after rollback works and equals the first post-apply catalog', (await catalog()) === postCatalog);
  await as('authenticated', U(1));
  check('and the function works again', (await rpc([3])).status === 'saved');

  await su();
  console.log(`\nSUMMARY: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(2); });
