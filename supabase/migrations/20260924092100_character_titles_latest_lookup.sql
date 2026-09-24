-- Use only the latest official lookup for equipped titles.
begin read write;
set local lock_timeout='2s';
-- A failed new official lookup must not fall back to a prior equipped title.
create or replace function private.kinojo_character_equipped_titles_v466(
  p_server_id integer,p_character_name text
) returns jsonb language plpgsql stable security definer
set search_path=pg_catalog set statement_timeout='2s' set lock_timeout='250ms' as $fn$
declare m public.character_master%rowtype; s public.lookup_snapshots%rowtype;
begin
  if coalesce(p_server_id,0)<=0 or nullif(btrim(p_character_name),'') is null
     or length(p_character_name)>160 then
    return jsonb_build_object('ok',false,'code','CHARACTER_IDENTITY_REQUIRED');
  end if;
  select * into m from public.character_master c
  where c.server_id=p_server_id and coalesce(c.is_active,true)
    and public.kinojo_character_identity_key_v298(c.character_name)
      =public.kinojo_character_identity_key_v298(p_character_name)
  order by c.updated_at desc,c.id desc limit 1;
  if m.id is null then
    return jsonb_build_object('ok',false,'code','CHARACTER_MASTER_NOT_FOUND');
  end if;
  select * into s from public.lookup_snapshots recent
  where recent.server_id=m.server_id and recent.character_name=m.character_name
  order by recent.created_at desc,recent.id desc limit 1;
  if s.id is null or s.status<>'OK'
    or jsonb_typeof(s.raw_payload#>'{officialRaw,info}')<>'object'
    or substring(s.raw_payload#>>'{officialRaw,info,profile,profileImage}'
      from '[?&]charKey=([0-9]+)') is distinct from m.char_key::text then
    return jsonb_build_object('ok',false,'code','OFFICIAL_LOOKUP_FAILED',
      'apiVersion','512','characterMasterId',m.id,'snapshotId',s.id,'titles','[]'::jsonb);
  end if;
  return jsonb_build_object('ok',true,'apiVersion','512','characterMasterId',m.id,
    'source','LOOKUP_SNAPSHOT_OFFICIAL_RAW','snapshotId',s.id,'refreshedAt',s.created_at,
    'titles',private.kinojo_normalize_equipped_titles_v466(
      coalesce(s.raw_payload#>'{officialRaw,info,title}',
        jsonb_build_object('titleList','[]'::jsonb))));
end;
$fn$;


commit;
