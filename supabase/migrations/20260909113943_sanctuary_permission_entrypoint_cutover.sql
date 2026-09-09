-- Stage14 entrypoint definitions. Legacy delegates/Edge must be switched as one release.
begin;
create function private.kinojo_sm_permission_view_revision(p_member_id bigint,p_roster_revision text)
returns text language sql stable security invoker set search_path='' as $$
 select md5(coalesce(p_roster_revision,'')||'|'||private.kinojo_sm_permission_revision()||'|'
   ||coalesce((select jsonb_build_array(m.is_active,m.role,m.level,m.permissions)::text from public.member_codes m where m.id=p_member_id),'null')||'|'
   ||coalesce((select string_agg(o.team_id||':'||o.revision||':'||o.active::text,'|' order by o.team_id)
      from private.sanctuary_team_operators o where o.member_id=p_member_id),''));
$$;

create function public.kinojo_sanctuary_management_revision_v2(p_credential text,p_sanctuary_code text default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor jsonb;v_base jsonb;v_member bigint;
begin
 v_actor:=private.kinojo_sm_actor_v412(p_credential);v_member:=nullif(v_actor->>'memberId','')::bigint;
 if v_member is null then raise exception '로그인 세션을 확인해 주세요.' using errcode='42501'; end if;
 v_base:=public.kinojo_sanctuary_management_public_revision_v456(p_sanctuary_code);
 return v_base||jsonb_build_object('revisionKey',private.kinojo_sm_permission_view_revision(v_member,v_base->>'revisionKey'));
end;
$$;

create function public.kinojo_sanctuary_management_bootstrap_v2(p_credential text,p_sanctuary_code text default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_base jsonb;v_member bigint;v_team jsonb;v_caps jsonb;v_teams jsonb:='[]';v_batches jsonb;
begin
 v_base:=public.kinojo_sanctuary_management_bootstrap_v456(p_credential,p_sanctuary_code);
 v_member:=nullif(v_base->'actor'->>'memberId','')::bigint;
 for v_team in select value from jsonb_array_elements(coalesce(v_base->'teams','[]'::jsonb)) loop
   v_caps:=private.kinojo_sm_capabilities(v_member,(v_team->>'teamId')::bigint);
   if v_team->>'status'='DRAFT' and v_caps->'canReadPrivate'<>'true'::jsonb then continue; end if;
   select coalesce(jsonb_agg(batch),'[]'::jsonb) into v_batches
     from jsonb_array_elements(coalesce(v_team->'supportBatches','[]'::jsonb)) batch
     where v_caps->'canDecideSupport'='true'::jsonb or nullif(batch->>'requesterMemberId','')::bigint=v_member;
   v_teams:=v_teams||jsonb_build_array(v_team||v_caps||jsonb_build_object(
     'capabilities',v_caps,'canEdit',(v_caps->'canEditInfo'='true'::jsonb or v_caps->'canEditRoster'='true'::jsonb),
     'supportBatches',v_batches));
 end loop;
 return v_base||jsonb_build_object('teams',v_teams,'permissionContract','SANCTUARY_PERMISSIONS_V2',
   'revisionKey',private.kinojo_sm_permission_view_revision(v_member,v_base->>'revisionKey'),
   'actor',(v_base->'actor')||jsonb_build_object('canCreateTeam',private.kinojo_sm_capabilities(v_member,null)->'canCreateTeam'),
   'permissionRevision',private.kinojo_sm_permission_revision());
end;
$$;

create function public.kinojo_sanctuary_management_lease_v2(p_credential text,p_team_id bigint,p_action text,p_lease_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor jsonb;v_member bigint;v_caps jsonb;v_hash text;v_action text:=upper(btrim(coalesce(p_action,'')));
 v_lease private.sanctuary_management_edit_leases_v412%rowtype;v_expires timestamptz;
begin
 v_actor:=private.kinojo_sm_actor_v412(p_credential);v_member:=nullif(v_actor->>'memberId','')::bigint;
 if v_member is null or not exists(select 1 from public.member_codes where id=v_member and is_active is true) then
   raise exception '로그인 세션을 확인해 주세요.' using errcode='42501';
 end if;
 if length(btrim(coalesce(p_lease_token,'')))<32 or v_action not in ('ACQUIRE','RENEW','RELEASE') then
   raise exception '편집 잠금 요청을 확인해 주세요.' using errcode='22023';
 end if;
 v_hash:=encode(sha256(convert_to(p_lease_token,'UTF8')),'hex');
 -- Own lease may be released after authority or write access is revoked.
 if v_action='RELEASE' then
   delete from private.sanctuary_management_edit_leases_v412
     where team_id=p_team_id and actor_member_id=v_member and lease_token_hash=v_hash;
   return jsonb_build_object('ok',true,'teamId',p_team_id,'action',v_action);
 end if;
 perform private.kinojo_sm_assert_pilot_write_v439(p_credential,'LEASE_'||v_action);
 perform private.kinojo_sm_assert_write_enabled_v412();
 lock table public.sanctuary_role_permissions in share mode;
 perform 1 from private.sanctuary_management_teams_v412 where team_id=p_team_id for update;
 v_caps:=private.kinojo_sm_capabilities(v_member,p_team_id);
 if not (v_caps->'canEditInfo'='true'::jsonb or v_caps->'canEditRoster'='true'::jsonb or v_caps->'canManageSchedule'='true'::jsonb) then
   raise exception '이 팀을 편집할 권한이 없습니다.' using errcode='42501';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('sanctuary-management-team:'||p_team_id,412));
 select * into v_lease from private.sanctuary_management_edit_leases_v412 where team_id=p_team_id for update;
 if v_action='RENEW' and (v_lease.team_id is null or v_lease.actor_member_id<>v_member
   or v_lease.lease_token_hash<>v_hash or v_lease.expires_at<=clock_timestamp()) then
   raise exception '편집 잠금이 만료되었습니다. 다시 열어 주세요.' using errcode='55P03';
 end if;
 if v_lease.team_id is not null and v_lease.expires_at>clock_timestamp()
   and (v_lease.actor_member_id<>v_member or v_lease.lease_token_hash<>v_hash) then
   raise exception '다른 사용자가 이 팀을 편집하고 있습니다.' using errcode='55P03';
 end if;
 v_expires:=clock_timestamp()+interval '2 minutes';
 insert into private.sanctuary_management_edit_leases_v412(team_id,actor_member_id,lease_token_hash,acquired_at,expires_at)
   values(p_team_id,v_member,v_hash,clock_timestamp(),v_expires)
   on conflict(team_id) do update set actor_member_id=excluded.actor_member_id,lease_token_hash=excluded.lease_token_hash,
     acquired_at=case when v_action='RENEW' then private.sanctuary_management_edit_leases_v412.acquired_at else excluded.acquired_at end,expires_at=excluded.expires_at;
 return jsonb_build_object('ok',true,'teamId',p_team_id,'action',v_action,'expiresAt',v_expires);
end;
$$;
revoke all on function private.kinojo_sm_permission_view_revision(bigint,text),public.kinojo_sanctuary_management_revision_v2(text,text),public.kinojo_sanctuary_management_bootstrap_v2(text,text),public.kinojo_sanctuary_management_lease_v2(text,bigint,text,text) from public,anon,authenticated;
grant execute on function public.kinojo_sanctuary_management_revision_v2(text,text),public.kinojo_sanctuary_management_bootstrap_v2(text,text),public.kinojo_sanctuary_management_lease_v2(text,bigint,text,text) to service_role;
commit;
