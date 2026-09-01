-- Sanctuary inline slot entry and edit-presence contract v458.
--
-- The browser polls this read model every ten seconds. It intentionally
-- exposes no editor identity or lease token; it only reports whether the
-- current viewer owns the active lease or another member does.

create or replace function public.kinojo_sanctuary_management_lease_status_v458(
  p_credential text,
  p_team_ids bigint[]
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_actor jsonb;
  v_actor_id bigint;
  v_ids bigint[];
  v_states jsonb;
begin
  v_actor := private.kinojo_sm_actor_v412(p_credential);
  v_actor_id := nullif(v_actor->>'memberId','')::bigint;
  if v_actor_id is null then
    raise exception '로그인 후 편집 상태를 확인해 주세요.' using errcode='P0001';
  end if;

  select coalesce(array_agg(distinct source.team_id order by source.team_id),'{}'::bigint[])
    into v_ids
    from unnest(coalesce(p_team_ids,'{}'::bigint[])) source(team_id)
   where source.team_id > 0;
  if cardinality(v_ids) > 100 then
    raise exception '한 번에 확인할 팀은 100개까지입니다.' using errcode='P0001';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'teamId',team.team_id,
    'active',lease.team_id is not null,
    'ownedByViewer',lease.actor_member_id=v_actor_id,
    'lockedByOther',lease.team_id is not null and lease.actor_member_id<>v_actor_id,
    'expiresAt',lease.expires_at,
    'canEdit',private.kinojo_sm_can_manage_team_v412(v_actor,team.team_id)
  ) order by team.team_id),'[]'::jsonb)
    into v_states
    from private.sanctuary_management_teams_v412 team
    left join private.sanctuary_management_edit_leases_v412 lease
      on lease.team_id=team.team_id
     and lease.expires_at>statement_timestamp()
   where team.team_id=any(v_ids)
     and team.status<>'ARCHIVED';

  return jsonb_build_object(
    'ok',true,'apiVersion',2.4,'schemaVersion',458,'databaseContract',458,
    'serverTime',statement_timestamp(),'states',v_states
  );
end
$function$;

create or replace function public.kinojo_sanctuary_management_official_prepare_all_v458(
  p_credential text,
  p_team_id bigint,
  p_character_name text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_actor jsonb;
  v_actor_id bigint;
  v_state public.official_lookup_rate_state%rowtype;
  v_now timestamptz := clock_timestamp();
  v_reserved_at timestamptz;
  v_wait_ms integer;
begin
  perform private.kinojo_sm_assert_pilot_write_v439(p_credential,'CHARACTER_SEARCH');
  v_actor := private.kinojo_sm_actor_v412(p_credential);
  v_actor_id := nullif(v_actor->>'memberId','')::bigint;
  if v_actor_id is null then
    raise exception '로그인 후 캐릭터를 조회해 주세요.' using errcode='P0001';
  end if;
  if not private.kinojo_sm_can_manage_team_v412(v_actor,p_team_id) then
    raise exception '다른 캐릭터를 추가할 권한이 없습니다.' using errcode='P0001';
  end if;
  if char_length(btrim(coalesce(p_character_name,''))) not between 1 and 12 then
    raise exception '캐릭터 이름은 1~12자로 입력해 주세요.' using errcode='P0001';
  end if;

  insert into public.official_lookup_rate_state(provider) values('plaync') on conflict(provider) do nothing;
  select * into v_state from public.official_lookup_rate_state where provider='plaync' for update;
  if v_state.paused_until is not null and v_state.paused_until>v_now then
    v_wait_ms := greatest(1,ceil(extract(epoch from(v_state.paused_until-v_now))*1000)::integer);
    return jsonb_build_object('ok',true,'allowed',false,'waitMs',v_wait_ms,'retryAfterSeconds',greatest(1,ceil(v_wait_ms/1000.0)::integer),'pausedUntil',v_state.paused_until,'schemaVersion',458,'databaseContract',458);
  end if;
  v_reserved_at := greatest(v_state.next_request_at,v_now);
  v_wait_ms := greatest(0,ceil(extract(epoch from(v_reserved_at-v_now))*1000)::integer);
  update public.official_lookup_rate_state
     set paused_until=null,next_request_at=v_reserved_at+interval '700 milliseconds',
         last_session_id='sm-v458:all:'||v_actor_id,last_source='SANCTUARY_MANAGEMENT_OFFICIAL_ALL_V458',updated_at=v_now
   where provider='plaync';
  return jsonb_build_object('ok',true,'allowed',true,'waitMs',v_wait_ms,'reservedAt',v_reserved_at,'schemaVersion',458,'databaseContract',458);
end
$function$;

comment on function public.kinojo_sanctuary_management_lease_status_v458(text,bigint[]) is
  'Credential-bound, identity-free edit-presence read model for visible Sanctuary teams.';
comment on function public.kinojo_sanctuary_management_official_prepare_all_v458(text,bigint,text) is
  'Rate-gated, team-manager-authorized reservation for exact-name official searches across all active servers.';

revoke all on function public.kinojo_sanctuary_management_lease_status_v458(text,bigint[]) from public,anon,authenticated;
revoke all on function public.kinojo_sanctuary_management_official_prepare_all_v458(text,bigint,text) from public,anon,authenticated;
grant execute on function public.kinojo_sanctuary_management_lease_status_v458(text,bigint[]) to service_role;
grant execute on function public.kinojo_sanctuary_management_official_prepare_all_v458(text,bigint,text) to service_role;
