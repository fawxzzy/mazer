-- Rollback for apply.sql (in-app Help messages v1). PROPOSED, NOT APPLIED.
--
-- Stops intake first (drops the submit function, so guests and players can no longer send). The table is
-- dropped ONLY when it holds no rows: saved messages are data (with reply emails) and are never deleted by
-- a rollback. If rows exist the table is left in place (clients still have no privilege, RLS stays on) and
-- notice MAZER_HELP_ROLLBACK_KEPT_TABLE is raised; the owner answers or exports the messages and deletes
-- them with a separate, deliberate statement.
-- Dropping the table drops its foreign key to auth.users, which takes a lock on auth.users: the timeouts
-- below make a blocked rollback fail fast and change nothing instead of queueing sign-ins.
-- Nothing outside the objects created by apply.sql is touched.

begin;

set local lock_timeout = '3s';
set local statement_timeout = '15s';

drop function if exists mazer.mazer_submit_help_request_v1(text, text, text, integer, text);

do $rollback$
declare
  v_rows bigint;
begin
  if to_regclass('mazer.mazer_help_requests') is null then
    return;
  end if;
  -- Lock first so an insert cannot commit between the count and the drop.
  lock table mazer.mazer_help_requests in access exclusive mode;
  execute 'select count(*) from mazer.mazer_help_requests' into v_rows;
  if v_rows = 0 then
    drop table mazer.mazer_help_requests;
  else
    raise notice 'MAZER_HELP_ROLLBACK_KEPT_TABLE rows=%', v_rows;
  end if;
end;
$rollback$;

commit;
