-- KINOJO DB454 · Legion Tree character-name server tags and cross-server main/alt relation
-- Forward: deploy this migration, then deploy kinojo-legion-tree API 1.4.
-- Rollback: redeploy the prior Edge source, drop public/private queue_prepare_v454,
-- and restore private.kinojo_legion_tree_finalize_relation_v373 from the DB373 source.

create or replace function private.kinojo_legion_tree_character_queue_prepare_v454(
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
       and cm.list_row is not null
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
  -- value keeps a same-name cross-server pair distinct until DB454 immediately
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
    'databaseContract','454',
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
         target_source='server:legion_tree_character_add_v454',
         updated_at=now()
   where session_id=v_session_id
     and server_id=p_target_server_id
     and public.kinojo_character_identity_key_v298(character_name)=public.kinojo_character_identity_key_v298(v_target_name);
  update public.character_master cm
     set main_character_name=v_main_name,
         bootstrap_source=case when cm.bootstrap_source='legion_tree_character_add_v368' then 'legion_tree_character_add_v454' else cm.bootstrap_source end,
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
    'databaseContract','454',
    'inputContract','character-name-server-tag-v2',
    'mainCharacterId',case when v_mode='ALT' then v_main.id else null end,
    'mainCharacterName',v_main_name,
    'mainServerId',p_main_server_id,
    'mainServerName',v_main_server.server_name,
    'targetSource','server:legion_tree_character_add_v454'
  );
end;
$function$;

create or replace function public.kinojo_legion_tree_character_queue_prepare_v454(
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
  select private.kinojo_legion_tree_character_queue_prepare_v454(
    p_web_session_token,p_target_server_id,p_target_character_name,
    p_main_server_id,p_main_character_name,p_mode
  );
$function$;

revoke all on function public.kinojo_legion_tree_character_queue_prepare_v454(text,integer,text,integer,text,text) from public,anon,authenticated;
grant execute on function public.kinojo_legion_tree_character_queue_prepare_v454(text,integer,text,integer,text,text) to service_role;

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
         and cm.list_row is not null
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

  return pg_catalog.jsonb_build_object('ok',true,'contract','legion-tree-relation-v2','databaseContract','454','sessionId',p_session_id,'processedCount',v_count,'mainCount',v_main_count,'altCount',v_alt_count,'mainServerId',nullif(v_payload->>'mainServerId',''),'message','레기온 트리 본캐/부캐 ID·서버 관계 확인 완료');
end;
$function$;

comment on function public.kinojo_legion_tree_character_queue_prepare_v454(text,integer,text,integer,text,text)
is 'DB454 service-role queue preparation preserving independent main/target servers for Legion Tree character add.';
comment on function private.kinojo_legion_tree_finalize_relation_v373(text)
is 'DB454-compatible relation finalizer; function identity retained for the existing list-sync orchestrator.';
