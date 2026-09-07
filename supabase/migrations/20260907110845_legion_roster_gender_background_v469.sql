-- DB469: expose canonical character gender for decorative empty-library backgrounds.
-- Gender comes only from the master-linked official snapshot. Raw profile stays private.
create or replace function public.kinojo_web_roster_images_v467(
 p_selected_character_id bigint,p_character_id bigint,p_cursor jsonb default null,p_limit integer default 20)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
set statement_timeout='4s' set lock_timeout='250ms'
as $fn$
declare v_selected record; v_root bigint; v_rows jsonb; v_gender text;
begin
 if p_selected_character_id is null or p_selected_character_id<1 or p_character_id is null or p_character_id<1
  or p_limit is null or p_limit not between 1 and 50 then
  raise exception using message='ROSTER_INPUT_INVALID',errcode='22023';
 end if;
 select * into v_selected from private.kinojo_roster_source_v465() s
 where s.character_id=p_selected_character_id and s.legion=any(array['깡','낮','밤','키나노동조합']);
 if not found then raise exception using message='ROSTER_CHARACTER_UNAVAILABLE',errcode='22023'; end if;
 select s.character_id into v_root from private.kinojo_roster_source_v465() s
 where s.character_id=v_selected.root_id and s.is_main;
 if not exists(select 1 from private.kinojo_roster_source_v465() s where s.character_id=p_character_id
  and ((v_root is not null and s.root_id=v_root) or (v_root is null and s.character_id=p_selected_character_id))) then
  raise exception using message='ROSTER_CHARACTER_UNAVAILABLE',errcode='22023';
 end if;
 select case snapshot.raw_payload#>>'{officialRaw,info,profile,gender}'
  when '1' then 'MALE' when '2' then 'FEMALE' else null end into v_gender
 from public.character_master c left join public.lookup_snapshots snapshot on snapshot.id=c.legion_source_snapshot_id
 where c.id=p_character_id;
 select coalesce(jsonb_agg(jsonb_build_object('assetId',a.asset_id::text,
  'url',case when a.source_type='STORAGE' then 'https://josvoltpktvwysrasffq.supabase.co/storage/v1/object/public/kinojo-site-banners/'||a.object_path else a.static_path end,
  'width',a.width,'height',a.height,'mimeType',a.mime_type,'alt',coalesce(a.default_alt,''),'revision',a.updated_at)
  order by a.created_at desc,a.asset_id desc),'[]'::jsonb) into v_rows
 from public.kinojo_banner_asset_characters_v407 l join public.kinojo_banner_assets a on a.asset_id=l.asset_id
 where l.character_id=p_character_id and a.status='READY' and a.mime_type in ('image/jpeg','image/png','image/webp')
 and ((a.source_type='STORAGE' and a.object_path ~* '^[0-9]{4}/[0-9]{2}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$')
  or (a.source_type='STATIC' and a.static_path ~ '^https://kinojo\.info/assets/images/[A-Za-z0-9._/-]+\.(jpg|jpeg|png|webp)$' and strpos(a.static_path,'..')=0));
 return private.kinojo_roster_page_v465(v_rows,'images:'||p_selected_character_id::text||':'||p_character_id::text,p_cursor,p_limit)
  ||jsonb_build_object('contractVersion',467,'selectedCharacterId',p_selected_character_id::text,'characterId',p_character_id::text,'gender',v_gender);
end;
$fn$;
revoke all on function public.kinojo_web_roster_images_v467(bigint,bigint,jsonb,integer) from public,anon,authenticated;
grant execute on function public.kinojo_web_roster_images_v467(bigint,bigint,jsonb,integer) to anon,authenticated,service_role;
notify pgrst,'reload schema';
