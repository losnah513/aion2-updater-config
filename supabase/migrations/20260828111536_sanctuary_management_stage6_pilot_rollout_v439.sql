-- Stage 6-1: keep the new sanctuary domain readable for signed-in members while
-- restricting every mutation to an explicit, server-owned pilot allowlist.
-- CODEX_ADMIN is the dedicated visual-QA grade. It remains MASTER-equivalent,
-- but no passkey or browser credential is stored in schema comments or data.

alter table private.sanctuary_management_settings_v412
  add column if not exists write_rollout_mode text;

update private.sanctuary_management_settings_v412
   set write_rollout_mode = coalesce(nullif(upper(btrim(write_rollout_mode)), ''), 'PILOT')
 where singleton;

alter table private.sanctuary_management_settings_v412
  alter column write_rollout_mode set default 'PILOT',
  alter column write_rollout_mode set not null;

do $$
begin
  if not exists(
    select 1 from pg_constraint
     where conname = 'sanctuary_management_settings_v412_rollout_check'
       and conrelid = 'private.sanctuary_management_settings_v412'::regclass
  ) then
    alter table private.sanctuary_management_settings_v412
      add constraint sanctuary_management_settings_v412_rollout_check
      check(write_rollout_mode in ('CLOSED', 'PILOT', 'OPEN'));
  end if;
end;
$$;

create table if not exists private.sanctuary_management_pilot_members_v439(
  member_id bigint primary key references public.member_codes(id) on delete cascade,
  approved_by_member_id bigint references public.member_codes(id) on delete set null,
  approved_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz,
  revoked_at timestamptz,
  reason text not null default 'SANCTUARY_STAGE6_PILOT',
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint sanctuary_management_pilot_members_v439_reason_check
    check(char_length(btrim(reason)) between 1 and 240),
  constraint sanctuary_management_pilot_members_v439_expiry_check
    check(expires_at is null or expires_at > approved_at)
);

alter table private.sanctuary_management_pilot_members_v439 enable row level security;
revoke all on table private.sanctuary_management_pilot_members_v439 from public, anon, authenticated;

create index if not exists sanctuary_management_pilot_members_v439_approved_by_idx
  on private.sanctuary_management_pilot_members_v439(approved_by_member_id)
  where approved_by_member_id is not null;

create index if not exists sanctuary_management_pilot_members_v439_active_idx
  on private.sanctuary_management_pilot_members_v439(member_id, expires_at)
  where revoked_at is null;

insert into private.sanctuary_management_pilot_members_v439(
  member_id, approved_by_member_id, reason
)
select member.id,
       (select approver.id from public.member_codes approver
         where approver.role = 'MASTER' and approver.is_active
         order by approver.id limit 1),
       'INITIAL_MASTER_AND_CODEX_ADMIN_PILOT'
  from public.member_codes member
 where member.is_active
   and member.role in ('MASTER', 'ADMIN')
on conflict(member_id) do nothing;

update private.sanctuary_management_settings_v412
   set write_rollout_mode = 'PILOT',
       updated_at = clock_timestamp()
 where singleton;

create or replace function private.kinojo_sm_rollout_v439(p_credential text)
returns jsonb
language plpgsql
stable security definer
set search_path = 'pg_catalog', 'public', 'private'
as $$
declare
  v_actor jsonb;
  v_member_id bigint;
  v_read boolean;
  v_global_write boolean;
  v_mode text;
  v_pilot_approved_at timestamptz;
  v_pilot_expires_at timestamptz;
  v_pilot_approved boolean := false;
  v_effective_write boolean := false;
  v_reason_code text;
  v_message text;
begin
  v_actor := private.kinojo_sm_actor_v412(p_credential);
  v_member_id := nullif(v_actor->>'memberId', '')::bigint;

  select read_enabled, write_enabled, write_rollout_mode
    into v_read, v_global_write, v_mode
    from private.sanctuary_management_settings_v412
   where singleton;

  select pilot.approved_at, pilot.expires_at
    into v_pilot_approved_at, v_pilot_expires_at
    from private.sanctuary_management_pilot_members_v439 pilot
    join public.member_codes member on member.id = pilot.member_id and member.is_active
   where pilot.member_id = v_member_id
     and pilot.revoked_at is null
     and (pilot.expires_at is null or pilot.expires_at > statement_timestamp());

  v_pilot_approved := v_pilot_approved_at is not null;
  v_mode := coalesce(v_mode, 'CLOSED');
  v_effective_write := coalesce(v_global_write, false)
    and (v_mode = 'OPEN' or (v_mode = 'PILOT' and v_pilot_approved));

  if not coalesce(v_global_write, false) or v_mode = 'CLOSED' then
    v_reason_code := 'WRITE_GLOBALLY_DISABLED';
    v_message := '신규 성역 관리 쓰기는 현재 중지되어 있습니다.';
  elsif v_mode = 'PILOT' and not v_pilot_approved then
    v_reason_code := 'PILOT_NOT_APPROVED';
    v_message := '승인된 시험 사용자만 신규 성역 관리 쓰기를 사용할 수 있습니다.';
  else
    v_reason_code := case when v_mode = 'PILOT' then 'PILOT_APPROVED' else 'WRITE_OPEN' end;
    v_message := case when v_mode = 'PILOT'
      then '시험 사용자 쓰기가 활성화되었습니다.'
      else '신규 성역 관리 쓰기가 활성화되었습니다.' end;
  end if;

  return jsonb_build_object(
    'mode', v_mode,
    'readEnabled', coalesce(v_read, false),
    'globalWriteEnabled', coalesce(v_global_write, false),
    'effectiveWriteEnabled', v_effective_write,
    'pilotApproved', v_pilot_approved,
    'pilotApprovedAt', v_pilot_approved_at,
    'pilotExpiresAt', v_pilot_expires_at,
    'reasonCode', v_reason_code,
    'message', v_message,
    'memberId', v_member_id
  );
end;
$$;

create or replace function private.kinojo_sm_assert_pilot_write_v439(
  p_credential text,
  p_action text
)
returns void
language plpgsql
stable security definer
set search_path = 'pg_catalog', 'public', 'private'
as $$
declare v_rollout jsonb;
begin
  v_rollout := private.kinojo_sm_rollout_v439(p_credential);
  if not coalesce((v_rollout->>'effectiveWriteEnabled')::boolean, false) then
    raise exception '%', v_rollout->>'message'
      using errcode = '42501',
            detail = jsonb_build_object(
              'action', upper(left(btrim(coalesce(p_action, 'UNKNOWN')), 48)),
              'reasonCode', v_rollout->>'reasonCode',
              'rolloutMode', v_rollout->>'mode'
            )::text;
  end if;
end;
$$;

create or replace function public.kinojo_sanctuary_management_write_access_v439(
  p_credential text,
  p_action text default null
)
returns jsonb
language plpgsql
stable security definer
set search_path = 'pg_catalog', 'public', 'private'
as $$
declare v_rollout jsonb;
begin
  v_rollout := private.kinojo_sm_rollout_v439(p_credential);
  return (v_rollout - 'memberId') || jsonb_build_object(
    'ok', true,
    'apiVersion', 1.6,
    'schemaVersion', 439,
    'databaseContract', 439,
    'action', upper(left(btrim(coalesce(p_action, 'CHECK')), 48))
  );
end;
$$;

create or replace function public.kinojo_sanctuary_management_bootstrap_v439(p_credential text)
returns jsonb
language plpgsql
stable security definer
set search_path = 'pg_catalog', 'public', 'private'
as $$
declare
  v_base jsonb;
  v_rollout jsonb;
  v_effective boolean;
  v_teams jsonb;
begin
  v_rollout := private.kinojo_sm_rollout_v439(p_credential);
  v_effective := coalesce((v_rollout->>'effectiveWriteEnabled')::boolean, false);
  v_base := public.kinojo_sanctuary_management_bootstrap_v437(p_credential);

  select coalesce(jsonb_agg(
    team_item || jsonb_build_object(
      'canEdit', v_effective and coalesce((team_item->>'canEdit')::boolean, false),
      'canArchive', v_effective and coalesce((team_item->>'canArchive')::boolean, false),
      'scheduleEditScopes', case when v_effective then coalesce(team_item->'scheduleEditScopes', '[]'::jsonb) else '[]'::jsonb end,
      'forces', (
        select coalesce(jsonb_agg(
          force_item || jsonb_build_object(
            'canSupport', v_effective and coalesce((force_item->>'canSupport')::boolean, false),
            'supportDisabledCode', case when v_effective then force_item->>'supportDisabledCode' else v_rollout->>'reasonCode' end,
            'supportDisabledMessage', case when v_effective then force_item->>'supportDisabledMessage' else v_rollout->>'message' end
          ) order by force_order
        ), '[]'::jsonb)
        from jsonb_array_elements(coalesce(team_item->'forces', '[]'::jsonb))
          with ordinality force_list(force_item, force_order)
      )
    ) order by team_order
  ), '[]'::jsonb)
    into v_teams
    from jsonb_array_elements(coalesce(v_base->'teams', '[]'::jsonb))
      with ordinality team_list(team_item, team_order);

  return (v_base - 'teams' - 'writeEnabled') || jsonb_build_object(
    'apiVersion', 1.6,
    'schemaVersion', 439,
    'databaseContract', 439,
    'writeEnabled', v_effective,
    'globalWriteEnabled', coalesce((v_rollout->>'globalWriteEnabled')::boolean, false),
    'rollout', v_rollout - 'memberId',
    'teams', v_teams,
    'notificationPolicy', jsonb_build_object(
      'dedupe', 'WEB_SESSION',
      'groupBy', 'TEAM',
      'navigation', 'TEAM_FORCE_SUPPORT',
      'pilotOnly', true
    )
  );
end;
$$;

create or replace function public.kinojo_sanctuary_management_month_v439(
  p_credential text,
  p_month date
)
returns jsonb
language plpgsql
stable security definer
set search_path = 'pg_catalog', 'public', 'private'
as $$
declare
  v_base jsonb;
  v_rollout jsonb;
  v_effective boolean;
  v_occurrences jsonb;
begin
  v_rollout := private.kinojo_sm_rollout_v439(p_credential);
  v_effective := coalesce((v_rollout->>'effectiveWriteEnabled')::boolean, false);
  v_base := public.kinojo_sanctuary_management_month_v437(p_credential, p_month);
  select coalesce(jsonb_agg(
    occurrence_item || jsonb_build_object(
      'canEdit', v_effective and coalesce((occurrence_item->>'canEdit')::boolean, false)
    ) order by occurrence_order
  ), '[]'::jsonb)
    into v_occurrences
    from jsonb_array_elements(coalesce(v_base->'occurrences', '[]'::jsonb))
      with ordinality occurrence_list(occurrence_item, occurrence_order);
  return (v_base - 'occurrences') || jsonb_build_object(
    'apiVersion', 1.6,
    'schemaVersion', 439,
    'databaseContract', 439,
    'writeEnabled', v_effective,
    'rollout', v_rollout - 'memberId',
    'occurrences', v_occurrences
  );
end;
$$;

create or replace function public.kinojo_sanctuary_management_notification_summary_v439(p_credential text)
returns jsonb
language plpgsql
stable security definer
set search_path = 'pg_catalog', 'public', 'private'
as $$
declare v_rollout jsonb; v_base jsonb;
begin
  v_rollout := private.kinojo_sm_rollout_v439(p_credential);
  if not coalesce((v_rollout->>'effectiveWriteEnabled')::boolean, false) then
    return jsonb_build_object(
      'ok', true, 'apiVersion', 1.6, 'schemaVersion', 439, 'databaseContract', 439,
      'memberId', (v_rollout->>'memberId')::bigint,
      'dedupePolicy', 'WEB_SESSION', 'recruitmentCount', 0, 'recruitmentGroups', '[]'::jsonb,
      'writeEnabled', false, 'rollout', v_rollout - 'memberId'
    );
  end if;
  v_base := public.kinojo_sanctuary_management_notification_summary_v437(p_credential);
  return v_base || jsonb_build_object(
    'apiVersion', 1.6, 'schemaVersion', 439, 'databaseContract', 439,
    'writeEnabled', true, 'rollout', v_rollout - 'memberId'
  );
end;
$$;

create or replace function public.kinojo_sanctuary_management_archive_preview_v439(
  p_credential text,
  p_team_id bigint
)
returns jsonb
language plpgsql
stable security definer
set search_path = 'pg_catalog', 'public', 'private'
as $$
begin
  perform private.kinojo_sm_assert_pilot_write_v439(p_credential, 'ARCHIVE_PREVIEW');
  return public.kinojo_sanctuary_management_archive_preview_v437(p_credential, p_team_id)
    || jsonb_build_object('apiVersion', 1.6, 'schemaVersion', 439, 'databaseContract', 439);
end;
$$;

create or replace function public.kinojo_sanctuary_management_command_v439(
  p_credential text,
  p_request_key text,
  p_action text,
  p_payload jsonb default '{}'::jsonb,
  p_expected_revision bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $$
begin
  perform private.kinojo_sm_assert_pilot_write_v439(p_credential, p_action);
  return public.kinojo_sanctuary_management_command_v437(
    p_credential, p_request_key, p_action, coalesce(p_payload, '{}'::jsonb), p_expected_revision
  ) || jsonb_build_object('apiVersion', 1.6, 'schemaVersion', 439, 'databaseContract', 439);
end;
$$;

create or replace function public.kinojo_sanctuary_management_lease_v439(
  p_credential text,
  p_team_id bigint,
  p_action text,
  p_lease_token text
)
returns jsonb
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $$
begin
  perform private.kinojo_sm_assert_pilot_write_v439(p_credential, 'LEASE_' || upper(btrim(coalesce(p_action, ''))));
  return public.kinojo_sanctuary_management_lease_v412(p_credential, p_team_id, p_action, p_lease_token)
    || jsonb_build_object('apiVersion', 1.6, 'schemaVersion', 439, 'databaseContract', 439);
end;
$$;

create or replace function public.kinojo_sanctuary_management_official_materialize_v439(
  p_credential text,
  p_team_id bigint,
  p_candidate_id uuid,
  p_relation_type text,
  p_main_character_id bigint,
  p_request_key text
)
returns jsonb
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $$
begin
  perform private.kinojo_sm_assert_pilot_write_v439(p_credential, 'CHARACTER_REGISTER');
  return public.kinojo_sanctuary_management_official_materialize_v432(
    p_credential, p_team_id, p_candidate_id, p_relation_type, p_main_character_id, p_request_key
  ) || jsonb_build_object('apiVersion', 1.6, 'schemaVersion', 439, 'databaseContract', 439);
end;
$$;

comment on table private.sanctuary_management_pilot_members_v439 is
  'Stage 6 explicit write allowlist. Seeded MASTER and dedicated CODEX_ADMIN rows are approvals by member_id; secrets never belong in this table.';
comment on function private.kinojo_sm_assert_pilot_write_v439(text,text) is
  'Final Server write gate for Stage 6. UI state is advisory; every mutation must pass this credential-bound allowlist check.';

revoke all on function private.kinojo_sm_rollout_v439(text) from public, anon, authenticated;
revoke all on function private.kinojo_sm_assert_pilot_write_v439(text,text) from public, anon, authenticated;

revoke all on function public.kinojo_sanctuary_management_write_access_v439(text,text) from public, anon, authenticated;
revoke all on function public.kinojo_sanctuary_management_bootstrap_v439(text) from public, anon, authenticated;
revoke all on function public.kinojo_sanctuary_management_month_v439(text,date) from public, anon, authenticated;
revoke all on function public.kinojo_sanctuary_management_notification_summary_v439(text) from public, anon, authenticated;
revoke all on function public.kinojo_sanctuary_management_archive_preview_v439(text,bigint) from public, anon, authenticated;
revoke all on function public.kinojo_sanctuary_management_command_v439(text,text,text,jsonb,bigint) from public, anon, authenticated;
revoke all on function public.kinojo_sanctuary_management_lease_v439(text,bigint,text,text) from public, anon, authenticated;
revoke all on function public.kinojo_sanctuary_management_official_materialize_v439(text,bigint,uuid,text,bigint,text) from public, anon, authenticated;

grant execute on function public.kinojo_sanctuary_management_write_access_v439(text,text) to service_role;
grant execute on function public.kinojo_sanctuary_management_bootstrap_v439(text) to service_role;
grant execute on function public.kinojo_sanctuary_management_month_v439(text,date) to service_role;
grant execute on function public.kinojo_sanctuary_management_notification_summary_v439(text) to service_role;
grant execute on function public.kinojo_sanctuary_management_archive_preview_v439(text,bigint) to service_role;
grant execute on function public.kinojo_sanctuary_management_command_v439(text,text,text,jsonb,bigint) to service_role;
grant execute on function public.kinojo_sanctuary_management_lease_v439(text,bigint,text,text) to service_role;
grant execute on function public.kinojo_sanctuary_management_official_materialize_v439(text,bigint,uuid,text,bigint,text) to service_role;
