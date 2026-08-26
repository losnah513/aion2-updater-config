-- Banner redesign phase 2 stage 4: server-owned target-page contract.
--
-- A formal event stores the exact page set that was chosen when the draft was
-- saved.  Adding a page to a later contract therefore never expands an older
-- event implicitly.  Legacy campaigns and the public playback manifest remain
-- unchanged.

create or replace function private.kinojo_banner_supported_page_codes_v404()
returns text[]
language sql
immutable
security invoker
set search_path = pg_catalog, private
as $function$
  select array[
    'HOME','HOF','RANKING','LEGION_TREE','METER','SANCTUARY','SANCTUARY_SCHEDULE'
  ]::text[];
$function$;

create or replace function private.kinojo_banner_supported_page_slots_v404(
  p_page_code text
) returns text[]
language sql
immutable
security invoker
set search_path = pg_catalog, private
as $function$
  select case upper(btrim(coalesce(p_page_code,'')))
    when 'HOF' then array['LEFT']::text[]
    when 'HOME' then array['LEFT','RIGHT']::text[]
    when 'RANKING' then array['LEFT','RIGHT']::text[]
    when 'LEGION_TREE' then array['LEFT','RIGHT']::text[]
    when 'METER' then array['LEFT','RIGHT']::text[]
    when 'SANCTUARY' then array['LEFT','RIGHT']::text[]
    when 'SANCTUARY_SCHEDULE' then array['LEFT','RIGHT']::text[]
    else '{}'::text[]
  end;
$function$;

create or replace function private.kinojo_banner_target_pages_valid_v404(
  p_target_pages text[]
) returns boolean
language sql
immutable
security invoker
set search_path = pg_catalog, private
as $function$
  select coalesce(p_target_pages,'{}'::text[])
           <@ private.kinojo_banner_supported_page_codes_v404()
     and cardinality(coalesce(p_target_pages,'{}'::text[]))
           <=cardinality(private.kinojo_banner_supported_page_codes_v404())
     and cardinality(coalesce(p_target_pages,'{}'::text[]))=(
       select count(distinct page_code)::integer
       from unnest(coalesce(p_target_pages,'{}'::text[])) page(page_code)
     );
$function$;

create or replace function private.kinojo_banner_target_page_contract_v404()
returns jsonb
language sql
immutable
security invoker
set search_path = pg_catalog, private
as $function$
  select jsonb_build_object(
    'contractVersion',404,
    'main',jsonb_build_object(
      'pageCode','HOME','label','홈','slotCodes',jsonb_build_array('MAIN'),
      'locked',true
    ),
    'sidePages',jsonb_build_array(
      jsonb_build_object('pageCode','HOME','label','홈','slotCodes',jsonb_build_array('LEFT','RIGHT'),'sortOrder',1),
      jsonb_build_object('pageCode','HOF','label','명예의 전당','slotCodes',jsonb_build_array('LEFT'),'sortOrder',2),
      jsonb_build_object('pageCode','RANKING','label','레기온 순위','slotCodes',jsonb_build_array('LEFT','RIGHT'),'sortOrder',3),
      jsonb_build_object('pageCode','LEGION_TREE','label','레기온 트리','slotCodes',jsonb_build_array('LEFT','RIGHT'),'sortOrder',4),
      jsonb_build_object('pageCode','METER','label','키노조 미터','slotCodes',jsonb_build_array('LEFT','RIGHT'),'sortOrder',5),
      jsonb_build_object('pageCode','SANCTUARY','label','성역 메인','slotCodes',jsonb_build_array('LEFT','RIGHT'),'sortOrder',6),
      jsonb_build_object('pageCode','SANCTUARY_SCHEDULE','label','성역 스케줄','slotCodes',jsonb_build_array('LEFT','RIGHT'),'sortOrder',7)
    )
  );
$function$;

revoke all on function private.kinojo_banner_supported_page_codes_v404()
  from public, anon, authenticated, service_role;
revoke all on function private.kinojo_banner_supported_page_slots_v404(text)
  from public, anon, authenticated, service_role;
revoke all on function private.kinojo_banner_target_pages_valid_v404(text[])
  from public, anon, authenticated, service_role;
revoke all on function private.kinojo_banner_target_page_contract_v404()
  from public, anon, authenticated, service_role;

alter table private.kinojo_banner_event_groups_v391
  add column if not exists target_pages text[] not null default '{}'::text[],
  add column if not exists target_page_contract_version integer not null default 404;

-- Existing formal events are made explicit without touching campaign rows,
-- statuses, items, or the operating manifest.
update private.kinojo_banner_event_groups_v391 g
   set target_pages=coalesce((
     select array_agg(p.page_code order by p.sort_order)
     from (
       select distinct c.page_code,
         array_position(private.kinojo_banner_supported_page_codes_v404(),c.page_code) as sort_order
       from public.kinojo_banner_campaigns c
       where c.event_group_id=g.event_group_id
     ) p
   ),'{}'::text[]),
       target_page_contract_version=404;

alter table private.kinojo_banner_event_groups_v391
  drop constraint if exists kinojo_banner_event_target_pages_v404_chk;
alter table private.kinojo_banner_event_groups_v391
  add constraint kinojo_banner_event_target_pages_v404_chk check (
    private.kinojo_banner_target_pages_valid_v404(target_pages)
  );
alter table private.kinojo_banner_event_groups_v391
  drop constraint if exists kinojo_banner_event_target_contract_v404_chk;
alter table private.kinojo_banner_event_groups_v391
  add constraint kinojo_banner_event_target_contract_v404_chk check (
    target_page_contract_version=404
  );

create or replace function public.kinojo_banner_event_targets_v404(
  p_session_token text
) returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_gate jsonb;
begin
  v_gate:=private.kinojo_banner_require_master_v384(p_session_token);
  if coalesce((v_gate->>'ok')::boolean,false) is not true then return v_gate; end if;
  return jsonb_build_object(
    'ok',true,'apiVersion','404','contract','banner-event-targets-v404',
    'targetPageContract',private.kinojo_banner_target_page_contract_v404()
  );
end;
$function$;

create or replace function private.kinojo_banner_event_json_v404(
  p_event_group_id uuid
) returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
  select private.kinojo_banner_event_json_v402(p_event_group_id)
    || jsonb_build_object(
      'targetPages',to_jsonb(g.target_pages),
      'targetPageContractVersion',g.target_page_contract_version
    )
  from private.kinojo_banner_event_groups_v391 g
  where g.event_group_id=p_event_group_id;
$function$;

create or replace function public.kinojo_banner_event_list_v404(
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
  v_rotation_mode text;
begin
  v_gate:=private.kinojo_banner_require_master_v384(p_session_token);
  if coalesce((v_gate->>'ok')::boolean,false) is not true then return v_gate; end if;

  select rotation_mode into v_rotation_mode
  from private.kinojo_banner_event_rotation_v402 where singleton=true;

  select coalesce(
    jsonb_agg(private.kinojo_banner_event_json_v404(g.event_group_id)
      order by g.manager_order desc,g.event_group_id),
    '[]'::jsonb
  ) into v_events
  from private.kinojo_banner_event_groups_v391 g
  where coalesce(p_include_archived,true)
     or exists (
       select 1 from public.kinojo_banner_campaigns c
       where c.event_group_id=g.event_group_id and c.status<>'ARCHIVED'
     );

  select coalesce(
    jsonb_agg(private.kinojo_banner_campaign_json_v396(c)
      order by c.updated_at desc,c.campaign_id desc),
    '[]'::jsonb
  ) into v_legacy
  from public.kinojo_banner_campaigns c
  where c.event_group_id is null
    and (coalesce(p_include_archived,true) or c.status<>'ARCHIVED');

  return jsonb_build_object(
    'ok',true,'apiVersion','404','contract','banner-event-list-v404',
    'targetPageContractVersion',404,
    'eventRotationMode',coalesce(v_rotation_mode,'ORDERED'),
    'eventRotationScope','FORMAL_EVENT_GROUPS_ONLY',
    'events',v_events,'legacyCampaigns',v_legacy
  );
end;
$function$;

create or replace function public.kinojo_banner_event_save_v404(
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
  v_result jsonb;
  v_group_id uuid:=p_event_group_id;
  v_group private.kinojo_banner_event_groups_v391;
  v_name text;
  v_type text;
  v_side_mode text;
  v_tags text[];
  v_contract_version integer;
  v_target_json jsonb;
  v_targets text[]:='{}'::text[];
  v_supported text[]:=private.kinojo_banner_supported_page_codes_v404();
  v_raw_count integer:=0;
  v_page text;
  v_slots text[];
  v_variants jsonb;
  v_variant jsonb;
  v_expected_keys text[]:='{}'::text[];
  v_actual_keys text[]:='{}'::text[];
  v_role text;
begin
  v_gate:=private.kinojo_banner_require_master_v384(p_session_token);
  if coalesce((v_gate->>'ok')::boolean,false) is not true then return v_gate; end if;
  v_member:=(v_gate->>'memberId')::bigint;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' then
    return jsonb_build_object('ok',false,'code','BANNER_EVENT_PAYLOAD_INVALID');
  end if;

  v_name:=btrim(coalesce(p_payload->>'name',''));
  v_type:=upper(btrim(coalesce(p_payload->>'type','')));
  v_side_mode:=upper(btrim(coalesce(p_payload->>'sideMode','SYNC')));
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
    v_tags:=private.kinojo_banner_tags_normalize_v391(p_payload->'tags');
  exception when others then
    return jsonb_build_object('ok',false,'code',coalesce(nullif(sqlerrm,''),'BANNER_EVENT_TAGS_INVALID'));
  end;
  begin
    v_contract_version:=(p_payload->>'targetPageContractVersion')::integer;
  exception when others then
    return jsonb_build_object('ok',false,'code','BANNER_EVENT_TARGET_PAGE_CONTRACT_INVALID');
  end;
  if v_contract_version<>404 then
    return jsonb_build_object('ok',false,'code','BANNER_EVENT_TARGET_PAGE_CONTRACT_INVALID');
  end if;

  v_target_json:=p_payload->'targetPages';
  if v_target_json is null or jsonb_typeof(v_target_json)<>'array' then
    return jsonb_build_object('ok',false,'code','BANNER_EVENT_TARGET_PAGES_INVALID');
  end if;
  v_raw_count:=jsonb_array_length(v_target_json);
  if exists (
    select 1 from jsonb_array_elements(v_target_json) e(value)
    where jsonb_typeof(e.value)<>'string'
  ) then
    return jsonb_build_object('ok',false,'code','BANNER_EVENT_TARGET_PAGES_INVALID');
  end if;
  select coalesce(array_agg(s.code order by s.ordinality),'{}'::text[])
    into v_targets
  from unnest(v_supported) with ordinality s(code,ordinality)
  where s.code in (
    select upper(btrim(e.value#>>'{}'))
    from jsonb_array_elements(v_target_json) e(value)
  );
  if v_raw_count<>cardinality(v_targets) then
    return jsonb_build_object('ok',false,'code','BANNER_EVENT_TARGET_PAGES_INVALID');
  end if;
  if v_type='MAIN' and v_targets<>array['HOME']::text[] then
    return jsonb_build_object('ok',false,'code','BANNER_EVENT_MAIN_TARGET_INVALID');
  end if;

  v_variants:=p_payload->'variants';
  if v_variants is null or jsonb_typeof(v_variants)<>'array' then
    return jsonb_build_object('ok',false,'code','BANNER_EVENT_VARIANTS_INVALID');
  end if;

  -- SIDE drafts may intentionally have no target yet.  Persist the group and
  -- remove only its editable draft/paused variants; published/archived groups
  -- keep the existing pause/archive protections.
  if v_type='SIDE' and cardinality(v_targets)=0 then
    if jsonb_array_length(v_variants)<>0 then
      return jsonb_build_object('ok',false,'code','BANNER_EVENT_TARGET_VARIANTS_MISMATCH');
    end if;
    if v_group_id is null then
      insert into private.kinojo_banner_event_groups_v391(
        event_name,event_type,side_mode,tags,created_by_member_id,updated_by_member_id,
        target_pages,target_page_contract_version
      ) values (
        v_name,v_type,v_side_mode,v_tags,v_member,v_member,'{}'::text[],404
      ) returning * into v_group;
      v_group_id:=v_group.event_group_id;
    else
      select * into v_group
      from private.kinojo_banner_event_groups_v391
      where event_group_id=v_group_id for update;
      if not found then
        return jsonb_build_object('ok',false,'code','BANNER_EVENT_NOT_FOUND');
      end if;
      if exists (
        select 1 from public.kinojo_banner_campaigns
        where event_group_id=v_group_id and status='PUBLISHED'
      ) then
        return jsonb_build_object('ok',false,'code','BANNER_EVENT_PAUSE_REQUIRED');
      end if;
      if exists (
        select 1 from public.kinojo_banner_campaigns
        where event_group_id=v_group_id and status='ARCHIVED'
      ) then
        return jsonb_build_object('ok',false,'code','BANNER_EVENT_ARCHIVED');
      end if;
      if v_group.event_type<>v_type then
        return jsonb_build_object('ok',false,'code','BANNER_EVENT_TYPE_IMMUTABLE');
      end if;
      update private.kinojo_banner_event_groups_v391
         set event_name=v_name,side_mode=v_side_mode,tags=v_tags,
             target_pages='{}'::text[],target_page_contract_version=404,
             updated_by_member_id=v_member,updated_at=clock_timestamp()
       where event_group_id=v_group_id;
      delete from public.kinojo_banner_campaigns
       where event_group_id=v_group_id and status in ('DRAFT','PAUSED');
    end if;
    return jsonb_build_object(
      'ok',true,'apiVersion','404','contract','banner-event-save-v404',
      'eventGroupId',v_group_id,'savedCampaignIds','[]'::jsonb,
      'event',private.kinojo_banner_event_json_v404(v_group_id)
    );
  end if;

  foreach v_page in array v_targets loop
    v_slots:=private.kinojo_banner_supported_page_slots_v404(v_page);
    if v_type='MAIN' then
      v_expected_keys:=array_append(v_expected_keys,v_page||':MAIN');
    elsif v_side_mode='SYNC' then
      v_expected_keys:=array_append(v_expected_keys,v_page||':SHARED');
    else
      v_expected_keys:=array_append(v_expected_keys,v_page||':LEFT');
      if 'RIGHT'=any(v_slots) then
        v_expected_keys:=array_append(v_expected_keys,v_page||':RIGHT');
      end if;
    end if;
  end loop;

  for v_variant in select value from jsonb_array_elements(v_variants) loop
    if jsonb_typeof(v_variant)<>'object' then
      return jsonb_build_object('ok',false,'code','BANNER_EVENT_VARIANT_INVALID');
    end if;
    v_page:=upper(btrim(coalesce(v_variant->>'pageCode','')));
    v_role:=upper(btrim(coalesce(v_variant->>'eventRole','')));
    v_actual_keys:=array_append(v_actual_keys,v_page||':'||v_role);
  end loop;
  if cardinality(v_actual_keys)<>cardinality(v_expected_keys)
     or not (v_actual_keys @> v_expected_keys and v_expected_keys @> v_actual_keys) then
    return jsonb_build_object(
      'ok',false,'code','BANNER_EVENT_TARGET_VARIANTS_MISMATCH',
      'expectedTargets',to_jsonb(v_expected_keys)
    );
  end if;

  v_result:=public.kinojo_banner_event_save_v402(
    p_session_token,p_event_group_id,p_payload
  );
  if coalesce((v_result->>'ok')::boolean,false) is not true then
    raise exception using errcode='P0001',message=v_result::text;
  end if;
  v_group_id:=(v_result->>'eventGroupId')::uuid;

  -- v391/v402 are upsert-oriented and leave omitted variants behind.  The
  -- explicit v404 target set is authoritative, so editable omitted variants
  -- are removed together with their cascade-owned items.
  delete from public.kinojo_banner_campaigns c
   where c.event_group_id=v_group_id
     and not ((c.page_code||':'||c.event_role)=any(v_expected_keys));

  update private.kinojo_banner_event_groups_v391
     set target_pages=v_targets,target_page_contract_version=404,
         updated_by_member_id=v_member,updated_at=clock_timestamp()
   where event_group_id=v_group_id;

  return jsonb_build_object(
    'ok',true,'apiVersion','404','contract','banner-event-save-v404',
    'eventGroupId',v_group_id,
    'savedCampaignIds',coalesce(v_result->'savedCampaignIds','[]'::jsonb),
    'event',private.kinojo_banner_event_json_v404(v_group_id)
  );
exception
  when sqlstate 'P0001' then
    declare
      v_error text:=sqlerrm;
    begin
      begin
        return coalesce(nullif(v_error,'')::jsonb,
          jsonb_build_object('ok',false,'code','BANNER_EVENT_SAVE_FAILED'));
      exception when others then
        return jsonb_build_object(
          'ok',false,'code',coalesce(nullif(v_error,''),'BANNER_EVENT_SAVE_FAILED')
        );
      end;
    end;
  when unique_violation then
    return jsonb_build_object('ok',false,'code','BANNER_EVENT_TARGET_CONFLICT');
  when check_violation then
    return jsonb_build_object('ok',false,'code','BANNER_EVENT_VALIDATION_FAILED');
end;
$function$;

create or replace function public.kinojo_banner_event_publish_v404(
  p_session_token text,
  p_event_group_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_gate jsonb;
  v_result jsonb;
  v_targets text[];
begin
  v_gate:=private.kinojo_banner_require_master_v384(p_session_token);
  if coalesce((v_gate->>'ok')::boolean,false) is not true then return v_gate; end if;
  select target_pages into v_targets
  from private.kinojo_banner_event_groups_v391
  where event_group_id=p_event_group_id;
  if not found then
    return jsonb_build_object('ok',false,'code','BANNER_EVENT_NOT_FOUND');
  end if;
  if cardinality(v_targets)=0 then
    return jsonb_build_object('ok',false,'code','BANNER_EVENT_TARGET_PAGES_REQUIRED');
  end if;
  v_result:=public.kinojo_banner_event_publish_v402(
    p_session_token,p_event_group_id
  );
  if coalesce((v_result->>'ok')::boolean,false) is not true then return v_result; end if;
  return v_result || jsonb_build_object(
    'apiVersion','404','contract','banner-event-publish-v404',
    'event',private.kinojo_banner_event_json_v404(p_event_group_id)
  );
end;
$function$;

revoke all on function private.kinojo_banner_event_json_v404(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.kinojo_banner_event_targets_v404(text)
  from public, anon, authenticated;
revoke all on function public.kinojo_banner_event_list_v404(text,boolean)
  from public, anon, authenticated;
revoke all on function public.kinojo_banner_event_save_v404(text,uuid,jsonb)
  from public, anon, authenticated;
revoke all on function public.kinojo_banner_event_publish_v404(text,uuid)
  from public, anon, authenticated;

grant execute on function public.kinojo_banner_event_targets_v404(text)
  to service_role;
grant execute on function public.kinojo_banner_event_list_v404(text,boolean)
  to service_role;
grant execute on function public.kinojo_banner_event_save_v404(text,uuid,jsonb)
  to service_role;
grant execute on function public.kinojo_banner_event_publish_v404(text,uuid)
  to service_role;

comment on column private.kinojo_banner_event_groups_v391.target_pages is
  'DB404 exact supported page IDs selected when this event draft was saved.';
comment on column private.kinojo_banner_event_groups_v391.target_page_contract_version is
  'DB404 target-page contract version used to validate and persist target_pages.';
comment on function public.kinojo_banner_event_targets_v404(text) is
  'MASTER-only DB404 source of truth for MAIN locked target and selectable SIDE pages.';
comment on function public.kinojo_banner_event_save_v404(text,uuid,jsonb) is
  'DB404 saves an explicit page set, supports zero-page SIDE drafts, and removes omitted editable variants.';
