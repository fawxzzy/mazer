-- Run as the scratch superuser (--extra-super). Supabase's postgres role is a member of the API roles; the check
-- script needs SET ROLE authenticated / anon / service_role as the (non-superuser) runner. No ownership/ACL change.
grant anon, authenticated, service_role to postgres;
