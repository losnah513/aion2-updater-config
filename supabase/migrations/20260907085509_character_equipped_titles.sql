-- DB466: read-only equipped titles from the existing official snapshot.
-- No new collection, table, queue, or combat-stat calculation.
create or replace function private.kinojo_normalize_equipped_titles_v466(p_title jsonb)
returns jsonb language sql immutable security invoker
set search_path = pg_catalog
as $function$
  with categories(category,label,icon,position) as (
    values ('Attack','공격계열','attack',1),('Defense','방어계열','defense',2),('Etc','기타계열','etc',3)
  ), rows as (
    select c.*, r.item, r.matches,
      jsonb_typeof(p_title->'titleList') = 'array' as available
    from categories c
    left join lateral (
      select jsonb_agg(t)->0 as item, count(*) as matches
      from jsonb_array_elements(case when jsonb_typeof(p_title->'titleList')='array' then p_title->'titleList' else '[]'::jsonb end) t
      where t->>'equipCategory'=c.category
    ) r on true
  )
  select jsonb_agg(jsonb_build_object(
    'category',category,'label',label,
    'icon','https://assets.playnccdn.com/static-aion2/characters/img/info/title_icon_'||icon||'.png',
    'status',case when available is not true or matches>1 then 'unavailable'
      when matches=0 then 'unequipped'
      when nullif(item->>'name','') is null then 'unavailable' else 'equipped' end,
    'id',case when matches=1 then item->'id' else null end,
    'name',case when matches=1 then item->>'name' else null end,
    'grade',case when matches=1 then item->>'grade' else null end,
    'effectsAvailable',matches=1 and jsonb_typeof(item->'equipStatList')='array',
    'effects',coalesce((select jsonb_agg(e->>'desc' order by ord)
      from jsonb_array_elements(case when matches=1 and jsonb_typeof(item->'equipStatList')='array' then item->'equipStatList' else '[]'::jsonb end) with ordinality es(e,ord)
      where jsonb_typeof(e->'desc')='string'),'[]'::jsonb)
  ) order by position) from rows;
$function$;
revoke all on function private.kinojo_normalize_equipped_titles_v466(jsonb) from public,anon,authenticated;

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
  select * into s from public.lookup_snapshots ls
    where ls.character_name=m.character_name and ls.server_id=m.server_id and ls.status='OK'
      and jsonb_typeof(ls.raw_payload#>'{officialRaw,info}')='object'
      and substring(ls.raw_payload#>>'{officialRaw,info,profile,profileImage}' from '[?&]charKey=([0-9]+)')=m.char_key::text
    order by ls.created_at desc,ls.id desc limit 1;
  return jsonb_build_object('ok',true,'apiVersion','466','characterMasterId',m.id,
    'source','LOOKUP_SNAPSHOT_OFFICIAL_RAW','snapshotId',s.id,'refreshedAt',s.created_at,
    'titles',private.kinojo_normalize_equipped_titles_v466(s.raw_payload#>'{officialRaw,info,title}'));
end;
$function$;
revoke all on function private.kinojo_character_equipped_titles_v466(integer,text) from public;
grant usage on schema private to anon,authenticated,service_role;
grant execute on function private.kinojo_character_equipped_titles_v466(integer,text) to anon,authenticated,service_role;

create or replace function public.kinojo_character_equipped_titles_v466(p_server_id integer,p_character_name text)
returns jsonb language sql stable security invoker
set search_path = pg_catalog
as $function$
  select private.kinojo_character_equipped_titles_v466(p_server_id,p_character_name);
$function$;
revoke all on function public.kinojo_character_equipped_titles_v466(integer,text) from public;
grant execute on function public.kinojo_character_equipped_titles_v466(integer,text) to anon,authenticated,service_role;
comment on function public.kinojo_character_equipped_titles_v466(integer,text) is 'Public character equipped title display only; stored official equipStatList, no raw payload or private member data.';
