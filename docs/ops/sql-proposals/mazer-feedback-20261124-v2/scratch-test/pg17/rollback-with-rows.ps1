# PG17: rollback.sql must keep the table (and its rows) and drop only the function when rows exist.
# Run from the repo root after scratch-pg.mjs init + build (see README). Uses a throwaway clone database.
param([string]$Dir = 'C:\ATLAS\tmp\scratch-pg-feedback-v2')
$ErrorActionPreference = 'Continue'
$t = 'docs\ops\sql-proposals\mazer-feedback-20261124-v2'
$sp = 'node scripts\db-scratch\scratch-pg.mjs'
function Psql($db, $role, $argv) { & node scripts\db-scratch\scratch-pg.mjs psql --dir $Dir --db $db --as $role -- @argv 2>&1 }
Psql 'postgres' 'scratch_super' @('-c', 'drop database if exists fb_rows')
Psql 'postgres' 'scratch_super' @('-c', 'create database fb_rows template stub')
Psql 'fb_rows' 'postgres' @('-f', (Resolve-Path "$t\scratch-test\pg17\seed.sql"))
Psql 'fb_rows' 'postgres' @('-v', 'ON_ERROR_STOP=1', '-f', (Resolve-Path "$t\apply.sql"))
Psql 'fb_rows' 'postgres' @('-c', "select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a2',false), mazer.mazer_submit_feedback_v1(5,'keep me')")
'--- rollback with one row present'
Psql 'fb_rows' 'postgres' @('-v', 'ON_ERROR_STOP=1', '-f', (Resolve-Path "$t\rollback.sql"))
'--- after rollback (expect table_rows=1, function_exists=f)'
Psql 'fb_rows' 'postgres' @('-At', '-c', "select 'table_rows=' || (select count(*) from mazer.mazer_feedback), 'function_exists=' || (to_regprocedure('mazer.mazer_submit_feedback_v1(integer,text,text,integer,text,text)') is not null)")
Psql 'postgres' 'scratch_super' @('-c', 'drop database fb_rows')
