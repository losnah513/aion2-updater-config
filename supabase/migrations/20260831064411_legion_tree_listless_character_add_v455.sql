-- KINOJO DB455 · Legion Tree character-name server tags and cross-server main/alt relation
-- Forward: deploy this migration, then character-refresh-worker API 295.7 and kinojo-legion-tree API 1.5.
-- Scope: only the exact server:legion_tree_character_add_v455 single-target session may skip Google list.
-- Rollback: redeploy prior Edge sources, drop the v455 public/private functions, and restore
-- private.kinojo_legion_tree_finalize_relation_v373 from DB454.

create or replace function private.kinojo_legion_tree_character_queue_prepare_v455(
  p_web_session_token text,
  p_target_server_id integer,
  p_target_character_name text,
  p_main_server_id integer,
  p_main_character_name text,
  p_mode text
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private', 'extensions'
as $function$
declare
  v_mode text := upper(pg_catalog.btrim(coalesce(p_mode,'')));
  v_target_name text := pg_catalog.btrim(coalesce(p_target_character_name,''));
  v_main_name text := pg_catalog.btrim(coalesce(p_main_character_name,''));
  v_main public.character_master%rowtype;
  v_main_server public.server_master%rowtype;
  v_result jsonb;
  v_code text;
  v_legacy_main_name text;
  v_session_id text;
  v_session_token text;
  v_existing_payload jsonb := '{}'::jsonb;
  v_existing_main_server_id integer;
  v_existing_main_name text;
  v_binding jsonb;
begin
  if v_mode not in ('MAIN','ALT') then
    return jsonb_build_object('ok',false,'code','INVALID_ADD_MODE','message','캐릭터 추가 모드가 올바르지 않습니다.');
  end if;
  if p_target_server_id is null or p_target_server_id<=0 or p_main_server_id is null or p_main_server_id<=0 then
    return jsonb_build_object('ok',false,'code','SERVER_REQUIRED','message','본캐와 추가 대상 서버를 확인해 주세요.');
  end if;
  if v_target_name='' or v_main_name='' then
    return jsonb_build_object('ok',false,'code','CHARACTER_NAME_REQUIRED','message','본캐와 추가 대상 이름을 확인해 주세요.');
  end if;
  if v_mode='MAIN' and (
    p_target_server_id<>p_main_server_id
    or public.kinojo_character_identity_key_v298(v_target_name)<>public.kinojo_character_identity_key_v298(v_main_name)
  ) then
    return jsonb_build_object('ok',false,'code','MAIN_MODE_IDENTITY_MISMATCH','message','본캐 추가 대상의 이름과 서버를 확인해 주세요.');
  end if;
  if v_mode='ALT' and p_target_server_id=p_main_server_id
     and public.kinojo_character_identity_key_v298(v_target_name)=public.kinojo_character_identity_key_v298(v_main_name) then
    return jsonb_build_object('ok',false,'code','MAIN_ALT_SAME_CHARACTER','message','본캐와 부캐의 이름·서버가 같습니다.');
  end if;

  select * into v_main_server
    from public.server_master sm
   where sm.server_id=p_main_server_id and coalesce(sm.is_active,false) is true
   limit 1;
  if not found then
    return jsonb_build_object('ok',false,'code','MAIN_SERVER_NOT_FOUND','message','본캐 서버를 현재 사용할 수 없습니다.');
  end if;

  if v_mode='ALT' then
    select * into v_main
      from public.character_master cm
     where cm.server_id=p_main_server_id
       and public.kinojo_character_identity_key_v298(cm.character_name)=public.kinojo_character_identity_key_v298(v_main_name)
       and coalesce(cm.is_active,true) is true
       and coalesce(cm.visibility_excluded,false) is false
       and coalesce(cm.status,'OK') not in ('INACTIVE','DELETED')
     order by case when coalesce(cm.is_main,false) then 0 else 1 end,
              case when cm.main_character_id=cm.id then 0 else 1 end,
              cm.updated_at desc nulls last,cm.id
     limit 1;
    if not found then
      return jsonb_build_object(
        'ok',false,'code','MAIN_CHARACTER_NOT_FOUND',
        'mainCharacterName',v_main_name,'mainServerId',p_main_server_id,
        'message','부캐에 연결할 기존 본캐를 해당 서버에서 확인하지 못했습니다.'
      );
    end if;
    v_main_name:=v_main.character_name;
  end if;

  -- DB368 compares ALT names without their server identity. A temporary transport
  -- value keeps a same-name cross-server pair distinct until DB455 immediately
  -- replaces every operational binding with the canonical main name below.
  v_legacy_main_name:=v_main_name;
  if v_mode='ALT' and p_target_server_id<>p_main_server_id
     and public.kinojo_character_identity_key_v298(v_target_name)=public.kinojo_character_identity_key_v298(v_main_name) then
    v_legacy_main_name:=v_main_name||'[server-'||p_main_server_id::text||']';
  end if;

  v_result:=private.kinojo_legion_tree_character_queue_prepare_v368(
    p_web_session_token,p_target_server_id,v_target_name,v_legacy_main_name,v_mode
  );
  v_code:=coalesce(v_result->>'code','');
  if coalesce((v_result->>'ok')::boolean,false) is not true
     or v_code not in ('QUEUE_READY','QUEUE_ALREADY_RUNNING') then
    return v_result;
  end if;

  v_session_id:=pg_catalog.btrim(coalesce(v_result->>'sessionId',''));
  v_session_token:=pg_catalog.btrim(coalesce(v_result->>'sessionToken',''));
  if v_session_id='' or v_session_token='' then
    raise exception 'LEGION_TREE_QUEUE_PREPARE_V454_SESSION_INVALID' using errcode='P0001';
  end if;

  select coalesce(s.raw_payload,'{}'::jsonb) into v_existing_payload
    from public.updater_sessions s
   where s.session_id=v_session_id and s.session_token=v_session_token
   for update;
  if not found then
    raise exception 'LEGION_TREE_QUEUE_PREPARE_V454_SESSION_NOT_FOUND' using errcode='P0001';
  end if;

  if v_code='QUEUE_ALREADY_RUNNING' then
    begin
      v_existing_main_server_id:=nullif(v_existing_payload->>'mainServerId','')::integer;
    exception when others then
      v_existing_main_server_id:=null;
    end;
    v_existing_main_server_id:=coalesce(v_existing_main_server_id,nullif(v_existing_payload->>'serverId','')::integer);
    v_existing_main_name:=pg_catalog.btrim(coalesce(v_existing_payload->>'mainCharacterName',''));
    if v_existing_main_server_id is distinct from p_main_server_id
       or public.kinojo_character_identity_key_v298(v_existing_main_name)<>public.kinojo_character_identity_key_v298(v_main_name) then
      return jsonb_build_object(
        'ok',false,'code','QUEUE_MAIN_IDENTITY_MISMATCH',
        'message','진행 중인 동일 대상 Queue의 본캐 이름·서버가 현재 요청과 다릅니다.',
        'sessionId',v_session_id
      );
    end if;
  end if;

  v_binding:=jsonb_build_object(
    'databaseContract','455',
    'inputContract','character-name-server-tag-v2',
    'mainServerId',p_main_server_id,
    'mainServerName',v_main_server.server_name,
    'mainCharacterName',v_main_name,
    'mainCharacterId',case when v_mode='ALT' then v_main.id else null end,
    'targetServerId',p_target_server_id,
    'targetCharacterName',v_target_name
  );

  update public.updater_sessions
     set raw_payload=coalesce(raw_payload,'{}'::jsonb)||v_binding,updated_at=now()
   where session_id=v_session_id and session_token=v_session_token;
  update public.updater_runtime_jobs
     set raw_payload=coalesce(raw_payload,'{}'::jsonb)||v_binding,updated_at=now()
   where session_id=v_session_id;
  update public.lookup_session_targets
     set main_character_name=v_main_name,
         target_source='server:legion_tree_character_add_v455',
         updated_at=now()
   where session_id=v_session_id
     and server_id=p_target_server_id
     and public.kinojo_character_identity_key_v298(character_name)=public.kinojo_character_identity_key_v298(v_target_name);
  update public.character_master cm
     set main_character_name=v_main_name,
         bootstrap_source=case when cm.bootstrap_source='legion_tree_character_add_v368' then 'legion_tree_character_add_v455' else cm.bootstrap_source end,
         updated_at=now()
   where cm.server_id=p_target_server_id
     and public.kinojo_character_identity_key_v298(cm.character_name)=public.kinojo_character_identity_key_v298(v_target_name)
     and (
       cm.bootstrap_source='legion_tree_character_add_v368'
       or public.kinojo_character_identity_key_v298(coalesce(cm.main_character_name,''))=public.kinojo_character_identity_key_v298(v_legacy_main_name)
     );
  update public.updater_runtime_events
     set payload=coalesce(payload,'{}'::jsonb)||v_binding
   where session_id=v_session_id
     and coalesce(payload,'{}'::jsonb) ? 'mainCharacterName';

  return v_result||jsonb_build_object(
    'databaseContract','455',
    'inputContract','character-name-server-tag-v2',
    'mainCharacterId',case when v_mode='ALT' then v_main.id else null end,
    'mainCharacterName',v_main_name,
    'mainServerId',p_main_server_id,
    'mainServerName',v_main_server.server_name,
    'targetSource','server:legion_tree_character_add_v455'
  );
end;
$function$;

create or replace function public.kinojo_legion_tree_character_queue_prepare_v455(
  p_web_session_token text,
  p_target_server_id integer,
  p_target_character_name text,
  p_main_server_id integer,
  p_main_character_name text,
  p_mode text
)
returns jsonb
language sql
security definer
set search_path to 'pg_catalog', 'public', 'private', 'extensions'
as $function$
  select private.kinojo_legion_tree_character_queue_prepare_v455(
    p_web_session_token,p_target_server_id,p_target_character_name,
    p_main_server_id,p_main_character_name,p_mode
  );
$function$;

revoke all on function public.kinojo_legion_tree_character_queue_prepare_v455(text,integer,text,integer,text,text) from public,anon,authenticated;
grant execute on function public.kinojo_legion_tree_character_queue_prepare_v455(text,integer,text,integer,text,text) to service_role;

create or replace function private.kinojo_legion_tree_finalize_relation_v373(p_session_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
declare
  v_target record;
  v_character public.character_master%rowtype;
  v_main public.character_master%rowtype;
  v_payload jsonb := '{}'::jsonb;
  v_main_server_id integer;
  v_main_character_id bigint;
  v_count integer := 0;
  v_main_count integer := 0;
  v_alt_count integer := 0;
begin
  if nullif(pg_catalog.btrim(coalesce(p_session_id,'')),'') is null then
    return pg_catalog.jsonb_build_object('ok',false,'code','SESSION_ID_REQUIRED','message','세션 식별값이 필요합니다.');
  end if;

  select coalesce(s.raw_payload,'{}'::jsonb) into v_payload
    from public.updater_sessions s where s.session_id=p_session_id limit 1;
  if not found then
    return pg_catalog.jsonb_build_object('ok',false,'code','SESSION_NOT_FOUND','message','관계를 확정할 세션을 찾을 수 없습니다.');
  end if;

  for v_target in
    select t.* from public.lookup_session_targets t
     where t.session_id=p_session_id
       and t.target_status='lookup_done'
       and lower(coalesce(t.target_source,'')) like 'server:legion_tree_character_add_v%'
     order by t.lookup_order,t.id
  loop
    select * into v_character from public.character_master cm
     where cm.server_id=v_target.server_id
       and public.kinojo_character_identity_key_v298(cm.character_name)=public.kinojo_character_identity_key_v298(v_target.character_name)
     order by case when cm.character_name=v_target.character_name then 0 else 1 end,
              case when coalesce(cm.is_active,true) then 0 else 1 end,
              cm.updated_at desc nulls last,cm.id desc
     limit 1;
    if not found then
      return pg_catalog.jsonb_build_object('ok',false,'code','LEGION_TREE_TARGET_MASTER_NOT_FOUND','characterName',v_target.character_name,'serverId',v_target.server_id,'message','공식 조회 완료 캐릭터를 character_master에서 확인하지 못했습니다.');
    end if;

    begin v_main_server_id:=nullif(v_payload->>'mainServerId','')::integer; exception when others then v_main_server_id:=null; end;
    begin v_main_character_id:=nullif(v_payload->>'mainCharacterId','')::bigint; exception when others then v_main_character_id:=null; end;
    v_main_server_id:=coalesce(v_main_server_id,v_target.server_id);

    if v_main_server_id=v_target.server_id
       and public.kinojo_character_identity_key_v298(coalesce(v_target.main_character_name,v_target.character_name))=public.kinojo_character_identity_key_v298(v_target.character_name) then
      update public.character_master set main_character_id=v_character.id,main_character_name=v_character.character_name,is_main=true,updated_at=now() where id=v_character.id;
      v_main_count:=v_main_count+1;
    else
      select * into v_main from public.character_master cm
       where cm.server_id=v_main_server_id
         and public.kinojo_character_identity_key_v298(cm.character_name)=public.kinojo_character_identity_key_v298(v_target.main_character_name)
         and (v_main_character_id is null or cm.id=v_main_character_id)
         and coalesce(cm.is_active,true) is true
         and coalesce(cm.visibility_excluded,false) is false
         and coalesce(cm.status,'OK') not in ('INACTIVE','DELETED')
       order by case when coalesce(cm.is_main,false) then 0 else 1 end,
                case when cm.main_character_id=cm.id then 0 else 1 end,
                cm.updated_at desc nulls last,cm.id
       limit 1;
      if not found then
        return pg_catalog.jsonb_build_object('ok',false,'code','MAIN_CHARACTER_NOT_FOUND','characterName',v_target.character_name,'mainCharacterName',v_target.main_character_name,'targetServerId',v_target.server_id,'mainServerId',v_main_server_id,'message','부캐에 연결할 기존 본캐를 해당 서버에서 확인하지 못했습니다.');
      end if;
      update public.character_master set main_character_id=v_main.id,main_character_name=v_main.character_name,is_main=true,updated_at=now() where id=v_main.id;
      update public.character_master set main_character_id=v_main.id,main_character_name=v_main.character_name,is_main=false,updated_at=now() where id=v_character.id;
      v_alt_count:=v_alt_count+1;
    end if;
    v_count:=v_count+1;
  end loop;

  return pg_catalog.jsonb_build_object('ok',true,'contract','legion-tree-relation-v2','databaseContract','455','sessionId',p_session_id,'processedCount',v_count,'mainCount',v_main_count,'altCount',v_alt_count,'mainServerId',nullif(v_payload->>'mainServerId',''),'message','레기온 트리 본캐/부캐 ID·서버 관계 확인 완료');
end;
$function$;

comment on function public.kinojo_legion_tree_character_queue_prepare_v455(text,integer,text,integer,text,text)
is 'DB455 service-role queue preparation preserving independent main/target servers for Legion Tree character add.';
comment on function private.kinojo_legion_tree_finalize_relation_v373(text)
is 'DB455-compatible relation finalizer; function identity retained for the listless and legacy orchestrators.';

create or replace function public.kinojo_legion_tree_listless_policy_v455(
  p_session_id text,
  p_session_token text
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
set statement_timeout to '5s'
set lock_timeout to '1s'
as $function$
declare
  v_valid jsonb;
  v_session public.updater_sessions%rowtype;
  v_target_count integer := 0;
  v_exact_target_count integer := 0;
  v_list_queue_count integer := 0;
  v_allowed boolean := false;
begin
  v_valid:=public.kinojo_validate_updater_session(p_session_id,p_session_token);
  if coalesce((v_valid->>'ok')::boolean,false) is not true then
    return v_valid;
  end if;

  select * into v_session
    from public.updater_sessions s
   where s.session_id=p_session_id;
  if not found then
    return jsonb_build_object('ok',false,'code','SERVER_QUEUE_SESSION_NOT_FOUND','message','Server Queue 세션을 찾지 못했습니다.');
  end if;

  select count(*),
         count(*) filter (where t.target_source='server:legion_tree_character_add_v455')
    into v_target_count,v_exact_target_count
    from public.lookup_session_targets t
   where t.session_id=p_session_id;

  select count(*) into v_list_queue_count
    from public.google_list_sheet_sync_queue q
   where q.session_id=p_session_id;

  v_allowed:=v_target_count=1
    and v_exact_target_count=1
    and coalesce(v_session.raw_payload->>'requestedSurface','')='LEGION_TREE_CHARACTER_ADD'
    and coalesce(v_session.raw_payload->>'databaseContract','')='455';

  return jsonb_build_object(
    'ok',true,
    'skipListWrite',v_allowed,
    'listlessCharacterAdd',v_allowed,
    'targetCount',v_target_count,
    'exactTargetCount',v_exact_target_count,
    'listQueueCount',v_list_queue_count,
    'targetSource',case when v_allowed then 'server:legion_tree_character_add_v455' else null end,
    'terminalStage',case when v_allowed then 'SERVER_QUEUE_CHARACTER_MASTER_DONE' else null end,
    'databaseContract','455',
    'message',case when v_allowed
      then '레기온 트리 캐릭터 추가 세션 · Google list 쓰기·readback 생략'
      else '기존 Server Queue Google list 계약 유지' end
  );
end;
$function$;

revoke all on function public.kinojo_legion_tree_listless_policy_v455(text,text) from public,anon,authenticated;
grant execute on function public.kinojo_legion_tree_listless_policy_v455(text,text) to service_role;

create or replace function public.kinojo_legion_tree_listless_complete_v455(
  p_session_id text,
  p_session_token text,
  p_worker_id text,
  p_summary jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
set statement_timeout to '15s'
set lock_timeout to '2s'
as $function$
declare
  v_valid jsonb;
  v_policy jsonb;
  v_batch public.lookup_batches%rowtype;
  v_progress jsonb;
  v_relation jsonb;
  v_summary jsonb := case when jsonb_typeof(coalesce(p_summary,'{}'::jsonb))='object' then coalesce(p_summary,'{}'::jsonb) else '{}'::jsonb end;
  v_total integer := 0;
  v_success integer := 0;
  v_failed integer := 0;
  v_skipped integer := 0;
  v_list_queue_count integer := 0;
  v_partial boolean := false;
  v_finish jsonb := '{}'::jsonb;
  v_message text;
begin
  v_valid:=public.kinojo_validate_updater_session(p_session_id,p_session_token);
  if coalesce((v_valid->>'ok')::boolean,false) is not true then
    return v_valid;
  end if;

  v_policy:=public.kinojo_legion_tree_listless_policy_v455(p_session_id,p_session_token);
  if coalesce((v_policy->>'ok')::boolean,false) is not true then
    return v_policy;
  end if;
  if coalesce((v_policy->>'skipListWrite')::boolean,false) is not true then
    return jsonb_build_object(
      'ok',false,'code','LEGION_TREE_LISTLESS_POLICY_DENIED',
      'message','이 세션은 레기온 트리 전용 list 생략 조건과 일치하지 않습니다.',
      'policy',v_policy
    );
  end if;

  select * into v_batch
    from public.lookup_batches b
   where b.session_id=p_session_id
   for update;
  if not found then
    return jsonb_build_object('ok',false,'code','SERVER_QUEUE_BATCH_NOT_FOUND','message','Server Queue Batch를 찾지 못했습니다.');
  end if;

  if v_batch.status='completed'
     and v_batch.stage='SERVER_QUEUE_CHARACTER_MASTER_DONE'
     and v_batch.list_sync_status='skipped' then
    return jsonb_build_object(
      'ok',true,'done',true,'completed',true,'postprocessComplete',true,
      'listWriteSkipped',true,'listReadbackSkipped',true,'listlessCharacterAdd',true,
      'sessionId',p_session_id,'databaseContract','455',
      'message','캐릭터 Master 반영과 관계 확정이 이미 완료되었습니다.'
    );
  end if;

  if v_batch.worker_id is distinct from left(coalesce(p_worker_id,''),160) then
    return jsonb_build_object('ok',false,'code','POSTPROCESS_WORKER_MISMATCH','message','Server 후처리 Worker가 일치하지 않습니다.');
  end if;
  if not (v_batch.postprocess_master_done and v_batch.postprocess_review_done and v_batch.postprocess_ranking_done) then
    return jsonb_build_object('ok',false,'code','POSTPROCESS_NOT_COMPLETE','message','완료되지 않은 Server 후처리 단계가 있습니다.');
  end if;
  if v_batch.postprocess_snapshot_required and not v_batch.postprocess_snapshot_publish_done then
    return jsonb_build_object('ok',false,'code','RANKING_SNAPSHOT_NOT_PUBLISHED','message','ranking snapshot 게시가 완료되지 않았습니다.');
  end if;

  select count(*) into v_list_queue_count
    from public.google_list_sheet_sync_queue q
   where q.session_id=p_session_id;
  if v_list_queue_count<>0 then
    return jsonb_build_object(
      'ok',false,'code','LEGION_TREE_LIST_QUEUE_NOT_EMPTY',
      'listQueueCount',v_list_queue_count,
      'message','listless 완료 전에 Google list Queue가 없어야 합니다.'
    );
  end if;

  v_relation:=private.kinojo_legion_tree_finalize_relation_v373(p_session_id);
  if coalesce((v_relation->>'ok')::boolean,false) is not true
     or coalesce((v_relation->>'processedCount')::integer,0)<>1 then
    return jsonb_build_object(
      'ok',false,'code','LEGION_TREE_RELATION_FINALIZE_FAILED',
      'relation',v_relation,
      'message','레기온 트리 본캐/부캐 관계 확정에 실패했습니다.'
    );
  end if;

  v_progress:=public.kinojo_lookup_progress_summary(p_session_id);
  v_total:=coalesce((v_progress->>'total')::integer,0);
  v_success:=coalesce((v_progress->>'successCount')::integer,0);
  v_failed:=coalesce((v_progress->>'finalFailedCount')::integer,0);
  v_skipped:=coalesce((v_progress->>'skippedCount')::integer,0);
  v_partial:=v_failed>0 and v_success>0;
  v_message:=case when v_partial
    then '공식 조회 부분 완료 · 성공 캐릭터의 Master·관계·랭킹 반영 완료'
    else '공식 조회와 캐릭터 Master·관계·랭킹 반영 완료' end;
  v_summary:=v_summary||jsonb_build_object(
    'source','LEGION_TREE_CHARACTER_ADD',
    'phase','CHARACTER_MASTER_COMPLETE',
    'databaseContract','455',
    'postprocessComplete',true,
    'listlessCharacterAdd',true,
    'listWriteSkipped',true,
    'listReadbackSkipped',true,
    'listSheetComplete',false,
    'partialSuccess',v_partial,
    'total',v_total,
    'successCount',v_success,
    'finalFailedCount',v_failed,
    'skippedCount',v_skipped,
    'relation',v_relation,
    'progress',v_progress
  );

  perform public.kinojo_lookup_step_upsert(
    p_session_id,'CHARACTER_MASTER_CONFIRM',6,'done',1,1,
    '캐릭터 Master·본캐/부캐 관계 확인 완료',
    jsonb_build_object(
      'source','LEGION_TREE_CHARACTER_ADD',
      'databaseContract','455',
      'listlessCharacterAdd',true,
      'listWriteSkipped',true,
      'listReadbackSkipped',true
    )
  );

  update public.lookup_batches
     set status='completed',
         stage='SERVER_QUEUE_CHARACTER_MASTER_DONE',
         message=v_message,
         worker_id=null,
         worker_lease_until=null,
         worker_last_finished_at=now(),
         postprocess_status=case when v_partial then 'partial_success' else 'completed' end,
         postprocess_stage='COMPLETE',
         postprocess_finished_at=now(),
         postprocess_last_error=null,
         postprocess_summary=coalesce(postprocess_summary,'{}'::jsonb)||v_summary,
         list_sync_status='skipped',
         list_sync_finished_at=now(),
         list_sync_last_error=null,
         list_sync_summary=jsonb_build_object(
           'databaseContract','455',
           'listlessCharacterAdd',true,
           'listWriteSkipped',true,
           'listReadbackSkipped',true,
           'queueCount',0
         ),
         finished_at=now(),
         last_heartbeat_at=now(),
         updated_at=now()
   where session_id=p_session_id;

  update public.updater_sessions
     set status='completed',
         stage='SERVER_QUEUE_CHARACTER_MASTER_DONE',
         message=v_message,
         raw_payload=coalesce(raw_payload,'{}'::jsonb)||jsonb_build_object(
           'databaseContract','455',
           'postprocessPending',false,
           'postprocessComplete',true,
           'listAppendPending',false,
           'listSheetComplete',false,
           'listlessCharacterAdd',true,
           'listWriteSkipped',true,
           'listReadbackSkipped',true
         ),
         progress_current=v_total,
         progress_total=v_total,
         finished_at=now(),
         last_heartbeat_at=now(),
         updated_at=now()
   where session_id=p_session_id;

  update public.updater_runtime_jobs
     set status='completed',
         current_stage='SERVER_QUEUE_CHARACTER_MASTER_DONE',
         message=v_message,
         progress_current=v_total,
         progress_total=v_total,
         eta_seconds=0,
         summary=coalesce(summary,'{}'::jsonb)||v_summary,
         raw_payload=coalesce(raw_payload,'{}'::jsonb)||jsonb_build_object(
           'databaseContract','455',
           'postprocessPending',false,
           'postprocessComplete',true,
           'listAppendPending',false,
           'listSheetComplete',false,
           'listlessCharacterAdd',true,
           'listWriteSkipped',true,
           'listReadbackSkipped',true
         ),
         finished_at=now(),
         last_heartbeat_at=now(),
         updated_at=now()
   where session_id=p_session_id;

  v_finish:=public.kinojo_runtime_finish(
    p_session_id,p_session_token,'completed',v_message,v_summary
  );

  return jsonb_build_object(
    'ok',true,'done',true,'completed',true,
    'postprocessComplete',true,
    'listSheetComplete',false,
    'listWriteSkipped',true,
    'listReadbackSkipped',true,
    'listlessCharacterAdd',true,
    'sessionId',p_session_id,
    'successCount',v_success,
    'finalFailedCount',v_failed,
    'skippedCount',v_skipped,
    'progress',public.kinojo_lookup_progress_summary(p_session_id),
    'relation',v_relation,
    'finish',v_finish,
    'databaseContract','455',
    'message',v_message
  );
end;
$function$;

revoke all on function public.kinojo_legion_tree_listless_complete_v455(text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.kinojo_legion_tree_listless_complete_v455(text,text,text,jsonb) to service_role;

comment on function public.kinojo_legion_tree_listless_policy_v455(text,text)
is 'DB455 service-role policy: only one exact Legion Tree v455 target may skip Google list writes.';
comment on function public.kinojo_legion_tree_listless_complete_v455(text,text,text,jsonb)
is 'DB455 atomic listless terminal transition after Master/relation/ranking completion and zero Google list queue rows.';
