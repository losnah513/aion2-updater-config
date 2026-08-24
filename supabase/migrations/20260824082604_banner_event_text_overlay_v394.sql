-- Banner redesign stage 1: event API, flexible source images, and text overlays.
-- Existing legacy campaigns remain detached from event groups and keep their
-- published state. New event actions use the v394 contract only.

create or replace function private.kinojo_banner_text_overlay_normalize_v394(
  p_value jsonb
) returns jsonb
language plpgsql
immutable
set search_path = pg_catalog, private
as $function$
declare
  v_value jsonb := case
    when p_value is null or p_value = 'null'::jsonb then '{}'::jsonb
    else p_value
  end;
  v_enabled boolean := false;
  v_text text := '';
  v_position text := 'BOTTOM';
  v_font text := 'SYSTEM_SANS';
  v_font_size integer := 18;
  v_text_color text := '#FFFFFF';
  v_background_color text := '#000000';
  v_background_opacity integer := 65;
  v_height_percent integer := 18;
  v_width_mode text := 'FULL';
begin
  if jsonb_typeof(v_value) <> 'object' then
    raise exception using errcode='P0001', message='BANNER_TEXT_OVERLAY_INVALID';
  end if;

  if exists (
    select 1
    from jsonb_object_keys(v_value) as key_name
    where key_name not in (
      'enabled','text','verticalPosition','fontFamily','fontSizePx',
      'textColor','backgroundColor','backgroundOpacity',
      'heightPercent','widthMode'
    )
  ) then
    raise exception using errcode='P0001', message='BANNER_TEXT_OVERLAY_FIELD_INVALID';
  end if;

  if v_value ? 'enabled' then
    if jsonb_typeof(v_value->'enabled') <> 'boolean' then
      raise exception using errcode='P0001', message='BANNER_TEXT_OVERLAY_ENABLED_INVALID';
    end if;
    v_enabled := (v_value->>'enabled')::boolean;
  end if;

  v_text := replace(replace(coalesce(v_value->>'text',''), E'\r\n', E'\n'), E'\r', E'\n');
  if char_length(v_text) > 300 or (v_enabled and char_length(btrim(v_text)) < 1) then
    raise exception using errcode='P0001', message='BANNER_TEXT_OVERLAY_TEXT_INVALID';
  end if;

  v_position := upper(btrim(coalesce(nullif(v_value->>'verticalPosition',''),'BOTTOM')));
  if v_position not in ('TOP','MIDDLE','BOTTOM') then
    raise exception using errcode='P0001', message='BANNER_TEXT_OVERLAY_POSITION_INVALID';
  end if;

  v_font := upper(btrim(coalesce(nullif(v_value->>'fontFamily',''),'SYSTEM_SANS')));
  if v_font not in ('SYSTEM_SANS','SYSTEM_SERIF','SYSTEM_ROUNDED') then
    raise exception using errcode='P0001', message='BANNER_TEXT_OVERLAY_FONT_INVALID';
  end if;

  if v_value ? 'fontSizePx' and jsonb_typeof(v_value->'fontSizePx') <> 'number' then
    raise exception using errcode='P0001', message='BANNER_TEXT_OVERLAY_FONT_SIZE_INVALID';
  end if;
  begin
    v_font_size := coalesce((v_value->>'fontSizePx')::integer,18);
  exception when others then
    raise exception using errcode='P0001', message='BANNER_TEXT_OVERLAY_FONT_SIZE_INVALID';
  end;
  if v_font_size not between 10 and 96 then
    raise exception using errcode='P0001', message='BANNER_TEXT_OVERLAY_FONT_SIZE_INVALID';
  end if;

  v_text_color := upper(btrim(coalesce(nullif(v_value->>'textColor',''),'#FFFFFF')));
  if v_text_color !~ '^#[0-9A-F]{6}$' then
    raise exception using errcode='P0001', message='BANNER_TEXT_OVERLAY_TEXT_COLOR_INVALID';
  end if;
  v_background_color := upper(btrim(coalesce(nullif(v_value->>'backgroundColor',''),'#000000')));
  if v_background_color !~ '^#[0-9A-F]{6}$' then
    raise exception using errcode='P0001', message='BANNER_TEXT_OVERLAY_BACKGROUND_COLOR_INVALID';
  end if;

  if v_value ? 'backgroundOpacity' and jsonb_typeof(v_value->'backgroundOpacity') <> 'number' then
    raise exception using errcode='P0001', message='BANNER_TEXT_OVERLAY_BACKGROUND_OPACITY_INVALID';
  end if;
  begin
    v_background_opacity := coalesce((v_value->>'backgroundOpacity')::integer,65);
  exception when others then
    raise exception using errcode='P0001', message='BANNER_TEXT_OVERLAY_BACKGROUND_OPACITY_INVALID';
  end;
  if v_background_opacity not between 0 and 100 then
    raise exception using errcode='P0001', message='BANNER_TEXT_OVERLAY_BACKGROUND_OPACITY_INVALID';
  end if;

  if v_value ? 'heightPercent' and jsonb_typeof(v_value->'heightPercent') <> 'number' then
    raise exception using errcode='P0001', message='BANNER_TEXT_OVERLAY_HEIGHT_INVALID';
  end if;
  begin
    v_height_percent := coalesce((v_value->>'heightPercent')::integer,18);
  exception when others then
    raise exception using errcode='P0001', message='BANNER_TEXT_OVERLAY_HEIGHT_INVALID';
  end;
  if v_height_percent not between 6 and 60 then
    raise exception using errcode='P0001', message='BANNER_TEXT_OVERLAY_HEIGHT_INVALID';
  end if;

  v_width_mode := upper(btrim(coalesce(nullif(v_value->>'widthMode',''),'FULL')));
  if v_width_mode <> 'FULL' then
    raise exception using errcode='P0001', message='BANNER_TEXT_OVERLAY_WIDTH_FIXED';
  end if;

  return jsonb_build_object(
    'enabled',v_enabled,
    'text',v_text,
    'verticalPosition',v_position,
    'fontFamily',v_font,
    'fontSizePx',v_font_size,
    'textColor',v_text_color,
    'backgroundColor',v_background_color,
    'backgroundOpacity',v_background_opacity,
    'heightPercent',v_height_percent,
    'widthMode','FULL'
  );
end;
$function$;

create or replace function private.kinojo_banner_text_overlay_valid_v394(
  p_value jsonb
) returns boolean
language plpgsql
immutable
set search_path = pg_catalog, private
as $function$
begin
  perform private.kinojo_banner_text_overlay_normalize_v394(p_value);
  return true;
exception when others then
  return false;
end;
$function$;

revoke all on function private.kinojo_banner_text_overlay_normalize_v394(jsonb) from public, anon, authenticated, service_role;
revoke all on function private.kinojo_banner_text_overlay_valid_v394(jsonb) from public, anon, authenticated, service_role;

alter table public.kinojo_banner_campaign_items
  add column if not exists text_overlay jsonb not null default
  '{"enabled":false,"text":"","verticalPosition":"BOTTOM","fontFamily":"SYSTEM_SANS","fontSizePx":18,"textColor":"#FFFFFF","backgroundColor":"#000000","backgroundOpacity":65,"heightPercent":18,"widthMode":"FULL"}'::jsonb;

alter table public.kinojo_banner_campaign_items
  drop constraint if exists kinojo_banner_item_text_overlay_v394_chk;
alter table public.kinojo_banner_campaign_items
  add constraint kinojo_banner_item_text_overlay_v394_chk
  check (private.kinojo_banner_text_overlay_valid_v394(text_overlay));

-- Source images may now have any positive dimensions. The assigned format is
-- still the target canvas, and the renderer uses COVER when ratios differ.
alter table public.kinojo_banner_assets
  drop constraint if exists kinojo_banner_assets_ratio_v384_chk;

create or replace function public.kinojo_banner_asset_register_storage_v394(
  p_session_token text,
  p_object_path text,
  p_mime_type text,
  p_size_bytes bigint,
  p_width integer,
  p_height integer,
  p_format_code text,
  p_display_name text,
  p_original_file_name text default null,
  p_default_alt text default ''
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, storage
as $function$
declare
  v_gate jsonb;
  v_member bigint;
  v_asset public.kinojo_banner_assets;
  v_aspect_matches boolean;
begin
  v_gate := private.kinojo_banner_require_master_v384(p_session_token);
  if coalesce((v_gate->>'ok')::boolean,false) is not true then
    return v_gate;
  end if;
  v_member := (v_gate->>'memberId')::bigint;
  if not private.kinojo_banner_storage_path_valid_v382(p_object_path,p_mime_type) then
    return jsonb_build_object('ok',false,'code','BANNER_OBJECT_PATH_INVALID');
  end if;
  if p_size_bytes is null or p_size_bytes < 1 or p_size_bytes > 5242880 then
    return jsonb_build_object('ok',false,'code','BANNER_IMAGE_SIZE_INVALID');
  end if;
  if p_mime_type not in ('image/jpeg','image/png','image/webp') then
    return jsonb_build_object('ok',false,'code','BANNER_IMAGE_MIME_INVALID');
  end if;
  if p_format_code not in ('MAIN_16_9','SIDE_300_715')
     or p_width is null or p_height is null or p_width <= 0 or p_height <= 0 then
    return jsonb_build_object('ok',false,'code','BANNER_IMAGE_DIMENSION_INVALID');
  end if;
  if not exists (
    select 1 from storage.objects o
    where o.bucket_id='kinojo-site-banners' and o.name=p_object_path
  ) then
    return jsonb_build_object('ok',false,'code','BANNER_UPLOAD_OBJECT_NOT_FOUND');
  end if;

  v_aspect_matches := (
    (p_format_code='MAIN_16_9' and p_width::bigint*9=p_height::bigint*16)
    or (p_format_code='SIDE_300_715' and p_width::bigint*715=p_height::bigint*300)
  );

  begin
    insert into public.kinojo_banner_assets(
      format_code,source_type,display_name,original_file_name,object_path,
      mime_type,size_bytes,width,height,default_alt,status,
      created_by_member_id,updated_by_member_id
    ) values (
      p_format_code,'STORAGE',btrim(p_display_name),nullif(p_original_file_name,''),
      p_object_path,p_mime_type,p_size_bytes,p_width,p_height,
      coalesce(p_default_alt,''),'READY',v_member,v_member
    ) returning * into v_asset;
  exception
    when unique_violation then
      return jsonb_build_object('ok',false,'code','BANNER_ASSET_OBJECT_PATH_CONFLICT');
    when check_violation then
      return jsonb_build_object('ok',false,'code','BANNER_ASSET_VALIDATION_FAILED');
  end;

  return jsonb_build_object(
    'ok',true,
    'apiVersion','394',
    'contract','banner-asset-register-storage-v394',
    'asset',private.kinojo_banner_asset_json_v384(v_asset)
      || jsonb_build_object(
        'aspectMatchesTarget',v_aspect_matches,
        'fitMode','COVER',
        'cropWarning',not v_aspect_matches
      )
  );
end;
$function$;

revoke all on function public.kinojo_banner_asset_register_storage_v394(text,text,text,bigint,integer,integer,text,text,text,text) from public, anon, authenticated;
grant execute on function public.kinojo_banner_asset_register_storage_v394(text,text,text,bigint,integer,integer,text,text,text,text) to service_role;

create or replace function private.kinojo_banner_campaign_json_v394(
  p_campaign public.kinojo_banner_campaigns
) returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_items jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
      'itemId',i.item_id,
      'assetId',i.asset_id,
      'weight',i.weight,
      'enabled',i.is_enabled,
      'alt',i.alt_text,
      'clickUrl',nullif(i.click_url,''),
      'sortOrder',i.sort_order,
      'scheduleMode',i.schedule_mode,
      'startsAtKst',case when i.starts_at is null then null else to_char(i.starts_at at time zone 'Asia/Seoul','YYYY-MM-DD"T"HH24:MI:SS') end,
      'endsAtKst',case when i.ends_at is null then null else to_char(i.ends_at at time zone 'Asia/Seoul','YYYY-MM-DD"T"HH24:MI:SS') end,
      'weekdays',to_jsonb(i.weekdays),
      'specificDates',to_jsonb(i.specific_dates),
      'textOverlay',private.kinojo_banner_text_overlay_normalize_v394(i.text_overlay)
    ) order by i.sort_order,i.item_id),'[]'::jsonb)
    into v_items
  from public.kinojo_banner_campaign_items i
  where i.campaign_id=p_campaign.campaign_id;

  return private.kinojo_banner_campaign_json_v391(p_campaign)
    || jsonb_build_object('items',v_items);
end;
$function$;

create or replace function private.kinojo_banner_event_json_v394(
  p_event_group_id uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_base jsonb;
  v_campaigns jsonb;
begin
  v_base := private.kinojo_banner_event_json_v391(p_event_group_id);
  if v_base is null then
    return null;
  end if;
  select coalesce(
    jsonb_agg(private.kinojo_banner_campaign_json_v394(c)
      order by c.page_code,c.event_role,c.campaign_id),
    '[]'::jsonb
  ) into v_campaigns
  from public.kinojo_banner_campaigns c
  where c.event_group_id=p_event_group_id;
  return v_base || jsonb_build_object('campaigns',v_campaigns);
end;
$function$;

revoke all on function private.kinojo_banner_campaign_json_v394(public.kinojo_banner_campaigns) from public, anon, authenticated, service_role;
revoke all on function private.kinojo_banner_event_json_v394(uuid) from public, anon, authenticated, service_role;

create or replace function public.kinojo_banner_event_list_v394(
  p_session_token text,
  p_include_archived boolean default true
) returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_gate jsonb;
  v_events jsonb;
  v_legacy jsonb;
begin
  v_gate := private.kinojo_banner_require_master_v384(p_session_token);
  if coalesce((v_gate->>'ok')::boolean,false) is not true then
    return v_gate;
  end if;

  select coalesce(
    jsonb_agg(private.kinojo_banner_event_json_v394(g.event_group_id)
      order by g.updated_at desc,g.event_group_id),
    '[]'::jsonb
  ) into v_events
  from private.kinojo_banner_event_groups_v391 g
  where coalesce(p_include_archived,true)
     or exists (
       select 1 from public.kinojo_banner_campaigns c
       where c.event_group_id=g.event_group_id and c.status<>'ARCHIVED'
     );

  select coalesce(
    jsonb_agg(private.kinojo_banner_campaign_json_v394(c)
      order by c.updated_at desc,c.campaign_id desc),
    '[]'::jsonb
  ) into v_legacy
  from public.kinojo_banner_campaigns c
  where c.event_group_id is null
    and (coalesce(p_include_archived,true) or c.status<>'ARCHIVED');

  return jsonb_build_object(
    'ok',true,
    'apiVersion','394',
    'contract','banner-event-list-v394',
    'events',v_events,
    'legacyCampaigns',v_legacy
  );
end;
$function$;

create or replace function public.kinojo_banner_event_save_v394(
  p_session_token text,
  p_event_group_id uuid,
  p_payload jsonb
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_gate jsonb;
  v_result jsonb;
  v_group_id uuid;
  v_variants jsonb;
  v_variant jsonb;
  v_items jsonb;
  v_item jsonb;
  v_page text;
  v_role text;
  v_campaign_id bigint;
  v_asset_id bigint;
  v_overlay_key text;
  v_overlay jsonb;
  v_previous_overlays jsonb := '{}'::jsonb;
begin
  v_gate := private.kinojo_banner_require_master_v384(p_session_token);
  if coalesce((v_gate->>'ok')::boolean,false) is not true then
    return v_gate;
  end if;

  v_variants := p_payload->'variants';
  if p_event_group_id is not null then
    select coalesce(jsonb_object_agg(
      c.page_code||':'||c.event_role||':'||i.asset_id::text,
      i.text_overlay
    ),'{}'::jsonb) into v_previous_overlays
    from public.kinojo_banner_campaigns c
    join public.kinojo_banner_campaign_items i on i.campaign_id=c.campaign_id
    where c.event_group_id=p_event_group_id;
  end if;

  if jsonb_typeof(v_variants)='array' then
    for v_variant in select value from jsonb_array_elements(v_variants)
    loop
      v_items := v_variant->'items';
      if jsonb_typeof(v_variant)='object' and jsonb_typeof(v_items)='array' then
        for v_item in select value from jsonb_array_elements(v_items)
        loop
          if jsonb_typeof(v_item)='object' and v_item ? 'textOverlay' then
            perform private.kinojo_banner_text_overlay_normalize_v394(v_item->'textOverlay');
          end if;
        end loop;
      end if;
    end loop;
  end if;

  v_result := public.kinojo_banner_event_save_v391(
    p_session_token,p_event_group_id,p_payload
  );
  if coalesce((v_result->>'ok')::boolean,false) is not true then
    return v_result;
  end if;
  v_group_id := (v_result->>'eventGroupId')::uuid;

  if jsonb_typeof(v_variants)='array' then
    for v_variant in select value from jsonb_array_elements(v_variants)
    loop
      if jsonb_typeof(v_variant)='object' then
        v_page := upper(btrim(coalesce(v_variant->>'pageCode','')));
        v_role := upper(btrim(coalesce(v_variant->>'eventRole','')));
        select c.campaign_id into v_campaign_id
        from public.kinojo_banner_campaigns c
        where c.event_group_id=v_group_id
          and c.page_code=v_page
          and c.event_role=v_role;
        if not found then
          raise exception using errcode='P0001', message='BANNER_EVENT_CAMPAIGN_NOT_FOUND';
        end if;

        v_items := v_variant->'items';
        if jsonb_typeof(v_items)='array' then
          for v_item in select value from jsonb_array_elements(v_items)
          loop
            begin
              v_asset_id := (v_item->>'assetId')::bigint;
            exception when others then
              raise exception using errcode='P0001', message='BANNER_CAMPAIGN_ASSET_ID_INVALID';
            end;
            v_overlay_key := v_page||':'||v_role||':'||v_asset_id::text;
            v_overlay := case
              when v_item ? 'textOverlay' then
                private.kinojo_banner_text_overlay_normalize_v394(v_item->'textOverlay')
              when v_previous_overlays ? v_overlay_key then
                private.kinojo_banner_text_overlay_normalize_v394(v_previous_overlays->v_overlay_key)
              else private.kinojo_banner_text_overlay_normalize_v394(null)
            end;
            update public.kinojo_banner_campaign_items
               set text_overlay=v_overlay,
                   updated_at=clock_timestamp()
             where campaign_id=v_campaign_id and asset_id=v_asset_id;
            if not found then
              raise exception using errcode='P0001', message='BANNER_EVENT_ITEM_NOT_FOUND';
            end if;
          end loop;
        end if;
      end if;
    end loop;
  end if;

  update private.kinojo_banner_event_groups_v391
     set updated_by_member_id=(v_gate->>'memberId')::bigint,
         updated_at=clock_timestamp()
   where event_group_id=v_group_id;

  return jsonb_build_object(
    'ok',true,
    'apiVersion','394',
    'contract','banner-event-save-v394',
    'eventGroupId',v_group_id,
    'savedCampaignIds',coalesce(v_result->'savedCampaignIds','[]'::jsonb),
    'event',private.kinojo_banner_event_json_v394(v_group_id)
  );
exception
  when sqlstate 'P0001' then
    return jsonb_build_object('ok',false,'code',coalesce(nullif(sqlerrm,''),'BANNER_EVENT_SAVE_FAILED'));
end;
$function$;

create or replace function public.kinojo_banner_event_publish_v394(
  p_session_token text,
  p_event_group_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_result jsonb;
begin
  v_result := public.kinojo_banner_event_publish_v391(
    p_session_token,p_event_group_id
  );
  if coalesce((v_result->>'ok')::boolean,false) is not true then
    return v_result;
  end if;
  return jsonb_build_object(
    'ok',true,
    'apiVersion','394',
    'contract','banner-event-publish-v394',
    'eventGroupId',p_event_group_id,
    'publishedCampaignCount',v_result->'publishedCampaignCount',
    'event',private.kinojo_banner_event_json_v394(p_event_group_id)
  );
end;
$function$;

create or replace function private.kinojo_banner_manifest_internal_v394(
  p_page_code text,
  p_slot_code text,
  p_now timestamptz
) returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_page text := upper(btrim(coalesce(p_page_code,'')));
  v_slot text := upper(btrim(coalesce(p_slot_code,'')));
  v_now timestamptz := coalesce(p_now,statement_timestamp());
  v_kst_date date;
  v_control public.kinojo_banner_campaigns;
  v_campaign_found boolean := false;
  v_campaign_count integer := 0;
  v_playlist jsonb := '[]'::jsonb;
  v_playlist_count integer := 0;
  v_bucket_start timestamptz;
  v_bucket_end timestamptz;
  v_next_midnight timestamptz;
  v_next_boundary timestamptz;
  v_valid_until timestamptz;
  v_revision text;
  v_manifest_version text;
begin
  if not private.kinojo_banner_manifest_target_valid_v387(v_page,v_slot) then
    return jsonb_build_object('ok',false,'code','BANNER_MANIFEST_TARGET_INVALID');
  end if;

  v_kst_date := (v_now at time zone 'Asia/Seoul')::date;
  v_bucket_start := to_timestamp(floor(extract(epoch from v_now)/300.0)*300.0);
  v_bucket_end := v_bucket_start + interval '5 minutes';
  v_next_midnight := ((v_kst_date+1)::timestamp at time zone 'Asia/Seoul');

  select c.* into v_control
  from public.kinojo_banner_campaigns c
  where c.status='PUBLISHED'
    and c.page_code=v_page
    and v_slot=any(c.slot_codes)
    and (
      c.schedule_mode='ALWAYS'
      or private.kinojo_banner_schedule_active_v387(
        c.starts_at,c.ends_at,c.weekdays,c.specific_dates,v_now
      )
    )
  order by c.priority desc,c.updated_at desc,c.campaign_id desc
  limit 1;
  v_campaign_found := found;

  select count(*)::integer into v_campaign_count
  from public.kinojo_banner_campaigns c
  where c.status='PUBLISHED'
    and c.page_code=v_page
    and v_slot=any(c.slot_codes)
    and (
      c.schedule_mode='ALWAYS'
      or private.kinojo_banner_schedule_active_v387(
        c.starts_at,c.ends_at,c.weekdays,c.specific_dates,v_now
      )
    );

  select min(boundary_at) into v_next_boundary
  from (
    select c.starts_at as boundary_at
    from public.kinojo_banner_campaigns c
    where c.status='PUBLISHED' and c.page_code=v_page
      and v_slot=any(c.slot_codes) and c.starts_at>v_now
    union all
    select c.ends_at
    from public.kinojo_banner_campaigns c
    where c.status='PUBLISHED' and c.page_code=v_page
      and v_slot=any(c.slot_codes) and c.ends_at>v_now
    union all
    select i.starts_at
    from public.kinojo_banner_campaign_items i
    join public.kinojo_banner_campaigns c on c.campaign_id=i.campaign_id
    where c.status='PUBLISHED' and c.page_code=v_page
      and v_slot=any(c.slot_codes) and i.schedule_mode='CUSTOM'
      and i.starts_at>v_now
    union all
    select i.ends_at
    from public.kinojo_banner_campaign_items i
    join public.kinojo_banner_campaigns c on c.campaign_id=i.campaign_id
    where c.status='PUBLISHED' and c.page_code=v_page
      and v_slot=any(c.slot_codes) and i.schedule_mode='CUSTOM'
      and i.ends_at>v_now
  ) boundaries
  where boundary_at is not null;

  v_valid_until := least(
    v_bucket_end,
    v_next_midnight,
    coalesce(v_next_boundary,'infinity'::timestamptz)
  );

  select coalesce(jsonb_agg(jsonb_build_object(
      'campaignId',c.campaign_id,
      'itemId',i.item_id,
      'assetId',i.asset_id,
      'sourceType',a.source_type,
      'staticPath',a.static_path,
      'objectPath',a.object_path,
      'alt',coalesce(nullif(i.alt_text,''),a.default_alt,''),
      'clickUrl',nullif(i.click_url,''),
      'fitMode','COVER',
      'slideIntervalMs',c.slide_interval_ms,
      'transitionDurationMs',c.transition_duration_ms,
      'transitionEffect',c.transition_effect,
      'transitionDirection',c.transition_direction,
      'textOverlay',private.kinojo_banner_text_overlay_normalize_v394(i.text_overlay)
    ) order by
      c.priority desc,
      coalesce(c.published_at,c.created_at),
      c.campaign_id,
      i.sort_order,
      i.item_id
    ),'[]'::jsonb) into v_playlist
  from public.kinojo_banner_campaigns c
  join public.kinojo_banner_campaign_items i on i.campaign_id=c.campaign_id
  join public.kinojo_banner_assets a on a.asset_id=i.asset_id
  where c.status='PUBLISHED'
    and c.page_code=v_page
    and v_slot=any(c.slot_codes)
    and (
      c.schedule_mode='ALWAYS'
      or private.kinojo_banner_schedule_active_v387(
        c.starts_at,c.ends_at,c.weekdays,c.specific_dates,v_now
      )
    )
    and i.is_enabled
    and a.status='READY'
    and a.delete_token is null
    and (
      (c.campaign_type='MAIN' and a.format_code='MAIN_16_9')
      or (c.campaign_type='SIDE' and a.format_code='SIDE_300_715')
    )
    and (
      i.schedule_mode='INHERIT'
      or private.kinojo_banner_schedule_active_v387(
        i.starts_at,i.ends_at,i.weekdays,i.specific_dates,v_now
      )
    );

  v_playlist_count := jsonb_array_length(v_playlist);

  select coalesce(max(extract(epoch from updated_at)::bigint)::text,'0')
    into v_revision
  from (
    select c.updated_at
    from public.kinojo_banner_campaigns c
    where c.status='PUBLISHED' and c.page_code=v_page and v_slot=any(c.slot_codes)
    union all
    select i.updated_at
    from public.kinojo_banner_campaign_items i
    join public.kinojo_banner_campaigns c on c.campaign_id=i.campaign_id
    where c.status='PUBLISHED' and c.page_code=v_page and v_slot=any(c.slot_codes)
    union all
    select a.updated_at
    from public.kinojo_banner_campaign_items i
    join public.kinojo_banner_campaigns c on c.campaign_id=i.campaign_id
    join public.kinojo_banner_assets a on a.asset_id=i.asset_id
    where c.status='PUBLISHED' and c.page_code=v_page and v_slot=any(c.slot_codes)
  ) revisions;

  v_manifest_version := 'bm394-'||substr(md5(
    v_page||'|'||v_slot||'|'||coalesce(v_revision,'0')||'|'||
    extract(epoch from v_bucket_start)::bigint::text||'|'||v_playlist::text
  ),1,24);

  return jsonb_build_object(
    'ok',true,
    'apiVersion','394',
    'contract','banner-manifest-internal-v394',
    'manifestVersion',v_manifest_version,
    'generatedAtKst',to_char(v_now at time zone 'Asia/Seoul','YYYY-MM-DD"T"HH24:MI:SS')||'+09:00',
    'validUntil',to_char(v_valid_until at time zone 'Asia/Seoul','YYYY-MM-DD"T"HH24:MI:SS')||'+09:00',
    'pageCode',v_page,
    'slotCode',v_slot,
    'slotKey',v_page||':'||v_slot,
    'active',v_playlist_count>0,
    'reason',case
      when v_playlist_count>0 then null
      when not v_campaign_found then 'NO_ACTIVE_CAMPAIGN'
      else 'NO_ACTIVE_ITEMS'
    end,
    'exposureMode','ALL_ACTIVE',
    'activeCampaignCount',v_campaign_count,
    'rotation',case when v_campaign_found then jsonb_build_object(
      'slideIntervalMs',v_control.slide_interval_ms,
      'transitionDurationMs',v_control.transition_duration_ms
    ) else null end,
    'selectedCampaignId',case when v_campaign_found then v_control.campaign_id else null end,
    'playlist',v_playlist
  );
end;
$function$;

create or replace function public.kinojo_banner_manifest_v394(
  p_page_code text,
  p_slot_code text
) returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
  select private.kinojo_banner_manifest_internal_v394(
    p_page_code,p_slot_code,statement_timestamp()
  );
$function$;

revoke all on function private.kinojo_banner_manifest_internal_v394(text,text,timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.kinojo_banner_manifest_v394(text,text) from public, anon, authenticated;
grant execute on function public.kinojo_banner_manifest_v394(text,text) to service_role;

revoke all on function public.kinojo_banner_event_list_v394(text,boolean) from public, anon, authenticated;
revoke all on function public.kinojo_banner_event_save_v394(text,uuid,jsonb) from public, anon, authenticated;
revoke all on function public.kinojo_banner_event_publish_v394(text,uuid) from public, anon, authenticated;
grant execute on function public.kinojo_banner_event_list_v394(text,boolean) to service_role;
grant execute on function public.kinojo_banner_event_save_v394(text,uuid,jsonb) to service_role;
grant execute on function public.kinojo_banner_event_publish_v394(text,uuid) to service_role;

comment on column public.kinojo_banner_campaign_items.text_overlay is
  'v394 full-width text strip configured per image. The editor may apply one normalized setting to any selected item set.';
