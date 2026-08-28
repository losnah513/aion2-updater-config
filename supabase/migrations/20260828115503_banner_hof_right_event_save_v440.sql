-- KINOJO banner HOF right-side event-save patch v440.
--
-- DB438 extended the formal target contract so HOF supports LEFT + RIGHT, but
-- the base v391 event-save function still contained the retired HOF-left-only
-- branches. Replace that validation with the canonical v404 supported-slot
-- helper so target discovery and target persistence use one source of truth.

create or replace function public.kinojo_banner_event_save_v391(
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
  v_member bigint;
  v_group private.kinojo_banner_event_groups_v391;
  v_group_id uuid := p_event_group_id;
  v_new boolean := p_event_group_id is null;
  v_name text;
  v_type text;
  v_side_mode text;
  v_tags text[];
  v_variants jsonb;
  v_variant jsonb;
  v_role text;
  v_page text;
  v_slots text[];
  v_supported_slots text[];
  v_key text;
  v_seen text[] := '{}'::text[];
  v_campaign public.kinojo_banner_campaigns;
  v_campaign_id bigint;
  v_effect text;
  v_direction text;
  v_items jsonb;
  v_result jsonb;
  v_save_payload jsonb;
  v_saved_ids jsonb := '[]'::jsonb;
begin
  v_gate := private.kinojo_banner_require_master_v384(p_session_token);
  if coalesce((v_gate->>'ok')::boolean,false) is not true then
    return v_gate;
  end if;
  v_member := (v_gate->>'memberId')::bigint;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' then
    return jsonb_build_object('ok',false,'code','BANNER_EVENT_PAYLOAD_INVALID');
  end if;

  v_name := btrim(coalesce(p_payload->>'name',''));
  v_type := upper(btrim(coalesce(p_payload->>'type','')));
  v_side_mode := upper(btrim(coalesce(p_payload->>'sideMode','SYNC')));
  if char_length(v_name) not between 1 and 120 then
    return jsonb_build_object('ok',false,'code','BANNER_EVENT_NAME_INVALID');
  end if;
  if v_type not in ('MAIN','SIDE') then
    return jsonb_build_object('ok',false,'code','BANNER_EVENT_TYPE_INVALID');
  end if;
  if v_side_mode not in ('SYNC','INDEPENDENT') or (v_type='MAIN' and v_side_mode<>'SYNC') then
    return jsonb_build_object('ok',false,'code','BANNER_EVENT_SIDE_MODE_INVALID');
  end if;
  begin
    v_tags := private.kinojo_banner_tags_normalize_v391(p_payload->'tags');
  exception when others then
    return jsonb_build_object('ok',false,'code',sqlerrm);
  end;

  v_variants := p_payload->'variants';
  if v_variants is null or jsonb_typeof(v_variants)<>'array'
     or jsonb_array_length(v_variants) not between 1 and 15 then
    return jsonb_build_object('ok',false,'code','BANNER_EVENT_VARIANTS_INVALID');
  end if;

  if v_new then
    insert into private.kinojo_banner_event_groups_v391(
      event_name,event_type,side_mode,tags,created_by_member_id,updated_by_member_id
    ) values (
      v_name,v_type,v_side_mode,v_tags,v_member,v_member
    ) returning * into v_group;
    v_group_id := v_group.event_group_id;
  else
    select * into v_group
    from private.kinojo_banner_event_groups_v391
    where event_group_id=v_group_id
    for update;
    if not found then
      return jsonb_build_object('ok',false,'code','BANNER_EVENT_NOT_FOUND');
    end if;
    if exists (
      select 1 from public.kinojo_banner_campaigns c
      where c.event_group_id=v_group_id and c.status='PUBLISHED'
    ) then
      return jsonb_build_object('ok',false,'code','BANNER_EVENT_PAUSE_REQUIRED');
    end if;
    if exists (
      select 1 from public.kinojo_banner_campaigns c
      where c.event_group_id=v_group_id and c.status='ARCHIVED'
    ) then
      return jsonb_build_object('ok',false,'code','BANNER_EVENT_ARCHIVED');
    end if;
    if v_group.event_type<>v_type then
      return jsonb_build_object('ok',false,'code','BANNER_EVENT_TYPE_IMMUTABLE');
    end if;
    update private.kinojo_banner_event_groups_v391
       set event_name=v_name,side_mode=v_side_mode,tags=v_tags,
           updated_by_member_id=v_member,updated_at=clock_timestamp()
     where event_group_id=v_group_id
     returning * into v_group;
    update public.kinojo_banner_campaigns
       set campaign_name=v_name
     where event_group_id=v_group_id;
  end if;

  for v_variant in select value from jsonb_array_elements(v_variants)
  loop
    if jsonb_typeof(v_variant)<>'object' then
      raise exception using errcode='P0001',
        message=jsonb_build_object('ok',false,'code','BANNER_EVENT_VARIANT_INVALID')::text;
    end if;
    v_role := upper(btrim(coalesce(v_variant->>'eventRole','')));
    v_page := upper(btrim(coalesce(v_variant->>'pageCode','')));
    v_supported_slots := private.kinojo_banner_supported_page_slots_v404(v_page);
    begin
      v_slots := private.kinojo_banner_text_array_v386(v_variant->'slotCodes');
    exception when others then
      raise exception using errcode='P0001',
        message=jsonb_build_object('ok',false,'code','BANNER_EVENT_SLOTS_INVALID')::text;
    end;
    v_key := v_page||':'||v_role;
    if v_key = any(v_seen) then
      raise exception using errcode='P0001',
        message=jsonb_build_object('ok',false,'code','BANNER_EVENT_VARIANT_DUPLICATE','target',v_key)::text;
    end if;
    v_seen := array_append(v_seen,v_key);

    if v_type='MAIN' then
      if v_role<>'MAIN' or v_page<>'HOME' or v_slots<>array['MAIN']::text[] then
        raise exception using errcode='P0001',
          message=jsonb_build_object('ok',false,'code','BANNER_EVENT_MAIN_TARGET_INVALID')::text;
      end if;
    elsif v_side_mode='SYNC' then
      if v_role<>'SHARED'
         or cardinality(v_supported_slots)=0
         or v_slots<>v_supported_slots
         or not private.kinojo_banner_campaign_target_valid_v386('SIDE',v_page,v_slots) then
        raise exception using errcode='P0001',
          message=jsonb_build_object('ok',false,'code','BANNER_EVENT_SYNC_TARGET_INVALID','pageCode',v_page)::text;
      end if;
    else
      if v_role not in ('LEFT','RIGHT')
         or v_slots<>array[v_role]::text[]
         or not (v_role=any(v_supported_slots))
         or not private.kinojo_banner_campaign_target_valid_v386('SIDE',v_page,v_slots) then
        raise exception using errcode='P0001',
          message=jsonb_build_object('ok',false,'code','BANNER_EVENT_INDEPENDENT_TARGET_INVALID','pageCode',v_page,'eventRole',v_role)::text;
      end if;
    end if;

    v_items := coalesce(v_variant->'items','[]'::jsonb);
    if jsonb_typeof(v_items)<>'array' or jsonb_array_length(v_items)>99 then
      raise exception using errcode='P0001',
        message=jsonb_build_object('ok',false,'code','BANNER_EVENT_ITEMS_MAX_THREE')::text;
    end if;

    v_campaign_id := null;
    if nullif(v_variant->>'campaignId','') is not null then
      begin
        v_campaign_id := (v_variant->>'campaignId')::bigint;
      exception when others then
        raise exception using errcode='P0001',
          message=jsonb_build_object('ok',false,'code','BANNER_CAMPAIGN_ID_INVALID')::text;
      end;
      select * into v_campaign
      from public.kinojo_banner_campaigns
      where campaign_id=v_campaign_id and event_group_id=v_group_id
      for update;
      if not found then
        raise exception using errcode='P0001',
          message=jsonb_build_object('ok',false,'code','BANNER_EVENT_CAMPAIGN_NOT_FOUND')::text;
      end if;
      if v_campaign.page_code<>v_page or v_campaign.event_role<>v_role then
        raise exception using errcode='P0001',
          message=jsonb_build_object('ok',false,'code','BANNER_EVENT_CAMPAIGN_TARGET_IMMUTABLE')::text;
      end if;
    else
      select * into v_campaign
      from public.kinojo_banner_campaigns
      where event_group_id=v_group_id and page_code=v_page and event_role=v_role
      for update;
      if found then
        v_campaign_id := v_campaign.campaign_id;
      end if;
    end if;

    v_effect := upper(btrim(coalesce(
      v_variant->>'transitionEffect',
      case when v_campaign_id is null then 'CROSSFADE' else v_campaign.transition_effect end
    )));
    v_direction := upper(btrim(coalesce(
      v_variant->>'transitionDirection',
      case when v_campaign_id is null then
        case when v_effect in ('SLIDE','SLIDE_FADE') then 'RIGHT_TO_LEFT' else 'NONE' end
      else v_campaign.transition_direction end
    )));
    if v_effect not in ('NONE','CROSSFADE','SLIDE','SLIDE_FADE','ZOOM') then
      raise exception using errcode='P0001',
        message=jsonb_build_object('ok',false,'code','BANNER_EVENT_TRANSITION_EFFECT_INVALID')::text;
    end if;
    if v_direction not in ('NONE','LEFT_TO_RIGHT','RIGHT_TO_LEFT','TOP_TO_BOTTOM','BOTTOM_TO_TOP')
       or (v_effect in ('SLIDE','SLIDE_FADE') and v_direction='NONE')
       or (v_effect in ('NONE','CROSSFADE','ZOOM') and v_direction<>'NONE') then
      raise exception using errcode='P0001',
        message=jsonb_build_object('ok',false,'code','BANNER_EVENT_TRANSITION_DIRECTION_INVALID')::text;
    end if;

    v_save_payload := v_variant
      - 'campaignId' - 'eventRole' - 'transitionEffect' - 'transitionDirection';
    v_save_payload := v_save_payload || jsonb_build_object(
      'name',v_name,
      'type',v_type,
      'pageCode',v_page,
      'slotCodes',to_jsonb(v_slots),
      'items',v_items
    );
    v_result := private.kinojo_banner_campaign_save_v386(
      p_session_token,v_campaign_id,v_save_payload
    );
    if coalesce((v_result->>'ok')::boolean,false) is not true then
      raise exception using errcode='P0001',message=v_result::text;
    end if;
    v_campaign_id := (v_result#>>'{campaign,campaignId}')::bigint;

    update public.kinojo_banner_campaigns
       set event_group_id=v_group_id,
           event_role=v_role,
           playback_mode='ORDERED',
           transition_effect=v_effect,
           transition_direction=v_direction
     where campaign_id=v_campaign_id;
    v_saved_ids := v_saved_ids || jsonb_build_array(v_campaign_id);
  end loop;

  update private.kinojo_banner_event_groups_v391
     set updated_by_member_id=v_member,updated_at=clock_timestamp()
   where event_group_id=v_group_id;

  return jsonb_build_object(
    'ok',true,
    'apiVersion','391',
    'contract','banner-event-save-v391',
    'eventGroupId',v_group_id,
    'savedCampaignIds',v_saved_ids,
    'event',private.kinojo_banner_event_json_v391(v_group_id)
  );
exception
  when sqlstate 'P0001' then
    return coalesce(nullif(sqlerrm,'')::jsonb,
      jsonb_build_object('ok',false,'code','BANNER_EVENT_SAVE_FAILED'));
  when unique_violation then
    return jsonb_build_object('ok',false,'code','BANNER_EVENT_TARGET_CONFLICT');
  when check_violation then
    return jsonb_build_object('ok',false,'code','BANNER_EVENT_VALIDATION_FAILED');
end;
$function$;

revoke all on function public.kinojo_banner_event_save_v391(text,uuid,jsonb)
  from public, anon, authenticated;
grant execute on function public.kinojo_banner_event_save_v391(text,uuid,jsonb)
  to service_role;

comment on function public.kinojo_banner_event_save_v391(text,uuid,jsonb) is
  'DB440 event-save base contract: SIDE target validation follows the canonical v404 supported page slots, including HOF RIGHT.';
