-- DB473: read-only membership projection; never rewrites saved assignments.
create or replace function private.kinojo_legion_tree_member_source_v352()
returns table(legion_name text, legion_order integer, character_id bigint,
 character_name text, class_name text, is_main boolean, main_character_id bigint,
 main_character_name text, server_id integer, server_name text, list_row integer)
language sql stable set search_path = pg_catalog, public, private
as $fn$
 with target_legions(legion_name,legion_order) as (
  values ('깡'::text,1),('낮'::text,2),('밤'::text,3),('키나노동조합'::text,4)
 )
 select t.legion_name,t.legion_order,c.id,c.character_name,c.class_name,
  coalesce(c.is_main,false),case when coalesce(c.is_main,false) then c.id else c.main_character_id end,
  coalesce(nullif(btrim(c.main_character_name),''),c.character_name),c.server_id,c.server_name,c.list_row
 from target_legions t join public.character_master c on nullif(btrim(c.legion_name),'')=t.legion_name
 where coalesce(c.is_active,true) and coalesce(c.status,'OK')<>'DELETED'
  and not coalesce(c.visibility_excluded,false)
 order by t.legion_order,c.list_row,c.id;
$fn$;

create or replace function private.kinojo_legion_tree_project_members_v473(p_legion jsonb)
returns jsonb language plpgsql immutable set search_path = pg_catalog
as $fn$
declare
 v_stages jsonb:=p_legion->'stages'; v_missing jsonb; v_stage jsonb; v_role jsonb;
 v_roles jsonb; v_groups jsonb; v_group jsonb; v_parent text; v_role_index integer;
 v_last integer; v_candidates integer; v_ids bigint[]; v_all_ids bigint[];
 v_remaining jsonb; v_capacity integer; v_placed integer; v_total integer;
begin
 -- Deduplicate only the unassigned feed against the already rendered IDs.
 -- Saved placement corruption is detected, not silently repaired.
 select array_agg((m->>'characterId')::bigint) into v_ids
 from jsonb_path_query(p_legion,'$.stages[*].roles[*].groups[*].members[*]') m;
 select coalesce(jsonb_agg(m order by ord),'[]'::jsonb) into v_missing
 from (select distinct on ((value->>'characterId')::bigint) value m,ord
  from jsonb_array_elements(coalesce(p_legion->'unassignedMembers','[]'::jsonb)) with ordinality e(value,ord)
  where not ((value->>'characterId')::bigint=any(coalesce(v_ids,'{}'::bigint[])))
  order by (value->>'characterId')::bigint,ord) x;
 v_remaining:=v_missing;
 v_last:=jsonb_array_length(v_stages)-1;
 if jsonb_array_length(v_missing)>0 and v_last>=0 then
  v_stage:=v_stages->v_last; v_roles:=v_stage->'roles';
  select count(*),min((ord-1)::integer) into v_candidates,v_role_index
  from jsonb_array_elements(v_roles) with ordinality r(value,ord)
  where value->>'roleName'=v_stage->>'stageName';
  if v_candidates<>1 and jsonb_array_length(v_roles)=1 then v_candidates:=1; v_role_index:=0; end if;
  if v_candidates=1 and (v_last>0 or v_stage->>'stageName' in ('군단병','조합원')) then
   v_role:=v_roles->v_role_index;
   v_groups:=coalesce(v_role->'groups','[]'::jsonb);
   select count(*) into v_placed from jsonb_path_query(v_role,'$.groups[*].members[*]');
   v_capacity:=case when v_role->>'maxMembers' is null then jsonb_array_length(v_missing)
    else greatest(0,(v_role->>'maxMembers')::integer-v_placed) end;
   if v_capacity>=jsonb_array_length(v_missing) then
    if v_last>0 and jsonb_array_length(v_stages->(v_last-1)->'roles')=1 then
     v_parent:=v_stages->(v_last-1)->'roles'->0->>'roleKey';
    end if;
    -- Merge into an existing default/direct group, retaining explicit independent branches.
    select value into v_group from jsonb_array_elements(v_groups)
     where coalesce((value->>'unaffiliated')::boolean,false)=false
      and ((value->>'parentRoleKey') is not distinct from v_parent
        or (v_parent is not null and value->>'parentRoleKey' is null))
     order by (value->>'parentRoleKey' is not null) desc limit 1;
    if v_group is null then
     v_groups:=v_groups||jsonb_build_array(jsonb_build_object(
      'groupKey','auto:'||(v_role->>'roleKey'),'groupName',v_role->>'roleName',
      'parentRoleKey',v_parent,'unaffiliated',false,'defaultAffiliation',v_parent is null,
      'sortOrder',2147483647,'members',v_missing));
    else
     select jsonb_agg(case when value->>'groupKey'=v_group->>'groupKey'
       then jsonb_set(value,'{members}',(value->'members')||v_missing) else value end order by ord)
      into v_groups from jsonb_array_elements(v_groups) with ordinality g(value,ord);
    end if;
    v_stages:=jsonb_set(v_stages,array[v_last::text,'roles',v_role_index::text,'groups'],v_groups);
    v_remaining:='[]'::jsonb;
   end if;
  end if;
 end if;
 p_legion:=jsonb_set(jsonb_set(p_legion,'{stages}',v_stages),'{unassignedMembers}',v_remaining);
 select array_agg((m->>'characterId')::bigint) into v_all_ids from (
  select m from jsonb_path_query(p_legion,'$.stages[*].roles[*].groups[*].members[*]') m
  union all select m from jsonb_array_elements(v_remaining) m) x;
 select count(distinct x),count(*) into v_total,v_placed from unnest(v_all_ids) x;
 if v_total<>v_placed or v_total<>(p_legion->>'memberCount')::integer then
  raise exception 'LEGION_TREE_MEMBERSHIP_INTEGRITY';
 end if;
 return p_legion||jsonb_build_object('membershipIntegrity','COMPLETE',
  'automaticMemberCount',jsonb_array_length(v_missing)-jsonb_array_length(v_remaining));
end;
$fn$;

create or replace function private.kinojo_legion_tree_build_payload_v473()
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public, private
as $fn$
declare v_payload jsonb:=private.kinojo_legion_tree_build_payload_v464(); v_legions jsonb;
begin
 select jsonb_agg(private.kinojo_legion_tree_project_members_v473(value) order by ord)
  into v_legions from jsonb_array_elements(v_payload->'legions') with ordinality l(value,ord);
 return jsonb_set(v_payload,'{legions}',v_legions)||jsonb_build_object(
  'membershipContract','canonical-auto-terminal-v473','readOptimizationContract','473');
end;
$fn$;

create or replace function private.kinojo_legion_tree_source_token_v461()
returns text language sql stable security definer set search_path = pg_catalog, public, private
set statement_timeout='1200ms' set lock_timeout='200ms'
as $fn$ select 'v473:'||private.kinojo_legion_tree_source_token_v464(); $fn$;

create or replace function private.kinojo_legion_tree_refresh_snapshot_v461(p_source_token text default null)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, private
set statement_timeout='3500ms' set lock_timeout='250ms'
as $fn$
declare v_token text:=coalesce(nullif(p_source_token,''),private.kinojo_legion_tree_source_token_v461());
 v_payload jsonb:=private.kinojo_legion_tree_build_payload_v473(); v_time timestamptz:=clock_timestamp();
begin
 insert into private.legion_tree_public_snapshot_v461(snapshot_key,source_token,payload,refreshed_at)
 values(true,v_token,v_payload,v_time) on conflict(snapshot_key) do update
 set source_token=excluded.source_token,payload=excluded.payload,refreshed_at=excluded.refreshed_at;
 return v_payload||jsonb_build_object('snapshotState','REFRESHED','snapshotRefreshedAt',v_time);
end;
$fn$;
revoke all on function private.kinojo_legion_tree_project_members_v473(jsonb) from public,anon,authenticated;
revoke all on function private.kinojo_legion_tree_build_payload_v473() from public,anon,authenticated;
grant execute on function private.kinojo_legion_tree_project_members_v473(jsonb) to service_role;
grant execute on function private.kinojo_legion_tree_build_payload_v473() to service_role;
select private.kinojo_legion_tree_refresh_snapshot_v461()->>'membershipContract';
