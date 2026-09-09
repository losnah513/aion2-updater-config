begin;
revoke select(automation_key,running,active_session_id),update(last_message) on public.kinojo_server_automation_settings from service_role;
revoke select(session_id,tool_name,client_id,status),update(message) on public.updater_sessions from service_role;
revoke select on private.sanctuary_management_schedule_versions_v437 from service_role;
revoke maintain on public.lookup_snapshots,private.sanctuary_management_schedule_versions_v437 from service_role;
-- Restore maintenance Edge v1 first; preserve all observations and lifecycle history.
revoke execute on function public.kinojo_character_activity_claim(text,text), public.kinojo_character_activity_complete(text,text,bigint,uuid,jsonb,text) from service_role;
create or replace function private.kinojo_character_activity_evidence(p_character_id bigint,p_at timestamptz)
returns boolean language sql stable security invoker set search_path=pg_catalog,public,private as $fn$
 select exists(select 1 from public.character_master c
 join public.lookup_snapshots s on s.id=c.legion_source_snapshot_id
 where c.id=p_character_id and c.last_lookup_success_at is not null
 and c.last_lookup_success_at<=p_at and c.legion_updated_at<=p_at
 and c.legion_updated_at>=c.last_lookup_success_at
 and (c.last_lookup_failed_at is null or c.last_lookup_failed_at<=c.last_lookup_success_at)
 and s.status='OK' and s.server_id=c.server_id
 and lower(regexp_replace(s.character_name,'\s','','g'))=lower(regexp_replace(c.character_name,'\s','','g'))
 and jsonb_typeof(s.raw_payload#>'{officialRaw,info,profile,regionName}')='string'
 and s.raw_payload#>>'{officialRaw,info,profile,regionName}'=coalesce(c.legion_name,'')
 and s.raw_payload#>>'{officialRaw,info,profile,serverId}'=c.server_id::text
 and lower(regexp_replace(s.raw_payload#>>'{officialRaw,info,profile,characterName}','\s','','g'))=lower(regexp_replace(c.character_name,'\s','','g')));
$fn$;


commit;
