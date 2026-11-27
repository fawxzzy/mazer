-- Owner write (template): mark ONE answered Help message closed. This is a production data write: it does
-- NOT pass the read-only wrapper and must run with sb-query.ps1 -Write -ApprovedSha256 <sha256 of the edited
-- file>, under the SQL change rules in docs/ops/MAZER-SQL-CHANGE-PROCESS.md.
-- Edit the uuid below (copy it from the read file's output), hash the edited file, then run it.
-- One statement (its own transaction). It touches at most one row and only an open one; the RETURNING row
-- is the read-back (no row back = wrong id or already closed, nothing changed). Never edit contact_email or
-- message: the runner can, service_role cannot (column privilege), and the file never does.
update mazer.mazer_help_requests
set status = 'closed', closed_at = now()
where id = '00000000-0000-0000-0000-000000000000'::uuid
  and status = 'open'
returning id, status, closed_at;
