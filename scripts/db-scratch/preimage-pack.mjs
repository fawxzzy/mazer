#!/usr/bin/env node
// Read-only live-preimage query pack: lint, render, evidence index and guard-hash extraction.
// Nothing here opens a database connection. The queries run through the read-only wrapper
// (run-preimage-pack.ps1 -> sb-query.ps1) or, for scratch snapshots, through psql (scratch-pg.mjs).
//
//   node scripts/db-scratch/preimage-pack.mjs screen
//   node scripts/db-scratch/preimage-pack.mjs render --out <dir> [--schemas mazer,account_private] [--function mazer.mazer_set_username]
//   node scripts/db-scratch/preimage-pack.mjs index  --dir <dir>
//   node scripts/db-scratch/preimage-pack.mjs guard-md5 --result <02-function-body.json> [--repo-file <function-body.txt>]
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bodyMd5Variants, md5Hex, sha256Hex } from './lib/md5.mjs';
import { countStatements, screenReadOnly } from './lib/sql-screen.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const PACK_DIR = join(HERE, 'preimage');

const IDENT = /^[a-z_][a-z0-9_$]*$/i;

/** Pack files in order. `volatile` files (number >= 90) differ per connection and are left out of scratch snapshots. */
export function listPackFiles(dir = PACK_DIR) {
  return readdirSync(dir)
    .filter((name) => /^\d\d-.+\.sql$/.test(name))
    .sort()
    .map((name) => ({ name, path: join(dir, name), volatile: Number(name.slice(0, 2)) >= 90 }));
}

/** Rewrites the scope lines. Identifiers are validated, so a value can never carry SQL. */
export function renderPackSql(sql, { schemas, functionName } = {}) {
  let out = sql;
  if (schemas) {
    for (const schema of schemas) if (!IDENT.test(schema)) throw new Error(`bad schema name: ${schema}`);
    const literal = `array[${schemas.map((s) => `'${s}'`).join(',')}]`;
    out = out.replace(/^(.*)array\[[^\]]*\](.*-- SCOPE-SCHEMAS.*)$/gm, `$1${literal}$2`);
  }
  if (functionName) {
    const [schema, fn, ...rest] = functionName.split('.');
    if (!schema || !fn || rest.length || !IDENT.test(schema) || !IDENT.test(fn)) {
      throw new Error(`--function must be schema.name with plain identifiers, got: ${functionName}`);
    }
    out = out.replace(/values \('[^']*', '[^']*'\)(.*-- SCOPE-FUNCTION.*)$/gm, `values ('${schema}', '${fn}')$1`);
  }
  return out;
}

export function lintPackFile(sql) {
  const problems = [];
  const words = screenReadOnly(sql);
  if (words.length) problems.push(`the read-only wrapper would refuse it (words: ${words.join(', ')})`);
  const statements = countStatements(sql);
  if (statements !== 1) problems.push(`must be exactly one statement (the wrapper returns only the last), found ${statements}`);
  return problems;
}

/** Pulls the first object holding md5_stored out of a wrapper/psql JSON result, whatever the envelope. */
export function findResultRows(value) {
  if (Array.isArray(value)) {
    if (value.some((row) => row && typeof row === 'object' && 'md5_stored' in row)) return value;
    for (const item of value) { const hit = findResultRows(item); if (hit) return hit; }
  } else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) { const hit = findResultRows(item); if (hit) return hit; }
  }
  return null;
}

export function guardMd5FromResult(json, repoBody) {
  const rows = findResultRows(json);
  if (!rows || rows.length === 0) throw new Error('no row with md5_stored in the result: the function was not found in the live database');
  return rows.map((row) => {
    const out = {
      function: `${row.schema_name}.${row.function_name}(${row.identity_args ?? ''})`,
      pinThisMd5: row.md5_stored,
      crCount: row.cr_count,
      lineEndings: row.cr_count > 0 ? 'CRLF (or mixed)' : 'LF',
      md5IfLf: row.md5_lf,
      md5IfCrlf: row.md5_crlf
    };
    if (typeof row.body === 'string') {
      const local = bodyMd5Variants(row.body);
      out.recomputedFromBody = local.md5Stored;
      out.bodyTransferIntact = local.md5Stored === row.md5_stored;
    }
    if (repoBody !== undefined) {
      const repo = bodyMd5Variants(repoBody);
      out.repoFileMd5AsIs = repo.md5Stored;
      out.repoFileMatchesLiveAsIs = repo.md5Stored === row.md5_stored;
      out.repoFileMatchesLiveIfLf = repo.md5Lf === row.md5_stored;
      out.repoFileMatchesLiveIfCrlf = repo.md5Crlf === row.md5_stored;
    }
    return out;
  });
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith('--')) { args[a.slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true; } else args._.push(a);
  }
  return args;
}

function main() {
  const [command, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  if (command === 'screen') {
    let bad = 0;
    for (const file of listPackFiles()) {
      const problems = lintPackFile(readFileSync(file.path, 'utf8'));
      console.log(`${problems.length ? 'FAIL' : 'ok  '} ${file.name}${file.volatile ? ' (volatile)' : ''}${problems.length ? ` - ${problems.join('; ')}` : ''}`);
      bad += problems.length ? 1 : 0;
    }
    process.exit(bad ? 1 : 0);
  } else if (command === 'render') {
    if (!args.out) throw new Error('render needs --out <dir>');
    const out = resolve(args.out);
    mkdirSync(out, { recursive: true });
    const schemas = typeof args.schemas === 'string' ? args.schemas.split(',').map((s) => s.trim()).filter(Boolean) : undefined;
    const lines = [];
    for (const file of listPackFiles()) {
      const sql = renderPackSql(readFileSync(file.path, 'utf8'), { schemas, functionName: typeof args.function === 'string' ? args.function : undefined });
      const problems = lintPackFile(sql);
      if (problems.length) throw new Error(`${file.name}: ${problems.join('; ')}`);
      writeFileSync(join(out, file.name), sql, 'utf8');
      lines.push(`${sha256Hex(Buffer.from(sql, 'utf8'))}  ${file.name}`);
    }
    writeFileSync(join(out, 'SHA256SUMS.txt'), `${lines.join('\n')}\n`, 'utf8');
    console.log(`rendered ${lines.length} query files to ${out}`);
  } else if (command === 'index') {
    if (!args.dir) throw new Error('index needs --dir <dir>');
    const dir = resolve(args.dir);
    const lines = [`# preimage evidence index, written ${new Date().toISOString()}`, '# sha256 of every file in this folder (query files and the results the wrapper returned)'];
    for (const name of readdirSync(dir).sort()) {
      if (name === 'EVIDENCE.txt') continue;
      lines.push(`sha256=${sha256Hex(readFileSync(join(dir, name)))} md5=${md5Hex(readFileSync(join(dir, name), 'utf8'))} ${name}`);
    }
    writeFileSync(join(dir, 'EVIDENCE.txt'), `${lines.join('\n')}\n`, 'utf8');
    console.log(lines.join('\n'));
  } else if (command === 'guard-md5') {
    if (!args.result) throw new Error('guard-md5 needs --result <json from query 02 or 01>');
    const json = JSON.parse(readFileSync(resolve(args.result), 'utf8').replace(/^﻿/, ''));
    const repoBody = typeof args['repo-file'] === 'string' ? readFileSync(resolve(args['repo-file']), 'utf8') : undefined;
    console.log(JSON.stringify(guardMd5FromResult(json, repoBody), null, 2));
  } else {
    console.error('usage: preimage-pack.mjs screen | render --out <dir> [--schemas a,b] [--function s.f] | index --dir <dir> | guard-md5 --result <json> [--repo-file <file>]');
    process.exit(2);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(`preimage-pack: ${error.message}`); process.exit(1); }
}
