-- Read-only batch registration lookup for Legion Tree character-search cards.
-- The Edge owns authorization; only service_role may call this indexed identity lookup.
create or replace function public.kinojo_legion_tree_candidate_registration_v458(
  p_candidates jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
set statement_timeout = '500ms'
set lock_timeout = '100ms'
as $function$
declare
  v_requested_count integer;
  v_registered_keys jsonb;
begin
  if p_candidates is null or jsonb_typeof(p_candidates) <> 'array' then
    return jsonb_build_object(
      'ok', false,
      'code', 'CANDIDATES_ARRAY_REQUIRED',
      'message', '캐릭터 후보 배열이 필요합니다.'
    );
  end if;

  v_requested_count := jsonb_array_length(p_candidates);
  if v_requested_count > 200 then
    return jsonb_build_object(
      'ok', false,
      'code', 'CANDIDATES_TOO_LARGE',
      'message', '캐릭터 후보 수가 허용 범위를 초과했습니다.'
    );
  end if;

  if exists (
    select 1
      from jsonb_array_elements(p_candidates) item
     where jsonb_typeof(item) <> 'object'
        or btrim(coalesce(item->>'candidateKey', '')) = ''
        or length(item->>'candidateKey') > 420
        or case
             when coalesce(item->>'serverId', '') ~ '^[1-9][0-9]{0,9}$'
               then (item->>'serverId')::bigint > 2147483647
             else true
           end
        or btrim(coalesce(item->>'characterName', '')) = ''
        or length(item->>'characterName') > 120
  ) then
    return jsonb_build_object(
      'ok', false,
      'code', 'CANDIDATE_INVALID',
      'message', '캐릭터 후보 신원을 확인하지 못했습니다.'
    );
  end if;

  with requested as (
    select distinct
      btrim(item->>'candidateKey') as candidate_key,
      (item->>'serverId')::integer as server_id,
      public.kinojo_character_identity_key_v298(item->>'characterName') as identity_key
    from jsonb_array_elements(p_candidates) item
  ), registered as (
    select requested.candidate_key
      from requested
      join public.character_master character
        on character.server_id = requested.server_id
       and public.kinojo_character_identity_key_v298(character.character_name) = requested.identity_key
  )
  select coalesce(jsonb_agg(candidate_key order by candidate_key), '[]'::jsonb)
    into v_registered_keys
    from registered;

  return jsonb_build_object(
    'ok', true,
    'contract', 'legion-tree-candidate-registration-v1',
    'identityBasis', 'character_master server_id+character_identity_key_v298',
    'requestedCount', v_requested_count,
    'registeredCount', jsonb_array_length(v_registered_keys),
    'registeredCandidateKeys', v_registered_keys
  );
end;
$function$;

comment on function public.kinojo_legion_tree_candidate_registration_v458(jsonb)
is 'Service-role-only readback marking official Legion Tree search candidates already present in character_master.';

revoke all on function public.kinojo_legion_tree_candidate_registration_v458(jsonb) from public, anon, authenticated;
grant execute on function public.kinojo_legion_tree_candidate_registration_v458(jsonb) to service_role;
