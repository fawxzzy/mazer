import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { bodyMd5Variants, md5Hex } from '../../../scripts/db-scratch/lib/md5.mjs';
import { countStatements, screenReadOnly } from '../../../scripts/db-scratch/lib/sql-screen.mjs';
import {
  guardMd5FromResult,
  lintPackFile,
  listPackFiles,
  renderPackSql
} from '../../../scripts/db-scratch/preimage-pack.mjs';

const read = (path) => readFileSync(resolve(path), 'utf8');

describe('db-scratch: the read-only preimage pack', () => {
  const files = listPackFiles();

  test('the pack holds the function, trigger, column, constraint, grant and long-transaction queries', () => {
    const names = files.map((f) => f.name);
    for (const expected of ['01-functions.sql', '02-function-body.sql', '03-triggers.sql', '04-columns.sql', '05-constraints-indexes.sql', '06-grants-rls.sql', '90-runner-role.sql', '91-long-transactions.sql']) {
      expect(names).toContain(expected);
    }
  });

  test.each(files.map((f) => [f.name, f.path]))('%s passes the read-only wrapper screen and is a single statement', (_name, path) => {
    expect(lintPackFile(readFileSync(path, 'utf8'))).toEqual([]);
  });

  test('every pack file carries the scope marker it advertises, so render can retarget it', () => {
    for (const file of files) {
      const sql = readFileSync(file.path, 'utf8');
      if (/^0[1-6]/.test(file.name)) expect(sql, file.name).toMatch(/-- SCOPE-(SCHEMAS|FUNCTION)/);
    }
  });

  test('the screen mirrors the wrapper: write words are refused even in string literals, concatenation passes', () => {
    expect(screenReadOnly("select 'update'")).toEqual(['update']);
    expect(screenReadOnly("select 'UPD' || 'ATE'")).toEqual([]);
    expect(screenReadOnly('select 1 -- insert delete\n/* drop */')).toEqual([]);
    expect(screenReadOnly('select pg_locks.locktype, relrowsecurity, prosecdef from t')).toEqual([]);
    expect(screenReadOnly('lock table x')).toEqual(['lock']);
    expect(screenReadOnly('set role x; begin; do $$ $$')).toEqual(['begin', 'do', 'set']);
  });

  test('statement counting ignores semicolons inside strings and comments', () => {
    expect(countStatements("select ';'; -- trailing; comment")).toBe(1);
    expect(countStatements('select 1; select 2')).toBe(2);
    expect(countStatements('select 1')).toBe(1);
  });

  test('render retargets the scope and rejects anything that is not a plain identifier', () => {
    const base = read('scripts/db-scratch/preimage/01-functions.sql');
    const rendered = renderPackSql(base, { schemas: ['mazer', 'fitness'] });
    expect(rendered).toContain("array['mazer','fitness']");
    expect(rendered).not.toContain("'account_private'");
    expect(lintPackFile(rendered)).toEqual([]);
    expect(() => renderPackSql(base, { schemas: ["x'); drop table t; --"] })).toThrow(/bad schema name/);
    const body = renderPackSql(read('scripts/db-scratch/preimage/02-function-body.sql'), { functionName: 'account_private.guard_username_claim' });
    expect(body).toContain("values ('account_private', 'guard_username_claim')");
    expect(() => renderPackSql(base, { functionName: 'a.b.c' })).toThrow(/--function/);
  });
});

describe('db-scratch: the live-body hash the guard pins (CRLF vs LF trap)', () => {
  const lfBody = " begin\n  return 1;\nend\n";
  const crlfBody = lfBody.replace(/\n/g, '\r\n');

  test('a CRLF body and its LF twin hash differently, and the variants name both', () => {
    const crlf = bodyMd5Variants(crlfBody);
    const lf = bodyMd5Variants(lfBody);
    expect(crlf.md5Stored).not.toBe(lf.md5Stored);
    expect(crlf.md5Lf).toBe(lf.md5Stored);
    expect(lf.md5Crlf).toBe(crlf.md5Stored);
    expect(crlf.crCount).toBe(3);
    expect(lf.crCount).toBe(0);
    expect(crlf.md5Stored).toBe(md5Hex(crlfBody));
  });

  test('guard-md5 pins the stored md5 of the live body and flags a repository blob that only matches as LF', () => {
    const live = bodyMd5Variants(crlfBody);
    const result = {
      rows: [{
        schema_name: 'mazer', function_name: 'mazer_set_username', identity_args: 'uuid, text',
        cr_count: live.crCount, md5_stored: live.md5Stored, md5_lf: live.md5Lf, md5_crlf: live.md5Crlf, body: crlfBody
      }]
    };
    const [report] = guardMd5FromResult(result, lfBody);
    expect(report.pinThisMd5).toBe(live.md5Stored);
    expect(report.lineEndings).toMatch(/CRLF/);
    expect(report.bodyTransferIntact).toBe(true);
    expect(report.repoFileMatchesLiveAsIs).toBe(false);
    expect(report.repoFileMatchesLiveIfCrlf).toBe(true);
  });

  test('guard-md5 reports a body whose CRs were lost in transfer, and an absent function', () => {
    const live = bodyMd5Variants(crlfBody);
    const damaged = [{ schema_name: 's', function_name: 'f', identity_args: '', cr_count: 3, md5_stored: live.md5Stored, md5_lf: live.md5Lf, md5_crlf: live.md5Crlf, body: lfBody }];
    expect(guardMd5FromResult(damaged)[0].bodyTransferIntact).toBe(false);
    expect(() => guardMd5FromResult({ rows: [] })).toThrow(/not found/);
  });
});

describe('db-scratch: the process doc and its entry points', () => {
  const doc = read('docs/ops/MAZER-SQL-CHANGE-PROCESS.md');

  test('the rule, the pattern and every named failure mode are written down', () => {
    for (const needle of [
      'faithful scratch PostgreSQL 17',
      'md5 of the LIVE function body',
      'CRLF',
      'not a member of supabase_auth_admin',
      'DROP FUNCTION',
      'CASCADE',
      'sb-query',
      'no default on',
      'sha256',
      'independent review',
      'fresh read-only preimage',
      'SQL proposal checklist'
    ]) {
      expect(doc.toLowerCase(), needle).toContain(needle.toLowerCase());
    }
  });

  test('the pull request template and AGENTS.md point at the process', () => {
    expect(read('.github/pull_request_template.md')).toContain('docs/ops/MAZER-SQL-CHANGE-PROCESS.md');
    expect(read('AGENTS.md')).toContain('docs/ops/MAZER-SQL-CHANGE-PROCESS.md');
  });

  test('the harness README documents every command the script offers', () => {
    const readme = read('scripts/db-scratch/README.md');
    for (const command of ['init', 'build', 'pair', 'body-md5', 'body-hex', 'selftest', 'destroy', 'run-preimage-pack.ps1', 'guard-md5']) {
      expect(readme, command).toContain(command);
    }
  });
});
