-- DB480 follow-up: selected Sanctuary bootstrap must enrich the actor's own
-- character list as well as placed characters. Missing metrics are not zero.
create or replace function public.kinojo_sanctuary_management_bootstrap_v456(
  p_credential text,p_sanctuary_code text default null
) returns jsonb language plpgsql stable security definer set search_path=''
as $function$
declare
  v_sanctuary public.sanctuary_master%rowtype := private.kinojo_sm_selected_sanctuary_v456(p_sanctuary_code);
  v_actor jsonb := private.kinojo_sm_actor_v412(p_credential);
  v_actor_id bigint := nullif(v_actor->>'memberId','')::bigint;
  v_base jsonb := public.kinojo_sanctuary_management_bootstrap_v446(p_credential);
  v_teams jsonb;
begin
  v_teams := private.kinojo_sm_selected_teams_v456(v_base->'teams',v_sanctuary.id);
  return (v_base-'teams'-'sanctuaries'-'composerCharacters'-'apiVersion'-'schemaVersion'-'databaseContract')
    || jsonb_build_object(
      'apiVersion',2.3,'schemaVersion',456,'databaseContract',456,
      'selectedSanctuaryId',v_sanctuary.id,'selectedSanctuaryCode',v_sanctuary.code,
      'revisionKey',private.kinojo_sm_revision_v456(v_sanctuary.id),
      'teams',private.kinojo_sm_enrich_teams_v454(v_teams,v_actor_id),
      'sanctuaries',private.kinojo_sm_sanctuaries_v452(v_base->'sanctuaries'),
      'composerCharacters',private.kinojo_sm_enrich_composer_v452(v_base->'composerCharacters')
    );
end
$function$;
revoke all on function public.kinojo_sanctuary_management_bootstrap_v456(text,text) from public,anon,authenticated;
grant execute on function public.kinojo_sanctuary_management_bootstrap_v456(text,text) to service_role;
notify pgrst,'reload schema';
