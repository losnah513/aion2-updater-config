-- Queue worker prefixes the preserved source; accept the two exact trusted forms.
-- All fresh payload, identity, legion and eligibility guards remain unchanged.
begin;
CREATE OR REPLACE FUNCTION private.kinojo_db_only_list_restore_allowed(p_target_id bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
 select coalesce(bool_or(
 t.target_source in ('server:db_only_restore_v1','server_queue:server:db_only_restore_v1') and t.target_status='lookup_done'
 and p.master_sync_status='synced' and cm.latest_payload_id=p.id
 and nullif(btrim(cm.char_key),'') is not null and p.char_key=cm.char_key
 and p.server_id=cm.server_id
 and public.kinojo_character_identity_key_v298(p.character_name)=public.kinojo_character_identity_key_v298(cm.character_name)
 and cm.last_lookup_success_at>=t.queued_at
 and cm.legion_source_snapshot_id=t.snapshot_id and cm.legion_updated_at>=t.queued_at
 and cm.server_id=2002 and cm.legion_name='깡'
 and (private.kinojo_character_lookup_policy(cm.id)->>'eligible')::boolean
 ),false)
 from public.lookup_session_targets t
 join public.extension_character_payloads p on p.id=t.payload_id and p.session_id=t.session_id
 join public.character_master cm on cm.server_id=t.server_id
 and public.kinojo_character_identity_key_v298(cm.character_name)=public.kinojo_character_identity_key_v298(t.character_name)
 where t.id=p_target_id;
$function$
;
commit;

