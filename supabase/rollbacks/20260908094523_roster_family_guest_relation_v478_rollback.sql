-- Restores DB477 helper only; saved relationships are retained. Restores the GUEST save defect.
create or replace function private.kinojo_roster_family_save_v477(p_actor bigint,p_request_id text,p_main bigint,p_alts bigint[],p_expected jsonb)
returns jsonb language plpgsql set search_path=pg_catalog as $$
declare v_ids bigint[]; v_state jsonb; v_before jsonb:='[]'; v_payload jsonb; v_result jsonb; v_event record;
 v_group jsonb; v_root bigint; v_all bigint[]:='{}'; v_owners bigint[]; v_owner bigint; v_main public.character_master%rowtype;
begin
 if p_request_id is null or p_request_id!~'^[A-Za-z0-9_-]{16,80}$' or p_main is null or p_alts is null
 or cardinality(p_alts)>99 or jsonb_typeof(p_expected) is distinct from 'array' or jsonb_array_length(p_expected) not between 1 and 100 then
  return jsonb_build_object('ok',false,'code','FAMILY_INPUT_INVALID','message','연결할 캐릭터를 다시 확인해 주세요.');
 end if;
 v_ids:=array_append(p_alts,p_main);
 if exists(select 1 from unnest(v_ids) id where id is null or id<1) or (select count(distinct id) from unnest(v_ids) id)<>cardinality(v_ids) then
  return jsonb_build_object('ok',false,'code','FAMILY_DUPLICATE','message','같은 캐릭터를 중복 등록할 수 없습니다.'); end if;
 v_payload:=jsonb_build_object('main',p_main,'alts',to_jsonb(p_alts),'expected',p_expected);
 -- Short bounded lock also excludes concurrent worker relationship rewrites and new family members.
 lock table public.character_master in share row exclusive mode;
 select * into v_event from private.roster_family_events_v477 where actor_member_id=p_actor and request_id=p_request_id;
 if found then
  if v_event.request_payload<>v_payload then return jsonb_build_object('ok',false,'code','REQUEST_REUSED','message','요청 정보가 변경되었습니다. 다시 불러와 주세요.'); end if;
  return v_event.result||jsonb_build_object('replayed',true);
 end if;
 for v_group in select value from jsonb_array_elements(p_expected) loop
  if coalesce(v_group->>'rootId','')!~'^[1-9][0-9]{0,17}$' then return jsonb_build_object('ok',false,'code','FAMILY_INPUT_INVALID','message','다시 불러와 주세요.'); end if;
  v_root:=(v_group->>'rootId')::bigint;
  v_state:=private.kinojo_roster_family_state_v477(v_root);
  if v_state is null or v_state->>'revision' is distinct from v_group->>'revision' then
   return jsonb_build_object('ok',false,'code','FAMILY_CONFLICT','message','캐릭터 관계가 변경되었습니다. 닫은 뒤 다시 불러와 주세요.'); end if;
  v_before:=v_before||jsonb_build_array(v_state);
  v_all:=v_all||array(select (value->>'characterId')::bigint from jsonb_array_elements(v_state->'items'));
 end loop;
 if (select array_agg(id order by id) from unnest(v_all) id) is distinct from (select array_agg(id order by id) from unnest(v_ids) id) then
  return jsonb_build_object('ok',false,'code','FAMILY_INCOMPLETE','message','불러온 가족의 캐릭터를 모두 본캐·부캐 영역에 배치해 주세요.'); end if;
 if exists(select 1 from public.character_master c where c.id=any(v_ids) and (not coalesce(c.is_active,true) or coalesce(c.status,'OK')='DELETED' or coalesce(c.visibility_excluded,false))) then
  return jsonb_build_object('ok',false,'code','FAMILY_UNAVAILABLE','message','비활성 캐릭터가 포함되어 있습니다. 상태를 먼저 확인해 주세요.'); end if;
 select * into strict v_main from public.character_master where id=p_main;
 lock table public.member_codes,private.sanctuary_character_owners_v412,private.sanctuary_management_slots_v412 in share row exclusive mode;
 select array_agg(distinct id) into v_owners from (
  select m.id from public.member_codes m join public.character_master c on public.kinojo_character_identity_key_v298(m.main_character_name)=public.kinojo_character_identity_key_v298(c.character_name) where c.id=any(v_ids)
  union select o.owner_member_id from private.sanctuary_character_owners_v412 o where o.character_id=any(v_ids) and o.owner_member_id is not null
 ) owners;
 if cardinality(v_owners)>1 then return jsonb_build_object('ok',false,'code','FAMILY_OWNER_CONFLICT','message','서로 다른 회원 계정에 연결된 캐릭터입니다. 회원 연결을 먼저 확인해 주세요.'); end if;
 v_owner:=v_owners[1];
 if v_owner is not null and exists(select 1 from public.member_codes m join public.character_master c on public.kinojo_character_identity_key_v298(c.character_name)=public.kinojo_character_identity_key_v298(m.main_character_name) where m.id=v_owner and not c.id=any(v_ids)) then
  return jsonb_build_object('ok',false,'code','FAMILY_OWNER_AMBIGUOUS','message','동명이인 회원 연결이 있어 자동 변경할 수 없습니다.'); end if;
 if exists(select 1 from private.sanctuary_management_slots_v412 s where s.character_id=any(v_ids) group by s.force_id having count(*)>1) then
  return jsonb_build_object('ok',false,'code','FAMILY_FORCE_CONFLICT','message','같은 포스에 두 캐릭터가 배치되어 있습니다. 성역 배치를 먼저 정리해 주세요.'); end if;
 insert into private.roster_family_overrides_v477(character_id,main_character_id)
 select id,p_main from unnest(v_ids) id on conflict(character_id) do update set main_character_id=excluded.main_character_id,updated_at=now();
 update public.character_master set main_character_id=p_main,main_character_name=v_main.character_name,is_main=id=p_main where id=any(v_ids);
 if v_owner is not null then update public.member_codes set main_character_name=v_main.character_name where id=v_owner; end if;
 update private.sanctuary_character_owners_v412 set root_character_id=p_main,relation=case when character_id=p_main then 'MAIN' else 'ALT' end,updated_at=now() where character_id=any(v_ids);
 update private.sanctuary_management_slots_v412 set owner_root_character_id=p_main,character_relation=case when character_id=p_main then 'MAIN' else 'ALT' end,revision=revision+1 where character_id=any(v_ids);
 v_result:=jsonb_build_object('ok',true,'family',private.kinojo_roster_family_state_v477(p_main));
 insert into private.roster_family_events_v477(actor_member_id,request_id,request_payload,before_state,result) values(p_actor,p_request_id,v_payload,v_before,v_result);
 return v_result;
end $$;
