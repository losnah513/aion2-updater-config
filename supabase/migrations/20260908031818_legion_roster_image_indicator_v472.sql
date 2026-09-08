-- DB472: image-presence flag matches the actual public library; decorative backgrounds excluded.
CREATE OR REPLACE FUNCTION public.kinojo_web_roster_list_v465(p_mode text DEFAULT 'legion'::text, p_legion text DEFAULT '깡'::text, p_query text DEFAULT ''::text, p_cursor jsonb DEFAULT NULL::jsonb, p_limit integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
 SET statement_timeout TO '4s'
 SET lock_timeout TO '250ms'
AS $function$
declare v_legions text[]:=array['깡','낮','밤','키나노동조합']; v_query text:=btrim(coalesce(p_query,'')); v_rows jsonb;
begin
 if p_mode is null or p_mode not in ('all','legion') or p_limit is null or p_limit not between 1 and 100
  or length(v_query)>80 or (p_mode='legion' and (p_legion is null or not p_legion=any(v_legions))) then
  raise exception using message='ROSTER_INPUT_INVALID',errcode='22023';
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('characterId',s.character_id::text,'name',s.name,
  'serverId',s.server_id,'serverName',s.server_name,'className',s.class_name,'legion',s.legion,'isMain',s.is_main,'hasLibraryImage',exists(select 1 from public.kinojo_banner_asset_characters_v407 l
 join public.kinojo_banner_assets a on a.asset_id=l.asset_id
 where l.character_id=s.character_id and a.status='READY' and a.mime_type in ('image/jpeg','image/png','image/webp')
 and ((a.source_type='STORAGE' and a.object_path ~* '^[0-9]{4}/[0-9]{2}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$')
 or (a.source_type='STATIC' and a.static_path ~ '^https://kinojo\.info/assets/images/[A-Za-z0-9._/-]+\.(jpg|jpeg|png|webp)$' and strpos(a.static_path,'..')=0))))
  order by array_position(v_legions,s.legion),s.power desc nulls last,s.character_id),'[]'::jsonb)
 into v_rows from private.kinojo_roster_source_v465() s
 where s.legion=any(v_legions) and (p_mode='all' or s.legion=p_legion)
 and (v_query='' or strpos(lower(s.name),lower(v_query))>0);
 return private.kinojo_roster_page_v465(v_rows,p_mode||':'||coalesce(p_legion,'')||':'||v_query,p_cursor,p_limit)
  ||jsonb_build_object('legions',to_jsonb(v_legions),'mode',p_mode,'legion',case when p_mode='legion' then p_legion else null end,'query',v_query);
end;
$function$;
notify pgrst,'reload schema';
