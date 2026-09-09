-- Stage14: deploy only with the management command/UI cutover.
begin;

create table private.sanctuary_permission_audit (
  audit_id bigint generated always as identity primary key,
  actor_member_id bigint not null references public.member_codes(id),
  event_kind text not null check(event_kind in ('ROLE_PERMISSION','TEAM_OPERATOR')),
  target jsonb not null,
  before_value jsonb not null,
  after_value jsonb not null,
  created_at timestamptz not null default clock_timestamp()
);
create index sanctuary_permission_audit_actor_idx on private.sanctuary_permission_audit(actor_member_id,created_at desc);
alter table private.sanctuary_permission_audit enable row level security;
revoke all on private.sanctuary_permission_audit from public,anon,authenticated;
grant select,insert on private.sanctuary_permission_audit to service_role;

-- Authenticate every request, including reads and no-op retries. Never accept a client role.
create function private.kinojo_sm_require_master(p_credential text)
returns bigint language plpgsql security invoker set search_path='' as $$
declare v_member public.member_codes%rowtype;
begin
  select * into v_member from public.kinojo_member_from_web_credential_v326(p_credential) limit 1;
  if not found or v_member.is_active is not true then
    raise exception '로그인 세션을 확인하지 못했습니다.' using errcode='42501';
  end if;
  if public.kinojo_normalize_role(v_member.role,coalesce(v_member.level,0)) is distinct from 'MASTER' then
    raise exception 'Master만 권한과 운영자를 변경할 수 있습니다.' using errcode='42501';
  end if;
  return v_member.id;
end;
$$;

create function private.kinojo_sm_permission_catalog()
returns table(permission_key text,label text,description text,display_order integer)
language sql immutable security invoker set search_path='' as $$
  values
  ('sanctuary_team_create','팀 생성','생성자는 자기 팀의 정보·편성·일정·지원·해산 권한을 유지합니다.',10),
  ('sanctuary_info_manage_assigned','팀 정보 · 담당','지정된 팀의 이름·유형·참가 방식을 변경합니다.',20),
  ('sanctuary_info_manage_all','팀 정보 · 전체','모든 팀의 이름·유형·참가 방식을 변경합니다.',21),
  ('sanctuary_roster_manage_assigned','포스 편성 · 담당','지정된 팀의 캐릭터·클래스 슬롯·배치 조건·난이도를 편집합니다.',30),
  ('sanctuary_roster_manage_all','포스 편성 · 전체','모든 팀의 포스 편성을 편집합니다.',31),
  ('sanctuary_schedule_manage_assigned','일정 · 담당','실제 운영자로 지정된 팀의 일정만 관리합니다.',40),
  ('sanctuary_schedule_manage_all','일정 · 전체','모든 팀의 일정을 관리합니다.',41),
  ('sanctuary_support_manage_assigned','지원 처리 · 담당','지정된 팀의 지원을 승인·거절합니다. 지원 취소를 동반한 유형 변경에도 필요합니다.',50),
  ('sanctuary_support_manage_all','지원 처리 · 전체','모든 팀의 지원을 승인·거절합니다.',51),
  ('sanctuary_archive_manage_assigned','팀 해산 · 담당','지정된 팀을 해산합니다.',60),
  ('sanctuary_archive_manage_all','팀 해산 · 전체','모든 팀을 해산합니다.',61);
$$;

-- Hash includes preserved legacy bits: a concurrent legacy change also invalidates the view.
insert into public.sanctuary_permission_catalog(permission_key,permission_label,description,display_order,enabled)
  select permission_key,label,description,display_order,true from private.kinojo_sm_permission_catalog()
  on conflict(permission_key) do nothing;

create function private.kinojo_sm_permission_revision()
returns text language sql stable security invoker set search_path='' as $$
 select md5(coalesce(string_agg(role_key||':'||permission_key||':'||enabled::text,
   '|' order by role_key,permission_key),'')) from public.sanctuary_role_permissions;
$$;

create function public.kinojo_admin_sanctuary_permissions_v2(p_credential text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor bigint; v_items jsonb;
begin
  v_actor:=private.kinojo_sm_require_master(p_credential);
  select jsonb_agg(jsonb_build_object('permissionKey',c.permission_key,'label',c.label,
    'description',c.description,'displayOrder',c.display_order,'roles',(
      select jsonb_object_agg(r,case when r='MASTER' then true else coalesce(rp.enabled,
        case when c.permission_key='sanctuary_info_manage_all' then legacy.enabled end,
        case when c.permission_key='sanctuary_team_create' then true
          when c.permission_key like 'sanctuary_support_%' or c.permission_key like 'sanctuary_archive_%'
          then r in ('MANAGER','SUB_MASTER') else false end) end)
      from unnest(array['MEMBER','STAFF','MANAGER','SUB_MASTER','MASTER']) r
      left join public.sanctuary_role_permissions rp on rp.role_key=r and rp.permission_key=c.permission_key
      left join public.sanctuary_role_permissions legacy on legacy.role_key=r and legacy.permission_key='sanctuary_team_name_edit'
    )) order by c.display_order) into v_items from private.kinojo_sm_permission_catalog() c;
  return jsonb_build_object('ok',true,'databaseContract','SANCTUARY_PERMISSIONS_V2',
    'revision',private.kinojo_sm_permission_revision(),
    'roles',jsonb_build_array('MEMBER','STAFF','MANAGER','SUB_MASTER','MASTER'),'items',v_items,
    'operatorPolicy','MASTER_ONLY','legacyExceptionsPreserved',true);
end;
$$;

create function public.kinojo_admin_sanctuary_permission_set_v2(
  p_credential text,p_role_key text,p_permission_key text,p_enabled boolean,p_expected_revision text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor bigint; v_before boolean; v_revision text;
begin
  v_actor:=private.kinojo_sm_require_master(p_credential);
  if p_role_key is null or p_role_key not in ('MEMBER','STAFF','MANAGER','SUB_MASTER')
    or p_enabled is null or not exists(select 1 from private.kinojo_sm_permission_catalog() c where c.permission_key=p_permission_key) then
    raise exception '변경할 권한 항목을 확인해 주세요.' using errcode='22023';
  end if;
  -- Covers old writers as well as new RPCs without relying on a cooperative advisory lock.
  lock table public.sanctuary_role_permissions in share row exclusive mode;
  v_revision:=private.kinojo_sm_permission_revision();
  if p_expected_revision is distinct from v_revision then
    raise exception '권한이 변경되었습니다. 다시 불러온 뒤 저장해 주세요.' using errcode='40001';
  end if;
  select (item->'roles'->>p_role_key)::boolean into v_before
    from jsonb_array_elements(public.kinojo_admin_sanctuary_permissions_v2(p_credential)->'items') item
    where item->>'permissionKey'=p_permission_key;
  if v_before is not distinct from p_enabled then return public.kinojo_admin_sanctuary_permissions_v2(p_credential); end if;
  insert into public.sanctuary_role_permissions(role_key,permission_key,enabled,updated_by_member_id,updated_by_character)
    select p_role_key,p_permission_key,p_enabled,v_actor,coalesce(main_character_name,'') from public.member_codes where id=v_actor
    on conflict(role_key,permission_key) do update set enabled=excluded.enabled,
      updated_by_member_id=excluded.updated_by_member_id,updated_by_character=excluded.updated_by_character,updated_at=clock_timestamp();
  insert into private.sanctuary_permission_audit(actor_member_id,event_kind,target,before_value,after_value)
    values(v_actor,'ROLE_PERMISSION',jsonb_build_object('role',p_role_key,'permissionKey',p_permission_key),to_jsonb(v_before),to_jsonb(p_enabled));
  return public.kinojo_admin_sanctuary_permissions_v2(p_credential);
end;
$$;

-- Exact team IDs, not names or legacy group ordinals. Only public display fields are returned.
create function public.kinojo_admin_sanctuary_operators_v2(p_credential text,p_team_id bigint,p_query text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor bigint; v_team private.sanctuary_management_teams_v412%rowtype; v_assigned jsonb; v_candidates jsonb;
begin
  v_actor:=private.kinojo_sm_require_master(p_credential);
  if p_team_id is null then
    return jsonb_build_object('ok',true,'teams',(select coalesce(jsonb_agg(jsonb_build_object('teamId',team_id,'title',title,'sanctuaryId',sanctuary_id) order by sanctuary_id,team_id),'[]'::jsonb)
      from private.sanctuary_management_teams_v412 where status<>'ARCHIVED'));
  end if;
  select * into v_team from private.sanctuary_management_teams_v412 where team_id=p_team_id and status<>'ARCHIVED';
  if not found then raise exception '운영 중인 팀을 선택해 주세요.' using errcode='22023'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('memberId',o.member_id,'name',m.main_character_name,
    'role',public.kinojo_normalize_role(m.role,coalesce(m.level,0)),'revision',o.revision,'active',o.active) order by m.main_character_name,o.member_id),'[]'::jsonb)
    into v_assigned from private.sanctuary_team_operators o join public.member_codes m on m.id=o.member_id
    where o.team_id=p_team_id and o.active;
  if length(btrim(coalesce(p_query,''))) between 1 and 40 then
    select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) into v_candidates from (
      select m.id as "memberId",m.main_character_name as name,public.kinojo_normalize_role(m.role,coalesce(m.level,0)) as role,
        coalesce(o.revision,0) as revision,coalesce(o.active,false) as active
      from public.member_codes m left join private.sanctuary_team_operators o on o.member_id=m.id and o.team_id=p_team_id
      where m.is_active is true and strpos(lower(coalesce(m.main_character_name,'')),lower(btrim(p_query)))>0
        and public.kinojo_normalize_role(m.role,coalesce(m.level,0)) in ('MEMBER','STAFF','MANAGER','SUB_MASTER','MASTER')
      order by m.main_character_name,m.id limit 30
    ) q;
  else v_candidates:='[]'::jsonb; end if;
  return jsonb_build_object('ok',true,'teamId',p_team_id,'title',v_team.title,'assigned',v_assigned,'candidates',v_candidates);
end;
$$;

create function public.kinojo_admin_sanctuary_operator_set_v2(
  p_credential text,p_team_id bigint,p_member_id bigint,p_active boolean,p_expected_revision bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor bigint; v_before private.sanctuary_team_operators%rowtype;
begin
  v_actor:=private.kinojo_sm_require_master(p_credential);
  -- Team lock also serializes first assignment and concurrent archive.
  perform 1 from private.sanctuary_management_teams_v412 where team_id=p_team_id and status<>'ARCHIVED' for update;
  if not found then raise exception '운영 중인 팀을 선택해 주세요.' using errcode='22023'; end if;
  if p_active is null or not exists(select 1 from public.member_codes where id=p_member_id
    and (p_active is false or (is_active is true and public.kinojo_normalize_role(role,coalesce(level,0)) in ('MEMBER','STAFF','MANAGER','SUB_MASTER','MASTER')))) then
    raise exception '지정할 회원을 확인해 주세요.' using errcode='22023';
  end if;
  select * into v_before from private.sanctuary_team_operators where team_id=p_team_id and member_id=p_member_id for update;
  if p_expected_revision is distinct from coalesce(v_before.revision,0) then
    raise exception '운영자가 변경되었습니다. 다시 불러온 뒤 저장해 주세요.' using errcode='40001';
  end if;
  if coalesce(v_before.active,false) is not distinct from p_active then
    return public.kinojo_admin_sanctuary_operators_v2(p_credential,p_team_id,'');
  end if;
  insert into private.sanctuary_team_operators(team_id,member_id,active,assigned_by_member_id)
    values(p_team_id,p_member_id,p_active,v_actor)
    on conflict(team_id,member_id) do update set active=excluded.active,assigned_by_member_id=v_actor,
      revision=private.sanctuary_team_operators.revision+1,updated_at=clock_timestamp();
  insert into private.sanctuary_permission_audit(actor_member_id,event_kind,target,before_value,after_value)
    values(v_actor,'TEAM_OPERATOR',jsonb_build_object('teamId',p_team_id,'memberId',p_member_id),
      to_jsonb(coalesce(v_before.active,false)),to_jsonb(p_active));
  return public.kinojo_admin_sanctuary_operators_v2(p_credential,p_team_id,'');
end;
$$;

revoke all on function private.kinojo_sm_require_master(text),private.kinojo_sm_permission_catalog(),private.kinojo_sm_permission_revision() from public,anon,authenticated;
revoke all on function public.kinojo_admin_sanctuary_permissions_v2(text),public.kinojo_admin_sanctuary_permission_set_v2(text,text,text,boolean,text),public.kinojo_admin_sanctuary_operators_v2(text,bigint,text),public.kinojo_admin_sanctuary_operator_set_v2(text,bigint,bigint,boolean,bigint) from public,anon,authenticated;
grant execute on function public.kinojo_admin_sanctuary_permissions_v2(text),public.kinojo_admin_sanctuary_permission_set_v2(text,text,text,boolean,text),public.kinojo_admin_sanctuary_operators_v2(text,bigint,text),public.kinojo_admin_sanctuary_operator_set_v2(text,bigint,bigint,boolean,bigint) to anon,authenticated,service_role;
commit;
