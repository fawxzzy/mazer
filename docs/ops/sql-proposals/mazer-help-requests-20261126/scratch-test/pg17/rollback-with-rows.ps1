# PG17: rollback.sql must keep the table (and its rows) and drop only the function when rows exist; then the
# owner read file must parse and return the row, and the close template must close it.
# Run from the repo root after scratch-pg.mjs init + build (see README, Repeating the PG17 run). Uses a throwaway clone database.
param([string]$Dir = 'C:\ATLAS\tmp\scratch-pg-help-v1')
$ErrorActionPreference = 'Continue'
$t = 'docs\ops\sql-proposals\mazer-help-requests-20261126'
function Psql($db, $role, $argv) { & node scripts\db-scratch\scratch-pg.mjs psql --dir $Dir --db $db --as $role -- @argv 2>&1 | ForEach-Object { "$_" } }
Psql 'postgres' 'scratch_super' @('-c', 'drop database if exists help_rows')
Psql 'postgres' 'scratch_super' @('-c', 'create database help_rows template stub')
Psql 'help_rows' 'postgres' @('-f', (Resolve-Path "$t\scratch-test\pg17\seed.sql"))
Psql 'help_rows' 'postgres' @('-v', 'ON_ERROR_STOP=1', '-f', (Resolve-Path "$t\apply.sql"))
Psql 'help_rows' 'postgres' @('-c', "select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b1',false), mazer.mazer_submit_help_request_v1('keep@x.io','keep me')")
'--- owner read file (expect 1 open row, signed_in=t, username=player_b1, open_total=1)'
Psql 'help_rows' 'postgres' @('-At', '-F', ' | ', '-v', 'ON_ERROR_STOP=1', '-f', (Resolve-Path "$t\ops\read-open-help-requests.sql"))
'--- rollback with one row present (expect NOTICE MAZER_HELP_ROLLBACK_KEPT_TABLE rows=1)'
Psql 'help_rows' 'postgres' @('-v', 'ON_ERROR_STOP=1', '-f', (Resolve-Path "$t\rollback.sql"))
'--- after rollback (expect table_rows=1, function_exists=f)'
Psql 'help_rows' 'postgres' @('-At', '-c', "select 'table_rows=' || (select count(*) from mazer.mazer_help_requests), 'function_exists=' || (to_regprocedure('mazer.mazer_submit_help_request_v1(text,text,text,integer,text)') is not null)")
'--- close template with the placeholder id (expect 0 rows), then with the real id (expect 1 row closed)'
Psql 'help_rows' 'postgres' @('-At', '-v', 'ON_ERROR_STOP=1', '-f', (Resolve-Path "$t\ops\close-help-request.sql"))
$id = (Psql 'help_rows' 'postgres' @('-At', '-c', 'select id from mazer.mazer_help_requests limit 1') | Select-Object -First 1).Trim()
$edited = Join-Path $Dir 'close-edited.sql'
(Get-Content -Raw (Resolve-Path "$t\ops\close-help-request.sql")).Replace('00000000-0000-0000-0000-000000000000', $id) | Set-Content -NoNewline -Encoding ascii $edited
Psql 'help_rows' 'postgres' @('-At', '-v', 'ON_ERROR_STOP=1', '-f', $edited) | ForEach-Object { $_ -replace '[0-9a-f-]{36}', '<id>' -replace '\d{4}-\d\d-\d\d \S+', '<ts>' }
'--- empty the kept table, rollback again (expect table dropped)'
Psql 'help_rows' 'postgres' @('-c', 'delete from mazer.mazer_help_requests')
Psql 'help_rows' 'postgres' @('-v', 'ON_ERROR_STOP=1', '-f', (Resolve-Path "$t\rollback.sql"))
Psql 'help_rows' 'postgres' @('-At', '-c', "select 'table_exists=' || (to_regclass('mazer.mazer_help_requests') is not null)")
Psql 'postgres' 'scratch_super' @('-c', 'drop database help_rows')
