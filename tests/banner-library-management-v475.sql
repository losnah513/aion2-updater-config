-- Read-only operational contract checks; no fake sessions or asset writes.
begin read only;
do $$
begin
  assert not has_function_privilege('anon','public.kinojo_banner_asset_format_set_v475(text,bigint,text,text)','execute');
  assert not has_function_privilege('authenticated','public.kinojo_banner_asset_format_set_v475(text,bigint,text,text)','execute');
  assert has_function_privilege('service_role','public.kinojo_banner_asset_format_set_v475(text,bigint,text,text)','execute');
  assert coalesce((public.kinojo_banner_asset_format_set_v475(null,null,'SIDE_300_715','MAIN_16_9')->>'ok')::boolean,false)=false;
  assert not exists(select 1 from public.kinojo_banner_assets a where private.kinojo_banner_asset_ref_count_v384(a.asset_id) < (select count(*) from public.kinojo_banner_campaign_items i where i.asset_id=a.asset_id));
end $$;
rollback;
