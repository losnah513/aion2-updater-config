-- KINOJO banner HOF campaign target validator patch v441.
--
-- DB438 advertised HOF LEFT + RIGHT and DB440 removed the retired event-save
-- branches, but the shared campaign validator still accepted HOF LEFT only.
-- Keep MAIN behavior unchanged and validate every supported SIDE page against
-- the same unique LEFT/RIGHT subset contract.

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
      'HOME','HOF','RANKING','LEGION_TREE','METER','SANCTUARY','SANCTUARY_SCHEDULE'
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
  'DB441 shared campaign target validation: every supported PC SIDE page, including HOF, accepts unique LEFT/RIGHT subsets.';
