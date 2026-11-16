-- Seed (run as postgres). The 9 real user_ids/usernames from the live capture (target_and_control_rows) + 1 extra.
-- Levels are synthetic, chosen to exercise ties: claude ties MazerMaster at 40 and would beat it; cqa-a-1105 ties
-- fawxzzy/cudding_muisc at 30 (null level_reached_at); mzr-qa-1112 would be #1.
insert into mazer.mazer_profiles (user_id, username, username_origin) values
 ('1b5c7980-3f6f-4239-8c6f-e13bc54e169b','mzr-qa-1112','claimed'),
 ('9138bb1c-97d6-506c-8153-7b7dae8a6c60','MazerMaster','claimed'),
 ('91c2b51b-2915-4b5d-a666-b8552a3b9533','claude','claimed'),
 ('adc7ca28-7271-5599-826f-fd7e4477b542','fawxzzy','claimed'),
 ('f810c8e8-068c-4e63-9d8e-bc64636fb1a2','cqa-a-1105','claimed'),
 ('007630ec-e9ed-44ae-b688-33b954cbf85c','cudding_muisc','claimed'),
 ('4d149c7d-04ff-4a19-bd81-8d3b173b994d','cuddlingmuisc','claimed'),
 ('cf491de3-7e3e-4162-8e4a-c2c0c9468e14','mzr-qa-2','claimed'),
 ('4a180a92-b3cc-4117-97b5-3e7b3778079b','Mazer-269110','claimed'),
 ('00000000-0000-4000-8000-000000000010','ExtraPlayer','claimed');
insert into mazer.mazer_progression_states (user_id, player_level, level_reached_at) values
 ('1b5c7980-3f6f-4239-8c6f-e13bc54e169b', 50, '2026-01-01'),
 ('9138bb1c-97d6-506c-8153-7b7dae8a6c60', 40, '2026-01-02'),
 ('91c2b51b-2915-4b5d-a666-b8552a3b9533', 40, '2026-01-01'),
 ('adc7ca28-7271-5599-826f-fd7e4477b542', 30, '2026-02-01'),
 ('f810c8e8-068c-4e63-9d8e-bc64636fb1a2', 30, null),
 ('007630ec-e9ed-44ae-b688-33b954cbf85c', 30, null),
 ('4d149c7d-04ff-4a19-bd81-8d3b173b994d', 12, '2026-03-01'),
 ('cf491de3-7e3e-4162-8e4a-c2c0c9468e14', 5, '2026-03-02'),
 ('4a180a92-b3cc-4117-97b5-3e7b3778079b', 5, '2026-03-03'),
 ('00000000-0000-4000-8000-000000000010', 1, '2026-04-01');
