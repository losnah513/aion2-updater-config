-- Stage 6 parallel-operation evidence, rollback rehearsal, transition scope,
-- and explicit approval boundary. This migration never clears a roster,
-- archives a team, stops Sheet sync, or enables the final OPEN rollout.
-- CODEX_ADMIN remains a dedicated visual-QA grade: its raw ADMIN role is
-- MASTER-equivalent only inside server-owned authorization. No passkey or
-- WEB session value is persisted by any Stage 6 table or function.

create table if not exists private.sanctuary_management_stage6_evidence_v445(
  check_code text primary key,
  stage_item text not null,
  status text not null default 'PENDING',
  source text not null default 'NOT_VERIFIED',
  details jsonb not null default '{}'::jsonb,
  verified_at timestamptz,
  updated_at timestamptz not null default statement_timestamp(),
  constraint sanctuary_management_stage6_evidence_v445_code_check
    check(check_code in ('CARD_COMPARE','SCHEDULE_COMPARE','OPERATION_SCENARIO','RESILIENCE_CONCURRENCY','ROLLBACK_TARGETS')),
  constraint sanctuary_management_stage6_evidence_v445_stage_check
    check(stage_item in ('6-2','6-3','6-4','6-5','6-6')),
  constraint sanctuary_management_stage6_evidence_v445_status_check
    check(status in ('PENDING','PASS','FAIL')),
  constraint sanctuary_management_stage6_evidence_v445_details_check
    check(jsonb_typeof(details)='object')
);

alter table private.sanctuary_management_stage6_evidence_v445 enable row level security;
revoke all on table private.sanctuary_management_stage6_evidence_v445 from public, anon, authenticated;

insert into private.sanctuary_management_stage6_evidence_v445(check_code,stage_item)
values
  ('CARD_COMPARE','6-2'),
  ('SCHEDULE_COMPARE','6-3'),
  ('OPERATION_SCENARIO','6-4'),
  ('RESILIENCE_CONCURRENCY','6-5'),
  ('ROLLBACK_TARGETS','6-6')
on conflict(check_code) do nothing;

create table if not exists private.sanctuary_management_rollout_rehearsals_v445(
  rehearsal_id bigserial primary key,
  from_mode text not null,
  closed_mode text not null,
  restored_mode text,
  reason text not null,
  closed_at timestamptz not null default statement_timestamp(),
  restored_at timestamptz,
  verification jsonb not null default '{}'::jsonb,
  constraint sanctuary_management_rollout_rehearsals_v445_mode_check
    check(from_mode='PILOT' and closed_mode='CLOSED' and (restored_mode is null or restored_mode='PILOT')),
  constraint sanctuary_management_rollout_rehearsals_v445_reason_check
    check(char_length(btrim(reason)) between 12 and 240),
  constraint sanctuary_management_rollout_rehearsals_v445_restore_check
    check((restored_at is null)=(restored_mode is null)),
  constraint sanctuary_management_rollout_rehearsals_v445_verification_check
    check(jsonb_typeof(verification)='object')
);

alter table private.sanctuary_management_rollout_rehearsals_v445 enable row level security;
revoke all on table private.sanctuary_management_rollout_rehearsals_v445 from public, anon, authenticated;

create table if not exists private.sanctuary_management_transition_approvals_v445(
  approval_id bigserial primary key,
  approved_by_member_id bigint not null references public.member_codes(id) on delete restrict,
  approver_raw_role text not null,
  scope_hash text not null,
  scope_payload jsonb not null,
  approved_at timestamptz not null default statement_timestamp(),
  revoked_at timestamptz,
  revoke_reason text,
  constraint sanctuary_management_transition_approvals_v445_role_check
    check(approver_raw_role in ('MASTER','ADMIN')),
  constraint sanctuary_management_transition_approvals_v445_hash_check
    check(scope_hash ~ '^[0-9a-f]{64}$'),
  constraint sanctuary_management_transition_approvals_v445_scope_check
    check(jsonb_typeof(scope_payload)='object'),
  constraint sanctuary_management_transition_approvals_v445_revoke_check
    check((revoked_at is null and revoke_reason is null) or (revoked_at is not null and char_length(btrim(revoke_reason)) between 4 and 240))
);

alter table private.sanctuary_management_transition_approvals_v445 enable row level security;
revoke all on table private.sanctuary_management_transition_approvals_v445 from public, anon, authenticated;

create unique index if not exists sanctuary_management_transition_approvals_v445_actor_scope_uq
  on private.sanctuary_management_transition_approvals_v445(approved_by_member_id,scope_hash)
  where revoked_at is null;

create index if not exists sanctuary_management_transition_approvals_v445_scope_idx
  on private.sanctuary_management_transition_approvals_v445(scope_hash,approved_at desc)
  where revoked_at is null;

create or replace function private.kinojo_sm_transition_snapshot_v445(p_month date)
returns jsonb
language plpgsql
stable security definer
set search_path='pg_catalog','public','private','extensions'
as $$
declare
  v_month_start date;
  v_month_end date;
  v_range_start date;
  v_range_end date;
  v_legacy_cards jsonb;
  v_new_cards jsonb;
  v_schedule jsonb;
  v_checks jsonb;
  v_evidence jsonb;
  v_rollback jsonb;
  v_targets jsonb;
  v_scope_hash text;
  v_structural_failures integer;
  v_evidence_failures integer;
  v_rollback_failures integer;
begin
  v_month_start:=date_trunc('month',coalesce(p_month,current_date))::date;
  if extract(year from v_month_start) not between 2025 and 2100 then
    raise exception '조회할 월 범위를 다시 확인해 주세요.' using errcode='P0001';
  end if;
  v_month_end:=(v_month_start+interval '1 month - 1 day')::date;
  v_range_start:=v_month_start-((extract(isodow from v_month_start)::integer-3+7)%7);
  v_range_end:=v_month_end+((2-extract(isodow from v_month_end)::integer+7)%7);

  select jsonb_build_object(
    'source','LEGACY_SHEET_DB',
    'teamCount',(select count(*) from public.sanctuary_teams),
    'partyCount',(select count(*) from public.sanctuary_parties),
    'slotCount',(select count(*) from public.sanctuary_slots),
    'occupiedSlotCount',(select count(*) from public.sanctuary_slots where nullif(btrim(character_name),'') is not null),
    'bySanctuary',(select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.sanctuary_id),'[]'::jsonb)
      from (
        select team.sanctuary_id,
               count(*)::integer team_count,
               (select count(*)::integer from public.sanctuary_parties party where party.sanctuary_id=team.sanctuary_id) party_count,
               (select count(*)::integer from public.sanctuary_slots slot where slot.sanctuary_id=team.sanctuary_id) slot_count,
               (select count(*)::integer from public.sanctuary_slots slot where slot.sanctuary_id=team.sanctuary_id and nullif(btrim(slot.character_name),'') is not null) occupied_slot_count
          from public.sanctuary_teams team
         group by team.sanctuary_id
      ) row_data)
  ) into v_legacy_cards;

  select jsonb_build_object(
    'source','SERVER_DB',
    'teamCount',(select count(*) from private.sanctuary_management_teams_v412),
    'activeTeamCount',(select count(*) from private.sanctuary_management_teams_v412 where status in ('ACTIVE','FULL')),
    'forceCount',(select count(*) from private.sanctuary_management_forces_v412),
    'partyCount',(select count(*) from private.sanctuary_management_parties_v412),
    'slotCount',(select count(*) from private.sanctuary_management_slots_v412),
    'occupiedSlotCount',(select count(*) from private.sanctuary_management_slots_v412 where character_id is not null),
    'bySanctuary',(select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.sanctuary_id),'[]'::jsonb)
      from (
        select master.id sanctuary_id,master.code,master.name,
               count(team.team_id)::integer team_count,
               count(team.team_id) filter(where team.status in ('ACTIVE','FULL'))::integer active_team_count,
               (select count(*)::integer from private.sanctuary_management_forces_v412 force_row join private.sanctuary_management_teams_v412 force_team on force_team.team_id=force_row.team_id where force_team.sanctuary_id=master.id) force_count,
               (select count(*)::integer from private.sanctuary_management_parties_v412 party join private.sanctuary_management_teams_v412 party_team on party_team.team_id=party.team_id where party_team.sanctuary_id=master.id) party_count,
               (select count(*)::integer from private.sanctuary_management_slots_v412 slot join private.sanctuary_management_teams_v412 slot_team on slot_team.team_id=slot.team_id where slot_team.sanctuary_id=master.id) slot_count,
               (select count(*)::integer from private.sanctuary_management_slots_v412 slot join private.sanctuary_management_teams_v412 slot_team on slot_team.team_id=slot.team_id where slot_team.sanctuary_id=master.id and slot.character_id is not null) occupied_slot_count
          from public.sanctuary_master master
          left join private.sanctuary_management_teams_v412 team on team.sanctuary_id=master.id
         where master.management_visible
         group by master.id,master.code,master.name
      ) row_data)
  ) into v_new_cards;

  select jsonb_build_object(
    'month',to_char(v_month_start,'YYYY-MM'),
    'rangeStart',v_range_start,
    'rangeEnd',v_range_end,
    'weekStartsOn','WEDNESDAY',
    'legacy',jsonb_build_object(
      'scheduleCount',(select count(*) from public.sanctuary_schedules),
      'monthOccurrenceCount',(select count(*) from public.sanctuary_schedules where target_date between v_range_start and v_range_end),
      'durationDistribution',(select coalesce(jsonb_agg(to_jsonb(duration_row) order by duration_row.duration_minutes),'[]'::jsonb)
        from (
          select round(extract(epoch from(ends_at-starts_at))/60)::integer duration_minutes,count(*)::integer count
            from public.sanctuary_schedules
           where starts_at is not null and ends_at is not null
           group by 1
        ) duration_row)
    ),
    'server',jsonb_build_object(
      'activeRuleCount',(select count(*) from private.sanctuary_management_schedule_rules_v412 where status='ACTIVE'),
      'monthOccurrenceCount',(select count(*)
        from private.sanctuary_management_schedule_rules_v412 rule
        join private.sanctuary_management_teams_v412 team on team.team_id=rule.team_id and team.status in ('ACTIVE','FULL')
        cross join lateral private.kinojo_sm_rule_occurrences_v437(rule.schedule_id,v_range_start,v_range_end) occurrence
       where rule.status='ACTIVE'),
      'durationDistribution',(select coalesce(jsonb_agg(to_jsonb(duration_row) order by duration_row.duration_minutes),'[]'::jsonb)
        from (
          select duration_minutes,count(*)::integer count
            from private.sanctuary_management_schedule_rules_v412
           where status='ACTIVE'
           group by duration_minutes
        ) duration_row)
    ),
    'comparisonClass','EXPECTED_PARALLEL_SCOPE',
    'explanation','기존 일정은 Sheet 기반 운영 이력이고 신규 일정은 팀 단위 Server 규칙이므로 건수 일치를 요구하지 않습니다. 월 범위·수요일 경계·30분 단위·팀 단위 시간을 공통 검증합니다.'
  ) into v_schedule;

  with check_rows as (
    select 'FORCE_CAPACITY_10'::text code,'신규 포스 정원 10명'::text label,
           (select count(*) from private.sanctuary_management_forces_v412 where capacity<>10)::bigint fail_count
    union all select 'TWO_PARTIES_PER_FORCE','포스당 2파티',
           (select count(*) from private.sanctuary_management_forces_v412 force_row where (select count(*) from private.sanctuary_management_parties_v412 party where party.force_id=force_row.force_id)<>2)::bigint
    union all select 'PARTY_CAPACITY_5','파티 정원 5명',
           (select count(*) from private.sanctuary_management_parties_v412 where capacity<>5)::bigint
    union all select 'FIVE_SLOTS_PER_PARTY','파티당 슬롯 5개',
           (select count(*) from private.sanctuary_management_parties_v412 party where (select count(*) from private.sanctuary_management_slots_v412 slot where slot.party_id=party.party_id)<>5)::bigint
    union all select 'NO_FORCE_OWNER_DUPLICATE','포스별 이용자 1캐릭터',
           (select count(*) from (select force_id,owner_member_id from private.sanctuary_management_slots_v412 where character_id is not null and owner_member_id is not null group by force_id,owner_member_id having count(*)>1) duplicate_owner)::bigint
    union all select 'NO_SLOT_OVERFLOW','파티·포스 정원 초과 없음',
           ((select count(*) from private.sanctuary_management_parties_v412 party where (select count(*) from private.sanctuary_management_slots_v412 slot where slot.party_id=party.party_id and slot.character_id is not null)>party.capacity)
            +(select count(*) from private.sanctuary_management_forces_v412 force_row where (select count(*) from private.sanctuary_management_slots_v412 slot where slot.force_id=force_row.force_id and slot.character_id is not null)>force_row.capacity))::bigint
    union all select 'SCHEDULE_30_MINUTE_UNIT','일정 최소·단위 30분',
           (select count(*) from private.sanctuary_management_schedule_rules_v412 where status='ACTIVE' and (duration_minutes<30 or mod(duration_minutes,30)<>0))::bigint
    union all select 'SCHEDULE_OCCURRENCE_DURATION','발생 일정 진행 시간 일치',
           (select count(*) from private.sanctuary_management_schedule_rules_v412 rule cross join lateral private.kinojo_sm_rule_occurrences_v437(rule.schedule_id,v_range_start,v_range_end) occurrence where rule.status='ACTIVE' and round(extract(epoch from(occurrence.end_at-occurrence.start_at))/60)::integer<>rule.duration_minutes)::bigint
    union all select 'WEDNESDAY_TO_TUESDAY_RANGE','수요일~화요일 월 범위',
           (case when extract(isodow from v_range_start)::integer=3 and extract(isodow from v_range_end)::integer=2 then 0 else 1 end)::bigint
    union all select 'COMMAND_IDEMPOTENCY','중복 요청 결과 단일화',
           (select count(*) from (select actor_member_id,request_key from private.sanctuary_management_commands_v412 group by actor_member_id,request_key having count(*)>1) duplicate_command)::bigint
    union all select 'COMMAND_AUDIT_LINK','명령별 감사 기록 연결',
           (select count(*) from private.sanctuary_management_commands_v412 command_row where not exists(select 1 from private.sanctuary_management_audit_events_v412 audit where audit.actor_member_id=command_row.actor_member_id and audit.request_key=command_row.request_key))::bigint
    union all select 'NO_ACTIVE_LEASE_DUPLICATE','유효 편집 잠금 팀별 1개',
           (select count(*) from (select team_id from private.sanctuary_management_edit_leases_v412 where expires_at>statement_timestamp() group by team_id having count(*)>1) duplicate_lease)::bigint
    union all select 'NO_PENDING_SUPPORT_DUPLICATE','대기 지원 중복 없음',
           (select count(*) from (select item.force_id,item.owner_member_id from private.sanctuary_management_support_items_v412 item where item.status='PENDING' group by item.force_id,item.owner_member_id having count(*)>1) duplicate_support)::bigint
  )
  select coalesce(jsonb_agg(jsonb_build_object('code',code,'label',label,'status',case when fail_count=0 then 'PASS' else 'FAIL' end,'failureCount',fail_count) order by code),'[]'::jsonb),
         count(*) filter(where fail_count<>0)::integer
    into v_checks,v_structural_failures
    from check_rows;

  select coalesce(jsonb_agg(jsonb_build_object(
    'checkCode',check_code,'stageItem',stage_item,'status',status,'source',source,
    'details',details,'verifiedAt',verified_at
  ) order by stage_item),'[]'::jsonb),
  count(*) filter(where status<>'PASS')::integer
    into v_evidence,v_evidence_failures
    from private.sanctuary_management_stage6_evidence_v445;

  select coalesce((select jsonb_build_object(
    'rehearsalId',rehearsal_id,'fromMode',from_mode,'closedMode',closed_mode,
    'restoredMode',restored_mode,'reason',reason,'closedAt',closed_at,
    'restoredAt',restored_at,'verification',verification,
    'restored',restored_mode='PILOT' and restored_at is not null
  ) from private.sanctuary_management_rollout_rehearsals_v445 order by rehearsal_id desc limit 1),
  jsonb_build_object('restored',false)) into v_rollback;
  v_rollback_failures:=case when coalesce((v_rollback->>'restored')::boolean,false) then 0 else 1 end;

  select jsonb_build_object(
    'proposalVersion',1,
    'preserve',jsonb_build_array(
      jsonb_build_object('object','public.sanctuary_master','rowCount',(select count(*) from public.sanctuary_master),'ids',(select coalesce(jsonb_agg(id order by id),'[]'::jsonb) from public.sanctuary_master),'reason','성역 1~4 공식 이름·노출·출시일 원본 유지'),
      jsonb_build_object('object','private.sanctuary_management_audit_events_v412','rowCount',(select count(*) from private.sanctuary_management_audit_events_v412),'idRange',(select jsonb_build_array(min(audit_id),max(audit_id)) from private.sanctuary_management_audit_events_v412),'reason','시험 운영 감사 이력 보존'),
      jsonb_build_object('object','private.sanctuary_management_commands_v412','rowCount',(select count(*) from private.sanctuary_management_commands_v412),'idRange',(select jsonb_build_array(min(command_id),max(command_id)) from private.sanctuary_management_commands_v412),'reason','중복 방지·복구 검증 이력 보존')
    ),
    'migrate','[]'::jsonb,
    'archive',jsonb_build_array(
      jsonb_build_object('object','private.sanctuary_management_teams_v412','rowCount',(select count(*) from private.sanctuary_management_teams_v412),'ids',(select coalesce(jsonb_agg(team_id order by team_id),'[]'::jsonb) from private.sanctuary_management_teams_v412),'reason','정식 오픈 전 시험 팀 전체를 해산 상태로 보관'),
      jsonb_build_object('object','public.sanctuary_schedules','rowCount',(select count(*) from public.sanctuary_schedules),'ids',(select coalesce(jsonb_agg(id order by id),'[]'::jsonb) from public.sanctuary_schedules),'reason','기존 일정 화면 이력 백업 후 신규 팀 일정으로 대체'),
      jsonb_build_object('object','public.sanctuary_schedule_teams','rowCount',(select count(*) from public.sanctuary_schedule_teams),'ids',(select coalesce(jsonb_agg(id order by id),'[]'::jsonb) from public.sanctuary_schedule_teams),'reason','기존 일정-팀 연결 이력 보관')
    ),
    'initialize',jsonb_build_array(
      jsonb_build_object('object','public.sanctuary_slots','rowCount',(select count(*) from public.sanctuary_slots),'occupiedRowCount',(select count(*) from public.sanctuary_slots where nullif(btrim(character_name),'') is not null),'occupiedIds',(select coalesce(jsonb_agg(id order by id),'[]'::jsonb) from public.sanctuary_slots where nullif(btrim(character_name),'') is not null),'reason','기존 시트 기반 파티 편성을 빈 상태로 시작'),
      jsonb_build_object('object','private.sanctuary_management_slots_v412','rowCount',(select count(*) from private.sanctuary_management_slots_v412),'occupiedRowCount',(select count(*) from private.sanctuary_management_slots_v412 where character_id is not null),'occupiedIds',(select coalesce(jsonb_agg(slot_id order by slot_id),'[]'::jsonb) from private.sanctuary_management_slots_v412 where character_id is not null),'reason','시험 팀 슬롯을 정식 운영 편성과 분리')
    ),
    'stop',jsonb_build_array(
      jsonb_build_object('object','public.sanctuary_sheet_sync_jobs','rowCount',(select count(*) from public.sanctuary_sheet_sync_jobs),'ids',(select coalesce(jsonb_agg(id order by id),'[]'::jsonb) from public.sanctuary_sheet_sync_jobs),'reason','Stage 7에서 성역 전용 자동·수동 Sheet 동기화 중지')
    ),
    'executionPolicy','이 목록은 승인 대상 산출물이며 Stage 6에서는 어떤 초기화·해산·동기화 중지도 실행하지 않습니다.'
  ) into v_targets;

  v_scope_hash:=encode(extensions.digest(convert_to(v_targets::text,'UTF8'),'sha256'),'hex');

  return jsonb_build_object(
    'ok',true,
    'apiVersion',1.7,
    'schemaVersion',445,
    'databaseContract',445,
    'generatedAt',statement_timestamp(),
    'cardComparison',jsonb_build_object(
      'legacy',v_legacy_cards,'server',v_new_cards,
      'comparisonClass','EXPECTED_PARALLEL_SCOPE',
      'explanation','기존 카드는 Sheet 편성, 신규 카드는 팀 아래 복수 포스를 갖는 Server 편성이므로 건수 일치를 요구하지 않습니다. 신규 2파티×5슬롯과 정원·중복 불변 조건을 비교 기준으로 사용합니다.'
    ),
    'scheduleComparison',v_schedule,
    'operations',jsonb_build_object(
      'commandCount',(select count(*) from private.sanctuary_management_commands_v412),
      'auditEventCount',(select count(*) from private.sanctuary_management_audit_events_v412),
      'pendingSupportCount',(select count(*) from private.sanctuary_management_support_items_v412 where status='PENDING'),
      'activeLeaseCount',(select count(*) from private.sanctuary_management_edit_leases_v412 where expires_at>statement_timestamp()),
      'checks',v_checks
    ),
    'evidence',v_evidence,
    'rollback',v_rollback,
    'targets',v_targets,
    'scopeHash',v_scope_hash,
    'structuralFailureCount',v_structural_failures,
    'evidenceFailureCount',v_evidence_failures,
    'unresolvedCount',v_structural_failures+v_evidence_failures+v_rollback_failures,
    'readyForApproval',v_structural_failures+v_evidence_failures+v_rollback_failures=0
  );
end;
$$;

create or replace function public.kinojo_sanctuary_management_rollout_state_v445()
returns jsonb
language sql
stable security definer
set search_path='pg_catalog','private'
as $$
  select jsonb_build_object(
    'ok',true,'apiVersion',1.7,'schemaVersion',445,'databaseContract',445,
    'readEnabled',settings.read_enabled,
    'globalWriteEnabled',settings.write_enabled,
    'writeRolloutMode',settings.write_rollout_mode,
    'lastRehearsal',coalesce((
      select jsonb_build_object('rehearsalId',rehearsal_id,'closedAt',closed_at,'restoredAt',restored_at,'restored',restored_mode='PILOT')
        from private.sanctuary_management_rollout_rehearsals_v445
       order by rehearsal_id desc limit 1
    ),jsonb_build_object('restored',false))
  )
  from private.sanctuary_management_settings_v412 settings
  where settings.singleton
$$;

create or replace function public.kinojo_sanctuary_management_rollout_control_v445(
  p_expected_mode text,
  p_target_mode text,
  p_reason text
)
returns jsonb
language plpgsql
volatile security definer
set search_path='pg_catalog','private'
as $$
declare
  v_expected text:=upper(btrim(coalesce(p_expected_mode,'')));
  v_target text:=upper(btrim(coalesce(p_target_mode,'')));
  v_reason text:=btrim(coalesce(p_reason,''));
  v_current text;
  v_rehearsal_id bigint;
begin
  if (v_expected,v_target) not in (('PILOT','CLOSED'),('CLOSED','PILOT')) then
    raise exception 'Stage 6 롤백 연습은 PILOT↔CLOSED 전환만 허용합니다.' using errcode='P0001';
  end if;
  if char_length(v_reason) not between 12 and 240 then
    raise exception '롤백 연습 사유를 12~240자로 입력해 주세요.' using errcode='P0001';
  end if;

  select write_rollout_mode into v_current
    from private.sanctuary_management_settings_v412
   where singleton
   for update;
  if v_current is distinct from v_expected then
    raise exception '운영 모드가 예상값과 달라 전환하지 않았습니다.' using errcode='40001',detail=jsonb_build_object('expected',v_expected,'actual',v_current)::text;
  end if;

  if v_target='CLOSED' then
    insert into private.sanctuary_management_rollout_rehearsals_v445(from_mode,closed_mode,reason,verification)
    values('PILOT','CLOSED',v_reason,jsonb_build_object('readPreserved',true,'writesExpected',false))
    returning rehearsal_id into v_rehearsal_id;
  else
    select rehearsal_id into v_rehearsal_id
      from private.sanctuary_management_rollout_rehearsals_v445
     where restored_at is null
     order by rehearsal_id desc
     limit 1
     for update;
    if v_rehearsal_id is null then
      raise exception '복구할 CLOSED 롤백 연습 기록이 없습니다.' using errcode='P0001';
    end if;
  end if;

  update private.sanctuary_management_settings_v412
     set write_rollout_mode=v_target,updated_at=statement_timestamp(),updated_by_member_id=null
   where singleton;

  if v_target='PILOT' then
    update private.sanctuary_management_rollout_rehearsals_v445
       set restored_mode='PILOT',restored_at=statement_timestamp(),verification=verification||jsonb_build_object('restored',true,'restoredReadEnabled',true)
     where rehearsal_id=v_rehearsal_id;
  end if;

  return jsonb_build_object('ok',true,'apiVersion',1.7,'schemaVersion',445,'databaseContract',445,
    'rehearsalId',v_rehearsal_id,'previousMode',v_current,'writeRolloutMode',v_target,'changedAt',statement_timestamp());
end;
$$;

create or replace function public.kinojo_sanctuary_management_record_evidence_v445(
  p_check_code text,
  p_status text,
  p_source text,
  p_details jsonb
)
returns jsonb
language plpgsql
volatile security definer
set search_path='pg_catalog','private'
as $$
declare
  v_code text:=upper(btrim(coalesce(p_check_code,'')));
  v_status text:=upper(btrim(coalesce(p_status,'')));
  v_source text:=left(btrim(coalesce(p_source,'')),120);
begin
  if v_code not in ('CARD_COMPARE','SCHEDULE_COMPARE','OPERATION_SCENARIO','RESILIENCE_CONCURRENCY','ROLLBACK_TARGETS') then
    raise exception 'Stage 6 검증 코드를 확인해 주세요.' using errcode='P0001';
  end if;
  if v_status not in ('PASS','FAIL') or char_length(v_source)<4 or jsonb_typeof(coalesce(p_details,'{}'::jsonb))<>'object' then
    raise exception 'Stage 6 검증 결과 형식을 확인해 주세요.' using errcode='P0001';
  end if;
  update private.sanctuary_management_stage6_evidence_v445
     set status=v_status,source=v_source,details=coalesce(p_details,'{}'::jsonb),verified_at=statement_timestamp(),updated_at=statement_timestamp()
   where check_code=v_code;
  return jsonb_build_object('ok',true,'checkCode',v_code,'status',v_status,'verifiedAt',statement_timestamp(),'apiVersion',1.7,'schemaVersion',445,'databaseContract',445);
end;
$$;

create or replace function public.kinojo_sanctuary_management_transition_report_v445(
  p_credential text,
  p_month date
)
returns jsonb
language plpgsql
stable security definer
set search_path='pg_catalog','public','private'
as $$
declare
  v_actor jsonb;
  v_member_id bigint;
  v_raw_role text;
  v_snapshot jsonb;
  v_approval jsonb;
begin
  v_actor:=private.kinojo_sm_actor_v412(p_credential);
  v_member_id:=nullif(v_actor->>'memberId','')::bigint;
  select upper(replace(coalesce(role,''),' ','_')) into v_raw_role from public.member_codes where id=v_member_id and is_active;
  if v_raw_role not in ('MASTER','ADMIN') then
    raise exception '전환 검수 자료는 MASTER 또는 전용 ADMIN만 확인할 수 있습니다.' using errcode='P0001';
  end if;

  v_snapshot:=private.kinojo_sm_transition_snapshot_v445(p_month);
  select coalesce((select jsonb_build_object(
    'approved',true,'approvalId',approval_id,'approvedAt',approved_at,
    'approverRole',approver_raw_role,'scopeHash',scope_hash
  ) from private.sanctuary_management_transition_approvals_v445
    where scope_hash=v_snapshot->>'scopeHash' and revoked_at is null
    order by approved_at desc limit 1),jsonb_build_object('approved',false)) into v_approval;

  return v_snapshot || jsonb_build_object(
    'reviewer',jsonb_build_object('rawRole',v_raw_role,'canReview',true,'canApprove',coalesce((v_snapshot->>'readyForApproval')::boolean,false)),
    'approval',v_approval
  );
end;
$$;

create or replace function public.kinojo_sanctuary_management_transition_approve_v445(
  p_credential text,
  p_month date,
  p_scope_hash text,
  p_scope_payload jsonb,
  p_confirmation text
)
returns jsonb
language plpgsql
volatile security definer
set search_path='pg_catalog','public','private'
as $$
declare
  v_actor jsonb;
  v_member_id bigint;
  v_raw_role text;
  v_snapshot jsonb;
  v_approval_id bigint;
begin
  perform private.kinojo_sm_assert_pilot_write_v439(p_credential,'APPROVE_TRANSITION_SCOPE');
  v_actor:=private.kinojo_sm_actor_v412(p_credential);
  v_member_id:=nullif(v_actor->>'memberId','')::bigint;
  select upper(replace(coalesce(role,''),' ','_')) into v_raw_role from public.member_codes where id=v_member_id and is_active;
  if v_raw_role not in ('MASTER','ADMIN') then
    raise exception '전환 범위를 승인할 권한이 없습니다.' using errcode='P0001';
  end if;
  if btrim(coalesce(p_confirmation,''))<>'전환 범위 승인' then
    raise exception '확인 문구를 정확히 입력해 주세요.' using errcode='P0001';
  end if;

  v_snapshot:=private.kinojo_sm_transition_snapshot_v445(p_month);
  if not coalesce((v_snapshot->>'readyForApproval')::boolean,false) then
    raise exception '미해결 검증 항목이 있어 전환 범위를 승인할 수 없습니다.' using errcode='P0001',detail=jsonb_build_object('unresolvedCount',v_snapshot->>'unresolvedCount')::text;
  end if;
  if btrim(coalesce(p_scope_hash,'')) is distinct from v_snapshot->>'scopeHash' or coalesce(p_scope_payload,'{}'::jsonb) is distinct from v_snapshot->'targets' then
    raise exception '검수 후 전환 대상이 변경되었습니다. 최신 자료를 다시 확인해 주세요.' using errcode='40001';
  end if;

  insert into private.sanctuary_management_transition_approvals_v445(
    approved_by_member_id,approver_raw_role,scope_hash,scope_payload
  ) values(v_member_id,v_raw_role,v_snapshot->>'scopeHash',v_snapshot->'targets')
  on conflict(approved_by_member_id,scope_hash) where revoked_at is null do nothing
  returning approval_id into v_approval_id;
  if v_approval_id is null then
    select approval_id into v_approval_id
      from private.sanctuary_management_transition_approvals_v445
     where approved_by_member_id=v_member_id and scope_hash=v_snapshot->>'scopeHash' and revoked_at is null;
  else
    insert into private.sanctuary_management_audit_events_v412(
      actor_member_id,team_id,entity_type,entity_id,action,before_payload,after_payload,request_key
    ) values(
      v_member_id,null,'TRANSITION_APPROVAL',v_approval_id,'APPROVE_TRANSITION_SCOPE',null,
      jsonb_build_object('scopeHash',v_snapshot->>'scopeHash','targets',v_snapshot->'targets'),
      'stage6-approval-'||left(v_snapshot->>'scopeHash',24)
    );
  end if;

  return jsonb_build_object('ok',true,'approved',true,'approvalId',v_approval_id,
    'scopeHash',v_snapshot->>'scopeHash','approvedAt',statement_timestamp(),
    'message','전환·초기화 범위가 승인되었습니다. 실제 실행은 Stage 7 전환 직전 백업과 재검증 뒤 진행합니다.',
    'apiVersion',1.7,'schemaVersion',445,'databaseContract',445);
end;
$$;

create or replace function public.kinojo_sanctuary_management_bootstrap_v445(p_credential text)
returns jsonb
language plpgsql
stable security definer
set search_path='pg_catalog','public','private'
as $$
declare
  v_base jsonb;
  v_actor jsonb;
  v_member_id bigint;
  v_raw_role text;
  v_snapshot jsonb;
  v_approved boolean:=false;
begin
  v_base:=public.kinojo_sanctuary_management_bootstrap_v439(p_credential);
  v_actor:=private.kinojo_sm_actor_v412(p_credential);
  v_member_id:=nullif(v_actor->>'memberId','')::bigint;
  select upper(replace(coalesce(role,''),' ','_')) into v_raw_role from public.member_codes where id=v_member_id and is_active;
  if v_raw_role in ('MASTER','ADMIN') then
    v_snapshot:=private.kinojo_sm_transition_snapshot_v445(current_date);
    select exists(select 1 from private.sanctuary_management_transition_approvals_v445 where scope_hash=v_snapshot->>'scopeHash' and revoked_at is null) into v_approved;
  end if;
  return v_base || jsonb_build_object(
    'apiVersion',1.7,'schemaVersion',445,'databaseContract',445,
    'transitionReview',case when v_raw_role in ('MASTER','ADMIN') then jsonb_build_object(
      'canReview',true,
      'canApprove',coalesce((v_snapshot->>'readyForApproval')::boolean,false) and coalesce((v_base->>'writeEnabled')::boolean,false),
      'approved',v_approved,
      'scopeHash',v_snapshot->>'scopeHash',
      'unresolvedCount',(v_snapshot->>'unresolvedCount')::integer
    ) else jsonb_build_object('canReview',false,'canApprove',false,'approved',false,'unresolvedCount',0) end
  );
end;
$$;

create or replace function public.kinojo_sanctuary_management_write_access_v445(p_credential text,p_action text)
returns jsonb language sql stable security definer set search_path='pg_catalog','public' as $$
  select public.kinojo_sanctuary_management_write_access_v439(p_credential,p_action)||jsonb_build_object('apiVersion',1.7,'schemaVersion',445,'databaseContract',445)
$$;

create or replace function public.kinojo_sanctuary_management_month_v445(p_credential text,p_month date)
returns jsonb language sql stable security definer set search_path='pg_catalog','public' as $$
  select public.kinojo_sanctuary_management_month_v439(p_credential,p_month)||jsonb_build_object('apiVersion',1.7,'schemaVersion',445,'databaseContract',445)
$$;

create or replace function public.kinojo_sanctuary_management_notification_summary_v445(p_credential text)
returns jsonb language sql stable security definer set search_path='pg_catalog','public' as $$
  select public.kinojo_sanctuary_management_notification_summary_v439(p_credential)||jsonb_build_object('apiVersion',1.7,'schemaVersion',445,'databaseContract',445)
$$;

create or replace function public.kinojo_sanctuary_management_archive_preview_v445(p_credential text,p_team_id bigint)
returns jsonb language sql volatile security definer set search_path='pg_catalog','public' as $$
  select public.kinojo_sanctuary_management_archive_preview_v439(p_credential,p_team_id)||jsonb_build_object('apiVersion',1.7,'schemaVersion',445,'databaseContract',445)
$$;

create or replace function public.kinojo_sanctuary_management_command_v445(
  p_credential text,p_request_key text,p_action text,p_payload jsonb,p_expected_revision bigint default null
)
returns jsonb language sql volatile security definer set search_path='pg_catalog','public' as $$
  select public.kinojo_sanctuary_management_command_v439(p_credential,p_request_key,p_action,p_payload,p_expected_revision)||jsonb_build_object('apiVersion',1.7,'schemaVersion',445,'databaseContract',445)
$$;

create or replace function public.kinojo_sanctuary_management_lease_v445(p_credential text,p_team_id bigint,p_action text,p_lease_token text)
returns jsonb language sql volatile security definer set search_path='pg_catalog','public' as $$
  select public.kinojo_sanctuary_management_lease_v439(p_credential,p_team_id,p_action,p_lease_token)||jsonb_build_object('apiVersion',1.7,'schemaVersion',445,'databaseContract',445)
$$;

create or replace function public.kinojo_sanctuary_management_official_materialize_v445(
  p_credential text,p_team_id bigint,p_candidate_id uuid,p_relation_type text,p_main_character_id bigint,p_request_key text
)
returns jsonb language sql volatile security definer set search_path='pg_catalog','public' as $$
  select public.kinojo_sanctuary_management_official_materialize_v439(p_credential,p_team_id,p_candidate_id,p_relation_type,p_main_character_id,p_request_key)||jsonb_build_object('apiVersion',1.7,'schemaVersion',445,'databaseContract',445)
$$;

comment on table private.sanctuary_management_stage6_evidence_v445 is
  'Stage 6 operator evidence only. Records test results, never credentials or passkeys.';
comment on table private.sanctuary_management_transition_approvals_v445 is
  'Explicit approval of an immutable transition scope hash. Approval does not execute Stage 7 changes.';
comment on function public.kinojo_sanctuary_management_transition_approve_v445(text,date,text,jsonb,text) is
  'Records explicit MASTER/ADMIN approval after all Stage 6 checks pass. It never initializes, archives, or deletes operational data.';

revoke all on function private.kinojo_sm_transition_snapshot_v445(date) from public,anon,authenticated;
revoke all on function public.kinojo_sanctuary_management_rollout_state_v445() from public,anon,authenticated;
revoke all on function public.kinojo_sanctuary_management_rollout_control_v445(text,text,text) from public,anon,authenticated;
revoke all on function public.kinojo_sanctuary_management_record_evidence_v445(text,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.kinojo_sanctuary_management_transition_report_v445(text,date) from public,anon,authenticated;
revoke all on function public.kinojo_sanctuary_management_transition_approve_v445(text,date,text,jsonb,text) from public,anon,authenticated;
revoke all on function public.kinojo_sanctuary_management_bootstrap_v445(text) from public,anon,authenticated;
revoke all on function public.kinojo_sanctuary_management_write_access_v445(text,text) from public,anon,authenticated;
revoke all on function public.kinojo_sanctuary_management_month_v445(text,date) from public,anon,authenticated;
revoke all on function public.kinojo_sanctuary_management_notification_summary_v445(text) from public,anon,authenticated;
revoke all on function public.kinojo_sanctuary_management_archive_preview_v445(text,bigint) from public,anon,authenticated;
revoke all on function public.kinojo_sanctuary_management_command_v445(text,text,text,jsonb,bigint) from public,anon,authenticated;
revoke all on function public.kinojo_sanctuary_management_lease_v445(text,bigint,text,text) from public,anon,authenticated;
revoke all on function public.kinojo_sanctuary_management_official_materialize_v445(text,bigint,uuid,text,bigint,text) from public,anon,authenticated;

grant execute on function public.kinojo_sanctuary_management_rollout_state_v445() to service_role;
grant execute on function public.kinojo_sanctuary_management_rollout_control_v445(text,text,text) to service_role;
grant execute on function public.kinojo_sanctuary_management_record_evidence_v445(text,text,text,jsonb) to service_role;
grant execute on function public.kinojo_sanctuary_management_transition_report_v445(text,date) to service_role;
grant execute on function public.kinojo_sanctuary_management_transition_approve_v445(text,date,text,jsonb,text) to service_role;
grant execute on function public.kinojo_sanctuary_management_bootstrap_v445(text) to service_role;
grant execute on function public.kinojo_sanctuary_management_write_access_v445(text,text) to service_role;
grant execute on function public.kinojo_sanctuary_management_month_v445(text,date) to service_role;
grant execute on function public.kinojo_sanctuary_management_notification_summary_v445(text) to service_role;
grant execute on function public.kinojo_sanctuary_management_archive_preview_v445(text,bigint) to service_role;
grant execute on function public.kinojo_sanctuary_management_command_v445(text,text,text,jsonb,bigint) to service_role;
grant execute on function public.kinojo_sanctuary_management_lease_v445(text,bigint,text,text) to service_role;
grant execute on function public.kinojo_sanctuary_management_official_materialize_v445(text,bigint,uuid,text,bigint,text) to service_role;
