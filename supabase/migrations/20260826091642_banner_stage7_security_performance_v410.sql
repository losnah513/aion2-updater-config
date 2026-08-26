-- Phase 2 / Stage 7 closeout hardening.
-- Keep the superseded v407 manifest behind the Edge boundary and cover the
-- asset-side foreign keys used by library/pool replacement and cleanup paths.

revoke execute on function public.kinojo_banner_manifest_v407(text, text) from public, anon, authenticated;
grant execute on function public.kinojo_banner_manifest_v407(text, text) to service_role;

create index if not exists kinojo_banner_auto_pool_assets_asset_v410_idx
  on public.kinojo_banner_auto_pool_assets_v407 (asset_id);

create index if not exists kinojo_banner_auto_pool_composites_asset_v410_idx
  on public.kinojo_banner_auto_pool_composites_v407 (asset_id);
