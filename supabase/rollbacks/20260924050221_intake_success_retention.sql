begin read write;
drop trigger payload_intake_success_v506 on public.extension_character_payloads;
drop trigger snapshot_intake_success_v506 on public.snapshot_intake_events;
drop function private.kinojo_intake_success_sync_v506();
drop function private.kinojo_intake_success_insert_v506();
drop function private.kinojo_intake_summary_v506(jsonb,bigint);
drop function private.kinojo_intake_synced_payload_v506(public.snapshot_intake_events);
-- Prior intake evidence trigger stays installed. Historical JSON restoration requires external backup.
commit;
