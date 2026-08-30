-- Stage 8 Part 2 follow-up: make the force-level support affordance agree
-- with the per-character class eligibility returned by the v450 contract.
create or replace function private.kinojo_sm_enrich_team_v450(p_team jsonb, p_actor_member_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_team_id bigint := nullif(p_team->>'teamId', '')::bigint;
  v_roster jsonb;
  v_forces jsonb := '[]'::jsonb;
  v_force jsonb;
  v_viewer_force jsonb;
  v_force_id bigint;
  v_support jsonb;
  v_has_eligible_character boolean;
  v_result jsonb;
begin
  if v_team_id is null then return p_team; end if;

  if p_actor_member_id is not null and p_actor_member_id > 0 and p_team ? 'supportCharacters' then
    v_support := private.kinojo_sm_support_characters_v450(v_team_id, p_actor_member_id);
  end if;

  v_roster := private.kinojo_sm_force_roster_v450(v_team_id);
  for v_force in
    select item from jsonb_array_elements(coalesce(v_roster->'forces', '[]'::jsonb)) source(item)
  loop
    v_force_id := nullif(v_force->>'forceId', '')::bigint;
    select item into v_viewer_force
      from jsonb_array_elements(coalesce(p_team->'forces', '[]'::jsonb)) source(item)
     where nullif(item->>'forceId', '')::bigint = v_force_id
     limit 1;

    if v_support is not null and coalesce((v_viewer_force->>'canSupport')::boolean, false) then
      select exists (
        select 1
          from jsonb_array_elements(coalesce(v_support->'characters', '[]'::jsonb)) character_item(item)
         where coalesce(character_item.item->'availableForceIds', '[]'::jsonb) @> jsonb_build_array(v_force_id)
      ) into v_has_eligible_character;

      if not v_has_eligible_character then
        v_viewer_force := coalesce(v_viewer_force, '{}'::jsonb) || jsonb_build_object(
          'canSupport', false,
          'supportDisabledCode', 'NO_CLASS_ELIGIBLE_SLOT',
          'supportDisabledMessage', '내 캐릭터가 지원할 수 있는 클래스 슬롯이 없습니다.'
        );
      end if;
    end if;

    v_forces := v_forces || jsonb_build_array(coalesce(v_viewer_force, '{}'::jsonb) || v_force);
  end loop;

  v_result := (p_team - 'forceCount' - 'slotCount' - 'occupiedCount' - 'vacancyCount' - 'forces')
    || (v_roster - 'forces') || jsonb_build_object('forces', v_forces);
  if v_support is not null then
    v_result := jsonb_set(v_result, '{supportCharacters}', v_support, true);
  end if;
  return v_result;
end
$function$;

comment on function private.kinojo_sm_enrich_team_v450(jsonb, bigint) is
  'Stage 8 Part 2 read model: force support state is disabled when none of the viewer characters match an open slot class.';

revoke all on function private.kinojo_sm_enrich_team_v450(jsonb, bigint) from public, anon, authenticated;
grant execute on function private.kinojo_sm_enrich_team_v450(jsonb, bigint) to service_role;
