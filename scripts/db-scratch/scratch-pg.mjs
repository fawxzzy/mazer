#!/usr/bin/env node
// Throwaway PostgreSQL 17 harness for testing a SQL proposal before anyone approves it.
// Windows-first (PostgreSQL 17 from C:\Program Files\PostgreSQL\17). No dependencies, no network: the cluster listens on
// 127.0.0.1 only, with trust auth, in a NEW EMPTY directory under C:\ATLAS\tmp. It never reads an env file or a secret and
// never connects to anything except the cluster it created.
//
//   node scripts/db-scratch/scratch-pg.mjs init     --dir C:\ATLAS\tmp\scratch-pg-<name> --port 55440
//   node scripts/db-scratch/scratch-pg.mjs build    --dir <dir> [--extra app-stub.sql ...] [--extra-super s.sql ...]
//   node scripts/db-scratch/scratch-pg.mjs pair     --dir <dir> --apply a.sql --rollback r.sql [--seed s.sql] [--check c.sql] [--reapply] [--schemas mazer,auth_x]
//   node scripts/db-scratch/scratch-pg.mjs psql     --dir <dir> [--db name] [--as role] -- <psql args>
//   node scripts/db-scratch/scratch-pg.mjs body-md5 <file>        (md5 of a function body as stored / as LF / as CRLF)
//   node scripts/db-scratch/scratch-pg.mjs body-hex <file>        (the bytes as hex, for templates/30-live-body-crlf.example.sql)
//   node scripts/db-scratch/scratch-pg.mjs selftest [--port 55460]
//   node scripts/db-scratch/scratch-pg.mjs stop | destroy --dir <dir>
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bodyMd5Variants } from './lib/md5.mjs';
import { PACK_DIR, listPackFiles, renderPackSql } from './preimage-pack.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const IS_WIN = process.platform === 'win32';
const PG_BIN = process.env.MAZER_SCRATCH_PG_BIN ?? (IS_WIN ? 'C:\\Program Files\\PostgreSQL\\17\\bin' : '/usr/lib/postgresql/17/bin');
const SCRATCH_ROOT = resolve(process.env.MAZER_SCRATCH_ROOT ?? (IS_WIN ? 'C:\\ATLAS\\tmp' : '/tmp'));
const SUPER = 'scratch_super';
const RUNNER = 'postgres';
const TEMPLATE_DB = 'stub';
const FORBIDDEN_PORTS = new Set([5432, 5433, 6543, 54321, 54322, 54323, 54324]);

const exe = (name) => join(PG_BIN, IS_WIN ? `${name}.exe` : name);
const fail = (message) => { throw new Error(message); };

function run(file, args, options = {}) {
  const result = spawnSync(file, args, { encoding: 'utf8', env: { ...process.env, PGCLIENTENCODING: 'UTF8' }, ...options });
  if (result.error) fail(`${file}: ${result.error.message}`);
  return result;
}

function parseArgs(argv) {
  const args = { _: [] };
  const multi = new Set(['extra', 'extra-super']);
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--') { args.rest = argv.slice(i + 1); break; }
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const hasValue = argv[i + 1] !== undefined && !argv[i + 1].startsWith('--');
      const value = hasValue ? argv[++i] : true;
      if (multi.has(key)) (args[key] ??= []).push(value); else args[key] = value;
    } else args._.push(a);
  }
  return args;
}

function assertScratchDir(dir) {
  const full = resolve(dir);
  if (!full.toLowerCase().startsWith((SCRATCH_ROOT + sep).toLowerCase()) || full.toLowerCase() === SCRATCH_ROOT.toLowerCase()) {
    fail(`--dir must be a new folder UNDER ${SCRATCH_ROOT} (got ${full})`);
  }
  return full;
}

function isPortFree(port) {
  return new Promise((done) => {
    const server = createServer();
    server.once('error', () => done(false));
    server.listen(port, '127.0.0.1', () => server.close(() => done(true)));
  });
}

const statePath = (dir) => join(dir, 'scratch.json');
function readState(dirArg) {
  if (!dirArg || dirArg === true) fail('--dir is required');
  const dir = assertScratchDir(dirArg);
  if (!existsSync(statePath(dir))) fail(`no scratch cluster state in ${dir} (run init first)`);
  return { dir, ...JSON.parse(readFileSync(statePath(dir), 'utf8')) };
}

function psql(state, { db = 'postgres', role = RUNNER, args = [], input } = {}) {
  return run(exe('psql'), ['-X', '-h', '127.0.0.1', '-p', String(state.port), '-U', role, '-d', db, '-v', 'ON_ERROR_STOP=1', ...args], input === undefined ? {} : { input });
}
const psqlFile = (state, db, role, file, extra = []) => psql(state, { db, role, args: ['-q', '-f', resolve(file), ...extra] });
const psqlSql = (state, db, role, sql, extra = []) => psql(state, { db, role, args: ['-q', '-A', '-t', '-c', sql, ...extra] });

function mustSucceed(result, what) {
  if (result.status !== 0) fail(`${what} failed (exit ${result.status}):\n${(result.stderr || result.stdout || '').trim()}`);
  return result;
}

// ---------------------------------------------------------------- commands

async function cmdInit(args) {
  const dir = assertScratchDir(args.dir);
  const port = Number(args.port);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) fail('--port must be an integer 1024..65535');
  if (FORBIDDEN_PORTS.has(port)) fail(`port ${port} is a known live or local-Supabase port; pick another (for example 55440)`);
  if (!(await isPortFree(port))) fail(`port ${port} is in use`);
  if (existsSync(dir) && readdirSync(dir).length > 0) fail(`${dir} exists and is not empty: use a NEW empty folder (never reuse evidence)`);
  const version = run(exe('postgres'), ['--version']).stdout.trim();
  if (!/\(PostgreSQL\) 17\./.test(version)) fail(`PostgreSQL 17 required, found: ${version || 'nothing at ' + PG_BIN}`);
  mkdirSync(dir, { recursive: true });
  const data = join(dir, 'data');
  const locale = typeof args.locale === 'string' ? args.locale : 'C';
  mustSucceed(run(exe('initdb'), ['-D', data, '-U', SUPER, '--auth=trust', '-E', 'UTF8', `--locale=${locale}`]), 'initdb');
  writeFileSync(statePath(dir), JSON.stringify({ port, data, version, locale, createdAt: new Date().toISOString() }, null, 2));
  startCluster({ dir, port, data });
  console.log(`initialised ${version} on 127.0.0.1:${port} in ${dir} (locale ${locale}; production uses en_US.UTF-8, pass --locale to match when ordering matters)`);
}

function startCluster(state) {
  const result = spawnSync(exe('pg_ctl'), ['-D', state.data, '-l', join(state.dir, 'server.log'), '-o', `-p ${state.port} -c listen_addresses=127.0.0.1`, '-w', 'start'], { stdio: 'ignore' });
  if (result.status !== 0) fail(`pg_ctl start failed; see ${join(state.dir, 'server.log')}`);
}

function cmdBuild(args) {
  const state = readState(args.dir);
  const rolesFile = join(HERE, 'templates', '00-roles.sql');
  const authFile = join(HERE, 'templates', '10-auth-stub.sql');
  mustSucceed(psqlFile(state, 'postgres', SUPER, rolesFile), 'roles');
  mustSucceed(psqlSql(state, 'postgres', SUPER, `drop database if exists ${TEMPLATE_DB} with (force)`), 'drop template db');
  mustSucceed(psqlSql(state, 'postgres', SUPER, `create database ${TEMPLATE_DB} owner ${RUNNER}`), 'create template db');
  mustSucceed(psqlFile(state, TEMPLATE_DB, SUPER, authFile), 'auth stub');
  for (const file of args['extra-super'] ?? []) mustSucceed(psqlFile(state, TEMPLATE_DB, SUPER, file), `extra (superuser) ${file}`);
  for (const file of args.extra ?? []) mustSucceed(psqlFile(state, TEMPLATE_DB, RUNNER, file), `extra (runner) ${file}`);
  mustSucceed(psqlSql(state, 'postgres', SUPER, `alter database ${TEMPLATE_DB} is_template true`), 'mark template');
  console.log(`built template database "${TEMPLATE_DB}" (auth stub + ${(args.extra ?? []).length + (args['extra-super'] ?? []).length} extra file(s)); every pair run clones it`);
}

function snapshot(state, db, schemas) {
  const parts = [];
  for (const file of listPackFiles().filter((f) => !f.volatile)) {
    const sql = renderPackSql(readFileSync(file.path, 'utf8'), { schemas });
    const tmp = join(state.dir, `snap-${file.name}`);
    writeFileSync(tmp, sql, 'utf8');
    const result = psql(state, { db, role: SUPER, args: ['-q', '-A', '-t', '-F', ' | ', '-f', tmp] });
    mustSucceed(result, `snapshot ${file.name}`);
    parts.push(`## ${file.name}\n${result.stdout.replace(/\r\n/g, '\n').trimEnd()}`);
  }
  return parts.join('\n');
}

function diffLines(a, b) {
  const left = a.split('\n'); const right = b.split('\n');
  const setB = new Set(right); const setA = new Set(left);
  return [...left.filter((l) => !setB.has(l)).map((l) => `- ${l}`), ...right.filter((l) => !setA.has(l)).map((l) => `+ ${l}`)];
}

function cmdPair(args) {
  const state = readState(args.dir);
  if (!args.apply || !args.rollback) fail('pair needs --apply <file> and --rollback <file>');
  const schemas = typeof args.schemas === 'string' ? args.schemas.split(',').map((s) => s.trim()) : ['mazer', 'account_private', 'public', 'example_app'];
  const db = `pair_${Date.now()}`;
  mustSucceed(psqlSql(state, 'postgres', SUPER, `create database ${db} template ${TEMPLATE_DB} owner ${RUNNER}`), 'clone template');
  const steps = [];
  const step = (name, ok, detail = '') => { steps.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`); return ok; };
  try {
    if (args.seed) mustSucceed(psqlFile(state, db, RUNNER, args.seed), 'seed');
    const before = snapshot(state, db, schemas);
    const apply = psqlFile(state, db, RUNNER, args.apply);
    if (!step('apply file runs clean as the runner role (postgres)', apply.status === 0, apply.status === 0 ? '' : (apply.stderr || '').trim().split('\n')[0])) return steps;
    const afterApply = snapshot(state, db, schemas);
    step('apply changed the catalog (not a no-op)', afterApply !== before);
    if (args.check) {
      const check = psqlFile(state, db, RUNNER, args.check);
      step('check file passes after apply', check.status === 0, check.status === 0 ? '' : (check.stderr || '').trim().split('\n')[0]);
    }
    if (args.reapply) {
      const again = psqlFile(state, db, RUNNER, args.apply);
      const stable = snapshot(state, db, schemas) === afterApply;
      step('second apply either aborts by its own guard or changes nothing', again.status !== 0 || stable, again.status !== 0 ? 'refused by its guard' : 'idempotent');
    }
    const rollback = psqlFile(state, db, RUNNER, args.rollback);
    if (!step('rollback file runs clean as the runner role (postgres)', rollback.status === 0, rollback.status === 0 ? '' : (rollback.stderr || '').trim().split('\n')[0])) return steps;
    const afterRollback = snapshot(state, db, schemas);
    const changes = diffLines(before, afterRollback);
    step('catalog after rollback equals the catalog before apply', changes.length === 0);
    if (changes.length) console.log(changes.map((l) => `      ${l}`).join('\n'));
    return steps;
  } finally {
    psqlSql(state, 'postgres', SUPER, `drop database if exists ${db} with (force)`);
  }
}

function cmdBodyMd5(args) {
  const file = args._[0];
  if (!file) fail('body-md5 needs a file');
  console.log(JSON.stringify(bodyMd5Variants(readFileSync(resolve(file), 'utf8')), null, 2));
}

function cmdBodyHex(args) {
  const file = args._[0];
  if (!file) fail('body-hex needs a file');
  console.log(readFileSync(resolve(file)).toString('hex'));
}

function cmdStop(args, destroy) {
  const state = readState(args.dir);
  spawnSync(exe('pg_ctl'), ['-D', state.data, '-m', 'immediate', '-w', 'stop'], { stdio: 'ignore' });
  if (destroy) { rmSync(state.dir, { recursive: true, force: true }); console.log(`destroyed ${state.dir}`); } else console.log(`stopped ${state.dir}`);
}

async function cmdSelftest(args) {
  const port = Number(args.port ?? 55460);
  const dir = join(SCRATCH_ROOT, `scratch-pg-selftest-${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}`);
  const results = [];
  const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`); };
  await cmdInit({ dir, port: String(port) });
  const state = readState(dir);
  try {
    cmdBuild({ dir, extra: [join(HERE, 'templates', '20-app-stub.example.sql')] });
    const apply = join(HERE, 'examples', 'demo-apply.sql');
    const rollback = join(HERE, 'examples', 'demo-rollback.sql');
    for (const s of cmdPair({ dir, apply, rollback, reapply: true })) results.push(s.ok);

    // negative control: a rollback that restores nothing MUST be caught by the catalog comparison
    const badRollback = join(dir, 'bad-rollback.sql');
    writeFileSync(badRollback, 'select 1;\n', 'utf8');
    console.log('-- negative control (the next FAIL line is expected): a do-nothing rollback');
    const negative = cmdPair({ dir, apply, rollback: badRollback });
    check('negative control: a rollback that restores nothing is reported as a catalog mismatch', negative.some((s) => !s.ok && /equals the catalog/.test(s.name)));

    // traps, on a fresh clone with the demo applied
    const db = `trap_${Date.now()}`;
    mustSucceed(psqlSql(state, 'postgres', SUPER, `create database ${db} template ${TEMPLATE_DB} owner ${RUNNER}`), 'clone');
    mustSucceed(psqlFile(state, db, RUNNER, apply), 'apply demo');
    const dropTrigger = psqlSql(state, db, RUNNER, 'drop trigger demo_guard on auth.users');
    check('runner cannot DROP TRIGGER on auth.users', dropTrigger.status !== 0 && /must be owner/.test(dropTrigger.stderr), (dropTrigger.stderr || '').trim().split('\n')[0]);
    const disable = psqlSql(state, db, RUNNER, 'alter table auth.users disable trigger demo_guard');
    check('runner cannot DISABLE TRIGGER on auth.users', disable.status !== 0 && /must be owner/.test(disable.stderr));
    const noId = psqlSql(state, db, RUNNER, "insert into auth.users (email) values ('a@example.invalid')");
    check('auth.users has no id default (insert without id fails)', noId.status !== 0 && /null value in column "id"/.test(noId.stderr));
    const withId = psqlSql(state, db, RUNNER, "insert into auth.users (id, email) values (gen_random_uuid(), 'b@example.invalid')");
    check('insert with an explicit id works (and fires the trigger)', withId.status === 0, (withId.stderr || '').trim().split('\n')[0]);
    const second = psqlFile(state, db, RUNNER, apply);
    check('hash guard aborts a second apply (body no longer matches the pin)', second.status !== 0 && /DEMO_GUARD_ABORT/.test(second.stderr));
    const cascade = psqlSql(state, db, RUNNER, 'drop function example_app.demo_guard() cascade');
    check('DROP FUNCTION ... CASCADE removes the trigger the runner cannot drop', cascade.status === 0);
    const left = psqlSql(state, db, RUNNER, "select count(*) from pg_trigger where tgname = 'demo_guard'");
    check('no demo trigger left after the cascade', left.stdout.trim() === '0');
    const role = psqlSql(state, db, RUNNER, "select rolsuper::text || ',' || pg_has_role(current_user, 'supabase_auth_admin', 'member')::text from pg_roles where rolname = current_user");
    check('runner role is not a superuser and not a member of supabase_auth_admin', role.stdout.trim() === 'false,false', role.stdout.trim());

    // CRLF body installed byte for byte, and the pack reports it
    const crlfBody = ' begin\r\n  return \'crlf\';\r\nend\r\n';
    const hex = Buffer.from(crlfBody, 'utf8').toString('hex');
    const install = psqlSql(state, db, RUNNER, `do $x$ begin execute format('create or replace function example_app.crlf_fn() returns text language plpgsql set search_path to %L as %L', '', convert_from(decode('${hex}', 'hex'), 'UTF8')); end $x$`);
    check('a CRLF function body can be installed from hex', install.status === 0, (install.stderr || '').trim().split('\n')[0]);
    const q = renderPackSql(readFileSync(join(PACK_DIR, '02-function-body.sql'), 'utf8'), { functionName: 'example_app.crlf_fn' });
    const qFile = join(dir, 'selftest-02.sql');
    writeFileSync(qFile, q, 'utf8');
    const row = psql(state, { db, role: SUPER, args: ['-q', '-A', '-t', '-F', '|', '-f', qFile] });
    const fields = (row.stdout || '').split('|');
    const expected = bodyMd5Variants(crlfBody);
    check('pack query 02 reports the stored md5 and the CR count of the live body', fields[5] === String(expected.crCount) && fields[6] === expected.md5Stored, `cr=${fields[5]} md5=${fields[6]}`);
    check('md5 of the CRLF body differs from md5 of the same body as LF (the trap)', expected.md5Stored !== expected.md5Lf);
    // the volatile queries (90-92) are not part of snapshots: prove they at least run, as the runner role
    for (const file of listPackFiles().filter((f) => f.volatile)) {
      const ran = psql(state, { db, role: RUNNER, args: ['-q', '-A', '-t', '-f', file.path] });
      check(`pack query ${file.name} runs as the runner role`, ran.status === 0, (ran.stderr || '').trim().split('\n')[0]);
    }
    psqlSql(state, 'postgres', SUPER, `drop database if exists ${db} with (force)`);
  } finally {
    cmdStop({ dir }, true);
  }
  const bad = results.filter((ok) => !ok).length;
  console.log(bad === 0 ? `selftest PASSED (${results.length} checks)` : `selftest FAILED (${bad} of ${results.length})`);
  process.exit(bad === 0 ? 0 : 1);
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  switch (command) {
    case 'init': return cmdInit(args);
    case 'build': return cmdBuild(args);
    case 'pair': { const steps = cmdPair(args); const bad = steps.filter((s) => !s.ok).length; process.exit(bad ? 1 : 0); break; }
    case 'psql': { const state = readState(args.dir); const r = psql(state, { db: typeof args.db === 'string' ? args.db : 'postgres', role: typeof args.as === 'string' ? args.as : RUNNER, args: args.rest ?? [] }); process.stdout.write(r.stdout); process.stderr.write(r.stderr); process.exit(r.status ?? 1); break; }
    case 'body-md5': return cmdBodyMd5(args);
    case 'body-hex': return cmdBodyHex(args);
    case 'stop': return cmdStop(args, false);
    case 'destroy': return cmdStop(args, true);
    case 'selftest': return cmdSelftest(args);
    default:
      console.error('usage: scratch-pg.mjs init|build|pair|psql|body-md5|body-hex|selftest|stop|destroy (see the header of this file)');
      process.exit(2);
  }
}

main().catch((error) => { console.error(`scratch-pg: ${error.message}`); process.exit(1); });
