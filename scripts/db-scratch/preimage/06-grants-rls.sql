-- READ-ONLY preimage 06: owner and ACL of schemas and tables in scope, row-level-security flags, and every policy.
-- ACL text reads grantee=privileges/grantor (a blank grantee is PUBLIC).
with scope(schema_name) as (select unnest(array['mazer','account_private','public']))  -- SCOPE-SCHEMAS
select 'schema' as kind,
       n.nspname as object_schema,
       n.nspname as object_name,
       pg_get_userbyid(n.nspowner) as owner,
       coalesce(n.nspacl::text, '') as detail
from pg_namespace n
where n.nspname in (select schema_name from scope) or n.nspname = 'auth'
union all
select 'table' as kind,
       n.nspname as object_schema,
       c.relname as object_name,
       pg_get_userbyid(c.relowner) as owner,
       'acl=' || coalesce(c.relacl::text, '') || ' rls=' || c.relrowsecurity::text || ' forced=' || c.relforcerowsecurity::text as detail
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where c.relkind in ('r', 'p', 'v', 'm', 'f')
  and (n.nspname in (select schema_name from scope) or (n.nspname = 'auth' and c.relname = 'users'))
union all
select 'policy' as kind,
       n.nspname as object_schema,
       c.relname || '.' || pol.polname as object_name,
       '' as owner,
       'cmd=' || pol.polcmd::text || ' roles=' || pol.polroles::regrole[]::text
         || ' using=' || coalesce(pg_get_expr(pol.polqual, pol.polrelid), '')
         || ' check=' || coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '') as detail
from pg_policy pol
join pg_class c on c.oid = pol.polrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname in (select schema_name from scope)
order by 1, 2, 3
