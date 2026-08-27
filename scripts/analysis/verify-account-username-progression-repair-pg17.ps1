$ErrorActionPreference = 'Stop'

$pg = 'C:\Program Files\PostgreSQL\17\bin'
foreach ($tool in @('initdb.exe', 'postgres.exe', 'pg_isready.exe', 'pg_ctl.exe', 'psql.exe')) {
  if (-not (Test-Path -LiteralPath (Join-Path $pg $tool) -PathType Leaf)) {
    throw "PG17_TOOL_MISSING:$tool"
  }
}

$fixturePrefix = 'mazer-account-repair-pg17-'
$fixtureRoot = Join-Path ([IO.Path]::GetTempPath()) ($fixturePrefix + [guid]::NewGuid().ToString('N'))
$dataPath = Join-Path $fixtureRoot 'data'
$setupPath = Join-Path $fixtureRoot 'setup.sql'
$verifyPath = Join-Path $fixtureRoot 'verify.sql'
$r020Path = Join-Path $fixtureRoot 'r020.sql'
$rollbackPath = Join-Path $fixtureRoot 'rollback.sql'
$migrationPath = Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..\..')) 'supabase\migrations\20260827190000_mazer_account_username_and_progression_repair.sql'
$classifierMigrationPath = Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..\..')) 'supabase\migrations\20260827200000_mazer_historical_play_evidence_contract.sql'
$portLease = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
try {
  $portLease.Start()
  $port = ([Net.IPEndPoint] $portLease.LocalEndpoint).Port
}
finally {
  $portLease.Stop()
}
$server = $null

$setupSql = @'
create schema auth;
create schema mazer;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;

create function auth.uid() returns uuid
language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

create table mazer.mazer_profiles (
  user_id uuid primary key,
  username text not null,
  username_origin text not null,
  updated_at timestamptz not null default now()
);
create unique index mazer_profiles_username_unique_idx on mazer.mazer_profiles(lower(username));

create function mazer.mazer_enforce_username_origin() returns trigger
language plpgsql
as $$
begin
  if new.username is distinct from old.username then
    new.username_origin := 'claimed';
  end if;
  return new;
end;
$$;
create trigger mazer_enforce_username_origin_before_update
before update of username, username_origin on mazer.mazer_profiles
for each row execute function mazer.mazer_enforce_username_origin();

create table mazer.mazer_progression_states (
  user_id uuid primary key,
  state jsonb not null default '{}'::jsonb,
  player_level bigint not null,
  player_rank text not null,
  player_target_complexity integer not null,
  player_completed_cycles bigint not null,
  revision bigint not null,
  last_completed_cycle_at timestamptz,
  level_reached_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint mazer_progression_states_completion_ordinal_check check (player_level - 1 = player_completed_cycles)
);

create table mazer.mazer_cycle_receipts (
  id uuid primary key,
  user_id uuid not null,
  surface text not null,
  client_run_id uuid,
  ruleset_id text,
  recipe_version integer,
  recipe_hash text,
  completed_at timestamptz not null default now()
);

grant usage on schema mazer to authenticated;

insert into mazer.mazer_profiles(user_id, username, username_origin) values
  ('00000000-0000-0000-0000-000000000001', 'Mazer-100001', 'generated'),
  ('00000000-0000-0000-0000-000000000002', 'Mazer-100002', 'generated'),
  ('00000000-0000-0000-0000-000000000003', 'Mazer-100003', 'generated'),
  ('00000000-0000-0000-0000-000000000004', 'Mazer-100004', 'generated');

insert into mazer.mazer_progression_states(
  user_id, state, player_level, player_rank, player_target_complexity,
  player_completed_cycles, revision, last_completed_cycle_at, level_reached_at, updated_at
) values
  (
    '00000000-0000-0000-0000-000000000001',
    '{"root":"keep","tracks":{"player":{"level":"110","completedCycles":"109","struggleCycles":9007199254740991,"cleanCycles":0,"lastReceiptId":null,"lastCompletedAt":null},"ai-runner":{"level":"39","completedCycles":"108","keep":true}}}',
    110, 'E', 26, 109, 1050, '2026-08-23T00:00:00Z', '2026-08-23T00:00:00Z', '2026-08-27T00:00:00Z'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    '{"tracks":{"player":{"level":"5","completedCycles":"4","targetComplexity":24,"rank":"D","struggleCycles":0},"ai-runner":{"keep":true}}}',
    5, 'D', 24, 4, 2, null, '2026-08-01T00:00:00Z', '2026-08-01T00:00:00Z'
  ),
  (
    '00000000-0000-0000-0000-000000000003',
    '{"tracks":{"player":{"level":"4","completedCycles":"3","targetComplexity":20,"rank":"E","struggleCycles":9007199254740991},"ai-runner":{"keep":true}}}',
    4, 'E', 20, 3, 7, '2026-08-27T00:00:00Z', '2026-08-27T00:00:00Z', '2026-08-27T00:00:00Z'
  ),
  (
    '00000000-0000-0000-0000-000000000004',
    '{"tracks":{"player":{"level":"101","completedCycles":"100","targetComplexity":400,"rank":"S","struggleCycles":9007199254740991},"ai-runner":{"keep":true}}}',
    101, 'S', 400, 100, 11, '2026-08-27T00:00:00Z', '2026-08-27T00:00:00Z', '2026-08-27T00:00:00Z'
  );

insert into mazer.mazer_cycle_receipts(
  id, user_id, surface, client_run_id, ruleset_id, recipe_version, recipe_hash
) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'play', null, null, null, null),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000003', 'play', '20000000-0000-4000-8000-000000000003', 'legacy-v1', null, null),
  ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000004', 'play', '20000000-0000-4000-8000-000000000004', 'endless-v1', 1, null);

create table fixture_progression_preimage as table mazer.mazer_progression_states;
create table fixture_profile_preimage as table mazer.mazer_profiles;
'@

$verifySql = @'
do $verify$
begin
  if not exists (
    select 1 from mazer.mazer_progression_states
    where user_id = '00000000-0000-0000-0000-000000000001'
      and player_level = 1
      and player_completed_cycles = 0
      and player_target_complexity = 8
      and state #>> '{tracks,player,level}' = '1'
      and state #>> '{tracks,player,completedCycles}' = '0'
      and state #>> '{tracks,player,struggleCycles}' = '9007199254740991'
      and state #>> '{tracks,ai-runner,keep}' = 'true'
      and state ->> 'root' = 'keep'
  ) then
    raise exception 'IMMUTABLE_R019_PRE_IDEMPOTENCY_CLASSIFICATION_NOT_REPRODUCED';
  end if;

  if not exists (
    select 1 from mazer.mazer_progression_states
    where user_id = '00000000-0000-0000-0000-000000000002'
      and player_level = 1
      and player_completed_cycles = 0
      and player_target_complexity = 8
      and player_rank = 'E'
      and state #>> '{tracks,player,level}' = '1'
      and state #>> '{tracks,player,completedCycles}' = '0'
      and state #>> '{tracks,player,struggleCycles}' = '9007199254740991'
      and state #>> '{tracks,ai-runner,keep}' = 'true'
  ) then
    raise exception 'ZERO_RECEIPT_BASELINE_REPAIR_FAILED';
  end if;

  if not exists (
    select 1 from mazer.mazer_progression_states
    where user_id = '00000000-0000-0000-0000-000000000003'
      and player_level = 4
      and player_completed_cycles = 3
      and player_target_complexity = 20
      and revision = 7
  ) then
    raise exception 'LEGACY_V1_ACCEPTED_RECEIPT_ACCOUNT_WAS_MUTATED';
  end if;

  if not exists (
    select 1 from mazer.mazer_progression_states
    where user_id = '00000000-0000-0000-0000-000000000004'
      and player_level = 101
      and player_completed_cycles = 100
      and player_target_complexity = 400
      and revision = 11
  ) then
    raise exception 'ENDLESS_V1_ACCEPTED_RECEIPT_ACCOUNT_WAS_MUTATED';
  end if;

  if (select count(*) from mazer.mazer_cycle_receipts) <> 3 then
    raise exception 'RECEIPT_CONSERVATION_FAILED';
  end if;
  if not mazer.mazer_has_historical_play_receipt('00000000-0000-0000-0000-000000000001')
    or mazer.mazer_has_historical_play_receipt('00000000-0000-0000-0000-000000000002')
  then
    raise exception 'HISTORICAL_PLAY_EVIDENCE_CLASSIFIER_FAILED';
  end if;
end;
$verify$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
set role authenticated;
do $adversarial$
begin
  begin
    perform mazer.mazer_set_username(
      '00000000-0000-0000-0000-000000000002',
      'Wrong.Owner'
    );
    raise exception 'USERNAME_OWNER_MISMATCH_WAS_ACCEPTED';
  exception
    when invalid_authorization_specification then null;
  end;

  begin
    perform mazer.mazer_set_username(
      '00000000-0000-0000-0000-000000000001',
      'Mazer-100002'
    );
    raise exception 'USERNAME_COLLISION_WAS_ACCEPTED';
  exception
    when unique_violation then null;
  end;

  begin
    perform mazer.mazer_set_username(
      '00000000-0000-0000-0000-000000000001',
      'contains space'
    );
    raise exception 'INVALID_USERNAME_WAS_ACCEPTED';
  exception
    when invalid_parameter_value then null;
  end;
end;
$adversarial$;

select mazer.mazer_set_username(
  '00000000-0000-0000-0000-000000000001',
  'Renamed.Player'
);
reset role;

do $verify$
begin
  if not exists (
    select 1 from mazer.mazer_profiles
    where user_id = '00000000-0000-0000-0000-000000000001'
      and username = 'Renamed.Player'
      and username_origin = 'claimed'
  ) then
    raise exception 'USERNAME_RENAME_FAILED';
  end if;
end;
$verify$;
'@

$r020Sql = @'
-- Reproduce the R019 failure shape, restore the exact retained values with the
-- R020 algorithm, and then prove an exact targeted rollback. This is entirely
-- inside the disposable local PostgreSQL 17 cluster.
create table fixture_r020_restore_input as
select *
from fixture_progression_preimage
where user_id in (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000004'
);

update mazer.mazer_progression_states s
set
  player_level = 1,
  player_rank = 'E',
  player_target_complexity = 8,
  player_completed_cycles = 0,
  revision = s.revision + 1,
  state = jsonb_set(
    jsonb_set(
      s.state,
      '{tracks,player}',
      coalesce(s.state #> '{tracks,player}', '{}'::jsonb)
        || jsonb_build_object(
          'level', '1',
          'completedCycles', '0',
          'rank', 'E',
          'targetComplexity', 8,
          'struggleCycles', 9007199254740991
        ),
      true
    ),
    '{playerProgressionBaselineVersion}',
    '5'::jsonb,
    true
  ),
  last_completed_cycle_at = null,
  level_reached_at = null,
  updated_at = clock_timestamp()
from fixture_r020_restore_input i
where s.user_id = i.user_id
  and not (
    s.player_level = 1
    and s.player_rank = 'E'
    and s.player_target_complexity = 8
    and s.player_completed_cycles = 0
    and s.revision = i.revision + 1
  );

create table fixture_r020_apply_preimage as
select s.*
from mazer.mazer_progression_states s
join fixture_r020_restore_input i using (user_id);

create temp table r020_counts_before as
select
  (select count(*) from mazer.mazer_progression_states) as progression_rows,
  (select count(*) from mazer.mazer_profiles) as profile_rows,
  (select count(*) from mazer.mazer_cycle_receipts) as receipt_rows;

with restored as (
  update mazer.mazer_progression_states s
  set
    player_level = i.player_level,
    player_rank = i.player_rank,
    player_target_complexity = i.player_target_complexity,
    player_completed_cycles = i.player_completed_cycles,
    revision = s.revision + 1,
    state = jsonb_set(
      jsonb_set(
        case when jsonb_typeof(s.state) = 'object' then s.state else '{}'::jsonb end,
        '{tracks,player}',
        coalesce(s.state #> '{tracks,player}', '{}'::jsonb)
          || coalesce(i.state #> '{tracks,player}', '{}'::jsonb)
          || jsonb_build_object(
            'level', i.player_level::text,
            'completedCycles', i.player_completed_cycles::text,
            'rank', i.player_rank,
            'targetComplexity', i.player_target_complexity,
            'peakComplexity', greatest(
              coalesce((s.state #>> '{tracks,player,peakComplexity}')::integer, 8),
              coalesce((i.state #>> '{tracks,player,peakComplexity}')::integer, 8),
              i.player_target_complexity
            ),
            'colorTier', coalesce(
              (i.state #>> '{tracks,player,colorTier}')::integer,
              floor(((i.player_target_complexity - 8) / 4.0) / 5.0)::integer
            ),
            'lastCompletedAt', case
              when i.last_completed_cycle_at is null then null
              else to_jsonb(i.last_completed_cycle_at::text)
            end,
            'struggleCycles', coalesce(
              (i.state #>> '{tracks,player,struggleCycles}')::bigint,
              (s.state #>> '{tracks,player,struggleCycles}')::bigint,
              9007199254740991
            )
          ),
        true
      ),
      '{playerProgressionBaselineVersion}',
      '5'::jsonb,
      true
    ),
    last_completed_cycle_at = i.last_completed_cycle_at,
    level_reached_at = i.level_reached_at,
    updated_at = clock_timestamp()
  from fixture_r020_restore_input i
  where s.user_id = i.user_id
  returning s.user_id
)
select count(*) as restored_rows into temporary table r020_result from restored;

do $r020$
begin
  if (select restored_rows from r020_result) <> 3
    or exists (
      select 1
      from mazer.mazer_progression_states s
      join fixture_r020_restore_input i using (user_id)
      where s.player_level <> i.player_level
        or s.player_rank <> i.player_rank
        or s.player_target_complexity <> i.player_target_complexity
        or s.player_completed_cycles <> i.player_completed_cycles
        or s.revision <> i.revision + 2
        or s.state #>> '{tracks,player,level}' <> i.player_level::text
        or s.state #>> '{tracks,player,completedCycles}' <> i.player_completed_cycles::text
        or s.state #>> '{tracks,player,rank}' <> i.player_rank
        or s.state #>> '{tracks,player,targetComplexity}' <> i.player_target_complexity::text
        or s.state #>> '{tracks,player,struggleCycles}' <> '9007199254740991'
        or s.state #>> '{tracks,ai-runner,keep}' <> 'true'
    )
    or (select progression_rows from r020_counts_before) <> (select count(*) from mazer.mazer_progression_states)
    or (select profile_rows from r020_counts_before) <> (select count(*) from mazer.mazer_profiles)
    or (select receipt_rows from r020_counts_before) <> (select count(*) from mazer.mazer_cycle_receipts)
  then
    raise exception 'R020_LOCAL_POSTIMAGE_FAILED';
  end if;
end;
$r020$;

-- Exact targeted rollback from the action-time preimage. This intentionally
-- restores the reset state, proving that the bounded live repair is reversible.
update mazer.mazer_progression_states s
set
  state = p.state,
  player_level = p.player_level,
  player_rank = p.player_rank,
  player_target_complexity = p.player_target_complexity,
  player_completed_cycles = p.player_completed_cycles,
  revision = p.revision,
  last_completed_cycle_at = p.last_completed_cycle_at,
  level_reached_at = p.level_reached_at,
  updated_at = p.updated_at
from fixture_r020_apply_preimage p
where s.user_id = p.user_id;

do $r020$
begin
  if exists (
    (select s.* from mazer.mazer_progression_states s join fixture_r020_apply_preimage p using (user_id)
     except select * from fixture_r020_apply_preimage)
    union all
    (select * from fixture_r020_apply_preimage
     except select s.* from mazer.mazer_progression_states s join fixture_r020_apply_preimage p using (user_id))
  )
    or (select progression_rows from r020_counts_before) <> (select count(*) from mazer.mazer_progression_states)
    or (select profile_rows from r020_counts_before) <> (select count(*) from mazer.mazer_profiles)
    or (select receipt_rows from r020_counts_before) <> (select count(*) from mazer.mazer_cycle_receipts)
  then
    raise exception 'R020_LOCAL_EXACT_ROLLBACK_FAILED';
  end if;
end;
$r020$;

select 'MAZER_R020_PROGRESSION_RESTORE_APPLY_ROLLBACK_PASS';
'@

$rollbackSql = @'
truncate table mazer.mazer_progression_states;
insert into mazer.mazer_progression_states select * from fixture_progression_preimage;
truncate table mazer.mazer_profiles;
insert into mazer.mazer_profiles select * from fixture_profile_preimage;
drop function mazer.mazer_set_username(uuid, text);
drop function mazer.mazer_has_historical_play_receipt(uuid);

do $rollback$
begin
  if exists (
    (select * from mazer.mazer_progression_states except select * from fixture_progression_preimage)
    union all
    (select * from fixture_progression_preimage except select * from mazer.mazer_progression_states)
  ) or exists (
    (select * from mazer.mazer_profiles except select * from fixture_profile_preimage)
    union all
    (select * from fixture_profile_preimage except select * from mazer.mazer_profiles)
  ) then
    raise exception 'EXACT_ROLLBACK_FAILED';
  end if;
  if to_regprocedure('mazer.mazer_set_username(uuid,text)') is not null then
    raise exception 'FUNCTION_ROLLBACK_FAILED';
  end if;
  if to_regprocedure('mazer.mazer_has_historical_play_receipt(uuid)') is not null then
    raise exception 'CLASSIFIER_FUNCTION_ROLLBACK_FAILED';
  end if;
end;
$rollback$;
'@

function Invoke-PsqlFile([string] $path) {
  & (Join-Path $pg 'psql.exe') -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $port -U postgres -d postgres -f $path
  if ($LASTEXITCODE -ne 0) { throw "PSQL_FAILED:$path" }
}

try {
  New-Item -ItemType Directory -Path $fixtureRoot | Out-Null
  Set-Content -LiteralPath $setupPath -Value $setupSql -Encoding utf8
  Set-Content -LiteralPath $verifyPath -Value $verifySql -Encoding utf8
  Set-Content -LiteralPath $r020Path -Value $r020Sql -Encoding utf8
  Set-Content -LiteralPath $rollbackPath -Value $rollbackSql -Encoding utf8

  & (Join-Path $pg 'initdb.exe') -D $dataPath -U postgres -A trust --no-locale --encoding=UTF8 | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'INITDB_FAILED' }

  $server = Start-Process -FilePath (Join-Path $pg 'postgres.exe') -ArgumentList @('-D', $dataPath, '-p', $port) -PassThru -WindowStyle Hidden
  for ($attempt = 0; $attempt -lt 100; $attempt += 1) {
    & (Join-Path $pg 'pg_isready.exe') -h 127.0.0.1 -p $port -U postgres | Out-Null
    if ($LASTEXITCODE -eq 0) { break }
    Start-Sleep -Milliseconds 100
  }
  if ($LASTEXITCODE -ne 0) { throw 'PG17_NOT_READY' }

  Invoke-PsqlFile $setupPath
  $dataDirectory = & (Join-Path $pg 'psql.exe') -X -At -h 127.0.0.1 -p $port -U postgres -d postgres -c 'show data_directory'
  if ((Resolve-Path $dataDirectory).Path -ne (Resolve-Path $dataPath).Path) { throw 'PG_CLUSTER_IDENTITY_MISMATCH' }
  Invoke-PsqlFile $migrationPath
  Invoke-PsqlFile $classifierMigrationPath
  Invoke-PsqlFile $verifyPath
  Invoke-PsqlFile $r020Path
  Invoke-PsqlFile $rollbackPath
  Write-Output 'MAZER_ACCOUNT_USERNAME_PROGRESSION_REPAIR_PG17_PASS'
}
finally {
  $ErrorActionPreference = 'Continue'
  if ($server -and -not $server.HasExited) {
    & (Join-Path $pg 'pg_ctl.exe') -D $dataPath stop -m immediate | Out-Null
    $server.WaitForExit(10000) | Out-Null
  }
  if (Test-Path -LiteralPath $fixtureRoot) {
    Remove-Item -LiteralPath $fixtureRoot -Recurse -Force
  }
}
