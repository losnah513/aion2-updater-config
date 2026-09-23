CREATE OR REPLACE FUNCTION public.kinojo_normalize_character_name(p_value text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  select regexp_replace(coalesce(trim(p_value), ''), '\s+', '', 'g');
$function$
;
CREATE OR REPLACE FUNCTION public.kinojo_character_skill_normalize_v415(p_skill_list jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', n.skill_id,
        'name', n.skill_name,
        'category', n.category_key,
        'categoryRaw', n.category_raw,
        'categoryLabel', n.category_label,
        'legacyCategory', case when n.category_key = 'stigma' then 'dp' else n.category_key end,
        'level', n.level_value,
        'levelTier', case
          when n.level_value < 20 then 0
          when n.level_value < 25 then 1
          when n.level_value < 30 then 2
          when n.level_value < 35 then 3
          when n.level_value < 40 then 4
          else 5
        end,
        'levelBand', case
          when n.level_value < 20 then 'normal'
          when n.level_value < 25 then '20-24'
          when n.level_value < 30 then '25-29'
          when n.level_value < 35 then '30-34'
          when n.level_value < 40 then '35-39'
          else '40+'
        end,
        'needLevel', n.need_level,
        'acquired', n.acquired,
        'equip', n.equip,
        'icon', n.icon
      )
      order by n.category_order, n.skill_name, n.skill_id
    ),
    '[]'::jsonb
  )
  from (
    select
      case
        when coalesce(s ->> 'id', '') ~ '^[0-9]+$' then (s ->> 'id')::bigint
        else null
      end as skill_id,
      coalesce(s ->> 'name', '') as skill_name,
      coalesce(s ->> 'category', '') as category_raw,
      case lower(trim(coalesce(s ->> 'category', '')))
        when 'active' then 'active'
        when 'passive' then 'passive'
        when 'dp' then 'stigma'
        when 'stigma' then 'stigma'
        else 'other'
      end as category_key,
      case lower(trim(coalesce(s ->> 'category', '')))
        when 'active' then '액티브'
        when 'passive' then '패시브'
        when 'dp' then '스티그마'
        when 'stigma' then '스티그마'
        else '기타'
      end as category_label,
      case lower(trim(coalesce(s ->> 'category', '')))
        when 'active' then 1
        when 'passive' then 2
        when 'dp' then 3
        when 'stigma' then 3
        else 4
      end as category_order,
      case
        when coalesce(nullif(s ->> 'skillLevel', ''), nullif(s ->> 'level', ''), '0')
          ~ '^-?[0-9]+([.][0-9]+)?$'
          then floor(coalesce(nullif(s ->> 'skillLevel', ''), nullif(s ->> 'level', ''), '0')::numeric)::integer
        else 0
      end as level_value,
      case
        when coalesce(s ->> 'needLevel', '0') ~ '^-?[0-9]+([.][0-9]+)?$'
          then floor((s ->> 'needLevel')::numeric)::integer
        else 0
      end as need_level,
      lower(coalesce(s ->> 'acquired', '0')) in ('1', 'true') as acquired,
      lower(coalesce(s ->> 'equip', '0')) in ('1', 'true') as equip,
      coalesce(s ->> 'icon', '') as icon
    from jsonb_array_elements(
      case
        when jsonb_typeof(p_skill_list) = 'array' then p_skill_list
        else '[]'::jsonb
      end
    ) as skill_rows(s)
  ) as n;
$function$
;
CREATE OR REPLACE FUNCTION public.kinojo_extract_legion_name(p_payload jsonb)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  select nullif(trim(coalesce(
    p_payload #>> '{officialRaw,info,profile,regionName}',
    p_payload #>> '{official_raw,info,profile,regionName}',
    p_payload #>> '{info,profile,regionName}',
    p_payload #>> '{officialRaw,profile,regionName}',
    p_payload #>> '{profile,regionName}'
  )), '');
$function$
;
CREATE OR REPLACE FUNCTION public.kinojo_character_skill_snapshot_sync_v415()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
 SET statement_timeout TO '2s'
 SET lock_timeout TO '500ms'
AS $function$
declare
  v_character_master_id bigint;
  v_skill_list jsonb;
  v_skills jsonb;
begin
  v_skill_list := new.raw_payload #> '{officialRaw,equipment,skill,skillList}';

  if new.status is distinct from 'OK'
     or jsonb_typeof(v_skill_list) is distinct from 'array' then
    return new;
  end if;

  if jsonb_array_length(v_skill_list) = 0 then
    return new;
  end if;

  select cm.id
    into v_character_master_id
    from public.character_master as cm
   where cm.server_id = new.server_id
     and public.kinojo_character_identity_key_v298(cm.character_name) =
         public.kinojo_character_identity_key_v298(new.character_name)
     and coalesce(cm.is_active, true) = true
   order by cm.updated_at desc, cm.id desc
   limit 1;

  if v_character_master_id is null then
    return new;
  end if;

  v_skills := public.kinojo_character_skill_normalize_v415(v_skill_list);

  insert into public.character_skill_current_state (
    character_master_id,
    snapshot_id,
    snapshot_session_id,
    snapshot_refreshed_at,
    snapshot_source_updated_at,
    snapshot_skills,
    updated_at
  )
  values (
    v_character_master_id,
    new.id,
    new.session_id,
    new.created_at,
    new.created_at,
    v_skills,
    clock_timestamp()
  )
  on conflict (character_master_id) do update
     set snapshot_id = excluded.snapshot_id,
         snapshot_session_id = excluded.snapshot_session_id,
         snapshot_refreshed_at = excluded.snapshot_refreshed_at,
         snapshot_source_updated_at = excluded.snapshot_source_updated_at,
         snapshot_skills = excluded.snapshot_skills,
         updated_at = clock_timestamp()
   where excluded.snapshot_id = public.character_skill_current_state.snapshot_id
      or (
        excluded.snapshot_refreshed_at,
        excluded.snapshot_id
      ) > (
        coalesce(public.character_skill_current_state.snapshot_refreshed_at, '-infinity'::timestamptz),
        coalesce(public.character_skill_current_state.snapshot_id, 0)
      );

  return new;
end;
$function$
;
CREATE TRIGGER trg_kinojo_character_skill_snapshot_sync_v415 AFTER INSERT OR UPDATE OF status, raw_payload, server_id, character_name, created_at ON public.lookup_snapshots FOR EACH ROW EXECUTE FUNCTION kinojo_character_skill_snapshot_sync_v415();
CREATE OR REPLACE FUNCTION public.kinojo_sync_character_legion_from_snapshot_v296()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_legion text;
begin
  if coalesce(new.status, 'OK') <> 'OK' then
    return new;
  end if;

  v_legion := public.kinojo_extract_legion_name(new.raw_payload);
  if v_legion is null then
    return new;
  end if;

  update public.character_master cm
  set legion_name = v_legion,
      legion_updated_at = coalesce(new.created_at, now()),
      legion_source_snapshot_id = new.id
  where cm.server_id = coalesce(new.server_id, cm.server_id)
    and public.kinojo_normalize_character_name(cm.character_name)
      = public.kinojo_normalize_character_name(new.character_name)
    and (cm.legion_source_snapshot_id is null or cm.legion_source_snapshot_id <= new.id);

  return new;
end;
$function$
;
CREATE TRIGGER trg_kinojo_sync_character_legion_v296 AFTER INSERT OR UPDATE OF raw_payload, status ON public.lookup_snapshots FOR EACH ROW EXECUTE FUNCTION kinojo_sync_character_legion_from_snapshot_v296();
