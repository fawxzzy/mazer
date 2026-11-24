-- Rollback for apply.sql (MAZER-ACCT-047 username throttle). PROPOSED, NOT APPLIED.
--
-- apply.sql changed no existing function, so "restore the live preimage" means removing exactly the
-- three objects it created. The trigger goes first (throttle off), then its function, then the log
-- table ONLY when it holds no rows: logged changes are data and a rollback never deletes them. If rows
-- exist the table stays (no client privilege, RLS on) and the owner removes it deliberately with a
-- separate, separately approved statement. Re-applying later reuses it.
-- Afterwards it asserts the profile table is back to its two original triggers and that the three
-- guarded live bodies are byte-identical to the preimage (md5 of the stored body, CRLF kept).

begin;

set local lock_timeout = '3s';
set local statement_timeout = '15s';

drop trigger if exists mazer_throttle_username_change_before_update on mazer.mazer_profiles;
drop function if exists mazer.mazer_throttle_username_change();

do $rollback$
declare
  v_rows bigint;
begin
  if to_regclass('mazer.mazer_username_changes') is null then
    return;
  end if;
  -- Lock first so a change cannot commit between the count and the drop.
  lock table mazer.mazer_username_changes in access exclusive mode;
  execute 'select count(*) from mazer.mazer_username_changes' into v_rows;
  if v_rows = 0 then
    drop table mazer.mazer_username_changes;
  else
    raise notice 'MAZER_THROTTLE_ROLLBACK_KEPT_TABLE rows=%', v_rows;
  end if;
end;
$rollback$;

do $postimage$
begin
  if (select string_agg(t.tgname, ',' order by t.tgname) from pg_catalog.pg_trigger t
      where t.tgrelid = 'mazer.mazer_profiles'::regclass and not t.tgisinternal)
     is distinct from 'mazer_enforce_username_origin_before_update,mazer_protect_leaderboard_hidden_before_write' then
    raise exception 'MAZER_THROTTLE_ROLLBACK_TRIGGER_SET_NOT_PREIMAGE';
  end if;
  if to_regprocedure('mazer.mazer_throttle_username_change()') is not null then
    raise exception 'MAZER_THROTTLE_ROLLBACK_FUNCTION_STILL_THERE';
  end if;
  if (select md5(p.prosrc) from pg_catalog.pg_proc p where p.oid = to_regprocedure('mazer.mazer_set_username(uuid, text)')) is distinct from '1b1fae6c5de66380e55f2f096f2de5cb'
     or (select md5(p.prosrc) from pg_catalog.pg_proc p where p.oid = to_regprocedure('mazer.mazer_enforce_username_origin()')) is distinct from '15faddd63b2eb3bc413f3751203ee961'
     or (select md5(p.prosrc) from pg_catalog.pg_proc p where p.oid = to_regprocedure('mazer.mazer_protect_leaderboard_hidden()')) is distinct from 'a2d34bf2c78cbcbcf0d1efc14c9a45f0' then
    raise exception 'MAZER_THROTTLE_ROLLBACK_BODIES_NOT_PREIMAGE';
  end if;
end;
$postimage$;

commit;
