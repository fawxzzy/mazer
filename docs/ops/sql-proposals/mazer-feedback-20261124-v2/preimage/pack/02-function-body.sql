-- READ-ONLY preimage 02: the LIVE body of one function (the one the proposal replaces or guards), with its hashes.
-- Edit the SCOPE-FUNCTION line (schema, function name) or use `preimage-pack.mjs render --function schema.name`.
-- `body` carries the CR characters, so a CRLF body shows as \r\n in the JSON output.
-- Pin md5_stored in the guard. Compare it with `node scripts/db-scratch/scratch-pg.mjs body-md5 <repo file>`: the git blob can differ.
with target(schema_name, function_name) as (values ('mazer', 'mazer_set_username'))  -- SCOPE-FUNCTION
select n.nspname as schema_name,
       p.proname as function_name,
       pg_get_function_identity_arguments(p.oid) as identity_args,
       pg_get_userbyid(p.proowner) as owner,
       length(p.prosrc) as body_chars,
       length(p.prosrc) - length(replace(p.prosrc, chr(13), '')) as cr_count,
       md5(p.prosrc) as md5_stored,
       md5(replace(p.prosrc, chr(13), '')) as md5_lf,
       md5(replace(replace(p.prosrc, chr(13), ''), chr(10), chr(13) || chr(10))) as md5_crlf,
       p.prosrc as body
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
join target t on t.schema_name = n.nspname and t.function_name = p.proname
order by 1, 2, 3
