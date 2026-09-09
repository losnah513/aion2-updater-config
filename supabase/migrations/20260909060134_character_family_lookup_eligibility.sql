-- Family eligibility only; no Master flags, relationships, schedules or Sheet writes.
begin;
set local lock_timeout='3s';
set local statement_timeout='15s';
CREATE OR REPLACE FUNCTION private.kinojo_character_lookup_policy(p_character_id bigint, p_at timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY INVOKER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare c public.character_master%rowtype; root public.character_master%rowtype;
 mode text; scope text; reason text; eligible boolean:=false; current_sanctuary boolean:=false;
 due_at timestamptz;
begin
 select * into c from public.character_master where id=p_character_id;
 if not found then return jsonb_build_object('eligible',false,'reason','CHARACTER_NOT_FOUND'); end if;
 select * into root from public.character_master where id=coalesce(c.main_character_id,c.id);
 mode:=case when c.lookup_policy<>'INHERIT' then c.lookup_policy else coalesce(root.lookup_group_policy,'AUTO') end;
 scope:=case when c.lookup_policy<>'INHERIT' then 'CHARACTER' else 'GROUP' end;
 due_at:=coalesce(c.relation_review_attempted_at,c.last_lookup_success_at,'-infinity'::timestamptz)+interval '7 days';
 if upper(c.character_name) like '%\_D' escape '\' or c.exclusion_reason='삭제후보' then reason:='DELETION_CANDIDATE';
 elsif coalesce(c.lookup_excluded,false) then reason:='ADMIN_EXCLUDED';
 elsif coalesce(c.inactive_reason,'') in ('중복','헤더','캐릭터 삭제') then reason:='ARCHIVED_RECORD';
 elsif mode='EXCLUDE' then reason:='ADMIN_EXCLUDED';
 elsif mode='INCLUDE' then eligible:=true; reason:='ADMIN_INCLUDED';
 else
   -- Use canonical schedule occurrence calculation, including cancellations/moves.
   -- Repeating schedules must have started; one-off inclusion is an unexpired actual occurrence.
   select exists(
     select 1 from private.sanctuary_management_slots_v412 sl
     join private.sanctuary_management_teams_v412 t on t.team_id=sl.team_id and t.status in ('ACTIVE','FULL')
     join private.sanctuary_management_schedule_rules_v412 r on r.team_id=t.team_id and r.status='ACTIVE'
     where sl.character_id=c.id and exists(
       select 1 from private.sanctuary_management_schedule_versions_v437 v
       where v.schedule_id=r.schedule_id and v.status='ACTIVE'
       and v.effective_from <= (p_at at time zone v.timezone_name)::date
       and coalesce(v.effective_to,'infinity'::date) >= (p_at at time zone v.timezone_name)::date
       and ((v.schedule_kind='WEEKLY' and v.starts_on <= (p_at at time zone v.timezone_name)::date)
         or (v.schedule_kind='ONCE' and exists(
           select 1 from private.kinojo_sm_rule_occurrences_v437(r.schedule_id,
             least(v.starts_on,(p_at at time zone v.timezone_name)::date),
             greatest(v.starts_on,coalesce((select max(e.moved_to_date) from private.sanctuary_management_schedule_exceptions_v412 e where e.schedule_id=r.schedule_id and e.occurrence_date=v.starts_on and e.exception_type='MOVE'),v.starts_on))) o
           where o.end_at>p_at)))
     )
   ) into current_sanctuary;
   if current_sanctuary then eligible:=true;reason:='CURRENT_SANCTUARY';
   elsif c.server_id=2002 and c.legion_name in ('깡','키나노동조합','낮','밤') then
     eligible:=true;reason:='MANAGED_LEGION';
   elsif exists (
     -- Canonical family IDs only; reuse the existing PK/main_character_id indexes.
     select 1 from public.character_master f
     where (f.id=coalesce(root.id,c.id) or f.main_character_id=coalesce(root.id,c.id))
       and coalesce(f.main_character_id,f.id)=coalesce(root.id,c.id)
       and f.server_id=2002 and f.legion_name in ('깡','키나노동조합','낮','밤')
       and not coalesce(f.lookup_excluded,false)
       and upper(f.character_name) not like '%\_D' escape '\'
       and coalesce(f.exclusion_reason,'')<>'삭제후보'
       and coalesce(f.inactive_reason,'') not in ('중복','헤더','캐릭터 삭제')
       and case when f.lookup_policy<>'INHERIT' then f.lookup_policy
                else coalesce(root.lookup_group_policy,'AUTO') end <> 'EXCLUDE'
   ) then eligible:=true;reason:='MANAGED_LEGION_FAMILY';
   else eligible:=due_at<=p_at;reason:=case when eligible then 'ACTIVITY_REVIEW_DUE' else 'ACTIVITY_REVIEW_WAIT' end;
   end if;
 end if;
 return jsonb_build_object('eligible',eligible,'reason',reason,'mode',mode,'scope',scope,
 'individualMode',c.lookup_policy,'groupMode',coalesce(root.lookup_group_policy,'AUTO'),
 'characterRevision',coalesce(c.lookup_policy_updated_at::text,''),'groupRevision',coalesce(root.id,c.id)::text||'/'||coalesce(root.lookup_policy_updated_at::text,''),
 'rootCharacterId',coalesce(root.id,c.id),'currentSanctuary',current_sanctuary,
 'reviewDueAt',case when isfinite(due_at) then to_jsonb(due_at) else null end,
 'actorId',case when scope='CHARACTER' then c.lookup_policy_actor_id else root.lookup_policy_actor_id end,
 'checkedAt',case when scope='CHARACTER' then c.lookup_policy_updated_at else root.lookup_policy_updated_at end);
end;
$function$;

revoke all on function private.kinojo_character_lookup_policy(bigint,timestamptz) from public,anon,authenticated;
grant execute on function private.kinojo_character_lookup_policy(bigint,timestamptz) to service_role;
commit;
