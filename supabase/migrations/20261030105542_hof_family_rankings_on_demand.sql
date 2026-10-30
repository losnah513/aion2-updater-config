-- SQL541: on-demand, bounded family ranking reads; no retained results or jobs.
begin;
set local lock_timeout='2s';
CREATE OR REPLACE FUNCTION private.kinojo_hof_family_rows_v541(p_all boolean)
RETURNS TABLE(character_id bigint,character_name text,server_id bigint,family_power bigint,alt_count integer,family_count integer,known_power_count integer,power_rank bigint,alt_rank bigint)
LANGUAGE sql STABLE SET search_path='' AS $fn$
with scope as materialized(select * from public.v_kinojo_ranking_character_scope_v296), totals as (
 select root.character_id::bigint,root.character_name::text,root.server_id::bigint,
 sum(case when member.latest_pve_combat_power>0 then member.latest_pve_combat_power::bigint else 0 end)::bigint family_power,
 count(*) filter(where member.character_id<>root.character_id)::integer alt_count,
 count(*)::integer family_count,count(*) filter(where member.latest_pve_combat_power>0)::integer known_power_count
 from scope root join scope member on member.ranking_owner_character_id=root.character_id
 where root.is_main is true and(coalesce(p_all,false) or root.is_default_ranking_legion is true)
 group by root.character_id,root.character_name,root.server_id
), ranked as (
 select *,row_number() over(order by (known_power_count>0) desc,family_power desc,character_name,server_id,character_id) pr,
 row_number() over(order by alt_count desc,character_name,server_id,character_id) ar from totals
)
select character_id,character_name,server_id,family_power,alt_count,family_count,known_power_count,case when known_power_count>0 then pr end,ar from ranked;
$fn$;
REVOKE ALL ON FUNCTION private.kinojo_hof_family_rows_v541(boolean) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.kinojo_web_get_hof_family_rankings_v541(p_metric text DEFAULT 'power',p_page integer DEFAULT 1,p_include_all_legions boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' SET statement_timeout='2s' SET lock_timeout='250ms' AS $fn$
declare v_result jsonb;
begin
 if p_metric is null or p_metric not in ('power','alts') or p_page is null or p_page<1 or p_page>10000 then
  return jsonb_build_object('ok',false,'code','INVALID_RANKING_REQUEST');
 end if;
 with ranked as materialized(
  select f.*,case when p_metric='power' then power_rank else alt_rank end rank_no
  from private.kinojo_hof_family_rows_v541(p_include_all_legions) f
  where p_metric='alts' or known_power_count>0
 ), page_rows as (
  select * from ranked order by rank_no limit 20 offset ((p_page-1)*20)
 ), items as (
  select r.rank_no,public.kinojo_hof_display_item_v343(to_jsonb(s))||jsonb_build_object(
   'rank',r.rank_no,'familyPower',r.family_power,'altCount',r.alt_count,
   'familyCharacterCount',r.family_count,'knownPowerCount',r.known_power_count) item
  from page_rows r join public.v_kinojo_ranking_character_scope_v296 s on s.character_id=r.character_id
 )
 select jsonb_build_object('ok',true,'metric',p_metric,'page',p_page,'pageSize',20,
 'total',(select count(*) from ranked),'generatedAt',statement_timestamp(),
 'includeAllLegions',coalesce(p_include_all_legions,false),
 'items',coalesce((select jsonb_agg(item order by rank_no) from items),'[]'::jsonb)) into v_result;
 return v_result;
end;$fn$;
REVOKE ALL ON FUNCTION public.kinojo_web_get_hof_family_rankings_v541(text,integer,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kinojo_web_get_hof_family_rankings_v541(text,integer,boolean) TO anon,authenticated,service_role;

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
  v_family jsonb;
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

  -- Credentials and owner identity remain server-resolved. No client-supplied owner.
  select jsonb_build_object('rank',f.power_rank,'score',f.family_power::text,
    'familyPower',f.family_power,'altCount',f.alt_count,'familyCharacterCount',f.family_count,
    'knownPowerCount',f.known_power_count,'generatedAt',statement_timestamp()) into v_family
  from private.kinojo_hof_family_rows_v541(v_include_all_legions) f
  where public.kinojo_normalize_character_name(f.character_name)=v_owner_name_key
    and (select count(*) from public.v_kinojo_ranking_character_scope_v296 identity_root
      where identity_root.is_main is true
        and public.kinojo_normalize_character_name(identity_root.character_name)=v_owner_name_key)=1
  order by f.power_rank nulls last,f.server_id,f.character_id limit 1;
  return v_result || jsonb_build_object('familyPve',coalesce(v_family,'{}'::jsonb));
end;
$function$;

commit;

