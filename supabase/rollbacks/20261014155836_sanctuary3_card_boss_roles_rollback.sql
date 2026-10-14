-- SQL537 code rollback; retain SQL536 role data.
CREATE OR REPLACE FUNCTION private.kinojo_sm_save_boss_roles_v536(p_actor bigint, p_team_id bigint, p_composition jsonb, p_request_key text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare f jsonb;s jsonb;b jsonb;code jsonb;n integer;c bigint;i integer;before_roles jsonb;after_roles jsonb;
begin
 -- Canonical command already holds the team lock and validates actor/lease/revision.
 select coalesce(jsonb_agg(to_jsonb(x) order by force_no,character_id,boss,ordinal),'[]'::jsonb) into before_roles
 from private.sanctuary_boss_roles_v536 x where team_id=p_team_id;
 if p_composition is not null then
  -- Delete the explicitly supplied force's assignments first, allowing atomic swaps.
  for f,n in select value,ordinality::integer from jsonb_array_elements(p_composition) with ordinality loop
   for s in select value from jsonb_array_elements(f->'slots') loop
    if s ? 'bossRoles' then
     b:=s->'bossRoles';c:=nullif(s->>'characterId','')::bigint;
     if jsonb_typeof(b) is distinct from 'object' or exists(select 1 from jsonb_object_keys(b) k where k not in ('boss1','boss2'))
       or jsonb_typeof(b->'boss2') is distinct from 'array' or jsonb_array_length(b->'boss2')>2 then
      raise exception '보스 역할은 1보스 1개, 2보스 최대 2개만 선택할 수 있습니다.' using errcode='22023';
     end if;
     if c is null and (coalesce(b->>'boss1','')<>'' or jsonb_array_length(b->'boss2')>0) then
      raise exception '확정된 캐릭터에만 보스 역할을 지정할 수 있습니다.' using errcode='22023';
     end if;
     if c is not null then
      if not exists(select 1 from private.sanctuary_management_slots_v412 sl join private.sanctuary_management_forces_v412 fo on fo.force_id=sl.force_id
        where sl.team_id=p_team_id and fo.force_no=n and sl.character_id=c and coalesce(sl.assignment_kind,'ACTUAL_CHARACTER')='ACTUAL_CHARACTER') then
       raise exception '역할 대상 캐릭터의 포스 편성을 다시 확인해 주세요.' using errcode='22023';
      end if;
      delete from private.sanctuary_boss_roles_v536 where team_id=p_team_id and force_no=n and character_id=c;
     end if;
    end if;
   end loop;
  end loop;
  delete from private.sanctuary_boss_roles_v536 b where b.team_id=p_team_id and not exists(
   select 1 from private.sanctuary_management_slots_v412 sl join private.sanctuary_management_forces_v412 fo on fo.force_id=sl.force_id
   where sl.team_id=b.team_id and fo.force_no=b.force_no and sl.character_id=b.character_id);
  for f,n in select value,ordinality::integer from jsonb_array_elements(p_composition) with ordinality loop
   for s in select value from jsonb_array_elements(f->'slots') loop
    if s ? 'bossRoles' then
     b:=s->'bossRoles';c:=nullif(s->>'characterId','')::bigint;
     if coalesce(b->>'boss1','')<>'' then
      if jsonb_typeof(b->'boss1')<>'string' then raise exception '1보스 역할 형식을 확인해 주세요.' using errcode='22023';end if;
      insert into private.sanctuary_boss_roles_v536 values(p_team_id,n,c,1,1,b->>'boss1');
     end if;
     i:=0;
     for code in select value from jsonb_array_elements(b->'boss2') loop
      i:=i+1;
      if jsonb_typeof(code)<>'number' or code::text !~ '^(1[0-2]|[1-9])$' then raise exception '2보스 역할은 1~12 숫자만 선택할 수 있습니다.' using errcode='22023';end if;
      insert into private.sanctuary_boss_roles_v536 values(p_team_id,n,c,2,i,code#>>'{}');
     end loop;
    end if;
   end loop;
  end loop;
 end if;
 -- Slot replacement/removal and cross-force moves release roles; same-force moves preserve them.
 delete from private.sanctuary_boss_roles_v536 b where b.team_id=p_team_id and not exists(
  select 1 from private.sanctuary_management_slots_v412 s join private.sanctuary_management_forces_v412 f on f.force_id=s.force_id
  where s.team_id=b.team_id and f.force_no=b.force_no and s.character_id=b.character_id);
 select coalesce(jsonb_agg(to_jsonb(x) order by force_no,character_id,boss,ordinal),'[]'::jsonb) into after_roles
 from private.sanctuary_boss_roles_v536 x where team_id=p_team_id;
 if before_roles is distinct from after_roles then
  perform private.kinojo_sm_audit_v412(p_actor,p_team_id,'TEAM',p_team_id,'BOSS_ROLES_SAVE',before_roles,after_roles,p_request_key);
 end if;
exception when unique_violation then
 raise exception '같은 포스의 역할은 한 캐릭터에게만 부여할 수 있습니다. 다른 캐릭터의 배정을 먼저 해제해 주세요.' using errcode='22023';
end $function$
;
CREATE OR REPLACE FUNCTION public.kinojo_sanctuary_management_command_v2(p_credential text, p_request_key text, p_action text, p_payload jsonb, p_expected_revision bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_actor jsonb;v_member bigint;v_action text:=upper(btrim(coalesce(p_action,'')));
 v_team_id bigint;v_resolved bigint;v_caps jsonb;v_before jsonb;v_after jsonb;v_result jsonb;
 v_pending bigint[];v_pending_items bigint[];v_cancelled boolean:=false;v_domain text;v_composite boolean;
begin
 v_actor:=private.kinojo_sm_actor_v412(p_credential);
 v_member:=nullif(v_actor->>'memberId','')::bigint;
 if v_member is null then raise exception '로그인 세션을 확인해 주세요.' using errcode='42501'; end if;
 if v_action not in ('CREATE_TEAM','SAVE_COMPOSITION','ADD_FORCE','SET_SLOT','MOVE_SLOT','SET_SCHEDULE',
   'EDIT_SCHEDULE','PUBLISH_TEAM','UPDATE_TEAM_DRAFT','UPDATE_FIXED_TEAM','UPDATE_PARTICIPATION_TEAM',
   'SUBMIT_SUPPORT','DECIDE_SUPPORT','CANCEL_SUPPORT','ARCHIVE_TEAM') then
   raise exception '지원하지 않는 팀 작업입니다.' using errcode='22023';
 end if;
 v_team_id:=nullif(p_payload->>'teamId','')::bigint;
 if v_action in ('DECIDE_SUPPORT','CANCEL_SUPPORT') then
   select team_id into v_resolved from private.sanctuary_management_support_batches_v412
    where support_batch_id=nullif(p_payload->>'supportBatchId','')::bigint;
 elsif v_action='SET_SLOT' then
   select team_id into v_resolved from private.sanctuary_management_forces_v412 where force_id=nullif(p_payload->>'forceId','')::bigint;
 elsif v_action='MOVE_SLOT' then
   select team_id into v_resolved from private.sanctuary_management_slots_v412 where slot_id=nullif(p_payload->>'fromSlotId','')::bigint;
 end if;
 if v_action in ('DECIDE_SUPPORT','CANCEL_SUPPORT','SET_SLOT','MOVE_SLOT') then
   if v_resolved is null or (v_team_id is not null and v_team_id<>v_resolved) then
     raise exception '팀과 포스 정보를 다시 확인해 주세요.' using errcode='22023';
   end if;
   v_team_id:=v_resolved;
 end if;
 -- Configuration changes serialize against this transaction; operator changes share the team lock.
 lock table public.sanctuary_role_permissions in share mode;
 if v_team_id is not null then
   perform 1 from private.sanctuary_management_teams_v412 where team_id=v_team_id for update;
   if not found then raise exception '팀을 찾을 수 없습니다.' using errcode='22023'; end if;
 end if;
 v_caps:=private.kinojo_sm_capabilities(v_member,v_team_id);
 v_composite:=v_action in ('SAVE_COMPOSITION','UPDATE_TEAM_DRAFT','UPDATE_FIXED_TEAM','UPDATE_PARTICIPATION_TEAM');
 if v_action='CREATE_TEAM' or (v_action='SAVE_COMPOSITION' and v_team_id is null) then
   perform private.kinojo_sm_assert_capability(v_caps,'create');
 elsif v_action in ('SUBMIT_SUPPORT','CANCEL_SUPPORT') then
   -- Existing command validates current character ownership/requester, eligibility, and duplicates.
   null;
 elsif v_composite then
   if not ((v_caps->'canEditInfo')='true'::jsonb or (v_caps->'canEditRoster')='true'::jsonb or (v_caps->'canManageSchedule')='true'::jsonb) then
     raise exception '이 팀을 편집할 권한이 없습니다.' using errcode='42501';
   end if;
   v_before:=private.kinojo_sm_permission_snapshot(v_team_id);
   select coalesce(array_agg(support_batch_id),'{}'::bigint[]) into v_pending
     from private.sanctuary_management_support_batches_v412 where team_id=v_team_id and status='PENDING';
   select coalesce(array_agg(item.support_item_id),'{}'::bigint[]) into v_pending_items
     from private.sanctuary_management_support_items_v412 item
     join private.sanctuary_management_support_batches_v412 batch on batch.support_batch_id=item.support_batch_id
     where batch.team_id=v_team_id and item.status='PENDING';
 else
   v_domain:=case when v_action in ('ADD_FORCE','SET_SLOT','MOVE_SLOT') then 'roster'
     when v_action in ('SET_SCHEDULE','EDIT_SCHEDULE') then 'schedule'
     when v_action='PUBLISH_TEAM' then 'info' when v_action='DECIDE_SUPPORT' then 'support'
     when v_action='ARCHIVE_TEAM' then 'archive' end;
   perform private.kinojo_sm_assert_capability(v_caps,v_domain);
 end if;
 v_result:=public.kinojo_sanctuary_management_command_v454(p_credential,p_request_key,v_action,p_payload,p_expected_revision);
 if coalesce((v_result->>'replayed')::boolean,false) is false then
   perform private.kinojo_sm_save_boss_roles_v536(v_member,coalesce(v_team_id,nullif(v_result->>'teamId','')::bigint),case when v_action='SAVE_COMPOSITION' then p_payload->'composition' else null end,p_request_key);
 end if;
 if v_before is not null then
   v_after:=private.kinojo_sm_permission_snapshot(v_team_id);
   select exists(select 1 from private.sanctuary_management_support_batches_v412
     where support_batch_id=any(v_pending) and status<>'PENDING')
     or exists(select 1 from private.sanctuary_management_support_items_v412
     where support_item_id=any(v_pending_items) and status<>'PENDING') into v_cancelled;
   foreach v_domain in array private.kinojo_sm_changed_domains(v_before,v_after,v_cancelled) loop
     perform private.kinojo_sm_assert_capability(v_caps,v_domain);
   end loop;
 end if;
 -- A failed postcondition raises in the SAME transaction: composition, cancellation, audit,
 -- and idempotency receipt all roll back. No external calls occur inside the delegate.
 return v_result||jsonb_build_object('permissionContract','SANCTUARY_PERMISSIONS_V2');
end;
$function$
;

