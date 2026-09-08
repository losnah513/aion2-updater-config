-- DB471: persist a semantic ALL-page scope and reconcile formal SIDE events
-- whenever a supported page is added. Existing events that covered the full
-- pre-DB468 page contract are migrated to ALL and expanded to Legion Roster.

alter table private.kinojo_banner_event_groups_v391
  add column if not exists target_scope text not null default 'SELECTED';

alter table private.kinojo_banner_event_groups_v391
  drop constraint if exists kinojo_banner_event_target_scope_v471_chk;
alter table private.kinojo_banner_event_groups_v391
  add constraint kinojo_banner_event_target_scope_v471_chk
  check (target_scope in ('ALL','SELECTED'));

comment on column private.kinojo_banner_event_groups_v391.target_scope is
  'DB471 durable target intent. ALL follows the canonical supported-page contract; SELECTED remains an explicit snapshot.';

-- DB440 kept a literal 15-variant ceiling. Eight two-sided pages need sixteen
-- variants, and future page additions must not require another literal bump.
do $block$
declare
  v_definition text;
  v_patched text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.kinojo_banner_event_save_v391(text,uuid,jsonb)'::regprocedure
  ) into v_definition;
  v_patched:=pg_catalog.replace(
    v_definition,
    'jsonb_array_length(v_variants) not between 1 and 15',
    'jsonb_array_length(v_variants) not between 1 and cardinality(private.kinojo_banner_supported_page_codes_v404())*2'
  );
  if v_patched=v_definition then
    raise exception 'DB471 could not locate the DB440 event variant ceiling';
  end if;
  execute v_patched;
end
$block$;

create or replace function private.kinojo_banner_event_json_v471(
  p_event_group_id uuid
) returns jsonb
language sql
stable
security definer
set search_path=pg_catalog,public,private
as $function$
  select private.kinojo_banner_event_json_v404(p_event_group_id)
    || pg_catalog.jsonb_build_object(
      'targetScope',g.target_scope,
      'allPages',g.target_scope='ALL'
    )
  from private.kinojo_banner_event_groups_v391 g
  where g.event_group_id=p_event_group_id
$function$;

create or replace function public.kinojo_banner_event_all_targets_reconcile_v471(
  p_page_code text default null
) returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private
as $function$
declare
  v_requested text:=nullif(pg_catalog.upper(pg_catalog.btrim(coalesce(p_page_code,''))), '');
  v_supported text[]:=private.kinojo_banner_supported_page_codes_v404();
  v_pages text[];
  v_page text;
  v_slots text[];
  v_group record;
  v_roles text[];
  v_role text;
  v_template public.kinojo_banner_campaigns;
  v_campaign_id bigint;
  v_ready boolean;
  v_needs_reconcile boolean;
  v_campaign_count integer:=0;
  v_event_count integer:=0;
begin
  if v_requested is not null and not (v_requested=any(v_supported)) then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','BANNER_EVENT_RECONCILE_PAGE_INVALID'
    );
  end if;
  v_pages:=case when v_requested is null then v_supported else array[v_requested]::text[] end;
  if v_requested is not null then
    v_slots:=private.kinojo_banner_supported_page_slots_v404(v_requested);
    select exists (
      select 1
      from private.kinojo_banner_event_groups_v391 g
      where g.event_type='SIDE' and g.target_scope='ALL'
        and (
          not (v_requested=any(g.target_pages))
          or (g.side_mode='SYNC' and not exists (
            select 1 from public.kinojo_banner_campaigns c
            where c.event_group_id=g.event_group_id
              and c.page_code=v_requested and c.event_role='SHARED'
          ))
          or (g.side_mode='INDEPENDENT' and not exists (
            select 1 from public.kinojo_banner_campaigns c
            where c.event_group_id=g.event_group_id
              and c.page_code=v_requested and c.event_role='LEFT'
          ))
          or (g.side_mode='INDEPENDENT' and 'RIGHT'=any(v_slots) and not exists (
            select 1 from public.kinojo_banner_campaigns c
            where c.event_group_id=g.event_group_id
              and c.page_code=v_requested and c.event_role='RIGHT'
          ))
        )
    ) into v_needs_reconcile;
    if not v_needs_reconcile then
      return pg_catalog.jsonb_build_object(
        'ok',true,'apiVersion','471','contract','banner-event-all-target-reconcile-v471',
        'targetPage',v_requested,'expandedCampaignCount',0,'checkedEventPageCount',0,
        'alreadyCurrent',true
      );
    end if;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('kinojo-banner-all-targets-v471|'||coalesce(v_requested,'*'),0)
  );

  foreach v_page in array v_pages loop
    v_slots:=private.kinojo_banner_supported_page_slots_v404(v_page);
    if pg_catalog.cardinality(v_slots)=0 then continue; end if;
    for v_group in
      select g.event_group_id,g.side_mode
      from private.kinojo_banner_event_groups_v391 g
      where g.event_type='SIDE' and g.target_scope='ALL'
      order by g.event_group_id
    loop
      v_roles:=case when v_group.side_mode='INDEPENDENT'
        then array['LEFT','RIGHT']::text[] else array['SHARED']::text[] end;
      v_ready:=true;
      foreach v_role in array v_roles loop
        if v_role='RIGHT' and not ('RIGHT'=any(v_slots)) then continue; end if;
        if exists (
          select 1 from public.kinojo_banner_campaigns c
          where c.event_group_id=v_group.event_group_id
            and c.page_code=v_page and c.event_role=v_role
        ) then continue; end if;

        select c.* into v_template
        from public.kinojo_banner_campaigns c
        where c.event_group_id=v_group.event_group_id and c.event_role=v_role
        order by case c.status
          when 'PUBLISHED' then 1 when 'PAUSED' then 2
          when 'DRAFT' then 3 else 4 end,
          case when c.page_code='HOME' then 0 else 1 end,
          c.campaign_id
        limit 1;
        if not found then
          v_ready:=false;
          continue;
        end if;

        insert into public.kinojo_banner_campaigns(
          campaign_name,campaign_type,page_code,slot_codes,status,priority,
          schedule_mode,starts_at,ends_at,weekdays,specific_dates,
          slide_interval_ms,transition_duration_ms,
          created_by_member_id,updated_by_member_id,published_by_member_id,
          paused_by_member_id,archived_by_member_id,
          published_at,paused_at,archived_at,event_group_id,event_role,
          playback_mode,transition_effect,transition_direction
        ) values (
          v_template.campaign_name,v_template.campaign_type,v_page,
          case when v_role='SHARED' then v_slots else array[v_role]::text[] end,
          v_template.status,v_template.priority,v_template.schedule_mode,
          v_template.starts_at,v_template.ends_at,v_template.weekdays,
          v_template.specific_dates,v_template.slide_interval_ms,
          v_template.transition_duration_ms,v_template.created_by_member_id,
          v_template.updated_by_member_id,v_template.published_by_member_id,
          v_template.paused_by_member_id,v_template.archived_by_member_id,
          v_template.published_at,v_template.paused_at,v_template.archived_at,
          v_group.event_group_id,v_role,v_template.playback_mode,
          v_template.transition_effect,v_template.transition_direction
        ) returning campaign_id into v_campaign_id;

        insert into public.kinojo_banner_campaign_items(
          campaign_id,asset_id,weight,is_enabled,alt_text,click_url,sort_order,
          schedule_mode,starts_at,ends_at,weekdays,specific_dates,
          text_overlay,content_overlays,composite_object_path,
          composite_mime_type,composite_size_bytes,composite_width,
          composite_height,composite_source_hash
        )
        select v_campaign_id,i.asset_id,i.weight,i.is_enabled,i.alt_text,
          i.click_url,i.sort_order,i.schedule_mode,i.starts_at,i.ends_at,
          i.weekdays,i.specific_dates,i.text_overlay,i.content_overlays,
          i.composite_object_path,i.composite_mime_type,i.composite_size_bytes,
          i.composite_width,i.composite_height,i.composite_source_hash
        from public.kinojo_banner_campaign_items i
        where i.campaign_id=v_template.campaign_id
        order by i.sort_order,i.item_id;
        v_campaign_count:=v_campaign_count+1;
      end loop;

      if v_ready and not exists (
        select 1 from unnest(v_roles) role(role_code)
        where (role.role_code<>'RIGHT' or 'RIGHT'=any(v_slots))
          and not exists (
            select 1 from public.kinojo_banner_campaigns c
            where c.event_group_id=v_group.event_group_id
              and c.page_code=v_page and c.event_role=role.role_code
          )
      ) then
        update private.kinojo_banner_event_groups_v391 g
        set target_pages=array(
              select supported.code
              from unnest(v_supported) with ordinality supported(code,ordinality)
              where supported.code=any(g.target_pages) or supported.code=v_page
              order by supported.ordinality
            ),
            updated_at=case when not (v_page=any(g.target_pages))
              then pg_catalog.clock_timestamp() else g.updated_at end
        where g.event_group_id=v_group.event_group_id;
        if found then v_event_count:=v_event_count+1; end if;
      end if;
    end loop;
  end loop;

  return pg_catalog.jsonb_build_object(
    'ok',true,'apiVersion','471','contract','banner-event-all-target-reconcile-v471',
    'targetPage',v_requested,'expandedCampaignCount',v_campaign_count,
    'checkedEventPageCount',v_event_count
  );
exception
  when unique_violation then
    return pg_catalog.jsonb_build_object(
      'ok',false,'code','BANNER_EVENT_RECONCILE_CONFLICT'
    );
end
$function$;

create or replace function public.kinojo_banner_event_targets_v471(
  p_session_token text
) returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,public,private
as $function$
declare v_result jsonb;
begin
  v_result:=public.kinojo_banner_event_targets_v404(p_session_token);
  if coalesce((v_result->>'ok')::boolean,false) is not true then return v_result; end if;
  return v_result||pg_catalog.jsonb_build_object(
    'apiVersion','471','contract','banner-event-targets-v471',
    'targetScopes',pg_catalog.jsonb_build_array('SELECTED','ALL'),
    'allScopeMeaning','CURRENT_AND_FUTURE_SUPPORTED_PAGES'
  );
end
$function$;

create or replace function public.kinojo_banner_event_list_v471(
  p_session_token text,
  p_include_archived boolean default true
) returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,public,private
as $function$
declare
  v_result jsonb;
  v_events jsonb;
begin
  v_result:=public.kinojo_banner_event_list_v404(
    p_session_token,p_include_archived
  );
  if coalesce((v_result->>'ok')::boolean,false) is not true then return v_result; end if;
  select coalesce(
    pg_catalog.jsonb_agg(private.kinojo_banner_event_json_v471(g.event_group_id)
      order by g.manager_order desc,g.event_group_id),
    '[]'::jsonb
  ) into v_events
  from private.kinojo_banner_event_groups_v391 g
  where coalesce(p_include_archived,true)
     or exists (
       select 1 from public.kinojo_banner_campaigns c
       where c.event_group_id=g.event_group_id and c.status<>'ARCHIVED'
     );
  return v_result||pg_catalog.jsonb_build_object(
    'apiVersion','471','contract','banner-event-list-v471','events',v_events
  );
end
$function$;

create or replace function public.kinojo_banner_event_save_v471(
  p_session_token text,
  p_event_group_id uuid,
  p_payload jsonb
) returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private
as $function$
declare
  v_scope text:=pg_catalog.upper(pg_catalog.btrim(coalesce(p_payload->>'targetScope','SELECTED')));
  v_type text:=pg_catalog.upper(pg_catalog.btrim(coalesce(p_payload->>'type','')));
  v_supported text[]:=private.kinojo_banner_supported_page_codes_v404();
  v_targets text[]:='{}'::text[];
  v_result jsonb;
  v_group_id uuid;
begin
  if p_payload is null or pg_catalog.jsonb_typeof(p_payload)<>'object' then
    return pg_catalog.jsonb_build_object('ok',false,'code','BANNER_EVENT_PAYLOAD_INVALID');
  end if;
  if v_scope not in ('ALL','SELECTED') then
    return pg_catalog.jsonb_build_object('ok',false,'code','BANNER_EVENT_TARGET_SCOPE_INVALID');
  end if;
  if v_type='MAIN' and v_scope<>'SELECTED' then
    return pg_catalog.jsonb_build_object('ok',false,'code','BANNER_EVENT_MAIN_TARGET_SCOPE_INVALID');
  end if;
  if v_scope='ALL' then
    if v_type<>'SIDE' or pg_catalog.jsonb_typeof(p_payload->'targetPages')<>'array' then
      return pg_catalog.jsonb_build_object('ok',false,'code','BANNER_EVENT_ALL_TARGETS_INVALID');
    end if;
    select coalesce(pg_catalog.array_agg(s.code order by s.ordinality),'{}'::text[])
      into v_targets
    from unnest(v_supported) with ordinality s(code,ordinality)
    where s.code in (
      select pg_catalog.upper(pg_catalog.btrim(e.value#>>'{}'))
      from pg_catalog.jsonb_array_elements(p_payload->'targetPages') e(value)
    );
    if v_targets<>v_supported
       or pg_catalog.jsonb_array_length(p_payload->'targetPages')<>pg_catalog.cardinality(v_supported) then
      return pg_catalog.jsonb_build_object(
        'ok',false,'code','BANNER_EVENT_ALL_TARGETS_STALE',
        'supportedTargetPages',pg_catalog.to_jsonb(v_supported)
      );
    end if;
  end if;

  v_result:=public.kinojo_banner_event_save_v407(
    p_session_token,p_event_group_id,p_payload
  );
  if coalesce((v_result->>'ok')::boolean,false) is not true then return v_result; end if;
  v_group_id:=(v_result->>'eventGroupId')::uuid;
  update private.kinojo_banner_event_groups_v391
  set target_scope=v_scope
  where event_group_id=v_group_id;
  return v_result||pg_catalog.jsonb_build_object(
    'apiVersion','471','contract','banner-event-save-v471',
    'event',private.kinojo_banner_event_json_v471(v_group_id)
  );
end
$function$;

create or replace function public.kinojo_banner_event_publish_v471(
  p_session_token text,
  p_event_group_id uuid
) returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private
as $function$
declare v_result jsonb;
begin
  v_result:=public.kinojo_banner_event_publish_v404(
    p_session_token,p_event_group_id
  );
  if coalesce((v_result->>'ok')::boolean,false) is not true then return v_result; end if;
  return v_result||pg_catalog.jsonb_build_object(
    'apiVersion','471','contract','banner-event-publish-v471',
    'event',private.kinojo_banner_event_json_v471(p_event_group_id)
  );
end
$function$;

-- Every SIDE event matching the complete seven-page pre-DB468 contract was
-- created through the former "전체선택" mode. Preserve that intent explicitly.
update private.kinojo_banner_event_groups_v391
set target_scope='ALL'
where event_type='SIDE'
  and target_pages @> array[
    'HOME','HOF','RANKING','LEGION_TREE','METER','SANCTUARY','SANCTUARY_SCHEDULE'
  ]::text[]
  and array[
    'HOME','HOF','RANKING','LEGION_TREE','METER','SANCTUARY','SANCTUARY_SCHEDULE'
  ]::text[] @> target_pages;

do $block$
begin
  perform public.kinojo_banner_event_all_targets_reconcile_v471(null);
end
$block$;

revoke all on function private.kinojo_banner_event_json_v471(uuid)
  from public,anon,authenticated,service_role;
revoke all on function public.kinojo_banner_event_all_targets_reconcile_v471(text)
  from public,anon,authenticated;
revoke all on function public.kinojo_banner_event_targets_v471(text)
  from public,anon,authenticated;
revoke all on function public.kinojo_banner_event_list_v471(text,boolean)
  from public,anon,authenticated;
revoke all on function public.kinojo_banner_event_save_v471(text,uuid,jsonb)
  from public,anon,authenticated;
revoke all on function public.kinojo_banner_event_publish_v471(text,uuid)
  from public,anon,authenticated;

grant execute on function public.kinojo_banner_event_all_targets_reconcile_v471(text)
  to service_role;
grant execute on function public.kinojo_banner_event_targets_v471(text)
  to service_role;
grant execute on function public.kinojo_banner_event_list_v471(text,boolean)
  to service_role;
grant execute on function public.kinojo_banner_event_save_v471(text,uuid,jsonb)
  to service_role;
grant execute on function public.kinojo_banner_event_publish_v471(text,uuid)
  to service_role;

comment on function public.kinojo_banner_event_all_targets_reconcile_v471(text) is
  'Service-only DB471 reconciler: clone each ALL-scope SIDE event into missing canonical pages before manifest generation.';
comment on function public.kinojo_banner_event_save_v471(text,uuid,jsonb) is
  'MASTER event save with durable ALL versus SELECTED target intent.';
