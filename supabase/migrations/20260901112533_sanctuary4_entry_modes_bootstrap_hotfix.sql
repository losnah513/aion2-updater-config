-- Selected-sanctuary bootstrap v456 was introduced after v452 but was based on
-- the older v448 payload. Preserve the selected-team optimization while
-- restoring the authoritative entryModes/defaultDifficulty enrichment.

create or replace function public.kinojo_sanctuary_management_public_bootstrap_v456(
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
  v_base jsonb := public.kinojo_sanctuary_management_public_bootstrap_v448();
  v_teams jsonb;
begin
  v_teams := private.kinojo_sm_selected_teams_v456(v_base->'teams', v_sanctuary.id);
  return (v_base - 'teams' - 'sanctuaries' - 'apiVersion' - 'schemaVersion' - 'databaseContract')
    || pg_catalog.jsonb_build_object(
      'apiVersion', 2.3,
      'schemaVersion', 456,
      'databaseContract', 456,
      'selectedSanctuaryId', v_sanctuary.id,
      'selectedSanctuaryCode', v_sanctuary.code,
      'revisionKey', private.kinojo_sm_revision_v456(v_sanctuary.id),
      'teams', private.kinojo_sm_enrich_teams_v454(v_teams, null),
      'sanctuaries', private.kinojo_sm_sanctuaries_v452(v_base->'sanctuaries')
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
  return (v_base - 'teams' - 'sanctuaries' - 'apiVersion' - 'schemaVersion' - 'databaseContract')
    || pg_catalog.jsonb_build_object(
      'apiVersion', 2.3,
      'schemaVersion', 456,
      'databaseContract', 456,
      'selectedSanctuaryId', v_sanctuary.id,
      'selectedSanctuaryCode', v_sanctuary.code,
      'revisionKey', private.kinojo_sm_revision_v456(v_sanctuary.id),
      'teams', private.kinojo_sm_enrich_teams_v454(v_teams, v_actor_id),
      'sanctuaries', private.kinojo_sm_sanctuaries_v452(v_base->'sanctuaries')
    );
end
$function$;

comment on function public.kinojo_sanctuary_management_public_bootstrap_v456(text) is
  'Selected public Sanctuary bootstrap with v452 entry-mode enrichment restored.';
comment on function public.kinojo_sanctuary_management_bootstrap_v456(text, text) is
  'Selected authenticated Sanctuary bootstrap with v452 entry-mode enrichment restored.';
