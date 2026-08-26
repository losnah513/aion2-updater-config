-- Banner redesign phase 2 stage 5: make sticker-library display names unique
-- across ready and archived assets so concurrent uploads cannot create an
-- ambiguous reusable item. Existing object-path uniqueness remains intact.

create unique index if not exists kinojo_banner_overlay_assets_name_v405_uidx
  on public.kinojo_banner_overlay_assets (lower(btrim(display_name)));

create or replace function public.kinojo_banner_overlay_asset_register_v405(
  p_session_token text,
  p_object_path text,
  p_mime_type text,
  p_size_bytes bigint,
  p_width integer,
  p_height integer,
  p_asset_kind text,
  p_display_name text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_gate jsonb;
  v_kind text := upper(btrim(coalesce(p_asset_kind,'')));
  v_name text := btrim(coalesce(p_display_name,''));
  v_asset public.kinojo_banner_overlay_assets;
begin
  v_gate := private.kinojo_banner_require_master_v384(p_session_token);
  if coalesce((v_gate->>'ok')::boolean,false) is not true then return v_gate; end if;
  if v_kind not in ('EMOTICON','STICKER','BADGE') then
    return jsonb_build_object('ok',false,'code','BANNER_OVERLAY_KIND_INVALID');
  end if;
  if char_length(v_name) not between 1 and 80 then
    return jsonb_build_object('ok',false,'code','BANNER_OVERLAY_NAME_INVALID');
  end if;
  if exists (
    select 1
    from public.kinojo_banner_overlay_assets a
    where lower(btrim(a.display_name))=lower(v_name)
  ) then
    return jsonb_build_object('ok',false,'code','BANNER_OVERLAY_NAME_DUPLICATE');
  end if;
  insert into public.kinojo_banner_overlay_assets(
    asset_kind,display_name,object_path,mime_type,size_bytes,width,height,
    created_by_member_id
  ) values (
    v_kind,v_name,p_object_path,lower(p_mime_type),p_size_bytes,p_width,p_height,
    (v_gate->>'memberId')::bigint
  ) returning * into v_asset;
  return jsonb_build_object(
    'ok',true,'apiVersion','405','contract','banner-overlay-asset-register-v405',
    'asset',private.kinojo_banner_overlay_asset_json_v396(v_asset)
  );
exception
  when unique_violation then return jsonb_build_object('ok',false,'code','BANNER_OVERLAY_NAME_DUPLICATE');
  when check_violation then return jsonb_build_object('ok',false,'code','BANNER_OVERLAY_ASSET_INVALID');
end;
$function$;

revoke all on function public.kinojo_banner_overlay_asset_register_v405(
  text,text,text,bigint,integer,integer,text,text
) from public, anon, authenticated;
grant execute on function public.kinojo_banner_overlay_asset_register_v405(
  text,text,text,bigint,integer,integer,text,text
) to service_role;

comment on function public.kinojo_banner_overlay_asset_register_v405(
  text,text,text,bigint,integer,integer,text,text
) is 'MASTER-only reusable banner sticker registration with case-insensitive display-name uniqueness.';
