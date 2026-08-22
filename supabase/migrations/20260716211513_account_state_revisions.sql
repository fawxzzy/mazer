alter table public.mazer_progression_states
  add column if not exists revision bigint not null default 0 check (revision >= 0);

alter table public.mazer_profiles
  add column if not exists revision bigint not null default 0 check (revision >= 0);

comment on column public.mazer_progression_states.revision is
  'Monotonic optimistic-concurrency revision. Authenticated clients must compare before replacing canonical account progression.';

comment on column public.mazer_profiles.revision is
  'Monotonic optimistic-concurrency revision for player-facing settings synced across devices.';
