begin;
set local lock_timeout='2s';
drop index if exists public.idx_extension_payloads_identity_latest;
commit;
