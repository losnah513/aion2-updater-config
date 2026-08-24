-- Banner redesign stage 4: replace the ambiguous event priority control with
-- deterministic exposure-frequency presets. Existing legacy campaigns remain
-- BASE frequency even if they used another historical priority value.

create or replace function private.kinojo_banner_manifest_internal_v395(
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
  v_base jsonb;
  v_playlist jsonb := '[]'::jsonb;
  v_has_half boolean := false;
  v_scale integer := 1;
  v_manifest_version text;
begin
  v_base := private.kinojo_banner_manifest_internal_v394(
    p_page_code,p_slot_code,p_now
  );
  if coalesce((v_base->>'ok')::boolean,false) is not true then
    return v_base;
  end if;

  select coalesce(bool_or(
    c.event_group_id is not null and c.priority=150
  ),false) into v_has_half
  from jsonb_array_elements(coalesce(v_base->'playlist','[]'::jsonb)) p(item)
  join public.kinojo_banner_campaigns c
    on c.campaign_id=(p.item->>'campaignId')::bigint;

  -- A half-step requires a denominator of two: BASE=2, x1.5=3, x2=4.
  -- Without x1.5 in the active set the smaller equivalent BASE=1, x2=2 is used.
  v_scale := case when v_has_half then 2 else 1 end;

  select coalesce(jsonb_agg(expanded.item order by expanded.ticket,expanded.ordinality),'[]'::jsonb)
    into v_playlist
  from (
    select p.item,p.ordinality,ticket
    from jsonb_array_elements(coalesce(v_base->'playlist','[]'::jsonb))
      with ordinality p(item,ordinality)
    join public.kinojo_banner_campaigns c
      on c.campaign_id=(p.item->>'campaignId')::bigint
    cross join lateral generate_series(
      1,
      case
        when c.event_group_id is null then v_scale
        when v_scale=2 and c.priority=150 then 3
        when v_scale=2 and c.priority=200 then 4
        when v_scale=2 then 2
        when c.priority=200 then 2
        else 1
      end
    ) ticket
  ) expanded;

  v_manifest_version := 'bm395-'||substr(md5(
    coalesce(v_base->>'manifestVersion','')||'|'||v_playlist::text
  ),1,24);

  return v_base || jsonb_build_object(
    'apiVersion','395',
    'contract','banner-manifest-internal-v395',
    'manifestVersion',v_manifest_version,
    'exposureFrequencyMode','BASE_X1_5_X2',
    'playlist',v_playlist
  );
end;
$function$;

create or replace function public.kinojo_banner_manifest_v395(
  p_page_code text,
  p_slot_code text
) returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
  select private.kinojo_banner_manifest_internal_v395(
    p_page_code,p_slot_code,statement_timestamp()
  );
$function$;

revoke all on function private.kinojo_banner_manifest_internal_v395(text,text,timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function public.kinojo_banner_manifest_v395(text,text)
  from public, anon, authenticated;
grant execute on function public.kinojo_banner_manifest_v395(text,text)
  to service_role;

comment on function public.kinojo_banner_manifest_v395(text,text) is
  'ALL_ACTIVE banner manifest with event-group exposure frequency presets: priority 100=BASE, 150=x1.5, 200=x2.0. Legacy campaigns remain BASE.';
