-- Keep MAIN/ALT presentation for list-backed operational characters even when
-- they are not linked to a signed-in member. Explicit owner relations still
-- win, so verified external guests remain GUEST.

create or replace function private.kinojo_sm_normalize_slot_character_relation_v463()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_relation text;
  v_root_character_id bigint;
begin
  if new.character_id is null
     or upper(coalesce(new.assignment_kind, 'ACTUAL_CHARACTER')) <> 'ACTUAL_CHARACTER' then
    return new;
  end if;

  select
    case
      when owner.character_id is not null
           and upper(coalesce(owner.relation, '')) in ('MAIN', 'ALT', 'GUEST')
        then upper(owner.relation)
      when exists (
        select 1
        from private.sanctuary_operational_legions_v432 legion
        where legion.is_active
          and lower(btrim(legion.legion_name)) = lower(btrim(character.legion_name))
      ) then case
        when coalesce(character.is_main, false)
             or coalesce(character.main_character_id, character.id) = character.id then 'MAIN'
        when character.main_character_id is not null then 'ALT'
        else 'GUEST'
      end
      else 'GUEST'
    end,
    coalesce(character.main_character_id, character.id)
  into v_relation, v_root_character_id
  from public.character_master character
  left join private.sanctuary_character_owners_v412 owner
    on owner.character_id = character.id
  where character.id = new.character_id
    and coalesce(character.is_active, true)
    and coalesce(character.identity_status, 'CURRENT') = 'CURRENT';

  if not found then
    return new;
  end if;

  new.character_relation := v_relation;
  if v_relation in ('MAIN', 'ALT') then
    new.owner_root_character_id := v_root_character_id;
  end if;
  return new;
end
$function$;

drop trigger if exists sanctuary_management_slot_relation_v463
  on private.sanctuary_management_slots_v412;
create trigger sanctuary_management_slot_relation_v463
before insert or update of character_id, character_relation, assignment_kind
on private.sanctuary_management_slots_v412
for each row execute function private.kinojo_sm_normalize_slot_character_relation_v463();

comment on function private.kinojo_sm_normalize_slot_character_relation_v463() is
  'Preserves verified owner relations and derives MAIN/ALT from character_master only for active operational-legion characters without an owner row.';

revoke all on function private.kinojo_sm_normalize_slot_character_relation_v463()
  from public, anon, authenticated;

-- Repair only the legacy SET_SLOT rows affected by the old owner-null => GUEST
-- coercion. The trigger above calculates the final relation and root identity.
update private.sanctuary_management_slots_v412 slot
set character_relation = slot.character_relation,
    updated_at = clock_timestamp()
from public.character_master character
where character.id = slot.character_id
  and slot.assignment_kind = 'ACTUAL_CHARACTER'
  and slot.character_relation = 'GUEST'
  and coalesce(character.is_active, true)
  and coalesce(character.identity_status, 'CURRENT') = 'CURRENT'
  and not exists (
    select 1
    from private.sanctuary_character_owners_v412 owner
    where owner.character_id = character.id
  )
  and exists (
    select 1
    from private.sanctuary_operational_legions_v432 legion
    where legion.is_active
      and lower(btrim(legion.legion_name)) = lower(btrim(character.legion_name))
  );
