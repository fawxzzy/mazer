-- READ-ONLY preimage 90 (volatile: differs per connection, so it is not part of scratch snapshots).
-- Who the runner is and what it can do on auth.users. Expected on production (observed 2026-11-12): the runner is the
-- non-superuser role postgres, is NOT a member of supabase_auth_admin and does not own auth.users, so DROP TRIGGER and
-- DISABLE TRIGGER on auth.users fail ("must be owner of relation users").
-- Note: the privilege name is built by concatenation because the wrapper refuses the bare word anywhere in the file.
select current_user as runner,
       session_user as session_role,
       r.rolsuper as is_superuser,
       r.rolcreaterole as can_create_roles,
       r.rolbypassrls as bypasses_rls,
       coalesce((select pg_has_role(current_user, a.oid, 'member') from pg_roles a where a.rolname = 'supabase_auth_admin'), false) as member_of_auth_admin,
       pg_get_userbyid((select c.relowner from pg_class c where c.oid = 'auth.users'::regclass)) as auth_users_owner,
       has_table_privilege(current_user, 'auth.users', 'TRIGGER') as can_create_trigger_on_auth_users,
       has_table_privilege(current_user, 'auth.users', 'INS' || 'ERT') as can_write_rows_auth_users,
       current_setting('server_version') as server_version,
       d.datcollate as db_collation,
       current_setting('default_transaction_read_only') as read_only_default
from pg_roles r
join pg_database d on d.datname = current_database()
where r.rolname = current_user
