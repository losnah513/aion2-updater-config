-- KINOJO banner random-event target semantics v411.
-- UI scope removed per-character/date controls, and HOF simply ignores RIGHT at read time.

create or replace function public.kinojo_banner_auto_pool_save_v407(
  p_session_token text,
  p_pool_id bigint,
  p_payload jsonb
) returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private
as $function$
declare
  v_gate jsonb;
  v_member bigint;
  v_pool public.kinojo_banner_auto_pools_v407;
  v_name text;
  v_format text;
  v_pages text[];
  v_slots text[];
  v_tags text[];
  v_character_ids bigint[];
  v_asset_ids bigint[];
  v_asset_id bigint;
  v_index integer:=0;
  v_representative_only boolean;
  v_max_per_character integer:=99;
  v_show_name boolean;
  v_bg text;
  v_text text;
  v_opacity integer;
  v_height integer;
  v_slide integer;
  v_transition integer;
  v_effect text;
  v_direction text;
  v_priority integer;
  v_starts timestamptz:=null;
  v_ends timestamptz:=null;
begin
  v_gate:=private.kinojo_banner_require_master_v384(p_session_token);
  if coalesce((v_gate->>'ok')::boolean,false) is not true then return v_gate; end if;
  v_member:=(v_gate->>'memberId')::bigint;
  if p_payload is null or pg_catalog.jsonb_typeof(p_payload)<>'object' then
    return pg_catalog.jsonb_build_object('ok',false,'code','BANNER_AUTO_POOL_PAYLOAD_INVALID');
  end if;
  if p_pool_id is not null then
    select * into v_pool from public.kinojo_banner_auto_pools_v407 where pool_id=p_pool_id for update;
    if not found then return pg_catalog.jsonb_build_object('ok',false,'code','BANNER_AUTO_POOL_NOT_FOUND'); end if;
  end if;

  v_name:=pg_catalog.btrim(coalesce(p_payload->>'name',v_pool.pool_name,''));
  v_format:=pg_catalog.upper(pg_catalog.btrim(coalesce(p_payload->>'formatCode',v_pool.format_code,'')));
  begin
    v_pages:=private.kinojo_banner_text_array_v386(coalesce(p_payload->'targetPages',pg_catalog.to_jsonb(v_pool.target_pages)));
    v_slots:=private.kinojo_banner_text_array_v386(coalesce(p_payload->'slotCodes',pg_catalog.to_jsonb(v_pool.slot_codes)));
    v_tags:=private.kinojo_banner_tags_normalize_v391(coalesce(p_payload->'tags',pg_catalog.to_jsonb(v_pool.tags)));
    v_character_ids:=private.kinojo_banner_bigint_array_v407(coalesce(p_payload->'characterIds',pg_catalog.to_jsonb(v_pool.character_ids)),99);
    v_asset_ids:=private.kinojo_banner_bigint_array_v407(coalesce(p_payload->'assetIds',(
      select coalesce(pg_catalog.jsonb_agg(pa.asset_id order by pa.sort_order,pa.asset_id),'[]'::jsonb)
      from public.kinojo_banner_auto_pool_assets_v407 pa where pa.pool_id=p_pool_id
    )),99);
  exception when sqlstate 'P0001' then
    return pg_catalog.jsonb_build_object('ok',false,'code','BANNER_AUTO_POOL_ARRAY_INVALID');
  end;

  if char_length(v_name) not between 1 and 120 then return pg_catalog.jsonb_build_object('ok',false,'code','BANNER_AUTO_POOL_NAME_INVALID'); end if;
  if v_format not in ('MAIN_16_9','SIDE_300_715') then return pg_catalog.jsonb_build_object('ok',false,'code','BANNER_AUTO_POOL_FORMAT_INVALID'); end if;
  if cardinality(v_asset_ids)>99 then return pg_catalog.jsonb_build_object('ok',false,'code','BANNER_AUTO_POOL_ASSETS_MAX_99'); end if;
  if cardinality(v_pages)<1 or cardinality(v_slots)<1 then return pg_catalog.jsonb_build_object('ok',false,'code','BANNER_AUTO_POOL_TARGET_REQUIRED'); end if;
  if exists(select 1 from pg_catalog.unnest(v_pages) p(page_code) where p.page_code<>all(private.kinojo_banner_supported_page_codes_v404())) then
    return pg_catalog.jsonb_build_object('ok',false,'code','BANNER_AUTO_POOL_TARGET_INVALID');
  end if;
  if (v_format='MAIN_16_9' and (v_pages<>array['HOME']::text[] or v_slots<>array['MAIN']::text[]))
     or (v_format='SIDE_300_715' and exists(select 1 from pg_catalog.unnest(v_slots) s(slot_code) where s.slot_code not in ('LEFT','RIGHT'))) then
    return pg_catalog.jsonb_build_object('ok',false,'code','BANNER_AUTO_POOL_TARGET_FORMAT_MISMATCH');
  end if;
  if exists(
    select 1 from pg_catalog.unnest(v_asset_ids) x(asset_id)
    left join public.kinojo_banner_assets a on a.asset_id=x.asset_id
    where a.asset_id is null or a.status<>'READY' or a.delete_token is not null or a.format_code<>v_format
  ) then return pg_catalog.jsonb_build_object('ok',false,'code','BANNER_AUTO_POOL_ASSET_INVALID'); end if;
  if exists(
    select 1 from pg_catalog.unnest(v_character_ids) x(character_id)
    left join public.character_master c on c.id=x.character_id
    where c.id is null or not c.is_active or c.identity_status<>'CURRENT' or c.lookup_excluded
  ) then return pg_catalog.jsonb_build_object('ok',false,'code','BANNER_AUTO_POOL_CHARACTER_INVALID'); end if;

  begin
    v_representative_only:=coalesce((p_payload->>'representativeOnly')::boolean,v_pool.representative_only,false);
    v_show_name:=coalesce((p_payload->>'showCharacterName')::boolean,v_pool.show_character_name,false);
    v_bg:=pg_catalog.upper(coalesce(p_payload#>>'{strip,backgroundColor}',v_pool.strip_background_color,'#111827'));
    v_text:=pg_catalog.upper(coalesce(p_payload#>>'{strip,textColor}',v_pool.strip_text_color,'#FFFFFF'));
    v_opacity:=coalesce(nullif(p_payload#>>'{strip,opacity}','')::integer,v_pool.strip_opacity,78);
    v_height:=coalesce(nullif(p_payload#>>'{strip,heightPercent}','')::integer,v_pool.strip_height_percent,14);
    v_slide:=coalesce(nullif(p_payload->>'slideIntervalMs','')::integer,v_pool.slide_interval_ms,8000);
    v_transition:=coalesce(nullif(p_payload->>'transitionDurationMs','')::integer,v_pool.transition_duration_ms,600);
    v_effect:=pg_catalog.upper(coalesce(p_payload->>'transitionEffect',v_pool.transition_effect,'CROSSFADE'));
    v_direction:=pg_catalog.upper(coalesce(p_payload->>'transitionDirection',v_pool.transition_direction,'NONE'));
    v_priority:=coalesce(nullif(p_payload->>'priority','')::integer,v_pool.priority,100);
  exception when others then
    return pg_catalog.jsonb_build_object('ok',false,'code','BANNER_AUTO_POOL_SETTING_INVALID');
  end;
  if v_opacity not between 0 and 100 or v_height not between 6 and 30
     or v_slide not between 3000 and 60000 or v_transition not between 0 and 5000 or v_priority not between 0 and 10000
     or v_bg !~ '^#[0-9A-F]{6}$' or v_text !~ '^#[0-9A-F]{6}$'
     or v_effect not in ('NONE','CROSSFADE','SLIDE','SLIDE_FADE','ZOOM')
     or v_direction not in ('NONE','LEFT_TO_RIGHT','RIGHT_TO_LEFT','TOP_TO_BOTTOM','BOTTOM_TO_TOP')
     or (v_effect in ('SLIDE','SLIDE_FADE') and v_direction='NONE')
     or (v_effect in ('NONE','CROSSFADE','ZOOM') and v_direction<>'NONE') then
    return pg_catalog.jsonb_build_object('ok',false,'code','BANNER_AUTO_POOL_SETTING_INVALID');
  end if;

  if p_pool_id is null then
    insert into public.kinojo_banner_auto_pools_v407(
      pool_name,format_code,target_pages,slot_codes,tags,character_ids,representative_only,max_per_character,
      show_character_name,strip_background_color,strip_text_color,strip_opacity,strip_height_percent,
      slide_interval_ms,transition_duration_ms,transition_effect,transition_direction,priority,starts_at,ends_at,
      is_enabled,created_by_member_id,updated_by_member_id
    ) values(
      v_name,v_format,v_pages,v_slots,v_tags,v_character_ids,v_representative_only,v_max_per_character,
      v_show_name,v_bg,v_text,v_opacity,v_height,v_slide,v_transition,v_effect,v_direction,v_priority,v_starts,v_ends,
      false,v_member,v_member
    ) returning * into v_pool;
  else
    update public.kinojo_banner_auto_pools_v407 set
      pool_name=v_name,format_code=v_format,target_pages=v_pages,slot_codes=v_slots,tags=v_tags,
      character_ids=v_character_ids,representative_only=v_representative_only,max_per_character=v_max_per_character,
      show_character_name=v_show_name,strip_background_color=v_bg,strip_text_color=v_text,
      strip_opacity=v_opacity,strip_height_percent=v_height,slide_interval_ms=v_slide,
      transition_duration_ms=v_transition,transition_effect=v_effect,transition_direction=v_direction,
      priority=v_priority,starts_at=v_starts,ends_at=v_ends,is_enabled=false,
      updated_by_member_id=v_member,updated_at=clock_timestamp()
    where pool_id=p_pool_id returning * into v_pool;
  end if;

  delete from public.kinojo_banner_auto_pool_assets_v407 where pool_id=v_pool.pool_id;
  foreach v_asset_id in array v_asset_ids loop
    insert into public.kinojo_banner_auto_pool_assets_v407(pool_id,asset_id,sort_order)
    values(v_pool.pool_id,v_asset_id,v_index);
    v_index:=v_index+1;
  end loop;
  delete from public.kinojo_banner_auto_pool_composites_v407 pc
  where pc.pool_id=v_pool.pool_id
    and pc.source_hash is distinct from private.kinojo_banner_auto_pool_source_hash_v407(pc.pool_id,pc.asset_id);
  return pg_catalog.jsonb_build_object(
    'ok',true,'apiVersion','411','contract','banner-random-event-save-v411',
    'pool',private.kinojo_banner_auto_pool_json_v407(v_pool.pool_id),
    'activation','SAVED_DISABLED','requiresExplicitEnable',true
  );
exception
  when unique_violation then return pg_catalog.jsonb_build_object('ok',false,'code','BANNER_AUTO_POOL_NAME_DUPLICATE');
  when check_violation then return pg_catalog.jsonb_build_object('ok',false,'code','BANNER_AUTO_POOL_VALIDATION_FAILED');
end
$function$;

revoke all on function public.kinojo_banner_auto_pool_save_v407(text,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.kinojo_banner_auto_pool_save_v407(text,bigint,jsonb) to service_role;
