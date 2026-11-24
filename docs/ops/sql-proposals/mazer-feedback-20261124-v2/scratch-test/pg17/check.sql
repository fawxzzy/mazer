-- Post-apply check run by scratch-pg.mjs pair as the runner role. Any exception fails the run.
do $check$
declare
  r jsonb;
  n integer;
begin
  -- signed out: refused
  perform set_config('request.jwt.claim.sub', '', false);
  begin
    perform mazer.mazer_submit_feedback_v1(5, 'hi');
    raise exception 'CHECK_FAILED signed-out call was accepted';
  exception when sqlstate '28000' then null;
  end;

  -- signed in: accepted, one row
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', false);
  r := mazer.mazer_submit_feedback_v1(4, ' great ', 'build-1', 12, 'endless', 'menu');
  if r->>'status' is distinct from 'saved' then raise exception 'CHECK_FAILED first submit: %', r; end if;
  select count(*) into n from mazer.mazer_feedback where user_id = '00000000-0000-0000-0000-0000000000a1' and comment = 'great';
  if n <> 1 then raise exception 'CHECK_FAILED row count %', n; end if;

  -- per-user hourly cap: 5 allowed, the 6th answers rate_limited
  for i in 2..5 loop
    r := mazer.mazer_submit_feedback_v1(3);
    if r->>'status' is distinct from 'saved' then raise exception 'CHECK_FAILED submit %: %', i, r; end if;
  end loop;
  r := mazer.mazer_submit_feedback_v1(3);
  if r->>'status' is distinct from 'rate_limited' then raise exception 'CHECK_FAILED expected rate_limited: %', r; end if;

  -- cascade: deleting the auth user deletes its feedback (runner may delete users in the stub)
  delete from auth.users where id = '00000000-0000-0000-0000-0000000000a1';
  select count(*) into n from mazer.mazer_feedback where user_id = '00000000-0000-0000-0000-0000000000a1';
  if n <> 0 then raise exception 'CHECK_FAILED cascade left % rows', n; end if;
end;
$check$;

-- role-level facts (anon/authenticated have no table privilege, authenticated may execute, anon may not)
do $acl$
begin
  if has_table_privilege('anon', 'mazer.mazer_feedback', 'select,insert,update,delete')
     or has_table_privilege('authenticated', 'mazer.mazer_feedback', 'select,insert,update,delete') then
    raise exception 'CHECK_FAILED client table privilege';
  end if;
  if not has_function_privilege('authenticated', 'mazer.mazer_submit_feedback_v1(integer,text,text,integer,text,text)', 'execute') then
    raise exception 'CHECK_FAILED authenticated cannot execute';
  end if;
  if has_function_privilege('anon', 'mazer.mazer_submit_feedback_v1(integer,text,text,integer,text,text)', 'execute') then
    raise exception 'CHECK_FAILED anon can execute';
  end if;
  if not has_table_privilege('service_role', 'mazer.mazer_feedback', 'select,delete') then
    raise exception 'CHECK_FAILED service_role privileges';
  end if;
end;
$acl$;
