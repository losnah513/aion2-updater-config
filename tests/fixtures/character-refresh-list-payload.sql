-- Read-only production function definition; no production records.
CREATE OR REPLACE FUNCTION public.kinojo_identity_list_update_payload_v287(p_character_id bigint, p_previous jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_character public.character_master%rowtype;
  v_old_display text;
  v_new_display text;
begin
  select * into v_character from public.character_master where id = p_character_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'CHARACTER_NOT_FOUND'); end if;
  v_old_display := coalesce(
    nullif(trim(p_previous->>'listDisplayName'), ''),
    public.kinojo_list_display_name_v287(
      coalesce(nullif(trim(p_previous->>'characterName'), ''), v_character.previous_character_name, v_character.character_name),
      coalesce(public.kinojo_meter_int_50010(p_previous->>'serverId'), v_character.previous_server_id, v_character.server_id)
    )
  );
  v_new_display := public.kinojo_list_display_name_v287(v_character.character_name, v_character.server_id);
  return jsonb_build_object(
    'ok', true, 'id', v_character.id, 'listRow', v_character.list_row,
    'originalListName', v_old_display, 'previousCharacterName', v_old_display,
    'listDisplayName', v_new_display, 'characterName', v_character.character_name,
    'serverId', v_character.server_id, 'serverName', v_character.server_name,
    'className', v_character.class_name,
    'pveItemLevel', v_character.latest_pve_item_level, 'pveCombatPower', v_character.latest_pve_combat_power,
    'pvpItemLevel', v_character.latest_pvp_item_level, 'pvpCombatPower', v_character.latest_pvp_combat_power,
    'latestPowerTotal', v_character.latest_power_total, 'latestItemLevelTotal', v_character.latest_item_level_total,
    'identityChanged', v_old_display <> v_new_display,
    'mainCharacterRenamed', coalesce(v_character.is_main, false) and v_old_display <> v_new_display
  );
end
$function$
;

