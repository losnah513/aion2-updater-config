-- Stage 7 final cutover control plane.
--
-- This migration only installs a service-role state machine. It does not execute
-- the approved destructive transition while DDL is being applied. Operators must
-- call BACKUP -> LOCK -> EXECUTE -> STOP_SYNC -> OPEN after verifying the immutable
-- Stage 6 scope hash. Every touched row is copied into a private row-level backup
-- first, and the matching restore function is kept for bounded recovery.

create table private.sanctuary_management_stage7_runs_v446(
  run_id bigserial primary key,
  approval_id bigint not null references private.sanctuary_management_transition_approvals_v445(approval_id) on delete restrict,
  scope_hash text not null,
  scope_payload jsonb not null,
  state text not null default 'BACKED_UP',
  backup_manifest jsonb not null default '{}'::jsonb,
  verification jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default statement_timestamp(),
  locked_at timestamptz,
  executed_at timestamptz,
  sync_stopped_at timestamptz,
  opened_at timestamptz,
  completed_at timestamptz,
  restored_at timestamptz,
  constraint sanctuary_management_stage7_runs_v446_hash_check check(scope_hash ~ '^[0-9a-f]{64}$'),
  constraint sanctuary_management_stage7_runs_v446_scope_check check(jsonb_typeof(scope_payload)='object'),
  constraint sanctuary_management_stage7_runs_v446_manifest_check check(jsonb_typeof(backup_manifest)='object'),
  constraint sanctuary_management_stage7_runs_v446_verification_check check(jsonb_typeof(verification)='object'),
  constraint sanctuary_management_stage7_runs_v446_state_check check(state in ('BACKED_UP','LOCKED','EXECUTED','SYNC_STOPPED','OPEN','COMPLETE','RESTORED'))
);

create unique index sanctuary_management_stage7_runs_v446_active_scope_uq
  on private.sanctuary_management_stage7_runs_v446(scope_hash)
  where restored_at is null;

create table private.sanctuary_management_stage7_backup_rows_v446(
  run_id bigint not null references private.sanctuary_management_stage7_runs_v446(run_id) on delete restrict,
  object_name text not null,
  row_key text not null,
  row_data jsonb not null,
  backed_up_at timestamptz not null default statement_timestamp(),
  primary key(run_id,object_name,row_key),
  constraint sanctuary_management_stage7_backup_rows_v446_object_check check(char_length(btrim(object_name)) between 3 and 160),
  constraint sanctuary_management_stage7_backup_rows_v446_key_check check(char_length(btrim(row_key)) between 1 and 160),
  constraint sanctuary_management_stage7_backup_rows_v446_data_check check(jsonb_typeof(row_data)='object')
);

alter table private.sanctuary_management_stage7_runs_v446 enable row level security;
alter table private.sanctuary_management_stage7_backup_rows_v446 enable row level security;
revoke all on table private.sanctuary_management_stage7_runs_v446 from public,anon,authenticated;
revoke all on table private.sanctuary_management_stage7_backup_rows_v446 from public,anon,authenticated;

create or replace function private.kinojo_sm_stage7_target_ids_v446(
  p_scope jsonb,
  p_section text,
  p_object text,
  p_key text default 'ids'
)
returns bigint[]
language sql
immutable security definer
set search_path='pg_catalog'
as $$
  select coalesce(array_agg(value::bigint order by value::bigint),'{}'::bigint[])
  from jsonb_array_elements_text(coalesce((
    select target->p_key
    from jsonb_array_elements(coalesce(p_scope->p_section,'[]'::jsonb)) target
    where target->>'object'=p_object
    limit 1
  ),'[]'::jsonb)) ids(value)
$$;

create or replace function private.kinojo_sm_stage7_audit_v446(
  p_run_id bigint,
  p_action text,
  p_before jsonb,
  p_after jsonb
)
returns void
language plpgsql
volatile security definer
set search_path='pg_catalog','private'
as $$
declare v_member_id bigint;
begin
  select approval.approved_by_member_id into strict v_member_id
  from private.sanctuary_management_stage7_runs_v446 run
  join private.sanctuary_management_transition_approvals_v445 approval on approval.approval_id=run.approval_id
  where run.run_id=p_run_id;

  insert into private.sanctuary_management_audit_events_v412(
    actor_member_id,team_id,entity_type,entity_id,action,before_payload,after_payload,request_key
  ) select
    v_member_id,null,'STAGE7_TRANSITION',p_run_id,upper(p_action),p_before,p_after,
    'stage7-'||p_run_id::text||'-'||lower(replace(p_action,'_','-'))
  where not exists(
    select 1 from private.sanctuary_management_audit_events_v412
    where actor_member_id=v_member_id
      and request_key='stage7-'||p_run_id::text||'-'||lower(replace(p_action,'_','-'))
  );
end;
$$;

create or replace function public.kinojo_sanctuary_management_stage7_control_v446(
  p_action text,
  p_scope_hash text,
  p_confirmation text
)
returns jsonb
language plpgsql
volatile security definer
set search_path='pg_catalog','public','private','cron'
as $$
declare
  v_action text:=upper(btrim(coalesce(p_action,'')));
  v_scope_hash text:=lower(btrim(coalesce(p_scope_hash,'')));
  v_snapshot jsonb;
  v_approval private.sanctuary_management_transition_approvals_v445%rowtype;
  v_run private.sanctuary_management_stage7_runs_v446%rowtype;
  v_run_id bigint;
  v_team_ids bigint[];
  v_legacy_schedule_ids bigint[];
  v_legacy_link_ids bigint[];
  v_public_slot_ids bigint[];
  v_private_slot_ids bigint[];
  v_sync_job_ids bigint[];
  v_counts jsonb;
  v_cron_job_id bigint;
  v_current_mode text;
begin
  if v_action not in ('BACKUP','LOCK','EXECUTE','STOP_SYNC','OPEN') then
    raise exception 'Stage 7 실행 단계를 확인해 주세요.' using errcode='P0001';
  end if;
  if p_confirmation is distinct from 'STAGE7_'||v_action then
    raise exception 'Stage 7 확인 문구가 일치하지 않습니다.' using errcode='P0001';
  end if;
  if v_scope_hash !~ '^[0-9a-f]{64}$' then
    raise exception '승인 범위 해시를 확인해 주세요.' using errcode='P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('KINOJO_SANCTUARY_STAGE7',0));

  select approval.* into v_approval
  from private.sanctuary_management_transition_approvals_v445 approval
  where approval.revoked_at is null
    and private.kinojo_sm_transition_scope_hash_v445(approval.scope_payload)=v_scope_hash
  order by approval.approved_at desc
  limit 1;
  if v_approval.approval_id is null then
    raise exception '유효한 Stage 6 전환 승인을 찾지 못했습니다.' using errcode='42501';
  end if;

  v_team_ids:=private.kinojo_sm_stage7_target_ids_v446(v_approval.scope_payload,'archive','private.sanctuary_management_teams_v412');
  v_legacy_schedule_ids:=private.kinojo_sm_stage7_target_ids_v446(v_approval.scope_payload,'archive','public.sanctuary_schedules');
  v_legacy_link_ids:=private.kinojo_sm_stage7_target_ids_v446(v_approval.scope_payload,'archive','public.sanctuary_schedule_teams');
  v_public_slot_ids:=private.kinojo_sm_stage7_target_ids_v446(v_approval.scope_payload,'initialize','public.sanctuary_slots','occupiedIds');
  v_private_slot_ids:=private.kinojo_sm_stage7_target_ids_v446(v_approval.scope_payload,'initialize','private.sanctuary_management_slots_v412','occupiedIds');
  v_sync_job_ids:=private.kinojo_sm_stage7_target_ids_v446(v_approval.scope_payload,'stop','public.sanctuary_sheet_sync_jobs');

  if v_action='BACKUP' then
    v_snapshot:=private.kinojo_sm_transition_snapshot_v445(current_date);
    if v_snapshot->>'scopeHash' is distinct from v_scope_hash
       or not coalesce((v_snapshot->>'readyForApproval')::boolean,false) then
      raise exception '운영 대상이 승인 시점과 달라 백업을 시작하지 않았습니다.' using errcode='40001';
    end if;
    if exists(select 1 from private.sanctuary_management_stage7_runs_v446 where scope_hash=v_scope_hash and restored_at is null) then
      select * into v_run from private.sanctuary_management_stage7_runs_v446 where scope_hash=v_scope_hash and restored_at is null;
      return jsonb_build_object('ok',true,'idempotent',true,'runId',v_run.run_id,'state',v_run.state,'scopeHash',v_scope_hash,'schemaVersion',446);
    end if;

    insert into private.sanctuary_management_stage7_runs_v446(approval_id,scope_hash,scope_payload,state)
    values(v_approval.approval_id,v_scope_hash,v_approval.scope_payload,'BACKED_UP')
    returning run_id into v_run_id;

    insert into private.sanctuary_management_stage7_backup_rows_v446(run_id,object_name,row_key,row_data)
      select v_run_id,'private.sanctuary_management_settings_v412','singleton',to_jsonb(row_data)
      from private.sanctuary_management_settings_v412 row_data where singleton
    union all select v_run_id,'public.sanctuary_master',id::text,to_jsonb(row_data)
      from public.sanctuary_master row_data
    union all select v_run_id,'private.sanctuary_management_audit_events_v412',audit_id::text,to_jsonb(row_data)
      from private.sanctuary_management_audit_events_v412 row_data
    union all select v_run_id,'private.sanctuary_management_commands_v412',command_id::text,to_jsonb(row_data)
      from private.sanctuary_management_commands_v412 row_data
    union all select v_run_id,'private.sanctuary_management_teams_v412',team_id::text,to_jsonb(row_data)
      from private.sanctuary_management_teams_v412 row_data where team_id=any(v_team_ids)
    union all select v_run_id,'private.sanctuary_management_schedule_rules_v412',schedule_id::text,to_jsonb(row_data)
      from private.sanctuary_management_schedule_rules_v412 row_data where team_id=any(v_team_ids)
    union all select v_run_id,'private.sanctuary_management_schedule_versions_v437',schedule_version_id::text,to_jsonb(row_data)
      from private.sanctuary_management_schedule_versions_v437 row_data where team_id=any(v_team_ids)
    union all select v_run_id,'private.sanctuary_management_edit_leases_v412',team_id::text,to_jsonb(row_data)
      from private.sanctuary_management_edit_leases_v412 row_data where team_id=any(v_team_ids)
    union all select v_run_id,'private.sanctuary_management_support_batches_v412',support_batch_id::text,to_jsonb(row_data)
      from private.sanctuary_management_support_batches_v412 row_data where team_id=any(v_team_ids)
    union all select v_run_id,'private.sanctuary_management_support_items_v412',support_item_id::text,to_jsonb(row_data)
      from private.sanctuary_management_support_items_v412 row_data where support_batch_id in(
        select support_batch_id from private.sanctuary_management_support_batches_v412 where team_id=any(v_team_ids)
      )
    union all select v_run_id,'private.sanctuary_management_slots_v412',slot_id::text,to_jsonb(row_data)
      from private.sanctuary_management_slots_v412 row_data where slot_id=any(v_private_slot_ids)
    union all select v_run_id,'public.sanctuary_slots',id::text,to_jsonb(row_data)
      from public.sanctuary_slots row_data where id=any(v_public_slot_ids)
    union all select v_run_id,'public.sanctuary_schedules',id::text,to_jsonb(row_data)
      from public.sanctuary_schedules row_data where id=any(v_legacy_schedule_ids)
    union all select v_run_id,'public.sanctuary_schedule_teams',id::text,to_jsonb(row_data)
      from public.sanctuary_schedule_teams row_data where id=any(v_legacy_link_ids)
    union all select v_run_id,'public.sanctuary_sheet_sync_jobs',id::text,to_jsonb(row_data)
      from public.sanctuary_sheet_sync_jobs row_data where id=any(v_sync_job_ids)
    union all select v_run_id,'cron.job',jobid::text,to_jsonb(row_data)
      from cron.job row_data where jobname='kinojo-sanctuary-sheet-sync-12h-v377';

    select jsonb_object_agg(object_name,row_count) into v_counts
    from(
      select object_name,count(*) row_count
      from private.sanctuary_management_stage7_backup_rows_v446
      where run_id=v_run_id group by object_name
    ) backed_up;
    update private.sanctuary_management_stage7_runs_v446
      set backup_manifest=jsonb_build_object(
        'generatedAt',statement_timestamp(),'freshSnapshot',v_snapshot,'rowCounts',coalesce(v_counts,'{}'::jsonb),
        'recoveryFunction','public.kinojo_sanctuary_management_stage7_restore_v446'
      ) where run_id=v_run_id;
    perform private.kinojo_sm_stage7_audit_v446(v_run_id,'BACKUP',null,jsonb_build_object('rowCounts',v_counts,'scopeHash',v_scope_hash));
    return jsonb_build_object('ok',true,'runId',v_run_id,'state','BACKED_UP','scopeHash',v_scope_hash,'rowCounts',v_counts,'schemaVersion',446);
  end if;

  select * into v_run from private.sanctuary_management_stage7_runs_v446
  where scope_hash=v_scope_hash and restored_at is null for update;
  if v_run.run_id is null then
    raise exception '먼저 Stage 7 백업을 생성해 주세요.' using errcode='P0001';
  end if;
  v_run_id:=v_run.run_id;

  if v_action='LOCK' then
    if v_run.state not in ('BACKED_UP','LOCKED') then
      raise exception '백업 직후 단계에서만 쓰기를 잠글 수 있습니다.' using errcode='P0001';
    end if;
    if exists(select 1 from private.sanctuary_management_edit_leases_v412 where expires_at>statement_timestamp()) then
      raise exception '진행 중인 편집 잠금이 있어 전환을 중단했습니다.' using errcode='40001';
    end if;
    if exists(select 1 from private.sanctuary_management_support_items_v412 where status='PENDING') then
      raise exception '대기 중인 참여 지원이 있어 전환을 중단했습니다.' using errcode='40001';
    end if;
    if exists(select 1 from public.sanctuary_sheet_sync_jobs where status in ('queued','processing')) then
      raise exception '진행 중인 성역 Sheet 동기화가 있어 전환을 중단했습니다.' using errcode='40001';
    end if;
    select write_rollout_mode into v_current_mode from private.sanctuary_management_settings_v412 where singleton for update;
    if v_current_mode not in ('PILOT','CLOSED') then
      raise exception '예상하지 않은 쓰기 모드입니다.' using errcode='40001';
    end if;
    update private.sanctuary_management_settings_v412
       set write_rollout_mode='CLOSED',schema_version=446,updated_at=statement_timestamp(),updated_by_member_id=v_approval.approved_by_member_id
     where singleton;
    delete from private.sanctuary_management_edit_leases_v412 where team_id=any(v_team_ids);
    update private.sanctuary_management_stage7_runs_v446
       set state='LOCKED',locked_at=coalesce(locked_at,statement_timestamp()),
           verification=verification||jsonb_build_object('lock',jsonb_build_object('activeLeaseCount',0,'pendingSupportCount',0,'activeSyncJobCount',0))
     where run_id=v_run_id;
    perform private.kinojo_sm_stage7_audit_v446(v_run_id,'LOCK',jsonb_build_object('writeRolloutMode',v_current_mode),jsonb_build_object('writeRolloutMode','CLOSED'));
    return jsonb_build_object('ok',true,'runId',v_run_id,'state','LOCKED','writeRolloutMode','CLOSED','schemaVersion',446);
  end if;

  if v_action='EXECUTE' then
    if v_run.state not in ('LOCKED','EXECUTED') then
      raise exception '쓰기 잠금 완료 후에만 데이터 전환을 실행할 수 있습니다.' using errcode='P0001';
    end if;
    select write_rollout_mode into v_current_mode from private.sanctuary_management_settings_v412 where singleton for update;
    if v_current_mode<>'CLOSED' then
      raise exception '쓰기 잠금이 유지되지 않아 전환을 중단했습니다.' using errcode='40001';
    end if;
    if v_run.state='EXECUTED' then
      return jsonb_build_object('ok',true,'idempotent',true,'runId',v_run_id,'state','EXECUTED','schemaVersion',446);
    end if;

    update private.sanctuary_management_schedule_rules_v412
       set status='STOPPED',revision=revision+1,updated_at=statement_timestamp()
     where team_id=any(v_team_ids) and status<>'STOPPED';
    update private.sanctuary_management_schedule_versions_v437
       set status='STOPPED',effective_to=coalesce(effective_to,greatest(effective_from,current_date))
     where team_id=any(v_team_ids) and status<>'STOPPED';
    update private.sanctuary_management_slots_v412
       set character_id=null,owner_member_id=null,owner_root_character_id=null,character_relation=null,
           added_by_member_id=null,revision=revision+1,updated_at=statement_timestamp()
     where slot_id=any(v_private_slot_ids);
    update private.sanctuary_management_teams_v412
       set status='ARCHIVED',revision=revision+1,archived_at=coalesce(archived_at,statement_timestamp()),
           archived_by_member_id=coalesce(archived_by_member_id,v_approval.approved_by_member_id),
           archive_reason=coalesce(archive_reason,'Stage 7 정식 운영 전 시험 팀 초기화'),updated_at=statement_timestamp()
     where team_id=any(v_team_ids) and status<>'ARCHIVED';
    update public.sanctuary_slots
       set character_name=null,owner=null,class_name=null,power=null,profile_image_url=null,
           character_master_id=null,updated_by='STAGE7_TRANSITION',updated_at=statement_timestamp()
     where id=any(v_public_slot_ids);
    update public.sanctuary_schedules
       set status='canceled',canceled_at=coalesce(canceled_at,statement_timestamp()),
           cancel_reason=coalesce(cancel_reason,'Stage 7 신규 팀 일정으로 전환'),
           metadata=metadata||jsonb_build_object('stage7Archived',true,'stage7RunId',v_run_id,'stage7ArchivedAt',statement_timestamp()),
           updated_at=statement_timestamp()
     where id=any(v_legacy_schedule_ids);
    update public.sanctuary_schedule_teams
       set status='canceled',metadata=metadata||jsonb_build_object('stage7Archived',true,'stage7RunId',v_run_id),updated_at=statement_timestamp()
     where id=any(v_legacy_link_ids);

    select jsonb_build_object(
      'archivedTeamCount',(select count(*) from private.sanctuary_management_teams_v412 where team_id=any(v_team_ids) and status='ARCHIVED'),
      'stoppedRuleCount',(select count(*) from private.sanctuary_management_schedule_rules_v412 where team_id=any(v_team_ids) and status='STOPPED'),
      'privateOccupiedCount',(select count(*) from private.sanctuary_management_slots_v412 where slot_id=any(v_private_slot_ids) and character_id is not null),
      'publicOccupiedCount',(select count(*) from public.sanctuary_slots where id=any(v_public_slot_ids) and nullif(btrim(character_name),'') is not null),
      'legacyCanceledCount',(select count(*) from public.sanctuary_schedules where id=any(v_legacy_schedule_ids) and status='canceled'),
      'legacyLinkCanceledCount',(select count(*) from public.sanctuary_schedule_teams where id=any(v_legacy_link_ids) and status='canceled')
    ) into v_counts;
    if (v_counts->>'archivedTeamCount')::integer<>cardinality(v_team_ids)
       or (v_counts->>'privateOccupiedCount')::integer<>0
       or (v_counts->>'publicOccupiedCount')::integer<>0
       or (v_counts->>'legacyCanceledCount')::integer<>cardinality(v_legacy_schedule_ids)
       or (v_counts->>'legacyLinkCanceledCount')::integer<>cardinality(v_legacy_link_ids) then
      raise exception 'Stage 7 데이터 전환 검증에 실패했습니다.' using errcode='40001',detail=v_counts::text;
    end if;
    update private.sanctuary_management_stage7_runs_v446
       set state='EXECUTED',executed_at=statement_timestamp(),verification=verification||jsonb_build_object('execution',v_counts)
     where run_id=v_run_id;
    perform private.kinojo_sm_stage7_audit_v446(v_run_id,'EXECUTE',null,v_counts);
    return jsonb_build_object('ok',true,'runId',v_run_id,'state','EXECUTED','verification',v_counts,'schemaVersion',446);
  end if;

  if v_action='STOP_SYNC' then
    if v_run.state not in ('EXECUTED','SYNC_STOPPED') then
      raise exception '데이터 전환 완료 후에만 Sheet 동기화를 중지할 수 있습니다.' using errcode='P0001';
    end if;
    update public.sanctuary_sheet_sync_jobs
       set result=result||jsonb_build_object('stage7Stopped',true,'stage7RunId',v_run_id,'stage7StoppedAt',statement_timestamp())
     where id=any(v_sync_job_ids);
    for v_cron_job_id in
      select jobid from cron.job where jobname='kinojo-sanctuary-sheet-sync-12h-v377' and active
    loop
      perform cron.alter_job(job_id=>v_cron_job_id,active=>false);
    end loop;
    update private.sanctuary_management_stage7_runs_v446
       set state='SYNC_STOPPED',sync_stopped_at=coalesce(sync_stopped_at,statement_timestamp()),
           verification=verification||jsonb_build_object('syncStop',jsonb_build_object(
             'annotatedJobCount',(select count(*) from public.sanctuary_sheet_sync_jobs where id=any(v_sync_job_ids) and result->>'stage7Stopped'='true'),
             'activeCronCount',(select count(*) from cron.job where jobname='kinojo-sanctuary-sheet-sync-12h-v377' and active)
           ))
     where run_id=v_run_id;
    if exists(select 1 from cron.job where jobname='kinojo-sanctuary-sheet-sync-12h-v377' and active) then
      raise exception '성역 Sheet 자동 동기화 크론 중지에 실패했습니다.' using errcode='40001';
    end if;
    perform private.kinojo_sm_stage7_audit_v446(v_run_id,'STOP_SYNC',jsonb_build_object('active',true),jsonb_build_object('active',false));
    return jsonb_build_object('ok',true,'runId',v_run_id,'state','SYNC_STOPPED','activeCronCount',0,'schemaVersion',446);
  end if;

  if v_run.state not in ('SYNC_STOPPED','OPEN','COMPLETE') then
    raise exception 'Sheet 동기화 중지 검증 후에만 정식 쓰기를 열 수 있습니다.' using errcode='P0001';
  end if;
  if exists(select 1 from cron.job where jobname='kinojo-sanctuary-sheet-sync-12h-v377' and active) then
    raise exception '성역 Sheet 자동 동기화가 남아 있어 정식 쓰기를 열지 않았습니다.' using errcode='40001';
  end if;
  update private.sanctuary_management_settings_v412
     set read_enabled=true,write_enabled=true,write_rollout_mode='OPEN',schema_version=446,
         updated_at=statement_timestamp(),updated_by_member_id=v_approval.approved_by_member_id
   where singleton;
  update private.sanctuary_management_stage7_runs_v446
     set state='OPEN',opened_at=coalesce(opened_at,statement_timestamp()),verification=verification||jsonb_build_object(
       'open',jsonb_build_object('readEnabled',true,'writeEnabled',true,'writeRolloutMode','OPEN','sheetSyncActive',false)
     ) where run_id=v_run_id and state<>'COMPLETE';
  perform private.kinojo_sm_stage7_audit_v446(v_run_id,'OPEN',jsonb_build_object('writeRolloutMode','CLOSED'),jsonb_build_object('writeRolloutMode','OPEN'));
  return jsonb_build_object('ok',true,'runId',v_run_id,'state','OPEN','readEnabled',true,'writeEnabled',true,'writeRolloutMode','OPEN','schemaVersion',446);
end;
$$;

create or replace function public.kinojo_sanctuary_management_stage7_restore_v446(
  p_run_id bigint,
  p_confirmation text
)
returns jsonb
language plpgsql
volatile security definer
set search_path='pg_catalog','public','private','cron'
as $$
declare v_run private.sanctuary_management_stage7_runs_v446%rowtype; v_settings private.sanctuary_management_settings_v412%rowtype; v_cron jsonb;
begin
  if p_confirmation is distinct from 'STAGE7_RESTORE_'||p_run_id::text then
    raise exception '복구 확인 문구가 일치하지 않습니다.' using errcode='P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('KINOJO_SANCTUARY_STAGE7',0));
  select * into strict v_run from private.sanctuary_management_stage7_runs_v446 where run_id=p_run_id for update;
  if v_run.state='RESTORED' then return jsonb_build_object('ok',true,'idempotent',true,'runId',p_run_id,'state','RESTORED','schemaVersion',446); end if;

  update private.sanctuary_management_settings_v412 set write_rollout_mode='CLOSED',updated_at=statement_timestamp() where singleton;

  update private.sanctuary_management_teams_v412 target set
    sanctuary_id=backup.sanctuary_id,title=backup.title,activity=backup.activity,team_mode=backup.team_mode,
    join_policy=backup.join_policy,status=backup.status,creator_member_id=backup.creator_member_id,revision=backup.revision,
    published_at=backup.published_at,archived_at=backup.archived_at,archived_by_member_id=backup.archived_by_member_id,
    archive_reason=backup.archive_reason,created_at=backup.created_at,updated_at=backup.updated_at
  from jsonb_populate_recordset(null::private.sanctuary_management_teams_v412,coalesce((select jsonb_agg(row_data) from private.sanctuary_management_stage7_backup_rows_v446 where run_id=p_run_id and object_name='private.sanctuary_management_teams_v412'),'[]'::jsonb)) backup
  where target.team_id=backup.team_id;

  update private.sanctuary_management_schedule_rules_v412 target set
    team_id=backup.team_id,schedule_kind=backup.schedule_kind,starts_on=backup.starts_on,weekdays=backup.weekdays,
    starts_at=backup.starts_at,duration_minutes=backup.duration_minutes,timezone_name=backup.timezone_name,status=backup.status,
    revision=backup.revision,created_at=backup.created_at,updated_at=backup.updated_at
  from jsonb_populate_recordset(null::private.sanctuary_management_schedule_rules_v412,coalesce((select jsonb_agg(row_data) from private.sanctuary_management_stage7_backup_rows_v446 where run_id=p_run_id and object_name='private.sanctuary_management_schedule_rules_v412'),'[]'::jsonb)) backup
  where target.schedule_id=backup.schedule_id;

  update private.sanctuary_management_schedule_versions_v437 target set
    schedule_id=backup.schedule_id,team_id=backup.team_id,effective_from=backup.effective_from,effective_to=backup.effective_to,
    schedule_kind=backup.schedule_kind,starts_on=backup.starts_on,weekdays=backup.weekdays,starts_at=backup.starts_at,
    duration_minutes=backup.duration_minutes,timezone_name=backup.timezone_name,status=backup.status,revision=backup.revision,
    created_by_member_id=backup.created_by_member_id,created_at=backup.created_at
  from jsonb_populate_recordset(null::private.sanctuary_management_schedule_versions_v437,coalesce((select jsonb_agg(row_data) from private.sanctuary_management_stage7_backup_rows_v446 where run_id=p_run_id and object_name='private.sanctuary_management_schedule_versions_v437'),'[]'::jsonb)) backup
  where target.schedule_version_id=backup.schedule_version_id;

  update private.sanctuary_management_slots_v412 target set
    character_id=backup.character_id,owner_member_id=backup.owner_member_id,owner_root_character_id=backup.owner_root_character_id,
    character_relation=backup.character_relation,added_by_member_id=backup.added_by_member_id,revision=backup.revision,
    created_at=backup.created_at,updated_at=backup.updated_at
  from jsonb_populate_recordset(null::private.sanctuary_management_slots_v412,coalesce((select jsonb_agg(row_data) from private.sanctuary_management_stage7_backup_rows_v446 where run_id=p_run_id and object_name='private.sanctuary_management_slots_v412'),'[]'::jsonb)) backup
  where target.slot_id=backup.slot_id;

  update public.sanctuary_slots target set
    sanctuary_id=backup.sanctuary_id,team_no=backup.team_no,party_no=backup.party_no,slot_no=backup.slot_no,
    character_name=backup.character_name,owner=backup.owner,class_name=backup.class_name,power=backup.power,
    profile_image_url=backup.profile_image_url,updated_by=backup.updated_by,created_at=backup.created_at,
    updated_at=backup.updated_at,character_master_id=backup.character_master_id
  from jsonb_populate_recordset(null::public.sanctuary_slots,coalesce((select jsonb_agg(row_data) from private.sanctuary_management_stage7_backup_rows_v446 where run_id=p_run_id and object_name='public.sanctuary_slots'),'[]'::jsonb)) backup
  where target.id=backup.id;

  update public.sanctuary_schedules target set
    sanctuary_code=backup.sanctuary_code,title=backup.title,description=backup.description,target_date=backup.target_date,
    starts_at=backup.starts_at,ends_at=backup.ends_at,status=backup.status,response_deadline=backup.response_deadline,
    location=backup.location,created_by_member_id=backup.created_by_member_id,created_by_character=backup.created_by_character,
    updated_by_member_id=backup.updated_by_member_id,updated_by_character=backup.updated_by_character,confirmed_at=backup.confirmed_at,
    canceled_at=backup.canceled_at,completed_at=backup.completed_at,cancel_reason=backup.cancel_reason,metadata=backup.metadata,
    created_at=backup.created_at,updated_at=backup.updated_at
  from jsonb_populate_recordset(null::public.sanctuary_schedules,coalesce((select jsonb_agg(row_data) from private.sanctuary_management_stage7_backup_rows_v446 where run_id=p_run_id and object_name='public.sanctuary_schedules'),'[]'::jsonb)) backup
  where target.id=backup.id;

  update public.sanctuary_schedule_teams target set
    schedule_id=backup.schedule_id,sanctuary_code=backup.sanctuary_code,operating_team_no=backup.operating_team_no,
    force_no=backup.force_no,status=backup.status,starts_at=backup.starts_at,ends_at=backup.ends_at,note=backup.note,
    metadata=backup.metadata,created_at=backup.created_at,updated_at=backup.updated_at
  from jsonb_populate_recordset(null::public.sanctuary_schedule_teams,coalesce((select jsonb_agg(row_data) from private.sanctuary_management_stage7_backup_rows_v446 where run_id=p_run_id and object_name='public.sanctuary_schedule_teams'),'[]'::jsonb)) backup
  where target.id=backup.id;

  update public.sanctuary_sheet_sync_jobs target set
    sanctuary_id=backup.sanctuary_id,sheet_name=backup.sheet_name,mode=backup.mode,status=backup.status,
    requested_by=backup.requested_by,requested_character=backup.requested_character,raw_sheet=backup.raw_sheet,
    parsed_summary=backup.parsed_summary,result=backup.result,error_message=backup.error_message,created_at=backup.created_at,
    started_at=backup.started_at,completed_at=backup.completed_at
  from jsonb_populate_recordset(null::public.sanctuary_sheet_sync_jobs,coalesce((select jsonb_agg(row_data) from private.sanctuary_management_stage7_backup_rows_v446 where run_id=p_run_id and object_name='public.sanctuary_sheet_sync_jobs'),'[]'::jsonb)) backup
  where target.id=backup.id;

  delete from private.sanctuary_management_edit_leases_v412 where team_id in(
    select (row_data->>'team_id')::bigint from private.sanctuary_management_stage7_backup_rows_v446 where run_id=p_run_id and object_name='private.sanctuary_management_edit_leases_v412'
  );
  insert into private.sanctuary_management_edit_leases_v412
  select backup.* from jsonb_populate_recordset(null::private.sanctuary_management_edit_leases_v412,coalesce((select jsonb_agg(row_data) from private.sanctuary_management_stage7_backup_rows_v446 where run_id=p_run_id and object_name='private.sanctuary_management_edit_leases_v412'),'[]'::jsonb)) backup;

  select * into v_settings from jsonb_populate_record(null::private.sanctuary_management_settings_v412,
    (select row_data from private.sanctuary_management_stage7_backup_rows_v446 where run_id=p_run_id and object_name='private.sanctuary_management_settings_v412' and row_key='singleton'));
  update private.sanctuary_management_settings_v412 set
    schema_version=v_settings.schema_version,read_enabled=v_settings.read_enabled,write_enabled=v_settings.write_enabled,
    updated_by_member_id=v_settings.updated_by_member_id,updated_at=v_settings.updated_at,write_rollout_mode=v_settings.write_rollout_mode
  where singleton;

  for v_cron in select row_data from private.sanctuary_management_stage7_backup_rows_v446 where run_id=p_run_id and object_name='cron.job'
  loop
    perform cron.alter_job(job_id=>(v_cron->>'jobid')::bigint,active=>(v_cron->>'active')::boolean);
  end loop;

  update private.sanctuary_management_stage7_runs_v446 set state='RESTORED',restored_at=statement_timestamp() where run_id=p_run_id;
  perform private.kinojo_sm_stage7_audit_v446(p_run_id,'RESTORE',null,jsonb_build_object('restored',true));
  return jsonb_build_object('ok',true,'runId',p_run_id,'state','RESTORED','restoredAt',statement_timestamp(),'schemaVersion',446);
end;
$$;

create or replace function public.kinojo_sanctuary_management_stage7_complete_v446(
  p_run_id bigint,
  p_verification jsonb
)
returns jsonb
language plpgsql
volatile security definer
set search_path='pg_catalog','private'
as $$
declare v_run private.sanctuary_management_stage7_runs_v446%rowtype;
begin
  if jsonb_typeof(coalesce(p_verification,'{}'::jsonb))<>'object' then raise exception '완료 검증 형식을 확인해 주세요.' using errcode='P0001'; end if;
  select * into strict v_run from private.sanctuary_management_stage7_runs_v446 where run_id=p_run_id for update;
  if v_run.state not in('OPEN','COMPLETE') then raise exception '정식 OPEN 상태에서만 전환을 완료할 수 있습니다.' using errcode='P0001'; end if;
  update private.sanctuary_management_stage7_runs_v446 set state='COMPLETE',completed_at=coalesce(completed_at,statement_timestamp()),verification=verification||jsonb_build_object('final',p_verification) where run_id=p_run_id;
  perform private.kinojo_sm_stage7_audit_v446(p_run_id,'COMPLETE',null,p_verification);
  return jsonb_build_object('ok',true,'runId',p_run_id,'state','COMPLETE','completedAt',statement_timestamp(),'schemaVersion',446);
end;
$$;

create or replace function public.kinojo_sanctuary_management_rollout_state_v446()
returns jsonb language sql stable security definer set search_path='pg_catalog','private','cron' as $$
  select jsonb_build_object(
    'ok',true,'apiVersion',1.8,'schemaVersion',446,'databaseContract',446,
    'readEnabled',settings.read_enabled,'globalWriteEnabled',settings.write_enabled,
    'writeRolloutMode',settings.write_rollout_mode,
    'sheetSyncEnabled',exists(select 1 from cron.job where jobname='kinojo-sanctuary-sheet-sync-12h-v377' and active),
    'transition',coalesce((select jsonb_build_object('runId',run_id,'state',state,'scopeHash',scope_hash,'startedAt',started_at,'openedAt',opened_at,'completedAt',completed_at,'restoredAt',restored_at) from private.sanctuary_management_stage7_runs_v446 order by run_id desc limit 1),jsonb_build_object('state','NOT_STARTED'))
  ) from private.sanctuary_management_settings_v412 settings where singleton
$$;

create or replace function public.kinojo_sanctuary_management_bootstrap_v446(p_credential text)
returns jsonb language sql stable security definer set search_path='pg_catalog','public','private' as $$
  select (base-'notificationPolicy'-'transitionReview')||jsonb_build_object(
    'apiVersion',1.8,'schemaVersion',446,'databaseContract',446,
    'notificationPolicy',coalesce(base->'notificationPolicy','{}'::jsonb)||jsonb_build_object('pilotOnly',false),
    'transitionReview',coalesce(base->'transitionReview','{}'::jsonb)||coalesce((
      select jsonb_build_object('executed',state in('EXECUTED','SYNC_STOPPED','OPEN','COMPLETE'),'completed',state='COMPLETE','runId',run_id,'stage7State',state)
      from private.sanctuary_management_stage7_runs_v446 order by run_id desc limit 1
    ),jsonb_build_object('executed',false,'completed',false,'stage7State','NOT_STARTED'))
  ) from (select public.kinojo_sanctuary_management_bootstrap_v445(p_credential) base) source
$$;

create or replace function public.kinojo_sanctuary_management_write_access_v446(p_credential text,p_action text)
returns jsonb language sql stable security definer set search_path='pg_catalog','public' as $$
  select public.kinojo_sanctuary_management_write_access_v445(p_credential,p_action)||jsonb_build_object('apiVersion',1.8,'schemaVersion',446,'databaseContract',446)
$$;
create or replace function public.kinojo_sanctuary_management_month_v446(p_credential text,p_month date)
returns jsonb language sql stable security definer set search_path='pg_catalog','public' as $$
  select public.kinojo_sanctuary_management_month_v445(p_credential,p_month)||jsonb_build_object('apiVersion',1.8,'schemaVersion',446,'databaseContract',446)
$$;
create or replace function public.kinojo_sanctuary_management_notification_summary_v446(p_credential text)
returns jsonb language sql stable security definer set search_path='pg_catalog','public' as $$
  select public.kinojo_sanctuary_management_notification_summary_v445(p_credential)||jsonb_build_object('apiVersion',1.8,'schemaVersion',446,'databaseContract',446)
$$;
create or replace function public.kinojo_sanctuary_management_archive_preview_v446(p_credential text,p_team_id bigint)
returns jsonb language sql volatile security definer set search_path='pg_catalog','public' as $$
  select public.kinojo_sanctuary_management_archive_preview_v445(p_credential,p_team_id)||jsonb_build_object('apiVersion',1.8,'schemaVersion',446,'databaseContract',446)
$$;
create or replace function public.kinojo_sanctuary_management_command_v446(p_credential text,p_request_key text,p_action text,p_payload jsonb,p_expected_revision bigint default null)
returns jsonb language sql volatile security definer set search_path='pg_catalog','public' as $$
  select public.kinojo_sanctuary_management_command_v445(p_credential,p_request_key,p_action,p_payload,p_expected_revision)||jsonb_build_object('apiVersion',1.8,'schemaVersion',446,'databaseContract',446)
$$;
create or replace function public.kinojo_sanctuary_management_lease_v446(p_credential text,p_team_id bigint,p_action text,p_lease_token text)
returns jsonb language sql volatile security definer set search_path='pg_catalog','public' as $$
  select public.kinojo_sanctuary_management_lease_v445(p_credential,p_team_id,p_action,p_lease_token)||jsonb_build_object('apiVersion',1.8,'schemaVersion',446,'databaseContract',446)
$$;
create or replace function public.kinojo_sanctuary_management_official_materialize_v446(p_credential text,p_team_id bigint,p_candidate_id uuid,p_relation_type text,p_main_character_id bigint,p_request_key text)
returns jsonb language sql volatile security definer set search_path='pg_catalog','public' as $$
  select public.kinojo_sanctuary_management_official_materialize_v445(p_credential,p_team_id,p_candidate_id,p_relation_type,p_main_character_id,p_request_key)||jsonb_build_object('apiVersion',1.8,'schemaVersion',446,'databaseContract',446)
$$;

comment on table private.sanctuary_management_stage7_runs_v446 is 'Recoverable Stage 7 final cutover state. No credential, passkey, or browser session is stored.';
comment on table private.sanctuary_management_stage7_backup_rows_v446 is 'Exact pre-cutover copies for approved rows and the retired sanctuary sync cron definition.';
comment on function public.kinojo_sanctuary_management_stage7_control_v446(text,text,text) is 'Service-role only BACKUP/LOCK/EXECUTE/STOP_SYNC/OPEN state machine for the approved Stage 7 scope.';
comment on function public.kinojo_sanctuary_management_stage7_restore_v446(bigint,text) is 'Service-role only bounded restoration of rows copied by the matching Stage 7 run.';

revoke all on function private.kinojo_sm_stage7_target_ids_v446(jsonb,text,text,text) from public,anon,authenticated;
revoke all on function private.kinojo_sm_stage7_audit_v446(bigint,text,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.kinojo_sanctuary_management_stage7_control_v446(text,text,text) from public,anon,authenticated;
revoke all on function public.kinojo_sanctuary_management_stage7_restore_v446(bigint,text) from public,anon,authenticated;
revoke all on function public.kinojo_sanctuary_management_stage7_complete_v446(bigint,jsonb) from public,anon,authenticated;
revoke all on function public.kinojo_sanctuary_management_rollout_state_v446() from public,anon,authenticated;
revoke all on function public.kinojo_sanctuary_management_bootstrap_v446(text) from public,anon,authenticated;
revoke all on function public.kinojo_sanctuary_management_write_access_v446(text,text) from public,anon,authenticated;
revoke all on function public.kinojo_sanctuary_management_month_v446(text,date) from public,anon,authenticated;
revoke all on function public.kinojo_sanctuary_management_notification_summary_v446(text) from public,anon,authenticated;
revoke all on function public.kinojo_sanctuary_management_archive_preview_v446(text,bigint) from public,anon,authenticated;
revoke all on function public.kinojo_sanctuary_management_command_v446(text,text,text,jsonb,bigint) from public,anon,authenticated;
revoke all on function public.kinojo_sanctuary_management_lease_v446(text,bigint,text,text) from public,anon,authenticated;
revoke all on function public.kinojo_sanctuary_management_official_materialize_v446(text,bigint,uuid,text,bigint,text) from public,anon,authenticated;

grant execute on function public.kinojo_sanctuary_management_stage7_control_v446(text,text,text) to service_role;
grant execute on function public.kinojo_sanctuary_management_stage7_restore_v446(bigint,text) to service_role;
grant execute on function public.kinojo_sanctuary_management_stage7_complete_v446(bigint,jsonb) to service_role;
grant execute on function public.kinojo_sanctuary_management_rollout_state_v446() to service_role;
grant execute on function public.kinojo_sanctuary_management_bootstrap_v446(text) to service_role;
grant execute on function public.kinojo_sanctuary_management_write_access_v446(text,text) to service_role;
grant execute on function public.kinojo_sanctuary_management_month_v446(text,date) to service_role;
grant execute on function public.kinojo_sanctuary_management_notification_summary_v446(text) to service_role;
grant execute on function public.kinojo_sanctuary_management_archive_preview_v446(text,bigint) to service_role;
grant execute on function public.kinojo_sanctuary_management_command_v446(text,text,text,jsonb,bigint) to service_role;
grant execute on function public.kinojo_sanctuary_management_lease_v446(text,bigint,text,text) to service_role;
grant execute on function public.kinojo_sanctuary_management_official_materialize_v446(text,bigint,uuid,text,bigint,text) to service_role;
