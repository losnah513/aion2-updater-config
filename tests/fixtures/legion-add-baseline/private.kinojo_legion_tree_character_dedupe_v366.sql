CREATE OR REPLACE FUNCTION private.kinojo_legion_tree_character_dedupe_v366(p_server_id integer, p_character_name text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
 SET statement_timeout TO '500ms'
 SET lock_timeout TO '100ms'
AS $function$
declare
  v_name text := btrim(coalesce(p_character_name, ''));
  v_identity_key text;
  v_row public.character_master%rowtype;
  v_active boolean;
begin
  if p_server_id is null or p_server_id <= 0 then
    return jsonb_build_object(
      'ok', false,
      'code', 'INVALID_SERVER_ID',
      'message', '서버 ID가 올바르지 않습니다.'
    );
  end if;

  if v_name = '' then
    return jsonb_build_object(
      'ok', false,
      'code', 'CHARACTER_NAME_REQUIRED',
      'message', '캐릭터 이름이 필요합니다.'
    );
  end if;

  v_identity_key := public.kinojo_character_identity_key_v298(v_name);

  select cm.*
    into v_row
    from public.character_master cm
   where cm.server_id = p_server_id
     and public.kinojo_character_identity_key_v298(cm.character_name) = v_identity_key
   limit 1;

  if not found then
    return jsonb_build_object(
      'ok', true,
      'code', 'NEW_CHARACTER',
      'duplicate', false,
      'allowQueue', true,
      'existingCharacterId', null,
      'listRow', null,
      'dedupeContract', '366',
      'identityBasis', 'server_id+character_identity_key_v298'
    );
  end if;

  v_active := coalesce(v_row.is_active, true)
              and coalesce(v_row.status, 'OK') <> 'DELETED';

  if v_active and v_row.list_row is not null then
    return jsonb_build_object(
      'ok', true,
      'code', 'ALREADY_REGISTERED',
      'duplicate', true,
      'allowQueue', false,
      'existingCharacterId', v_row.id,
      'listRow', v_row.list_row,
      'dedupeContract', '366',
      'identityBasis', 'server_id+character_identity_key_v298'
    );
  end if;

  if v_active then
    return jsonb_build_object(
      'ok', true,
      'code', 'EXISTING_CHARACTER_REUSE',
      'duplicate', true,
      'allowQueue', true,
      'existingCharacterId', v_row.id,
      'listRow', v_row.list_row,
      'dedupeContract', '366',
      'identityBasis', 'server_id+character_identity_key_v298'
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'code', 'EXISTING_CHARACTER_INACTIVE',
    'duplicate', true,
    'allowQueue', false,
    'existingCharacterId', v_row.id,
    'listRow', v_row.list_row,
    'dedupeContract', '366',
    'identityBasis', 'server_id+character_identity_key_v298'
  );
end;
$function$
