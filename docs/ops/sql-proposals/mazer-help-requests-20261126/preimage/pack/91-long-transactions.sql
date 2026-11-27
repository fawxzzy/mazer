-- READ-ONLY preimage 91 (volatile): sessions with a transaction open longer than 30 seconds.
-- Run it right before an apply: a long transaction holding locks on the tables the change touches makes the apply wait or fail.
select a.pid,
       a.usename as role_name,
       a.state,
       now() - a.xact_start as xact_age,
       now() - a.query_start as query_age,
       a.wait_event_type,
       a.wait_event,
       left(regexp_replace(a.query, '\s+', ' ', 'g'), 140) as query_head
from pg_stat_activity a
where a.pid <> pg_backend_pid()
  and a.xact_start is not null
  and now() - a.xact_start > interval '30 seconds'
order by a.xact_start
