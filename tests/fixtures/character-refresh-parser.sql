-- Read-only operating Parser definitions; synthetic input, no operational rows.
create table public.lookup_snapshots(id bigint,session_id text,lookup_order integer,list_row integer,server_id integer,character_name text,status text,started_at timestamp with time zone,updated_at_sheet timestamp with time zone,error_message text,raw_payload jsonb,created_at timestamp with time zone,schema_version text,tool_name text,client_id text,snapshot_uid text,payload_hash text,intake_status text);
CREATE OR REPLACE FUNCTION public.kinojo_aion_html_text(p_html text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  select nullif(
    trim(
      regexp_replace(
        replace(
          replace(
            replace(
              replace(
                replace(
                  replace(regexp_replace(coalesce(p_html, ''), '<[^>]*>', ' ', 'g'), '&nbsp;', ' '),
                  '&#160;', ' '
                ),
                '&amp;', '&'
              ),
              '&lt;', '<'
            ),
            '&gt;', '>'
          ),
          '&quot;', '"'
        ),
        '[[:space:]]+', ' ', 'g'
      )
    ),
    ''
  );
$function$;
CREATE OR REPLACE FUNCTION public.kinojo_extract_aion_equipment_dom(p_html text)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_html text := regexp_replace(coalesce(p_html, ''), E'[\r\n]+', ' ', 'g');
  v_section text := '';
  v_start int := 0;
  v_second int := 0;
  v_section_found boolean := false;
  v_tab_found boolean := false;
  v_weapon_active boolean := false;
  v_slot_count int := 0;
  v_populated_count int := 0;
  v_named_count int := 0;
  v_abyss_count int := 0;
  v_equipment_names jsonb := '[]'::jsonb;
  v_abyss_names jsonb := '[]'::jsonb;
  v_part record;
  v_tab record;
  v_name_match text[];
  v_attr_match text[];
  v_name text;
  v_slot_text text;
  v_slot_blob text;
  v_open_tag text;
begin
  if trim(v_html) = '' then
    return jsonb_build_object(
      'equipmentSectionFound', false,
      'weaponArmorTabFound', false,
      'weaponArmorTabActive', false,
      'visibleEquipmentSlotCount', 0,
      'populatedEquipmentSlotCount', 0,
      'namedEquipmentSlotCount', 0,
      'abyssEquipmentSlotCount', 0,
      'equipmentNames', '[]'::jsonb,
      'abyssEquipmentNames', '[]'::jsonb,
      'equipmentParseStatus', 'EMPTY_HTML',
      'pvpEquipmentThreshold', 3
    );
  end if;

  v_start := regexp_instr(
    v_html,
    '(<[^>]+class=["''][^"'']*equipment[^"'']*info__section[^"'']*["''][^>]*>|<[^>]+class=["''][^"'']*info__section[^"'']*equipment[^"'']*["''][^>]*>)',
    1, 1, 0, 'i'
  );

  if v_start > 0 then
    v_section_found := true;
    v_section := substring(v_html from v_start);
    v_second := regexp_instr(
      v_section,
      '(<[^>]+class=["''][^"'']*equipment[^"'']*info__section[^"'']*["''][^>]*>|<[^>]+class=["''][^"'']*info__section[^"'']*equipment[^"'']*["''][^>]*>)',
      1, 2, 0, 'i'
    );
    if v_second > 0 then
      v_section := substring(v_section from 1 for v_second - 1);
    end if;
  else
    v_section := v_html;
  end if;

  for v_tab in
    select m[1] as open_tag, m[3] as inner_html
      from regexp_matches(
        v_section,
        '<([^>]*(equipment__tab-item|equipment[^>]*tab)[^>]*)>(.*?)</[^>]+>',
        'gis'
      ) as m
  loop
    if public.kinojo_aion_html_text(v_tab.inner_html) ~* '^무기[[:space:]]*[·ㆍ/][[:space:]]*방어구$' then
      v_tab_found := true;
      v_open_tag := lower(coalesce(v_tab.open_tag, ''));
      if v_open_tag ~ '(^|[^a-z])active([^a-z]|$)'
         or v_open_tag ~ 'aria-selected[[:space:]]*=[[:space:]]*["'']?true'
         or v_open_tag ~ 'data-state[[:space:]]*=[[:space:]]*["'']?active' then
        v_weapon_active := true;
      end if;
    end if;
  end loop;

  if not v_weapon_active then
    select exists (
      select 1
        from regexp_matches(
          v_section,
          '<button[^>]*class=["''][^"'']*(equipment__tab-item[^"'']*active|active[^"'']*equipment__tab-item)[^"'']*["''][^>]*>(.*?)</button>',
          'gis'
        ) as m
       where public.kinojo_aion_html_text(m[2]) ~* '^무기[[:space:]]*[·ㆍ/][[:space:]]*방어구$'
    ) into v_weapon_active;
    v_tab_found := v_tab_found or v_weapon_active;
  end if;

  for v_part in
    select part, ord
      from regexp_split_to_table(
        v_section,
        '<[^>]+class=["''][^"'']*equipment__slots-item[^"'']*["''][^>]*>',
        'i'
      ) with ordinality as t(part, ord)
     where ord > 1
     order by ord
  loop
    exit when v_slot_count >= 10;
    v_slot_count := v_slot_count + 1;

    v_name := null;
    v_name_match := regexp_match(
      v_part.part,
      $re$<[^>]+class=["'][^"']*(?:equipment[^"']*(?:slot|slots)[^"']*(?:name|title)|equipment__item-name|item__name)[^"']*["'][^>]*>(.*?)</[^>]+>$re$,
      'is'
    );
    if v_name_match is not null then
      v_name := public.kinojo_aion_html_text(v_name_match[1]);
    end if;

    if coalesce(trim(v_name), '') = '' then
      v_attr_match := regexp_match(
        v_part.part,
        $re$(?:data-item-name|aria-label|title|alt)[[:space:]]*=[[:space:]]*["']([^"']+)["']$re$,
        'i'
      );
      if v_attr_match is not null then
        v_name := public.kinojo_aion_html_text(v_attr_match[1]);
      end if;
    end if;

    v_slot_text := public.kinojo_aion_html_text(v_part.part);
    if coalesce(trim(v_name), '') = '' and coalesce(trim(v_slot_text), '') <> '' then
      v_name := left(trim(v_slot_text), 240);
    end if;

    if coalesce(trim(v_name), '') <> '' or coalesce(trim(v_slot_text), '') <> '' then
      v_populated_count := v_populated_count + 1;
    end if;

    if coalesce(trim(v_name), '') <> '' then
      v_named_count := v_named_count + 1;
      v_equipment_names := v_equipment_names || jsonb_build_array(v_name);
    end if;

    v_slot_blob := concat_ws(' ', coalesce(v_name, ''), coalesce(v_slot_text, ''), coalesce(v_part.part, ''));
    if v_slot_blob ~* '(십부장|백부장|천부장|군단장|친위대장|대인)' then
      v_abyss_count := v_abyss_count + 1;
      v_abyss_names := v_abyss_names || jsonb_build_array(coalesce(nullif(v_name, ''), left(v_slot_text, 240), '어비스 장비'));
    end if;
  end loop;

  -- 확장프로그램이 렌더링 완료를 확인한 실제 슬롯 DOM 자체를 활성 콘텐츠 근거로 사용한다.
  if v_slot_count >= 5 then
    v_section_found := true;
    v_tab_found := true;
  end if;
  if v_populated_count >= 5 then
    v_weapon_active := true;
  end if;

  return jsonb_build_object(
    'equipmentSectionFound', v_section_found,
    'weaponArmorTabFound', v_tab_found,
    'weaponArmorTabActive', v_weapon_active,
    'weaponArmorTabActiveInferred', v_populated_count >= 5,
    'visibleEquipmentSlotCount', v_slot_count,
    'populatedEquipmentSlotCount', v_populated_count,
    'namedEquipmentSlotCount', v_named_count,
    'abyssEquipmentSlotCount', v_abyss_count,
    'equipmentNames', v_equipment_names,
    'abyssEquipmentNames', v_abyss_names,
    'equipmentParseStatus', case
      when v_slot_count = 0 then 'SLOTS_NOT_FOUND'
      when v_populated_count < 5 then 'INSUFFICIENT_POPULATED_SLOTS'
      else 'OK'
    end,
    'pvpEquipmentThreshold', 3
  );
end;
$function$;
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
$function$;
CREATE OR REPLACE FUNCTION public.kinojo_v227_class_from_icon(p_url text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  select case
    when lower(coalesce(p_url,'')) like '%class_icon_templar%' then '수호성'
    when lower(coalesce(p_url,'')) like '%class_icon_gladiator%' then '검성'
    when lower(coalesce(p_url,'')) like '%class_icon_assassin%' then '살성'
    when lower(coalesce(p_url,'')) like '%class_icon_ranger%' then '궁성'
    when lower(coalesce(p_url,'')) like '%class_icon_sorcerer%' then '마도성'
    when lower(coalesce(p_url,'')) like '%class_icon_elementalist%' then '정령성'
    when lower(coalesce(p_url,'')) like '%class_icon_cleric%' then '치유성'
    when lower(coalesce(p_url,'')) like '%class_icon_chanter%' then '호법성'
    when lower(coalesce(p_url,'')) like '%class_icon_fighter%' then '권성'
    else null
  end;
$function$;
CREATE OR REPLACE FUNCTION public.kinojo_v227_img_after_class(p_html text, p_class text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  h text := coalesce(p_html, '');
  pos int;
  tail text;
  m text[];
begin
  pos := strpos(lower(h), lower(coalesce(p_class, '')));
  if pos <= 0 then return null; end if;
  tail := substring(h from pos for 1600);
  m := regexp_match(tail, '<img[^>]+src[[:space:]]*=[[:space:]]*"([^"]+)"', 'i');
  if m is null then return null; end if;
  return replace(m[1], '&amp;', '&');
end;
$function$;
CREATE OR REPLACE FUNCTION public.kinojo_v227_parse_aion_number(p_value text)
 RETURNS integer
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v text := upper(replace(replace(trim(coalesce(p_value, '')), ',', ''), ' ', ''));
  n numeric;
  multiplier numeric := 1;
begin
  if v = '' then return null; end if;
  if right(v, 1) = 'K' then multiplier := 1000; v := left(v, length(v)-1);
  elsif right(v, 1) = 'M' then multiplier := 1000000; v := left(v, length(v)-1);
  elsif right(v, 1) = 'B' then multiplier := 1000000000; v := left(v, length(v)-1);
  end if;
  if v !~ '^[0-9]+([.][0-9]+)?$' then return null; end if;
  n := v::numeric * multiplier;
  if n > 2147483647 then return null; end if;
  return round(n)::int;
exception when others then
  return null;
end;
$function$;
CREATE OR REPLACE FUNCTION public.kinojo_v227_span_after_class(p_html text, p_class text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  h text := coalesce(p_html, '');
  pos int;
  tail text;
  m text[];
begin
  pos := strpos(lower(h), lower(coalesce(p_class, '')));
  if pos <= 0 then return null; end if;
  tail := substring(h from pos for 1200);
  m := regexp_match(tail, '<span[^>]*>[[:space:]]*([^<]+)[[:space:]]*</span>', 'i');
  if m is null then return null; end if;
  return trim(m[1]);
end;
$function$;
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
$function$;
CREATE OR REPLACE FUNCTION public.kinojo_snapshot_parser_text(p_raw_payload jsonb)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  select concat_ws(
    chr(10),
    nullif(public.kinojo_json_text(p_raw_payload, 'profileHtml', 'profile_html'), ''),
    nullif(public.kinojo_json_text(p_raw_payload, 'pageText', 'text', 'rawText', 'bodyText'), ''),
    nullif(public.kinojo_json_text(p_raw_payload, 'visibleText', 'visible_text', 'bodyInnerText'), '')
  );
$function$;
CREATE OR REPLACE FUNCTION public.kinojo_payload_gear_diagnosis(p_payload_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_payload public.extension_character_payloads%rowtype;
  v_snapshot public.lookup_snapshots%rowtype;
  v_parser_text text;
  v_stats jsonb;
  v_declared text;
  v_snapshot_found boolean := false;
begin
  select * into v_payload
    from public.extension_character_payloads
   where id = p_payload_id;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'PAYLOAD_NOT_FOUND', 'payloadId', p_payload_id);
  end if;

  if v_payload.source_snapshot_id is not null then
    select * into v_snapshot
      from public.lookup_snapshots
     where id = v_payload.source_snapshot_id;
    v_snapshot_found := found;
  end if;

  if not v_snapshot_found then
    select * into v_snapshot
      from public.lookup_snapshots s
     where s.session_id = v_payload.session_id
       and coalesce(s.server_id, 2002) = coalesce(v_payload.server_id, 2002)
       and public.kinojo_normalize_character_name(s.character_name)
           = public.kinojo_normalize_character_name(v_payload.character_name)
     order by abs(extract(epoch from (s.created_at - v_payload.received_at))) asc, s.id desc
     limit 1;
    v_snapshot_found := found;
  end if;

  v_declared := case
    when v_payload.pvp_item_level is not null and v_payload.pvp_combat_power is not null
     and v_payload.pve_item_level is null and v_payload.pve_combat_power is null then 'PVP'
    when v_payload.pve_item_level is not null and v_payload.pve_combat_power is not null
     and v_payload.pvp_item_level is null and v_payload.pvp_combat_power is null then 'PVE'
    else coalesce(nullif(upper(trim(v_payload.gear_type)), ''), 'UNKNOWN')
  end;

  if not v_snapshot_found or v_snapshot.raw_payload is null then
    return jsonb_build_object(
      'ok', true,
      'payloadId', v_payload.id,
      'snapshotId', v_payload.source_snapshot_id,
      'characterName', v_payload.character_name,
      'payloadDeclaredGearType', v_declared,
      'detectedGearType', 'UNKNOWN',
      'gearParseStatus', 'UNKNOWN',
      'gearReasonCode', 'RAW_SNAPSHOT_NOT_FOUND',
      'parserVersion', '236-tristate-pve-pvp-provenance'
    );
  end if;

  v_parser_text := public.kinojo_snapshot_parser_text(v_snapshot.raw_payload);
  v_stats := public.kinojo_extract_aion_stats_from_text(v_parser_text, v_payload.character_name, null);

  return jsonb_build_object(
    'ok', true,
    'payloadId', v_payload.id,
    'snapshotId', v_snapshot.id,
    'characterName', v_payload.character_name,
    'payloadDeclaredGearType', v_declared,
    'detectedGearType', public.kinojo_json_text(v_stats, 'detectedGearType', 'gearType'),
    'gearParseStatus', public.kinojo_json_text(v_stats, 'gearParseStatus'),
    'gearReasonCode', public.kinojo_json_text(v_stats, 'gearReasonCode'),
    'itemLevel', public.kinojo_json_int(v_stats, 'itemLevel'),
    'combatPower', public.kinojo_json_int(v_stats, 'combatPower'),
    'parserVersion', public.kinojo_json_text(v_stats, 'parserVersion'),
    'gearEvidence', coalesce(v_stats -> 'gearEvidence', '{}'::jsonb)
  );
end;
$function$;
