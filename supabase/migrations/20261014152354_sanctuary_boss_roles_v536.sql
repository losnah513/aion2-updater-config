-- SQL536: reuse authenticated SAVE_COMPOSITION and its lease/revision/idempotency.
set local lock_timeout='3s';
set local statement_timeout='15s';
create table private.sanctuary_boss_roles_v536 (
 team_id bigint not null references private.sanctuary_management_teams_v412(team_id) on delete cascade,
 force_no integer not null check(force_no between 1 and 9),
 character_id bigint not null references public.character_master(id),
 boss integer not null check(boss in (1,2)),
 ordinal integer not null,
 role_code text not null,
 check((boss=1 and ordinal=1 and role_code in ('3>3','6>6','9>12','12>9')) or
       (boss=2 and ordinal between 1 and 2 and role_code in ('1','2','3','4','5','6','7','8','9','10','11','12'))),
 primary key(team_id,force_no,character_id,boss,ordinal),
 unique(team_id,force_no,boss,role_code)
);
alter table private.sanctuary_boss_roles_v536 enable row level security;
revoke all on private.sanctuary_boss_roles_v536 from public,anon,authenticated,service_role;
create function private.kinojo_sm_boss_roles_v536(p_team_id bigint,p_force_no integer,p_character_id bigint)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('boss1',max(role_code) filter(where boss=1),
 'boss2',coalesce(jsonb_agg(role_code::integer order by role_code::integer) filter(where boss=2),'[]'::jsonb))
 from private.sanctuary_boss_roles_v536 where team_id=p_team_id and force_no=p_force_no and character_id=p_character_id
$$;
revoke all on function private.kinojo_sm_boss_roles_v536(bigint,integer,bigint) from public,anon,authenticated,service_role;
create function private.kinojo_sm_save_boss_roles_v536(p_actor bigint,p_team_id bigint,p_composition jsonb,p_request_key text)
returns void language plpgsql security definer set search_path='' as $$
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
end $$;
revoke all on function private.kinojo_sm_save_boss_roles_v536(bigint,bigint,jsonb,text) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.kinojo_sm_force_roster_v430(p_team_id bigint)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
  with party_rows as (
    select
      p.force_id,
      p.party_no,
      p.capacity,
      count(s.slot_id)::integer as slot_count,
      count(s.character_id)::integer as occupied_count,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'slotId', s.slot_id,
            'slotNo', s.slot_no,
            'occupied', s.character_id is not null,
            'revision', s.revision,
            'bossRoles', private.kinojo_sm_boss_roles_v536(p_team_id,(select force_no from private.sanctuary_management_forces_v412 where force_id=p.force_id),s.character_id),
            'character', case
              when s.character_id is null then null
              else jsonb_build_object(
                'characterId', s.character_id,
                'mainCharacterId', s.owner_root_character_id,
                'ownerMemberId', s.owner_member_id,
                'name', c.character_name,
                'serverId', c.server_id,
                'serverName', c.server_name,
                'className', c.class_name,
                'profileImageUrl', c.profile_image_url,
                'power', c.latest_pve_combat_power,
                'mainCharacterName', c.main_character_name,
                'isMain', coalesce(c.is_main, false),
                'relation', s.character_relation
              )
            end
          )
          order by s.slot_no
        ) filter (where s.slot_id is not null),
        '[]'::jsonb
      ) as slots
    from private.sanctuary_management_parties_v412 p
    left join private.sanctuary_management_slots_v412 s
      on s.party_id = p.party_id
    left join public.character_master c
      on c.id = s.character_id
    where p.team_id = p_team_id
    group by p.force_id, p.party_id, p.party_no, p.capacity
  ),
  force_rows as (
    select
      f.force_id,
      f.force_no,
      f.capacity,
      f.status,
      f.revision,
      coalesce(sum(pr.slot_count), 0)::integer as slot_count,
      coalesce(sum(pr.occupied_count), 0)::integer as occupied_count,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'partyId', p.party_id,
            'partyNo', p.party_no,
            'capacity', p.capacity,
            'occupiedCount', coalesce(pr.occupied_count, 0),
            'vacancyCount', greatest(p.capacity - coalesce(pr.occupied_count, 0), 0),
            'slots', coalesce(pr.slots, '[]'::jsonb)
          )
          order by p.party_no
        ) filter (where p.party_id is not null),
        '[]'::jsonb
      ) as parties
    from private.sanctuary_management_forces_v412 f
    left join private.sanctuary_management_parties_v412 p
      on p.force_id = f.force_id
    left join party_rows pr
      on pr.force_id = f.force_id
     and pr.party_no = p.party_no
    where f.team_id = p_team_id
    group by f.force_id, f.force_no, f.capacity, f.status, f.revision
  )
  select jsonb_build_object(
    'forceCount', count(*)::integer,
    'slotCount', coalesce(sum(fr.slot_count), 0)::integer,
    'occupiedCount', coalesce(sum(fr.occupied_count), 0)::integer,
    'vacancyCount', coalesce(sum(greatest(fr.capacity - fr.occupied_count, 0)), 0)::integer,
    'forces', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'forceId', fr.force_id,
          'forceNo', fr.force_no,
          'capacity', fr.capacity,
          'status', fr.status,
          'revision', fr.revision,
          'occupiedCount', fr.occupied_count,
          'vacancyCount', greatest(fr.capacity - fr.occupied_count, 0),
          'parties', fr.parties
        )
        order by fr.force_no
      ) filter (where fr.force_id is not null),
      '[]'::jsonb
    )
  )
  from force_rows fr;
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
