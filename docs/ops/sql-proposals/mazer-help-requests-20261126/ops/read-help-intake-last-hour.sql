-- Owner read: Help intake in the last rolling hour, to see a flood (the guest pool filling up) at a glance.
-- READ-ONLY, one statement, passes the read-only wrapper screen. Counts only: no email and no message text.
--   powershell -NoProfile -File <skills>\atlas-supabase\sb-query.ps1 -SqlFile <this file> -OutFile <scratch>\help-intake.json
-- guest_last_hour at guest_hour_limit with many distinct_guest_addresses = the known trade-off in the README
-- (invented addresses filling the guest pool); guests are refused until oldest_guest_in_window is an hour old.
-- The limits shown are the constants of mazer_submit_help_request_v1; update them here with any new version.
select
  count(*) filter (where h.user_id is null) as guest_last_hour,
  30 as guest_hour_limit,
  count(distinct pg_catalog.lower(h.contact_email)) filter (where h.user_id is null) as distinct_guest_addresses,
  min(h.created_at) filter (where h.user_id is null) as oldest_guest_in_window,
  count(*) filter (where h.user_id is not null) as signed_in_last_hour,
  count(*) as total_last_hour,
  90 as total_hour_limit
from mazer.mazer_help_requests h
where h.created_at > now() - interval '1 hour';
