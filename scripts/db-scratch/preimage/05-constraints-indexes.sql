-- READ-ONLY preimage 05: constraints (check, unique, primary key, foreign key) and indexes of tables in scope and auth.users.
with scope(schema_name) as (select unnest(array['mazer','account_private','public']))  -- SCOPE-SCHEMAS
select 'constraint' as kind,
       n.nspname as table_schema,
       c.relname as table_name,
       k.conname as object_name,
       pg_get_constraintdef(k.oid) as definition
from pg_constraint k
join pg_class c on c.oid = k.conrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname in (select schema_name from scope) or (n.nspname = 'auth' and c.relname = 'users')
union all
select 'index' as kind,
       n.nspname as table_schema,
       c.relname as table_name,
       i.relname as object_name,
       pg_get_indexdef(x.indexrelid) as definition
from pg_index x
join pg_class c on c.oid = x.indrelid
join pg_class i on i.oid = x.indexrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname in (select schema_name from scope) or (n.nspname = 'auth' and c.relname = 'users')
order by 1, 2, 3, 4
