-- Code rollback leaves historical compact rows intact; full restoration needs the encrypted backup.
begin read write;
set local lock_timeout='2s';
drop trigger zz_kinojo_payload_compact_v500 on public.extension_character_payloads;
drop function private.kinojo_payload_compact_v500();
drop function private.kinojo_payload_raw_v500(jsonb);
commit;
