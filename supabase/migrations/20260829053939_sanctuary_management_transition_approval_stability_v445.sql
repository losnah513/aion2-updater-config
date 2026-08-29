-- Stage 6 approval stability hotfix.
-- Approval itself appends an audit event, so append-only audit/command counters must
-- remain visible in the report without invalidating an otherwise unchanged scope.

do $migration$
begin
  if to_regprocedure('private.kinojo_sm_transition_snapshot_raw_v445(date)') is null then
    execute 'alter function private.kinojo_sm_transition_snapshot_v445(date) rename to kinojo_sm_transition_snapshot_raw_v445';
  end if;
end;
$migration$;

create or replace function private.kinojo_sm_transition_scope_hash_v445(p_targets jsonb)
returns text
language sql
immutable security definer
set search_path='pg_catalog','extensions'
as $$
  select encode(
    extensions.digest(
      convert_to(
        jsonb_set(
          coalesce(p_targets,'{}'::jsonb),
          '{preserve}',
          coalesce((
            select jsonb_agg(
              case
                when target->>'object' in (
                  'private.sanctuary_management_audit_events_v412',
                  'private.sanctuary_management_commands_v412'
                ) then target-'rowCount'-'idRange'
                else target
              end
              order by ordinal
            )
            from jsonb_array_elements(coalesce(p_targets->'preserve','[]'::jsonb))
                 with ordinality as preserve_target(target,ordinal)
          ),'[]'::jsonb),
          true
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  )
$$;

create or replace function private.kinojo_sm_transition_snapshot_v445(p_month date)
returns jsonb
language sql
stable security definer
set search_path='pg_catalog','private'
as $$
  with raw_snapshot as (
    select private.kinojo_sm_transition_snapshot_raw_v445(p_month) as payload
  )
  select payload||jsonb_build_object(
    'scopeHash',
    private.kinojo_sm_transition_scope_hash_v445(payload->'targets')
  )
  from raw_snapshot
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
    'approverRole',approver_raw_role,'scopeHash',v_snapshot->>'scopeHash',
    'recordedScopeHash',scope_hash
  ) from private.sanctuary_management_transition_approvals_v445
    where revoked_at is null
      and (
        scope_hash=v_snapshot->>'scopeHash'
        or private.kinojo_sm_transition_scope_hash_v445(scope_payload)=v_snapshot->>'scopeHash'
      )
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

  select approval_id into v_approval_id
    from private.sanctuary_management_transition_approvals_v445
   where approved_by_member_id=v_member_id
     and revoked_at is null
     and (
       scope_hash=v_snapshot->>'scopeHash'
       or private.kinojo_sm_transition_scope_hash_v445(scope_payload)=v_snapshot->>'scopeHash'
     )
   order by approved_at desc
   limit 1;

  if v_approval_id is null then
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
    select exists(
      select 1
        from private.sanctuary_management_transition_approvals_v445
       where revoked_at is null
         and (
           scope_hash=v_snapshot->>'scopeHash'
           or private.kinojo_sm_transition_scope_hash_v445(scope_payload)=v_snapshot->>'scopeHash'
         )
    ) into v_approved;
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

comment on function private.kinojo_sm_transition_scope_hash_v445(jsonb) is
'Hashes the approved transition target identity while ignoring append-only audit and command counters.';
comment on function private.kinojo_sm_transition_snapshot_v445(date) is
'Returns the Stage 6 snapshot with an approval-stable transition scope hash.';
comment on function private.kinojo_sm_transition_snapshot_raw_v445(date) is
'Raw Stage 6 snapshot retained behind the approval-stable wrapper.';

revoke all on function private.kinojo_sm_transition_scope_hash_v445(jsonb) from public,anon,authenticated;
revoke all on function private.kinojo_sm_transition_snapshot_raw_v445(date) from public,anon,authenticated;
revoke all on function private.kinojo_sm_transition_snapshot_v445(date) from public,anon,authenticated;
revoke all on function public.kinojo_sanctuary_management_transition_report_v445(text,date) from public,anon,authenticated;
revoke all on function public.kinojo_sanctuary_management_transition_approve_v445(text,date,text,jsonb,text) from public,anon,authenticated;
revoke all on function public.kinojo_sanctuary_management_bootstrap_v445(text) from public,anon,authenticated;

grant execute on function public.kinojo_sanctuary_management_transition_report_v445(text,date) to service_role;
grant execute on function public.kinojo_sanctuary_management_transition_approve_v445(text,date,text,jsonb,text) to service_role;
grant execute on function public.kinojo_sanctuary_management_bootstrap_v445(text) to service_role;
