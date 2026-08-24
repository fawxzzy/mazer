-- Repair the already-applied progression RPCs without replaying the wider
-- progression migration. PostgreSQL stores PL/pgSQL bodies as source text, so
-- the invalid schema-qualified conditional expressions can survive creation
-- and fail only when the affected completion path executes.
do $migration$
declare
  v_signature regprocedure;
  v_definition text;
begin
  foreach v_signature in array array[
    'public.mazer_complete_level(bigint,uuid,text,integer,integer,uuid,text,integer,text,timestamp with time zone,jsonb)'::regprocedure,
    'public.mazer_complete_ai_level(uuid,text,integer,integer,uuid,text,integer,text,timestamp with time zone,jsonb)'::regprocedure
  ] loop
    select pg_catalog.pg_get_functiondef(v_signature::oid)
      into v_definition;

    v_definition := pg_catalog.replace(v_definition, 'pg_catalog.' || 'coalesce', 'coalesce');
    v_definition := pg_catalog.replace(v_definition, 'pg_catalog.' || 'nullif', 'nullif');
    execute v_definition;
  end loop;
end;
$migration$;

-- Supabase may provision explicit anon EXECUTE defaults in addition to
-- PostgreSQL's PUBLIC default. Revoke both paths before restoring only the
-- authenticated application role.
revoke all on function public.mazer_initialize_progression(uuid) from public;
revoke all on function public.mazer_initialize_progression(uuid) from anon;
grant execute on function public.mazer_initialize_progression(uuid) to authenticated;

revoke all on function public.mazer_complete_level(bigint, uuid, text, integer, integer, uuid, text, integer, text, timestamp with time zone, jsonb) from public;
revoke all on function public.mazer_complete_level(bigint, uuid, text, integer, integer, uuid, text, integer, text, timestamp with time zone, jsonb) from anon;
grant execute on function public.mazer_complete_level(bigint, uuid, text, integer, integer, uuid, text, integer, text, timestamp with time zone, jsonb) to authenticated;

revoke all on function public.mazer_complete_ai_level(uuid, text, integer, integer, uuid, text, integer, text, timestamp with time zone, jsonb) from public;
revoke all on function public.mazer_complete_ai_level(uuid, text, integer, integer, uuid, text, integer, text, timestamp with time zone, jsonb) from anon;
grant execute on function public.mazer_complete_ai_level(uuid, text, integer, integer, uuid, text, integer, text, timestamp with time zone, jsonb) to authenticated;

revoke all on function public.mazer_reset_progression(bigint, uuid) from public;
revoke all on function public.mazer_reset_progression(bigint, uuid) from anon;
grant execute on function public.mazer_reset_progression(bigint, uuid) to authenticated;
