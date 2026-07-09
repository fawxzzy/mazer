create table if not exists public.mazer_progression_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  schema_version integer not null default 1 check (schema_version > 0),
  state jsonb not null default '{}'::jsonb check (jsonb_typeof(state) = 'object'),
  last_completed_cycle_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

comment on table public.mazer_progression_states is
  'Per-user Mazer progression save state. The game remains local-first; this table is optional remote sync for signed-in users.';

comment on column public.mazer_progression_states.state is
  'Normalized LegacyProgressionState payload, intentionally compact and client-owned by the signed-in user.';

grant select, insert, update on public.mazer_progression_states to authenticated;
grant select, insert, update, delete on public.mazer_progression_states to service_role;

alter table public.mazer_progression_states enable row level security;

create policy "Mazer users can read their own progression"
on public.mazer_progression_states
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Mazer users can create their own progression"
on public.mazer_progression_states
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Mazer users can update their own progression"
on public.mazer_progression_states
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
