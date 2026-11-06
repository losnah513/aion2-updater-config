-- Read-only production catalog definitions; no user rows, tokens or credentials.
CREATE OR REPLACE FUNCTION public.kinojo_sanctuary_management_command_v2(p_credential text, p_request_key text, p_action text, p_payload jsonb, p_expected_revision bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_actor jsonb;v_member bigint;v_action text:=upper(btrim(coalesce(p_action,'')));
 v_team_id bigint;v_resolved bigint;v_caps jsonb;v_before jsonb;v_after jsonb;v_result jsonb;
 v_hash text;v_receipt private.sanctuary_management_commands_v412%rowtype;v_revision bigint;v_force_no integer;v_role_composition jsonb;
 v_pending bigint[];v_pending_items bigint[];v_cancelled boolean:=false;v_domain text;v_composite boolean;
begin
 v_actor:=private.kinojo_sm_actor_v412(p_credential);
 v_member:=nullif(v_actor->>'memberId','')::bigint;
 if v_member is null then raise exception '로그인 세션을 확인해 주세요.' using errcode='42501'; end if;
 if v_action not in ('CREATE_TEAM','SAVE_COMPOSITION','ADD_FORCE','SET_SLOT','MOVE_SLOT','SET_SCHEDULE',
   'EDIT_SCHEDULE','PUBLISH_TEAM','UPDATE_TEAM_DRAFT','UPDATE_FIXED_TEAM','UPDATE_PARTICIPATION_TEAM',
   'SUBMIT_SUPPORT','DECIDE_SUPPORT','CANCEL_SUPPORT','ARCHIVE_TEAM','SET_BOSS_ROLES') then
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
   v_domain:=case when v_action in ('ADD_FORCE','SET_SLOT','MOVE_SLOT','SET_BOSS_ROLES') then 'roster'
     when v_action in ('SET_SCHEDULE','EDIT_SCHEDULE') then 'schedule'
     when v_action='PUBLISH_TEAM' then 'info' when v_action='DECIDE_SUPPORT' then 'support'
     when v_action='ARCHIVE_TEAM' then 'archive' end;
   perform private.kinojo_sm_assert_capability(v_caps,v_domain);
 end if;

 -- Role-only update: same authenticated command, lease, revision and receipt boundary.
 if v_action='SET_BOSS_ROLES' then
   perform private.kinojo_sm_assert_pilot_write_v439(p_credential,v_action);
   if v_team_id is null or not exists(select 1 from private.sanctuary_management_teams_v412 t
     join public.sanctuary_master m on m.id=t.sanctuary_id where t.team_id=v_team_id and m.code='kaldrix' and t.status in ('ACTIVE','FULL')) then
     raise exception '역할 부여는 성역3의 운영 중인 팀에서만 사용할 수 있습니다.' using errcode='22023';
   end if;
   if btrim(coalesce(p_request_key,'')) !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,119}$' then
     raise exception '요청 키를 다시 확인해 주세요.' using errcode='22023';
   end if;
   v_hash:=encode(sha256(convert_to(v_action||':'||coalesce(p_payload,'{}'::jsonb)::text,'UTF8')),'hex');
   perform pg_advisory_xact_lock(hashtextextended('sanctuary-management:'||v_member||':'||btrim(p_request_key),446));
   select * into v_receipt from private.sanctuary_management_commands_v412
     where actor_member_id=v_member and request_key=btrim(p_request_key);
   if v_receipt.command_id is not null then
     if v_receipt.action<>v_action or v_receipt.request_hash<>v_hash then
       raise exception '같은 요청 키가 다른 작업에 사용되었습니다.' using errcode='22023';
     end if;
     return v_receipt.response_payload||jsonb_build_object('replayed',true,'permissionContract','SANCTUARY_PERMISSIONS_V2');
   end if;
   select revision into v_revision from private.sanctuary_management_teams_v412 where team_id=v_team_id;
   if p_expected_revision is null or v_revision<>p_expected_revision then
     raise exception '다른 사용자가 먼저 팀을 수정했습니다. 새로고침 후 다시 시도해 주세요.' using errcode='40001';
   end if;
   perform private.kinojo_sm_assert_lease_v433(v_member,v_team_id,p_payload->>'leaseToken');
   select f.force_no into v_force_no from private.sanctuary_management_forces_v412 f
     join private.sanctuary_management_slots_v412 s on s.force_id=f.force_id and s.team_id=f.team_id
     where f.team_id=v_team_id and f.force_id=nullif(p_payload->>'forceId','')::bigint
       and s.slot_id=nullif(p_payload->>'slotId','')::bigint
       and s.character_id=nullif(p_payload->>'characterId','')::bigint
       and coalesce(s.assignment_kind,'ACTUAL_CHARACTER')='ACTUAL_CHARACTER';
   if v_force_no is null or jsonb_typeof(p_payload->'bossRoles') is distinct from 'object' then
     raise exception '역할 대상 캐릭터와 포스를 다시 확인해 주세요.' using errcode='22023';
   end if;
   select jsonb_agg(jsonb_build_object('slots',case when n=v_force_no then
     jsonb_build_array(jsonb_build_object('characterId',p_payload->'characterId','bossRoles',p_payload->'bossRoles')) else '[]'::jsonb end) order by n)
     into v_role_composition from generate_series(1,v_force_no) n;
   perform private.kinojo_sm_save_boss_roles_v536(v_member,v_team_id,v_role_composition,btrim(p_request_key));
   update private.sanctuary_management_teams_v412 set revision=revision+1,updated_at=clock_timestamp()
     where team_id=v_team_id returning revision into v_revision;
   v_result:=jsonb_build_object('ok',true,'action',v_action,'teamId',v_team_id,'revision',v_revision,
     'bossRoles',private.kinojo_sm_boss_roles_v536(v_team_id,v_force_no,nullif(p_payload->>'characterId','')::bigint),
     'replayed',false,'permissionContract','SANCTUARY_PERMISSIONS_V2');
   insert into private.sanctuary_management_commands_v412(actor_member_id,request_key,action,request_hash,response_payload)
     values(v_member,btrim(p_request_key),v_action,v_hash,v_result);
   return v_result;
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
CREATE OR REPLACE FUNCTION public.kinojo_sanctuary_management_command_v412(p_credential text, p_request_key text, p_action text, p_payload jsonb DEFAULT '{}'::jsonb, p_expected_revision bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_actor jsonb; v_actor_id bigint; v_action text:=upper(btrim(coalesce(p_action,''))); v_request_key text:=btrim(coalesce(p_request_key,''));
  v_hash text; v_existing record; v_response jsonb; v_team private.sanctuary_management_teams_v412%rowtype;
  v_team_id bigint; v_force_id bigint; v_force_no smallint; v_party_no smallint; v_slot_no smallint; v_slot_id bigint;
  v_schedule_id bigint; v_sanctuary public.sanctuary_master%rowtype; v_owner record; v_conflicts jsonb; v_before jsonb;
  v_mode text; v_policy text; v_kind text; v_starts_on date; v_weekdays smallint[]; v_starts_at time; v_duration integer;
  v_character_id bigint; v_force_ids bigint[]; v_character_ids bigint[]; v_i integer; v_batch_id bigint;
begin
  v_actor:=private.kinojo_sm_actor_v412(p_credential); v_actor_id:=nullif(v_actor->>'memberId','')::bigint;
  perform private.kinojo_sm_assert_write_enabled_v412();
  if char_length(v_request_key) not between 8 and 120 then raise exception '요청 키가 올바르지 않습니다.' using errcode='P0001'; end if;
  if v_action not in ('CREATE_TEAM','ADD_FORCE','SET_SCHEDULE','SET_SLOT','PUBLISH_TEAM','SUBMIT_SUPPORT','DECIDE_SUPPORT','ARCHIVE_TEAM') then
    raise exception '지원하지 않는 성역 관리 작업입니다.' using errcode='P0001';
  end if;
  v_hash:=encode(sha256(convert_to(v_action||':'||coalesce(p_payload,'{}'::jsonb)::text,'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended('sanctuary-management:'||v_actor_id||':'||v_request_key,412));
  select * into v_existing from private.sanctuary_management_commands_v412 where actor_member_id=v_actor_id and request_key=v_request_key;
  if v_existing.command_id is not null then
    if v_existing.request_hash<>v_hash or v_existing.action<>v_action then raise exception '같은 요청 키가 다른 작업에 사용되었습니다.' using errcode='P0001'; end if;
    return v_existing.response_payload||jsonb_build_object('replayed',true);
  end if;

  if v_action='CREATE_TEAM' then
    select * into v_sanctuary from public.sanctuary_master where code=btrim(p_payload->>'sanctuaryCode') and management_visible;
    if v_sanctuary.id is null then raise exception '선택한 성역을 찾을 수 없습니다.' using errcode='P0001'; end if;
    v_mode:=upper(coalesce(p_payload->>'mode',''));
    v_policy:=upper(coalesce(p_payload->>'joinPolicy','INSTANT'));
    v_kind:=upper(coalesce(p_payload->'schedule'->>'kind',''));
    v_starts_on=nullif(p_payload->'schedule'->>'startsOn','')::date;
    v_weekdays=coalesce(array(select jsonb_array_elements_text(coalesce(p_payload->'schedule'->'weekdays','[]'::jsonb))::smallint),'{}'::smallint[]);
    v_starts_at=nullif(p_payload->'schedule'->>'startsAt','')::time;
    v_duration=coalesce(nullif(p_payload->'schedule'->>'durationMinutes','')::integer,30);
    if v_starts_on is null or v_starts_at is null then raise exception '팀 일정의 날짜와 시작 시각이 필요합니다.' using errcode='P0001'; end if;
    if v_sanctuary.available_from is not null and v_starts_on<v_sanctuary.available_from then raise exception '% 일정은 %부터 등록할 수 있습니다.',v_sanctuary.short_name,v_sanctuary.available_from using errcode='P0001'; end if;
    insert into private.sanctuary_management_teams_v412(sanctuary_id,title,activity,team_mode,join_policy,creator_member_id)
    values(v_sanctuary.id,btrim(p_payload->>'title'),btrim(p_payload->>'activity'),v_mode,case when v_mode='FIXED' then 'INSTANT' else v_policy end,v_actor_id)
    returning * into v_team;
    v_team_id:=v_team.team_id;
    perform private.kinojo_sm_seed_force_v412(v_team_id,1);
    insert into private.sanctuary_management_schedule_rules_v412(team_id,schedule_kind,starts_on,weekdays,starts_at,duration_minutes)
    values(v_team_id,v_kind,v_starts_on,v_weekdays,v_starts_at,v_duration) returning schedule_id into v_schedule_id;
    v_response:=jsonb_build_object('ok',true,'action',v_action,'teamId',v_team_id,'scheduleId',v_schedule_id,'revision',v_team.revision);
    perform private.kinojo_sm_audit_v412(v_actor_id,v_team_id,'TEAM',v_team_id,v_action,null,to_jsonb(v_team),v_request_key);

  elsif v_action='ADD_FORCE' then
    v_team_id=(p_payload->>'teamId')::bigint;
    select * into v_team from private.sanctuary_management_teams_v412 where team_id=v_team_id for update;
    if v_team.team_id is null or not private.kinojo_sm_can_manage_team_v412(v_actor,v_team_id) then raise exception '팀을 수정할 권한이 없습니다.' using errcode='P0001'; end if;
    if v_team.status='ARCHIVED' then raise exception '해산된 팀은 수정할 수 없습니다.' using errcode='P0001'; end if;
    if p_expected_revision is not null and v_team.revision<>p_expected_revision then raise exception '다른 사용자가 먼저 팀을 수정했습니다. 새로고침 후 다시 시도해 주세요.' using errcode='40001'; end if;
    select coalesce(max(force_no),0)+1 into v_force_no from private.sanctuary_management_forces_v412 where team_id=v_team_id;
    if v_force_no>9 then raise exception '팀당 포스는 최대 9개입니다.' using errcode='P0001'; end if;
    v_force_id:=private.kinojo_sm_seed_force_v412(v_team_id,v_force_no);
    update private.sanctuary_management_teams_v412 set updated_at=clock_timestamp() where team_id=v_team_id returning revision into p_expected_revision;
    v_response:=jsonb_build_object('ok',true,'action',v_action,'teamId',v_team_id,'forceId',v_force_id,'forceNo',v_force_no,'revision',p_expected_revision);
    perform private.kinojo_sm_audit_v412(v_actor_id,v_team_id,'FORCE',v_force_id,v_action,null,v_response,v_request_key);

  elsif v_action='SET_SCHEDULE' then
    v_team_id=(p_payload->>'teamId')::bigint;
    select * into v_team from private.sanctuary_management_teams_v412 where team_id=v_team_id for update;
    if v_team.team_id is null or not private.kinojo_sm_can_manage_team_v412(v_actor,v_team_id) then raise exception '팀 일정을 수정할 권한이 없습니다.' using errcode='P0001'; end if;
    if v_team.status='ARCHIVED' then raise exception '해산된 팀은 수정할 수 없습니다.' using errcode='P0001'; end if;
    if p_expected_revision is not null and v_team.revision<>p_expected_revision then raise exception '다른 사용자가 먼저 팀을 수정했습니다. 새로고침 후 다시 시도해 주세요.' using errcode='40001'; end if;
    v_kind:=upper(coalesce(p_payload->>'kind','')); v_starts_on=nullif(p_payload->>'startsOn','')::date;
    v_weekdays=coalesce(array(select jsonb_array_elements_text(coalesce(p_payload->'weekdays','[]'::jsonb))::smallint),'{}'::smallint[]);
    v_starts_at=nullif(p_payload->>'startsAt','')::time; v_duration=coalesce(nullif(p_payload->>'durationMinutes','')::integer,30);
    select s.* into v_sanctuary from public.sanctuary_master s where s.id=v_team.sanctuary_id;
    if v_sanctuary.available_from is not null and v_starts_on<v_sanctuary.available_from then raise exception '% 일정은 %부터 등록할 수 있습니다.',v_sanctuary.short_name,v_sanctuary.available_from using errcode='P0001'; end if;
    select to_jsonb(s),s.schedule_id into v_before,v_schedule_id from private.sanctuary_management_schedule_rules_v412 s where team_id=v_team_id for update;
    update private.sanctuary_management_schedule_rules_v412 set schedule_kind=v_kind,starts_on=v_starts_on,weekdays=v_weekdays,starts_at=v_starts_at,duration_minutes=v_duration,status='ACTIVE' where schedule_id=v_schedule_id;
    select coalesce(jsonb_agg(c),'[]'::jsonb) into v_conflicts from (
      select private.kinojo_sm_conflicts_for_participant_v412(v_team_id,s.owner_member_id,s.owner_root_character_id) c
      from private.sanctuary_management_slots_v412 s where s.team_id=v_team_id and s.character_id is not null
    ) q where c<>'[]'::jsonb;
    if coalesce(jsonb_array_length(v_conflicts),0)>0 then raise exception '현재 구성원과 겹치는 다른 팀 일정이 있습니다.' using errcode='P0001',detail=v_conflicts::text; end if;
    update private.sanctuary_management_teams_v412 set updated_at=clock_timestamp() where team_id=v_team_id returning revision into p_expected_revision;
    v_response:=jsonb_build_object('ok',true,'action',v_action,'teamId',v_team_id,'revision',p_expected_revision);
    perform private.kinojo_sm_audit_v412(v_actor_id,v_team_id,'SCHEDULE',v_schedule_id,v_action,v_before,p_payload,v_request_key);

  elsif v_action='SET_SLOT' then
    v_team_id=(p_payload->>'teamId')::bigint; v_force_id=(p_payload->>'forceId')::bigint; v_party_no=(p_payload->>'partyNo')::smallint; v_slot_no=(p_payload->>'slotNo')::smallint;
    select * into v_team from private.sanctuary_management_teams_v412 where team_id=v_team_id for update;
    if v_team.team_id is null or not private.kinojo_sm_can_manage_team_v412(v_actor,v_team_id) then raise exception '팀 편성을 수정할 권한이 없습니다.' using errcode='P0001'; end if;
    if v_team.status='ARCHIVED' then raise exception '해산된 팀은 수정할 수 없습니다.' using errcode='P0001'; end if;
    if p_expected_revision is not null and v_team.revision<>p_expected_revision then raise exception '다른 사용자가 먼저 팀을 수정했습니다. 새로고침 후 다시 시도해 주세요.' using errcode='40001'; end if;
    select s.slot_id,to_jsonb(s) into v_slot_id,v_before from private.sanctuary_management_slots_v412 s join private.sanctuary_management_parties_v412 p on p.party_id=s.party_id where s.team_id=v_team_id and s.force_id=v_force_id and p.party_no=v_party_no and s.slot_no=v_slot_no for update of s;
    if v_slot_id is null then raise exception '선택한 슬롯을 찾을 수 없습니다.' using errcode='P0001'; end if;
    if p_payload->>'characterId' is null then
      update private.sanctuary_management_slots_v412 set character_id=null,owner_member_id=null,owner_root_character_id=null,character_relation=null,added_by_member_id=v_actor_id where slot_id=v_slot_id;
    else
      v_character_id=(p_payload->>'characterId')::bigint;
      select * into v_owner from private.kinojo_sm_resolve_character_owner_v412(v_character_id);
      if v_owner.character_id is null then raise exception '캐릭터를 찾을 수 없습니다.' using errcode='P0001'; end if;
      v_conflicts:=private.kinojo_sm_conflicts_for_participant_v412(v_team_id,v_owner.owner_member_id,v_owner.root_character_id);
      if jsonb_array_length(v_conflicts)>0 then raise exception '%',v_conflicts->0->>'message' using errcode='P0001',detail=v_conflicts::text; end if;
      update private.sanctuary_management_slots_v412 set character_id=v_character_id,owner_member_id=v_owner.owner_member_id,owner_root_character_id=v_owner.root_character_id,character_relation=case when v_owner.owner_member_id is null then 'GUEST' else v_owner.relation end,added_by_member_id=v_actor_id where slot_id=v_slot_id;
    end if;
    perform private.kinojo_sm_recompute_status_v412(v_team_id);
    update private.sanctuary_management_teams_v412 set updated_at=clock_timestamp() where team_id=v_team_id returning revision into p_expected_revision;
    v_response:=jsonb_build_object('ok',true,'action',v_action,'teamId',v_team_id,'slotId',v_slot_id,'revision',p_expected_revision);
    perform private.kinojo_sm_audit_v412(v_actor_id,v_team_id,'SLOT',v_slot_id,v_action,v_before,(select to_jsonb(s) from private.sanctuary_management_slots_v412 s where s.slot_id=v_slot_id),v_request_key);

  elsif v_action='PUBLISH_TEAM' then
    v_team_id=(p_payload->>'teamId')::bigint;
    select * into v_team from private.sanctuary_management_teams_v412 where team_id=v_team_id for update;
    if v_team.team_id is null or not private.kinojo_sm_can_manage_team_v412(v_actor,v_team_id) then raise exception '팀을 공개할 권한이 없습니다.' using errcode='P0001'; end if;
    if not exists(select 1 from private.sanctuary_management_slots_v412 where team_id=v_team_id and character_id is not null) then raise exception '최소 팀 생성자의 캐릭터 1개를 추가해야 합니다.' using errcode='P0001'; end if;
    if v_team.team_mode='PARTICIPATION' and exists(select 1 from private.sanctuary_management_forces_v412 f where f.team_id=v_team_id and not exists(select 1 from private.sanctuary_management_slots_v412 s where s.force_id=f.force_id and s.owner_member_id=v_team.creator_member_id)) then raise exception '참여 팀은 포스마다 생성자의 캐릭터 1개가 필요합니다.' using errcode='P0001'; end if;
    update private.sanctuary_management_teams_v412 set published_at=coalesce(published_at,clock_timestamp()),status='ACTIVE' where team_id=v_team_id returning revision into p_expected_revision;
    perform private.kinojo_sm_recompute_status_v412(v_team_id);
    v_response:=jsonb_build_object('ok',true,'action',v_action,'teamId',v_team_id,'revision',p_expected_revision);
    perform private.kinojo_sm_audit_v412(v_actor_id,v_team_id,'TEAM',v_team_id,v_action,to_jsonb(v_team),v_response,v_request_key);

  elsif v_action='SUBMIT_SUPPORT' then
    v_team_id=(p_payload->>'teamId')::bigint;
    select * into v_team from private.sanctuary_management_teams_v412 where team_id=v_team_id for update;
    if v_team.team_id is null or v_team.team_mode<>'PARTICIPATION' or v_team.status not in ('ACTIVE','FULL') then raise exception '현재 지원할 수 없는 팀입니다.' using errcode='P0001'; end if;
    v_force_ids=array(select jsonb_array_elements_text(coalesce(p_payload->'forceIds','[]'::jsonb))::bigint);
    v_character_ids=array(select jsonb_array_elements_text(coalesce(p_payload->'characterIds','[]'::jsonb))::bigint);
    if cardinality(v_force_ids)=0 or cardinality(v_force_ids)<>cardinality(v_character_ids) or cardinality(v_force_ids)>9 then raise exception '포스 수와 캐릭터 수를 같게 선택해 주세요.' using errcode='P0001'; end if;
    if cardinality(array(select distinct x from unnest(v_force_ids) x))<>cardinality(v_force_ids) or cardinality(array(select distinct x from unnest(v_character_ids) x))<>cardinality(v_character_ids) then raise exception '포스와 캐릭터는 중복 선택할 수 없습니다.' using errcode='P0001'; end if;
    insert into private.sanctuary_management_support_batches_v412(team_id,requester_member_id,request_key,status)
    values(v_team_id,v_actor_id,v_request_key,case when v_team.join_policy='INSTANT' then 'APPLIED' else 'PENDING' end) returning support_batch_id into v_batch_id;
    for v_i in 1..cardinality(v_force_ids) loop
      v_force_id:=v_force_ids[v_i]; v_character_id:=v_character_ids[v_i];
      if not exists(select 1 from private.sanctuary_management_forces_v412 where force_id=v_force_id and team_id=v_team_id and status='OPEN') then raise exception '선택한 포스는 지원할 수 없습니다.' using errcode='P0001'; end if;
      select * into v_owner from private.kinojo_sm_resolve_character_owner_v412(v_character_id);
      if v_owner.owner_member_id is distinct from v_actor_id then raise exception '본인이 소유한 캐릭터만 지원할 수 있습니다.' using errcode='P0001'; end if;
      v_conflicts:=private.kinojo_sm_conflicts_for_participant_v412(v_team_id,v_owner.owner_member_id,v_owner.root_character_id);
      if jsonb_array_length(v_conflicts)>0 then raise exception '%',v_conflicts->0->>'message' using errcode='P0001',detail=v_conflicts::text; end if;
      v_slot_id:=null;
      if v_team.join_policy='INSTANT' then
        select s.slot_id into v_slot_id from private.sanctuary_management_slots_v412 s where s.force_id=v_force_id and s.character_id is null order by s.party_id,s.slot_no limit 1 for update skip locked;
        if v_slot_id is null then raise exception '선택한 포스의 빈자리가 없습니다.' using errcode='P0001'; end if;
        update private.sanctuary_management_slots_v412 set character_id=v_character_id,owner_member_id=v_actor_id,owner_root_character_id=v_owner.root_character_id,character_relation=v_owner.relation,added_by_member_id=v_actor_id where slot_id=v_slot_id;
      end if;
      insert into private.sanctuary_management_support_items_v412(support_batch_id,force_id,character_id,owner_member_id,owner_root_character_id,status,applied_slot_id)
      values(v_batch_id,v_force_id,v_character_id,v_actor_id,v_owner.root_character_id,case when v_team.join_policy='INSTANT' then 'APPLIED' else 'PENDING' end,v_slot_id);
    end loop;
    perform private.kinojo_sm_recompute_status_v412(v_team_id);
    v_response:=jsonb_build_object('ok',true,'action',v_action,'teamId',v_team_id,'supportBatchId',v_batch_id,'status',case when v_team.join_policy='INSTANT' then 'APPLIED' else 'PENDING' end);
    perform private.kinojo_sm_audit_v412(v_actor_id,v_team_id,'SUPPORT_BATCH',v_batch_id,v_action,null,v_response,v_request_key);

  elsif v_action='DECIDE_SUPPORT' then
    v_batch_id=(p_payload->>'supportBatchId')::bigint;
    select t.* into v_team from private.sanctuary_management_support_batches_v412 b join private.sanctuary_management_teams_v412 t on t.team_id=b.team_id where b.support_batch_id=v_batch_id for update of t;
    if v_team.team_id is null or not private.kinojo_sm_can_manage_team_v412(v_actor,v_team.team_id) then raise exception '지원 요청을 처리할 권한이 없습니다.' using errcode='P0001'; end if;
    if upper(coalesce(p_payload->>'decision',''))='REJECT' then
      update private.sanctuary_management_support_items_v412 set status='REJECTED' where support_batch_id=v_batch_id and status='PENDING';
      update private.sanctuary_management_support_batches_v412 set status='REJECTED',decision_member_id=v_actor_id,decision_note=left(p_payload->>'note',240),decided_at=clock_timestamp() where support_batch_id=v_batch_id and status='PENDING';
    elsif upper(coalesce(p_payload->>'decision',''))='APPROVE' then
      for v_owner in select * from private.sanctuary_management_support_items_v412 where support_batch_id=v_batch_id and status='PENDING' order by support_item_id for update loop
        v_conflicts:=private.kinojo_sm_conflicts_for_participant_v412(v_team.team_id,v_owner.owner_member_id,v_owner.owner_root_character_id);
        if jsonb_array_length(v_conflicts)>0 then raise exception '%',v_conflicts->0->>'message' using errcode='P0001',detail=v_conflicts::text; end if;
        select slot_id into v_slot_id from private.sanctuary_management_slots_v412 where force_id=v_owner.force_id and character_id is null order by party_id,slot_no limit 1 for update skip locked;
        if v_slot_id is null then raise exception '지원한 포스의 빈자리가 없습니다.' using errcode='P0001'; end if;
        update private.sanctuary_management_slots_v412 set character_id=v_owner.character_id,owner_member_id=v_owner.owner_member_id,owner_root_character_id=v_owner.owner_root_character_id,character_relation=(select relation from private.kinojo_sm_resolve_character_owner_v412(v_owner.character_id)),added_by_member_id=v_actor_id where slot_id=v_slot_id;
        update private.sanctuary_management_support_items_v412 set status='APPLIED',applied_slot_id=v_slot_id where support_item_id=v_owner.support_item_id;
      end loop;
      update private.sanctuary_management_support_batches_v412 set status='APPLIED',decision_member_id=v_actor_id,decision_note=left(p_payload->>'note',240),decided_at=clock_timestamp() where support_batch_id=v_batch_id and status='PENDING';
    else raise exception '승인 또는 거절을 선택해 주세요.' using errcode='P0001'; end if;
    perform private.kinojo_sm_recompute_status_v412(v_team.team_id);
    v_response:=jsonb_build_object('ok',true,'action',v_action,'teamId',v_team.team_id,'supportBatchId',v_batch_id,'decision',upper(p_payload->>'decision'));
    perform private.kinojo_sm_audit_v412(v_actor_id,v_team.team_id,'SUPPORT_BATCH',v_batch_id,v_action,null,v_response,v_request_key);

  elsif v_action='ARCHIVE_TEAM' then
    v_team_id=(p_payload->>'teamId')::bigint;
    select * into v_team from private.sanctuary_management_teams_v412 where team_id=v_team_id for update;
    if v_team.team_id is null or not private.kinojo_sm_can_manage_team_v412(v_actor,v_team_id) then raise exception '팀을 해산할 권한이 없습니다.' using errcode='P0001'; end if;
    if v_team.status='ARCHIVED' then raise exception '이미 해산된 팀입니다.' using errcode='P0001'; end if;
    update private.sanctuary_management_teams_v412 set status='ARCHIVED',archived_at=clock_timestamp(),archived_by_member_id=v_actor_id,archive_reason=left(coalesce(p_payload->>'reason',''),240) where team_id=v_team_id returning revision into p_expected_revision;
    update private.sanctuary_management_schedule_rules_v412 set status='STOPPED' where team_id=v_team_id;
    update private.sanctuary_management_support_items_v412 i set status='CANCELLED' from private.sanctuary_management_support_batches_v412 b where b.support_batch_id=i.support_batch_id and b.team_id=v_team_id and i.status='PENDING';
    update private.sanctuary_management_support_batches_v412 set status='CANCELLED',decision_member_id=v_actor_id,decided_at=clock_timestamp() where team_id=v_team_id and status='PENDING';
    delete from private.sanctuary_management_edit_leases_v412 where team_id=v_team_id;
    v_response:=jsonb_build_object('ok',true,'action',v_action,'teamId',v_team_id,'status','ARCHIVED','revision',p_expected_revision);
    perform private.kinojo_sm_audit_v412(v_actor_id,v_team_id,'TEAM',v_team_id,v_action,to_jsonb(v_team),v_response,v_request_key);
  end if;

  insert into private.sanctuary_management_commands_v412(actor_member_id,request_key,action,request_hash,response_payload)
  values(v_actor_id,v_request_key,v_action,v_hash,v_response);
  return v_response||jsonb_build_object('replayed',false);
end
$function$
;
CREATE OR REPLACE FUNCTION public.kinojo_sanctuary_management_command_v446(p_credential text, p_request_key text, p_action text, p_payload jsonb, p_expected_revision bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_action text := upper(btrim(coalesce(p_action, '')));
  v_request_key text := btrim(coalesce(p_request_key, ''));
  v_actor jsonb;
  v_actor_id bigint;
  v_hash text;
  v_existing private.sanctuary_management_commands_v412%rowtype;
  v_team private.sanctuary_management_teams_v412%rowtype;
  v_sanctuary public.sanctuary_master%rowtype;
  v_owner record;
  v_team_id bigint;
  v_force_id bigint;
  v_party_id bigint;
  v_character_id bigint;
  v_desired_count integer;
  v_current_count integer;
  v_force_no integer;
  v_party_no integer;
  v_slot_no integer;
  v_mode text;
  v_policy text;
  v_kind text;
  v_starts_on date;
  v_weekdays smallint[];
  v_starts_at time;
  v_duration integer;
  v_composition jsonb;
  v_force_json jsonb;
  v_slot_json jsonb;
  v_before jsonb;
  v_after jsonb;
  v_conflicts jsonb;
  v_response jsonb;
  v_created boolean := false;
  v_sub_key text;
begin
  if v_action <> 'SAVE_COMPOSITION' then
    return public.kinojo_sanctuary_management_command_v445(p_credential,p_request_key,p_action,p_payload,p_expected_revision)
      || jsonb_build_object('apiVersion',1.8,'schemaVersion',446,'databaseContract',446);
  end if;

  perform private.kinojo_sm_assert_pilot_write_v439(p_credential, v_action);
  v_actor := private.kinojo_sm_actor_v412(p_credential);
  v_actor_id := nullif(v_actor->>'memberId', '')::bigint;
  if v_actor_id is null then raise exception '로그인 후 팀을 저장해 주세요.' using errcode='P0001'; end if;
  if char_length(v_request_key) not between 8 and 120 then raise exception '요청 키가 올바르지 않습니다.' using errcode='P0001'; end if;
  if jsonb_typeof(coalesce(p_payload, '{}'::jsonb)) <> 'object' then raise exception '팀 저장 형식이 올바르지 않습니다.' using errcode='P0001'; end if;

  v_hash := encode(sha256(convert_to(v_action||':'||coalesce(p_payload,'{}'::jsonb)::text, 'UTF8')), 'hex');
  perform pg_advisory_xact_lock(hashtextextended('sanctuary-management:'||v_actor_id||':'||v_request_key,446));
  select * into v_existing from private.sanctuary_management_commands_v412 where actor_member_id=v_actor_id and request_key=v_request_key;
  if v_existing.command_id is not null then
    if v_existing.action<>v_action or v_existing.request_hash<>v_hash then raise exception '같은 요청 키가 다른 작업에 사용되었습니다.' using errcode='P0001'; end if;
    return v_existing.response_payload||jsonb_build_object('replayed',true,'apiVersion',1.8,'schemaVersion',446,'databaseContract',446);
  end if;

  v_mode := upper(btrim(coalesce(p_payload->>'mode','')));
  v_policy := upper(btrim(coalesce(p_payload->>'joinPolicy','INSTANT')));
  if v_mode not in ('FIXED','PARTICIPATION') or v_policy not in ('INSTANT','APPROVAL') then raise exception '고정·참여 팀과 참가 방식을 다시 선택해 주세요.' using errcode='P0001'; end if;
  if v_mode='FIXED' then v_policy:='INSTANT'; end if;
  if char_length(btrim(coalesce(p_payload->>'title',''))) not between 1 and 80 then raise exception '팀 이름을 1자 이상 80자 이하로 입력해 주세요.' using errcode='P0001'; end if;
  if char_length(btrim(coalesce(p_payload->>'activity',''))) not between 1 and 24 then raise exception '팀 이름을 다시 확인해 주세요.' using errcode='P0001'; end if;

  select * into v_sanctuary from public.sanctuary_master where code=btrim(p_payload->>'sanctuaryCode') and management_visible;
  if v_sanctuary.id is null then raise exception '선택한 성역을 찾을 수 없습니다.' using errcode='P0001'; end if;
  v_kind := upper(coalesce(p_payload->'schedule'->>'kind',''));
  v_starts_on := nullif(p_payload->'schedule'->>'startsOn','')::date;
  v_weekdays := coalesce(array(select distinct weekday::smallint from jsonb_array_elements_text(coalesce(p_payload->'schedule'->'weekdays','[]'::jsonb)) weekday order by weekday::smallint),'{}'::smallint[]);
  v_starts_at := nullif(p_payload->'schedule'->>'startsAt','')::time;
  v_duration := coalesce(nullif(p_payload->'schedule'->>'durationMinutes','')::integer,30);
  if v_starts_on is null or v_starts_at is null or v_kind not in ('ONCE','WEEKLY')
     or (v_kind='ONCE' and cardinality(v_weekdays)<>0)
     or (v_kind='WEEKLY' and cardinality(v_weekdays) not between 1 and 7)
     or exists(select 1 from unnest(v_weekdays) weekday where weekday not between 1 and 7)
     or v_duration not in (30,60,120,720) then raise exception '일정과 진행 시간을 다시 확인해 주세요.' using errcode='P0001'; end if;
  if v_sanctuary.available_from is not null and v_starts_on<v_sanctuary.available_from then raise exception '% 일정은 %부터 등록할 수 있습니다.',v_sanctuary.short_name,v_sanctuary.available_from using errcode='P0001'; end if;

  v_composition := coalesce(p_payload->'composition','[]'::jsonb);
  if jsonb_typeof(v_composition)<>'array' or jsonb_array_length(v_composition) not between 1 and 9 then raise exception '포스를 하나 이상, 최대 9개까지 구성해 주세요.' using errcode='P0001'; end if;
  if exists(
    select 1 from jsonb_array_elements(v_composition) force_item
     where coalesce(jsonb_typeof(force_item->'slots'),'')<>'array'
        or jsonb_array_length(force_item->'slots')<>10
        or exists(select 1 from jsonb_array_elements(force_item->'slots') slot_item
                   where nullif(slot_item->>'partyNo','')::integer not in (1,2)
                      or nullif(slot_item->>'slotNo','')::integer not between 1 and 5
                      or (slot_item->>'characterId' is not null and nullif(slot_item->>'characterId','')::bigint<1))
        or (select count(distinct ((slot_item->>'partyNo')||':'||(slot_item->>'slotNo'))) from jsonb_array_elements(force_item->'slots') slot_item)<>10
  ) then raise exception '각 포스는 1·2파티의 10개 슬롯을 정확히 포함해야 합니다.' using errcode='P0001'; end if;
  if (select count(*)<>count(distinct nullif(slot_item->>'characterId','')::bigint)
        from jsonb_array_elements(v_composition) force_item
        cross join lateral jsonb_array_elements(force_item->'slots') slot_item
       where slot_item->>'characterId' is not null) then raise exception '같은 캐릭터는 한 팀에 중복 배치할 수 없습니다.' using errcode='P0001'; end if;
  if (select count(*)<>count(distinct nullif(force_item->>'sourceForceId','')::bigint)
        from jsonb_array_elements(v_composition) force_item
       where force_item->>'sourceForceId' is not null) then raise exception '같은 포스가 편성안에 중복되었습니다.' using errcode='P0001'; end if;

  v_team_id := nullif(p_payload->>'teamId','')::bigint;
  if v_team_id is null then
    v_sub_key := left(v_request_key||':create',120);
    v_response := public.kinojo_sanctuary_management_command_v436(
      p_credential,v_sub_key,'CREATE_TEAM',coalesce(p_payload,'{}'::jsonb)||jsonb_build_object('mode',v_mode,'joinPolicy',v_policy),null
    );
    v_team_id := nullif(v_response->>'teamId','')::bigint;
    v_created := true;
    select * into v_team from private.sanctuary_management_teams_v412 where team_id=v_team_id for update;
  else
    select * into v_team from private.sanctuary_management_teams_v412 where team_id=v_team_id for update;
    if v_team.team_id is null or not private.kinojo_sm_can_manage_team_v412(v_actor,v_team_id) then raise exception '이 팀을 편집할 권한이 없습니다.' using errcode='P0001'; end if;
    if v_team.status='ARCHIVED' then raise exception '현재 편집할 수 없는 팀입니다.' using errcode='P0001'; end if;
    if p_expected_revision is null or v_team.revision<>p_expected_revision then raise exception '다른 사용자가 먼저 팀을 수정했습니다. 새로고침 후 다시 시도해 주세요.' using errcode='40001'; end if;
    perform private.kinojo_sm_assert_lease_v433(v_actor_id,v_team_id,p_payload->>'leaseToken');
  end if;

  select jsonb_build_object(
    'team',to_jsonb(v_team),
    'forceCount',(select count(*) from private.sanctuary_management_forces_v412 where team_id=v_team_id),
    'occupiedCount',(select count(*) from private.sanctuary_management_slots_v412 where team_id=v_team_id and character_id is not null)
  ) into v_before;

  if not v_created then
    if v_team.team_mode<>v_mode and v_mode='FIXED' then
      update private.sanctuary_management_support_items_v412 support_item
         set status='CANCELLED'
        from private.sanctuary_management_support_batches_v412 support_batch
       where support_batch.team_id=v_team_id
         and support_batch.support_batch_id=support_item.support_batch_id
         and support_item.status='PENDING';
      update private.sanctuary_management_support_batches_v412
         set status='CANCELLED',decision_member_id=v_actor_id,decided_at=clock_timestamp()
       where team_id=v_team_id and status='PENDING';
    end if;
    update private.sanctuary_management_teams_v412 set sanctuary_id=v_sanctuary.id,title=btrim(p_payload->>'title'),activity=btrim(p_payload->>'activity'),team_mode=v_mode,join_policy=v_policy,updated_at=clock_timestamp() where team_id=v_team_id returning * into v_team;
    update private.sanctuary_management_schedule_rules_v412 set schedule_kind=v_kind,starts_on=v_starts_on,weekdays=v_weekdays,starts_at=v_starts_at,duration_minutes=v_duration,status='ACTIVE',updated_at=clock_timestamp() where team_id=v_team_id;
    if not found then raise exception '팀 일정을 찾을 수 없습니다.' using errcode='P0001'; end if;

    if exists(
      select 1 from private.sanctuary_management_forces_v412 force_row
       where force_row.team_id=v_team_id
         and not exists(select 1 from jsonb_array_elements(v_composition) force_item where nullif(force_item->>'sourceForceId','')::bigint=force_row.force_id)
         and exists(select 1 from private.sanctuary_management_support_items_v412 support_item where support_item.force_id=force_row.force_id)
    ) then raise exception '지원 이력이 있는 포스는 바로 제거할 수 없습니다.' using errcode='P0001'; end if;
    delete from private.sanctuary_management_forces_v412 force_row
     where force_row.team_id=v_team_id
       and not exists(select 1 from jsonb_array_elements(v_composition) force_item where nullif(force_item->>'sourceForceId','')::bigint=force_row.force_id);

    for v_force_json,v_force_no in select force_item,ordinality::integer from jsonb_array_elements(v_composition) with ordinality as desired(force_item,ordinality) loop
      v_force_id:=nullif(v_force_json->>'sourceForceId','')::bigint;
      if v_force_id is not null then
        if not exists(select 1 from private.sanctuary_management_forces_v412 where team_id=v_team_id and force_id=v_force_id) then raise exception '편집할 포스를 다시 불러와 주세요.' using errcode='40001'; end if;
        update private.sanctuary_management_forces_v412 set force_no=v_force_no where team_id=v_team_id and force_id=v_force_id and force_no<>v_force_no;
      end if;
    end loop;
  end if;

  v_desired_count := jsonb_array_length(v_composition);
  select count(*)::integer into v_current_count from private.sanctuary_management_forces_v412 where team_id=v_team_id;
  while v_current_count<v_desired_count loop
    v_force_no := v_current_count+1;
    insert into private.sanctuary_management_forces_v412(team_id,force_no) values(v_team_id,v_force_no) returning force_id into v_force_id;
    for v_party_no in 1..2 loop
      insert into private.sanctuary_management_parties_v412(team_id,force_id,party_no) values(v_team_id,v_force_id,v_party_no) returning party_id into v_party_id;
      insert into private.sanctuary_management_slots_v412(team_id,force_id,party_id,slot_no) select v_team_id,v_force_id,v_party_id,slot_number from generate_series(1,5) slot_number;
    end loop;
    v_current_count := v_current_count+1;
  end loop;
  while v_current_count>v_desired_count loop
    select force_id into v_force_id from private.sanctuary_management_forces_v412 where team_id=v_team_id order by force_no desc limit 1;
    if exists(select 1 from private.sanctuary_management_support_items_v412 where force_id=v_force_id) then raise exception '지원 이력이 있는 포스는 바로 제거할 수 없습니다.' using errcode='P0001'; end if;
    delete from private.sanctuary_management_forces_v412 where force_id=v_force_id;
    v_current_count := v_current_count-1;
  end loop;

  update private.sanctuary_management_slots_v412 set character_id=null,owner_member_id=null,owner_root_character_id=null,character_relation=null,added_by_member_id=v_actor_id where team_id=v_team_id and character_id is not null;
  for v_force_json,v_force_no in select force_item,ordinality::integer from jsonb_array_elements(v_composition) with ordinality as desired(force_item,ordinality) loop
    select force_id into strict v_force_id from private.sanctuary_management_forces_v412 where team_id=v_team_id and force_no=v_force_no;
    for v_slot_json in select slot_item from jsonb_array_elements(v_force_json->'slots') slot_item loop
      v_character_id := nullif(v_slot_json->>'characterId','')::bigint;
      if v_character_id is not null then
        select * into v_owner from private.kinojo_sm_resolve_character_owner_v412(v_character_id);
        if v_owner.character_id is null then raise exception '캐릭터 %의 소유 관계를 확인할 수 없습니다.',v_character_id using errcode='P0001'; end if;
        update private.sanctuary_management_slots_v412 slot_row
           set character_id=v_owner.character_id,owner_member_id=v_owner.owner_member_id,owner_root_character_id=v_owner.root_character_id,
               character_relation=v_owner.relation,added_by_member_id=v_actor_id
          from private.sanctuary_management_parties_v412 party_row
         where slot_row.team_id=v_team_id and slot_row.force_id=v_force_id and slot_row.party_id=party_row.party_id
           and party_row.party_no=(v_slot_json->>'partyNo')::integer and slot_row.slot_no=(v_slot_json->>'slotNo')::integer;
        if not found then raise exception '캐릭터를 배치할 슬롯을 찾을 수 없습니다.' using errcode='P0001'; end if;
      end if;
    end loop;
  end loop;

  if exists(select 1 from private.sanctuary_management_slots_v412 where team_id=v_team_id and owner_member_id is not null group by force_id,owner_member_id having count(*)>1) then raise exception '모든 이용자는 각 포스에 본캐·부캐를 합쳐 캐릭터 1개만 배치할 수 있습니다.' using errcode='P0001'; end if;
  select * into v_team from private.sanctuary_management_teams_v412 where team_id=v_team_id for update;

  perform private.kinojo_sm_recompute_status_v412(v_team_id);
  select * into v_team from private.sanctuary_management_teams_v412 where team_id=v_team_id for update;
  if v_team.status='DRAFT' then
    v_sub_key := left(v_request_key||':publish',120);
    v_response := to_jsonb(v_team);
    update private.sanctuary_management_teams_v412
       set published_at=coalesce(published_at,clock_timestamp()),status='ACTIVE',updated_at=clock_timestamp()
     where team_id=v_team_id returning * into v_team;
    perform private.kinojo_sm_recompute_status_v412(v_team_id);
    select * into v_team from private.sanctuary_management_teams_v412 where team_id=v_team_id for update;
    perform private.kinojo_sm_audit_v412(v_actor_id,v_team_id,'TEAM',v_team_id,'PUBLISH_TEAM',v_response,to_jsonb(v_team),v_sub_key);
  end if;
  v_conflicts := private.kinojo_sm_team_conflicts_v437(v_team_id,current_date,current_date+366);
  if jsonb_array_length(v_conflicts)>0 then raise exception '%',v_conflicts->0->>'message' using errcode='P0001',detail=v_conflicts::text; end if;

  select jsonb_build_object(
    'team',to_jsonb(v_team),
    'forceCount',(select count(*) from private.sanctuary_management_forces_v412 where team_id=v_team_id),
    'occupiedCount',(select count(*) from private.sanctuary_management_slots_v412 where team_id=v_team_id and character_id is not null)
  ) into v_after;
  v_response := jsonb_build_object('ok',true,'action',v_action,'teamId',v_team_id,'revision',v_team.revision,'forceCount',v_desired_count,'occupiedCount',v_after->'occupiedCount','created',v_created,'replayed',false);
  perform private.kinojo_sm_audit_v412(v_actor_id,v_team_id,'TEAM',v_team_id,v_action,v_before,v_after,v_request_key);
  insert into private.sanctuary_management_commands_v412(actor_member_id,request_key,action,request_hash,response_payload) values(v_actor_id,v_request_key,v_action,v_hash,v_response);
  return v_response||jsonb_build_object('apiVersion',1.8,'schemaVersion',446,'databaseContract',446);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.kinojo_sanctuary_management_command_v451(p_credential text, p_request_key text, p_action text, p_payload jsonb, p_expected_revision bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_action text := upper(btrim(coalesce(p_action, '')));
  v_actor jsonb;
  v_actor_id bigint;
  v_hash text;
  v_existing private.sanctuary_management_commands_v412%rowtype;
  v_team private.sanctuary_management_teams_v412%rowtype;
  v_team_id bigint := nullif(p_payload->>'teamId', '')::bigint;
  v_proposal private.sanctuary_management_balance_proposals_v451%rowtype;
  v_proposal_token text := btrim(coalesce(p_payload->>'balanceProposalToken', ''));
  v_response jsonb;
  v_before_locks jsonb;
  v_after_locks jsonb;
  v_force_item jsonb;
  v_slot_item jsonb;
  v_assignment jsonb;
  v_force_id bigint;
  v_slot_id bigint;
  v_force_no integer;
  v_locked boolean;
  v_batch_id bigint;
  v_pending integer;
  v_applied integer;
  v_rejected integer;
  v_cancelled integer;
begin
  if v_action <> 'SAVE_COMPOSITION' then
    if v_action = 'SET_SLOT' and exists (
      select 1 from private.sanctuary_management_slots_v412 slot
      join private.sanctuary_management_parties_v412 party on party.party_id = slot.party_id
      where slot.team_id = v_team_id and slot.force_id = nullif(p_payload->>'forceId', '')::bigint
        and party.party_no = nullif(p_payload->>'partyNo', '')::integer
        and slot.slot_no = nullif(p_payload->>'slotNo', '')::integer and slot.placement_locked
    ) then raise exception '배치 잠금된 슬롯입니다. 잠금을 해제한 뒤 변경해 주세요.' using errcode = 'P0001'; end if;
    if v_action = 'MOVE_SLOT' and exists (
      select 1 from private.sanctuary_management_slots_v412
      where slot_id in (nullif(p_payload->>'fromSlotId', '')::bigint, nullif(p_payload->>'toSlotId', '')::bigint)
        and placement_locked
    ) then raise exception '배치 잠금된 카드는 이동하거나 교환할 수 없습니다.' using errcode = 'P0001'; end if;
    v_response := public.kinojo_sanctuary_management_command_v450(
      p_credential, p_request_key, v_action, p_payload, p_expected_revision
    );
    return v_response || jsonb_build_object('apiVersion', 2.1, 'schemaVersion', 451, 'databaseContract', 451);
  end if;

  if exists (
    select 1 from jsonb_array_elements(coalesce(p_payload->'composition', '[]'::jsonb)) force_source(force_item)
    cross join lateral jsonb_array_elements(coalesce(force_item->'slots', '[]'::jsonb)) slot_source(slot_item)
    where lower(coalesce(slot_item->>'placementLocked', 'false')) not in ('true', 'false')
  ) then raise exception '배치 잠금 상태를 다시 확인해 주세요.' using errcode = 'P0001'; end if;

  v_actor := private.kinojo_sm_actor_v412(p_credential);
  v_actor_id := nullif(v_actor->>'memberId', '')::bigint;
  if v_actor_id is null then raise exception '로그인 후 팀을 저장해 주세요.' using errcode = 'P0001'; end if;
  v_hash := encode(sha256(convert_to(v_action || ':' || coalesce(p_payload, '{}'::jsonb)::text, 'UTF8')), 'hex');
  perform pg_advisory_xact_lock(hashtextextended('sanctuary-management:' || v_actor_id || ':' || btrim(coalesce(p_request_key, '')), 451));
  select * into v_existing from private.sanctuary_management_commands_v412
  where actor_member_id = v_actor_id and request_key = btrim(coalesce(p_request_key, ''));
  if v_existing.command_id is not null then
    if v_existing.action <> v_action or v_existing.request_hash <> v_hash then
      raise exception '같은 요청 키가 다른 작업에 사용되었습니다.' using errcode = 'P0001';
    end if;
    v_response := public.kinojo_sanctuary_management_command_v450(
      p_credential, p_request_key, v_action, p_payload, p_expected_revision
    );
    return v_response || jsonb_build_object('replayed', true, 'apiVersion', 2.1, 'schemaVersion', 451, 'databaseContract', 451);
  end if;

  if v_team_id is not null then
    select * into v_team from private.sanctuary_management_teams_v412 where team_id = v_team_id for update;
    if v_team.team_id is null or not private.kinojo_sm_can_manage_team_v412(v_actor, v_team_id) then
      raise exception '이 팀을 편집할 권한이 없습니다.' using errcode = 'P0001';
    end if;
    if p_expected_revision is null or v_team.revision <> p_expected_revision then
      raise exception '다른 사용자가 먼저 팀을 수정했습니다. 새로고침 후 다시 시도해 주세요.' using errcode = '40001';
    end if;
    perform private.kinojo_sm_assert_lease_v433(v_actor_id, v_team_id, p_payload->>'leaseToken');
    if exists (
      select 1
      from private.sanctuary_management_slots_v412 slot
      join private.sanctuary_management_parties_v412 party on party.party_id = slot.party_id
      where slot.team_id = v_team_id and slot.placement_locked
        and not exists (
          select 1
          from jsonb_array_elements(coalesce(p_payload->'composition', '[]'::jsonb)) force_source(force_item)
          cross join lateral jsonb_array_elements(coalesce(force_item->'slots', '[]'::jsonb)) slot_source(slot_item)
          where nullif(force_item->>'sourceForceId', '')::bigint = slot.force_id
            and nullif(slot_item->>'partyNo', '')::integer = party.party_no
            and nullif(slot_item->>'slotNo', '')::integer = slot.slot_no
            and upper(coalesce(slot_item->>'assignmentKind', 'ACTUAL_CHARACTER')) = slot.assignment_kind
            and (
              slot.assignment_kind = 'RANDOM_ALT' and nullif(slot_item->>'mainCharacterId', '')::bigint = slot.owner_root_character_id
              or slot.assignment_kind = 'ACTUAL_CHARACTER' and nullif(slot_item->>'characterId', '')::bigint = slot.character_id
            )
        )
    ) then raise exception '배치 잠금된 카드는 잠금을 해제하기 전까지 위치와 캐릭터를 유지해야 합니다.' using errcode = 'P0001'; end if;
  end if;

  if v_proposal_token <> '' then
    if v_team_id is null then raise exception '새 팀에는 균형 배치 제안 토큰을 사용할 수 없습니다.' using errcode = 'P0001'; end if;
    select * into v_proposal
    from private.sanctuary_management_balance_proposals_v451
    where token_hash = encode(sha256(convert_to(v_proposal_token, 'UTF8')), 'hex') for update;
    if v_proposal.proposal_id is null or v_proposal.team_id <> v_team_id or v_proposal.actor_member_id <> v_actor_id then
      raise exception '균형 배치 제안을 다시 만들어 주세요.' using errcode = 'P0001';
    end if;
    if v_proposal.consumed_at is not null then raise exception '이미 저장에 사용한 균형 배치 제안입니다.' using errcode = 'P0001'; end if;
    if v_proposal.expires_at <= clock_timestamp() then raise exception '균형 배치 제안이 만료되었습니다. 다시 계산해 주세요.' using errcode = '40001'; end if;
    if v_proposal.team_revision <> p_expected_revision
       or v_proposal.candidate_hash <> private.kinojo_sm_balance_candidate_hash_v451(v_team_id, v_proposal.lock_overrides) then
      raise exception '지원자 또는 편성 상태가 바뀌었습니다. 새로고침 후 균형 배치를 다시 계산해 주세요.' using errcode = '40001';
    end if;
    if v_proposal.composition_hash <> private.kinojo_sm_composition_hash_v451(p_payload->'composition') then
      raise exception '균형 배치 제안 이후 편성안이 바뀌었습니다. 제안을 다시 적용해 주세요.' using errcode = '40001';
    end if;
  end if;

  if v_team_id is not null then
    select coalesce(jsonb_agg(jsonb_build_object('slotId', slot_id, 'locked', placement_locked) order by slot_id), '[]'::jsonb)
    into v_before_locks from private.sanctuary_management_slots_v412 where team_id = v_team_id;
    update private.sanctuary_management_slots_v412 set placement_locked = false where team_id = v_team_id and placement_locked;
  end if;

  v_response := public.kinojo_sanctuary_management_command_v450(
    p_credential, p_request_key, v_action, p_payload, p_expected_revision
  );
  v_team_id := nullif(v_response->>'teamId', '')::bigint;
  if coalesce((v_response->>'replayed')::boolean, false) then
    return v_response || jsonb_build_object('apiVersion', 2.1, 'schemaVersion', 451, 'databaseContract', 451);
  end if;

  for v_force_item, v_force_no in
    select force_item, ordinality::integer
    from jsonb_array_elements(coalesce(p_payload->'composition', '[]'::jsonb)) with ordinality source(force_item, ordinality)
  loop
    select force_id into strict v_force_id from private.sanctuary_management_forces_v412
    where team_id = v_team_id and force_no = v_force_no;
    for v_slot_item in select slot_item from jsonb_array_elements(coalesce(v_force_item->'slots', '[]'::jsonb)) source(slot_item) loop
      v_locked := coalesce((v_slot_item->>'placementLocked')::boolean, false);
      select slot.slot_id into strict v_slot_id
      from private.sanctuary_management_slots_v412 slot
      join private.sanctuary_management_parties_v412 party on party.party_id = slot.party_id
      where slot.force_id = v_force_id
        and party.party_no = nullif(v_slot_item->>'partyNo', '')::integer
        and slot.slot_no = nullif(v_slot_item->>'slotNo', '')::integer;
      if v_locked and not exists (
        select 1 from private.sanctuary_management_slots_v412
        where slot_id = v_slot_id and (character_id is not null or assignment_kind = 'RANDOM_ALT')
      ) then raise exception '빈 슬롯은 배치 잠금할 수 없습니다.' using errcode = 'P0001'; end if;
      update private.sanctuary_management_slots_v412
      set placement_locked = v_locked, revision = revision + case when placement_locked is distinct from v_locked then 1 else 0 end,
          updated_at = case when placement_locked is distinct from v_locked then clock_timestamp() else updated_at end
      where slot_id = v_slot_id;
    end loop;
  end loop;

  if v_proposal.proposal_id is not null then
    for v_assignment in select item from jsonb_array_elements(v_proposal.assignments) source(item) loop
      v_slot_id := nullif(v_assignment->>'slotId', '')::bigint;
      if not exists (
        select 1 from private.sanctuary_management_slots_v412 slot
        where slot.slot_id = v_slot_id and slot.team_id = v_team_id
          and slot.force_id = nullif(v_assignment->>'forceId', '')::bigint
          and slot.character_id = nullif(v_assignment->>'characterId', '')::bigint
      ) then raise exception '균형 배치 저장 결과가 제안과 일치하지 않습니다.' using errcode = '40001'; end if;
      update private.sanctuary_management_support_items_v412 set
        status = 'APPLIED', applied_slot_id = v_slot_id, result_code = 'BALANCE_APPLIED',
        result_message = '전투력 균형 배치 제안으로 클래스 조건에 맞는 슬롯에 배치했습니다.', updated_at = clock_timestamp()
      where support_item_id = nullif(v_assignment->>'supportItemId', '')::bigint
        and status = 'PENDING' and force_id = nullif(v_assignment->>'forceId', '')::bigint;
      if not found then raise exception '지원 후보 상태가 바뀌었습니다. 균형 배치를 다시 계산해 주세요.' using errcode = '40001'; end if;
    end loop;
    for v_batch_id in select distinct nullif(item->>'supportBatchId', '')::bigint from jsonb_array_elements(v_proposal.assignments) source(item) loop
      select count(*) filter(where status = 'PENDING')::integer,
             count(*) filter(where status = 'APPLIED')::integer,
             count(*) filter(where status = 'REJECTED')::integer,
             count(*) filter(where status = 'CANCELLED')::integer
      into v_pending, v_applied, v_rejected, v_cancelled
      from private.sanctuary_management_support_items_v412 where support_batch_id = v_batch_id;
      update private.sanctuary_management_support_batches_v412 set
        status = case when v_pending > 0 then 'PARTIAL'
          when v_applied > 0 and (v_rejected > 0 or v_cancelled > 0) then 'PARTIAL'
          when v_applied > 0 then 'APPLIED' else 'REJECTED' end,
        decision_member_id = v_actor_id, decision_note = '균형 배치 저장',
        decided_at = coalesce(decided_at, clock_timestamp()), updated_at = clock_timestamp()
      where support_batch_id = v_batch_id;
    end loop;
    update private.sanctuary_management_balance_proposals_v451 set
      consumed_at = clock_timestamp(), consumed_request_key = btrim(p_request_key)
    where proposal_id = v_proposal.proposal_id;
    perform private.kinojo_sm_audit_v412(v_actor_id, v_team_id, 'TEAM', v_team_id, 'BALANCE_APPLY',
      jsonb_build_object('proposalId', v_proposal.proposal_id, 'beforeAverages', v_proposal.before_averages),
      jsonb_build_object('assignmentCount', jsonb_array_length(v_proposal.assignments), 'afterAverages', v_proposal.after_averages), p_request_key);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('slotId', slot_id, 'locked', placement_locked) order by slot_id), '[]'::jsonb)
  into v_after_locks from private.sanctuary_management_slots_v412 where team_id = v_team_id;
  if v_before_locks is distinct from v_after_locks then
    perform private.kinojo_sm_audit_v412(v_actor_id, v_team_id, 'TEAM', v_team_id, 'PLACEMENT_LOCK_SAVE', v_before_locks, v_after_locks, p_request_key);
  end if;
  perform private.kinojo_sm_recompute_status_v450(v_team_id);
  return v_response || jsonb_build_object(
    'placementLockedCount', (select count(*) from private.sanctuary_management_slots_v412 where team_id = v_team_id and placement_locked),
    'balanceApplied', v_proposal.proposal_id is not null,
    'balanceAssignmentCount', case when v_proposal.proposal_id is null then 0 else jsonb_array_length(v_proposal.assignments) end,
    'apiVersion', 2.1, 'schemaVersion', 451, 'databaseContract', 451, 'slotContractVersion', 2
  );
end
$function$
;
CREATE OR REPLACE FUNCTION public.kinojo_sanctuary_management_command_v453(p_credential text, p_request_key text, p_action text, p_payload jsonb, p_expected_revision bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_action text := upper(btrim(coalesce(p_action, '')));
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_delegate jsonb;
  v_composition jsonb;
  v_response jsonb;
  v_team_id bigint;
  v_force_item jsonb;
  v_slot_item jsonb;
  v_force_no integer;
  v_force_id bigint;
  v_slot_id bigint;
  v_required_class text;
  v_main_character_id bigint;
  v_owner record;
  v_occupied_count integer;
begin
  if v_action <> 'SAVE_COMPOSITION' then
    v_response := public.kinojo_sanctuary_management_command_v452(
      p_credential, p_request_key, p_action, v_payload, p_expected_revision
    );
    return v_response || jsonb_build_object(
      'apiVersion', 2.2, 'schemaVersion', 453, 'databaseContract', 453
    );
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(v_payload->'composition', '[]'::jsonb)) force_source(force_item)
    cross join lateral jsonb_array_elements(coalesce(force_item->'slots', '[]'::jsonb)) slot_source(slot_item)
    where upper(coalesce(slot_item->>'assignmentKind', 'ACTUAL_CHARACTER')) = 'RANDOM_ALT'
      and (
        slot_item->>'characterId' is not null
        or nullif(slot_item->>'mainCharacterId', '')::bigint is null
        or upper(coalesce(slot_item->>'requiredClassCode', 'ALL')) not in (
          'ALL', 'TEMPLAR', 'GLADIATOR', 'ASSASSIN', 'RANGER', 'SORCERER',
          'ELEMENTALIST', 'CLERIC', 'CHANTER', 'FIGHTER'
        )
      )
  ) then
    raise exception '랜덤 부캐의 본캐와 클래스를 다시 확인해 주세요.' using errcode = 'P0001';
  end if;

  -- v452 remains the atomic composer authority. Random reservations are sent
  -- through it as typed empty slots, then restored in this same transaction.
  -- This avoids fabricating a character identity while preserving revision,
  -- lease, idempotency and all existing composition-rule validation.
  select jsonb_agg(
    (force_item - 'slots') || jsonb_build_object('slots', coalesce((
      select jsonb_agg(
        case
          when upper(coalesce(slot_item->>'assignmentKind', 'ACTUAL_CHARACTER')) = 'RANDOM_ALT'
            then (slot_item - 'mainCharacterId') || jsonb_build_object(
              'assignmentKind', 'ACTUAL_CHARACTER', 'characterId', null
            )
          else slot_item
        end
        order by slot_ordinality
      )
      from jsonb_array_elements(coalesce(force_item->'slots', '[]'::jsonb))
        with ordinality slots(slot_item, slot_ordinality)
    ), '[]'::jsonb))
    order by force_ordinality
  ) into v_composition
  from jsonb_array_elements(coalesce(v_payload->'composition', '[]'::jsonb))
    with ordinality forces(force_item, force_ordinality);

  v_delegate := (v_payload - 'composition') || jsonb_build_object(
    'composition', coalesce(v_composition, '[]'::jsonb)
  );
  v_response := public.kinojo_sanctuary_management_command_v452(
    p_credential, p_request_key, v_action, v_delegate, p_expected_revision
  );
  v_team_id := nullif(v_response->>'teamId', '')::bigint;

  for v_force_item, v_force_no in
    select force_item, ordinality::integer
    from jsonb_array_elements(coalesce(v_payload->'composition', '[]'::jsonb))
      with ordinality source(force_item, ordinality)
  loop
    select force_id into strict v_force_id
    from private.sanctuary_management_forces_v412
    where team_id = v_team_id and force_no = v_force_no;

    for v_slot_item in
      select slot_item
      from jsonb_array_elements(coalesce(v_force_item->'slots', '[]'::jsonb)) source(slot_item)
      where upper(coalesce(slot_item->>'assignmentKind', 'ACTUAL_CHARACTER')) = 'RANDOM_ALT'
    loop
      v_required_class := upper(coalesce(v_slot_item->>'requiredClassCode', 'ALL'));
      v_main_character_id := nullif(v_slot_item->>'mainCharacterId', '')::bigint;
      select * into v_owner from private.kinojo_sm_resolve_character_owner_v412(v_main_character_id);
      if v_owner.character_id is null
         or v_owner.root_character_id is distinct from v_main_character_id
         or not exists (select 1 from public.character_master root
      where root.id = v_main_character_id and coalesce(root.is_active, true)
        and not coalesce(root.lookup_excluded, false)
        and coalesce(root.main_character_id, case when root.is_main then root.id end) = root.id) then
        raise exception '랜덤 부캐의 본캐 소유 관계를 확인할 수 없습니다.' using errcode = 'P0001';
      end if;

      select slot.slot_id into strict v_slot_id
      from private.sanctuary_management_slots_v412 slot
      join private.sanctuary_management_parties_v412 party on party.party_id = slot.party_id
      where slot.force_id = v_force_id
        and party.party_no = nullif(v_slot_item->>'partyNo', '')::integer
        and slot.slot_no = nullif(v_slot_item->>'slotNo', '')::integer;

      update private.sanctuary_management_slots_v412 set
        required_class_code = v_required_class,
        assignment_kind = 'RANDOM_ALT',
        character_id = null,
        owner_member_id = v_owner.owner_member_id,
        owner_root_character_id = v_owner.root_character_id,
        character_relation = 'ALT'
      where slot_id = v_slot_id;
    end loop;
  end loop;

  -- Check after restoring RANDOM_ALT slots; the delegated save sees empty slots.
  if jsonb_array_length(private.kinojo_sm_team_conflicts_v437(v_team_id,current_date,current_date+366)) > 0 then
    raise exception '랜덤 부캐의 본캐 계열이 다른 팀 일정과 충돌합니다.' using errcode = 'P0001';
  end if;
  perform private.kinojo_sm_recompute_status_v450(v_team_id);
  select count(*)::integer into v_occupied_count
  from private.sanctuary_management_slots_v412
  where team_id = v_team_id and (character_id is not null or assignment_kind = 'RANDOM_ALT');

  return v_response || jsonb_build_object(
    'occupiedCount', v_occupied_count,
    'apiVersion', 2.2, 'schemaVersion', 453, 'databaseContract', 453,
    'randomAltClassReservation', true
  );
end
$function$
;
CREATE OR REPLACE FUNCTION public.kinojo_sanctuary_management_command_v454(p_credential text, p_request_key text, p_action text, p_payload jsonb, p_expected_revision bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_action text := upper(btrim(coalesce(p_action, '')));
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_delegate jsonb;
  v_response jsonb;
  v_team_id bigint;
  v_force_id bigint;
  v_force_no integer;
  v_force jsonb;
  v_slot jsonb;
  v_rule jsonb;
  v_difficulty text;
  v_minimum integer;
  v_sanctuary public.sanctuary_master%rowtype;
  v_team private.sanctuary_management_teams_v412%rowtype;
  v_all_hard boolean := true;
begin
  if v_action = 'SUBMIT_SUPPORT' then
    v_delegate := private.kinojo_sm_support_payload_v454(p_credential, p_request_key, v_payload);
    v_response := public.kinojo_sanctuary_management_command_v451(
      p_credential, p_request_key, v_action, v_delegate, p_expected_revision
    );
    return v_response || jsonb_build_object('apiVersion', 2.2, 'schemaVersion', 454, 'databaseContract', 454);
  end if;

  if v_action = 'DECIDE_SUPPORT' and upper(coalesce(v_payload->>'decision', '')) = 'APPROVE' then
    if exists (
      select 1
      from private.sanctuary_management_support_batches_v412 batch
      join private.sanctuary_management_support_items_v412 item
        on item.support_batch_id = batch.support_batch_id and item.status = 'PENDING'
      where batch.support_batch_id = nullif(v_payload->>'supportBatchId', '')::bigint
        and not private.kinojo_sm_character_eligible_v452(
          item.character_id,
          private.kinojo_sm_force_min_item_level_v454(item.force_id)
        )
    ) then
      raise exception '현재 포스 아이템레벨을 충족하지 않는 지원 캐릭터가 있습니다.' using errcode = 'P0001';
    end if;
    v_response := public.kinojo_sanctuary_management_command_v451(
      p_credential, p_request_key, v_action, v_payload, p_expected_revision
    );
    return v_response || jsonb_build_object('apiVersion', 2.2, 'schemaVersion', 454, 'databaseContract', 454);
  end if;

  if v_action = 'SET_SLOT' then
    v_force_id := nullif(v_payload->>'forceId', '')::bigint;
    if v_payload->>'characterId' is not null and not private.kinojo_sm_character_eligible_v452(
      nullif(v_payload->>'characterId', '')::bigint,
      private.kinojo_sm_force_min_item_level_v454(v_force_id)
    ) then
      raise exception '해당 포스 아이템레벨을 충족하는 캐릭터만 배치할 수 있습니다.' using errcode = 'P0001';
    end if;
    v_response := public.kinojo_sanctuary_management_command_v451(
      p_credential, p_request_key, v_action, v_payload, p_expected_revision
    );
    return v_response || jsonb_build_object('apiVersion', 2.2, 'schemaVersion', 454, 'databaseContract', 454);
  end if;

  if v_action = 'ADD_FORCE' then
    -- v453 only understands the legacy team-level NORMAL/HARD contract.
    -- Insert with NORMAL and persist the force-owned value after validation.
    v_delegate := (v_payload - 'difficulty') || jsonb_build_object('difficulty', 'NORMAL');
    v_response := public.kinojo_sanctuary_management_command_v453(
      p_credential, p_request_key, v_action, v_delegate, p_expected_revision
    );
    v_force_id := nullif(v_response->>'forceId', '')::bigint;
    v_difficulty := upper(coalesce(nullif(v_payload->>'difficulty', ''), 'NORMAL'));
    select * into v_team
      from private.sanctuary_management_teams_v412
     where team_id = nullif(v_response->>'teamId', '')::bigint;
    select * into v_sanctuary
      from public.sanctuary_master
     where id = v_team.sanctuary_id;
    if not private.kinojo_sm_difficulty_allowed_v464(v_sanctuary.id, v_difficulty) then
      raise exception '선택한 포스 난이도를 다시 확인해 주세요.' using errcode = 'P0001';
    end if;
    update private.sanctuary_management_forces_v412
       set difficulty = v_difficulty, updated_at = clock_timestamp()
     where force_id = v_force_id;
    return v_response || jsonb_build_object(
      'difficulty', v_difficulty, 'apiVersion', 2.2, 'schemaVersion', 454, 'databaseContract', 454
    );
  end if;

  if v_action <> 'SAVE_COMPOSITION' then
    v_response := public.kinojo_sanctuary_management_command_v453(
      p_credential, p_request_key, v_action, v_payload, p_expected_revision
    );
    return v_response || jsonb_build_object('apiVersion', 2.2, 'schemaVersion', 454, 'databaseContract', 454);
  end if;

  v_team_id := nullif(v_payload->>'teamId', '')::bigint;
  if v_team_id is not null then
    select * into v_team from private.sanctuary_management_teams_v412 where team_id = v_team_id;
    select * into v_sanctuary from public.sanctuary_master where id = v_team.sanctuary_id;
  else
    select * into v_sanctuary
      from public.sanctuary_master
     where code = btrim(v_payload->>'sanctuaryCode') and management_visible;
  end if;
  if v_sanctuary.id is null then
    raise exception '선택한 성역을 찾을 수 없습니다.' using errcode = 'P0001';
  end if;

  for v_force, v_force_no in
    select force_item, ordinality::integer
    from jsonb_array_elements(coalesce(v_payload->'composition', '[]'::jsonb))
      with ordinality source(force_item, ordinality)
  loop
    v_difficulty := upper(coalesce(nullif(v_force->>'difficulty', ''), nullif(v_payload->>'difficulty', ''), 'NORMAL'));
    if not private.kinojo_sm_difficulty_allowed_v464(v_sanctuary.id, v_difficulty) then
      raise exception '선택한 포스 난이도를 다시 확인해 주세요.' using errcode = 'P0001';
    end if;
    if v_difficulty <> 'HARD' then v_all_hard := false; end if;
    v_minimum := private.kinojo_sm_min_item_level_v452(v_sanctuary.id, v_difficulty);

    for v_slot in
      select slot_item from jsonb_array_elements(coalesce(v_force->'slots', '[]'::jsonb)) source(slot_item)
    loop
      if nullif(v_slot->>'characterId', '')::bigint is not null
         and not private.kinojo_sm_character_eligible_v452(nullif(v_slot->>'characterId', '')::bigint, v_minimum) then
        raise exception '해당 포스 아이템레벨을 충족하는 캐릭터만 배치할 수 있습니다.' using errcode = 'P0001';
      end if;
      if upper(coalesce(v_slot->>'assignmentKind', 'ACTUAL_CHARACTER')) = 'RANDOM_ALT'
         and not exists (
           select 1 from public.character_master character
           where character.main_character_id = nullif(v_slot->>'mainCharacterId', '')::bigint
             and character.id <> nullif(v_slot->>'mainCharacterId', '')::bigint
             and coalesce(character.is_active, true) and not coalesce(character.lookup_excluded, false)
             and private.kinojo_sm_character_eligible_v452(character.id, v_minimum)
         ) then
        raise exception '해당 포스 아이템레벨을 충족하는 부캐가 없어 랜덤 부캐를 배치할 수 없습니다.' using errcode = 'P0001';
      end if;
    end loop;

    for v_rule in
      select rule_item from jsonb_array_elements(coalesce(v_force->'requirements', '[]'::jsonb)) source(rule_item)
    loop
      if upper(coalesce(v_rule->>'ruleType', '')) = 'ITEM_LEVEL_MIN'
         and v_minimum is not null
         and coalesce(nullif(v_rule->>'itemLevelThreshold', '')::integer, 0) < v_minimum then
        raise exception '포스 아이템레벨 배치 조건은 성역 최소치보다 낮을 수 없습니다.' using errcode = 'P0001';
      end if;
    end loop;
  end loop;

  v_delegate := (v_payload - 'difficulty') || jsonb_build_object('difficulty', 'NORMAL');
  v_response := public.kinojo_sanctuary_management_command_v453(
    p_credential, p_request_key, v_action, v_delegate, p_expected_revision
  );
  v_team_id := nullif(v_response->>'teamId', '')::bigint;

  for v_force, v_force_no in
    select force_item, ordinality::integer
    from jsonb_array_elements(coalesce(v_payload->'composition', '[]'::jsonb))
      with ordinality source(force_item, ordinality)
  loop
    v_difficulty := upper(coalesce(nullif(v_force->>'difficulty', ''), nullif(v_payload->>'difficulty', ''), 'NORMAL'));
    update private.sanctuary_management_forces_v412
       set difficulty = v_difficulty, updated_at = clock_timestamp()
     where team_id = v_team_id and force_no = v_force_no;
  end loop;
  update private.sanctuary_management_teams_v412
     set difficulty = case when v_all_hard then 'HARD' else 'NORMAL' end,
         updated_at = clock_timestamp()
   where team_id = v_team_id;

  return v_response || jsonb_build_object(
    'difficultyScope', 'FORCE',
    'apiVersion', 2.2,
    'schemaVersion', 454,
    'databaseContract', 454
  );
end
$function$
;
CREATE OR REPLACE FUNCTION public.kinojo_sanctuary_management_command_v449(p_credential text, p_request_key text, p_action text, p_payload jsonb, p_expected_revision bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_action text := upper(btrim(coalesce(p_action, '')));
  v_rules_version integer := coalesce(nullif(p_payload->>'compositionRulesVersion', '')::integer, 0);
  v_response jsonb;
  v_actor jsonb;
  v_actor_id bigint;
  v_team_id bigint;
  v_force_id bigint;
  v_party_id bigint;
  v_force_item jsonb;
  v_rule_item jsonb;
  v_force_no integer;
  v_scope_type text;
  v_rule_type text;
  v_party_no integer;
  v_minimum_count integer;
  v_power_threshold integer;
begin
  if v_action <> 'SAVE_COMPOSITION' then
    return public.kinojo_sanctuary_management_command_v446(p_credential, p_request_key, p_action, p_payload, p_expected_revision)
      || jsonb_build_object('apiVersion', 1.9, 'schemaVersion', 449, 'databaseContract', 449);
  end if;

  if v_rules_version not in (0, 1) then
    raise exception '포스 구성 조건 형식을 다시 확인해 주세요.' using errcode = 'P0001';
  end if;
  if v_rules_version = 1 and exists (
    select 1
    from jsonb_array_elements(coalesce(p_payload->'composition', '[]'::jsonb)) force_source(force_item)
    where jsonb_typeof(coalesce(force_item->'requirements', '[]'::jsonb)) <> 'array'
      or jsonb_array_length(coalesce(force_item->'requirements', '[]'::jsonb)) > 6
      or exists (
        select 1
        from jsonb_array_elements(coalesce(force_item->'requirements', '[]'::jsonb)) rule_source(rule_item)
        where upper(coalesce(rule_item->>'scopeType', '')) not in ('FORCE', 'PARTY')
          or upper(coalesce(rule_item->>'ruleType', '')) not in ('MAIN_MIN', 'POWER_MIN')
          or nullif(rule_item->>'minimumCount', '')::integer not between 1 and case when upper(rule_item->>'scopeType') = 'PARTY' then 5 else 10 end
          or (upper(rule_item->>'scopeType') = 'FORCE' and rule_item->>'partyNo' is not null)
          or (upper(rule_item->>'scopeType') = 'PARTY' and nullif(rule_item->>'partyNo', '')::integer not in (1, 2))
          or (upper(rule_item->>'ruleType') = 'MAIN_MIN' and rule_item->>'powerThreshold' is not null)
          or (upper(rule_item->>'ruleType') = 'POWER_MIN' and nullif(rule_item->>'powerThreshold', '')::integer not between 1000 and 1000000000)
      )
      or (
        select count(*) <> count(distinct upper(rule_item->>'scopeType') || ':' || coalesce(rule_item->>'partyNo', '0') || ':' || upper(rule_item->>'ruleType'))
        from jsonb_array_elements(coalesce(force_item->'requirements', '[]'::jsonb)) rule_source(rule_item)
      )
  ) then
    raise exception '본캐·전투력 배치 조건을 다시 확인해 주세요.' using errcode = 'P0001';
  end if;

  v_response := public.kinojo_sanctuary_management_command_v446(
    p_credential, p_request_key, p_action, p_payload, p_expected_revision
  );
  v_team_id := nullif(v_response->>'teamId', '')::bigint;
  if v_rules_version = 1 and coalesce((v_response->>'replayed')::boolean, false) is not true then
    v_actor := private.kinojo_sm_actor_v412(p_credential);
    v_actor_id := nullif(v_actor->>'memberId', '')::bigint;
    delete from private.sanctuary_management_composition_rules_v449 where team_id = v_team_id;

    for v_force_item, v_force_no in
      select force_item, ordinality::integer
      from jsonb_array_elements(coalesce(p_payload->'composition', '[]'::jsonb))
        with ordinality force_source(force_item, ordinality)
    loop
      select force.force_id into strict v_force_id
      from private.sanctuary_management_forces_v412 force
      where force.team_id = v_team_id and force.force_no = v_force_no;

      for v_rule_item in
        select rule_item from jsonb_array_elements(coalesce(v_force_item->'requirements', '[]'::jsonb)) rule_source(rule_item)
      loop
        v_scope_type := upper(v_rule_item->>'scopeType');
        v_rule_type := upper(v_rule_item->>'ruleType');
        v_party_no := nullif(v_rule_item->>'partyNo', '')::integer;
        v_minimum_count := nullif(v_rule_item->>'minimumCount', '')::integer;
        v_power_threshold := nullif(v_rule_item->>'powerThreshold', '')::integer;
        v_party_id := null;
        if v_scope_type = 'PARTY' then
          select party.party_id into strict v_party_id
          from private.sanctuary_management_parties_v412 party
          where party.force_id = v_force_id and party.party_no = v_party_no;
        end if;
        insert into private.sanctuary_management_composition_rules_v449(
          team_id, force_id, party_id, scope_type, rule_type, minimum_count,
          power_threshold, created_by_member_id, updated_by_member_id
        ) values (
          v_team_id, v_force_id, v_party_id, v_scope_type, v_rule_type, v_minimum_count,
          case when v_rule_type = 'POWER_MIN' then v_power_threshold else null end,
          v_actor_id, v_actor_id
        );
      end loop;
    end loop;
  end if;
  return v_response || jsonb_build_object(
    'apiVersion', 1.9,
    'schemaVersion', 449,
    'databaseContract', 449,
    'compositionRulesVersion', v_rules_version
  );
end
$function$
;
CREATE OR REPLACE FUNCTION public.kinojo_sanctuary_management_command_v450(p_credential text, p_request_key text, p_action text, p_payload jsonb, p_expected_revision bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_action text := upper(btrim(coalesce(p_action, '')));
  v_actor jsonb;
  v_actor_id bigint;
  v_hash text;
  v_existing private.sanctuary_management_commands_v412%rowtype;
  v_response jsonb;
  v_team_id bigint;
  v_force_id bigint;
  v_slot_id bigint;
  v_force_item jsonb;
  v_slot_item jsonb;
  v_force_no integer;
  v_required_class text;
  v_assignment_kind text;
  v_character_id bigint;
  v_main_character_id bigint;
  v_owner record;
  v_occupied_count integer;
begin
  if v_action in ('SUBMIT_SUPPORT', 'DECIDE_SUPPORT') then
    return private.kinojo_sm_support_command_v450(p_credential, p_request_key, v_action, p_payload);
  end if;
  if v_action <> 'SAVE_COMPOSITION' then
    v_response := public.kinojo_sanctuary_management_command_v449(
      p_credential, p_request_key, v_action, p_payload, p_expected_revision
    );
    v_team_id := nullif(v_response->>'teamId', '')::bigint;
    if v_team_id is not null and v_action in ('SET_SLOT', 'MOVE_SLOT') and coalesce((v_response->>'replayed')::boolean, false) is not true then
      perform private.kinojo_sm_recompute_status_v450(v_team_id);
    end if;
    return v_response || jsonb_build_object('apiVersion', 2.0, 'schemaVersion', 450, 'databaseContract', 450);
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_payload->'composition', '[]'::jsonb)) force_source(force_item)
    cross join lateral jsonb_array_elements(coalesce(force_item->'slots', '[]'::jsonb)) slot_source(slot_item)
    where upper(coalesce(slot_item->>'requiredClassCode', 'ALL')) not in (
      'ALL', 'TEMPLAR', 'GLADIATOR', 'ASSASSIN', 'RANGER', 'SORCERER',
      'ELEMENTALIST', 'CLERIC', 'CHANTER', 'FIGHTER'
    )
      or upper(coalesce(slot_item->>'assignmentKind', 'ACTUAL_CHARACTER')) not in ('ACTUAL_CHARACTER', 'RANDOM_ALT')
      or (
        upper(coalesce(slot_item->>'assignmentKind', 'ACTUAL_CHARACTER')) = 'RANDOM_ALT'
        and (
          slot_item->>'characterId' is not null
          or nullif(slot_item->>'mainCharacterId', '')::bigint is null
          or upper(coalesce(slot_item->>'requiredClassCode', 'ALL')) <> 'ALL'
        )
      )
  ) then
    raise exception '슬롯 클래스 제한 또는 랜덤 부캐 편성 형식을 다시 확인해 주세요.' using errcode = 'P0001';
  end if;

  v_actor := private.kinojo_sm_actor_v412(p_credential);
  v_actor_id := nullif(v_actor->>'memberId', '')::bigint;
  if v_actor_id is null then raise exception '로그인 후 팀을 저장해 주세요.' using errcode = 'P0001'; end if;
  v_hash := encode(sha256(convert_to(v_action || ':' || coalesce(p_payload, '{}'::jsonb)::text, 'UTF8')), 'hex');
  select * into v_existing
    from private.sanctuary_management_commands_v412
   where actor_member_id = v_actor_id and request_key = btrim(coalesce(p_request_key, ''));
  if v_existing.command_id is not null then
    if v_existing.action <> v_action or v_existing.request_hash <> v_hash then
      raise exception '같은 요청 키가 다른 작업에 사용되었습니다.' using errcode = 'P0001';
    end if;
    v_response := public.kinojo_sanctuary_management_command_v449(
      p_credential, p_request_key, p_action, p_payload, p_expected_revision
    );
    v_team_id := nullif(v_response->>'teamId', '')::bigint;
    select count(*)::integer into v_occupied_count
      from private.sanctuary_management_slots_v412
     where team_id = v_team_id and (character_id is not null or assignment_kind = 'RANDOM_ALT');
    return v_response || jsonb_build_object(
      'replayed', true, 'occupiedCount', v_occupied_count,
      'apiVersion', 2.0, 'schemaVersion', 450, 'databaseContract', 450, 'slotContractVersion', 1
    );
  end if;

  v_team_id := nullif(p_payload->>'teamId', '')::bigint;
  if v_team_id is not null then
    update private.sanctuary_management_slots_v412
       set assignment_kind = 'ACTUAL_CHARACTER', character_id = null, owner_member_id = null,
           owner_root_character_id = null, character_relation = null, added_by_member_id = v_actor_id
     where team_id = v_team_id and assignment_kind = 'RANDOM_ALT';
  end if;

  v_response := public.kinojo_sanctuary_management_command_v449(
    p_credential, p_request_key, p_action, p_payload, p_expected_revision
  );
  v_team_id := nullif(v_response->>'teamId', '')::bigint;

  for v_force_item, v_force_no in
    select force_item, ordinality::integer
    from jsonb_array_elements(coalesce(p_payload->'composition', '[]'::jsonb))
      with ordinality force_source(force_item, ordinality)
  loop
    select force_id into strict v_force_id
      from private.sanctuary_management_forces_v412
     where team_id = v_team_id and force_no = v_force_no;
    for v_slot_item in
      select slot_item from jsonb_array_elements(coalesce(v_force_item->'slots', '[]'::jsonb)) slot_source(slot_item)
    loop
      v_required_class := upper(coalesce(v_slot_item->>'requiredClassCode', 'ALL'));
      v_assignment_kind := upper(coalesce(v_slot_item->>'assignmentKind', 'ACTUAL_CHARACTER'));
      v_character_id := nullif(v_slot_item->>'characterId', '')::bigint;
      v_main_character_id := nullif(v_slot_item->>'mainCharacterId', '')::bigint;
      select slot.slot_id into strict v_slot_id
        from private.sanctuary_management_slots_v412 slot
        join private.sanctuary_management_parties_v412 party on party.party_id = slot.party_id
       where slot.force_id = v_force_id
         and party.party_no = nullif(v_slot_item->>'partyNo', '')::integer
         and slot.slot_no = nullif(v_slot_item->>'slotNo', '')::integer;
      if v_assignment_kind = 'RANDOM_ALT' then
        select * into v_owner from private.kinojo_sm_resolve_character_owner_v412(v_main_character_id);
        if v_owner.character_id is null or v_owner.root_character_id is distinct from v_main_character_id then
          raise exception '랜덤 부캐의 본캐 소유 관계를 확인할 수 없습니다.' using errcode = 'P0001';
        end if;
        update private.sanctuary_management_slots_v412 set
          required_class_code = 'ALL', assignment_kind = 'RANDOM_ALT', character_id = null,
          owner_member_id = v_owner.owner_member_id, owner_root_character_id = v_owner.root_character_id,
          character_relation = 'ALT', added_by_member_id = v_actor_id
        where slot_id = v_slot_id;
      else
        update private.sanctuary_management_slots_v412 set
          required_class_code = v_required_class, assignment_kind = 'ACTUAL_CHARACTER'
        where slot_id = v_slot_id;
      end if;
    end loop;
  end loop;

  perform private.kinojo_sm_recompute_status_v450(v_team_id);
  select count(*)::integer into v_occupied_count
    from private.sanctuary_management_slots_v412
   where team_id = v_team_id and (character_id is not null or assignment_kind = 'RANDOM_ALT');
  return v_response || jsonb_build_object(
    'occupiedCount', v_occupied_count,
    'apiVersion', 2.0, 'schemaVersion', 450, 'databaseContract', 450, 'slotContractVersion', 1
  );
end
$function$
;
CREATE OR REPLACE FUNCTION public.kinojo_sanctuary_management_command_v452(p_credential text, p_request_key text, p_action text, p_payload jsonb, p_expected_revision bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_action text := upper(btrim(coalesce(p_action, ''))); v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_delegate jsonb; v_response jsonb; v_team_id bigint; v_team private.sanctuary_management_teams_v412%rowtype;
  v_sanctuary public.sanctuary_master%rowtype; v_difficulty text; v_minimum integer;
  v_force jsonb; v_rule jsonb; v_force_no integer; v_force_id bigint; v_party_id bigint;
  v_scope text; v_type text; v_party_no integer; v_count integer; v_item_threshold integer;
begin
  if v_action = 'SUBMIT_SUPPORT' then
    v_delegate := private.kinojo_sm_support_payload_v452(p_credential, p_request_key, v_payload);
    v_response := public.kinojo_sanctuary_management_command_v451(p_credential, p_request_key, v_action, v_delegate, p_expected_revision);
    return v_response || jsonb_build_object('apiVersion', 2.2, 'schemaVersion', 452, 'databaseContract', 452);
  end if;
  if v_action = 'DECIDE_SUPPORT' and upper(coalesce(v_payload->>'decision', '')) = 'APPROVE' and exists (
    select 1
    from private.sanctuary_management_support_batches_v412 batch
    join private.sanctuary_management_support_items_v412 item on item.support_batch_id = batch.support_batch_id and item.status = 'PENDING'
    where batch.support_batch_id = nullif(v_payload->>'supportBatchId', '')::bigint
      and not private.kinojo_sm_character_eligible_v452(item.character_id, private.kinojo_sm_team_min_item_level_v452(batch.team_id))
  ) then raise exception '현재 성역 아이템레벨을 충족하지 않는 지원 캐릭터가 있습니다.' using errcode = 'P0001'; end if;

  if v_action <> 'SAVE_COMPOSITION' then
    if v_action = 'SET_SLOT' then
      v_team_id := nullif(v_payload->>'teamId', '')::bigint;
      if v_payload->>'characterId' is not null and not private.kinojo_sm_character_eligible_v452(
        nullif(v_payload->>'characterId', '')::bigint, private.kinojo_sm_team_min_item_level_v452(v_team_id)
      ) then raise exception '해당 성역 아이템레벨을 충족하는 캐릭터만 배치할 수 있습니다.' using errcode = 'P0001'; end if;
    end if;
    v_response := public.kinojo_sanctuary_management_command_v451(p_credential, p_request_key, v_action, v_payload, p_expected_revision);
    return v_response || jsonb_build_object('apiVersion', 2.2, 'schemaVersion', 452, 'databaseContract', 452);
  end if;

  v_team_id := nullif(v_payload->>'teamId', '')::bigint;
  if v_team_id is not null then
    select * into v_team from private.sanctuary_management_teams_v412 where team_id = v_team_id;
    select * into v_sanctuary from public.sanctuary_master where id = v_team.sanctuary_id;
  else
    select * into v_sanctuary from public.sanctuary_master where code = btrim(v_payload->>'sanctuaryCode') and management_visible;
  end if;
  if v_sanctuary.id is null then raise exception '선택한 성역을 찾을 수 없습니다.' using errcode = 'P0001'; end if;
  v_difficulty := upper(coalesce(nullif(v_payload->>'difficulty', ''), case when v_sanctuary.code = 'kaldrix' then 'NORMAL' else 'NORMAL' end));
  if (v_sanctuary.code = 'kaldrix' and v_difficulty not in ('NORMAL', 'HARD'))
     or (v_sanctuary.code <> 'kaldrix' and v_difficulty <> 'NORMAL') then
    raise exception '선택한 성역 난이도를 다시 확인해 주세요.' using errcode = 'P0001';
  end if;
  v_minimum := private.kinojo_sm_min_item_level_v452(v_sanctuary.id, v_difficulty);
  if exists (
    select 1 from jsonb_array_elements(coalesce(v_payload->'composition', '[]'::jsonb)) force_source(force_item)
    cross join lateral jsonb_array_elements(coalesce(force_item->'slots', '[]'::jsonb)) slot_source(slot_item)
    where nullif(slot_item->>'characterId', '')::bigint is not null
      and not private.kinojo_sm_character_eligible_v452(nullif(slot_item->>'characterId', '')::bigint, v_minimum)
  ) then raise exception '해당 성역 아이템레벨을 충족하는 캐릭터만 배치할 수 있습니다.' using errcode = 'P0001'; end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(v_payload->'composition', '[]'::jsonb)) force_source(force_item)
    cross join lateral jsonb_array_elements(coalesce(force_item->'slots', '[]'::jsonb)) slot_source(slot_item)
    where upper(coalesce(slot_item->>'assignmentKind', 'ACTUAL_CHARACTER')) = 'RANDOM_ALT'
      and not exists (
        select 1 from public.character_master character
        where character.main_character_id = nullif(slot_item->>'mainCharacterId', '')::bigint
          and character.id <> nullif(slot_item->>'mainCharacterId', '')::bigint
          and coalesce(character.is_active, true) and not coalesce(character.lookup_excluded, false)
          and (v_minimum is null or character.latest_pve_item_level >= v_minimum)
      )
  ) then raise exception '해당 성역 아이템레벨을 충족하는 부캐가 없어 랜덤 부캐를 배치할 수 없습니다.' using errcode = 'P0001'; end if;

  if coalesce(nullif(v_payload->>'compositionRulesVersion', '')::integer, 0) not in (0, 1, 2) then
    raise exception '포스 구성 조건 형식을 다시 확인해 주세요.' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(v_payload->'composition', '[]'::jsonb)) force_source(force_item)
    where jsonb_typeof(coalesce(force_item->'requirements', '[]'::jsonb)) <> 'array'
      or jsonb_array_length(coalesce(force_item->'requirements', '[]'::jsonb)) > 6
      or exists (
        select 1 from jsonb_array_elements(coalesce(force_item->'requirements', '[]'::jsonb)) rule_source(rule_item)
        where upper(coalesce(rule_item->>'ruleType', '')) not in ('MAIN_MIN', 'POWER_MIN', 'ITEM_LEVEL_MIN')
          or upper(coalesce(rule_item->>'scopeType', '')) not in ('FORCE', 'PARTY')
          or nullif(rule_item->>'minimumCount', '')::integer is null
          or nullif(rule_item->>'minimumCount', '')::integer not between 1 and
            case when upper(coalesce(rule_item->>'scopeType', '')) = 'PARTY' then 5 else 10 end
          or (upper(coalesce(rule_item->>'scopeType', '')) = 'FORCE' and rule_item->>'partyNo' is not null)
          or (upper(coalesce(rule_item->>'scopeType', '')) = 'PARTY' and
            coalesce(nullif(rule_item->>'partyNo', '')::integer, 0) not in (1, 2))
          or (upper(coalesce(rule_item->>'ruleType', '')) = 'MAIN_MIN' and (
            rule_item->>'powerThreshold' is not null or rule_item->>'itemLevelThreshold' is not null
          ))
          or (upper(coalesce(rule_item->>'ruleType', '')) = 'POWER_MIN' and (
            nullif(rule_item->>'powerThreshold', '')::integer is null
            or nullif(rule_item->>'powerThreshold', '')::integer not between 1000 and 1000000000
            or rule_item->>'itemLevelThreshold' is not null
          ))
          or (upper(rule_item->>'ruleType') = 'ITEM_LEVEL_MIN' and (
            nullif(rule_item->>'itemLevelThreshold', '')::integer is null
            or nullif(rule_item->>'itemLevelThreshold', '')::integer not between 1 and 100000
            or (v_minimum is not null and nullif(rule_item->>'itemLevelThreshold', '')::integer < v_minimum)
            or rule_item->>'powerThreshold' is not null
          ))
      )
      or exists (
        select 1
        from jsonb_array_elements(coalesce(force_item->'requirements', '[]'::jsonb)) rule_source(rule_item)
        group by upper(coalesce(rule_item->>'scopeType', '')),
          coalesce(rule_item->>'partyNo', '0'), upper(coalesce(rule_item->>'ruleType', ''))
        having count(*) > 1
      )
      or exists (
        select 1 from jsonb_array_elements(coalesce(force_item->'requirements', '[]'::jsonb)) rule_source(rule_item)
        where upper(rule_item->>'ruleType') in ('POWER_MIN', 'ITEM_LEVEL_MIN')
        group by upper(rule_item->>'scopeType'), coalesce(rule_item->>'partyNo', '0') having count(*) > 1
      )
  ) then raise exception '본캐·전투력·아이템레벨 배치 조건을 다시 확인해 주세요.' using errcode = 'P0001'; end if;

  select jsonb_agg((force_item - 'requirements') || jsonb_build_object('requirements', coalesce((
    select jsonb_agg(rule_item order by rule_ordinality)
    from jsonb_array_elements(coalesce(force_item->'requirements', '[]'::jsonb)) with ordinality rules(rule_item, rule_ordinality)
    where upper(coalesce(rule_item->>'ruleType', '')) <> 'ITEM_LEVEL_MIN'
  ), '[]'::jsonb)) order by force_ordinality) into v_delegate
  from jsonb_array_elements(coalesce(v_payload->'composition', '[]'::jsonb)) with ordinality forces(force_item, force_ordinality);
  v_delegate := (v_payload - 'composition' - 'compositionRulesVersion') || jsonb_build_object(
    'composition', coalesce(v_delegate, '[]'::jsonb), 'compositionRulesVersion', 1
  );
  v_response := public.kinojo_sanctuary_management_command_v451(p_credential, p_request_key, v_action, v_delegate, p_expected_revision);
  v_team_id := nullif(v_response->>'teamId', '')::bigint;
  if coalesce((v_response->>'replayed')::boolean, false) is not true then
    update private.sanctuary_management_teams_v412 set difficulty = v_difficulty, updated_at = clock_timestamp() where team_id = v_team_id;
    for v_force, v_force_no in
      select force_item, ordinality::integer from jsonb_array_elements(coalesce(v_payload->'composition', '[]'::jsonb)) with ordinality source(force_item, ordinality)
    loop
      select force_id into strict v_force_id from private.sanctuary_management_forces_v412 where team_id = v_team_id and force_no = v_force_no;
      for v_rule in select rule_item from jsonb_array_elements(coalesce(v_force->'requirements', '[]'::jsonb)) source(rule_item)
      loop
        v_type := upper(v_rule->>'ruleType');
        if v_type = 'ITEM_LEVEL_MIN' then
          v_scope := upper(v_rule->>'scopeType'); v_party_no := nullif(v_rule->>'partyNo', '')::integer;
          v_count := nullif(v_rule->>'minimumCount', '')::integer; v_item_threshold := nullif(v_rule->>'itemLevelThreshold', '')::integer;
          v_party_id := null;
          if v_scope = 'PARTY' then select party_id into strict v_party_id from private.sanctuary_management_parties_v412 where force_id = v_force_id and party_no = v_party_no; end if;
          insert into private.sanctuary_management_composition_rules_v449(
            team_id, force_id, party_id, scope_type, rule_type, minimum_count,
            power_threshold, item_level_threshold, created_by_member_id, updated_by_member_id
          ) values (
            v_team_id, v_force_id, v_party_id, v_scope, v_type, v_count,
            null, v_item_threshold, nullif(private.kinojo_sm_actor_v412(p_credential)->>'memberId', '')::bigint,
            nullif(private.kinojo_sm_actor_v412(p_credential)->>'memberId', '')::bigint
          );
        end if;
      end loop;
    end loop;
  end if;
  return v_response || jsonb_build_object(
    'difficulty', v_difficulty, 'minimumItemLevel', v_minimum, 'compositionRulesVersion', 2,
    'apiVersion', 2.2, 'schemaVersion', 452, 'databaseContract', 452
  );
end
$function$
;
CREATE OR REPLACE FUNCTION private.kinojo_sm_permission_snapshot(p_team_id bigint)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
select jsonb_build_object(
 'info',jsonb_build_object('sanctuaryId',t.sanctuary_id,'title',t.title,'activity',t.activity,
   'teamMode',t.team_mode,'joinPolicy',t.join_policy,'published',t.published_at is not null),
 'roster',jsonb_build_object(
   'bossRoles',(select coalesce(jsonb_agg(to_jsonb(b) order by b.force_no,b.character_id,b.boss,b.ordinal),'[]'::jsonb) from private.sanctuary_boss_roles_v536 b where b.team_id=t.team_id),
   'forces',(select coalesce(jsonb_agg(jsonb_build_object('forceId',f.force_id,'forceNo',f.force_no,'capacity',f.capacity,'difficulty',f.difficulty) order by f.force_id),'[]'::jsonb) from private.sanctuary_management_forces_v412 f where f.team_id=t.team_id),
   'slots',(select coalesce(jsonb_agg((to_jsonb(s)-array['revision','created_at','updated_at','added_by_member_id']) order by s.slot_id),'[]'::jsonb) from private.sanctuary_management_slots_v412 s where s.team_id=t.team_id),
   'rules',(select coalesce(jsonb_agg(c.value order by c.value::text),'[]'::jsonb) from (
     select to_jsonb(r)-array['composition_rule_id','revision','created_at','updated_at','created_by_member_id','updated_by_member_id'] value
     from private.sanctuary_management_composition_rules_v449 r where r.team_id=t.team_id) c)),
 'schedule',jsonb_build_object(
   'rules',(select coalesce(jsonb_agg((to_jsonb(r)-array['revision','created_at','updated_at']) order by r.schedule_id),'[]'::jsonb) from private.sanctuary_management_schedule_rules_v412 r where r.team_id=t.team_id),
   'versions',(select coalesce(jsonb_agg(c.value order by c.value::text),'[]'::jsonb) from (
     select to_jsonb(v)-array['schedule_version_id','revision','created_at','created_by_member_id'] value from private.sanctuary_management_schedule_versions_v437 v where v.team_id=t.team_id) c),
   'exceptions',(select coalesce(jsonb_agg(c.value order by c.value::text),'[]'::jsonb) from (
     select to_jsonb(e)-array['exception_id','created_at','created_by_member_id'] value from private.sanctuary_management_schedule_exceptions_v412 e
     join private.sanctuary_management_schedule_rules_v412 r on r.schedule_id=e.schedule_id where r.team_id=t.team_id) c)))
from private.sanctuary_management_teams_v412 t where t.team_id=p_team_id;
$function$
;
CREATE OR REPLACE FUNCTION private.kinojo_sm_audit_v412(p_actor_member_id bigint, p_team_id bigint, p_entity_type text, p_entity_id bigint, p_action text, p_before jsonb, p_after jsonb, p_request_key text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'private'
AS $function$
  insert into private.sanctuary_management_audit_events_v412(
    actor_member_id,team_id,entity_type,entity_id,action,before_payload,after_payload,request_key
  ) values(p_actor_member_id,p_team_id,p_entity_type,p_entity_id,p_action,p_before,p_after,p_request_key)
$function$
;
CREATE OR REPLACE FUNCTION private.kinojo_sm_force_roster_v451(p_team_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_roster jsonb := private.kinojo_sm_force_roster_v450(p_team_id);
  v_forces jsonb := '[]'::jsonb;
  v_parties jsonb;
  v_slots jsonb;
  v_force jsonb;
  v_party jsonb;
  v_slot jsonb;
  v_locked boolean;
begin
  for v_force in select item from jsonb_array_elements(coalesce(v_roster->'forces', '[]'::jsonb)) source(item) loop
    v_parties := '[]'::jsonb;
    for v_party in select item from jsonb_array_elements(coalesce(v_force->'parties', '[]'::jsonb)) source(item) loop
      v_slots := '[]'::jsonb;
      for v_slot in select item from jsonb_array_elements(coalesce(v_party->'slots', '[]'::jsonb)) source(item) loop
        select placement_locked into strict v_locked
        from private.sanctuary_management_slots_v412
        where slot_id = nullif(v_slot->>'slotId', '')::bigint;
        v_slots := v_slots || jsonb_build_array(v_slot || jsonb_build_object('placementLocked', v_locked));
      end loop;
      v_parties := v_parties || jsonb_build_array((v_party - 'slots') || jsonb_build_object('slots', v_slots));
    end loop;
    v_forces := v_forces || jsonb_build_array((v_force - 'parties') || jsonb_build_object('parties', v_parties));
  end loop;
  return (v_roster - 'forces') || jsonb_build_object('forces', v_forces);
end
$function$
;
CREATE OR REPLACE FUNCTION private.kinojo_sm_public_force_roster_v448(p_team_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_roster jsonb;
  v_forces jsonb := '[]'::jsonb;
  v_force jsonb;
begin
  v_roster := private.kinojo_sm_force_roster_v430(p_team_id);
  for v_force in
    select force_item
      from jsonb_array_elements(coalesce(v_roster->'forces', '[]'::jsonb)) force_list(force_item)
  loop
    v_forces := v_forces || jsonb_build_array(
      v_force || jsonb_build_object(
        'creatorMemberId', null,
        'creatorOwnerResolved', false,
        'creatorAlreadyAssigned', false,
        'creatorCandidateCode', 'LOGIN_REQUIRED',
        'creatorCandidateCount', 0,
        'creatorCandidates', '[]'::jsonb,
        'viewerAlreadyAssigned', false,
        'viewerPending', false,
        'canSupport', false,
        'supportDisabledCode', 'LOGIN_REQUIRED',
        'supportDisabledMessage', '로그인 후 지원할 수 있습니다.'
      )
    );
  end loop;
  return jsonb_set(v_roster, '{forces}', v_forces, true);
end;
$function$
;
CREATE OR REPLACE FUNCTION private.kinojo_sm_recompute_status_v412(p_team_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'private'
AS $function$
declare v_full boolean;
begin
  select count(*)>0 and bool_and(used_count>=10) into v_full
  from (
    select f.force_id,count(s.character_id) used_count
    from private.sanctuary_management_forces_v412 f
    join private.sanctuary_management_slots_v412 s on s.force_id=f.force_id
    where f.team_id=p_team_id group by f.force_id
  ) q;
  update private.sanctuary_management_forces_v412 f set status=case when x.used_count>=10 then 'FULL' else 'OPEN' end
  from (select force_id,count(character_id) used_count from private.sanctuary_management_slots_v412 where team_id=p_team_id group by force_id) x
  where f.force_id=x.force_id and f.status<>'CLOSED'
    and f.status is distinct from case when x.used_count>=10 then 'FULL' else 'OPEN' end;
  update private.sanctuary_management_teams_v412
  set status=case when status='ARCHIVED' then status when v_full then 'FULL' when published_at is null then 'DRAFT' else 'ACTIVE' end
  where team_id=p_team_id
    and status is distinct from case when status='ARCHIVED' then status when v_full then 'FULL' when published_at is null then 'DRAFT' else 'ACTIVE' end;
end
$function$
;
CREATE OR REPLACE FUNCTION private.kinojo_sm_recompute_status_v450(p_team_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_total integer;
  v_occupied integer;
begin
  select count(*)::integer,
         count(*) filter (where character_id is not null or assignment_kind = 'RANDOM_ALT')::integer
    into v_total, v_occupied
    from private.sanctuary_management_slots_v412
   where team_id = p_team_id;
  update private.sanctuary_management_teams_v412
     set status = case when v_total > 0 and v_total = v_occupied then 'FULL' else 'ACTIVE' end,
         updated_at = clock_timestamp()
   where team_id = p_team_id and status in ('ACTIVE', 'FULL');
end
$function$
;
CREATE OR REPLACE FUNCTION private.kinojo_sm_scope_requirements_v452(p_team_id bigint, p_force_id bigint, p_party_id bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with scoped_rules as (
    select rule.*
    from private.sanctuary_management_composition_rules_v449 rule
    where rule.team_id = p_team_id
      and rule.force_id = p_force_id
      and (
        (p_party_id is null and rule.scope_type = 'FORCE' and rule.party_id is null)
        or (p_party_id is not null and rule.scope_type = 'PARTY' and rule.party_id = p_party_id)
      )
  ), evaluated as (
    select rule.composition_rule_id, rule.scope_type, rule.rule_type,
      rule.minimum_count, rule.power_threshold, rule.item_level_threshold,
      count(slot.character_id) filter (
        where slot.character_id is not null and (
          (rule.rule_type = 'MAIN_MIN' and (slot.character_relation = 'MAIN' or coalesce(character.is_main, false)))
          or (rule.rule_type = 'POWER_MIN' and character.latest_pve_combat_power >= rule.power_threshold)
          or (rule.rule_type = 'ITEM_LEVEL_MIN' and character.latest_pve_item_level >= rule.item_level_threshold)
        )
      )::integer matching_count
    from scoped_rules rule
    left join private.sanctuary_management_slots_v412 slot
      on slot.team_id = p_team_id and slot.force_id = p_force_id
     and (p_party_id is null or slot.party_id = p_party_id)
    left join public.character_master character on character.id = slot.character_id
    group by rule.composition_rule_id, rule.scope_type, rule.rule_type,
      rule.minimum_count, rule.power_threshold, rule.item_level_threshold
  )
  select jsonb_build_object(
    'satisfied', coalesce(bool_and(matching_count >= minimum_count), true),
    'ruleCount', count(composition_rule_id)::integer,
    'unsatisfiedCount', count(composition_rule_id) filter (where matching_count < minimum_count)::integer,
    'rules', coalesce(jsonb_agg(jsonb_build_object(
      'compositionRuleId', composition_rule_id,
      'scopeType', scope_type,
      'ruleType', rule_type,
      'minimumCount', minimum_count,
      'powerThreshold', power_threshold,
      'itemLevelThreshold', item_level_threshold,
      'matchingCount', matching_count,
      'satisfied', matching_count >= minimum_count,
      'message', case
        when rule_type = 'MAIN_MIN' then '본캐 ' || minimum_count || '명 이상'
        when rule_type = 'POWER_MIN' then '전투력 ' || trim(to_char(power_threshold / 1000.0, 'FM999999990.0')) || 'K 이상 ' || minimum_count || '명 이상'
        else '아이템레벨 ' || item_level_threshold || ' 이상 ' || minimum_count || '명 이상'
      end
    ) order by rule_type), '[]'::jsonb)
  ) from evaluated
$function$
;
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
 if p_composition is not null and not exists(select 1 from private.sanctuary_management_teams_v412 t
   join public.sanctuary_master m on m.id=t.sanctuary_id where t.team_id=p_team_id and m.code='kaldrix') then
   if exists(select 1 from jsonb_array_elements(p_composition) force_item(value)
     cross join lateral jsonb_array_elements(force_item.value->'slots') slot_item(value)
     where coalesce(slot_item.value->'bossRoles'->>'boss1','')<>'' or coalesce(slot_item.value->'bossRoles'->'boss2','[]'::jsonb)<>'[]'::jsonb) then
     raise exception '역할 부여는 성역3에서만 사용할 수 있습니다.' using errcode='22023';
   end if;
   p_composition:=null;
 end if;
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
CREATE OR REPLACE FUNCTION private.kinojo_sm_boss_roles_v536(p_team_id bigint, p_force_no integer, p_character_id bigint)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select jsonb_build_object('boss1',max(role_code) filter(where boss=1),
 'boss2',coalesce(jsonb_agg(role_code::integer order by role_code::integer) filter(where boss=2),'[]'::jsonb))
 from private.sanctuary_boss_roles_v536 where team_id=p_team_id and force_no=p_force_no and character_id=p_character_id
$function$
;
CREATE OR REPLACE FUNCTION private.kinojo_sm_normalize_slot_character_relation_v463()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_relation text;
  v_root_character_id bigint;
begin
  if new.character_id is null
     or upper(coalesce(new.assignment_kind,'ACTUAL_CHARACTER'))<>'ACTUAL_CHARACTER' then
    return new;
  end if;
  select case
      when owner.character_id is not null and owner.relation in ('MAIN','ALT') then owner.relation
      when owner.character_id is not null and owner.relation='GUEST'
        and not (coalesce(character.is_main,false)
          or coalesce(character.main_character_id,character.id)=character.id) then 'ALT'
      when owner.character_id is not null then 'GUEST'
      when exists(
        select 1 from private.sanctuary_operational_legions_v432 legion
        where legion.is_active
          and lower(btrim(legion.legion_name))=lower(btrim(character.legion_name))
      ) then case
        when coalesce(character.is_main,false)
          or coalesce(character.main_character_id,character.id)=character.id then 'MAIN'
        when character.main_character_id is not null then 'ALT'
        else 'GUEST' end
      else case
        when not (coalesce(character.is_main,false)
          or coalesce(character.main_character_id,character.id)=character.id) then 'ALT'
        else 'GUEST' end
    end,
    coalesce(character.main_character_id,character.id)
  into v_relation,v_root_character_id
  from public.character_master character
  left join private.sanctuary_character_owners_v412 owner
    on owner.character_id=character.id
  where character.id=new.character_id
    and coalesce(character.is_active,true)
    and coalesce(character.identity_status,'CURRENT')='CURRENT';
  if not found then return new; end if;
  new.character_relation:=v_relation;
  new.owner_root_character_id:=v_root_character_id;
  return new;
end
$function$
;
CREATE OR REPLACE FUNCTION private.kinojo_sm_slot_assignment_guard_v450()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_character public.character_master%rowtype;
  v_owner record;
begin
  select * into v_character from public.character_master where id = new.character_id;
  if new.assignment_kind = 'ACTUAL_CHARACTER' and new.character_id is not null then
    if v_character.id is null then
      raise exception '배치할 캐릭터를 찾을 수 없습니다.' using errcode = 'P0001';
    end if;
    if new.required_class_code <> 'ALL'
       and private.kinojo_sm_class_code_v450(v_character.class_name) is distinct from new.required_class_code then
      raise exception '% 전용 슬롯에는 % 캐릭터를 배치할 수 없습니다.',
        private.kinojo_sm_class_label_v450(new.required_class_code), coalesce(v_character.class_name, '클래스 미확인')
        using errcode = 'P0001';
    end if;
  elsif new.assignment_kind = 'RANDOM_ALT' then
    select * into v_owner from private.kinojo_sm_resolve_character_owner_v412(new.owner_root_character_id);
    if v_owner.character_id is null
       or v_owner.root_character_id is distinct from new.owner_root_character_id
       or v_owner.owner_member_id is distinct from new.owner_member_id
       or not exists (select 1 from public.character_master root
      where root.id = new.owner_root_character_id and coalesce(root.is_active, true)
        and not coalesce(root.lookup_excluded, false)
        and coalesce(root.main_character_id, case when root.is_main then root.id end) = root.id) then
      raise exception '랜덤 부캐의 본캐 소유 관계를 확인할 수 없습니다.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end
$function$
;
CREATE OR REPLACE FUNCTION private.kinojo_sm_same_force_character_family_guard_v461()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if exists (
    select 1
      from private.sanctuary_management_slots_v412 slot
     where slot.force_id = new.force_id
       and slot.owner_root_character_id is not null
     group by slot.owner_root_character_id
    having count(*) > 1
  ) then
    raise exception '이미 해당 캐릭터의 본캐(나 부캐)가 이 포스에 소속되어 있습니다.' using errcode = 'P0001';
  end if;
  return new;
end
$function$
;
CREATE OR REPLACE FUNCTION private.kinojo_sm_require_roster_scope(p_credential text, p_team_id bigint, p_balance boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_actor jsonb;v_caps jsonb;
begin
 v_actor:=private.kinojo_sm_actor_v412(p_credential);
 v_caps:=private.kinojo_sm_capabilities(nullif(v_actor->>'memberId','')::bigint,p_team_id);
 perform private.kinojo_sm_assert_capability(v_caps,case when p_team_id is null then 'create' else 'roster' end);
 if p_balance then perform private.kinojo_sm_assert_capability(v_caps,'support'); end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.kinojo_sm_support_batch_payload_v436(p_support_batch_id bigint)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
  select jsonb_build_object(
    'supportBatchId', b.support_batch_id,
    'teamId', b.team_id,
    'requesterMemberId', b.requester_member_id,
    'status', b.status,
    'decisionMemberId', b.decision_member_id,
    'decisionNote', b.decision_note,
    'decidedAt', b.decided_at,
    'createdAt', b.created_at,
    'itemCount', count(i.support_item_id)::integer,
    'appliedCount', count(*) filter (where i.status = 'APPLIED')::integer,
    'pendingCount', count(*) filter (where i.status = 'PENDING')::integer,
    'rejectedCount', count(*) filter (where i.status = 'REJECTED')::integer,
    'cancelledCount', count(*) filter (where i.status = 'CANCELLED')::integer,
    'items', coalesce(jsonb_agg(jsonb_build_object(
      'supportItemId', i.support_item_id,
      'forceId', i.force_id,
      'forceNo', f.force_no,
      'characterId', i.character_id,
      'characterName', c.character_name,
      'serverName', c.server_name,
      'className', c.class_name,
      'status', i.status,
      'appliedSlotId', i.applied_slot_id,
      'resultCode', i.result_code,
      'resultMessage', i.result_message
    ) order by f.force_no, i.support_item_id) filter (where i.support_item_id is not null), '[]'::jsonb)
  )
    from private.sanctuary_management_support_batches_v412 b
    left join private.sanctuary_management_support_items_v412 i on i.support_batch_id = b.support_batch_id
    left join private.sanctuary_management_forces_v412 f on f.force_id = i.force_id
    left join public.character_master c on c.id = i.character_id
   where b.support_batch_id = p_support_batch_id
   group by b.support_batch_id;
$function$
;
CREATE OR REPLACE FUNCTION private.kinojo_sm_touch_v412()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'private'
AS $function$
begin
  new.updated_at=clock_timestamp();
  if tg_argv[0]='revision' then new.revision=old.revision+1; end if;
  return new;
end
$function$
;

CREATE OR REPLACE FUNCTION private.kinojo_sm_support_payload_v452(p_credential text, p_request_key text, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor jsonb := private.kinojo_sm_actor_v412(p_credential); v_actor_id bigint := nullif(v_actor->>'memberId', '')::bigint;
  v_team_id bigint := nullif(p_payload->>'teamId', '')::bigint; v_minimum integer;
  v_assignment jsonb; v_result jsonb := '[]'::jsonb; v_used bigint[] := '{}'::bigint[];
  v_kind text; v_character_id bigint; v_main_id bigint; v_force_id bigint; v_owner record;
begin
  v_minimum := private.kinojo_sm_team_min_item_level_v452(v_team_id);
  for v_assignment in select item from jsonb_array_elements(coalesce(p_payload->'assignments', '[]'::jsonb)) source(item) loop
    v_force_id := nullif(v_assignment->>'forceId', '')::bigint;
    v_kind := upper(coalesce(v_assignment->>'assignmentKind', 'ACTUAL_CHARACTER'));
    if v_kind = 'RANDOM_ALT' then
      v_main_id := nullif(v_assignment->>'mainCharacterId', '')::bigint;
      select * into v_owner from private.kinojo_sm_resolve_character_owner_v412(v_main_id);
      if v_owner.character_id is null or v_owner.owner_member_id is distinct from v_actor_id or v_owner.root_character_id is distinct from v_main_id then
        raise exception '랜덤 부캐를 신청할 본캐 관계를 확인할 수 없습니다.' using errcode = 'P0001';
      end if;
      select character.id into v_character_id
      from public.character_master character
      where character.main_character_id = v_main_id and character.id <> v_main_id
        and coalesce(character.is_active, true) and not coalesce(character.lookup_excluded, false)
        and (v_minimum is null or character.latest_pve_item_level >= v_minimum)
        and not (character.id = any(v_used))
      order by md5(character.id::text || ':' || coalesce(p_request_key, '') || ':' || coalesce(v_force_id::text, '0'))
      limit 1;
      if v_character_id is null then raise exception '해당 성역 아이템레벨을 충족하는 미선택 부캐가 없습니다.' using errcode = 'P0001'; end if;
    else
      v_character_id := nullif(v_assignment->>'characterId', '')::bigint;
      if not private.kinojo_sm_character_eligible_v452(v_character_id, v_minimum) then
        raise exception '해당 성역 아이템레벨을 충족하는 캐릭터만 지원할 수 있습니다.' using errcode = 'P0001';
      end if;
    end if;
    v_used := array_append(v_used, v_character_id);
    v_result := v_result || jsonb_build_array(jsonb_build_object('forceId', v_force_id, 'characterId', v_character_id));
  end loop;
  return (p_payload - 'assignments') || jsonb_build_object('assignments', v_result);
end
$function$
;

CREATE OR REPLACE FUNCTION private.kinojo_sm_support_payload_v454(p_credential text, p_request_key text, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor jsonb := private.kinojo_sm_actor_v412(p_credential);
  v_actor_id bigint := nullif(v_actor->>'memberId', '')::bigint;
  v_assignment jsonb;
  v_result jsonb := '[]'::jsonb;
  v_used bigint[] := '{}'::bigint[];
  v_kind text;
  v_character_id bigint;
  v_main_id bigint;
  v_force_id bigint;
  v_minimum integer;
  v_owner record;
begin
  for v_assignment in
    select item from jsonb_array_elements(coalesce(p_payload->'assignments', '[]'::jsonb)) source(item)
  loop
    v_force_id := nullif(v_assignment->>'forceId', '')::bigint;
    v_minimum := private.kinojo_sm_force_min_item_level_v454(v_force_id);
    v_kind := upper(coalesce(v_assignment->>'assignmentKind', 'ACTUAL_CHARACTER'));
    if v_kind = 'RANDOM_ALT' then
      v_main_id := nullif(v_assignment->>'mainCharacterId', '')::bigint;
      select * into v_owner from private.kinojo_sm_resolve_character_owner_v412(v_main_id);
      if v_owner.character_id is null
         or v_owner.owner_member_id is distinct from v_actor_id
         or v_owner.root_character_id is distinct from v_main_id then
        raise exception '랜덤 부캐를 신청할 본캐 관계를 확인할 수 없습니다.' using errcode = 'P0001';
      end if;
      select character.id into v_character_id
      from public.character_master character
      where character.main_character_id = v_main_id and character.id <> v_main_id
        and coalesce(character.is_active, true) and not coalesce(character.lookup_excluded, false)
        and private.kinojo_sm_character_eligible_v452(character.id, v_minimum)
        and not (character.id = any(v_used))
      order by md5(character.id::text || ':' || coalesce(p_request_key, '') || ':' || coalesce(v_force_id::text, '0'))
      limit 1;
      if v_character_id is null then
        raise exception '해당 포스 아이템레벨을 충족하는 미선택 부캐가 없습니다.' using errcode = 'P0001';
      end if;
    else
      v_character_id := nullif(v_assignment->>'characterId', '')::bigint;
      if not private.kinojo_sm_character_eligible_v452(v_character_id, v_minimum) then
        raise exception '해당 포스 아이템레벨을 충족하는 캐릭터만 지원할 수 있습니다.' using errcode = 'P0001';
      end if;
    end if;
    v_used := array_append(v_used, v_character_id);
    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'forceId', v_force_id,
      'characterId', v_character_id
    ));
  end loop;
  return (p_payload - 'assignments') || jsonb_build_object('assignments', v_result);
end
$function$
;

CREATE OR REPLACE FUNCTION private.kinojo_sm_support_characters_v450(p_team_id bigint, p_actor_member_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_base jsonb := private.kinojo_sm_support_characters_v436(p_team_id, p_actor_member_id);
  v_characters jsonb := '[]'::jsonb;
  v_character jsonb;
  v_force_ids jsonb;
  v_class_code text;
begin
  for v_character in
    select item from jsonb_array_elements(coalesce(v_base->'characters', '[]'::jsonb)) source(item)
  loop
    v_class_code := private.kinojo_sm_class_code_v450(v_character->>'className');
    select coalesce(jsonb_agg(force_id order by force_id), '[]'::jsonb) into v_force_ids
    from (
      select candidate.force_id
      from jsonb_array_elements_text(coalesce(v_character->'availableForceIds', '[]'::jsonb)) raw(force_id_text)
      cross join lateral (select raw.force_id_text::bigint force_id) candidate
      where exists (
        select 1
        from private.sanctuary_management_slots_v412 slot
        where slot.force_id = candidate.force_id
          and slot.assignment_kind = 'ACTUAL_CHARACTER'
          and slot.character_id is null
          and slot.owner_member_id is null
          and (slot.required_class_code = 'ALL' or slot.required_class_code = v_class_code)
      )
    ) eligible;
    v_characters := v_characters || jsonb_build_array(
      v_character || jsonb_build_object(
        'classCode', v_class_code,
        'availableForceIds', v_force_ids,
        'disabledCode', case
          when jsonb_array_length(v_force_ids) = 0 and coalesce(v_character->>'disabledCode', '') = '' then 'NO_CLASS_ELIGIBLE_SLOT'
          else nullif(v_character->>'disabledCode', '')
        end,
        'disabledMessage', case
          when jsonb_array_length(v_force_ids) = 0 and coalesce(v_character->>'disabledCode', '') = '' then '현재 이 클래스가 지원할 수 있는 빈 슬롯이 없습니다.'
          else nullif(v_character->>'disabledMessage', '')
        end
      )
    );
  end loop;
  return (v_base - 'characters' - 'candidateCount') || jsonb_build_object(
    'characters', v_characters,
    'candidateCount', jsonb_array_length(v_characters)
  );
end
$function$
;

CREATE OR REPLACE FUNCTION private.kinojo_sm_support_command_v450(p_credential text, p_request_key text, p_action text, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor jsonb := private.kinojo_sm_actor_v412(p_credential);
  v_actor_id bigint := nullif(v_actor->>'memberId', '')::bigint;
  v_action text := upper(btrim(coalesce(p_action, '')));
  v_request_key text := btrim(coalesce(p_request_key, ''));
  v_hash text;
  v_existing private.sanctuary_management_commands_v412%rowtype;
  v_team private.sanctuary_management_teams_v412%rowtype;
  v_batch private.sanctuary_management_support_batches_v412%rowtype;
  v_item private.sanctuary_management_support_items_v412%rowtype;
  v_owner record;
  v_team_id bigint;
  v_force_id bigint;
  v_character_id bigint;
  v_batch_id bigint;
  v_slot_id bigint;
  v_assignment jsonb;
  v_assignments jsonb;
  v_decision text;
  v_class_code text;
  v_result_code text;
  v_result_message text;
  v_conflicts jsonb;
  v_applied_count integer;
  v_pending_count integer;
  v_rejected_count integer;
  v_cancelled_count integer;
  v_batch_status text;
  v_before jsonb;
  v_after jsonb;
  v_response jsonb;
begin
  if v_action not in ('SUBMIT_SUPPORT', 'DECIDE_SUPPORT') then
    raise exception '지원 처리 작업이 올바르지 않습니다.' using errcode = 'P0001';
  end if;
  perform private.kinojo_sm_assert_pilot_write_v439(p_credential, v_action);
  perform private.kinojo_sm_assert_write_enabled_v412();
  if v_actor_id is null then raise exception '로그인 후 지원 기능을 이용해 주세요.' using errcode = 'P0001'; end if;
  if char_length(v_request_key) not between 8 and 120 then raise exception '요청 키가 올바르지 않습니다.' using errcode = 'P0001'; end if;
  v_hash := encode(sha256(convert_to(v_action || ':' || coalesce(p_payload, '{}'::jsonb)::text, 'UTF8')), 'hex');
  perform pg_advisory_xact_lock(hashtextextended('sanctuary-management:' || v_actor_id || ':' || v_request_key, 450));
  select * into v_existing
    from private.sanctuary_management_commands_v412
   where actor_member_id = v_actor_id and request_key = v_request_key;
  if v_existing.command_id is not null then
    if v_existing.request_hash <> v_hash or v_existing.action <> v_action then
      raise exception '같은 요청 키가 다른 작업에 사용되었습니다.' using errcode = 'P0001';
    end if;
    return v_existing.response_payload || jsonb_build_object('replayed', true, 'apiVersion', 2.0, 'schemaVersion', 450, 'databaseContract', 450);
  end if;

  if v_action = 'SUBMIT_SUPPORT' then
    v_team_id := nullif(p_payload->>'teamId', '')::bigint;
    select * into v_team from private.sanctuary_management_teams_v412 where team_id = v_team_id for update;
    if v_team.team_id is null or v_team.team_mode <> 'PARTICIPATION' or v_team.status not in ('ACTIVE', 'FULL') then
      raise exception '현재 지원할 수 없는 팀입니다.' using errcode = 'P0001';
    end if;
    v_assignments := coalesce(p_payload->'assignments', '[]'::jsonb);
    if jsonb_typeof(v_assignments) <> 'array' or jsonb_array_length(v_assignments) not between 1 and 9 then
      raise exception '지원할 포스와 캐릭터를 하나 이상 선택해 주세요.' using errcode = 'P0001';
    end if;
    if (select count(distinct nullif(item->>'forceId', '')::bigint) <> count(*)
             or count(distinct nullif(item->>'characterId', '')::bigint) <> count(*)
          from jsonb_array_elements(v_assignments) item) then
      raise exception '포스와 캐릭터는 1:1로 중복 없이 선택해 주세요.' using errcode = 'P0001';
    end if;

    insert into private.sanctuary_management_support_batches_v412(team_id, requester_member_id, request_key, status)
    values (v_team_id, v_actor_id, v_request_key, case when v_team.join_policy = 'INSTANT' then 'APPLIED' else 'PENDING' end)
    returning * into v_batch;
    v_batch_id := v_batch.support_batch_id;

    for v_assignment in
      select item from jsonb_array_elements(v_assignments) with ordinality source(item, ordinality) order by ordinality
    loop
      v_force_id := nullif(v_assignment->>'forceId', '')::bigint;
      v_character_id := nullif(v_assignment->>'characterId', '')::bigint;
      if v_force_id is null or v_character_id is null or not exists (
        select 1 from private.sanctuary_management_forces_v412 where force_id = v_force_id and team_id = v_team_id
      ) then raise exception '지원할 포스와 캐릭터 식별값을 다시 확인해 주세요.' using errcode = 'P0001'; end if;
      select * into v_owner from private.kinojo_sm_resolve_character_owner_v412(v_character_id);
      if v_owner.character_id is null or v_owner.owner_member_id is distinct from v_actor_id then
        raise exception '본인이 소유한 캐릭터만 지원할 수 있습니다.' using errcode = 'P0001';
      end if;
      select private.kinojo_sm_class_code_v450(class_name) into v_class_code from public.character_master where id = v_character_id;
      if v_class_code is null then raise exception '캐릭터 클래스를 확인할 수 없습니다.' using errcode = 'P0001'; end if;
      v_result_code := null; v_result_message := null; v_slot_id := null;
      if exists(select 1 from private.sanctuary_management_slots_v412 where team_id = v_team_id and character_id = v_character_id) then
        v_result_code := 'CHARACTER_ALREADY_IN_TEAM'; v_result_message := '이 캐릭터는 이미 같은 팀의 다른 포스에 참여하고 있습니다.';
      elsif exists(select 1 from private.sanctuary_management_slots_v412 where force_id = v_force_id and owner_member_id = v_actor_id) then
        v_result_code := 'OWNER_ALREADY_IN_FORCE'; v_result_message := '이 포스에는 이미 본인의 캐릭터가 참여하고 있습니다.';
      elsif exists(
        select 1 from private.sanctuary_management_support_items_v412 item
        join private.sanctuary_management_support_batches_v412 batch on batch.support_batch_id = item.support_batch_id
        where batch.team_id = v_team_id and batch.requester_member_id = v_actor_id and item.force_id = v_force_id and item.status = 'PENDING'
      ) then
        v_result_code := 'SUPPORT_ALREADY_PENDING'; v_result_message := '이 포스에는 이미 승인 대기 중인 지원이 있습니다.';
      else
        v_conflicts := private.kinojo_sm_conflicts_for_participant_v412(v_team_id, v_actor_id, v_owner.root_character_id);
        if jsonb_array_length(v_conflicts) > 0 then
          v_result_code := 'SCHEDULE_CONFLICT'; v_result_message := v_conflicts->0->>'message';
        elsif not exists (
          select 1 from private.sanctuary_management_slots_v412 slot
          where slot.force_id = v_force_id and slot.assignment_kind = 'ACTUAL_CHARACTER'
            and slot.character_id is null and slot.owner_member_id is null
            and (slot.required_class_code = 'ALL' or slot.required_class_code = v_class_code)
        ) then
          v_result_code := 'NO_CLASS_ELIGIBLE_SLOT'; v_result_message := '현재 이 클래스가 지원할 수 있는 빈 슬롯이 없습니다.';
        end if;
      end if;
      if v_result_code is null and v_team.join_policy = 'INSTANT' then
        select slot.slot_id into v_slot_id
          from private.sanctuary_management_slots_v412 slot
          join private.sanctuary_management_parties_v412 party on party.party_id = slot.party_id
         where slot.force_id = v_force_id and slot.assignment_kind = 'ACTUAL_CHARACTER'
           and slot.character_id is null and slot.owner_member_id is null
           and (slot.required_class_code = 'ALL' or slot.required_class_code = v_class_code)
         order by party.party_no, slot.slot_no limit 1 for update of slot;
        if v_slot_id is null then
          v_result_code := 'NO_CLASS_ELIGIBLE_SLOT'; v_result_message := '지원 처리 중 이 클래스가 들어갈 빈 슬롯이 없어졌습니다.';
        else
          update private.sanctuary_management_slots_v412 set
            character_id = v_character_id, owner_member_id = v_actor_id,
            owner_root_character_id = v_owner.root_character_id, character_relation = v_owner.relation,
            added_by_member_id = v_actor_id, assignment_kind = 'ACTUAL_CHARACTER'
          where slot_id = v_slot_id;
        end if;
      end if;
      insert into private.sanctuary_management_support_items_v412(
        support_batch_id, force_id, character_id, owner_member_id, owner_root_character_id,
        status, applied_slot_id, result_code, result_message
      ) values (
        v_batch_id, v_force_id, v_character_id, v_actor_id, v_owner.root_character_id,
        case when v_result_code is not null then 'REJECTED' when v_team.join_policy = 'INSTANT' then 'APPLIED' else 'PENDING' end,
        v_slot_id,
        coalesce(v_result_code, case when v_team.join_policy = 'INSTANT' then 'APPLIED' else 'PENDING_APPROVAL' end),
        coalesce(v_result_message, case when v_team.join_policy = 'INSTANT' then '클래스 조건에 맞는 빈 슬롯에 즉시 배치했습니다.' else '팀 승인을 기다리고 있습니다.' end)
      );
    end loop;
    select count(*) filter(where status = 'APPLIED')::integer,
           count(*) filter(where status = 'PENDING')::integer,
           count(*) filter(where status = 'REJECTED')::integer
      into v_applied_count, v_pending_count, v_rejected_count
      from private.sanctuary_management_support_items_v412 where support_batch_id = v_batch_id;
    v_batch_status := case
      when v_team.join_policy = 'INSTANT' and v_applied_count > 0 and v_rejected_count = 0 then 'APPLIED'
      when v_team.join_policy = 'APPROVAL' and v_pending_count > 0 and v_rejected_count = 0 then 'PENDING'
      when (v_applied_count > 0 or v_pending_count > 0) and v_rejected_count > 0 then 'PARTIAL'
      else 'REJECTED' end;
    update private.sanctuary_management_support_batches_v412 set status = v_batch_status, updated_at = clock_timestamp() where support_batch_id = v_batch_id;
    perform private.kinojo_sm_recompute_status_v450(v_team_id);
    v_response := jsonb_build_object('ok', true, 'action', v_action, 'teamId', v_team_id, 'joinPolicy', v_team.join_policy, 'batch', private.kinojo_sm_support_batch_payload_v436(v_batch_id));
    perform private.kinojo_sm_audit_v412(v_actor_id, v_team_id, 'SUPPORT_BATCH', v_batch_id, v_action, null, v_response, v_request_key);
  else
    v_batch_id := nullif(p_payload->>'supportBatchId', '')::bigint;
    v_decision := upper(btrim(coalesce(p_payload->>'decision', '')));
    if v_decision not in ('APPROVE', 'REJECT') then raise exception '승인 또는 거절을 선택해 주세요.' using errcode = 'P0001'; end if;
    select * into v_batch from private.sanctuary_management_support_batches_v412 where support_batch_id = v_batch_id for update;
    if v_batch.support_batch_id is null then raise exception '지원 요청을 찾을 수 없습니다.' using errcode = 'P0001'; end if;
    v_team_id := v_batch.team_id;
    select * into v_team from private.sanctuary_management_teams_v412 where team_id = v_team_id for update;
    if v_team.team_id is null or not private.kinojo_sm_can_manage_team_v412(v_actor, v_team_id) then raise exception '지원 요청을 처리할 권한이 없습니다.' using errcode = 'P0001'; end if;
    if v_batch.status not in ('PENDING', 'PARTIAL') or not exists(
      select 1 from private.sanctuary_management_support_items_v412 where support_batch_id = v_batch_id and status = 'PENDING'
    ) then raise exception '이미 처리가 끝난 지원 요청입니다.' using errcode = 'P0001'; end if;
    v_before := private.kinojo_sm_support_batch_payload_v436(v_batch_id);
    if v_decision = 'REJECT' then
      update private.sanctuary_management_support_items_v412 set
        status = 'REJECTED', result_code = 'REJECTED_BY_MANAGER',
        result_message = coalesce(nullif(left(btrim(p_payload->>'note'), 240), ''), '팀 운영자가 지원을 거절했습니다.'),
        updated_at = clock_timestamp()
      where support_batch_id = v_batch_id and status = 'PENDING';
    else
      for v_item in
        select * from private.sanctuary_management_support_items_v412
        where support_batch_id = v_batch_id and status = 'PENDING' order by support_item_id for update
      loop
        v_result_code := null; v_result_message := null; v_slot_id := null;
        select * into v_owner from private.kinojo_sm_resolve_character_owner_v412(v_item.character_id);
        select private.kinojo_sm_class_code_v450(class_name) into v_class_code from public.character_master where id = v_item.character_id;
        if v_owner.character_id is null or v_owner.owner_member_id is distinct from v_item.owner_member_id then
          v_result_code := 'CHARACTER_OWNERSHIP_CHANGED'; v_result_message := '캐릭터 소유 관계가 변경되어 승인할 수 없습니다.';
        elsif v_class_code is null then
          v_result_code := 'CHARACTER_CLASS_UNKNOWN'; v_result_message := '캐릭터 클래스를 확인할 수 없어 승인할 수 없습니다.';
        elsif exists(select 1 from private.sanctuary_management_slots_v412 where team_id = v_team_id and character_id = v_item.character_id) then
          v_result_code := 'CHARACTER_ALREADY_IN_TEAM'; v_result_message := '이 캐릭터는 이미 같은 팀의 다른 포스에 참여하고 있습니다.';
        elsif exists(select 1 from private.sanctuary_management_slots_v412 where force_id = v_item.force_id and owner_member_id = v_item.owner_member_id) then
          v_result_code := 'OWNER_ALREADY_IN_FORCE'; v_result_message := '이 포스에는 이미 같은 이용자의 캐릭터가 참여하고 있습니다.';
        else
          v_conflicts := private.kinojo_sm_conflicts_for_participant_v412(v_team_id, v_item.owner_member_id, v_item.owner_root_character_id);
          if jsonb_array_length(v_conflicts) > 0 then v_result_code := 'SCHEDULE_CONFLICT'; v_result_message := v_conflicts->0->>'message'; end if;
        end if;
        if v_result_code is null then
          select slot.slot_id into v_slot_id
            from private.sanctuary_management_slots_v412 slot
            join private.sanctuary_management_parties_v412 party on party.party_id = slot.party_id
           where slot.force_id = v_item.force_id and slot.assignment_kind = 'ACTUAL_CHARACTER'
             and slot.character_id is null and slot.owner_member_id is null
             and (slot.required_class_code = 'ALL' or slot.required_class_code = v_class_code)
           order by party.party_no, slot.slot_no limit 1 for update of slot;
          if v_slot_id is null then
            v_result_code := 'NO_CLASS_ELIGIBLE_SLOT'; v_result_message := '승인 시점에 이 클래스가 들어갈 빈 슬롯이 없습니다.';
          else
            update private.sanctuary_management_slots_v412 set
              character_id = v_item.character_id, owner_member_id = v_item.owner_member_id,
              owner_root_character_id = v_item.owner_root_character_id, character_relation = v_owner.relation,
              added_by_member_id = v_actor_id, assignment_kind = 'ACTUAL_CHARACTER'
            where slot_id = v_slot_id;
          end if;
        end if;
        update private.sanctuary_management_support_items_v412 set
          status = case when v_result_code is null then 'APPLIED' else 'REJECTED' end,
          applied_slot_id = v_slot_id, result_code = coalesce(v_result_code, 'APPROVED'),
          result_message = coalesce(v_result_message, '팀 승인을 완료하고 클래스 조건에 맞는 빈 슬롯에 배치했습니다.'),
          updated_at = clock_timestamp()
        where support_item_id = v_item.support_item_id;
      end loop;
    end if;
    select count(*) filter(where status = 'APPLIED')::integer,
           count(*) filter(where status = 'PENDING')::integer,
           count(*) filter(where status = 'REJECTED')::integer,
           count(*) filter(where status = 'CANCELLED')::integer
      into v_applied_count, v_pending_count, v_rejected_count, v_cancelled_count
      from private.sanctuary_management_support_items_v412 where support_batch_id = v_batch_id;
    v_batch_status := case when v_pending_count > 0 then 'PARTIAL'
      when v_applied_count > 0 and (v_rejected_count > 0 or v_cancelled_count > 0) then 'PARTIAL'
      when v_applied_count > 0 then 'APPLIED' else 'REJECTED' end;
    update private.sanctuary_management_support_batches_v412 set
      status = v_batch_status, decision_member_id = v_actor_id,
      decision_note = nullif(left(btrim(p_payload->>'note'), 240), ''), decided_at = clock_timestamp(), updated_at = clock_timestamp()
    where support_batch_id = v_batch_id;
    perform private.kinojo_sm_recompute_status_v450(v_team_id);
    v_after := private.kinojo_sm_support_batch_payload_v436(v_batch_id);
    v_response := jsonb_build_object('ok', true, 'action', v_action, 'teamId', v_team_id, 'decision', v_decision, 'batch', v_after);
    perform private.kinojo_sm_audit_v412(v_actor_id, v_team_id, 'SUPPORT_BATCH', v_batch_id, v_action, v_before, v_after, v_request_key);
  end if;
  insert into private.sanctuary_management_commands_v412(actor_member_id, request_key, action, request_hash, response_payload)
  values (v_actor_id, v_request_key, v_action, v_hash, v_response);
  return v_response || jsonb_build_object('replayed', false, 'apiVersion', 2.0, 'schemaVersion', 450, 'databaseContract', 450);
end
$function$
;

CREATE OR REPLACE FUNCTION private.kinojo_sm_materialize_candidate_v480(p_candidate_id uuid, p_actor_member_id bigint, p_family_relation text, p_main_character_id bigint DEFAULT NULL::bigint)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_candidate private.sanctuary_management_official_candidates_v432%rowtype;
  v_character_id bigint;
  v_power integer;
  v_item_level integer;
  v_now timestamptz := clock_timestamp();
begin
  select * into v_candidate
  from private.sanctuary_management_official_candidates_v432
  where candidate_id=p_candidate_id
  for update;

  if v_candidate.candidate_id is null
     or v_candidate.actor_member_id<>p_actor_member_id then
    raise exception '공식 조회 결과를 확인할 수 없습니다.' using errcode='P0001';
  end if;
  if v_candidate.state='MATERIALIZED' and v_candidate.materialized_character_id is not null then
    if not exists(
      select 1 from public.character_master character
      where character.id=v_candidate.materialized_character_id
        and coalesce(character.main_character_id,character.id)=
          case when upper(p_family_relation)='ALT' then p_main_character_id else character.id end
    ) then
      raise exception '이미 확정된 캐릭터 관계가 다릅니다. 다시 조회해 주세요.' using errcode='P0001';
    end if;
    return v_candidate.materialized_character_id;
  end if;
  if v_candidate.state<>'VERIFIED' or v_candidate.expires_at<=v_now then
    update private.sanctuary_management_official_candidates_v432
       set state='EXPIRED',updated_at=v_now
     where candidate_id=p_candidate_id and state='VERIFIED';
    raise exception '공식 조회 결과가 만료되었습니다. 다시 조회해 주세요.' using errcode='P0001';
  end if;
  if upper(coalesce(p_family_relation,'')) not in ('MAIN','ALT')
     or (upper(p_family_relation)='ALT' and p_main_character_id is null) then
    raise exception '본캐·부캐 관계를 다시 확인해 주세요.' using errcode='P0001';
  end if;

  v_power := nullif(v_candidate.official_payload->>'pveCombatPower','')::integer;
  v_item_level := nullif(v_candidate.official_payload->>'pveItemLevel','')::integer;
  perform pg_advisory_xact_lock(hashtextextended(
    'sm-character:'||v_candidate.server_id||':'||public.kinojo_character_identity_key_v298(v_candidate.character_name),480
  ));

  select id into v_character_id
  from public.character_master
  where server_id=v_candidate.server_id
    and public.kinojo_character_identity_key_v298(character_name)
      =public.kinojo_character_identity_key_v298(v_candidate.character_name)
  order by is_active desc,(identity_status='CURRENT') desc,updated_at desc
  limit 1;

  if v_character_id is null then
    insert into public.character_master(
      server_id,server_name,character_name,char_key,profile_image_url,detail_url,
      image_updated_at,status,error_message,main_character_name,is_main,class_name,
      list_row,first_seen_at,last_seen_at,is_active,lookup_excluded,visibility_excluded,
      lookup_failure_streak,lookup_failure_total,last_lookup_success_at,main_character_id,
      identity_status,identity_verified_at,bootstrap_source,bootstrap_imported_at,
      legion_name,legion_updated_at,latest_pve_combat_power,latest_pve_item_level,last_synced_at
    ) values (
      v_candidate.server_id,v_candidate.server_name,v_candidate.character_name,v_candidate.char_key,
      v_candidate.profile_image_url,v_candidate.detail_url,v_now,'OK',null,
      case when upper(p_family_relation)='ALT' then
        (select character_name from public.character_master where id=p_main_character_id)
        else v_candidate.character_name end,
      upper(p_family_relation)='MAIN',v_candidate.class_name,null,v_now,v_now,true,false,false,
      0,0,v_now,case when upper(p_family_relation)='ALT' then p_main_character_id else null end,
      'CURRENT',v_now,'SANCTUARY_MANAGEMENT_OFFICIAL_V480',v_now,v_candidate.legion_name,v_now,
      v_power,v_item_level,v_now
    ) returning id into v_character_id;
  else
    if exists(
      select 1 from public.character_master character
      where character.id=v_character_id and character.is_active and character.identity_status='CURRENT'
        and coalesce(character.main_character_id,character.id)<>
          case when upper(p_family_relation)='ALT' then p_main_character_id else character.id end
    ) then
      raise exception '조회 후 캐릭터 관계가 변경되었습니다. 다시 조회해 주세요.' using errcode='P0001';
    end if;
    update public.character_master
       set server_name=v_candidate.server_name,
           char_key=coalesce(nullif(v_candidate.char_key,''),char_key),
           profile_image_url=coalesce(v_candidate.profile_image_url,profile_image_url),
           detail_url=coalesce(nullif(v_candidate.detail_url,''),detail_url),
           class_name=coalesce(nullif(v_candidate.class_name,''),class_name),
           legion_name=v_candidate.legion_name,legion_updated_at=v_now,
           latest_pve_combat_power=coalesce(v_power,latest_pve_combat_power),
           latest_pve_item_level=coalesce(v_item_level,latest_pve_item_level),
           status='OK',is_active=true,identity_status='CURRENT',identity_verified_at=v_now,
           last_lookup_success_at=v_now,last_synced_at=v_now,updated_at=v_now
     where id=v_character_id;
  end if;

  update private.sanctuary_management_official_candidates_v432
     set state='MATERIALIZED',materialized_character_id=v_character_id,
         materialized_at=v_now,updated_at=v_now
   where candidate_id=p_candidate_id;
  return v_character_id;
end
$function$
;

CREATE OR REPLACE FUNCTION public.kinojo_sanctuary_management_archive_preview_v437(p_credential text, p_team_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare v_actor jsonb; v_team private.sanctuary_management_teams_v412%rowtype; v_schedule_id bigint; v_pending integer; v_future integer; v_recurring boolean;
begin
  v_actor:=private.kinojo_sm_actor_v412(p_credential);
  select * into v_team from private.sanctuary_management_teams_v412 where team_id=p_team_id;
  if v_team.team_id is null or not private.kinojo_sm_can_archive_team(v_actor,p_team_id) then raise exception '팀 해산 영향을 확인할 권한이 없습니다.' using errcode='P0001'; end if;
  select schedule_id,(schedule_kind='WEEKLY') into v_schedule_id,v_recurring from private.sanctuary_management_schedule_rules_v412 where team_id=p_team_id;
  select count(*)::integer into v_pending from private.sanctuary_management_support_items_v412 i
    join private.sanctuary_management_support_batches_v412 b on b.support_batch_id=i.support_batch_id
    where b.team_id=p_team_id and i.status='PENDING';
  select count(*)::integer into v_future from private.kinojo_sm_rule_occurrences_v437(v_schedule_id,current_date,current_date+366) o;
  return jsonb_build_object('ok',true,'schemaVersion',437,'teamId',p_team_id,'teamTitle',v_team.title,'revision',v_team.revision,
    'canArchive',true,'futureOccurrenceCount',v_future,'futureWindowDays',366,'recurringSchedule',coalesce(v_recurring,false),
    'pendingSupportCount',v_pending,'historyPreserved',true,'message','팀 편성·감사 이력은 보존하고 이후 일정과 승인 대기 지원을 종료합니다.');
end;
$function$
;

CREATE OR REPLACE FUNCTION private.kinojo_sm_can_archive_team(p_actor jsonb, p_team_id bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select coalesce((private.kinojo_sm_capabilities(nullif(p_actor->>'memberId','')::bigint,p_team_id)->>'canArchive')::boolean,false);
$function$
;
