revoke all on table public.mazer_progression_states from anon, authenticated, service_role;
revoke all on table public.mazer_profiles from anon, authenticated, service_role;
revoke all on table public.mazer_ai_progression_states from anon, authenticated, service_role;
revoke all on table public.mazer_cycle_receipts from anon, authenticated, service_role;

grant select, insert, update on public.mazer_progression_states to authenticated;
grant select, insert, update on public.mazer_profiles to authenticated;
grant select, insert, update on public.mazer_ai_progression_states to authenticated;
grant select, insert on public.mazer_cycle_receipts to authenticated;

grant select, insert, update, delete on public.mazer_progression_states to service_role;
grant select, insert, update, delete on public.mazer_profiles to service_role;
grant select, insert, update, delete on public.mazer_ai_progression_states to service_role;
grant select, insert, update, delete on public.mazer_cycle_receipts to service_role;
