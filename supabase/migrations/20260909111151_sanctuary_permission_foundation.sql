-- Stage14 preparation only. No public entry point switches to this contract here.
-- Deploy with the command/UI cutover, never as a standalone authorization fix.
begin;

create table if not exists private.sanctuary_team_operators (
  team_id bigint not null references private.sanctuary_management_teams_v412(team_id) on delete restrict,
  member_id bigint not null references public.member_codes(id) on delete restrict,
  active boolean not null default true,
  assigned_by_member_id bigint not null references public.member_codes(id) on delete restrict,
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (team_id, member_id)
);
alter table private.sanctuary_team_operators enable row level security;
revoke all on private.sanctuary_team_operators from public, anon, authenticated;
grant select, insert, update on private.sanctuary_team_operators to service_role;
create index if not exists sanctuary_team_operators_active_member_idx
  on private.sanctuary_team_operators(member_id, team_id) where active;
create index if not exists sanctuary_team_operators_assigner_idx
  on private.sanctuary_team_operators(assigned_by_member_id);

-- Receives an already authenticated internal member ID. Not a browser RPC.
-- Defaults for new domains are the user-approved Stage14 policy. Existing bits win.
create or replace function private.kinojo_sm_capabilities(p_member_id bigint, p_team_id bigint)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  v_member public.member_codes%rowtype;
  v_team private.sanctuary_management_teams_v412%rowtype;
  v_role text;
  v_master boolean := false;
  v_creator boolean := false;
  v_assigned boolean := false;
  v_available boolean := false;
  v_grants jsonb := '{}'::jsonb;
  v_keys text[] := array['info','roster','schedule','support','archive'];
  v_key text;
  v_scope text;
  v_permission text;
  v_value boolean;
  v_result jsonb := jsonb_build_object('canCreateTeam',false,'canEditInfo',false,
    'canEditRoster',false,'canManageSchedule',false,'canDecideSupport',false,
    'canArchive',false,'canAssignOperators',false,'canReadPrivate',false);
begin
  select * into v_member from public.member_codes where id=p_member_id and is_active is true;
  if not found then return v_result; end if;
  v_role := public.kinojo_normalize_role(v_member.role,coalesce(v_member.level,0));
  if v_role not in ('MEMBER','STAFF','MANAGER','SUB_MASTER','MASTER') then return v_result; end if;
  v_master := v_role='MASTER';
  select enabled into v_value from public.sanctuary_role_permissions
    where role_key=v_role and permission_key='sanctuary_team_create';
  v_result := jsonb_set(v_result,'{canCreateTeam}',to_jsonb(v_master or coalesce(v_value,true)
    or 'sanctuary_team_create'=any(coalesce(v_member.permissions,'{}'::text[]))));
  select * into v_team from private.sanctuary_management_teams_v412 where team_id=p_team_id;
  if not found then return v_result; end if;
  v_available := v_team.status is not null and v_team.status<>'ARCHIVED';
  v_creator := v_team.creator_member_id=p_member_id;
  select exists(select 1 from private.sanctuary_team_operators
    where team_id=p_team_id and member_id=p_member_id and active) into v_assigned;
  foreach v_key in array v_keys loop
    foreach v_scope in array array['assigned','all'] loop
      v_permission := 'sanctuary_'||v_key||'_manage_'||v_scope;
      select enabled into v_value from public.sanctuary_role_permissions
        where role_key=v_role and permission_key=v_permission;
      if v_value is null then
        -- Preserve the legacy name permission only as the explicit all-info mapping.
        if v_key='info' and v_scope='all' then
          select enabled into v_value from public.sanctuary_role_permissions
            where role_key=v_role and permission_key='sanctuary_team_name_edit';
        elsif v_key in ('support','archive') then
          v_value := v_role in ('MANAGER','SUB_MASTER','MASTER');
        end if;
      end if;
      v_value := coalesce(v_value,false) or v_permission=any(coalesce(v_member.permissions,'{}'::text[]));
      if v_key='info' and v_scope='all' then
        v_value := v_value or 'sanctuary_team_name_edit'=any(coalesce(v_member.permissions,'{}'::text[]));
      end if;
      -- Broad legacy all/sanctuary_edit remain stored for explicit migration review.
      -- They never acquire new function grants through a substring or role fallback.
      v_grants := v_grants||jsonb_build_object(v_key||'_'||v_scope,v_value);
    end loop;
  end loop;
  for v_key,v_permission in select * from (values
    ('info','canEditInfo'),('roster','canEditRoster'),('schedule','canManageSchedule'),
    ('support','canDecideSupport'),('archive','canArchive')) x(domain,capability)
  loop
    v_value := v_available and (v_master or coalesce(v_creator,false)
      or coalesce((v_grants->>(v_key||'_all'))::boolean,false)
      or (v_assigned and coalesce((v_grants->>(v_key||'_assigned'))::boolean,false)));
    v_result := jsonb_set(v_result,array[v_permission],to_jsonb(v_value));
  end loop;
  v_result := jsonb_set(v_result,'{canAssignOperators}',to_jsonb(v_available and v_master));
  v_value := exists(select 1 from jsonb_each(v_result) p where p.key<>'canCreateTeam' and p.value='true'::jsonb);
  return jsonb_set(v_result,'{canReadPrivate}',to_jsonb(v_value));
end;
$$;
revoke all on function private.kinojo_sm_capabilities(bigint,bigint) from public,anon,authenticated;
grant execute on function private.kinojo_sm_capabilities(bigint,bigint) to service_role;

-- Inputs must be DB-built canonical snapshots, never client changedFields flags.
-- Conversion from actual force/slot/schedule rows is deliberately a cutover task.
create or replace function private.kinojo_sm_changed_domains(
  p_before jsonb,p_after jsonb,p_cancels_support boolean default false)
returns text[] language plpgsql immutable security invoker set search_path = '' as $$
declare v_key text; v_result text[] := '{}';
begin
  if jsonb_typeof(p_before) is distinct from 'object' or jsonb_typeof(p_after) is distinct from 'object'
    or not (p_before ?& array['info','roster','schedule'])
    or not (p_after ?& array['info','roster','schedule'])
    or exists(select 1 from jsonb_object_keys(p_before) k where k not in ('info','roster','schedule'))
    or exists(select 1 from jsonb_object_keys(p_after) k where k not in ('info','roster','schedule')) then
    raise exception 'SANCTUARY_PERMISSION_CANONICAL_INVALID';
  end if;
  foreach v_key in array array['info','roster','schedule'] loop
    if p_before->v_key is distinct from p_after->v_key then v_result := array_append(v_result,v_key); end if;
  end loop;
  if p_cancels_support is true then v_result := array_append(v_result,'support'); end if;
  return v_result;
end;
$$;
revoke all on function private.kinojo_sm_changed_domains(jsonb,jsonb,boolean) from public,anon,authenticated;
grant execute on function private.kinojo_sm_changed_domains(jsonb,jsonb,boolean) to service_role;

commit;
