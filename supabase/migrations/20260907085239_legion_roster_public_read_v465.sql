-- DB465: bounded public Legion Roster reads; no character or image mutations.
-- Public exposure is intentional for eligible roster facts only, not account data.
create or replace function private.kinojo_roster_source_v465()
returns table(character_id bigint, name text, server_id integer, server_name text,
 class_name text, legion text, is_main boolean, root_id bigint, item_level integer, power integer)
language sql stable set search_path = pg_catalog
as $fn$
 select c.id,c.character_name,c.server_id,c.server_name,c.class_name,btrim(c.legion_name),
 coalesce(c.is_main,false),case when coalesce(c.is_main,false) then c.id else c.main_character_id end,
 c.latest_pve_item_level,c.latest_pve_combat_power
 from public.character_master c
 where coalesce(c.is_active,true) and coalesce(c.status,'OK') <> 'DELETED'
 and not coalesce(c.visibility_excluded,false);
$fn$;
revoke all on function private.kinojo_roster_source_v465() from public,anon,authenticated;

create or replace function private.kinojo_roster_page_v465(p_rows jsonb,p_scope text,p_cursor jsonb,p_limit integer)
returns jsonb language plpgsql stable set search_path = pg_catalog
as $fn$
declare v_token text:=md5(p_scope || p_rows::text); v_offset integer:=0; v_items jsonb;
begin
 if p_cursor is not null then
  if jsonb_typeof(p_cursor) <> 'object' or not (p_cursor ? 'sourceToken' and p_cursor ? 'offset')
    or p_cursor->>'offset' is null or p_cursor->>'sourceToken' is null
    or (p_cursor->>'offset') !~ '^[0-9]{1,7}$' then
   raise exception using message='ROSTER_CURSOR_INVALID',errcode='22023';
  end if;
  if p_cursor->>'sourceToken' is distinct from v_token then
   raise exception using message='ROSTER_CURSOR_EXPIRED',errcode='22023';
  end if;
  v_offset:=(p_cursor->>'offset')::integer;
  if v_offset>jsonb_array_length(p_rows) then raise exception using message='ROSTER_CURSOR_INVALID',errcode='22023'; end if;
 end if;
 select coalesce(jsonb_agg(value order by ord),'[]'::jsonb) into v_items
 from jsonb_array_elements(p_rows) with ordinality t(value,ord)
 where ord>v_offset and ord<=v_offset+p_limit;
 return jsonb_build_object('contractVersion',465,'generatedAt',statement_timestamp(),'sourceToken',v_token,
  'items',v_items,'total',jsonb_array_length(p_rows),'nextCursor',case when v_offset+p_limit<jsonb_array_length(p_rows)
  then jsonb_build_object('sourceToken',v_token,'offset',v_offset+p_limit) else null end);
end;
$fn$;
revoke all on function private.kinojo_roster_page_v465(jsonb,text,jsonb,integer) from public,anon,authenticated;

create or replace function public.kinojo_web_roster_list_v465(
 p_mode text default 'legion',p_legion text default '깡',p_query text default '',p_cursor jsonb default null,p_limit integer default 50)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog
set statement_timeout = '4s' set lock_timeout = '250ms'
as $fn$
declare v_legions text[]:=array['깡','낮','밤','키나노동조합']; v_query text:=btrim(coalesce(p_query,'')); v_rows jsonb;
begin
 if p_mode is null or p_mode not in ('all','legion') or p_limit is null or p_limit not between 1 and 100
  or length(v_query)>80 or (p_mode='legion' and (p_legion is null or not p_legion=any(v_legions))) then
  raise exception using message='ROSTER_INPUT_INVALID',errcode='22023';
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('characterId',s.character_id::text,'name',s.name,
  'serverId',s.server_id,'serverName',s.server_name,'className',s.class_name,'legion',s.legion,'isMain',s.is_main)
  order by array_position(v_legions,s.legion),s.power desc nulls last,s.character_id),'[]'::jsonb)
 into v_rows from private.kinojo_roster_source_v465() s
 where s.legion=any(v_legions) and (p_mode='all' or s.legion=p_legion)
 and (v_query='' or strpos(lower(s.name),lower(v_query))>0);
 return private.kinojo_roster_page_v465(v_rows,p_mode||':'||coalesce(p_legion,'')||':'||v_query,p_cursor,p_limit)
  ||jsonb_build_object('legions',to_jsonb(v_legions),'mode',p_mode,'legion',case when p_mode='legion' then p_legion else null end,'query',v_query);
end;
$fn$;
revoke all on function public.kinojo_web_roster_list_v465(text,text,text,jsonb,integer) from public,anon,authenticated;
grant execute on function public.kinojo_web_roster_list_v465(text,text,text,jsonb,integer) to anon,authenticated,service_role;

create or replace function public.kinojo_web_roster_family_v465(
 p_character_id bigint,p_cursor jsonb default null,p_limit integer default 20)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog
set statement_timeout = '4s' set lock_timeout = '250ms'
as $fn$
declare v_selected record; v_root bigint; v_rows jsonb; v_state text:='OK';
begin
 if p_character_id is null or p_character_id<1 or p_limit is null or p_limit not between 1 and 50 then
  raise exception using message='ROSTER_INPUT_INVALID',errcode='22023';
 end if;
 select * into v_selected from private.kinojo_roster_source_v465() s where s.character_id=p_character_id
  and s.legion=any(array['깡','낮','밤','키나노동조합']);
 if not found then raise exception using message='ROSTER_CHARACTER_UNAVAILABLE',errcode='22023'; end if;
 select s.character_id into v_root from private.kinojo_roster_source_v465() s where s.character_id=v_selected.root_id and s.is_main;
 if v_root is null then v_state:='ROOT_UNAVAILABLE'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('characterId',s.character_id::text,'name',s.name,
  'serverId',s.server_id,'serverName',s.server_name,'className',s.class_name,'legion',s.legion,'isMain',s.is_main,
  'itemLevel',s.item_level,'combatPower',s.power)
  order by case when s.character_id=v_root then 0 else 1 end,s.character_id),'[]'::jsonb)
 into v_rows from private.kinojo_roster_source_v465() s
 where (v_root is not null and s.root_id=v_root) or (v_root is null and s.character_id=p_character_id);
 return private.kinojo_roster_page_v465(v_rows,'family:'||p_character_id::text,p_cursor,p_limit)
  ||jsonb_build_object('selectedCharacterId',p_character_id::text,'mainCharacterId',v_root::text,'relationshipState',v_state);
end;
$fn$;
revoke all on function public.kinojo_web_roster_family_v465(bigint,jsonb,integer) from public,anon,authenticated;
grant execute on function public.kinojo_web_roster_family_v465(bigint,jsonb,integer) to anon,authenticated,service_role;
notify pgrst,'reload schema';
