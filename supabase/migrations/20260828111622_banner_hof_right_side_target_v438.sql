-- KINOJO banner HOF two-sided target patch v438.
--
-- The public HOF page now renders the same LEFT + RIGHT 300x715 side-banner
-- pair as the other PC pages. Keep the established v387/v404 entry points so
-- existing manifests and event-save RPCs adopt the capability without a new
-- Edge action or an implicit expansion of saved target_pages.

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
      'HOF','RANKING','LEGION_TREE','METER','SANCTUARY','SANCTUARY_SCHEDULE'
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
      jsonb_build_object('pageCode','SANCTUARY_SCHEDULE','label','성역 스케줄','slotCodes',jsonb_build_array('LEFT','RIGHT'),'sortOrder',7)
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
  'DB438 public Manifest target validation: HOF and all PC SIDE pages accept LEFT and RIGHT.';
comment on function private.kinojo_banner_supported_page_slots_v404(text) is
  'DB438 formal-event slot capability patch: every supported PC SIDE page accepts LEFT and RIGHT.';
comment on function private.kinojo_banner_target_page_contract_v404() is
  'DB438 event-targets capability patch: HOF advertises LEFT and RIGHT without changing saved target page sets.';
