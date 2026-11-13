-- READ-ONLY preimage 01: every function in scope with owner, definer flag, config, ACL and the body hashes.
-- One statement (the wrapper returns only the last statement). Scope = the SCOPE-SCHEMAS line; edit it or use
-- `node scripts/db-scratch/preimage-pack.mjs render --schemas a,b`.
-- md5_stored = md5(prosrc) exactly as stored: THIS is the value a hash guard must pin. md5_lf / md5_crlf show what the
-- body would hash to with LF or CRLF line endings; if md5_stored matches only one of them the stored body has that ending.
with scope(schema_name) as (select unnest(array['mazer','account_private','public']))  -- SCOPE-SCHEMAS
select n.nspname as schema_name,
       p.proname as function_name,
       pg_get_function_identity_arguments(p.oid) as identity_args,
       pg_get_userbyid(p.proowner) as owner,
       p.prosecdef as is_definer,
       p.provolatile as volatility,
       l.lanname as language,
       coalesce(p.proconfig::text, '') as config,
       coalesce(p.proacl::text, '') as acl,
       length(p.prosrc) as body_chars,
       length(p.prosrc) - length(replace(p.prosrc, chr(13), '')) as cr_count,
       md5(p.prosrc) as md5_stored,
       md5(replace(p.prosrc, chr(13), '')) as md5_lf,
       md5(replace(replace(p.prosrc, chr(13), ''), chr(10), chr(13) || chr(10))) as md5_crlf
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
join pg_language l on l.oid = p.prolang
join scope s on s.schema_name = n.nspname
where p.prokind in ('f', 'p')
order by 1, 2, 3
