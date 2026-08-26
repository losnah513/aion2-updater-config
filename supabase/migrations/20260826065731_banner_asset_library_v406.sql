-- KINOJO banner asset library read/edit contract v406.
-- Event usage is calculated on Server. Asset bytes and event records are never deleted here.

create or replace function private.kinojo_banner_asset_usage_v406(
  p_asset_id bigint
) returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'eventGroupId',u.event_group_id,
        'eventName',u.event_name,
        'eventType',u.event_type,
        'sideMode',u.side_mode,
        'status',u.event_status,
        'campaignCount',u.campaign_count,
        'itemCount',u.item_count,
        'enabledItemCount',u.enabled_item_count,
        'pageCodes',pg_catalog.to_jsonb(u.page_codes),
        'slotCodes',pg_catalog.to_jsonb(u.slot_codes)
      ) order by u.event_name,u.event_group_id
    ),
    '[]'::jsonb
  )
  from (
    select
      g.event_group_id,
      g.event_name,
      g.event_type,
      g.side_mode,
      case
        when pg_catalog.bool_or(c.status='PUBLISHED') then 'PUBLISHED'
        when pg_catalog.bool_or(c.status='DRAFT') then 'DRAFT'
        when pg_catalog.bool_or(c.status='PAUSED') then 'PAUSED'
        when pg_catalog.bool_or(c.status='ARCHIVED') then 'ARCHIVED'
        else pg_catalog.min(c.status)
      end as event_status,
      pg_catalog.count(distinct c.campaign_id)::integer as campaign_count,
      pg_catalog.count(i.item_id)::integer as item_count,
      pg_catalog.count(i.item_id) filter (where i.is_enabled)::integer as enabled_item_count,
      array(
        select distinct c2.page_code
        from public.kinojo_banner_campaigns c2
        join public.kinojo_banner_campaign_items i2 on i2.campaign_id=c2.campaign_id
        where c2.event_group_id=g.event_group_id and i2.asset_id=p_asset_id
        order by c2.page_code
      ) as page_codes,
      array(
        select distinct slot.slot_code
        from public.kinojo_banner_campaigns c3
        join public.kinojo_banner_campaign_items i3 on i3.campaign_id=c3.campaign_id
        cross join lateral pg_catalog.unnest(c3.slot_codes) slot(slot_code)
        where c3.event_group_id=g.event_group_id and i3.asset_id=p_asset_id
        order by slot.slot_code
      ) as slot_codes
    from private.kinojo_banner_event_groups_v391 g
    join public.kinojo_banner_campaigns c on c.event_group_id=g.event_group_id
    join public.kinojo_banner_campaign_items i on i.campaign_id=c.campaign_id and i.asset_id=p_asset_id
    group by g.event_group_id,g.event_name,g.event_type,g.side_mode
  ) u
$function$;

revoke all on function private.kinojo_banner_asset_usage_v406(bigint) from public, anon, authenticated, service_role;

create or replace function private.kinojo_banner_asset_json_v406(
  a public.kinojo_banner_assets
) returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
  select private.kinojo_banner_asset_json_v403(a)
    || pg_catalog.jsonb_build_object(
      'usageEvents',private.kinojo_banner_asset_usage_v406(a.asset_id),
      'formalEventCount',pg_catalog.jsonb_array_length(private.kinojo_banner_asset_usage_v406(a.asset_id))
    )
$function$;

revoke all on function private.kinojo_banner_asset_json_v406(public.kinojo_banner_assets) from public, anon, authenticated, service_role;

create or replace function private.kinojo_banner_asset_tag_groups_v406(
  p_include_archived boolean
) returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object('tag',t.tag,'count',t.asset_count)
      order by t.asset_count desc,pg_catalog.lower(t.tag),t.tag
    ),
    '[]'::jsonb
  )
  from (
    select tag,pg_catalog.count(*)::integer as asset_count
    from public.kinojo_banner_assets a
    cross join lateral pg_catalog.unnest(a.tags) value(tag)
    where coalesce(p_include_archived,true) or a.status='READY'
    group by tag
  ) t
$function$;

revoke all on function private.kinojo_banner_asset_tag_groups_v406(boolean) from public, anon, authenticated, service_role;

create or replace function public.kinojo_banner_asset_library_v406(
  p_session_token text,
  p_include_archived boolean default false
) returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_gate jsonb;
  v_assets jsonb;
  v_total integer;
  v_ready integer;
  v_archived integer;
  v_in_use integer;
begin
  v_gate:=private.kinojo_banner_require_master_v384(p_session_token);
  if coalesce((v_gate->>'ok')::boolean,false) is not true then return v_gate; end if;

  select
    coalesce(pg_catalog.jsonb_agg(private.kinojo_banner_asset_json_v406(a) order by a.created_at desc,a.asset_id desc),'[]'::jsonb),
    pg_catalog.count(*)::integer,
    pg_catalog.count(*) filter (where a.status='READY')::integer,
    pg_catalog.count(*) filter (where a.status='ARCHIVED')::integer,
    pg_catalog.count(*) filter (where private.kinojo_banner_asset_ref_count_v384(a.asset_id)>0)::integer
  into v_assets,v_total,v_ready,v_archived,v_in_use
  from public.kinojo_banner_assets a
  where coalesce(p_include_archived,false) or a.status='READY';

  return pg_catalog.jsonb_build_object(
    'ok',true,
    'apiVersion','406',
    'contract','banner-asset-library-v406',
    'memberId',(v_gate->>'memberId')::bigint,
    'assets',v_assets,
    'tagGroups',private.kinojo_banner_asset_tag_groups_v406(p_include_archived),
    'summary',pg_catalog.jsonb_build_object(
      'total',coalesce(v_total,0),
      'ready',coalesce(v_ready,0),
      'archived',coalesce(v_archived,0),
      'inUse',coalesce(v_in_use,0)
    )
  );
end
$function$;

create or replace function public.kinojo_banner_asset_update_v406(
  p_session_token text,
  p_asset_id bigint,
  p_title text,
  p_tags jsonb default '[]'::jsonb,
  p_default_alt text default ''
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_result jsonb;
  v_asset public.kinojo_banner_assets;
begin
  v_result:=public.kinojo_banner_asset_update_v403(
    p_session_token,p_asset_id,p_title,p_tags,p_default_alt
  );
  if coalesce((v_result->>'ok')::boolean,false) is not true then return v_result; end if;

  select * into v_asset from public.kinojo_banner_assets where asset_id=p_asset_id;
  return pg_catalog.jsonb_build_object(
    'ok',true,
    'apiVersion','406',
    'contract','banner-asset-update-v406',
    'asset',private.kinojo_banner_asset_json_v406(v_asset),
    'tagGroups',private.kinojo_banner_asset_tag_groups_v406(false)
  );
end
$function$;

revoke all on function public.kinojo_banner_asset_library_v406(text,boolean) from public, anon, authenticated;
revoke all on function public.kinojo_banner_asset_update_v406(text,bigint,text,jsonb,text) from public, anon, authenticated;
grant execute on function public.kinojo_banner_asset_library_v406(text,boolean) to service_role;
grant execute on function public.kinojo_banner_asset_update_v406(text,bigint,text,jsonb,text) to service_role;

comment on function public.kinojo_banner_asset_library_v406(text,boolean) is
  'MASTER-only image library with canonical metadata, Server-computed tag groups, and formal event usage.';
comment on function public.kinojo_banner_asset_update_v406(text,bigint,text,jsonb,text) is
  'MASTER-only title/tag update. Does not delete image bytes, event groups, campaigns, or campaign items.';
