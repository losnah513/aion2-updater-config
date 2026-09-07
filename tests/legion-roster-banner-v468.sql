-- Read-only production contract verification. No events/campaigns are created.
select
  private.kinojo_banner_manifest_target_valid_v387('LEGION_ROSTER','LEFT')
  and private.kinojo_banner_manifest_target_valid_v387('LEGION_ROSTER','RIGHT')
  and not private.kinojo_banner_manifest_target_valid_v387('LEGION_ROSTER','MAIN') as manifest_targets_ok,
  private.kinojo_banner_campaign_target_valid_v386('SIDE','LEGION_ROSTER',array['LEFT','RIGHT'])
  and not private.kinojo_banner_campaign_target_valid_v386('MAIN','LEGION_ROSTER',array['MAIN'])
  and not private.kinojo_banner_campaign_target_valid_v386('SIDE','LEGION_ROSTER',array['LEFT','LEFT']) as campaign_targets_ok,
  private.kinojo_banner_target_pages_valid_v404(array['LEGION_ROSTER'])
  and private.kinojo_banner_target_pages_valid_v404(private.kinojo_banner_supported_page_codes_v404()) as event_targets_ok,
  private.kinojo_banner_target_page_contract_v404()->'sidePages' @>
    '[{"pageCode":"LEGION_ROSTER","label":"레기온 명부","slotCodes":["LEFT","RIGHT"]}]'::jsonb as admin_catalog_ok,
  not has_function_privilege('anon','private.kinojo_banner_supported_page_codes_v404()','execute')
  and not has_function_privilege('authenticated','private.kinojo_banner_campaign_save_v386(text,bigint,jsonb)','execute') as private_acl_ok;
select slot, result->>'ok' as ok, result->>'code' as code,
  result->>'active' as active, result->>'reason' as reason
from (select slot,public.kinojo_banner_manifest_v409('LEGION_ROSTER',slot) result
      from unnest(array['LEFT','RIGHT']) slot) s;
