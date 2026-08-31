-- Stage 11: selected-sanctuary bootstrap and lightweight revision checks.
--
-- The former v454 public/authenticated entrypoints enriched every active team
-- across all sanctuaries before the browser discarded the unselected rows.
-- v456 keeps the stable v446/v448 identity and permission projection, filters
-- its team array first, and runs the expensive v454 roster enrichment only for
-- the sanctuary the user is actually viewing.

create or replace function private.kinojo_sm_selected_sanctuary_v456(p_sanctuary_code text)
returns public.sanctuary_master
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_code text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_sanctuary_code, '')));
  v_sanctuary public.sanctuary_master%rowtype;
begin
  select sanctuary.*
    into v_sanctuary
    from public.sanctuary_master sanctuary
   where sanctuary.management_visible
     and (
       v_code = ''
       or pg_catalog.lower(sanctuary.code) = v_code
       or sanctuary.id::text = v_code
     )
   order by
     case when pg_catalog.lower(sanctuary.code) = v_code or sanctuary.id::text = v_code then 0 else 1 end,
     sanctuary.display_order,
     sanctuary.id
   limit 1;

  if v_sanctuary.id is null then
    raise exception '조회할 성역을 확인하지 못했습니다.' using errcode = 'P0001';
  end if;
  return v_sanctuary;
end
$function$;

create or replace function private.kinojo_sm_selected_teams_v456(p_teams jsonb, p_sanctuary_id bigint)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(
    pg_catalog.jsonb_agg(source.item order by source.ordinality),
    '[]'::jsonb
  )
  from pg_catalog.jsonb_array_elements(coalesce(p_teams, '[]'::jsonb)) with ordinality source(item, ordinality)
  where nullif(source.item->>'sanctuaryId', '')::bigint = p_sanctuary_id
$function$;

create or replace function private.kinojo_sm_revision_v456(p_sanctuary_id bigint)
returns text
language sql
stable
security definer
set search_path = ''
as $function$
  select pg_catalog.md5(pg_catalog.jsonb_build_object(
    'settings', coalesce((
      select pg_catalog.jsonb_build_array(
        settings.read_enabled, settings.write_enabled, settings.write_rollout_mode,
        settings.updated_at
      )
      from private.sanctuary_management_settings_v412 settings
      where settings.singleton
    ), '[]'::jsonb),
    'teams', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(
        team.team_id, team.status, team.revision, team.updated_at
      ) order by team.team_id)
      from private.sanctuary_management_teams_v412 team
      where team.sanctuary_id = p_sanctuary_id
    ), '[]'::jsonb),
    'forces', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(
        force.force_id, force.status, force.revision, force.difficulty, force.updated_at
      ) order by force.force_id)
      from private.sanctuary_management_forces_v412 force
      join private.sanctuary_management_teams_v412 team on team.team_id = force.team_id
      where team.sanctuary_id = p_sanctuary_id
    ), '[]'::jsonb),
    'slots', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(
        slot.slot_id, slot.character_id, slot.owner_member_id, slot.assignment_kind,
        slot.required_class_code, slot.placement_locked, slot.revision, slot.updated_at,
        character.latest_pve_combat_power, character.latest_pve_item_level
      ) order by slot.slot_id)
      from private.sanctuary_management_slots_v412 slot
      join private.sanctuary_management_teams_v412 team on team.team_id = slot.team_id
      left join public.character_master character on character.id = slot.character_id
      where team.sanctuary_id = p_sanctuary_id
    ), '[]'::jsonb),
    'schedules', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(
        schedule.schedule_id, schedule.status, schedule.revision, schedule.updated_at
      ) order by schedule.schedule_id)
      from private.sanctuary_management_schedule_rules_v412 schedule
      join private.sanctuary_management_teams_v412 team on team.team_id = schedule.team_id
      where team.sanctuary_id = p_sanctuary_id
    ), '[]'::jsonb),
    'supportBatches', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(
        batch.support_batch_id, batch.status, batch.updated_at
      ) order by batch.support_batch_id)
      from private.sanctuary_management_support_batches_v412 batch
      join private.sanctuary_management_teams_v412 team on team.team_id = batch.team_id
      where team.sanctuary_id = p_sanctuary_id
    ), '[]'::jsonb),
    'supportItems', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(
        item.support_item_id, item.status, item.applied_slot_id, item.updated_at
      ) order by item.support_item_id)
      from private.sanctuary_management_support_items_v412 item
      join private.sanctuary_management_support_batches_v412 batch on batch.support_batch_id = item.support_batch_id
      join private.sanctuary_management_teams_v412 team on team.team_id = batch.team_id
      where team.sanctuary_id = p_sanctuary_id
    ), '[]'::jsonb)
  )::text)
$function$;

create or replace function public.kinojo_sanctuary_management_public_revision_v456(p_sanctuary_code text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_sanctuary public.sanctuary_master%rowtype := private.kinojo_sm_selected_sanctuary_v456(p_sanctuary_code);
begin
  return pg_catalog.jsonb_build_object(
    'ok', true,
    'apiVersion', 2.3,
    'schemaVersion', 456,
    'databaseContract', 456,
    'sanctuaryId', v_sanctuary.id,
    'sanctuaryCode', v_sanctuary.code,
    'revisionKey', private.kinojo_sm_revision_v456(v_sanctuary.id),
    'serverTime', pg_catalog.clock_timestamp()
  );
end
$function$;

create or replace function public.kinojo_sanctuary_management_public_bootstrap_v456(p_sanctuary_code text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_sanctuary public.sanctuary_master%rowtype := private.kinojo_sm_selected_sanctuary_v456(p_sanctuary_code);
  v_base jsonb := public.kinojo_sanctuary_management_public_bootstrap_v448();
  v_teams jsonb;
begin
  v_teams := private.kinojo_sm_selected_teams_v456(v_base->'teams', v_sanctuary.id);
  return (v_base - 'teams' - 'apiVersion' - 'schemaVersion' - 'databaseContract')
    || pg_catalog.jsonb_build_object(
      'apiVersion', 2.3,
      'schemaVersion', 456,
      'databaseContract', 456,
      'selectedSanctuaryId', v_sanctuary.id,
      'selectedSanctuaryCode', v_sanctuary.code,
      'revisionKey', private.kinojo_sm_revision_v456(v_sanctuary.id),
      'teams', private.kinojo_sm_enrich_teams_v454(v_teams, null)
    );
end
$function$;

create or replace function public.kinojo_sanctuary_management_bootstrap_v456(
  p_credential text,
  p_sanctuary_code text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_sanctuary public.sanctuary_master%rowtype := private.kinojo_sm_selected_sanctuary_v456(p_sanctuary_code);
  v_actor jsonb := private.kinojo_sm_actor_v412(p_credential);
  v_actor_id bigint := nullif(v_actor->>'memberId', '')::bigint;
  v_base jsonb := public.kinojo_sanctuary_management_bootstrap_v446(p_credential);
  v_teams jsonb;
begin
  v_teams := private.kinojo_sm_selected_teams_v456(v_base->'teams', v_sanctuary.id);
  return (v_base - 'teams' - 'apiVersion' - 'schemaVersion' - 'databaseContract')
    || pg_catalog.jsonb_build_object(
      'apiVersion', 2.3,
      'schemaVersion', 456,
      'databaseContract', 456,
      'selectedSanctuaryId', v_sanctuary.id,
      'selectedSanctuaryCode', v_sanctuary.code,
      'revisionKey', private.kinojo_sm_revision_v456(v_sanctuary.id),
      'teams', private.kinojo_sm_enrich_teams_v454(v_teams, v_actor_id)
    );
end
$function$;

comment on function public.kinojo_sanctuary_management_public_bootstrap_v456(text) is
  'Public Stage 11 bootstrap: one selected sanctuary roster with shared sanctuary catalog.';
comment on function public.kinojo_sanctuary_management_bootstrap_v456(text, text) is
  'Authenticated Stage 11 bootstrap: one selected sanctuary roster after actor projection.';
comment on function public.kinojo_sanctuary_management_public_revision_v456(text) is
  'Lightweight Stage 11 selected-sanctuary change fingerprint for manual refresh notices.';

revoke all on function private.kinojo_sm_selected_sanctuary_v456(text) from public, anon, authenticated;
revoke all on function private.kinojo_sm_selected_teams_v456(jsonb, bigint) from public, anon, authenticated;
revoke all on function private.kinojo_sm_revision_v456(bigint) from public, anon, authenticated;
revoke all on function public.kinojo_sanctuary_management_public_revision_v456(text) from public, anon, authenticated;
revoke all on function public.kinojo_sanctuary_management_public_bootstrap_v456(text) from public, anon, authenticated;
revoke all on function public.kinojo_sanctuary_management_bootstrap_v456(text, text) from public, anon, authenticated;

grant execute on function public.kinojo_sanctuary_management_public_revision_v456(text) to service_role;
grant execute on function public.kinojo_sanctuary_management_public_bootstrap_v456(text) to service_role;
grant execute on function public.kinojo_sanctuary_management_bootstrap_v456(text, text) to service_role;
