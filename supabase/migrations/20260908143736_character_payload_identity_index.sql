-- Existing precheck does three normalized-name latest-payload reads.
-- Preserve every identity/gear/stale-state condition; index only, no data rewrite.
begin;
set local lock_timeout='2s';
set local statement_timeout='60s';
create index if not exists idx_extension_payloads_identity_latest
 on public.extension_character_payloads
 (server_id,public.kinojo_identity_name_v285(character_name),received_at desc,id desc);
analyze public.extension_character_payloads;
commit;
