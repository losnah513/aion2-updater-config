-- Make the actual-character roster expose the same ownership/root identity
-- already returned for random-alt cards. The composer can then reject a main
-- and one of its alts before the user reaches the final save.

create or replace function private.kinojo_sm_force_roster_v430(p_team_id bigint)
returns jsonb
language sql
stable
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
  with party_rows as (
    select
      p.force_id,
      p.party_no,
      p.capacity,
      count(s.slot_id)::integer as slot_count,
      count(s.character_id)::integer as occupied_count,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'slotId', s.slot_id,
            'slotNo', s.slot_no,
            'occupied', s.character_id is not null,
            'revision', s.revision,
            'character', case
              when s.character_id is null then null
              else jsonb_build_object(
                'characterId', s.character_id,
                'mainCharacterId', s.owner_root_character_id,
                'ownerMemberId', s.owner_member_id,
                'name', c.character_name,
                'serverId', c.server_id,
                'serverName', c.server_name,
                'className', c.class_name,
                'profileImageUrl', c.profile_image_url,
                'power', c.latest_pve_combat_power,
                'mainCharacterName', c.main_character_name,
                'isMain', coalesce(c.is_main, false),
                'relation', s.character_relation
              )
            end
          )
          order by s.slot_no
        ) filter (where s.slot_id is not null),
        '[]'::jsonb
      ) as slots
    from private.sanctuary_management_parties_v412 p
    left join private.sanctuary_management_slots_v412 s
      on s.party_id = p.party_id
    left join public.character_master c
      on c.id = s.character_id
    where p.team_id = p_team_id
    group by p.force_id, p.party_id, p.party_no, p.capacity
  ),
  force_rows as (
    select
      f.force_id,
      f.force_no,
      f.capacity,
      f.status,
      f.revision,
      coalesce(sum(pr.slot_count), 0)::integer as slot_count,
      coalesce(sum(pr.occupied_count), 0)::integer as occupied_count,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'partyId', p.party_id,
            'partyNo', p.party_no,
            'capacity', p.capacity,
            'occupiedCount', coalesce(pr.occupied_count, 0),
            'vacancyCount', greatest(p.capacity - coalesce(pr.occupied_count, 0), 0),
            'slots', coalesce(pr.slots, '[]'::jsonb)
          )
          order by p.party_no
        ) filter (where p.party_id is not null),
        '[]'::jsonb
      ) as parties
    from private.sanctuary_management_forces_v412 f
    left join private.sanctuary_management_parties_v412 p
      on p.force_id = f.force_id
    left join party_rows pr
      on pr.force_id = f.force_id
     and pr.party_no = p.party_no
    where f.team_id = p_team_id
    group by f.force_id, f.force_no, f.capacity, f.status, f.revision
  )
  select jsonb_build_object(
    'forceCount', count(*)::integer,
    'slotCount', coalesce(sum(fr.slot_count), 0)::integer,
    'occupiedCount', coalesce(sum(fr.occupied_count), 0)::integer,
    'vacancyCount', coalesce(sum(greatest(fr.capacity - fr.occupied_count, 0)), 0)::integer,
    'forces', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'forceId', fr.force_id,
          'forceNo', fr.force_no,
          'capacity', fr.capacity,
          'status', fr.status,
          'revision', fr.revision,
          'occupiedCount', fr.occupied_count,
          'vacancyCount', greatest(fr.capacity - fr.occupied_count, 0),
          'parties', fr.parties
        )
        order by fr.force_no
      ) filter (where fr.force_id is not null),
      '[]'::jsonb
    )
  )
  from force_rows fr;
$function$;

comment on function private.kinojo_sm_force_roster_v430(bigint) is
  'Builds the Server team roster with clipboard fields plus actual-character root and owner identity for same-force family validation.';

create or replace function private.kinojo_sm_same_force_character_family_guard_v461()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if exists (
    select 1
      from private.sanctuary_management_slots_v412 slot
     where slot.force_id = new.force_id
       and slot.owner_root_character_id is not null
     group by slot.owner_root_character_id
    having count(*) > 1
  ) then
    raise exception '이미 해당 캐릭터의 본캐(나 부캐)가 이 포스에 소속되어 있습니다.' using errcode = 'P0001';
  end if;
  return new;
end
$function$;

drop trigger if exists sanctuary_management_same_force_character_family_guard_v461
  on private.sanctuary_management_slots_v412;
create constraint trigger sanctuary_management_same_force_character_family_guard_v461
after insert or update of force_id, character_id, owner_root_character_id, assignment_kind
on private.sanctuary_management_slots_v412
deferrable initially deferred
for each row execute function private.kinojo_sm_same_force_character_family_guard_v461();

revoke all on function private.kinojo_sm_force_roster_v430(bigint) from public, anon, authenticated;
revoke all on function private.kinojo_sm_same_force_character_family_guard_v461() from public, anon, authenticated;
