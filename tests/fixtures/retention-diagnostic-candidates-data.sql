
   create schema private;create role anon;create role authenticated;create role service_role;
   create function public.kinojo_normalize_character_name(text) returns text language sql immutable
    as $$select lower(replace($1,' ',''))$$;
   create table public.lookup_snapshots(id bigint primary key,session_id text,server_id integer,
    character_name text,status text,created_at timestamptz,snapshot_uid text,raw_payload jsonb);
   create table public.extension_character_payloads(id bigint primary key,session_id text,
    server_id integer,character_name text,received_at timestamptz,master_sync_status text,
    growth_review_status text,source_snapshot_id bigint,lookup_order integer);
   create table public.updater_sessions(session_id text primary key,status text,finished_at timestamptz);
   create table public.updater_runtime_jobs(session_id text,status text);
   create table public.lookup_batches(session_id text,status text);
   create table public.google_list_sheet_sync_queue(session_id text,sync_status text);
   create table public.character_master(latest_payload_id bigint,latest_pve_payload_id bigint,
    latest_pvp_payload_id bigint,legion_source_snapshot_id bigint,latest_snapshot_uid text);
   create table public.character_skill_current_state(snapshot_id bigint);
   create table public.character_stat_sources(snapshot_id bigint,payload_id bigint);
   create table private.character_snapshot_requests(snapshot_id bigint);
   create table public.ranking_entries(latest_payload_id bigint);
   create table public.lookup_session_targets(payload_id bigint,session_id text,lookup_order integer,target_status text);
   create table public.character_history(source_payload_id bigint);
   insert into public.updater_sessions select id::text,'completed',now()-interval '40 days'
    from generate_series(1,80) id;
   insert into public.lookup_snapshots
    select id,id::text,2002,'Hero'||id,'OK',now()-interval '40 days','uid'||id,'{"detail":"old"}'
    from generate_series(1,80) id;
   insert into public.lookup_snapshots
    select 1000+id,id::text,2002,'Hero'||id,'OK',now(),'new'||id,'{}'
    from generate_series(1,80) id;
   insert into public.extension_character_payloads
    select id,id::text,2002,'Hero'||id,now()-interval '40 days','synced','reviewed',id,1
    from generate_series(1,80) id;
   insert into public.extension_character_payloads
    select 1000+id,id::text,2002,'Hero'||id,now(),'synced','reviewed',1000+id,2
    from generate_series(1,80) id;
   insert into public.character_master values(1,2,3,4,'uid5');
   insert into public.character_skill_current_state values(6);
   insert into public.character_stat_sources values(7,8);
   insert into private.character_snapshot_requests values(9);
   insert into public.ranking_entries values(10);
   insert into public.lookup_session_targets values(11,'11',1,'lookup_done'),(null,'12',1,'retry'),(null,'13',1,null);
   insert into public.character_history values(14);
   insert into public.updater_runtime_jobs values('15','running'),('16',null);
   insert into public.lookup_batches values('17','running'),('18',null);
   insert into public.google_list_sheet_sync_queue values('19','failed'),('20',null),('21','synced'),('22','obsolete');
   update public.extension_character_payloads set master_sync_status='pending' where id=23;
   update public.extension_character_payloads set master_sync_status=null where id=24;
   update public.extension_character_payloads set growth_review_status=null where id=25;
   update public.updater_sessions set status='running' where session_id='26';
   update public.updater_sessions set finished_at=null where session_id='27';
   update public.updater_sessions set finished_at=now()-interval '10 days' where session_id='28';
   update public.lookup_snapshots set created_at=now()-interval '2 days' where id=29;
   update public.extension_character_payloads set received_at=now()-interval '2 days' where id=30;
   update public.lookup_snapshots set raw_payload='{"retainedSummaryVersion":514}' where id=31;
   update public.lookup_snapshots set raw_payload=null where id=32;
   update public.lookup_snapshots set status='failed' where id=33;
   delete from public.lookup_snapshots where id=1034;
   update public.lookup_snapshots set character_name=null where id in (35,1035);
   update public.lookup_snapshots set server_id=null where id in (36,1036);
   update public.extension_character_payloads set source_snapshot_id=null,master_sync_status='pending' where id=1037;
   update public.extension_character_payloads set character_name='H E R O38',server_id=null where id in(38,1038);
   update public.extension_character_payloads set received_at=null where id=1039;
   update public.extension_character_payloads set received_at=now()-interval '40 days' where id=1040;
   update public.updater_sessions set status='failed' where session_id='41';
   update public.updater_sessions set status='cancelled' where session_id='42';
   update public.updater_sessions set status='expired' where session_id='43';
   update public.updater_sessions set status='error' where session_id='44';
   insert into public.character_master values(null,null,null,null,null);
   insert into public.character_stat_sources values(null,null);

ALTER TABLE public.extension_character_payloads ADD COLUMN gear_evidence jsonb;
ALTER TABLE public.lookup_session_targets ADD COLUMN server_id integer, ADD COLUMN character_name text, ADD COLUMN snapshot_id bigint;
UPDATE public.extension_character_payloads SET gear_evidence='{"gearReasonCode":"kept","equipmentDetails":[1,2,3]}'::jsonb;
CREATE OR REPLACE FUNCTION private.kinojo_payload_evidence_v509(p_evidence jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
 select case when jsonb_typeof(p_evidence)='object' then
  coalesce((select jsonb_object_agg(key,value) from jsonb_each(p_evidence)
   where key=any(array['gearReasonCode','visibleEquipmentSlotCount','populatedEquipmentSlotCount',
    'namedEquipmentSlotCount','abyssEquipmentSlotCount','gearType','detectedGearType','gearParseStatus'])),'{}'::jsonb)
 else p_evidence end;
$function$;
