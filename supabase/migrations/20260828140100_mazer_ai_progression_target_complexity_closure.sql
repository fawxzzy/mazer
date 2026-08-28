-- Companion to 20260828140000_mazer_progression_target_complexity_closure.sql
-- -- same root cause (20260827170000_mazer_progression_ordinal_closure.sql
-- corrected level without correspondingly correcting target_complexity),
-- same fix shape, applied against mazer_ai_progression_states instead of
-- mazer_progression_states.
--
-- Different table, different JSON shape: this table's state column is a
-- flat object (no tracks.<id> nesting), and confirmed many rows here
-- (fresh/baseline accounts) carry no targetComplexity key in their JSON at
-- all -- a separate, pre-existing, benign gap unrelated to this repair.
-- The postimage check (and the update itself) is scoped to only touch/
-- verify the targetComplexity JSON key on rows that already had one,
-- rather than introducing it everywhere -- adding it to rows that never
-- had it would be a scope change beyond "fix what the R017 repair left
-- inconsistent."
--
-- APPLIED to production 2026-08-28 via the Supabase Management API,
-- alongside the player-track fix above and with the same explicit sign-off.
-- Preflight found 2 affected rows. First attempt's postimage check was
-- over-scoped (demanded every row have a JSON targetComplexity key,
-- including rows that never had one) and correctly aborted the whole
-- transaction with no partial write; corrected to only verify rows that
-- already carried the key, then re-applied successfully. Postimage
-- confirmed 0 rows remaining inconsistent on the SQL column, and no
-- JSON-vs-column mismatch among rows that have the JSON key at all.

begin;

do $preflight$
begin
  if to_regclass('mazer.mazer_ai_progression_states') is null then
    raise exception 'MAZER_AI_TARGET_COMPLEXITY_CLOSURE_PREIMAGE_MISSING';
  end if;
end;
$preflight$;

lock table mazer.mazer_ai_progression_states in share row exclusive mode;

with closure as (
  select
    s.user_id,
    s.runner_key,
    least(greatest(8 + ((least(s.level, 99) - 1) * 4), 8), 400)::integer as canonical_target_complexity
  from mazer.mazer_ai_progression_states s
  where s.target_complexity is distinct from least(greatest(8 + ((least(s.level, 99) - 1) * 4), 8), 400)::integer
)
update mazer.mazer_ai_progression_states s
set
  target_complexity = closure.canonical_target_complexity,
  state = case
    when s.state ? 'targetComplexity'
      then s.state || jsonb_build_object('targetComplexity', closure.canonical_target_complexity)
    else s.state
  end,
  updated_at = pg_catalog.clock_timestamp()
from closure
where s.user_id = closure.user_id and s.runner_key = closure.runner_key;

do $postimage$
begin
  if exists (
    select 1 from mazer.mazer_ai_progression_states s
    where s.target_complexity is distinct from least(greatest(8 + ((least(s.level, 99) - 1) * 4), 8), 400)::integer
  ) then
    raise exception 'MAZER_AI_TARGET_COMPLEXITY_CLOSURE_POSTIMAGE_FAILED_COLUMN';
  end if;
  if exists (
    select 1 from mazer.mazer_ai_progression_states s
    where s.state ? 'targetComplexity'
      and (s.state ->> 'targetComplexity')::integer is distinct from s.target_complexity
  ) then
    raise exception 'MAZER_AI_TARGET_COMPLEXITY_CLOSURE_POSTIMAGE_FAILED_JSON';
  end if;
end;
$postimage$;

commit;
