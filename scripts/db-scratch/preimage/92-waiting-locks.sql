-- READ-ONLY preimage 92 (volatile): lock requests that are waiting right now, with the relation and the waiting session.
select l.pid,
       l.locktype,
       l.mode,
       l.relation::regclass::text as relation_name,
       a.usename as role_name,
       now() - a.query_start as waiting_for,
       left(regexp_replace(a.query, '\s+', ' ', 'g'), 140) as query_head
from pg_locks l
join pg_stat_activity a on a.pid = l.pid
where not l.granted
order by waiting_for desc
