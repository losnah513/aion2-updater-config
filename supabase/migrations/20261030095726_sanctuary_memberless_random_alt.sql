-- SQL539: authorized editors may reserve a verified main's random alternate without a member ID.
-- Existing v2 facade, roster scope, actor login, lease/revision/idempotency and
-- deferred same-force family/assignment guards remain authoritative. No ACL changes.
-- Guarded body edits preserve the Stage14 roster-scope injection and function configuration.
begin;
set local lock_timeout='2s';
set local statement_timeout='15s';
alter table private.sanctuary_management_slots_v412
  drop constraint sanctuary_management_slots_v453_occupancy_ck;
alter table private.sanctuary_management_slots_v412
  add constraint sanctuary_management_slots_v453_occupancy_ck check (
    (assignment_kind = 'ACTUAL_CHARACTER' and (
      (character_id is null and owner_member_id is null and owner_root_character_id is null and character_relation is null)
      or (character_id is not null and owner_root_character_id is not null and character_relation is not null)
    )) or (
      assignment_kind = 'RANDOM_ALT' and character_id is null
      and owner_root_character_id is not null and character_relation = 'ALT'
    )
  );
comment on constraint sanctuary_management_slots_v453_occupancy_ck on private.sanctuary_management_slots_v412 is
  'Virtual alternate uses a verified active main-character root; member ownership is optional. No fabricated character/member rows.';

do $patch$
declare source text; updated text;
begin
  source := pg_get_functiondef('public.kinojo_sanctuary_management_linked_alts_v453(text,bigint,bigint)'::regprocedure);
  if position($old$  if v_owner.owner_member_id is not null then
    v_random_candidate :=$old$ in source) = 0 then
    raise exception 'Memberless random-alt baseline changed: public.kinojo_sanctuary_management_linked_alts_v453(text,bigint,bigint)';
  end if;
  updated := replace(source,$old$  if v_owner.owner_member_id is not null then
    v_random_candidate :=$old$,$new$  if exists (select 1 from public.character_master root
      where root.id = v_root_id and coalesce(root.is_active, true)
        and not coalesce(root.lookup_excluded, false)
        and coalesce(root.main_character_id, case when root.is_main then root.id end) = root.id) then
    v_random_candidate :=$new$);
  execute updated;
end
$patch$;

do $patch$
declare source text; updated text;
begin
  source := pg_get_functiondef('public.kinojo_sanctuary_management_linked_alts_v457(text,bigint,bigint,bigint)'::regprocedure);
  if position($old$  if v_owner.owner_member_id is not null then
    v_random_candidate:=$old$ in source) = 0 then
    raise exception 'Memberless random-alt baseline changed: public.kinojo_sanctuary_management_linked_alts_v457(text,bigint,bigint,bigint)';
  end if;
  updated := replace(source,$old$  if v_owner.owner_member_id is not null then
    v_random_candidate:=$old$,$new$  if exists (select 1 from public.character_master root
      where root.id = v_root_id and coalesce(root.is_active, true)
        and not coalesce(root.lookup_excluded, false)
        and coalesce(root.main_character_id, case when root.is_main then root.id end) = root.id) then
    v_random_candidate:=$new$);
  execute updated;
end
$patch$;

do $patch$
declare source text; updated text;
begin
  source := pg_get_functiondef('public.kinojo_sanctuary_management_command_v453(text,text,text,jsonb,bigint)'::regprocedure);
  if position($old$         or v_owner.owner_member_id is null then$old$ in source) = 0 then
    raise exception 'Memberless random-alt baseline changed: public.kinojo_sanctuary_management_command_v453(text,text,text,jsonb,bigint)';
  end if;
  updated := replace(source,$old$         or v_owner.owner_member_id is null then$old$,$new$         or not exists (select 1 from public.character_master root
      where root.id = v_main_character_id and coalesce(root.is_active, true)
        and not coalesce(root.lookup_excluded, false)
        and coalesce(root.main_character_id, case when root.is_main then root.id end) = root.id) then$new$);
  execute updated;
end
$patch$;

do $patch$
declare source text; updated text;
begin
  source := pg_get_functiondef('private.kinojo_sm_slot_assignment_guard_v450()'::regprocedure);
  if position($old$       or v_owner.owner_member_id is distinct from new.owner_member_id then$old$ in source) = 0 then
    raise exception 'Memberless random-alt baseline changed: private.kinojo_sm_slot_assignment_guard_v450()';
  end if;
  updated := replace(source,$old$       or v_owner.owner_member_id is distinct from new.owner_member_id then$old$,$new$       or v_owner.owner_member_id is distinct from new.owner_member_id
       or not exists (select 1 from public.character_master root
      where root.id = new.owner_root_character_id and coalesce(root.is_active, true)
        and not coalesce(root.lookup_excluded, false)
        and coalesce(root.main_character_id, case when root.is_main then root.id end) = root.id) then$new$);
  execute updated;
end
$patch$;

do $patch$
declare source text; updated text;
begin
  source := pg_get_functiondef('private.kinojo_sm_team_conflicts_v437(bigint,date,date)'::regprocedure);
  if position($old$mine.team_id=candidate_team.team_id and mine.character_id is not null$old$ in source) = 0 then
    raise exception 'Memberless random-alt baseline changed: private.kinojo_sm_team_conflicts_v437(bigint,date,date)';
  end if;
  updated := replace(source,$old$mine.team_id=candidate_team.team_id and mine.character_id is not null$old$,$new$mine.team_id=candidate_team.team_id and (mine.character_id is not null or mine.assignment_kind='RANDOM_ALT')$new$);
  execute updated;
end
$patch$;

do $patch$
declare source text; updated text;
begin
  source := pg_get_functiondef('private.kinojo_sm_team_conflicts_v437(bigint,date,date)'::regprocedure);
  if position($old$cm.id=mine.character_id$old$ in source) = 0 then
    raise exception 'Memberless random-alt baseline changed: private.kinojo_sm_team_conflicts_v437(bigint,date,date)';
  end if;
  updated := replace(source,$old$cm.id=mine.character_id$old$,$new$cm.id=coalesce(mine.character_id,mine.owner_root_character_id)$new$);
  execute updated;
end
$patch$;

do $patch$
declare source text; updated text;
begin
  source := pg_get_functiondef('private.kinojo_sm_team_conflicts_v437(bigint,date,date)'::regprocedure);
  if position($old$other_slot.team_id<>candidate_team.team_id and other_slot.character_id is not null$old$ in source) = 0 then
    raise exception 'Memberless random-alt baseline changed: private.kinojo_sm_team_conflicts_v437(bigint,date,date)';
  end if;
  updated := replace(source,$old$other_slot.team_id<>candidate_team.team_id and other_slot.character_id is not null$old$,$new$other_slot.team_id<>candidate_team.team_id and (other_slot.character_id is not null or other_slot.assignment_kind='RANDOM_ALT')$new$);
  execute updated;
end
$patch$;

do $patch$
declare source text; updated text;
begin
  source := pg_get_functiondef('public.kinojo_sanctuary_management_command_v453(text,text,text,jsonb,bigint)'::regprocedure);
  if position($old$  perform private.kinojo_sm_recompute_status_v450(v_team_id);$old$ in source) = 0 then
    raise exception 'Memberless random-alt baseline changed: public.kinojo_sanctuary_management_command_v453(text,text,text,jsonb,bigint)';
  end if;
  updated := replace(source,$old$  perform private.kinojo_sm_recompute_status_v450(v_team_id);$old$,$new$  -- Check after restoring RANDOM_ALT slots; the delegated save sees empty slots.
  if jsonb_array_length(private.kinojo_sm_team_conflicts_v437(v_team_id,current_date,current_date+366)) > 0 then
    raise exception '랜덤 부캐의 본캐 계열이 다른 팀 일정과 충돌합니다.' using errcode = 'P0001';
  end if;
  perform private.kinojo_sm_recompute_status_v450(v_team_id);$new$);
  execute updated;
end
$patch$;

commit;
