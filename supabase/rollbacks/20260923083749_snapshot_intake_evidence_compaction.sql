-- SQL503 rollback stops future compaction. Historical JSON needs the encrypted backup.
begin;
drop trigger if exists snapshot_intake_evidence_compact_v503 on public.snapshot_intake_events;
drop function if exists private.kinojo_intake_evidence_compact_v503();
drop function if exists private.kinojo_intake_payload_id_v503(jsonb);
commit;
