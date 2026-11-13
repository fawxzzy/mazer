-- TEMPLATE: install a function whose LIVE body has CRLF line endings, byte for byte, in the scratch database.
-- Why: psql on Windows reads a file in text mode and drops the CRs, so `psql -f` of a CRLF capture creates an LF body and the
-- md5(prosrc) you pin in the guard no longer matches what production holds (the 2026-11-12 trap).
-- Method: write the header (language, definer, search_path) yourself, take the body as HEX from
--   node scripts/db-scratch/scratch-pg.mjs body-hex <file with the exact live body>
-- and decode it inside the server, so no newline translation can touch it. Run as the runner role (postgres).
--
-- Replace the signature, the options and the hex.
do $$
declare
  v_body text := convert_from(decode('<HEX FROM body-hex>', 'hex'), 'UTF8');
begin
  execute format(
    'create or replace function example_app.example_fn(p_id uuid) returns text language plpgsql security definer set search_path to %L as %L',
    '',
    v_body
  );
end
$$;
-- then prove the pin: select md5(prosrc) from pg_proc where proname = 'example_fn';  (must equal the live md5_stored from query 02)
