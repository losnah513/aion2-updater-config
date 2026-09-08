-- Existing manual detail collector: atomic owner/identity validation at each write.
begin;
create or replace function public.kinojo_character_detail_write_v1(
 p_job_id uuid,p_worker_id text,p_kind text,p_payload jsonb
) returns jsonb language plpgsql security definer
set search_path = 'pg_catalog','public'
set statement_timeout = '10s'
set lock_timeout = '2s'
as $fn$
declare
 v_job public.character_detail_refresh_jobs%rowtype;
 v_master public.character_master%rowtype;
 v_profile jsonb;
 v_data jsonb;
 v_set text;
 v_job_allowed text[] := array['server_id','character_id','character_name','status','phase','current_category','current_label','worker_id','equipment_targets','daevanion_targets','base_info_payload','base_equipment_payload','equipment_cursor','daevanion_cursor','weapon_total','weapon_done','weapon_failed','armor_total','armor_done','armor_failed','accessory_total','accessory_done','accessory_failed','arcana_total','arcana_done','arcana_failed','daevanion_total','daevanion_done','daevanion_failed','request_count','failure_items','resume_at','completed_at','cooldown_until','last_heartbeat_at','last_error_code','last_error_message','summary','updated_at'];
begin
 if nullif(trim(p_worker_id),'') is null or jsonb_typeof(p_payload) is distinct from 'object'
    or coalesce(p_kind,'') not in ('job','equipment','daevanion') then
  return jsonb_build_object('ok',false,'code','DETAIL_WRITE_INVALID');
 end if;
 -- Master -> Job ordering also serializes against concurrent identity changes.
 select * into v_job from public.character_detail_refresh_jobs where id=p_job_id;
 if not found then return jsonb_build_object('ok',false,'code','DETAIL_JOB_NOT_FOUND'); end if;
 select * into v_master from public.character_master where id=v_job.character_master_id for share;
 if not found then return jsonb_build_object('ok',false,'code','CHARACTER_MASTER_NOT_FOUND'); end if;
 select * into v_job from public.character_detail_refresh_jobs where id=p_job_id for update;
 if not found then return jsonb_build_object('ok',false,'code','DETAIL_JOB_NOT_FOUND'); end if;
 if v_job.worker_id is distinct from p_worker_id or v_job.status <> 'running' then
  return jsonb_build_object('ok',false,'code','DETAIL_STALE_WORKER');
 end if;

 if p_kind='job' then
  if exists(select 1 from jsonb_object_keys(p_payload) k where not k=any(v_job_allowed))
     or (p_payload ? 'worker_id' and p_payload->>'worker_id' is not null)
     or (p_payload ? 'status' and coalesce(p_payload->>'status','') not in ('queued','running','waiting','completed','partial_failed','failed')) then
   return jsonb_build_object('ok',false,'code','DETAIL_WRITE_INVALID');
  end if;
 end if;

 -- An owner may record failure after a rename, but may not save collected data.
 if not coalesce((p_kind='job' and p_payload->>'status'='failed'
         and not (p_payload ?| array['base_info_payload','base_equipment_payload','equipment_targets','daevanion_targets'])),false) then
  if v_master.is_active is false or v_job.server_id is distinct from v_master.server_id
     or public.kinojo_character_identity_key_v298(v_job.character_name)
        is distinct from public.kinojo_character_identity_key_v298(v_master.character_name)
     or (p_payload ? 'server_id' and p_payload->>'server_id' is distinct from v_master.server_id::text)
     or (p_payload ? 'character_name' and public.kinojo_character_identity_key_v298(p_payload->>'character_name')
        is distinct from public.kinojo_character_identity_key_v298(v_master.character_name)) then
   return jsonb_build_object('ok',false,'code','DETAIL_IDENTITY_CHANGED');
  end if;
  v_profile := coalesce(p_payload->'base_info_payload',v_job.base_info_payload)->'profile';
  if v_job.phase <> 'INIT' or p_kind <> 'job'
     or p_payload ?| array['base_info_payload','base_equipment_payload','equipment_targets','daevanion_targets']
     or coalesce(p_payload->>'phase','INIT') <> 'INIT'
     or coalesce(p_payload->>'status','') in ('completed','partial_failed') then
   if coalesce(v_master.char_key,'') !~ '^[0-9]+$'
      or jsonb_typeof(v_profile->'charKey') is distinct from 'string'
      or v_profile->>'charKey' is distinct from v_master.char_key
      or v_profile->>'serverId' is distinct from v_master.server_id::text
      or nullif(trim(v_profile->>'characterName'),'') is null
      or public.kinojo_character_identity_key_v298(v_profile->>'characterName')
         is distinct from public.kinojo_character_identity_key_v298(v_master.character_name)
      or nullif(trim(v_master.class_name),'') is null
      or v_profile->>'className' is distinct from v_master.class_name then
    return jsonb_build_object('ok',false,'code','DETAIL_IDENTITY_MISMATCH');
   end if;
  end if;
 end if;

 if p_kind='job' then
  v_data := p_payload || jsonb_build_object('updated_at',clock_timestamp());
  select string_agg(format('%I=(jsonb_populate_record(null::public.character_detail_refresh_jobs,$1)).%I',k,k),',')
    into v_set from jsonb_object_keys(v_data) k;
  execute format('update public.character_detail_refresh_jobs set %s where id=$2 returning to_jsonb(character_detail_refresh_jobs)',v_set)
    into v_data using v_data,p_job_id;
  return jsonb_build_object('ok',true,'job',v_data);
 end if;

 if p_payload->>'character_master_id' is distinct from v_job.character_master_id::text
    or p_payload->>'refresh_job_id' is distinct from p_job_id::text then
  return jsonb_build_object('ok',false,'code','DETAIL_TARGET_MISMATCH');
 end if;
 v_data := p_payload || jsonb_build_object('refreshed_at',clock_timestamp(),'updated_at',clock_timestamp());
 if p_kind='equipment' then
  if not exists(select 1 from jsonb_array_elements(v_job.equipment_targets) t
     where t->>'slotPos'=p_payload->>'slot_pos' and t->>'id'=p_payload->>'item_id'
       and t->>'category'=p_payload->>'category') then
   return jsonb_build_object('ok',false,'code','DETAIL_TARGET_MISMATCH');
  end if;
  insert into public.character_equipment_detail_latest
   select (jsonb_populate_record(null::public.character_equipment_detail_latest,v_data)).*
   on conflict(character_master_id,slot_pos) do update set
      item_id=excluded.item_id,
      item_name=excluded.item_name,
      slot_pos_name=excluded.slot_pos_name,
      slot_label=excluded.slot_label,
      category=excluded.category,
      grade=excluded.grade,
      icon=excluded.icon,
      enchant_level=excluded.enchant_level,
      exceed_level=excluded.exceed_level,
      raw_payload=excluded.raw_payload,
      refresh_job_id=excluded.refresh_job_id,
      refreshed_at=excluded.refreshed_at,
      updated_at=excluded.updated_at;
 else
  if not exists(select 1 from jsonb_array_elements(v_job.daevanion_targets) t
      where t->>'id'=p_payload->>'board_id') then
   return jsonb_build_object('ok',false,'code','DETAIL_TARGET_MISMATCH');
  end if;
  insert into public.character_daevanion_detail_latest
   select (jsonb_populate_record(null::public.character_daevanion_detail_latest,v_data)).*
   on conflict(character_master_id,board_id) do update set
      board_name=excluded.board_name,
      raw_payload=excluded.raw_payload,
      refresh_job_id=excluded.refresh_job_id,
      refreshed_at=excluded.refreshed_at,
      updated_at=excluded.updated_at;
 end if;
 return jsonb_build_object('ok',true,'stored',true);
end;
$fn$;
revoke all on function public.kinojo_character_detail_write_v1(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.kinojo_character_detail_write_v1(uuid,text,text,jsonb) to service_role;
commit;
