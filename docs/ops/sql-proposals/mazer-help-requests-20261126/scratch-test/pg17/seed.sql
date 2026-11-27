-- Seed run by scratch-pg.mjs pair after the clone, before the apply: a few auth users and one profile.
insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-0000000000b2');
insert into mazer.mazer_profiles (user_id, username) values
  ('00000000-0000-0000-0000-0000000000b1', 'player_b1');
