import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(SCRIPT_PATH), "..", "..");
const MANIFEST_RELATIVE_PATH = join(
  "supabase",
  "recovery",
  "fp-mzr-rec-001-provenance.json",
);
const MIGRATIONS_RELATIVE_PATH = join("supabase", "migrations");
const MIGRATION_PATTERN = /^(\d{14})_(.+)\.sql$/;
const EXPECTED_KINDS = [
  "columns",
  "constraints",
  "extensions",
  "functions",
  "grants",
  "indexes",
  "policies",
  "tables",
  "triggers",
];
const PROVIDER_MANAGED_KINDS = new Set(["extensions"]);
const FORBIDDEN_PORTS = new Set([5432, 5433]);

const CATALOG_SIGNATURE_SQL = [
  "with signatures(kind, signature) as (",
  "  select 'tables',",
  "         format('%I.%I|rls=%s|force_rls=%s|replica=%s',",
  "           n.nspname, c.relname, c.relrowsecurity, c.relforcerowsecurity, c.relreplident)",
  "  from pg_class c",
  "  join pg_namespace n on n.oid = c.relnamespace",
  "  where n.nspname = 'public' and c.relkind = 'r' and left(c.relname, 6) = 'mazer_'",
  "  union all",
  "  select 'columns',",
  "         format('%I.%I|%s|%I|%s|not_null=%s|default=%s|identity=%s|generated=%s',",
  "           n.nspname, c.relname, a.attnum, a.attname,",
  "           pg_catalog.format_type(a.atttypid, a.atttypmod), a.attnotnull,",
  "           coalesce(pg_get_expr(d.adbin, d.adrelid), ''), a.attidentity, a.attgenerated)",
  "  from pg_attribute a",
  "  join pg_class c on c.oid = a.attrelid",
  "  join pg_namespace n on n.oid = c.relnamespace",
  "  left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum",
  "  where n.nspname = 'public' and c.relkind = 'r' and left(c.relname, 6) = 'mazer_'",
  "    and a.attnum > 0 and not a.attisdropped",
  "  union all",
  "  select 'constraints',",
  "         format('%I.%I|%I|%s|%s', n.nspname, c.relname, con.conname, con.contype,",
  "           pg_get_constraintdef(con.oid, true))",
  "  from pg_constraint con",
  "  join pg_class c on c.oid = con.conrelid",
  "  join pg_namespace n on n.oid = c.relnamespace",
  "  where n.nspname = 'public' and left(c.relname, 6) = 'mazer_'",
  "  union all",
  "  select 'indexes',",
  "         format('%I.%I|%I|%s', ns.nspname, tbl.relname, idx.relname, pg_get_indexdef(idx.oid))",
  "  from pg_index i",
  "  join pg_class tbl on tbl.oid = i.indrelid",
  "  join pg_namespace ns on ns.oid = tbl.relnamespace",
  "  join pg_class idx on idx.oid = i.indexrelid",
  "  where ns.nspname = 'public' and left(tbl.relname, 6) = 'mazer_'",
  "  union all",
  "  select 'policies',",
  "         format('%I.%I|%I|cmd=%s|permissive=%s|roles=%s|using=%s|check=%s',",
  "           schemaname, tablename, policyname, cmd, permissive, array_to_string(roles, ','),",
  "           coalesce(qual, ''), coalesce(with_check, ''))",
  "  from pg_policies",
  "  where schemaname = 'public' and left(tablename, 6) = 'mazer_'",
  "  union all",
  "  select 'grants',",
  "         format('%I.%I|%I|%s|grantable=%s', table_schema, table_name, grantee,",
  "           privilege_type, is_grantable)",
  "  from information_schema.role_table_grants",
  "  where table_schema = 'public' and left(table_name, 6) = 'mazer_'",
  "    and grantee in ('anon', 'authenticated', 'service_role')",
  "  union all",
  "  select 'functions',",
  "         format('%I.%I|%s', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid))",
  "  from pg_proc p join pg_namespace n on n.oid = p.pronamespace",
  "  where n.nspname = 'public' and left(p.proname, 6) = 'mazer_'",
  "  union all",
  "  select 'triggers',",
  "         format('%I.%I|%I|%s', n.nspname, c.relname, t.tgname, pg_get_triggerdef(t.oid, true))",
  "  from pg_trigger t",
  "  join pg_class c on c.oid = t.tgrelid",
  "  join pg_namespace n on n.oid = c.relnamespace",
  "  where n.nspname = 'public' and left(c.relname, 6) = 'mazer_' and not t.tgisinternal",
  "  union all",
  "  select 'extensions',",
  "         format('%I|%s|%I', e.extname, e.extversion, n.nspname)",
  "  from pg_extension e join pg_namespace n on n.oid = e.extnamespace",
  "),",
  "kinds(kind) as (",
  "  values ('tables'), ('columns'), ('constraints'), ('indexes'), ('policies'),",
  "         ('grants'), ('functions'), ('triggers'), ('extensions')",
  ")",
  "select k.kind, count(s.signature)::integer as item_count,",
  "       encode(extensions.digest(convert_to(coalesce(string_agg(s.signature, E'\\n' order by s.signature), ''), 'UTF8'), 'sha256'), 'hex') as sha256",
  "from kinds k left join signatures s on s.kind = k.kind",
  "group by k.kind order by k.kind;",
].join("\n");

const EXTENSION_DETAIL_SQL = [
  "select format('%I|%s|%I', e.extname, e.extversion, n.nspname)",
  "from pg_extension e",
  "join pg_namespace n on n.oid = e.extnamespace",
  "order by e.extname;",
].join("\n");

const BOOTSTRAP_DATABASE_SQL = [
  "create schema auth;",
  "create schema extensions;",
  "create table auth.users (id uuid primary key);",
  "create function auth.uid() returns uuid",
  "language sql stable",
  "as $$ select null::uuid $$;",
  "create extension pgcrypto with schema extensions;",
  "create extension \"uuid-ossp\" with schema extensions;",
  "create extension pg_stat_statements with schema extensions;",
].join("\n");

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function canonicalizeSql(value) {
  return value.replace(/\r\n/g, "\n").trim();
}

export function parsePostgresMajor(versionOutput) {
  const match = /\(PostgreSQL\)\s+(\d+)(?:\.|\s|$)/.exec(versionOutput);
  if (!match) {
    throw new Error(
      "Unable to determine PostgreSQL major version from: " +
        JSON.stringify(versionOutput),
    );
  }
  return Number(match[1]);
}

function parseMigrationIdentity(fileName) {
  const match = MIGRATION_PATTERN.exec(fileName);
  if (!match) {
    throw new Error("Invalid executable migration filename: " + fileName);
  }
  return { version: match[1], name: match[2] };
}

function duplicateValues(values) {
  const counts = new Map();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([value]) => value)
    .sort();
}

export function findDuplicateMigrationIdentities(fileNames) {
  const identities = fileNames.map(parseMigrationIdentity);
  return {
    versions: duplicateValues(identities.map(({ version }) => version)),
    names: duplicateValues(identities.map(({ name }) => name)),
  };
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(
      label + " mismatch: expected " + JSON.stringify(expected) +
        ", received " + JSON.stringify(actual),
    );
  }
}

function assertArrayEqual(actual, expected, label) {
  assertEqual(JSON.stringify(actual), JSON.stringify(expected), label);
}

function loadManifest(repoRoot) {
  const manifestPath = join(repoRoot, MANIFEST_RELATIVE_PATH);
  return JSON.parse(readFileSync(manifestPath, "utf8"));
}

function sortedUnique(values) {
  return [...new Set(values)].sort();
}

export function classifyMigrationHistory(
  appliedVersions,
  legacyVersions,
  targetVersions,
) {
  const applied = sortedUnique(appliedVersions);
  const legacy = sortedUnique(legacyVersions);
  const target = sortedUnique(targetVersions);

  if (applied.length === 0) {
    return "FRESH";
  }
  if (JSON.stringify(applied) === JSON.stringify(legacy)) {
    return "REPAIR_REQUIRED";
  }
  if (JSON.stringify(applied) === JSON.stringify(target)) {
    return "CURRENT";
  }
  return "BLOCKED";
}

export function buildLegacyRepairPlan(contract, appliedVersions) {
  const legacyVersions = contract.legacyVersions.map(({ version }) => version);
  const suppliedVersions = appliedVersions ?? legacyVersions;
  const historyState = classifyMigrationHistory(
    suppliedVersions,
    legacyVersions,
    contract.targetVersions,
  );

  return {
    ok: historyState === "REPAIR_REQUIRED",
    historyState,
    failClosed: true,
    normalApplyAllowed:
      historyState === "FRESH" || historyState === "CURRENT",
    mutationPerformed: false,
    disposableDatabaseDisposition: contract.disposableDatabaseDisposition,
    retainedDatabaseDisposition: contract.retainedDatabaseDisposition,
    retainedDatabasePrerequisites: contract.retainedDatabasePrerequisites,
    commands:
      historyState === "REPAIR_REQUIRED"
        ? contract.repairSteps.map(
            ({ version, status }) =>
              "supabase migration repair " + version + " --status " + status,
          )
        : [],
    reason:
      historyState === "REPAIR_REQUIRED"
        ? "Legacy repository timestamps must be remapped before normal apply."
        : historyState === "BLOCKED"
          ? "Mixed, partial, or unknown migration history requires manual disposition."
          : "No legacy history repair is required.",
  };
}

function replaceExactlyOnce(value, search, replacement, label) {
  const firstIndex = value.indexOf(search);
  if (firstIndex === -1 || value.indexOf(search, firstIndex + search.length) !== -1) {
    throw new Error("Expected exactly one legacy fixture transform marker: " + label);
  }
  return value.slice(0, firstIndex) + replacement +
    value.slice(firstIndex + search.length);
}

function materializeLegacyFixtureSources(repoRoot, manifest) {
  const migrationsPath = join(repoRoot, MIGRATIONS_RELATIVE_PATH);
  return manifest.legacyRepositoryHistory.legacyVersions.map((legacy) => {
    const recovered = manifest.migrations.find(
      ({ version }) => version === legacy.recoveredVersion,
    );
    if (!recovered) {
      throw new Error(
        "Legacy fixture target is missing: " + legacy.recoveredVersion,
      );
    }

    let sql = canonicalizeSql(
      readFileSync(join(migrationsPath, recovered.file), "utf8"),
    );
    if (legacy.fixtureTransform === "restore_post_apply_progression_revoke") {
      const grant =
        "grant select, insert, update on public.mazer_progression_states to authenticated;";
      sql = replaceExactlyOnce(
        sql,
        grant,
        "revoke all on table public.mazer_progression_states from anon, authenticated, service_role;\n\n" +
          grant,
        legacy.version,
      );
    } else if (
      legacy.fixtureTransform === "restore_post_apply_account_revokes"
    ) {
      for (const table of [
        "mazer_profiles",
        "mazer_ai_progression_states",
        "mazer_cycle_receipts",
      ]) {
        const original =
          "revoke all on table public." + table + " from anon;";
        sql = replaceExactlyOnce(
          sql,
          original,
          "revoke all on table public." + table +
            " from anon, authenticated, service_role;",
          legacy.version + ":" + table,
        );
      }
    } else if (legacy.fixtureTransform !== "body_unchanged") {
      throw new Error(
        "Unknown legacy fixture transform: " + legacy.fixtureTransform,
      );
    }

    assertEqual(
      sha256(sql),
      legacy.canonicalSqlSha256,
      legacy.version + " legacy canonical SQL digest",
    );
    return {
      version: legacy.version,
      name: legacy.name,
      file: legacy.version + "_" + legacy.name + ".sql",
      sql: sql + "\n",
    };
  });
}

export function verifySourceRecovery(repoRoot = REPO_ROOT) {
  const manifest = loadManifest(repoRoot);
  const migrationsPath = join(repoRoot, MIGRATIONS_RELATIVE_PATH);
  const executableFiles = readdirSync(migrationsPath)
    .filter((fileName) => fileName.endsWith(".sql"))
    .sort();
  const duplicates = findDuplicateMigrationIdentities(executableFiles);

  assertEqual(manifest.schemaVersion, "mazer.supabase-source-recovery.v1", "manifest schema");
  assertEqual(manifest.packetId, "FP-MZR-REC-001", "packet id");
  assertEqual(manifest.projectRef, "geknvnrmktchljnyddwp", "project ref");
  assertEqual(manifest.captureBoundary.mode, "authorized-read-only-provider-catalog", "capture mode");
  assertEqual(manifest.captureBoundary.liveMutationPerformed, false, "live mutation boundary");
  assertEqual(manifest.captureBoundary.secretsReadOrStored, false, "secret boundary");
  assertEqual(manifest.migrations.length, 4, "live migration denominator");
  assertArrayEqual(executableFiles, manifest.migrationOrder, "ordered executable migrations");
  assertArrayEqual(
    manifest.migrations.map(({ file }) => file),
    manifest.migrationOrder,
    "manifest migration order",
  );
  assertArrayEqual(duplicates.versions, [], "duplicate migration versions");
  assertArrayEqual(duplicates.names, [], "duplicate migration names");
  assertEqual(
    manifest.legacyRepositoryHistory.normalApplyDisposition,
    "REFUSE",
    "legacy normal apply disposition",
  );
  assertArrayEqual(
    manifest.legacyRepositoryHistory.targetVersions,
    manifest.migrations.map(({ version }) => version),
    "legacy repair target versions",
  );

  for (const migration of manifest.migrations) {
    const identity = parseMigrationIdentity(migration.file);
    assertEqual(identity.version, migration.version, migration.file + " version");
    assertEqual(identity.name, migration.name, migration.file + " name");
    assertEqual(
      migration.provenanceClass,
      "sanitized-live-migration-statement",
      migration.file + " provenance class",
    );
    assertEqual(
      migration.sourceReference,
      "supabase_migrations.schema_migrations.statements[1]",
      migration.file + " source reference",
    );

    const source = readFileSync(join(migrationsPath, migration.file), "utf8");
    const canonicalSql = canonicalizeSql(source);
    const repositoryLfRaw = Buffer.from(canonicalSql + "\n", "utf8");
    assertEqual(
      sha256(canonicalSql),
      migration.canonicalSqlSha256,
      migration.file + " canonical SQL digest",
    );
    assertEqual(
      migration.canonicalSqlSha256,
      migration.liveStatementRawSha256,
      migration.file + " live-to-canonical digest",
    );
    assertEqual(
      repositoryLfRaw.length,
      migration.repositoryLfRawBytes,
      migration.file + " repository LF raw bytes",
    );
    assertEqual(
      sha256(repositoryLfRaw),
      migration.repositoryLfRawSha256,
      migration.file + " repository LF raw digest",
    );

    if (
      migration.priorRepositoryFile &&
      existsSync(join(migrationsPath, migration.priorRepositoryFile))
    ) {
      throw new Error(
        "Stale executable migration identity remains: " +
          migration.priorRepositoryFile,
      );
    }
  }

  assertArrayEqual(
    Object.keys(manifest.liveCatalogSignature.kinds).sort(),
    [...EXPECTED_KINDS].sort(),
    "live catalog signature kinds",
  );
  const legacySources = materializeLegacyFixtureSources(repoRoot, manifest);
  const legacyPlan = buildLegacyRepairPlan(
    manifest.legacyRepositoryHistory,
    legacySources.map(({ version }) => version),
  );
  assertEqual(legacyPlan.historyState, "REPAIR_REQUIRED", "legacy history detection");
  assertEqual(legacyPlan.normalApplyAllowed, false, "legacy normal apply guard");

  const checkedFiles = [
    join(repoRoot, MANIFEST_RELATIVE_PATH),
    ...executableFiles.map((fileName) => join(migrationsPath, fileName)),
  ];
  const forbiddenSecretPatterns = [
    /sb_secret_[A-Za-z0-9_-]+/,
    /SUPABASE_SERVICE_ROLE_KEY\s*=/,
    /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
  ];
  for (const filePath of checkedFiles) {
    const value = readFileSync(filePath, "utf8");
    if (forbiddenSecretPatterns.some((pattern) => pattern.test(value))) {
      throw new Error("Secret-like material detected in " + filePath);
    }
  }

  return {
    ok: true,
    packetId: manifest.packetId,
    projectRef: manifest.projectRef,
    migrationCount: executableFiles.length,
    migrationOrder: executableFiles,
    duplicateVersions: duplicates.versions,
    duplicateNames: duplicates.names,
    legacyHistory: {
      versions: legacySources.map(({ version }) => version),
      historyState: legacyPlan.historyState,
      normalApplyAllowed: legacyPlan.normalApplyAllowed,
      deterministicRepairSteps: manifest.legacyRepositoryHistory.repairSteps,
    },
    liveCatalogSignature: manifest.liveCatalogSignature,
    liveMutationPerformed: false,
  };
}

function resolvePgBinary(binaryName) {
  const configuredBin = process.env.PG17_BIN;
  if (configuredBin) {
    return join(configuredBin, process.platform === "win32" ? binaryName + ".exe" : binaryName);
  }

  if (process.platform === "win32") {
    const windowsPath = join(
      "C:\\Program Files",
      "PostgreSQL",
      "17",
      "bin",
      binaryName + ".exe",
    );
    if (existsSync(windowsPath)) {
      return windowsPath;
    }
  }

  return binaryName;
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true,
    ...options,
  });

  if (result.error || result.status !== 0) {
    const detail = [
      result.error?.message,
      result.stdout?.trim(),
      result.stderr?.trim(),
    ]
      .filter(Boolean)
      .join("\n");
    throw new Error(
      "Command failed: " + command + " " + args.join(" ") +
        (detail ? "\n" + detail : ""),
    );
  }
  return result.stdout ?? "";
}

function parsePort(argv) {
  const index = argv.indexOf("--port");
  const value = index === -1 ? 55432 : Number(argv[index + 1]);
  if (!Number.isInteger(value) || value < 1024 || value > 65535) {
    throw new Error("Replay port must be an integer from 1024 through 65535.");
  }
  if (FORBIDDEN_PORTS.has(value)) {
    throw new Error("Replay must never attach to protected port " + value + ".");
  }
  return value;
}

function isPortFree(port) {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.unref();
    server.once("error", (error) => {
      if (error.code === "EADDRINUSE") {
        resolvePort(false);
        return;
      }
      reject(error);
    });
    server.listen({ host: "127.0.0.1", port, exclusive: true }, () => {
      server.close(() => resolvePort(true));
    });
  });
}

async function waitForPortRelease(port) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (await isPortFree(port)) {
      return true;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  return false;
}

function parseCatalogRows(output) {
  const result = {};
  for (const line of output.trim().split(/\r?\n/).filter(Boolean)) {
    const [kind, count, digest] = line.split("|");
    result[kind] = { count: Number(count), sha256: digest };
  }
  return result;
}

function compareCatalog(actual, expected, kinds) {
  const mismatches = [];
  for (const kind of kinds) {
    const actualKind = actual[kind];
    const expectedKind = expected[kind];
    if (
      !actualKind ||
      actualKind.count !== expectedKind.count ||
      actualKind.sha256 !== expectedKind.sha256
    ) {
      mismatches.push({ kind, expected: expectedKind, actual: actualKind ?? null });
    }
  }
  return mismatches;
}

function psqlArgs(port, database, extraArgs) {
  return [
    "-X",
    "-v",
    "ON_ERROR_STOP=1",
    "-h",
    "127.0.0.1",
    "-p",
    String(port),
    "-U",
    "postgres",
    "-d",
    database,
    ...extraArgs,
  ];
}

function sqlLiteral(value) {
  return "'" + String(value).replaceAll("'", "''") + "'";
}

function migrationHistoryFixtureSql(legacySources) {
  const values = legacySources
    .map(
      ({ version, name }) =>
        "(" + sqlLiteral(version) + ", " + sqlLiteral(name) + ", '{}'::text[])",
    )
    .join(",\n");
  return [
    "create schema supabase_migrations;",
    "create table supabase_migrations.schema_migrations (",
    "  version text primary key,",
    "  name text not null,",
    "  statements text[] not null default '{}'",
    ");",
    "insert into supabase_migrations.schema_migrations (version, name, statements)",
    "values",
    values + ";",
  ].join("\n");
}

function migrationHistoryRepairSql(manifest) {
  const contract = manifest.legacyRepositoryHistory;
  const reverted = contract.repairSteps
    .filter(({ status }) => status === "reverted")
    .map(({ version }) => sqlLiteral(version))
    .join(", ");
  const appliedRows = contract.repairSteps
    .filter(({ status }) => status === "applied")
    .map(({ version }) => {
      const migration = manifest.migrations.find(
        (candidate) => candidate.version === version,
      );
      if (!migration) {
        throw new Error("Repair target migration is missing: " + version);
      }
      return (
        "(" + sqlLiteral(version) + ", " + sqlLiteral(migration.name) +
        ", '{}'::text[])"
      );
    })
    .join(",\n");

  return [
    "begin;",
    "delete from supabase_migrations.schema_migrations",
    "where version in (" + reverted + ");",
    "insert into supabase_migrations.schema_migrations (version, name, statements)",
    "values",
    appliedRows,
    "on conflict (version) do update",
    "set name = excluded.name, statements = excluded.statements;",
    "commit;",
  ].join("\n");
}

function readMigrationHistory(psql, port, database) {
  return runCommand(
    psql,
    psqlArgs(port, database, [
      "-qAt",
      "-c",
      "select version from supabase_migrations.schema_migrations order by version;",
    ]),
  )
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);
}

function readCatalog(psql, port, database) {
  return parseCatalogRows(
    runCommand(
      psql,
      psqlArgs(port, database, [
        "-qAt",
        "--field-separator=|",
        "-c",
        CATALOG_SIGNATURE_SQL,
      ]),
    ),
  );
}

async function runReplay(repoRoot = REPO_ROOT, argv = process.argv.slice(2)) {
  const staticReceipt = verifySourceRecovery(repoRoot);
  const manifest = loadManifest(repoRoot);
  const port = parsePort(argv);
  const ownedRoot = join(tmpdir(), "fp-mzr-rec-001-pg17-" + process.pid);
  const dataDirectory = join(ownedRoot, "data");
  const logPath = join(ownedRoot, "postgres.log");
  const migrationsPath = join(repoRoot, MIGRATIONS_RELATIVE_PATH);
  const initdb = resolvePgBinary("initdb");
  const pgCtl = resolvePgBinary("pg_ctl");
  const psql = resolvePgBinary("psql");
  const postgres = resolvePgBinary("postgres");
  const toolchain = {};
  const appliedPrefix = { replayA: [], replayB: [], legacyHistory: [] };
  let started = false;
  let replayError = null;
  let replayReceipt = null;
  let cleanupReceipt = null;

  if (existsSync(ownedRoot)) {
    throw new Error("Owned replay path already exists: " + ownedRoot);
  }
  if (!(await isPortFree(port))) {
    throw new Error("Owned replay port is not free: " + port);
  }

  try {
    for (const [name, binary] of Object.entries({
      postgres,
      initdb,
      pg_ctl: pgCtl,
      psql,
    })) {
      const version = runCommand(binary, ["--version"]).trim();
      const major = parsePostgresMajor(version);
      if (major !== 17) {
        throw new Error(
          "Replay requires PostgreSQL 17, but " + name +
            " reported major " + major + ": " + version,
        );
      }
      toolchain[name] = { binary, version, major };
    }

    mkdirSync(ownedRoot, { recursive: false });
    runCommand(initdb, [
      "-D",
      dataDirectory,
      "-A",
      "trust",
      "-U",
      "postgres",
      "--encoding=UTF8",
      "--no-locale",
    ]);
    runCommand(pgCtl, [
      "-D",
      dataDirectory,
      "-l",
      logPath,
      "-o",
      "-p " + port + " -h 127.0.0.1",
      "-w",
      "start",
    ], { stdio: "ignore" });
    started = true;

    runCommand(
      psql,
      psqlArgs(port, "postgres", [
        "-qAt",
        "-c",
        "create role anon nologin; create role authenticated nologin; create role service_role nologin;",
      ]),
    );

    const replayDatabases = [
      ["replayA", "mazer_replay_a"],
      ["replayB", "mazer_replay_b"],
    ];
    const legacyDatabase = "mazer_legacy_history";
    const catalogs = {};
    const extensionDetails = {};

    for (const [receiptKey, database] of replayDatabases) {
      runCommand(
        psql,
        psqlArgs(port, "postgres", ["-qAt", "-c", "create database " + database + ";"]),
      );
      runCommand(
        psql,
        psqlArgs(port, database, ["-qAt", "-c", BOOTSTRAP_DATABASE_SQL]),
      );

      for (const fileName of manifest.migrationOrder) {
        runCommand(
          psql,
          psqlArgs(port, database, ["-qAt", "-f", join(migrationsPath, fileName)]),
        );
        appliedPrefix[receiptKey].push(fileName);
      }

      catalogs[receiptKey] = readCatalog(psql, port, database);
      extensionDetails[receiptKey] = runCommand(
        psql,
        psqlArgs(port, database, ["-qAt", "-c", EXTENSION_DETAIL_SQL]),
      )
        .trim()
        .split(/\r?\n/)
        .filter(Boolean);
    }

    const deterministic =
      JSON.stringify(catalogs.replayA) === JSON.stringify(catalogs.replayB) &&
      JSON.stringify(extensionDetails.replayA) ===
        JSON.stringify(extensionDetails.replayB);
    const exactKinds = EXPECTED_KINDS.filter(
      (kind) => !PROVIDER_MANAGED_KINDS.has(kind),
    );
    const exactMismatches = compareCatalog(
      catalogs.replayA,
      manifest.liveCatalogSignature.kinds,
      exactKinds,
    );
    const extensionMismatches = compareCatalog(
      catalogs.replayA,
      manifest.liveCatalogSignature.kinds,
      ["extensions"],
    );

    if (!deterministic) {
      throw new Error("Two zero-to-head replays produced different catalog signatures.");
    }
    if (exactMismatches.length > 0) {
      throw new Error(
        "Fixture-enabled replay does not match live Mazer contract signatures: " +
          JSON.stringify(exactMismatches),
      );
    }

    const legacySources = materializeLegacyFixtureSources(repoRoot, manifest);
    runCommand(
      psql,
      psqlArgs(port, "postgres", [
        "-qAt",
        "-c",
        "create database " + legacyDatabase + ";",
      ]),
    );
    runCommand(
      psql,
      psqlArgs(port, legacyDatabase, ["-qAt", "-c", BOOTSTRAP_DATABASE_SQL]),
    );
    runCommand(
      psql,
      psqlArgs(port, legacyDatabase, ["-qAt", "-f", "-"]),
      { input: migrationHistoryFixtureSql(legacySources) },
    );
    for (const legacySource of legacySources) {
      runCommand(
        psql,
        psqlArgs(port, legacyDatabase, ["-qAt", "-f", "-"]),
        { input: legacySource.sql },
      );
      appliedPrefix.legacyHistory.push(legacySource.file);
    }

    const legacyHistoryBefore = readMigrationHistory(
      psql,
      port,
      legacyDatabase,
    );
    const legacyCatalogBefore = readCatalog(psql, port, legacyDatabase);
    const legacyPlan = buildLegacyRepairPlan(
      manifest.legacyRepositoryHistory,
      legacyHistoryBefore,
    );
    const legacyCatalogMismatches = compareCatalog(
      legacyCatalogBefore,
      manifest.liveCatalogSignature.kinds,
      exactKinds,
    );
    if (
      legacyPlan.historyState !== "REPAIR_REQUIRED" ||
      legacyPlan.normalApplyAllowed ||
      legacyCatalogMismatches.length > 0
    ) {
      throw new Error(
        "Legacy migration history did not fail closed with an exact catalog: " +
          JSON.stringify({ legacyPlan, legacyCatalogMismatches }),
      );
    }

    const repairSql = migrationHistoryRepairSql(manifest);
    runCommand(
      psql,
      psqlArgs(port, legacyDatabase, ["-qAt", "-f", "-"]),
      { input: repairSql },
    );
    const historyAfterFirstRepair = readMigrationHistory(
      psql,
      port,
      legacyDatabase,
    );
    const catalogAfterFirstRepair = readCatalog(psql, port, legacyDatabase);
    runCommand(
      psql,
      psqlArgs(port, legacyDatabase, ["-qAt", "-f", "-"]),
      { input: repairSql },
    );
    const historyAfterSecondRepair = readMigrationHistory(
      psql,
      port,
      legacyDatabase,
    );
    const catalogAfterSecondRepair = readCatalog(psql, port, legacyDatabase);
    const repairedHistoryState = classifyMigrationHistory(
      historyAfterFirstRepair,
      manifest.legacyRepositoryHistory.legacyVersions.map(
        ({ version }) => version,
      ),
      manifest.legacyRepositoryHistory.targetVersions,
    );
    const deterministicHistoryRepair =
      repairedHistoryState === "CURRENT" &&
      JSON.stringify(historyAfterFirstRepair) ===
        JSON.stringify(historyAfterSecondRepair) &&
      JSON.stringify(legacyCatalogBefore) ===
        JSON.stringify(catalogAfterFirstRepair) &&
      JSON.stringify(catalogAfterFirstRepair) ===
        JSON.stringify(catalogAfterSecondRepair);
    if (!deterministicHistoryRepair) {
      throw new Error(
        "Legacy migration-history repair was not deterministic or changed schema.",
      );
    }

    const legacyHistoryReceipt = {
      fixtureClass: "prior-repository-history-with-exact-source-digests",
      historyBefore: legacyHistoryBefore,
      detection: legacyPlan.historyState,
      normalApplyRefused: !legacyPlan.normalApplyAllowed,
      catalogBeforeRepair: legacyCatalogBefore,
      exactLiveCatalogMismatches: legacyCatalogMismatches,
      emittedRepairCommands: legacyPlan.commands,
      historyAfterRepair: historyAfterFirstRepair,
      repairedHistoryState,
      schemaChangedByRepair: false,
      deterministicRepairReplay: deterministicHistoryRepair,
      mutationScope: "owned-disposable-fixture-only",
    };

    replayReceipt = {
      ok: true,
      packetId: manifest.packetId,
      staticReceipt,
      runtime: {
        engine: toolchain.postgres.version,
        toolchain,
        port,
        databases: [
          ...replayDatabases.map(([, database]) => database),
          legacyDatabase,
        ],
      },
      fixtureClass: manifest.replayContract.fixtureClass,
      appliedPrefix,
      catalogSignatures: catalogs.replayA,
      deterministicReplay: deterministic,
      legacyHistoryFixture: legacyHistoryReceipt,
      exactLiveMazerContractKinds: exactKinds,
      exactLiveMazerContractMismatches: exactMismatches,
      localInstalledExtensions: extensionDetails.replayA,
      liveInstalledExtensions: manifest.liveCatalogSignature.installedExtensions,
      providerManagedExtensionParity:
        extensionMismatches.length === 0 ? "PROVEN" : "UNKNOWN",
      providerManagedExtensionMismatches: extensionMismatches,
      productionParityClaim: false,
      liveMutationPerformed: false,
    };
  } catch (error) {
    replayError = error;
  } finally {
    let stopError = null;
    if (started) {
      try {
        runCommand(
          pgCtl,
          ["-D", dataDirectory, "-m", "fast", "-w", "stop"],
          { stdio: "ignore" },
        );
      } catch (error) {
        stopError = error;
      }
    }
    const portReleased = await waitForPortRelease(port);
    let pathRemoved = false;
    try {
      if (existsSync(ownedRoot)) {
        rmSync(ownedRoot, { recursive: true, force: true });
      }
      pathRemoved = !existsSync(ownedRoot);
    } catch {
      pathRemoved = false;
    }
    cleanupReceipt = {
      ownedPort: port,
      portReleased,
      ownedPath: ownedRoot,
      pathRemoved,
      stopError: stopError?.message ?? null,
    };
    if (
      (!portReleased || !pathRemoved || stopError) &&
      replayError === null
    ) {
      replayError = new Error(
        "Owned replay cleanup was incomplete: " + JSON.stringify(cleanupReceipt),
      );
    }
  }

  if (replayError) {
    return {
      ok: false,
      packetId: manifest.packetId,
      appliedPrefix,
      blocker: replayError.message,
      cleanup: cleanupReceipt,
      productionParityClaim: false,
      liveMutationPerformed: false,
    };
  }

  return { ...replayReceipt, cleanup: cleanupReceipt };
}

async function main() {
  if (process.argv.includes("--legacy-repair-plan")) {
    const manifest = loadManifest(REPO_ROOT);
    const valueIndex = process.argv.indexOf("--applied-versions");
    const appliedVersions =
      valueIndex === -1
        ? undefined
        : (process.argv[valueIndex + 1] ?? "")
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean);
    const plan = buildLegacyRepairPlan(
      manifest.legacyRepositoryHistory,
      appliedVersions,
    );
    process.stdout.write(JSON.stringify(plan, null, 2) + "\n");
    if (plan.historyState === "BLOCKED") {
      process.exitCode = 1;
    }
    return;
  }

  if (process.argv.includes("--replay")) {
    const receipt = await runReplay();
    process.stdout.write(JSON.stringify(receipt, null, 2) + "\n");
    if (!receipt.ok) {
      process.exitCode = 1;
    }
    return;
  }

  process.stdout.write(JSON.stringify(verifySourceRecovery(), null, 2) + "\n");
}

if (resolve(process.argv[1] ?? "") === resolve(SCRIPT_PATH)) {
  main().catch((error) => {
    process.stderr.write(error.stack + "\n");
    process.exitCode = 1;
  });
}
