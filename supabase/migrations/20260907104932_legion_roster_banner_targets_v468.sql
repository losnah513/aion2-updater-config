-- DB468: add Legion Roster to existing SIDE manifest, campaign and event contracts.
-- Saved event target_pages stay explicit; no campaign or event data is expanded.

create or replace function private.kinojo_banner_manifest_target_valid_v387(
  p_page text,
  p_slot text
) returns boolean
language sql
immutable
security invoker
set search_path = pg_catalog
as $function$
  select case
    when p_page='HOME' then p_slot in ('MAIN','LEFT','RIGHT')
    when p_page in (
      'HOF','RANKING','LEGION_TREE','LEGION_ROSTER','METER','SANCTUARY','SANCTUARY_SCHEDULE'
    ) then p_slot in ('LEFT','RIGHT')
    else false
  end;
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
    when 'HOME' then array['LEFT','RIGHT']::text[]
    when 'HOF' then array['LEFT','RIGHT']::text[]
    when 'RANKING' then array['LEFT','RIGHT']::text[]
    when 'LEGION_TREE' then array['LEFT','RIGHT']::text[]
    when 'LEGION_ROSTER' then array['LEFT','RIGHT']::text[]
    when 'METER' then array['LEFT','RIGHT']::text[]
    when 'SANCTUARY' then array['LEFT','RIGHT']::text[]
    when 'SANCTUARY_SCHEDULE' then array['LEFT','RIGHT']::text[]
    else '{}'::text[]
  end;
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
      jsonb_build_object('pageCode','HOF','label','명예의 전당','slotCodes',jsonb_build_array('LEFT','RIGHT'),'sortOrder',2),
      jsonb_build_object('pageCode','RANKING','label','레기온 순위','slotCodes',jsonb_build_array('LEFT','RIGHT'),'sortOrder',3),
      jsonb_build_object('pageCode','LEGION_TREE','label','레기온 트리','slotCodes',jsonb_build_array('LEFT','RIGHT'),'sortOrder',4),
      jsonb_build_object('pageCode','METER','label','키노조 미터','slotCodes',jsonb_build_array('LEFT','RIGHT'),'sortOrder',5),
      jsonb_build_object('pageCode','SANCTUARY','label','성역 메인','slotCodes',jsonb_build_array('LEFT','RIGHT'),'sortOrder',6),
      jsonb_build_object('pageCode','SANCTUARY_SCHEDULE','label','성역 스케줄','slotCodes',jsonb_build_array('LEFT','RIGHT'),'sortOrder',7),
      jsonb_build_object('pageCode','LEGION_ROSTER','label','레기온 명부','slotCodes',jsonb_build_array('LEFT','RIGHT'),'sortOrder',8)
    )
  );
$function$;

revoke all on function private.kinojo_banner_manifest_target_valid_v387(text,text)
  from public, anon, authenticated, service_role;
revoke all on function private.kinojo_banner_supported_page_slots_v404(text)
  from public, anon, authenticated, service_role;
revoke all on function private.kinojo_banner_target_page_contract_v404()
  from public, anon, authenticated, service_role;

comment on function private.kinojo_banner_manifest_target_valid_v387(text,text) is
  'DB468 public Manifest target validation: HOF and all PC SIDE pages accept LEFT and RIGHT.';
comment on function private.kinojo_banner_supported_page_slots_v404(text) is
  'DB468 formal-event slot capability patch: every supported PC SIDE page accepts LEFT and RIGHT.';
comment on function private.kinojo_banner_target_page_contract_v404() is
  'DB468 event-targets capability patch: HOF advertises LEFT and RIGHT without changing saved target page sets.';


create or replace function private.kinojo_banner_campaign_target_valid_v386(
  p_type text,
  p_page text,
  p_slots text[]
) returns boolean
language sql
immutable
security invoker
set search_path = pg_catalog
as $function$
  select case
    when p_type='MAIN' then
      p_page='HOME' and p_slots=array['MAIN']::text[]
    when p_type='SIDE' and p_page in (
      'HOME','HOF','RANKING','LEGION_TREE','LEGION_ROSTER','METER','SANCTUARY','SANCTUARY_SCHEDULE'
    ) then
      cardinality(p_slots) between 1 and 2
      and p_slots <@ array['LEFT','RIGHT']::text[]
      and cardinality(p_slots)=cardinality(
        array(select distinct s from unnest(p_slots) s)
      )
    else false
  end;
$function$;

revoke all on function private.kinojo_banner_campaign_target_valid_v386(
  text,text,text[]
) from public, anon, authenticated, service_role;

comment on function private.kinojo_banner_campaign_target_valid_v386(
  text,text,text[]
) is
  'DB468 shared campaign target validation: every supported PC SIDE page, including HOF, accepts unique LEFT/RIGHT subsets.';

create or replace function private.kinojo_banner_supported_page_codes_v404()
returns text[] language sql immutable security invoker
set search_path = pg_catalog, private
as $function$
  select array['HOME','HOF','RANKING','LEGION_TREE','METER','SANCTUARY','SANCTUARY_SCHEDULE','LEGION_ROSTER']::text[];
$function$;
revoke all on function private.kinojo_banner_supported_page_codes_v404() from public, anon, authenticated, service_role;

alter table public.kinojo_banner_campaigns drop constraint kinojo_banner_page_v386_chk;
alter table public.kinojo_banner_campaigns add constraint kinojo_banner_page_v386_chk
  check (page_code = any(private.kinojo_banner_supported_page_codes_v404()));
alter table public.kinojo_banner_auto_pools_v407 drop constraint kinojo_banner_auto_pool_target_pages_v407_chk;
alter table public.kinojo_banner_auto_pools_v407 add constraint kinojo_banner_auto_pool_target_pages_v407_chk
  check (cardinality(target_pages) between 1 and cardinality(private.kinojo_banner_supported_page_codes_v404()));
CREATE OR REPLACE FUNCTION private.kinojo_banner_campaign_save_v386(p_session_token text, p_campaign_id bigint, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_gate jsonb; v_member bigint; v_c public.kinojo_banner_campaigns; v_new boolean := p_campaign_id is null;
  v_name text; v_type text; v_page text; v_slots text[]; v_priority int; v_sm text;
  v_start timestamptz; v_end timestamptz; v_weekdays smallint[]; v_dates date[];
  v_slide int; v_transition int; v_items_result jsonb; v_replace_items boolean;
begin
  v_gate := private.kinojo_banner_require_master_v384(p_session_token);
  if coalesce((v_gate->>'ok')::boolean,false) is not true then return v_gate; end if;
  v_member := (v_gate->>'memberId')::bigint;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' then return jsonb_build_object('ok',false,'code','BANNER_CAMPAIGN_PAYLOAD_INVALID'); end if;

  if not v_new then
    select * into v_c from public.kinojo_banner_campaigns where campaign_id=p_campaign_id for update;
    if not found then return jsonb_build_object('ok',false,'code','BANNER_CAMPAIGN_NOT_FOUND'); end if;
    if v_c.status='ARCHIVED' then return jsonb_build_object('ok',false,'code','BANNER_CAMPAIGN_ARCHIVED'); end if;
    if v_c.status='PUBLISHED' then return jsonb_build_object('ok',false,'code','BANNER_CAMPAIGN_PAUSE_REQUIRED'); end if;
  end if;

  v_name := btrim(coalesce(p_payload->>'name',case when v_new then null else v_c.campaign_name end));
  v_type := upper(btrim(coalesce(p_payload->>'type',case when v_new then null else v_c.campaign_type end)));
  v_page := upper(btrim(coalesce(p_payload->>'pageCode',case when v_new then null else v_c.page_code end)));
  v_slots := case when p_payload ? 'slotCodes' then private.kinojo_banner_text_array_v386(p_payload->'slotCodes') else case when v_new then '{}'::text[] else v_c.slot_codes end end;
  if v_name is null or char_length(v_name) not between 1 and 120 then return jsonb_build_object('ok',false,'code','BANNER_CAMPAIGN_NAME_INVALID'); end if;
  if v_type not in ('MAIN','SIDE') then return jsonb_build_object('ok',false,'code','BANNER_CAMPAIGN_TYPE_INVALID'); end if;
  if v_page <> all(private.kinojo_banner_supported_page_codes_v404()) then return jsonb_build_object('ok',false,'code','BANNER_CAMPAIGN_PAGE_INVALID'); end if;
  if not private.kinojo_banner_campaign_target_valid_v386(v_type,v_page,v_slots) then return jsonb_build_object('ok',false,'code','BANNER_CAMPAIGN_TARGET_INVALID'); end if;

  begin v_priority := coalesce(nullif(p_payload->>'priority','')::int,case when v_new then 100 else v_c.priority end); exception when others then return jsonb_build_object('ok',false,'code','BANNER_CAMPAIGN_PRIORITY_INVALID'); end;
  if v_priority not between 0 and 10000 then return jsonb_build_object('ok',false,'code','BANNER_CAMPAIGN_PRIORITY_INVALID'); end if;
  v_sm := upper(coalesce(nullif(btrim(p_payload->>'scheduleMode'),''),case when v_new then 'ALWAYS' else v_c.schedule_mode end));
  if v_sm not in ('ALWAYS','SCHEDULED') then return jsonb_build_object('ok',false,'code','BANNER_CAMPAIGN_SCHEDULE_MODE_INVALID'); end if;
  begin
    if v_sm='ALWAYS' then v_start:=null; v_end:=null; v_weekdays:='{}'::smallint[]; v_dates:='{}'::date[];
    else
      v_start := case when p_payload ? 'startsAtKst' then private.kinojo_banner_parse_kst_v386(p_payload->>'startsAtKst') else case when v_new then null else v_c.starts_at end end;
      v_end := case when p_payload ? 'endsAtKst' then private.kinojo_banner_parse_kst_v386(p_payload->>'endsAtKst') else case when v_new then null else v_c.ends_at end end;
      v_weekdays := case when p_payload ? 'weekdays' then private.kinojo_banner_int_array_v386(p_payload->'weekdays') else case when v_new then '{}'::smallint[] else v_c.weekdays end end;
      v_dates := case when p_payload ? 'specificDates' then private.kinojo_banner_date_array_v386(p_payload->'specificDates') else case when v_new then '{}'::date[] else v_c.specific_dates end end;
    end if;
  exception when others then return jsonb_build_object('ok',false,'code',sqlerrm); end;
  if v_end is not null and v_start is not null and v_end <= v_start then return jsonb_build_object('ok',false,'code','BANNER_CAMPAIGN_SCHEDULE_RANGE_INVALID'); end if;
  begin v_slide := coalesce(nullif(p_payload->>'slideIntervalMs','')::int,case when v_new then 8000 else v_c.slide_interval_ms end); exception when others then return jsonb_build_object('ok',false,'code','BANNER_CAMPAIGN_SLIDE_INTERVAL_INVALID'); end;
  begin v_transition := coalesce(nullif(p_payload->>'transitionDurationMs','')::int,case when v_new then 600 else v_c.transition_duration_ms end); exception when others then return jsonb_build_object('ok',false,'code','BANNER_CAMPAIGN_TRANSITION_INVALID'); end;
  if v_slide not between 3000 and 60000 then return jsonb_build_object('ok',false,'code','BANNER_CAMPAIGN_SLIDE_INTERVAL_INVALID'); end if;
  if v_transition not between 0 and 5000 then return jsonb_build_object('ok',false,'code','BANNER_CAMPAIGN_TRANSITION_INVALID'); end if;

  if v_new then
    insert into public.kinojo_banner_campaigns(campaign_name,campaign_type,page_code,slot_codes,status,priority,schedule_mode,starts_at,ends_at,weekdays,specific_dates,slide_interval_ms,transition_duration_ms,created_by_member_id,updated_by_member_id)
    values(v_name,v_type,v_page,v_slots,'DRAFT',v_priority,v_sm,v_start,v_end,v_weekdays,v_dates,v_slide,v_transition,v_member,v_member)
    returning * into v_c;
  else
    update public.kinojo_banner_campaigns set campaign_name=v_name,campaign_type=v_type,page_code=v_page,slot_codes=v_slots,priority=v_priority,schedule_mode=v_sm,starts_at=v_start,ends_at=v_end,weekdays=v_weekdays,specific_dates=v_dates,slide_interval_ms=v_slide,transition_duration_ms=v_transition,updated_by_member_id=v_member,updated_at=clock_timestamp()
    where campaign_id=p_campaign_id returning * into v_c;
  end if;

  v_replace_items := p_payload ? 'items';
  v_items_result := private.kinojo_banner_campaign_validate_items_v386(v_c.campaign_id,v_type,p_payload->'items',v_replace_items or v_new);
  if coalesce((v_items_result->>'ok')::boolean,false) is not true then raise exception using errcode='P0001', message=v_items_result::text; end if;
  select * into v_c from public.kinojo_banner_campaigns where campaign_id=v_c.campaign_id;
  return jsonb_build_object('ok',true,'apiVersion','386','contract',case when v_new then 'banner-campaign-create-v386' else 'banner-campaign-update-v386' end,'campaign',private.kinojo_banner_campaign_json_v386(v_c));
exception
  when sqlstate 'P0001' then return coalesce(nullif(sqlerrm,'')::jsonb,jsonb_build_object('ok',false,'code','BANNER_CAMPAIGN_ITEMS_INVALID'));
  when unique_violation then return jsonb_build_object('ok',false,'code','BANNER_CAMPAIGN_CONFLICT');
  when check_violation then return jsonb_build_object('ok',false,'code','BANNER_CAMPAIGN_VALIDATION_FAILED');
end;
$function$

