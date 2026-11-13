-- READ-ONLY preimage 04: columns, types, nullability, defaults, identity and generated flags of tables in scope and auth.users.
-- (auth.users has no default on id: an insert must supply it.)
with scope(schema_name) as (select unnest(array['mazer','account_private','public']))  -- SCOPE-SCHEMAS
select n.nspname as table_schema,
       c.relname as table_name,
       a.attnum as position,
       a.attname as column_name,
       format_type(a.atttypid, a.atttypmod) as data_type,
       a.attnotnull as not_null,
       coalesce(pg_get_expr(d.adbin, d.adrelid), '') as default_expr,
       a.attidentity as identity_kind,
       a.attgenerated as generated_kind
from pg_attribute a
join pg_class c on c.oid = a.attrelid
join pg_namespace n on n.oid = c.relnamespace
left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
where c.relkind in ('r', 'p', 'v', 'm', 'f')
  and a.attnum > 0
  and not a.attisdropped
  and (n.nspname in (select schema_name from scope) or (n.nspname = 'auth' and c.relname = 'users'))
order by 1, 2, 3
