-- Reusable overlay assets and flattened event composites share the public
-- banner bucket with source assets. Exclude every registered path from the
-- MASTER orphan cleanup candidate list.

create or replace function public.kinojo_banner_orphan_candidates_v396(
  p_session_token text,
  p_older_than_hours integer default 24,
  p_limit integer default 100
) returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, storage
as $function$
declare
  v_gate jsonb;
  v_items jsonb;
  v_hours integer;
  v_limit integer;
begin
  v_gate:=private.kinojo_banner_require_master_v384(p_session_token);
  if coalesce((v_gate->>'ok')::boolean,false) is not true then return v_gate; end if;
  v_hours:=greatest(3,least(coalesce(p_older_than_hours,24),168));
  v_limit:=greatest(1,least(coalesce(p_limit,100),500));

  select coalesce(jsonb_agg(jsonb_build_object(
    'objectPath',x.name,'createdAt',x.created_at,'updatedAt',x.updated_at
  ) order by x.created_at),'[]'::jsonb) into v_items
  from (
    select o.name,o.created_at,o.updated_at
    from storage.objects o
    left join public.kinojo_banner_assets a on a.object_path=o.name
    left join public.kinojo_banner_overlay_assets overlay_asset
      on overlay_asset.object_path=o.name
    left join public.kinojo_banner_campaign_items item
      on item.composite_object_path=o.name
    where o.bucket_id='kinojo-site-banners'
      and a.asset_id is null
      and overlay_asset.overlay_asset_id is null
      and item.item_id is null
      and o.created_at < clock_timestamp() - make_interval(hours=>v_hours)
    order by o.created_at
    limit v_limit
  ) x;

  return jsonb_build_object(
    'ok',true,'apiVersion','396','contract','banner-orphan-candidates-v396',
    'olderThanHours',v_hours,'items',v_items
  );
end;
$function$;

revoke all on function public.kinojo_banner_orphan_candidates_v396(text,integer,integer)
  from public, anon, authenticated;
grant execute on function public.kinojo_banner_orphan_candidates_v396(text,integer,integer)
  to service_role;

comment on function public.kinojo_banner_orphan_candidates_v396(text,integer,integer) is
  'MASTER orphan scan excluding source assets, reusable overlay assets, and flattened event composites.';
