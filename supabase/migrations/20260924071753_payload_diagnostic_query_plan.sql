-- SQL510: bound candidate selection on operating cardinalities; no data or predicate changes.
begin read write;
set local lock_timeout='2s';
set local statement_timeout='15s';
alter function private.kinojo_payload_evidence_candidates_v509(bigint,integer) set enable_nestloop to off;
commit;
