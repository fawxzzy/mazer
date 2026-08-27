$ErrorActionPreference = 'Stop'

$pg = 'C:\Program Files\PostgreSQL\17\bin'
foreach ($tool in @('initdb.exe', 'postgres.exe', 'pg_isready.exe', 'pg_ctl.exe', 'psql.exe')) {
  if (-not (Test-Path -LiteralPath (Join-Path $pg $tool) -PathType Leaf)) {
    throw "PG17_TOOL_MISSING:$tool"
  }
}

$fixturePrefix = 'mazer-progression-ordinal-closure-pg17-'
$root = Join-Path ([IO.Path]::GetTempPath()) ($fixturePrefix + [guid]::NewGuid().ToString('N'))
$data = Join-Path $root 'data'
$setup = Join-Path $root 'setup.sql'
$verify = Join-Path $root 'verify.sql'
$rollback = Join-Path $root 'rollback.sql'
$migration = Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..\..')) 'supabase\migrations\20260827170000_mazer_progression_ordinal_closure.sql'
$portLease = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
try {
  $portLease.Start()
  $port = ([Net.IPEndPoint] $portLease.LocalEndpoint).Port
}
finally {
  $portLease.Stop()
}
$started = $false
$server = $null

$setupSql = @'
create schema mazer;

create table mazer.mazer_profiles (
  user_id uuid primary key
);

create table mazer.mazer_progression_states (
  user_id uuid primary key,
  schema_version integer not null default 1,
  state jsonb not null default '{}'::jsonb,
  player_level bigint not null,
  player_rank text not null default 'E',
  player_target_complexity integer not null default 8,
  player_completed_cycles bigint not null,
  revision bigint not null default 0,
  last_completed_cycle_at timestamptz,
  level_reached_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table mazer.mazer_cycle_receipts (
  id uuid primary key,
  user_id uuid not null,
  surface text not null,
  completed_at timestamptz not null
);

insert into mazer.mazer_profiles(user_id) values
  ('00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000002'),
  ('00000000-0000-0000-0000-000000000003'),
  ('00000000-0000-0000-0000-000000000004');

insert into mazer.mazer_progression_states(
  user_id, state, player_level, player_completed_cycles, revision,
  last_completed_cycle_at, level_reached_at, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000001', '{"root":"keep","tracks":{"player":{"level":"5","completedCycles":"109","keep":"yes"},"ai":{"keep":true}}}', 5, 109, 7, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', '2025-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('00000000-0000-0000-0000-000000000002', '{"tracks":{"player":{"level":"60","completedCycles":"75"}}}', 60, 75, 8, null, null, '2025-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('00000000-0000-0000-0000-000000000003', '{"tracks":{"player":{"level":"4","completedCycles":"2"}}}', 4, 2, 9, null, '2026-01-03T00:00:00Z', '2025-01-01T00:00:00Z', '2026-01-03T00:00:00Z'),
  ('00000000-0000-0000-0000-000000000004', '{"tracks":{"player":{"level":"3","completedCycles":"2"}}}', 3, 2, 10, null, '2026-01-04T00:00:00Z', '2025-01-01T00:00:00Z', '2026-01-04T00:00:00Z');

insert into mazer.mazer_cycle_receipts(id, user_id, surface, completed_at) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'play', '2026-01-05T00:00:00Z'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'menu-demo', '2026-01-06T00:00:00Z');

create table fixture_preimage as table mazer.mazer_progression_states;
'@

$verifySql = @'
do $verify$
begin
  if exists (
    values
      ('00000000-0000-0000-0000-000000000001'::uuid, 110::bigint, 109::bigint, 8::bigint, '2026-01-05T00:00:00Z'::timestamptz),
      ('00000000-0000-0000-0000-000000000002'::uuid, 76::bigint, 75::bigint, 9::bigint, '2026-01-01T00:00:00Z'::timestamptz),
      ('00000000-0000-0000-0000-000000000003'::uuid, 4::bigint, 3::bigint, 10::bigint, '2026-01-03T00:00:00Z'::timestamptz),
      ('00000000-0000-0000-0000-000000000004'::uuid, 3::bigint, 2::bigint, 10::bigint, '2026-01-04T00:00:00Z'::timestamptz)
    except
    select user_id, player_level, player_completed_cycles, revision, level_reached_at
    from mazer.mazer_progression_states
  ) or exists (
    select user_id, player_level, player_completed_cycles, revision, level_reached_at
    from mazer.mazer_progression_states
    except
    values
      ('00000000-0000-0000-0000-000000000001'::uuid, 110::bigint, 109::bigint, 8::bigint, '2026-01-05T00:00:00Z'::timestamptz),
      ('00000000-0000-0000-0000-000000000002'::uuid, 76::bigint, 75::bigint, 9::bigint, '2026-01-01T00:00:00Z'::timestamptz),
      ('00000000-0000-0000-0000-000000000003'::uuid, 4::bigint, 3::bigint, 10::bigint, '2026-01-03T00:00:00Z'::timestamptz),
      ('00000000-0000-0000-0000-000000000004'::uuid, 3::bigint, 2::bigint, 10::bigint, '2026-01-04T00:00:00Z'::timestamptz)
  ) then
    raise exception 'CLOSURE_VALUE_MISMATCH';
  end if;

  if exists (
    select 1 from mazer.mazer_progression_states
    where state #>> '{tracks,player,level}' is distinct from player_level::text
      or state #>> '{tracks,player,completedCycles}' is distinct from player_completed_cycles::text
  ) then
    raise exception 'JSON_PROJECTION_MISMATCH';
  end if;

  if (select state #>> '{root}' from mazer.mazer_progression_states where user_id = '00000000-0000-0000-0000-000000000001') <> 'keep'
    or (select state #>> '{tracks,player,keep}' from mazer.mazer_progression_states where user_id = '00000000-0000-0000-0000-000000000001') <> 'yes'
    or (select state #>> '{tracks,ai,keep}' from mazer.mazer_progression_states where user_id = '00000000-0000-0000-0000-000000000001') <> 'true'
  then
    raise exception 'JSON_SIBLING_DATA_LOSS';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'mazer.mazer_progression_states'::regclass
      and conname = 'mazer_progression_states_completion_ordinal_check'
      and convalidated
  ) then
    raise exception 'VALIDATED_CONSTRAINT_MISSING';
  end if;
end;
$verify$;
'@

$rollbackSql = @'
alter table mazer.mazer_progression_states
  drop constraint mazer_progression_states_completion_ordinal_check;

update mazer.mazer_progression_states s
set
  schema_version = p.schema_version,
  state = p.state,
  player_level = p.player_level,
  player_rank = p.player_rank,
  player_target_complexity = p.player_target_complexity,
  player_completed_cycles = p.player_completed_cycles,
  revision = p.revision,
  last_completed_cycle_at = p.last_completed_cycle_at,
  level_reached_at = p.level_reached_at,
  created_at = p.created_at,
  updated_at = p.updated_at
from fixture_preimage p
where s.user_id = p.user_id;

do $rollback$
begin
  if exists (
    select * from mazer.mazer_progression_states
    except
    select * from fixture_preimage
  ) or exists (
    select * from fixture_preimage
    except
    select * from mazer.mazer_progression_states
  ) then
    raise exception 'EXACT_ROLLBACK_MISMATCH';
  end if;
end;
$rollback$;
'@

function Invoke-Psql([string[]] $arguments, [string] $label) {
  # Windows PowerShell 5.1 wraps native stderr (including successful psql
  # NOTICE output) as non-terminating ErrorRecord objects. Capture it under a
  # local Continue policy and decide solely from the native exit code.
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $output = @(& (Join-Path $pg 'psql.exe') @arguments 2>&1)
    $exitCode = $LASTEXITCODE
  }
  finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }
  if ($exitCode -ne 0) {
    throw "PSQL_FAILED:${label}:$($output -join ' ')"
  }
  return @($output | ForEach-Object { [string] $_ })
}

function Invoke-PsqlFile([string] $path) {
  $null = Invoke-Psql @('-X', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', [string] $port, '-U', 'postgres', '-d', 'postgres', '-f', $path) ([IO.Path]::GetFileName($path))
}

try {
  New-Item -ItemType Directory -Path $root, $data | Out-Null
  [IO.File]::WriteAllText($setup, $setupSql)
  [IO.File]::WriteAllText($verify, $verifySql)
  [IO.File]::WriteAllText($rollback, $rollbackSql)

  & (Join-Path $pg 'initdb.exe') -A trust -U postgres -D $data --encoding=UTF8 --no-locale | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'INITDB_FAILED' }

  $server = Start-Process -FilePath (Join-Path $pg 'postgres.exe') -ArgumentList "-D `"$data`" -h 127.0.0.1 -p $port" -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $root 'postgres.log') -RedirectStandardError (Join-Path $root 'postgres-error.log')
  for ($attempt = 0; $attempt -lt 100; $attempt += 1) {
    if ($server.HasExited) { break }
    & (Join-Path $pg 'pg_isready.exe') -h 127.0.0.1 -p $port -d postgres | Out-Null
    if ($LASTEXITCODE -eq 0) { $started = $true; break }
    Start-Sleep -Milliseconds 100
  }
  if (-not $started) { throw 'PG_START_FAILED' }

  # An ephemeral port minimizes collisions; this identity readback makes a
  # residual bind race fail closed before any fixture SQL can mutate a server.
  $reportedData = (Invoke-Psql @('-X', '-A', '-t', '-h', '127.0.0.1', '-p', [string] $port, '-U', 'postgres', '-d', 'postgres', '-c', 'show data_directory') 'DATA_DIRECTORY_READBACK' | Select-Object -Last 1).Trim()
  if ([IO.Path]::GetFullPath($reportedData) -ne [IO.Path]::GetFullPath($data)) {
    throw 'PG_CLUSTER_IDENTITY_MISMATCH'
  }

  Invoke-PsqlFile $setup
  Invoke-PsqlFile $migration
  Invoke-PsqlFile $verify
  Invoke-PsqlFile $rollback

  [ordered]@{
    result = 'MAZER_PROGRESSION_ORDINAL_CLOSURE_PG17_PASS'
    postgres_major = 17
    monotonic_closure = $true
    json_projection = $true
    sibling_json_preserved = $true
    validated_constraint = $true
    exact_rollback = $true
    provider_calls = 0
    live_writes = 0
  } | ConvertTo-Json -Compress
}
finally {
  if ($server -and -not $server.HasExited) {
    & (Join-Path $pg 'pg_ctl.exe') -D $data -m immediate -w stop | Out-Null
    if ($LASTEXITCODE -ne 0 -and -not $server.HasExited) {
      Stop-Process -Id $server.Id
    }
  }
  if (Test-Path -LiteralPath $root) {
    $resolvedRoot = [IO.Path]::GetFullPath($root)
    $resolvedTemp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
    if (-not $resolvedRoot.StartsWith($resolvedTemp, [StringComparison]::OrdinalIgnoreCase) -or
        -not ([IO.Path]::GetFileName($resolvedRoot)).StartsWith($fixturePrefix, [StringComparison]::Ordinal)) {
      throw 'CLEANUP_SCOPE_REFUSED'
    }
    Remove-Item -LiteralPath $resolvedRoot -Recurse -Force
  }
}
