-- SQL503: keep one authoritative copy of successful intake gear evidence.
-- No row deletion, failed-event compaction, or changes to payload/snapshot data.
begin;
create or replace function private.kinojo_intake_payload_id_v503(p_raw jsonb)
returns bigint language sql immutable set search_path=pg_catalog as $fn$
 select case when p_raw->>'payloadId' ~ '^[1-9][0-9]{0,17}$'
             then (p_raw->>'payloadId')::bigint end
$fn$;

create or replace function private.kinojo_intake_evidence_compact_v503()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public,private as $fn$
declare v_id bigint;
begin
 if new.event_type='submit' and new.status='received'
    and jsonb_typeof(new.raw_payload)='object'
    and new.raw_payload ? 'gearEvidence' then
  select p.id into v_id from public.extension_character_payloads p
  where p.id=private.kinojo_intake_payload_id_v503(new.raw_payload)
    and p.session_id=new.session_id and p.snapshot_uid=new.snapshot_uid
    and p.master_sync_status='synced'
    and p.gear_evidence=new.raw_payload->'gearEvidence'
  for share;
  if v_id is not null then
   new.raw_payload := new.raw_payload - 'gearEvidence';
  end if;
 end if;
 return new;
end
$fn$;
revoke all on function private.kinojo_intake_payload_id_v503(jsonb) from public,anon,authenticated,service_role;
revoke all on function private.kinojo_intake_evidence_compact_v503() from public,anon,authenticated,service_role;
create trigger snapshot_intake_evidence_compact_v503
before insert on public.snapshot_intake_events
for each row execute function private.kinojo_intake_evidence_compact_v503();
commit;
