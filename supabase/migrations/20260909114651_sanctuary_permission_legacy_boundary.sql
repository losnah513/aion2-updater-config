-- Atomic Stage14 boundary. Requires v2 Edge/WEB deployment and full integration QA.
-- Do not apply independently: old Edge command/bootstrap/lease RPCs intentionally stop working.
begin;

create or replace function private.kinojo_sm_can_manage_team_v412(p_actor jsonb,p_team_id bigint)
returns boolean language sql stable security invoker set search_path='' as $$
 select coalesce((private.kinojo_sm_capabilities(nullif(p_actor->>'memberId','')::bigint,p_team_id)->>'canReadPrivate')::boolean,false);
$$;
revoke all on function private.kinojo_sm_can_manage_team_v412(jsonb,bigint) from public,anon,authenticated;

create function private.kinojo_sm_can_archive_team(p_actor jsonb,p_team_id bigint)
returns boolean language sql stable security invoker set search_path='' as $$
 select coalesce((private.kinojo_sm_capabilities(nullif(p_actor->>'memberId','')::bigint,p_team_id)->>'canArchive')::boolean,false);
$$;
revoke all on function private.kinojo_sm_can_archive_team(jsonb,bigint) from public,anon,authenticated;
do $$
declare v_source text;v_updated text;
begin
 v_source:=pg_get_functiondef('public.kinojo_sanctuary_management_archive_preview_v437(text,bigint)'::regprocedure);
 v_updated:=replace(v_source,'private.kinojo_sm_can_manage_team_v412','private.kinojo_sm_can_archive_team');
 if v_updated=v_source then raise exception 'Sanctuary archive preview permission boundary changed'; end if;
 execute v_updated;
end;
$$;

create function private.kinojo_sm_require_roster_scope(p_credential text,p_team_id bigint,p_balance boolean default false)
returns void language plpgsql security invoker set search_path='' as $$
declare v_actor jsonb;v_caps jsonb;
begin
 v_actor:=private.kinojo_sm_actor_v412(p_credential);
 v_caps:=private.kinojo_sm_capabilities(nullif(v_actor->>'memberId','')::bigint,p_team_id);
 perform private.kinojo_sm_assert_capability(v_caps,case when p_team_id is null then 'create' else 'roster' end);
 if p_balance then perform private.kinojo_sm_assert_capability(v_caps,'support'); end if;
end;
$$;
revoke all on function private.kinojo_sm_require_roster_scope(text,bigint,boolean) from public,anon,authenticated;

-- These existing official/family entrypoints include null-team creator flows and
-- must not inherit schedule/info rights through the legacy aggregate helper.
-- SQL-language adapters only delegate to protected PL/pgSQL implementations.
do $$
declare f record;v_definition text;v_body text;v_count integer:=0;
begin
 for f in select p.oid,p.proname,p.prosrc,l.lanname from pg_proc p
   join pg_namespace n on n.oid=p.pronamespace join pg_language l on l.oid=p.prolang
   where n.nspname='public' and p.proname ~ '^kinojo_sanctuary_management_(character_search|official_(prepare|prepare_all|record|materialize|gate)|linked_alts|balance_proposal)_v[0-9]{3}$'
 loop
   if f.lanname='sql' and f.proname in ('kinojo_sanctuary_management_official_materialize_v445','kinojo_sanctuary_management_official_materialize_v446') then continue; end if;
   if f.lanname<>'plpgsql' then raise exception 'Unexpected sanctuary permission delegate language: %',f.proname; end if;
   v_body:=regexp_replace(f.prosrc,E'(^|\n)[ \t]*begin[ \t]*(\r?\n|$)',
     E'\nbegin\n  perform private.kinojo_sm_require_roster_scope(p_credential,p_team_id,'||case when f.proname like '%balance_proposal%' then 'true' else 'false' end||E');\n','i');
   if v_body=f.prosrc then raise exception 'Sanctuary permission guard insertion failed: %',f.proname; end if;
   v_definition:=replace(pg_get_functiondef(f.oid),f.prosrc,v_body);
   execute v_definition;v_count:=v_count+1;
 end loop;
 if v_count<>26 then raise exception 'Sanctuary permission scope inventory changed: %',v_count; end if;
end;
$$;

-- Only the purpose-checked v2 facade is remotely callable. SECURITY DEFINER
-- delegates keep executing internally as the function owner, not service_role.
do $$
declare f record;
begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where (n.nspname='public' and p.proname ~ '^kinojo_sanctuary_management_(command|bootstrap|lease)_v[0-9]{3}$')
      or (n.nspname='private' and p.proname='kinojo_sm_support_command_v450')
 loop execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature); end loop;
end;
$$;

-- Old tabs cannot bypass expectedRevision by using the former four-argument writer.
create or replace function public.kinojo_admin_sanctuary_role_permission_set(p_pass_key text,p_role_key text,p_permission_key text,p_enabled boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.kinojo_sm_require_master(p_pass_key);
 raise exception '권한 화면이 변경되었습니다. 새로고침 후 다시 저장해 주세요.' using errcode='40001';
end;
$$;
notify pgrst,'reload schema';
commit;
