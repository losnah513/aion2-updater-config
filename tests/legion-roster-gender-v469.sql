-- Canonical master-linked snapshot gender parity for every eligible roster character.
with rows as (
 select r.character_id,case s.raw_payload#>>'{officialRaw,info,profile,gender}'
   when '1' then 'MALE' when '2' then 'FEMALE' else null end expected,
   public.kinojo_web_roster_images_v467(r.character_id,r.character_id,null,1) response
 from private.kinojo_roster_source_v465() r
 join public.character_master c on c.id=r.character_id
 left join public.lookup_snapshots s on s.id=c.legion_source_snapshot_id
 where r.legion=any(array['깡','낮','밤','키나노동조합'])
)
select count(*) as characters,
 bool_and((response->>'gender') is not distinct from expected) as gender_parity_ok,
 count(*) filter(where expected='MALE') as male,
 count(*) filter(where expected='FEMALE') as female,
 count(*) filter(where expected is null) as unknown,
 bool_and(not response ? 'profile' and not response ? 'raw_payload') as bounded_projection_ok
from rows;
