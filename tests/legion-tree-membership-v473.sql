-- Run after migration, inside BEGIN/ROLLBACK for release validation.
do $test$
declare base jsonb; result jsonb; changed jsonb; ids bigint[]; before_assignments text; after_assignments text;
begin
 select md5(coalesce(jsonb_agg(to_jsonb(a) order by legion_name,character_id),'[]'::jsonb)::text)
 into before_assignments from private.legion_tree_assignments a;
 base:='{"memberCount":2,"stages":[{"stageNo":1,"stageName":"군단장","roles":[{"roleKey":"leader","roleName":"군단장","groups":[]}]},{"stageNo":2,"stageName":"엘리트장교","roles":[{"roleKey":"officer","roleName":"엘리트장교","groups":[]}]},{"stageNo":3,"stageName":"군단병","roles":[{"roleKey":"soldier","roleName":"군단병","maxMembers":null,"groups":[{"groupKey":"saved","parentRoleKey":null,"unaffiliated":false,"members":[{"characterId":1,"characterName":"기존","listRow":1}]}]}]}],"unassignedMembers":[{"characterId":2,"characterName":"신규","listRow":null}]}'::jsonb;
 result:=private.kinojo_legion_tree_project_members_v473(base);
 if jsonb_array_length(result->'unassignedMembers')<>0 or jsonb_array_length(result#>'{stages,2,roles,0,groups,0,members}')<>2
  then raise exception 'AUTO_DEFAULT_OR_LISTLESS_FAILED'; end if;
 if private.kinojo_legion_tree_project_members_v473(result)->'stages'<>result->'stages' then raise exception 'NOT_IDEMPOTENT'; end if;
 changed:=jsonb_set(base,'{stages,2,roles,0,groups}','[]');
 changed:=jsonb_set(changed,'{memberCount}','1');
 result:=private.kinojo_legion_tree_project_members_v473(changed);
 if result#>>'{stages,2,roles,0,groups,0,parentRoleKey}'<>'officer' then raise exception 'SINGLE_PARENT_FAILED'; end if;
 changed:=jsonb_set(changed,'{stages,1,roles}',(changed#>'{stages,1,roles}')||'[{"roleKey":"officer2","roleName":"장교2","groups":[]}]');
 result:=private.kinojo_legion_tree_project_members_v473(changed);
 if result#>>'{stages,2,roles,0,groups,0,parentRoleKey}' is not null then raise exception 'MULTI_PARENT_ASSUMED'; end if;
 changed:=jsonb_set(base,'{stages,2,roles,0,maxMembers}','1');
 result:=private.kinojo_legion_tree_project_members_v473(changed);
 if jsonb_array_length(result->'unassignedMembers')<>1 then raise exception 'CAPACITY_OVERRIDDEN'; end if;
 changed:=jsonb_set(base,'{stages,2,roles,0,groups,0,unaffiliated}','true');
 result:=private.kinojo_legion_tree_project_members_v473(changed);
 if result#>'{stages,2,roles,0,groups,0}'<>changed#>'{stages,2,roles,0,groups,0}' then raise exception 'INDEPENDENT_CHANGED'; end if;
 changed:=jsonb_set(base,'{unassignedMembers}',(base->'unassignedMembers')||(base->'unassignedMembers'));
 result:=private.kinojo_legion_tree_project_members_v473(changed);
 if jsonb_array_length(result#>'{stages,2,roles,0,groups,0,members}')<>2 then raise exception 'DUPLICATE_FEED'; end if;
 begin
  perform private.kinojo_legion_tree_project_members_v473(jsonb_set(base,'{memberCount}','3'));
  raise exception 'MISSING_NOT_DETECTED';
 exception when others then if sqlerrm<>'LEGION_TREE_MEMBERSHIP_INTEGRITY' then raise; end if; end;
 result:=private.kinojo_legion_tree_build_payload_v473();
 if exists (
  (select character_id from private.kinojo_legion_tree_member_source_v352()
   except select (m->>'characterId')::bigint from jsonb_path_query(result,'$.legions[*].stages[*].roles[*].groups[*].members[*]') m
   except select (m->>'characterId')::bigint from jsonb_path_query(result,'$.legions[*].unassignedMembers[*]') m)
 ) then raise exception 'LIVE_SOURCE_MISSING'; end if;
 select md5(coalesce(jsonb_agg(to_jsonb(a) order by legion_name,character_id),'[]'::jsonb)::text)
 into after_assignments from private.legion_tree_assignments a;
 if before_assignments<>after_assignments then raise exception 'SAVED_ASSIGNMENTS_CHANGED'; end if;
end;
$test$;
select 'membership projection regression PASS' as result;
