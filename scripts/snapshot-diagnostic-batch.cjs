const historical=require('./historical-snapshot-batch.cjs');
module.exports=function(rows,batch){
 return historical(rows,batch)
  .replaceAll('kinojo_snapshot_text_candidates_v504','kinojo_snapshot_diagnostic_candidates_v508')
  .replaceAll('HISTORICAL_','DIAGNOSTIC_')
  .replace('raw_payload=private.kinojo_snapshot_text_v504(s.raw_payload),retained_parser_stats_v504=jsonb_build_object',"raw_payload=case when s.retained_parser_stats_v504 is null then private.kinojo_snapshot_text_v504(s.raw_payload) else s.raw_payload end,retained_parser_stats_v504=private.kinojo_snapshot_diagnostic_cache_v508(coalesce(s.retained_parser_stats_v504,jsonb_build_object")
  .replace('s.character_name,null)) FROM approved_historical_rows','s.character_name,null)))) FROM approved_historical_rows');
};
