-- Stage 9 authoritative entry requirements. The WEB only renders these values;
-- all Sanctuary write and support paths re-read them through the v452 DB boundary.

update public.sanctuary_master
set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
  'entryModes', jsonb_build_array(
    jsonb_build_object('key', 'default', 'label', '입장 가능', 'sortOrder', 1, 'minItemLevel', 2700)
  )
)
where code = 'rudra';

update public.sanctuary_master
set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
  'entryModes', jsonb_build_array(
    jsonb_build_object('key', 'default', 'label', '입장 가능', 'sortOrder', 1, 'minItemLevel', 3500)
  )
)
where code = 'bagot';

update public.sanctuary_master
set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
  'entryModes', jsonb_build_array(
    jsonb_build_object('key', 'normal', 'label', '보통', 'sortOrder', 1, 'minItemLevel', 4300),
    jsonb_build_object('key', 'hard', 'label', '어려움', 'sortOrder', 2, 'minItemLevel', 4500)
  )
)
where code = 'kaldrix';

-- Sanctuary 4 is intentionally unresolved. Removing a stale value keeps the
-- "미정" product rule explicit until the official threshold is published.
update public.sanctuary_master
set metadata = coalesce(metadata, '{}'::jsonb) - 'entryModes'
where code = 'sanctuary4';
