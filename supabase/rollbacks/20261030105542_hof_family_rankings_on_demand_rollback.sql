begin;
CREATE OR REPLACE FUNCTION public.kinojo_web_get_my_hof_ranking_v329(p_credential text, p_include_subs boolean DEFAULT false, p_include_all_legions boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
 SET statement_timeout TO '1s'
 SET lock_timeout TO '250ms'
AS $function$
declare
  v_member public.member_codes%rowtype;
  v_include_subs boolean := coalesce(p_include_subs, false);
  v_include_all_legions boolean := coalesce(p_include_all_legions, false);
  v_snapshot_id bigint;
  v_generated_at timestamptz;
  v_scope private.kinojo_ranking_snapshot_scopes_v390%rowtype;
  v_owner_name_key text;
  v_metric text;
  v_row private.kinojo_ranking_snapshot_owner_metrics_v390%rowtype;
  v_result jsonb;
begin
  select * into v_member
  from public.kinojo_member_from_web_credential_v326(p_credential)
  limit 1;

  select p.snapshot_id, p.published_at
    into v_snapshot_id, v_generated_at
  from private.kinojo_ranking_snapshot_pointer_v390 p
  join private.kinojo_ranking_snapshots_v390 s
    on s.snapshot_id = p.snapshot_id
   and s.status = 'PUBLISHED'
  where p.singleton is true;

  v_result := jsonb_build_object(
    'ok', true,
    'authenticated', v_member.id is not null,
    'contractVersion', 319,
    'databaseContract', '398',
    'profileImageContract', '342',
    'hofProfileIntegrationContract', '343',
    'snapshotContractVersion', 398,
    'snapshotId', v_snapshot_id,
    'generatedAt', v_generated_at,
    'mainCharacterName', case when v_member.id is null then '' else v_member.main_character_name end
  );

  if v_member.id is null then
    return v_result;
  end if;

  if v_snapshot_id is null then
    return v_result || jsonb_build_object(
      'ok', false,
      'code', 'RANKING_SNAPSHOT_WARMING',
      'message', '내 랭킹 스냅샷을 준비하고 있습니다.'
    );
  end if;

  select sc.* into v_scope
  from private.kinojo_ranking_snapshot_scopes_v390 sc
  where sc.snapshot_id = v_snapshot_id
    and sc.include_subs = v_include_subs
    and sc.include_all_legions = v_include_all_legions;

  if not found then
    return v_result || jsonb_build_object(
      'ok', false,
      'code', 'RANKING_SNAPSHOT_SCOPE_WARMING',
      'message', '요청한 내 랭킹 범위를 준비하고 있습니다.'
    );
  end if;

  v_result := v_result || jsonb_build_object(
    'source', 'server_398_hof_owner_snapshot',
    'includeSubs', v_include_subs,
    'includeAllLegions', v_include_all_legions,
    'scopeLabel',
      (case when v_include_all_legions then '전체 레기온' else '기본 레기온' end)
      || ' · '
      || (case when v_include_subs then '부캐 포함' else '본캐만' end),
    'rankingPeriod', coalesce(v_scope.hof_payload -> 'rankingPeriod', '{}'::jsonb)
  );

  v_owner_name_key := public.kinojo_normalize_character_name(v_member.main_character_name);

  foreach v_metric in array array['enhance','pve','pvp','like','dislike','growth'] loop
    select om.* into v_row
    from private.kinojo_ranking_snapshot_owner_metrics_v390 om
    where om.snapshot_id = v_snapshot_id
      and om.include_subs = v_include_subs
      and om.include_all_legions = v_include_all_legions
      and om.owner_name_key = v_owner_name_key
      and om.metric = v_metric;

    if found then
      v_result := jsonb_set(
        v_result,
        array[v_metric],
        v_row.row_data || jsonb_build_object(
          'rank', v_row.rank_no,
          'rank_no', v_row.rank_no,
          'score', v_row.score::text,
          'item', public.kinojo_hof_display_item_v343(v_row.row_data)
        ),
        true
      );
    else
      v_result := jsonb_set(v_result, array[v_metric], '{}'::jsonb, true);
    end if;
  end loop;

  return v_result;
end;
$function$;

drop function public.kinojo_web_get_hof_family_rankings_v541(text,integer,boolean);
drop function private.kinojo_hof_family_rows_v541(boolean);
commit;

