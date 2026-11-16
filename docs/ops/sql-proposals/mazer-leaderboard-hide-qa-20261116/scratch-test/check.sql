-- Post-apply check for 20260828160000_mazer_leaderboard_hide_qa_accounts.sql. Run as postgres (the runner) on the seeded stub.
-- Fails (ON_ERROR_STOP) on the first broken expectation. Re-runnable: every write happens inside begin/rollback.
\pset format unaligned
\pset tuples_only on
create function pg_temp.ok(cond boolean, name text, detail text default '') returns text language plpgsql as
$$ begin
  if cond is not true then raise exception 'CHECK FAILED: % [%]', name, detail; end if;
  return 'PASS  ' || name || case when detail = '' then '' else '  [' || detail || ']' end;
end; $$;

-- ---- A. as anon: the public page
select set_config('request.jwt.claim.sub', '', false);
set role anon;
select string_agg(username || ':' || rank, ',' order by rank::int) as page_anon, count(*) as page_n from mazer.mazer_leaderboard_page(100, 0) \gset
select string_agg(rank, ',' order by rank::int) as ranks_anon from mazer.mazer_leaderboard_page(100, 0) \gset
select string_agg(username || ':' || rank, ',' order by rank::int) as page2 from mazer.mazer_leaderboard_page(2, 2) \gset
reset role;
select pg_temp.ok(:'page_anon' = 'MazerMaster:1,fawxzzy:2,cudding_muisc:3,cuddlingmuisc:4,Mazer-269110:5,ExtraPlayer:6',
  'A1 anon page = exactly the 6 visible accounts, dense ranks 1..6, ordering unchanged', :'page_anon');
select pg_temp.ok(:'page_anon' !~ '(mzr-qa-1112|mzr-qa-2|cqa-a-1105|claude)', 'A2 page excludes all 4 hidden usernames');
select pg_temp.ok(:'page2' = 'cudding_muisc:3,cuddlingmuisc:4', 'A3 limit/offset keep global ranks', :'page2');

-- ---- B. flag state in the table
select string_agg(username, ',' order by username) as hidden_set from mazer.mazer_profiles where leaderboard_hidden \gset
select count(*) as visible_n from mazer.mazer_profiles where not leaderboard_hidden and username in ('fawxzzy','MazerMaster','cudding_muisc','cuddlingmuisc','Mazer-269110') \gset
select pg_temp.ok(:'hidden_set' = 'claude,cqa-a-1105,mzr-qa-1112,mzr-qa-2', 'B1 flag set for exactly the 4 target usernames', :'hidden_set');
select pg_temp.ok(:visible_n = 5, 'B2 the 5 real-player controls are not hidden');
select pg_temp.ok((select count(*) from mazer.mazer_profiles where updated_at is distinct from created_at or revision <> 0) = 0,
  'B3 hiding did not bump updated_at/revision');

-- ---- C. self_rank (authenticated): hidden callers excluded, visible callers equal their page rank
select set_config('request.jwt.claim.sub', '1b5c7980-3f6f-4239-8c6f-e13bc54e169b', false);  -- mzr-qa-1112 (hidden)
set role authenticated;
select count(*) as h_n, coalesce(max(rank), 'NULL') as h_rank, max(player_level) as h_lvl, bool_or(has_username)::text as h_has from mazer.mazer_leaderboard_self_rank() \gset
reset role;
select pg_temp.ok(:h_n = 1 and :'h_rank' = 'NULL' and :'h_lvl' = '50' and :'h_has' = 'true',
  'C1 hidden caller self_rank = 1 row, rank null, level kept, has_username true', :'h_n' || '/' || :'h_rank' || '/' || :'h_lvl' || '/' || :'h_has');
select set_config('request.jwt.claim.sub', '91c2b51b-2915-4b5d-a666-b8552a3b9533', false);  -- claude (hidden, ties MazerMaster)
set role authenticated;
select coalesce(max(rank), 'NULL') as c_rank from mazer.mazer_leaderboard_self_rank() \gset
reset role;
select pg_temp.ok(:'c_rank' = 'NULL', 'C2 hidden account that would have outranked a real player has no rank');
select set_config('request.jwt.claim.sub', '9138bb1c-97d6-506c-8153-7b7dae8a6c60', false);  -- MazerMaster (visible, #1 only because hidden are gone)
set role authenticated;
select max(rank) as m_rank, bool_or(has_username)::text as m_has from mazer.mazer_leaderboard_self_rank() \gset
select string_agg(username, ',') as m_flagged from mazer.mazer_leaderboard_page(100, 0) where is_requesting_user \gset
reset role;
select pg_temp.ok(:'m_rank' = '1' and :'m_has' = 'true', 'C3 visible caller self_rank equals page rank (MazerMaster = 1)');
select pg_temp.ok(:'m_flagged' = 'MazerMaster', 'C4 is_requesting_user marks only the caller');
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000010', false);  -- ExtraPlayer (visible, last)
set role authenticated;
select max(rank) as e_rank from mazer.mazer_leaderboard_self_rank() \gset
reset role;
select pg_temp.ok(:'e_rank' = '6', 'C5 last visible caller self_rank = 6 (global dense rank, same as page)');

-- ---- D. authenticated / anon cannot set the flag (all writes rolled back at the end)
begin;
select set_config('request.jwt.claim.sub', 'adc7ca28-7271-5599-826f-fd7e4477b542', false);  -- fawxzzy (visible)
set role authenticated;
update mazer.mazer_profiles set leaderboard_hidden = true where user_id = (select auth.uid());
select leaderboard_hidden::text as own_flag from mazer.mazer_profiles where user_id = (select auth.uid()) \gset
reset role;
select pg_temp.ok(:'own_flag' = 'false', 'D1 authenticated UPDATE ... leaderboard_hidden = true on own row is silently kept false');

select set_config('request.jwt.claim.sub', '1b5c7980-3f6f-4239-8c6f-e13bc54e169b', false);  -- mzr-qa-1112 (hidden) tries to unhide itself
set role authenticated;
update mazer.mazer_profiles set leaderboard_hidden = false where user_id = (select auth.uid());
select leaderboard_hidden::text as own_flag2 from mazer.mazer_profiles where user_id = (select auth.uid()) \gset
reset role;
select pg_temp.ok(:'own_flag2' = 'true', 'D2 hidden authenticated user cannot unhide itself');

select set_config('request.jwt.claim.sub', 'adc7ca28-7271-5599-826f-fd7e4477b542', false);
set role authenticated;
update mazer.mazer_profiles set display_name = 'after-trigger' where user_id = (select auth.uid());
select display_name as dn from mazer.mazer_profiles where user_id = (select auth.uid()) \gset
reset role;
select pg_temp.ok(:'dn' = 'after-trigger', 'D3 ordinary own-row UPDATE by authenticated still works (trigger is flag-only)');

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000011', false);
set role authenticated;
insert into mazer.mazer_profiles (user_id, username, username_origin, leaderboard_hidden) values ((select auth.uid()), 'NewSelfHider', 'claimed', true);
select leaderboard_hidden::text as ins_flag from mazer.mazer_profiles where user_id = (select auth.uid()) \gset
reset role;
select pg_temp.ok(:'ins_flag' = 'false', 'D4 authenticated INSERT with leaderboard_hidden = true is stored false');

select pg_temp.ok(not has_table_privilege('anon', 'mazer.mazer_profiles', 'UPDATE') and not has_table_privilege('anon', 'mazer.mazer_profiles', 'INSERT'),
  'D5 anon has no INSERT/UPDATE on mazer_profiles at all (trigger is the second layer)');
select pg_temp.ok(has_column_privilege('authenticated', 'mazer.mazer_profiles', 'leaderboard_hidden', 'UPDATE'),
  'D6 documents the live grant model: authenticated keeps table-level UPDATE, so the trigger (not a column revoke) is the enforcement');

-- operator path (postgres) still works and takes effect on the page immediately
update mazer.mazer_profiles set leaderboard_hidden = true where username = 'ExtraPlayer';
set role anon;
select string_agg(username, ',' order by rank::int) as page_after_op from mazer.mazer_leaderboard_page(100, 0) \gset
reset role;
select pg_temp.ok(:'page_after_op' = 'MazerMaster,fawxzzy,cudding_muisc,cuddlingmuisc,Mazer-269110', 'D7 operator (postgres) can set the flag and the page reacts', :'page_after_op');
rollback;

-- ---- E. objects, owners, ACLs, config
select pg_temp.ok((select count(*) from pg_proc p where p.oid in ('mazer.mazer_leaderboard_page(integer,integer)'::regprocedure, 'mazer.mazer_leaderboard_self_rank()'::regprocedure)
    and p.prosecdef and pg_get_userbyid(p.proowner) = 'postgres' and p.proconfig = array['search_path=""'] and p.prosrc like '%not p.leaderboard_hidden%') = 2,
  'E1 both functions: SECURITY DEFINER, owner postgres, search_path "", body carries the filter');
select pg_temp.ok(has_function_privilege('anon', 'mazer.mazer_leaderboard_page(integer,integer)', 'execute')
  and has_function_privilege('authenticated', 'mazer.mazer_leaderboard_page(integer,integer)', 'execute')
  and not has_function_privilege('anon', 'mazer.mazer_leaderboard_self_rank()', 'execute')
  and has_function_privilege('authenticated', 'mazer.mazer_leaderboard_self_rank()', 'execute'),
  'E2 execute privileges as before (page: anon+authenticated, self_rank: authenticated only)');
select pg_temp.ok(not has_function_privilege('authenticated', 'mazer.mazer_protect_leaderboard_hidden()', 'execute')
  and not has_function_privilege('anon', 'mazer.mazer_protect_leaderboard_hidden()', 'execute'),
  'E3 trigger function not executable by client roles');
select pg_temp.ok((select relacl::text from pg_class where oid = 'mazer.mazer_profiles'::regclass) = '{postgres=arwdDxtm/postgres,authenticated=arw/postgres}',
  'E4 table ACL unchanged');
select pg_temp.ok((select count(*) from pg_trigger where tgrelid = 'mazer.mazer_profiles'::regclass and not tgisinternal) = 2
  and exists (select 1 from pg_trigger where tgrelid = 'mazer.mazer_profiles'::regclass and tgname = 'mazer_enforce_username_origin_before_update')
  and exists (select 1 from pg_trigger where tgrelid = 'mazer.mazer_profiles'::regclass and tgname = 'mazer_protect_leaderboard_hidden_before_write'),
  'E5 profiles carry exactly the existing user trigger + the new protect trigger');
select pg_temp.ok((select count(*) from pg_policies where schemaname = 'mazer' and tablename = 'mazer_profiles') = 4, 'E6 RLS policies unchanged (4)');
select pg_temp.ok((select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'auth' and not t.tgisinternal) = 0,
  'E7 no trigger touched on auth.users');
