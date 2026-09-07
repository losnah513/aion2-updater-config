-- DB466 bounded read: inspect at most the ten latest OK snapshots before JSON decompression.
create or replace function private.kinojo_character_equipped_titles_v466(p_server_id integer,p_character_name text)
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog
set statement_timeout = '2s'
set lock_timeout = '250ms'
as $function$
declare
  m public.character_master%rowtype;
  s public.lookup_snapshots%rowtype;
begin
  if coalesce(p_server_id,0)<=0 or nullif(btrim(p_character_name),'') is null or length(p_character_name)>160 then
    return jsonb_build_object('ok',false,'code','CHARACTER_IDENTITY_REQUIRED');
  end if;
  select * into m from public.character_master c
    where c.server_id=p_server_id and coalesce(c.is_active,true)
      and public.kinojo_character_identity_key_v298(c.character_name)=public.kinojo_character_identity_key_v298(p_character_name)
    order by c.updated_at desc,c.id desc limit 1;
  if m.id is null then
    return jsonb_build_object('ok',false,'code','CHARACTER_MASTER_NOT_FOUND');
  end if;
  -- Indexed name lookup; verify official numeric char key against the active Master.
  select * into s from (select * from public.lookup_snapshots recent
      where recent.character_name=m.character_name and recent.server_id=m.server_id and recent.status='OK'
      order by recent.created_at desc,recent.id desc limit 10) ls
    where jsonb_typeof(ls.raw_payload#>'{officialRaw,info}')='object'
      and substring(ls.raw_payload#>>'{officialRaw,info,profile,profileImage}' from '[?&]charKey=([0-9]+)')=m.char_key::text
    order by ls.created_at desc,ls.id desc limit 1;
  return jsonb_build_object('ok',true,'apiVersion','466','characterMasterId',m.id,
    'source','LOOKUP_SNAPSHOT_OFFICIAL_RAW','snapshotId',s.id,'refreshedAt',s.created_at,
    'titles',private.kinojo_normalize_equipped_titles_v466(s.raw_payload#>'{officialRaw,info,title}'));
end;
$function$;
