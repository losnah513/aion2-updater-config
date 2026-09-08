-- Existing banner Edge + DB module: same MASTER caller, Storage and request lifecycle.
-- No operational assets are changed by this migration.
create or replace function private.kinojo_banner_asset_ref_count_v384(p_asset_id bigint)
returns bigint language sql stable security definer
set search_path=pg_catalog,public,private as $$
  select (select count(*) from public.kinojo_banner_campaign_items where asset_id=p_asset_id)
       + (select count(*) from public.kinojo_banner_auto_pool_assets_v407 where asset_id=p_asset_id)
       + (select count(*) from public.kinojo_banner_auto_pool_composites_v407 where asset_id=p_asset_id)
       + (select count(*) from public.kinojo_banner_asset_representatives_v407 where asset_id=p_asset_id);
$$;

create or replace function public.kinojo_banner_asset_format_set_v475(
  p_session_token text,p_asset_id bigint,p_format_code text,p_expected_format_code text
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,private as $$
declare v_gate jsonb; v_asset public.kinojo_banner_assets; v_refs bigint;
begin
  v_gate:=private.kinojo_banner_require_master_v384(p_session_token);
  if coalesce((v_gate->>'ok')::boolean,false) is not true then return v_gate; end if;
  if p_format_code is null or p_format_code not in ('MAIN_16_9','SIDE_300_715') then
    return jsonb_build_object('ok',false,'code','BANNER_ASSET_FORMAT_INVALID');
  end if;
  select * into v_asset from public.kinojo_banner_assets where asset_id=p_asset_id for update;
  if not found then return jsonb_build_object('ok',false,'code','BANNER_ASSET_NOT_FOUND'); end if;
  if v_asset.source_type<>'STORAGE' or v_asset.status<>'READY' or v_asset.delete_token is not null then
    return jsonb_build_object('ok',false,'code','BANNER_ASSET_NOT_EDITABLE');
  end if;
  if v_asset.format_code is distinct from p_expected_format_code then
    return jsonb_build_object('ok',false,'code','BANNER_ASSET_FORMAT_STALE');
  end if;
  v_refs:=private.kinojo_banner_asset_ref_count_v384(p_asset_id);
  if v_refs>0 then return jsonb_build_object('ok',false,'code','BANNER_ASSET_STILL_REFERENCED','referenceCount',v_refs); end if;
  update public.kinojo_banner_assets set format_code=p_format_code,
    updated_by_member_id=(v_gate->>'memberId')::bigint,updated_at=clock_timestamp()
    where asset_id=p_asset_id returning * into v_asset;
  return jsonb_build_object('ok',true,'asset',private.kinojo_banner_asset_json_v407(v_asset));
end;
$$;
revoke all on function public.kinojo_banner_asset_format_set_v475(text,bigint,text,text) from public,anon,authenticated;
grant execute on function public.kinojo_banner_asset_format_set_v475(text,bigint,text,text) to service_role;
revoke all on function private.kinojo_banner_asset_ref_count_v384(bigint) from public,anon,authenticated;
