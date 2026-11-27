-- Post-apply check run by scratch-pg.mjs pair as the runner role (postgres, non-superuser, owner of the new
-- objects). Any exception fails the run. It ends with the table EMPTY so the pair's rollback drops it and the
-- catalog comparison is exact (the rollback-with-rows case is rollback-with-rows.ps1).
do $check$
declare
  r jsonb;
  n integer;
  ok boolean;
begin
  -- guest (no auth.uid()): accepted, stored with user_id NULL, trimmed, case kept
  perform set_config('request.jwt.claim.sub', '', false);
  r := mazer.mazer_submit_help_request_v1('  Guest@Example.COM ', E'\n help me \n', 'build-1', 12, 'endless');
  if r->>'status' is distinct from 'saved' then raise exception 'CHECK_FAILED guest submit: %', r; end if;
  select count(*) into n from mazer.mazer_help_requests
   where user_id is null and contact_email = 'Guest@Example.COM' and message = 'help me' and status = 'open';
  if n <> 1 then raise exception 'CHECK_FAILED guest row count %', n; end if;

  -- validation codes, never echoing the input
  begin
    perform mazer.mazer_submit_help_request_v1('not-an-email', 'x');
    raise exception 'CHECK_FAILED bad email accepted';
  exception when sqlstate '22023' then
    if sqlerrm <> 'MAZER_HELP_BAD_EMAIL' then raise exception 'CHECK_FAILED bad email message %', sqlerrm; end if;
  end;
  begin
    perform mazer.mazer_submit_help_request_v1('a@b.co', '   ');
    raise exception 'CHECK_FAILED empty message accepted';
  exception when sqlstate '22023' then
    if sqlerrm <> 'MAZER_HELP_MESSAGE_EMPTY' then raise exception 'CHECK_FAILED empty message %', sqlerrm; end if;
  end;
  begin
    perform mazer.mazer_submit_help_request_v1('a@b.co', repeat('m', 2001));
    raise exception 'CHECK_FAILED long message accepted';
  exception when sqlstate '22001' then
    if sqlerrm <> 'MAZER_HELP_MESSAGE_TOO_LONG' then raise exception 'CHECK_FAILED long message %', sqlerrm; end if;
  end;
  r := mazer.mazer_submit_help_request_v1('len@b.co', repeat('m', 2000));
  if r->>'status' is distinct from 'saved' then raise exception 'CHECK_FAILED 2000-character message: %', r; end if;

  -- signed in: user id from auth.uid(); per-user hourly cap 3, the 4th answers rate_limited
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', false);
  for i in 1..3 loop
    r := mazer.mazer_submit_help_request_v1('b1-' || i || '@x.io', 'question ' || i);
    if r->>'status' is distinct from 'saved' then raise exception 'CHECK_FAILED signed-in submit %: %', i, r; end if;
  end loop;
  r := mazer.mazer_submit_help_request_v1('b1-4@x.io', 'question 4');
  if r->>'status' is distinct from 'rate_limited' or (r->>'retry_after_seconds')::int not between 1 and 3600 then
    raise exception 'CHECK_FAILED expected rate_limited: %', r;
  end if;
  select count(*) into n from mazer.mazer_help_requests where user_id = '00000000-0000-0000-0000-0000000000b1';
  if n <> 3 then raise exception 'CHECK_FAILED signed-in rows %', n; end if;

  -- per-email cap (case-insensitive) binds a second player too
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b2', false);
  r := mazer.mazer_submit_help_request_v1('GUEST@example.com', 'second');
  r := mazer.mazer_submit_help_request_v1('guest@EXAMPLE.com', 'third');
  r := mazer.mazer_submit_help_request_v1('guest@example.com', 'fourth');
  if r->>'status' is distinct from 'rate_limited' then raise exception 'CHECK_FAILED per-email cap: %', r; end if;

  -- cascade: deleting the auth user deletes that player's messages, guests' stay
  delete from auth.users where id = '00000000-0000-0000-0000-0000000000b1';
  select count(*) into n from mazer.mazer_help_requests where user_id = '00000000-0000-0000-0000-0000000000b1';
  if n <> 0 then raise exception 'CHECK_FAILED cascade left % rows', n; end if;
  select count(*) into n from mazer.mazer_help_requests where user_id is null;
  if n <> 2 then raise exception 'CHECK_FAILED guest rows after cascade %', n; end if;

  -- the owner close statement shape works for the runner (status + closed_at together)
  update mazer.mazer_help_requests set status = 'closed', closed_at = now() where message = 'help me' and status = 'open';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'CHECK_FAILED close updated % rows', n; end if;
  begin
    update mazer.mazer_help_requests set status = 'closed' where status = 'open';
    raise exception 'CHECK_FAILED half close accepted';
  exception when check_violation then null;
  end;

  -- leave the table empty for the pair's rollback/catalog comparison
  delete from mazer.mazer_help_requests;
  perform set_config('request.jwt.claim.sub', '', false);
end;
$check$;

-- role-level facts: no client table privilege; anon AND authenticated may execute; public may not; service_role shape
do $acl$
begin
  if has_table_privilege('anon', 'mazer.mazer_help_requests', 'select,insert,update,delete,truncate,references,trigger')
     or has_table_privilege('authenticated', 'mazer.mazer_help_requests', 'select,insert,update,delete,truncate,references,trigger') then
    raise exception 'CHECK_FAILED client table privilege';
  end if;
  if not has_function_privilege('anon', 'mazer.mazer_submit_help_request_v1(text,text,text,integer,text)', 'execute')
     or not has_function_privilege('authenticated', 'mazer.mazer_submit_help_request_v1(text,text,text,integer,text)', 'execute')
     or has_function_privilege('public', 'mazer.mazer_submit_help_request_v1(text,text,text,integer,text)', 'execute') then
    raise exception 'CHECK_FAILED function ACL';
  end if;
  if not has_table_privilege('service_role', 'mazer.mazer_help_requests', 'select,delete')
     or has_table_privilege('service_role', 'mazer.mazer_help_requests', 'insert')
     or has_column_privilege('service_role', 'mazer.mazer_help_requests', 'message', 'update')
     or not has_column_privilege('service_role', 'mazer.mazer_help_requests', 'status', 'update') then
    raise exception 'CHECK_FAILED service_role privileges';
  end if;
  if (select pg_get_userbyid(relowner) from pg_class where oid = 'mazer.mazer_help_requests'::regclass) <> 'postgres'
     or (select rolsuper from pg_roles where rolname = current_user) then
    raise exception 'CHECK_FAILED expected a non-superuser runner owning the table';
  end if;
end;
$acl$;
