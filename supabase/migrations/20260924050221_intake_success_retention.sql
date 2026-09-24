-- SQL506: retain successful intake references/diagnostics, not a second source document.
begin read write;
set local lock_timeout='2s';
create function private.kinojo_intake_synced_payload_v506(e public.snapshot_intake_events)
returns bigint language plpgsql set search_path=pg_catalog,public,private as $fn$
declare v_id bigint; v_count integer;
begin
 if e.event_type<>'submit' or e.status<>'received' or jsonb_typeof(e.raw_payload) is distinct from 'object' then return null; end if;
 if e.raw_payload ? 'payloadId' then
  v_id:=private.kinojo_intake_payload_id_v503(e.raw_payload);
  if v_id is null then return null; end if;
 else
  if e.payload_hash is null or e.character_name is null then return null; end if;
  select count(*),min(p.id) into v_count,v_id from public.extension_character_payloads p
  where p.session_id=e.session_id and p.character_name=e.character_name and p.payload_hash=e.payload_hash;
  if v_count<>1 then return null; end if;
 end if;
 select p.id into v_id from public.extension_character_payloads p
 where p.id=v_id and p.master_sync_status='synced' and p.session_id=e.session_id
 and p.character_name=e.character_name and p.payload_hash=e.payload_hash
 and (e.snapshot_uid is null or p.snapshot_uid=e.snapshot_uid)
 and (not(e.raw_payload ? 'serverId') or e.raw_payload->>'serverId'=p.server_id::text)
 for share;
 return v_id;
end $fn$;
create function private.kinojo_intake_summary_v506(p_raw jsonb,p_payload_id bigint)
returns jsonb language sql immutable strict set search_path=pg_catalog as $fn$
 select case when jsonb_typeof(p_raw)<>'object' then p_raw else
 coalesce((select jsonb_object_agg(key,value) from jsonb_each(p_raw) where key=any(array[
 'payloadId','snapshotId','targetId','lookupOrder','serverId','characterName','gearType','gearParseStatus',
 'itemLevel','combatPower','pveItemLevel','pveCombatPower','pvpItemLevel','pvpCombatPower',
 'errorMessage','parserVersion','status','parseStatus'
 ])),'{}'::jsonb) || jsonb_build_object('payloadId',p_payload_id) end
$fn$;
create function private.kinojo_intake_success_insert_v506()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,private as $fn$
declare v_id bigint;
begin
 v_id:=private.kinojo_intake_synced_payload_v506(new);
 if v_id is not null then new.raw_payload:=private.kinojo_intake_summary_v506(new.raw_payload,v_id);end if;
 return new;
end $fn$;
create function private.kinojo_intake_success_sync_v506()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,private as $fn$
begin
 update public.snapshot_intake_events e
 set raw_payload=private.kinojo_intake_summary_v506(e.raw_payload,new.id)
 where e.session_id=new.session_id and e.character_name=new.character_name
 and e.payload_hash=new.payload_hash
 and private.kinojo_intake_synced_payload_v506(e)=new.id
 and e.raw_payload is distinct from private.kinojo_intake_summary_v506(e.raw_payload,new.id);
 return new;
end $fn$;
revoke all on function private.kinojo_intake_synced_payload_v506(public.snapshot_intake_events) from public,anon,authenticated,service_role;
revoke all on function private.kinojo_intake_summary_v506(jsonb,bigint) from public,anon,authenticated,service_role;
revoke all on function private.kinojo_intake_success_insert_v506() from public,anon,authenticated,service_role;
revoke all on function private.kinojo_intake_success_sync_v506() from public,anon,authenticated,service_role;
create trigger snapshot_intake_success_v506 before insert on public.snapshot_intake_events
for each row execute function private.kinojo_intake_success_insert_v506();
create trigger payload_intake_success_v506 after insert or update of master_sync_status on public.extension_character_payloads
for each row when (new.master_sync_status='synced') execute function private.kinojo_intake_success_sync_v506();
commit;
