-- READ-ONLY preimage 03: every non-internal trigger on tables in scope, plus every trigger on auth.users.
-- enabled_state: O = enabled, D = disabled, R = replica only, A = always.
with scope(schema_name) as (select unnest(array['mazer','account_private','public']))  -- SCOPE-SCHEMAS
select n.nspname as table_schema,
       c.relname as table_name,
       t.tgname as trigger_name,
       t.tgenabled as enabled_state,
       t.tgfoid::regprocedure::text as function_sig,
       pg_get_userbyid(c.relowner) as table_owner,
       pg_get_triggerdef(t.oid) as definition
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where not t.tgisinternal
  and (n.nspname in (select schema_name from scope) or (n.nspname = 'auth' and c.relname = 'users'))
order by 1, 2, 3
