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
    and v_title_text ~* 'PVP[[:space:]]*피해[[:space:]]*증폭';

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
