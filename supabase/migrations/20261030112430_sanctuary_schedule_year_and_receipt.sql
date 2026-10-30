-- SQL542: normal EDIT_SCHEDULE receipt compatibility and conflict range.
-- No operational row repair, credential, table, API, or privilege change.
begin;
set local lock_timeout='2s';
CREATE OR REPLACE FUNCTION public.kinojo_sanctuary_management_command_v437(p_credential text, p_request_key text, p_action text, p_payload jsonb DEFAULT '{}'::jsonb, p_expected_revision bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_actor jsonb;v_actor_id bigint;v_action text:=upper(btrim(coalesce(p_action,'')));v_team_id bigint;
  v_team private.sanctuary_management_teams_v412%rowtype;v_rule private.sanctuary_management_schedule_rules_v412%rowtype;
  v_existing private.sanctuary_management_commands_v412%rowtype;v_hash text;v_response jsonb;v_preview jsonb;v_before jsonb;v_after jsonb;
  v_conflict_from date;
  v_scope text;v_operation text;v_occurrence date;v_kind text;v_starts_on date;v_weekdays smallint[];v_starts_at time;v_duration integer;v_conflicts jsonb;
begin
  if v_action not in ('EDIT_SCHEDULE','ARCHIVE_TEAM') then
    return public.kinojo_sanctuary_management_command_v436(p_credential,p_request_key,v_action,p_payload,p_expected_revision)
      || jsonb_build_object('schemaVersion',437,'databaseContract',437);
  end if;
  v_actor:=private.kinojo_sm_actor_v412(p_credential);v_actor_id:=nullif(v_actor->>'memberId','')::bigint;
  v_team_id:=nullif(p_payload->>'teamId','')::bigint;
  select * into v_team from private.sanctuary_management_teams_v412 where team_id=v_team_id for update;
  if v_team.team_id is null or not private.kinojo_sm_can_manage_team_v412(v_actor,v_team_id) then raise exception '이 팀을 운영할 권한이 없습니다.' using errcode='P0001'; end if;
  if v_action<>'EDIT_SCHEDULE' and (p_expected_revision is null or v_team.revision<>p_expected_revision) then raise exception '다른 사용자가 먼저 팀을 수정했습니다. 새로고침 후 다시 시도해 주세요.' using errcode='40001'; end if;
  v_hash:=case when v_action='EDIT_SCHEDULE' then
    encode(sha256(convert_to(v_action||'|'||coalesce(p_payload,'{}'::jsonb)::text||'|'||coalesce(p_expected_revision::text,''),'UTF8')),'hex')
    else md5(v_action||'|'||coalesce(p_payload,'{}'::jsonb)::text||'|'||coalesce(p_expected_revision::text,'')) end;
  select * into v_existing from private.sanctuary_management_commands_v412 where actor_member_id=v_actor_id and request_key=p_request_key;
  if v_existing.command_id is not null then
    if v_existing.request_hash<>v_hash then raise exception '같은 요청 키에 다른 작업 내용이 사용되었습니다.' using errcode='P0001'; end if;
    return v_existing.response_payload||jsonb_build_object('replayed',true,'schemaVersion',437,'databaseContract',437);
  end if;
  if v_action='ARCHIVE_TEAM' then
    v_preview:=public.kinojo_sanctuary_management_archive_preview_v437(p_credential,v_team_id);
    v_response:=public.kinojo_sanctuary_management_command_v436(p_credential,p_request_key,v_action,p_payload,p_expected_revision);
    return v_response||jsonb_build_object('archiveImpact',v_preview,'historyPreserved',true,'schemaVersion',437,'databaseContract',437);
  end if;
  -- A successful retry is resolved before checking the now-incremented revision.
  if p_expected_revision is null or v_team.revision<>p_expected_revision then raise exception '다른 사용자가 먼저 팀을 수정했습니다. 새로고침 후 다시 시도해 주세요.' using errcode='40001'; end if;
  if v_team.status not in ('ACTIVE','FULL') then raise exception '공개된 운영 팀의 일정만 변경할 수 있습니다.' using errcode='P0001'; end if;
  select * into v_rule from private.sanctuary_management_schedule_rules_v412 where team_id=v_team_id for update;
  v_scope:=upper(coalesce(p_payload->>'scope','ALL'));v_operation:=upper(coalesce(p_payload->>'operation','UPDATE'));
  v_occurrence:=nullif(p_payload->>'occurrenceDate','')::date;
  v_kind:=upper(coalesce(p_payload->'schedule'->>'kind',v_rule.schedule_kind));
  v_starts_on:=coalesce(nullif(p_payload->'schedule'->>'startsOn','')::date,v_occurrence,v_rule.starts_on);
  v_weekdays:=coalesce(array(select distinct d::smallint from jsonb_array_elements_text(coalesce(p_payload->'schedule'->'weekdays',to_jsonb(v_rule.weekdays))) d order by d::smallint),'{}'::smallint[]);
  v_starts_at:=coalesce(nullif(p_payload->'schedule'->>'startsAt','')::time,v_rule.starts_at);
  v_duration:=coalesce(nullif(p_payload->'schedule'->>'durationMinutes','')::integer,v_rule.duration_minutes);
  if v_scope not in ('OCCURRENCE','FUTURE','ALL') or v_operation not in ('UPDATE','CANCEL','STOP') then raise exception '일정 변경 범위와 작업을 다시 선택해 주세요.' using errcode='P0001'; end if;
  if v_scope in ('OCCURRENCE','FUTURE') and v_occurrence is null then raise exception '변경 기준 날짜를 선택해 주세요.' using errcode='P0001'; end if;
  if v_operation='UPDATE' and (v_kind not in ('ONCE','WEEKLY') or v_starts_at is null or v_duration not between 30 and 720 or v_duration%30<>0
    or (v_kind='ONCE' and cardinality(v_weekdays)<>0) or (v_kind='WEEKLY' and cardinality(v_weekdays) not between 1 and 7))
  then raise exception '1회성 또는 반복 일정과 30분 단위 진행 시간을 다시 확인해 주세요.' using errcode='P0001'; end if;
  v_before:=to_jsonb(v_rule);perform set_config('kinojo.schedule_version_guard','1',true);
  if v_scope='OCCURRENCE' then
    insert into private.sanctuary_management_schedule_exceptions_v412(schedule_id,occurrence_date,exception_type,moved_to_date,moved_to_time,moved_duration_minutes,created_by_member_id)
    values(v_rule.schedule_id,v_occurrence,case when v_operation='UPDATE' then 'MOVE' else 'CANCEL' end,
      case when v_operation='UPDATE' then v_starts_on end,case when v_operation='UPDATE' then v_starts_at end,
      case when v_operation='UPDATE' then v_duration end,v_actor_id)
    on conflict(schedule_id,occurrence_date) do update set exception_type=excluded.exception_type,moved_to_date=excluded.moved_to_date,
      moved_to_time=excluded.moved_to_time,moved_duration_minutes=excluded.moved_duration_minutes,created_by_member_id=excluded.created_by_member_id,created_at=clock_timestamp();
  else
    if v_scope='FUTURE' then
      update private.sanctuary_management_schedule_versions_v437 set effective_to=v_occurrence-1,revision=revision+1
       where schedule_id=v_rule.schedule_id and effective_from<v_occurrence and coalesce(effective_to,'infinity'::date)>=v_occurrence;
      delete from private.sanctuary_management_schedule_versions_v437 where schedule_id=v_rule.schedule_id and effective_from>=v_occurrence;
    else
      delete from private.sanctuary_management_schedule_versions_v437 where schedule_id=v_rule.schedule_id;
      delete from private.sanctuary_management_schedule_exceptions_v412 where schedule_id=v_rule.schedule_id;
    end if;
    if v_operation='UPDATE' then
      insert into private.sanctuary_management_schedule_versions_v437(schedule_id,team_id,effective_from,schedule_kind,starts_on,weekdays,starts_at,duration_minutes,timezone_name,status,revision,created_by_member_id)
      values(v_rule.schedule_id,v_team_id,case when v_scope='FUTURE' then v_occurrence else v_starts_on end,v_kind,v_starts_on,v_weekdays,v_starts_at,v_duration,v_rule.timezone_name,'ACTIVE',v_rule.revision+1,v_actor_id);
      update private.sanctuary_management_schedule_rules_v412 set schedule_kind=v_kind,starts_on=v_starts_on,weekdays=v_weekdays,starts_at=v_starts_at,
        duration_minutes=v_duration,status='ACTIVE',revision=revision+1,updated_at=clock_timestamp() where schedule_id=v_rule.schedule_id;
    else
      update private.sanctuary_management_schedule_rules_v412 set status='STOPPED',revision=revision+1,updated_at=clock_timestamp() where schedule_id=v_rule.schedule_id;
    end if;
  end if;
  -- ALL replaces the entire rule: validate the new rule's range, not the
  -- old occurrence date (which can be in a different year).
  v_conflict_from:=case when v_scope='ALL' and v_operation='UPDATE' then coalesce(v_starts_on,current_date) else coalesce(v_occurrence,current_date) end;
  v_conflicts:=private.kinojo_sm_team_conflicts_v437(v_team_id,v_conflict_from,v_conflict_from+366);
  if jsonb_array_length(v_conflicts)>0 then raise exception '%',v_conflicts->0->>'message' using errcode='P0001',detail=v_conflicts::text; end if;
  update private.sanctuary_management_teams_v412 set revision=revision+1,updated_at=clock_timestamp() where team_id=v_team_id returning * into v_team;
  select to_jsonb(r) into v_after from private.sanctuary_management_schedule_rules_v412 r where schedule_id=v_rule.schedule_id;
  v_response:=jsonb_build_object('ok',true,'action',v_action,'teamId',v_team_id,'revision',v_team.revision,'scope',v_scope,'operation',v_operation,
    'scheduleRevision',v_after->'revision','message',case when v_operation='UPDATE' then '일정 변경을 저장했습니다.' else '선택한 범위의 일정을 종료했습니다.' end);
  perform private.kinojo_sm_audit_v412(v_actor_id,v_team_id,'SCHEDULE',v_rule.schedule_id,'EDIT_SCHEDULE_'||v_scope||'_'||v_operation,v_before,v_after,p_request_key);
  insert into private.sanctuary_management_commands_v412(actor_member_id,request_key,action,request_hash,response_payload)
  values(v_actor_id,p_request_key,v_action,v_hash,v_response);
  return v_response||jsonb_build_object('replayed',false,'schemaVersion',437,'databaseContract',437);
end;
$function$
;
commit;
