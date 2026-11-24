-- Rollback for apply.sql (in-game feedback). PROPOSED, NOT APPLIED.
--
-- Stops intake first (drops the submit function). The table is dropped ONLY when it holds no
-- rows: saved feedback is data and is never deleted by a rollback. If rows exist the table is
-- left in place (clients still have no privilege and RLS stays on) and the owner exports or
-- deletes it deliberately with a separate, separately approved statement.
-- Nothing outside the objects created by apply.sql is touched.

begin;

drop function if exists mazer.mazer_submit_feedback_v1(integer, text, text, integer, text, text);

do $rollback$
declare
  v_rows bigint;
begin
  if to_regclass('mazer.mazer_feedback') is null then
    return;
  end if;
  -- Lock first so an insert cannot commit between the count and the drop.
  lock table mazer.mazer_feedback in access exclusive mode;
  execute 'select count(*) from mazer.mazer_feedback' into v_rows;
  if v_rows = 0 then
    drop table mazer.mazer_feedback;
  else
    raise notice 'MAZER_FEEDBACK_ROLLBACK_KEPT_TABLE rows=%', v_rows;
  end if;
end;
$rollback$;

commit;
