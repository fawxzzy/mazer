-- Forward-only correction for the historical receipt classifier used by
-- bounded progression repair tooling. The already-applied R019 migration is
-- immutable; this helper records the superseding rule without replaying or
-- mutating any progression row.

create or replace function mazer.mazer_has_historical_play_receipt(
  p_user_id uuid
)
returns boolean
language sql
stable
set search_path = ''
as $function$
  select exists (
    select 1
    from mazer.mazer_cycle_receipts r
    where r.user_id = p_user_id
      and r.surface = 'play'
  );
$function$;

alter function mazer.mazer_has_historical_play_receipt(uuid) owner to postgres;
revoke all on function mazer.mazer_has_historical_play_receipt(uuid) from public, anon, authenticated, service_role;

comment on function mazer.mazer_has_historical_play_receipt(uuid) is
  'Administrative repair classifier: any conserved play receipt, including pre-idempotency rows with null client_run_id or recipe metadata, is historical completion evidence. Receipt count never implies a level.';
