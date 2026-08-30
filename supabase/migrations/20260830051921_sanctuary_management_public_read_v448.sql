-- Public Sanctuary read contract.
-- Guests can read only published teams, force rosters and monthly occurrences.
-- Account-specific candidates, support requests and management permissions stay
-- behind the existing authenticated v446 functions and Edge write gate.

create index if not exists sanctuary_management_teams_v448_public_created_idx
  on private.sanctuary_management_teams_v412(created_at desc, team_id desc)
  where status in ('ACTIVE', 'FULL');

create or replace function private.kinojo_sm_public_force_roster_v448(p_team_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
declare
  v_roster jsonb;
  v_forces jsonb := '[]'::jsonb;
  v_force jsonb;
begin
  v_roster := private.kinojo_sm_force_roster_v430(p_team_id);
  for v_force in
    select force_item
      from jsonb_array_elements(coalesce(v_roster->'forces', '[]'::jsonb)) force_list(force_item)
  loop
    v_forces := v_forces || jsonb_build_array(
      v_force || jsonb_build_object(
        'creatorMemberId', null,
        'creatorOwnerResolved', false,
        'creatorAlreadyAssigned', false,
        'creatorCandidateCode', 'LOGIN_REQUIRED',
        'creatorCandidateCount', 0,
        'creatorCandidates', '[]'::jsonb,
        'viewerAlreadyAssigned', false,
        'viewerPending', false,
        'canSupport', false,
        'supportDisabledCode', 'LOGIN_REQUIRED',
        'supportDisabledMessage', '로그인 후 지원할 수 있습니다.'
      )
    );
  end loop;
  return jsonb_set(v_roster, '{forces}', v_forces, true);
end;
$function$;

create or replace function public.kinojo_sanctuary_management_public_bootstrap_v448()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
declare
  v_read boolean := false;
  v_global_write boolean := false;
  v_rollout_mode text := 'CLOSED';
  v_teams jsonb := '[]'::jsonb;
begin
  select settings.read_enabled, settings.write_enabled, settings.write_rollout_mode
    into v_read, v_global_write, v_rollout_mode
    from private.sanctuary_management_settings_v412 settings
   where settings.singleton;

  if coalesce(v_read, false) then
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'teamId', team.team_id,
        'sanctuaryId', team.sanctuary_id,
        'title', team.title,
        'activity', team.activity,
        'mode', team.team_mode,
        'joinPolicy', team.join_policy,
        'status', team.status,
        'revision', team.revision,
        'publishedAt', team.published_at,
        'archivedAt', null,
        'canEdit', false,
        'canArchive', false,
        'scheduleEditScopes', '[]'::jsonb,
        'schedule', jsonb_build_object(
          'scheduleId', rule.schedule_id,
          'kind', rule.schedule_kind,
          'startsOn', rule.starts_on,
          'weekdays', rule.weekdays,
          'startsAt', to_char(rule.starts_at, 'HH24:MI'),
          'durationMinutes', rule.duration_minutes,
          'timezoneName', rule.timezone_name,
          'status', rule.status,
          'revision', rule.revision
        ),
        'supportCharacters', jsonb_build_object(
          'ownerResolved', false,
          'code', 'LOGIN_REQUIRED',
          'candidateCount', 0,
          'characters', '[]'::jsonb
        ),
        'supportBatches', '[]'::jsonb
      ) || private.kinojo_sm_public_force_roster_v448(team.team_id)
      order by team.created_at desc, team.team_id desc
    ), '[]'::jsonb)
      into v_teams
      from private.sanctuary_management_teams_v412 team
      join private.sanctuary_management_schedule_rules_v412 rule
        on rule.team_id = team.team_id
     where team.status in ('ACTIVE', 'FULL');
  end if;

  return jsonb_build_object(
    'ok', true,
    'apiVersion', 1.8,
    'schemaVersion', 446,
    'databaseContract', 446,
    'serverTime', clock_timestamp(),
    'publicRead', true,
    'readEnabled', coalesce(v_read, false),
    'writeEnabled', false,
    'globalWriteEnabled', coalesce(v_global_write, false),
    'rollout', jsonb_build_object(
      'mode', coalesce(v_rollout_mode, 'CLOSED'),
      'globalWriteEnabled', coalesce(v_global_write, false),
      'effectiveWriteEnabled', false,
      'pilotApproved', false,
      'reasonCode', 'LOGIN_REQUIRED',
      'message', '팀 생성·지원·편집은 로그인 후 사용할 수 있습니다.'
    ),
    'actor', jsonb_build_object('loggedIn', false, 'role', 'GUEST'),
    'composerCharacters', jsonb_build_object(
      'ownerResolved', false,
      'code', 'LOGIN_REQUIRED',
      'candidateCount', 0,
      'characters', '[]'::jsonb
    ),
    'notificationPolicy', jsonb_build_object('enabled', false, 'reasonCode', 'LOGIN_REQUIRED'),
    'transitionReview', coalesce((
      select jsonb_build_object(
        'canReview', false,
        'canApprove', false,
        'approved', false,
        'executed', run.state in ('EXECUTED', 'SYNC_STOPPED', 'OPEN', 'COMPLETE'),
        'completed', run.state = 'COMPLETE',
        'runId', run.run_id,
        'stage7State', run.state,
        'unresolvedCount', 0
      )
        from private.sanctuary_management_stage7_runs_v446 run
       order by run.run_id desc
       limit 1
    ), jsonb_build_object(
      'canReview', false,
      'canApprove', false,
      'approved', false,
      'executed', false,
      'completed', false,
      'stage7State', 'NOT_STARTED',
      'unresolvedCount', 0
    )),
    'sanctuaries', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', sanctuary.id,
        'code', sanctuary.code,
        'name', sanctuary.name,
        'shortName', sanctuary.short_name,
        'displayOrder', sanctuary.display_order,
        'legacyEnabled', sanctuary.enabled,
        'managementVisible', sanctuary.management_visible,
        'availableFrom', sanctuary.available_from,
        'releaseStatus', coalesce(sanctuary.metadata->>'releaseStatus', case when sanctuary.enabled then 'OPEN' else 'UPCOMING' end),
        'releaseLabel', sanctuary.metadata->>'releaseLabel'
      ) order by sanctuary.display_order), '[]'::jsonb)
        from public.sanctuary_master sanctuary
       where sanctuary.management_visible
    ),
    'teams', v_teams
  );
end;
$function$;

create or replace function public.kinojo_sanctuary_management_public_month_v448(p_month date)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
declare
  v_month_start date;
  v_month_end date;
  v_range_start date;
  v_range_end date;
begin
  if p_month is null then
    raise exception '조회할 월을 선택해 주세요.' using errcode = 'P0001';
  end if;
  v_month_start := date_trunc('month', p_month)::date;
  if extract(year from v_month_start) not between 2025 and 2100 then
    raise exception '조회할 월 범위를 다시 확인해 주세요.' using errcode = 'P0001';
  end if;
  v_month_end := (v_month_start + interval '1 month - 1 day')::date;
  v_range_start := v_month_start - ((extract(isodow from v_month_start)::integer - 3 + 7) % 7);
  v_range_end := v_month_end + ((2 - extract(isodow from v_month_end)::integer + 7) % 7);

  return jsonb_build_object(
    'ok', true,
    'apiVersion', 1.8,
    'schemaVersion', 446,
    'databaseContract', 446,
    'publicRead', true,
    'writeEnabled', false,
    'month', to_char(v_month_start, 'YYYY-MM'),
    'weekStartsOn', 'WEDNESDAY',
    'rangeStart', v_range_start,
    'rangeEnd', v_range_end,
    'weekStarts', (
      select coalesce(jsonb_agg(day::date order by day), '[]'::jsonb)
        from generate_series(v_range_start, v_range_end, interval '7 days') day
    ),
    'occurrences', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'occurrenceKey', 'sm-' || team.team_id || '-' || to_char(occurrence.occurrence_date, 'YYYYMMDD') || '-' || to_char(occurrence.start_at at time zone rule.timezone_name, 'HH24MI'),
        'scheduleId', rule.schedule_id,
        'scheduleRevision', rule.revision,
        'teamId', team.team_id,
        'teamTitle', team.title,
        'sanctuaryId', team.sanctuary_id,
        'teamMode', team.team_mode,
        'joinPolicy', team.join_policy,
        'occurrenceDate', occurrence.occurrence_date,
        'weekStart', occurrence.occurrence_date - ((extract(isodow from occurrence.occurrence_date)::integer - 3 + 7) % 7),
        'startAt', occurrence.start_at,
        'endAt', occurrence.end_at,
        'durationMinutes', round(extract(epoch from (occurrence.end_at - occurrence.start_at)) / 60)::integer,
        'sourceScope', occurrence.source_scope,
        'canEdit', false
      ) order by occurrence.start_at, team.team_id), '[]'::jsonb)
        from private.sanctuary_management_teams_v412 team
        join private.sanctuary_management_schedule_rules_v412 rule
          on rule.team_id = team.team_id
        cross join lateral private.kinojo_sm_rule_occurrences_v437(rule.schedule_id, v_range_start, v_range_end) occurrence
       where team.status in ('ACTIVE', 'FULL')
    )
  );
end;
$function$;

comment on function public.kinojo_sanctuary_management_public_bootstrap_v448() is
  'Service-role-only public Sanctuary read model. Returns ACTIVE/FULL teams without viewer candidates, requests or write permissions.';
comment on function public.kinojo_sanctuary_management_public_month_v448(date) is
  'Service-role-only public monthly Sanctuary schedule. It validates no credential and never returns viewer-specific state.';

revoke all on function private.kinojo_sm_public_force_roster_v448(bigint) from public, anon, authenticated;
revoke all on function public.kinojo_sanctuary_management_public_bootstrap_v448() from public, anon, authenticated;
revoke all on function public.kinojo_sanctuary_management_public_month_v448(date) from public, anon, authenticated;
grant execute on function public.kinojo_sanctuary_management_public_bootstrap_v448() to service_role;
grant execute on function public.kinojo_sanctuary_management_public_month_v448(date) to service_role;
