-- Post-rollback check: the live preimage is back (run as postgres).
\pset format unaligned
\pset tuples_only on
create function pg_temp.ok(cond boolean, name text, detail text default '') returns text language plpgsql as
$$ begin
  if cond is not true then raise exception 'CHECK FAILED: % [%]', name, detail; end if;
  return 'PASS  ' || name || case when detail = '' then '' else '  [' || detail || ']' end;
end; $$;
select set_config('request.jwt.claim.sub', '', false);
set role anon;
select count(*) as n_all, string_agg(username, ',' order by rank::int) as page_all from mazer.mazer_leaderboard_page(100, 0) \gset
reset role;
select pg_temp.ok(:n_all = 10 and :'page_all' = 'mzr-qa-1112,claude,MazerMaster,fawxzzy,cudding_muisc,cqa-a-1105,cuddlingmuisc,mzr-qa-2,Mazer-269110,ExtraPlayer',
  'R1 after rollback all 10 accounts are ranked again, original order', :'page_all');
select pg_temp.ok(not exists (select 1 from information_schema.columns where table_schema = 'mazer' and table_name = 'mazer_profiles' and column_name = 'leaderboard_hidden'),
  'R2 leaderboard_hidden column is gone');
select pg_temp.ok(to_regprocedure('mazer.mazer_protect_leaderboard_hidden()') is null
  and not exists (select 1 from pg_trigger where tgrelid = 'mazer.mazer_profiles'::regclass and tgname = 'mazer_protect_leaderboard_hidden_before_write'),
  'R3 protect trigger and its function are gone');
select pg_temp.ok(md5((select prosrc from pg_proc where oid = 'mazer.mazer_leaderboard_page(integer,integer)'::regprocedure)) = '57b52e11c3aa16d5d9672e43c056b486'
  and md5((select prosrc from pg_proc where oid = 'mazer.mazer_leaderboard_self_rank()'::regprocedure)) = '7f4912db0e015d565a88383e8610e86e',
  'R4 both function bodies are byte-identical to the live preimage (md5 57b52e11..., 7f4912db...)');
select pg_temp.ok((select count(*) from pg_trigger where tgrelid = 'mazer.mazer_profiles'::regclass and not tgisinternal) = 1, 'R5 only the original user trigger remains on mazer_profiles');
