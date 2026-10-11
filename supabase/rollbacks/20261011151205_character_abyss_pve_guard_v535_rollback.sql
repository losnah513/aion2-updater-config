CREATE OR REPLACE FUNCTION public.kinojo_extract_aion_pvp_dom(p_html text, p_equipment jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_html text := regexp_replace(coalesce(p_html, ''), E'[\r\n]+', ' ', 'g');
  v_equipment jsonb := coalesce(p_equipment, public.kinojo_extract_aion_equipment_dom(p_html));
  v_title_section_found boolean := false;
  v_has_title boolean := false;
  v_title_text text := '';
  v_title record;
  v_section_found boolean := coalesce((v_equipment ->> 'equipmentSectionFound')::boolean, false);
  v_weapon_active boolean := coalesce((v_equipment ->> 'weaponArmorTabActive')::boolean, false);
  v_slot_count int := coalesce(public.kinojo_json_int(v_equipment, 'visibleEquipmentSlotCount'), 0);
  v_populated_count int := coalesce(public.kinojo_json_int(v_equipment, 'populatedEquipmentSlotCount', 'namedEquipmentSlotCount'), 0);
  v_abyss_count int := coalesce(public.kinojo_json_int(v_equipment, 'abyssEquipmentSlotCount'), 0);
  v_gear_type text := 'UNKNOWN';
  v_status text := 'UNKNOWN';
  v_reason text := 'INSUFFICIENT_EVIDENCE';
begin
  -- 페이지 전체 문구가 아니라 현재 타이틀 옵션 DOM 안의 텍스트만 검사한다.
  for v_title in
    select m[1] as inner_html
      from regexp_matches(
        v_html,
        $re$<[^>]+class=["'][^"']*(?:title__item-stat|title[^"']*stat)[^"']*["'][^>]*>(.*?)</[^>]+>$re$,
        'gis'
      ) as m
  loop
    v_title_section_found := true;
    v_title_text := concat_ws(' ', v_title_text, public.kinojo_aion_html_text(v_title.inner_html));
  end loop;

  v_has_title := v_title_section_found
    and v_title_text ~* 'PVP[[:space:]]*피해[[:space:]]*(증폭|내성)';

  if not v_section_found or v_slot_count = 0 then
    v_reason := 'EQUIPMENT_SLOTS_NOT_FOUND';
  elsif not v_weapon_active or v_populated_count < 5 then
    v_reason := 'EQUIPMENT_SLOTS_NOT_POPULATED';
  elsif v_has_title and v_abyss_count >= 3 then
    v_gear_type := 'PVP';
    v_status := 'CONFIRMED';
    v_reason := 'PVP_TITLE_AND_ABYSS_3_PLUS';
  elsif v_has_title and v_abyss_count < 3 then
    v_gear_type := 'PVE';
    v_status := 'CONFIRMED';
    v_reason := 'PVP_TITLE_WITH_LESS_THAN_3_ABYSS';
  elsif v_abyss_count >= 3 and v_title_section_found then
    v_gear_type := 'PVE';
    v_status := 'CONFIRMED';
    v_reason := 'ABYSS_3_PLUS_BUT_TITLE_HAS_NO_PVP_OPTION';
  elsif v_abyss_count >= 3 and not v_title_section_found then
    v_gear_type := 'PVE';
    v_status := 'CONFIRMED';
    v_reason := 'ABYSS_3_PLUS_BUT_TITLE_SECTION_NOT_FOUND';
  else
    v_gear_type := 'PVE';
    v_status := 'CONFIRMED';
    v_reason := 'RENDERED_EQUIPMENT_WITH_LESS_THAN_3_ABYSS';
  end if;

  return v_equipment || jsonb_build_object(
    'gearType', v_gear_type,
    'detectedGearType', v_gear_type,
    'gearParseStatus', v_status,
    'gearReasonCode', v_reason,
    'titleSectionFound', v_title_section_found,
    'titlePvpOptionText', nullif(trim(v_title_text), ''),
    'hasPvpTitleOption', v_has_title,
    'pvpEquipmentThreshold', 3
  );
end;
$function$

;
CREATE OR REPLACE FUNCTION public.kinojo_extract_aion_stats_from_text(p_text text, p_character_name text DEFAULT NULL::text, p_gear_type text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  h text := coalesce(p_text, '');
  power_raw text;
  item_raw text;
  power_value int;
  item_value int;
  class_icon text;
  class_name text;
  profile_image text;
  char_key text;
  gear_type text := 'UNKNOWN';
  v_equipment jsonb;
  v_pvp jsonb;
  lines text[];
  i int;
  name_pos int := 0;
  v_stat_status text;
begin
  power_raw := public.kinojo_v227_span_after_class(h, 'profile__info-power-level');
  item_raw := public.kinojo_v227_span_after_class(h, 'profile__info-item-level');
  power_value := public.kinojo_v227_parse_aion_number(power_raw);
  item_value := public.kinojo_v227_parse_aion_number(item_raw);

  if (power_value is null or item_value is null) and coalesce(trim(p_character_name), '') <> '' then
    lines := regexp_split_to_array(replace(h, chr(13), ''), chr(10));
    if array_length(lines, 1) is not null then
      for i in 1..array_length(lines, 1) loop
        if trim(lines[i]) = trim(p_character_name) then
          name_pos := i;
          exit;
        end if;
      end loop;
      if name_pos > 0 then
        for i in name_pos + 1..least(name_pos + 18, array_length(lines, 1)) loop
          if power_value is null and trim(lines[i]) ~* '^[0-9][0-9,]*([.][0-9]+)?[KMB]$' then
            power_raw := trim(lines[i]);
            power_value := public.kinojo_v227_parse_aion_number(power_raw);
          elsif power_value is not null and item_value is null and trim(lines[i]) ~ '^[0-9][0-9,]{2,}$' then
            item_raw := trim(lines[i]);
            item_value := public.kinojo_v227_parse_aion_number(item_raw);
            exit;
          end if;
        end loop;
      end if;
    end if;
  end if;

  class_icon := public.kinojo_v227_img_after_class(h, 'profile__class-img');
  profile_image := public.kinojo_v227_img_after_class(h, 'profile__avatar');
  class_name := public.kinojo_v227_class_from_icon(class_icon);
  if profile_image is not null then
    char_key := substring(profile_image from 'charKey=([0-9]{10,})');
  end if;

  v_equipment := public.kinojo_extract_aion_equipment_dom(h);
  begin
    v_pvp := public.kinojo_extract_aion_pvp_dom(h, v_equipment);
    gear_type := coalesce(public.kinojo_json_text(v_pvp, 'gearType'), 'UNKNOWN');
  exception when others then
    v_pvp := jsonb_build_object(
      'gearType', 'UNKNOWN',
      'detectedGearType', 'UNKNOWN',
      'gearParseStatus', 'UNKNOWN',
      'gearReasonCode', 'GEAR_PARSER_EXCEPTION',
      'parserError', sqlerrm
    );
    gear_type := 'UNKNOWN';
  end;

  v_stat_status := case
    when power_value is null or item_value is null then 'STAT_PARSE_FAILED'
    when gear_type = 'UNKNOWN' then 'GEAR_TYPE_UNKNOWN'
    else 'OK'
  end;

  return jsonb_build_object(
    'gearType', gear_type,
    'detectedGearType', gear_type,
    'gearParseStatus', public.kinojo_json_text(v_pvp, 'gearParseStatus'),
    'gearReasonCode', public.kinojo_json_text(v_pvp, 'gearReasonCode'),
    'gearEvidence', v_pvp,
    'className', coalesce(class_name, ''),
    'itemLevel', item_value,
    'combatPower', power_value,
    'pveItemLevel', case when gear_type = 'PVE' then item_value end,
    'pveCombatPower', case when gear_type = 'PVE' then power_value end,
    'pvpItemLevel', case when gear_type = 'PVP' then item_value end,
    'pvpCombatPower', case when gear_type = 'PVP' then power_value end,
    'profileImageUrl', profile_image,
    'classIconUrl', class_icon,
    'charKey', char_key,
    'powerRaw', power_raw,
    'itemLevelRaw', item_raw,
    'hasPvpTitleOption', coalesce((v_pvp ->> 'hasPvpTitleOption')::boolean, false),
    'weaponArmorTabActive', coalesce((v_equipment ->> 'weaponArmorTabActive')::boolean, false),
    'visibleEquipmentSlotCount', public.kinojo_json_int(v_equipment, 'visibleEquipmentSlotCount'),
    'populatedEquipmentSlotCount', public.kinojo_json_int(v_equipment, 'populatedEquipmentSlotCount'),
    'namedEquipmentSlotCount', public.kinojo_json_int(v_equipment, 'namedEquipmentSlotCount'),
    'abyssEquipmentSlotCount', public.kinojo_json_int(v_equipment, 'abyssEquipmentSlotCount'),
    'equipmentNames', coalesce(v_equipment -> 'equipmentNames', '[]'::jsonb),
    'abyssEquipmentNames', coalesce(v_equipment -> 'abyssEquipmentNames', '[]'::jsonb),
    'parseStatus', v_stat_status,
    'statParseStatus', case when power_value is not null and item_value is not null then 'OK' else 'STAT_PARSE_FAILED' end,
    'masterSyncEligible', gear_type in ('PVE', 'PVP'),
    'parserVersion', '260-title-scoped-abyss-3',
    'externalGearTypeIgnored', nullif(upper(trim(coalesce(p_gear_type, ''))), '')
  );
end;
$function$

;
