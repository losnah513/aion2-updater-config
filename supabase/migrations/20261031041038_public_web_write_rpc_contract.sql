-- SQL544: additive RPCs before the WEB direct-table compatibility paths close.
alter table public.hall_suggestions
  add column if not exists actor_member_id bigint,
  add column if not exists request_key text;
create unique index if not exists hall_suggestions_actor_request_v544
  on public.hall_suggestions(actor_member_id,request_key);
create index if not exists hall_suggestions_actor_created_v544
  on public.hall_suggestions(actor_member_id,created_at desc);

create or replace function public.kinojo_web_lookup_main_character_v544(
  p_name text,p_server_id integer default null
) returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public
set statement_timeout='2s' set lock_timeout='250ms'
as $function$
declare v_name text:=btrim(coalesce(p_name,''));v_count integer;
  v_character public.character_master%rowtype;v_server_name text;v_is_main boolean;
begin
  if v_name='' or char_length(v_name)>80 or (p_server_id is not null and p_server_id<=0) then
    return jsonb_build_object('ok',false,'code','CHARACTER_INPUT_INVALID','message','캐릭터 이름과 서버를 확인해 주세요.');
  end if;
  select count(*) into v_count from public.character_master c
  where coalesce(c.is_active,true) and not coalesce(c.visibility_excluded,false)
    and coalesce(c.status,'OK') not in ('DELETED','INACTIVE')
    and public.kinojo_normalize_character_name(c.character_name)=public.kinojo_normalize_character_name(v_name)
    and (p_server_id is null or c.server_id=p_server_id);
  if v_count>1 then
    return jsonb_build_object('ok',false,'code','CHARACTER_AMBIGUOUS','message','같은 이름의 캐릭터가 있습니다. 이름 뒤에 [서버]를 지정해 주세요.');
  end if;
  if v_count=1 then
    select * into strict v_character from public.character_master c
    where coalesce(c.is_active,true) and not coalesce(c.visibility_excluded,false)
      and coalesce(c.status,'OK') not in ('DELETED','INACTIVE')
      and public.kinojo_normalize_character_name(c.character_name)=public.kinojo_normalize_character_name(v_name)
      and (p_server_id is null or c.server_id=p_server_id);
    v_is_main:=coalesce(v_character.is_main,false)
      and coalesce(v_character.main_character_id,v_character.id)=v_character.id;
    return jsonb_build_object('ok',v_is_main,
      'message',case when v_is_main then null else '메인 캐릭터만 코드 발급이 가능합니다.' end,
      'character',jsonb_build_object('characterName',v_character.character_name,
        'mainCharacter',coalesce(nullif(v_character.main_character_name,''),v_character.character_name),
        'className',coalesce(v_character.class_name,''),'serverId',v_character.server_id::text,
        'serverName',coalesce(v_character.server_name,''),'role','MEMBER'));
  end if;
  select server_name into v_server_name from public.server_master where server_id=coalesce(p_server_id,2002);
  return jsonb_build_object('ok',true,'pendingCharacterMaster',true,
    'character',jsonb_build_object('characterName',v_name,'mainCharacter',v_name,
      'className','클래스 미확인','serverId',coalesce(p_server_id,2002)::text,
      'serverName',coalesce(v_server_name,''),'role','MEMBER'));
end;
$function$;

create or replace function public.kinojo_web_hall_suggestion_submit_v544(
  p_credential text,p_request_key text,p_title text,p_proposer text default '',p_memo text default ''
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public
set statement_timeout='2s' set lock_timeout='250ms'
as $function$
declare v_actor public.member_codes%rowtype;v_row public.hall_suggestions%rowtype;
  v_title text:=btrim(coalesce(p_title,''));v_proposer text:=btrim(coalesce(p_proposer,''));
  v_memo text:=btrim(coalesce(p_memo,''));v_key text:=btrim(coalesce(p_request_key,''));v_replayed boolean:=false;
begin
  select * into v_actor from public.kinojo_member_from_web_credential_v326(p_credential) limit 1;
  if not found or coalesce(v_actor.level,0)<1 or not coalesce(v_actor.can_suggest,true) then
    return jsonb_build_object('ok',false,'code','SUGGESTION_ACCESS_DENIED','message','제안 권한이 있는 로그인 계정이 필요합니다.');
  end if;
  if v_key !~ '^[A-Za-z0-9_-]{16,96}$' or v_title='' or char_length(v_title)>80
    or char_length(v_proposer)>60 or char_length(v_memo)>1000 then
    return jsonb_build_object('ok',false,'code','SUGGESTION_INPUT_INVALID','message','입력 길이와 요청 정보를 확인해 주세요.');
  end if;
  if not pg_try_advisory_xact_lock(hashtextextended('kinojo-hall-suggestion:'||v_actor.id::text,0)) then
    return jsonb_build_object('ok',false,'code','SUGGESTION_BUSY','message','앞선 요청을 처리 중입니다. 잠시 후 다시 시도해 주세요.');
  end if;
  select * into v_row from public.hall_suggestions
    where actor_member_id=v_actor.id and request_key=v_key;
  if found then
    if v_row.title is distinct from v_title or coalesce(v_row.proposer,'')<>v_proposer or coalesce(v_row.memo,'')<>v_memo then
      return jsonb_build_object('ok',false,'code','REQUEST_REUSED','message','같은 요청 정보가 변경되었습니다. 다시 확인해 주세요.');
    end if;
    v_replayed:=true;
  else
    if (select count(*) from public.hall_suggestions where actor_member_id=v_actor.id and created_at>now()-interval '1 hour')>=20 then
      return jsonb_build_object('ok',false,'code','SUGGESTION_RATE_LIMITED','message','제안 요청이 많습니다. 잠시 후 다시 시도해 주세요.');
    end if;
    insert into public.hall_suggestions(title,proposer,memo,status,actor_main_character,session_token,actor_member_id,request_key)
      values(v_title,v_proposer,v_memo,'PENDING',v_actor.main_character_name,null,v_actor.id,v_key)
      returning * into v_row;
  end if;
  return jsonb_build_object('ok',true,'message','제안이 접수되었습니다.','replayed',v_replayed,
    'suggestion',jsonb_build_object('id',v_row.id,'status',v_row.status,'createdAt',v_row.created_at));
end;
$function$;
revoke all on function public.kinojo_web_lookup_main_character_v544(text,integer),
  public.kinojo_web_hall_suggestion_submit_v544(text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.kinojo_web_lookup_main_character_v544(text,integer),
  public.kinojo_web_hall_suggestion_submit_v544(text,text,text,text,text) to anon,authenticated,service_role;
